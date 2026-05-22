import { supabase } from "@/integrations/supabase/client";
import { getLawyerHourlyRate } from "@/lib/lawyer-prices";
import { getCustomLawyerRate } from "@/lib/custom-lawyers";

// =====================================================================
// Tipos
// =====================================================================

export interface ParsedAtoLancamento {
  colaborador_nome: string;
  tarefa_nome: string;
  asana_task_id: string;
  duracao_minutos: number;
  billable: boolean;
  data_lancamento: string | null;
  descricao: string;
}

export interface ParsedAtoProjeto {
  asana_project_id: string;
  nome_projeto: string;
  lancamentos: ParsedAtoLancamento[];
}

export interface AtosCSVValidationResult {
  valid: boolean;
  projetos: ParsedAtoProjeto[];
  errors: string[];
  warnings: string[];
  totalLancamentos: number;
  totalMinutos: number;
  colaboradoresSemCusto: string[];
}

// Tipos do que vem do banco (lido)
export interface AtoProjetoDB {
  id: string;
  asana_project_id: string;
  nome_projeto: string;
  valor_combinado: number;
  incluir_nao_billable: boolean;
  created_at: string;
  updated_at: string;
}

export interface AtoLancamentoDB {
  id: string;
  projeto_id: string;
  colaborador_nome: string;
  tarefa_nome: string | null;
  asana_task_id: string | null;
  duracao_minutos: number;
  billable: boolean;
  data_lancamento: string | null;
  descricao: string | null;
}

// =====================================================================
// Parser do CSV do Asana
// =====================================================================

const REQUIRED_COLUMNS = [
  "Time logged by name",
  "Duration in minutes",
  "Billable status",
  "Task Name",
  "Project ID",
  "Project Name",
];

const normalizeText = (value: string) =>
  value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

/**
 * Parser do export de Time Tracking do Asana (CSV separado por vírgula).
 * Estrutura esperada (colunas relevantes):
 *   Time logged by name, Duration in minutes, Description, Billable status,
 *   Entered On, Task ID, Task Name, Project ID, Project Name
 *
 * Agrupa lançamentos por Project ID.
 */
