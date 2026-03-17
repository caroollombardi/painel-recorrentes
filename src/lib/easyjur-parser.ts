import { supabase } from "@/integrations/supabase/client";

export interface EasyJurEntry {
  id: string;
  responsavel: string;
  cliente: string;
  descricao: string;
  dataTimesheet: string;
  dataConclusao: string;
  timesheet: string;
  projeto: string;
  contrato: string;
  processo: string;
}

export interface ParsedEasyJurEntry {
  task_name: string;
  assignee: string;
  project: string;
  client: string | null;
  completed_date: string | null;
  hours_logged: number;
  activity_type: string | null;
  processo: string | null;
}

export interface EasyJurValidationResult {
  valid: boolean;
  entries: ParsedEasyJurEntry[];
  errors: string[];
  warnings: string[];
  totalHours: number;
  dateRange: { min: string; max: string } | null;
}

const REQUIRED_COLUMNS = ["Responsavel", "Descricao", "Data Timesheet", "Timesheet"];

/**
 * Parse an EasyJur CSV/Excel export (semicolon-separated, Latin-1 encoding possible).
 */
export function parseEasyJurCSV(csvText: string): EasyJurValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Split lines
  const lines = csvText.split(/\r?\n/).filter(l => l.trim().length > 0);
  if (lines.length < 2) {
    return { valid: false, entries: [], errors: ["Arquivo vazio ou sem dados."], warnings, totalHours: 0, dateRange: null };
  }

  // Parse header (semicolon-separated, remove quotes and BOM)
  const headerLine = lines[0].replace(/^\uFEFF/, "");
  const headers = parseSemicolonLine(headerLine);
  
  // Map column indices
  const colMap = mapColumns(headers);
  
  // Validate required columns
  const missingCols = REQUIRED_COLUMNS.filter(col => {
    const key = col.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    return !headers.some(h => {
      const norm = h.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      return norm.includes(key.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""));
    });
  });

  if (missingCols.length > 0) {
    // Try a more flexible matching
    const actualMissing = [];
    if (colMap.descricao === -1) actualMissing.push("Descricao");
    if (colMap.dataTimesheet === -1) actualMissing.push("Data Timesheet");
    if (colMap.timesheet === -1) actualMissing.push("Timesheet");
    if (colMap.responsavel === -1) actualMissing.push("Responsavel");

    if (actualMissing.length > 0) {
      return {
        valid: false,
        entries: [],
        errors: [`Colunas obrigatórias não encontradas: ${actualMissing.join(", ")}. Colunas detectadas: ${headers.join(", ")}`],
        warnings,
        totalHours: 0,
        dateRange: null,
      };
    }
  }

  const entries: ParsedEasyJurEntry[] = [];
  let minDate = "9999-12-31";
  let maxDate = "0000-01-01";

  for (let i = 1; i < lines.length; i++) {
    const fields = parseSemicolonLine(lines[i]);
    if (fields.length < 4) continue;

    const descricao = getField(fields, colMap.descricao);
    const timesheetStr = getField(fields, colMap.timesheet);
    const dataTimesheetStr = getField(fields, colMap.dataTimesheet);
    const responsavel = getField(fields, colMap.responsavel);
    const cliente = getField(fields, colMap.cliente);
    const contrato = getField(fields, colMap.contrato);
    const projeto = getField(fields, colMap.projeto);
    const processo = getField(fields, colMap.processo);

    if (!timesheetStr || !descricao) {
      if (descricao) warnings.push(`Linha ${i + 1}: sem tempo lançado, ignorada.`);
      continue;
    }

    // Parse time HH:MM:SS
    const hours = parseTimesheetHours(timesheetStr);
    if (hours <= 0) {
      warnings.push(`Linha ${i + 1}: tempo inválido "${timesheetStr}", ignorada.`);
      continue;
    }

    // Parse date DD/MM/YYYY
    const dateStr = parseBrazilianDate(dataTimesheetStr);
    if (!dateStr) {
      warnings.push(`Linha ${i + 1}: data inválida "${dataTimesheetStr}".`);
    }

    if (dateStr) {
      if (dateStr < minDate) minDate = dateStr;
      if (dateStr > maxDate) maxDate = dateStr;
    }

    // Determine project name from Contrato or Projeto fields
    const projectName = extractProjectName(contrato, projeto, cliente);

    entries.push({
      task_name: descricao.trim(),
      assignee: responsavel.trim() || "Sem responsável",
      project: projectName,
      client: cliente?.trim() || null,
      completed_date: dateStr,
      hours_logged: Math.round(hours * 100) / 100,
      activity_type: extractActivityType(descricao),
      processo: processo?.trim() || null,
    });
  }

  if (entries.length === 0) {
    return { valid: false, entries: [], errors: ["Nenhum registro válido encontrado no arquivo."], warnings, totalHours: 0, dateRange: null };
  }

  const totalHours = entries.reduce((sum, e) => sum + e.hours_logged, 0);

  return {
    valid: true,
    entries,
    errors,
    warnings,
    totalHours: Math.round(totalHours * 100) / 100,
    dateRange: minDate <= maxDate ? { min: minDate, max: maxDate } : null,
  };
}