export function parseAtosCSV(csvText: string): AtosCSVValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Remove BOM
  const cleanText = csvText.replace(/^\uFEFF/, "");

  const lines = cleanText.split(/\r?\n/).filter(l => l.trim().length > 0);
  if (lines.length < 2) {
    return {
      valid: false,
      projetos: [],
      errors: ["Arquivo vazio ou sem dados."],
      warnings,
      totalLancamentos: 0,
      totalMinutos: 0,
      colaboradoresSemCusto: [],
    };
  }

  const headers = parseCSVLine(lines[0]);

  // Validar colunas
  const missing = REQUIRED_COLUMNS.filter(
    col => !headers.some(h => normalizeText(h) === normalizeText(col))
  );
  if (missing.length > 0) {
    return {
      valid: false,
      projetos: [],
      errors: [
        `Colunas obrigatórias não encontradas: ${missing.join(", ")}.`,
        `Colunas detectadas: ${headers.join(", ")}.`,
        `Use o export "Time Tracking" do Asana com formato CSV.`,
      ],
      warnings,
      totalLancamentos: 0,
      totalMinutos: 0,
      colaboradoresSemCusto: [],
    };
  }

  const col = (name: string) =>
    headers.findIndex(h => normalizeText(h) === normalizeText(name));

  const idxColaborador = col("Time logged by name");
  const idxDuracao = col("Duration in minutes");
  const idxDescricao = col("Description");
  const idxBillable = col("Billable status");
  const idxData = col("Entered On");
  const idxTaskId = col("Task ID");
  const idxTaskName = col("Task Name");
  const idxProjectId = col("Project ID");
  const idxProjectName = col("Project Name");

  const projetosMap = new Map<string, ParsedAtoProjeto>();
  const colaboradoresSemCustoSet = new Set<string>();
  let totalLancamentos = 0;
  let totalMinutos = 0;

  for (let i = 1; i < lines.length; i++) {
    const fields = parseCSVLine(lines[i]);
    if (fields.length < headers.length / 2) continue;

    const projectId = (fields[idxProjectId] || "").trim();
    const projectName = (fields[idxProjectName] || "").trim();
    const colaborador = (fields[idxColaborador] || "").trim();
    const duracaoStr = (fields[idxDuracao] || "0").trim();
    const billableStr = (fields[idxBillable] || "billable").trim().toLowerCase();

    if (!projectId) {
      warnings.push(`Linha ${i + 1}: sem Project ID, ignorada.`);
      continue;
    }
    if (!colaborador) {
      warnings.push(`Linha ${i + 1}: sem colaborador, ignorada.`);
      continue;
    }

    const duracao = parseInt(duracaoStr, 10);
    if (isNaN(duracao) || duracao <= 0) {
      warnings.push(`Linha ${i + 1}: duração inválida "${duracaoStr}", ignorada.`);
      continue;
    }

    // Verificar se colaborador tem custo cadastrado
    const rate = getLawyerHourlyRate(colaborador) || getCustomLawyerRate(colaborador);
    if (rate === 0) {
      colaboradoresSemCustoSet.add(colaborador);
    }

    const billable = billableStr === "billable" || billableStr === "true";
    const dataStr = idxData >= 0 ? (fields[idxData] || "").trim() : "";
    const dataLancamento = parseISODate(dataStr);

    const lancamento: ParsedAtoLancamento = {
      colaborador_nome: colaborador,
      tarefa_nome: idxTaskName >= 0 ? (fields[idxTaskName] || "").trim() : "",
      asana_task_id: idxTaskId >= 0 ? (fields[idxTaskId] || "").trim() : "",
      duracao_minutos: duracao,
      billable,
      data_lancamento: dataLancamento,
      descricao: idxDescricao >= 0 ? (fields[idxDescricao] || "").trim() : "",
    };

    if (!projetosMap.has(projectId)) {
      projetosMap.set(projectId, {
        asana_project_id: projectId,
        nome_projeto: projectName || "Sem nome",
        lancamentos: [],
      });
    }
    projetosMap.get(projectId)!.lancamentos.push(lancamento);
    totalLancamentos++;
    totalMinutos += duracao;
  }

  const projetos = Array.from(projetosMap.values());

  if (projetos.length === 0) {
    return {
      valid: false,
      projetos: [],
      errors: ["Nenhum lançamento válido encontrado no arquivo."],
      warnings,
      totalLancamentos: 0,
      totalMinutos: 0,
      colaboradoresSemCusto: [],
    };
  }

  return {
    valid: true,
    projetos,
    errors,
    warnings,
    totalLancamentos,
    totalMinutos,
    colaboradoresSemCusto: Array.from(colaboradoresSemCustoSet).sort(),
  };
}

// =====================================================================
// Persistência: importa projetos (substitui se já existir)
// =====================================================================

export interface ImportAtosResult {
  success: boolean;
  projetosImportados: number;
  lancamentosImportados: number;
  projetosSubstituidos: number;
  error?: string;
}

/**
 * Importa os projetos parseados.
 * - Se o asana_project_id JÁ EXISTE: substitui todos os lançamentos
 *   mas preserva valor_combinado e incluir_nao_billable
 * - Se NÃO existe: cria o projeto (valor_combinado = 0, a ser preenchido depois)
 */
export async function importAtosProjetos(
  projetos: ParsedAtoProjeto[]
): Promise<ImportAtosResult> {
  const { data: session } = await supabase.auth.getSession();
  const userId = session?.session?.user?.id ?? null;

  let projetosImportados = 0;
  let projetosSubstituidos = 0;
  let lancamentosImportados = 0;

  try {
    for (const projeto of projetos) {
      // 1. Procura se já existe
      const { data: existing, error: selectErr } = await supabase
        .from("atos_projetos")
        .select("id, valor_combinado, incluir_nao_billable")
        .eq("asana_project_id", projeto.asana_project_id)
        .maybeSingle();

      if (selectErr) {
        return {
          success: false,
          projetosImportados,
          lancamentosImportados,
          projetosSubstituidos,
          error: `Erro ao consultar projeto ${projeto.nome_projeto}: ${selectErr.message}`,
        };
      }

      let projetoId: string;

      if (existing) {
        // Já existe: atualiza nome (caso tenha mudado no Asana) e mantém valor
        projetoId = existing.id;
        const { error: updErr } = await supabase
          .from("atos_projetos")
          .update({ nome_projeto: projeto.nome_projeto })
          .eq("id", projetoId);
        if (updErr) {
          return {
            success: false,
            projetosImportados,
            lancamentosImportados,
            projetosSubstituidos,
            error: `Erro ao atualizar ${projeto.nome_projeto}: ${updErr.message}`,
          };
        }

        // Deleta lançamentos antigos
        const { error: delErr } = await supabase
          .from("atos_lancamentos")
          .delete()
          .eq("projeto_id", projetoId);
        if (delErr) {
          return {
            success: false,
            projetosImportados,
            lancamentosImportados,
            projetosSubstituidos,
            error: `Erro ao limpar lançamentos antigos de ${projeto.nome_projeto}: ${delErr.message}`,
          };
        }
        projetosSubstituidos++;
      } else {
        // Não existe: cria
        const { data: inserted, error: insErr } = await supabase
          .from("atos_projetos")
          .insert({
            asana_project_id: projeto.asana_project_id,
            nome_projeto: projeto.nome_projeto,
            valor_combinado: 0,
            incluir_nao_billable: true,
            uploaded_by: userId,
          })
          .select("id")
          .single();
        if (insErr || !inserted) {
          return {
            success: false,
            projetosImportados,
            lancamentosImportados,
            projetosSubstituidos,
            error: `Erro ao criar projeto ${projeto.nome_projeto}: ${insErr?.message}`,
          };
        }
        projetoId = inserted.id;
        projetosImportados++;
      }

      // Insere lançamentos em batches
      const dbLancamentos = projeto.lancamentos.map(l => ({
        projeto_id: projetoId,
        colaborador_nome: l.colaborador_nome,
        tarefa_nome: l.tarefa_nome || null,
        asana_task_id: l.asana_task_id || null,
        duracao_minutos: l.duracao_minutos,
        billable: l.billable,
        data_lancamento: l.data_lancamento,
        descricao: l.descricao || null,
      }));

      for (let i = 0; i < dbLancamentos.length; i += 500) {
        const batch = dbLancamentos.slice(i, i + 500);
        const { error: insLanErr } = await supabase
          .from("atos_lancamentos")
          .insert(batch);
        if (insLanErr) {
          return {
            success: false,
            projetosImportados,
            lancamentosImportados,
            projetosSubstituidos,
            error: `Erro ao inserir lançamentos de ${projeto.nome_projeto}: ${insLanErr.message}`,
          };
        }
      }
      lancamentosImportados += dbLancamentos.length;
    }

    return {
      success: true,
      projetosImportados,
      lancamentosImportados,
      projetosSubstituidos,
    };
  } catch (e: any) {
    return {
      success: false,
      projetosImportados,
      lancamentosImportados,
      projetosSubstituidos,
      error: e?.message || "Erro desconhecido na importação.",
    };
  }
}

// =====================================================================
// Cálculos
// =====================================================================

export interface ColaboradorBreakdown {
  nome: string;
  totalMinutos: number;
  totalHoras: number;
  custoHora: number;
  valorTotal: number;
  temCusto: boolean;
  lancamentos: number;
}

export interface ProjetoCalculado {
  projeto: AtoProjetoDB;
  totalMinutos: number;
  totalHoras: number;
  totalMinutosBillable: number;
  totalMinutosNaoBillable: number;
  valorHoras: number; // soma de horas × valor_hora
  valorCombinado: number; // valor do contrato (manual)
  resultado: number; // valorCombinado - valorHoras
  resultadoPercent: number; // (resultado / valorCombinado) × 100
  porColaborador: ColaboradorBreakdown[];
  colaboradoresSemCusto: string[];
}

/**
 * Calcula o "Resultado vs Horas" de um projeto.
 *
 * Lógica:
 *   - valorHoras = soma de (duração × valor_hora do colaborador), respeitando
 *     o toggle incluir_nao_billable
 *   - resultado = valorCombinado - valorHoras
 *     > 0 → cobrou mais do que valeria por hora (positivo)
 *     < 0 → cobrou menos do que valeria por hora (negativo)
 *     = 0 → exatamente igual
 */