/**
 * Import parsed EasyJur entries into the database for a specific person and month.
 * Only replaces that person's entries (additive to other members).
 */
export async function importEasyJurEntries(
  entries: ParsedEasyJurEntry[],
  assigneeName: string,
  month: number, // 0-indexed
  year: number
): Promise<{ success: boolean; count: number; error?: string }> {
  const { data: session } = await supabase.auth.getSession();
  const userId = session?.session?.user?.id;

  const dbEntries = entries.map(e => ({
    task_name: e.task_name,
    assignee: assigneeName,
    project: e.project,
    client: e.client,
    completed_date: e.completed_date,
    hours_logged: e.hours_logged,
    activity_type: e.activity_type,
    month: month + 1,
    year,
    uploaded_by: userId || null,
  }));

  // Delete only this person's entries for the month
  const { error: delError } = await supabase
    .from("time_entries")
    .delete()
    .eq("month", month + 1)
    .eq("year", year)
    .eq("assignee", assigneeName);

  if (delError) {
    console.error("Error deleting old entries:", delError);
    return { success: false, count: 0, error: delError.message };
  }

  // Insert in batches of 500
  for (let i = 0; i < dbEntries.length; i += 500) {
    const batch = dbEntries.slice(i, i + 500);
    const { error } = await supabase.from("time_entries").insert(batch);
    if (error) {
      console.error("Error inserting time entries:", error);
      return { success: false, count: 0, error: error.message };
    }
  }

  return { success: true, count: dbEntries.length };
}

// --- Helpers ---

function parseSemicolonLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ';' && !inQuotes) {
      fields.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  fields.push(current.trim());
  return fields;
}

function mapColumns(headers: string[]): Record<string, number> {
  const normalize = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
  const find = (needles: string[]) => headers.findIndex(h => needles.some(n => normalize(h).includes(n)));

  return {
    id: find(["id"]),
    responsavel: find(["responsavel"]),
    cliente: find(["cliente"]),
    descricao: find(["descricao"]),
    dataTimesheet: find(["data timesheet"]),
    dataConclusao: find(["data conclusao"]),
    timesheet: headers.findIndex(h => {
      const n = normalize(h);
      return n === "timesheet" || (n.includes("timesheet") && !n.includes("data"));
    }),
    projeto: find(["projeto"]),
    contrato: find(["contrato"]),
    processo: find(["processo"]),
  };
}

function getField(fields: string[], index: number): string {
  if (index < 0 || index >= fields.length) return "";
  return fields[index] || "";
}

function parseTimesheetHours(timeStr: string): number {
  const trimmed = timeStr.trim();
  // HH:MM:SS or HH:MM
  const match = trimmed.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (match) {
    return parseInt(match[1]) + parseInt(match[2]) / 60 + (parseInt(match[3] || "0") / 3600);
  }
  // Try decimal
  const num = parseFloat(trimmed.replace(",", "."));
  return isNaN(num) ? 0 : num;
}

function parseBrazilianDate(dateStr: string): string | null {
  if (!dateStr) return null;
  const trimmed = dateStr.trim();
  // DD/MM/YYYY
  const match = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (match) {
    const [, day, month, year] = match;
    return `${year}-${month}-${day}`;
  }
  // Try ISO
  const d = new Date(trimmed);
  if (!isNaN(d.getTime())) return d.toISOString().split("T")[0];
  return null;
}

function extractProjectName(contrato: string, projeto: string, cliente: string): string {
  // Use Contrato field first (e.g., "MADALOZZO CORRETORA - Assessoria Jurídica - MENSAL")
  if (contrato) {
    const parts = contrato.split(" - ");
    return parts[0].trim();
  }
  if (projeto) return projeto.trim();
  if (cliente) return cliente.trim();
  return "Sem projeto";
}

function extractActivityType(descricao: string): string | null {
  if (!descricao) return null;
  const upper = descricao.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
  // Extract activity type from the prefix pattern "TIPO - descrição"
  const match = upper.match(/^(ELABORACAO|REVISAO|ANALISE|ACOMPANHAMENTO|PESQUISA|REUNIAO|ATENDIMENTO|DESPACHO|PETICAO|PROTOCOLO|DISTRIBUICAO|CARGA|MANIFESTACAO)/i);
  if (match) {
    // Normalize common activity types
    const type = match[1].toUpperCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const typeMap: Record<string, string> = {
      "ELABORACAO": "Elaboração",
      "REVISAO": "Revisão",
      "ANALISE": "Análise",
      "ACOMPANHAMENTO": "Acompanhamento",
      "PESQUISA": "Pesquisa",
      "REUNIAO": "Reunião",
      "ATENDIMENTO": "Atendimento",
      "DESPACHO": "Despacho",
      "PETICAO": "Petição",
      "PROTOCOLO": "Protocolo",
      "DISTRIBUICAO": "Distribuição",
      "CARGA": "Carga",
      "MANIFESTACAO": "Manifestação",
    };
    return typeMap[type] || match[1];
  }
  return "Outros";
}