export function calcularProjeto(
  projeto: AtoProjetoDB,
  lancamentos: AtoLancamentoDB[]
): ProjetoCalculado {
  const incluirNaoBillable = projeto.incluir_nao_billable;

  // Agrupar por colaborador
  const colabMap = new Map<
    string,
    {
      totalMinutos: number;
      totalMinutosBillable: number;
      totalMinutosNaoBillable: number;
      lancamentos: number;
    }
  >();

  let totalMinutos = 0;
  let totalMinutosBillable = 0;
  let totalMinutosNaoBillable = 0;

  for (const l of lancamentos) {
    if (!incluirNaoBillable && !l.billable) continue; // pula se toggle desligado

    totalMinutos += l.duracao_minutos;
    if (l.billable) totalMinutosBillable += l.duracao_minutos;
    else totalMinutosNaoBillable += l.duracao_minutos;

    if (!colabMap.has(l.colaborador_nome)) {
      colabMap.set(l.colaborador_nome, {
        totalMinutos: 0,
        totalMinutosBillable: 0,
        totalMinutosNaoBillable: 0,
        lancamentos: 0,
      });
    }
    const c = colabMap.get(l.colaborador_nome)!;
    c.totalMinutos += l.duracao_minutos;
    if (l.billable) c.totalMinutosBillable += l.duracao_minutos;
    else c.totalMinutosNaoBillable += l.duracao_minutos;
    c.lancamentos++;
  }

  let valorHoras = 0;
  const colaboradoresSemCustoSet = new Set<string>();
  const porColaborador: ColaboradorBreakdown[] = [];

  for (const [nome, data] of colabMap.entries()) {
    const rate =
      getLawyerHourlyRate(nome) || getCustomLawyerRate(nome) || 0;
    const temCusto = rate > 0;
    if (!temCusto) colaboradoresSemCustoSet.add(nome);

    const horas = data.totalMinutos / 60;
    const valor = horas * rate;
    valorHoras += valor;

    porColaborador.push({
      nome,
      totalMinutos: data.totalMinutos,
      totalHoras: horas,
      custoHora: rate,
      valorTotal: valor,
      temCusto,
      lancamentos: data.lancamentos,
    });
  }

  porColaborador.sort((a, b) => b.valorTotal - a.valorTotal);

  const valorCombinado = Number(projeto.valor_combinado) || 0;
  const resultado = valorCombinado - valorHoras;
  const resultadoPercent =
    valorCombinado > 0 ? (resultado / valorCombinado) * 100 : 0;

  return {
    projeto,
    totalMinutos,
    totalHoras: totalMinutos / 60,
    totalMinutosBillable,
    totalMinutosNaoBillable,
    valorHoras,
    valorCombinado,
    resultado,
    resultadoPercent,
    porColaborador,
    colaboradoresSemCusto: Array.from(colaboradoresSemCustoSet).sort(),
  };
}

// =====================================================================
// Mutações pontuais
// =====================================================================

export async function updateProjetoValorCombinado(
  projetoId: string,
  valorCombinado: number
): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase
    .from("atos_projetos")
    .update({ valor_combinado: valorCombinado })
    .eq("id", projetoId);
  return error ? { success: false, error: error.message } : { success: true };
}

export async function updateProjetoIncluirNaoBillable(
  projetoId: string,
  incluir: boolean
): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase
    .from("atos_projetos")
    .update({ incluir_nao_billable: incluir })
    .eq("id", projetoId);
  return error ? { success: false, error: error.message } : { success: true };
}

export async function deleteProjeto(
  projetoId: string
): Promise<{ success: boolean; error?: string }> {
  // ON DELETE CASCADE já cuida dos lançamentos
  const { error } = await supabase
    .from("atos_projetos")
    .delete()
    .eq("id", projetoId);
  return error ? { success: false, error: error.message } : { success: true };
}

// =====================================================================
// Helpers CSV
// =====================================================================

/**
 * Parser de uma linha de CSV separado por vírgula, com suporte a campos
 * quotados com vírgula interna e aspas duplas escapadas ("").
 */
function parseCSVLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      fields.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields;
}

function parseISODate(dateStr: string): string | null {
  if (!dateStr) return null;
  const trimmed = dateStr.trim();
  // Aceita YYYY-MM-DD ou YYYY-MM-DDTHH:mm:ss...
  const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    return `${match[1]}-${match[2]}-${match[3]}`;
  }
  return null;
}

