import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { parseImportDate } from "@/lib/import-date";
import { EXCLUDED_MEMBERS, isExcludedMember } from "@/lib/hours-constants";

export interface TimeEntry {
  id: string;
  task_name: string;
  assignee: string;
  project: string;
  completed_date: string | null;
  hours_logged: number;
  client: string | null;
  activity_type: string | null;
  month: number;
  year: number;
  updated_at?: string;
}

export interface TaskDetail {
  taskName: string;
  hours: number;
  date: string | null;
  activityType: string | null;
}

export interface ProjectDetail {
  project: string;
  hours: number;
  activityType: string | null;
  dates: string[];
  tasks: TaskDetail[];
}

export interface MemberSummary {
  name: string;
  totalHours: number;
  percentOfTotal: number;
  projects: ProjectDetail[];
}

export interface ClientEntry {
  taskName: string;
  hours: number;
  date: string | null;
  activityType: string | null;
}

export interface ClientMemberDetail {
  name: string;
  totalHours: number;
  entries: ClientEntry[];
}

export interface ClientSummary {
  client: string;
  totalHours: number;
  members: ClientMemberDetail[];
}

export interface HoursDashboardData {
  entries: TimeEntry[];
  totalHours: number;
  avgHoursPerDay: number;
  topContributor: string;
  topContributorHours: number;
  hoursPerRemainingDay: number;
  activeProjects: number;
  fillRate: number; // % of business days with entries
  memberSummaries: MemberSummary[];
  clientSummaries: ClientSummary[];
  dailyHours: { date: string; hours: number }[];
  activityDistribution: { type: string; hours: number; percent: number }[];
  members: string[];
  projects: string[];
  activityTypes: string[];
  businessDaysInMonth: number;
  businessDaysElapsed: number;
  businessDaysRemaining: number;
  memberCount: number;
}

function getBusinessDaysInMonth(month: number, year: number): number {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  let businessDays = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    const day = new Date(year, month, d).getDay();
    if (day !== 0 && day !== 6) businessDays++;
  }
  return businessDays;
}

/**
 * Retorna dias úteis decorridos usando D-1 (ontem) para o mês corrente,
 * pois as horas de hoje ainda não foram lançadas.
 */
function getBusinessDaysElapsed(month: number, year: number): number {
  const now = new Date();
  const isCurrentMonth = now.getMonth() === month && now.getFullYear() === year;
  // D-1: para o mês corrente, considerar até ontem
  const lastDay = isCurrentMonth
    ? Math.max(now.getDate() - 1, 1)
    : new Date(year, month + 1, 0).getDate();
  let businessDays = 0;
  for (let d = 1; d <= lastDay; d++) {
    const day = new Date(year, month, d).getDay();
    if (day !== 0 && day !== 6) businessDays++;
  }
  return businessDays;
}

function getBusinessDaysRemaining(month: number, year: number): number {
  return getBusinessDaysInMonth(month, year) - getBusinessDaysElapsed(month, year);
}

export function useHoursData(selectedMonth: number, selectedYear: number) {
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [previousMonthHours, setPreviousMonthHours] = useState<number | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from("time_entries")
        .select("*")
        .eq("month", selectedMonth + 1) // DB stores 1-12
        .eq("year", selectedYear)
        .order("completed_date", { ascending: true });

      if (error) {
        console.error("Error fetching time entries:", error);
        setEntries([]);
      } else {
        const typed = (data as TimeEntry[]) || [];
        setEntries(typed);
        // Find the most recent updated_at across all entries
        const maxTs = typed.reduce((max, e) => {
          if (!e.updated_at) return max;
          return e.updated_at > max ? e.updated_at : max;
        }, "");
        if (maxTs) setLastUpdated(new Date(maxTs));
      }

      // Fetch previous month for comparison
      let prevMonth = selectedMonth - 1;
      let prevYear = selectedYear;
      if (prevMonth < 0) { prevMonth = 11; prevYear--; }

      const { data: prevData } = await supabase
        .from("time_entries")
        .select("hours_logged")
        .eq("month", prevMonth + 1)
        .eq("year", prevYear);

      if (prevData && prevData.length > 0) {
        setPreviousMonthHours(prevData.reduce((s, e) => s + Number(e.hours_logged), 0));
      } else {
        setPreviousMonthHours(null);
      }
    } catch (err) {
      console.error("Error loading hours data:", err);
      setEntries([]);
    } finally {
      setIsLoading(false);
    }
  }, [selectedMonth, selectedYear]);

  useEffect(() => { loadData(); }, [loadData]);

  // Realtime: auto-refresh when hours are imported by any user
  useEffect(() => {
    const channel = supabase
      .channel("time_entries_changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "time_entries" }, () => {
        loadData();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [loadData]);

  const dashboardData = useMemo((): HoursDashboardData | null => {
    if (entries.length === 0) return null;

    const totalHours = entries.reduce((s, e) => s + Number(e.hours_logged), 0);
    const businessDays = getBusinessDaysInMonth(selectedMonth, selectedYear);
    const businessDaysElapsed = getBusinessDaysElapsed(selectedMonth, selectedYear);
    const businessDaysRemaining = getBusinessDaysRemaining(selectedMonth, selectedYear);
    const avgHoursPerDay = businessDaysElapsed > 0 ? totalHours / businessDaysElapsed : 0;

    // Members
    const memberMap = new Map<string, { hours: number; projects: Map<string, { hours: number; activityType: string | null; dates: Set<string>; tasks: TaskDetail[] }> }>();
    const projectSet = new Set<string>();
    const activitySet = new Set<string>();
    const dailyMap = new Map<string, number>();
    const activityMap = new Map<string, number>();
    const daysWithEntries = new Set<string>();

    entries.forEach(e => {
      const assignee = e.assignee || "Sem responsável";
      if (!memberMap.has(assignee)) memberMap.set(assignee, { hours: 0, projects: new Map() });
      const m = memberMap.get(assignee)!;
      m.hours += Number(e.hours_logged);

      const proj = e.project || "Sem projeto";
      projectSet.add(proj);
      if (!m.projects.has(proj)) m.projects.set(proj, { hours: 0, activityType: e.activity_type, dates: new Set(), tasks: [] });
      const projData = m.projects.get(proj)!;
      projData.hours += Number(e.hours_logged);
      if (e.completed_date) projData.dates.add(e.completed_date);
      projData.tasks.push({
        taskName: e.task_name || "Sem título",
        hours: Number(e.hours_logged),
        date: e.completed_date,
        activityType: e.activity_type,
      });

      const at = e.activity_type || "Outros";
      activitySet.add(at);
      activityMap.set(at, (activityMap.get(at) || 0) + Number(e.hours_logged));

      if (e.completed_date) {
        dailyMap.set(e.completed_date, (dailyMap.get(e.completed_date) || 0) + Number(e.hours_logged));
        daysWithEntries.add(e.completed_date);
      }
    });

    // Client summaries (client → member → entries with descriptions)
    const clientMap = new Map<string, { hours: number; members: Map<string, { hours: number; entries: ClientEntry[] }> }>();
    entries.forEach(e => {
      const clientName = e.client || e.project || "Sem cliente";
      if (!clientMap.has(clientName)) clientMap.set(clientName, { hours: 0, members: new Map() });
      const c = clientMap.get(clientName)!;
      c.hours += Number(e.hours_logged);
      const assignee = e.assignee || "Sem responsável";
      if (!c.members.has(assignee)) c.members.set(assignee, { hours: 0, entries: [] });
      const m = c.members.get(assignee)!;
      m.hours += Number(e.hours_logged);
      m.entries.push({
        taskName: e.task_name || "Sem título",
        hours: Number(e.hours_logged),
        date: e.completed_date,
        activityType: e.activity_type,
      });
    });
    const clientSummaries: ClientSummary[] = Array.from(clientMap.entries())
      .map(([client, data]) => ({
        client,
        totalHours: Math.round(data.hours * 100) / 100,
        members: Array.from(data.members.entries()).map(([name, mData]) => ({
          name,
          totalHours: Math.round(mData.hours * 100) / 100,
          entries: mData.entries.sort((a, b) => (b.date || "").localeCompare(a.date || "")),
        })).sort((a, b) => b.totalHours - a.totalHours),
      }))
      .sort((a, b) => b.totalHours - a.totalHours);

    // Top contributor
    let topContributor = "";
    let topContributorHours = 0;
    memberMap.forEach((v, k) => {
      if (v.hours > topContributorHours) { topContributor = k; topContributorHours = v.hours; }
    });

    // Member summaries
    const memberSummaries: MemberSummary[] = Array.from(memberMap.entries())
      .map(([name, data]) => ({
        name,
        totalHours: Math.round(data.hours * 100) / 100,
        percentOfTotal: totalHours > 0 ? (data.hours / totalHours) * 100 : 0,
        projects: Array.from(data.projects.entries()).map(([project, pData]) => ({
          project,
          hours: Math.round(pData.hours * 100) / 100,
          activityType: pData.activityType,
          dates: Array.from(pData.dates).sort(),
          tasks: pData.tasks.sort((a, b) => (b.date || "").localeCompare(a.date || "")),
        })).sort((a, b) => b.hours - a.hours),
      }))
      .sort((a, b) => b.totalHours - a.totalHours);

    // Daily hours
    const dailyHours = Array.from(dailyMap.entries())
      .map(([date, hours]) => ({ date, hours: Math.round(hours * 100) / 100 }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Activity distribution
    const activityDistribution = Array.from(activityMap.entries())
      .map(([type, hours]) => ({
        type,
        hours: Math.round(hours * 100) / 100,
        percent: totalHours > 0 ? (hours / totalHours) * 100 : 0,
      }))
      .sort((a, b) => b.hours - a.hours);

    // Fill rate: % of business days elapsed that have at least one entry
    // Count business days with entries
    let businessDaysWithEntries = 0;
    daysWithEntries.forEach(dateStr => {
      const d = new Date(dateStr + "T12:00:00");
      const day = d.getDay();
      if (day !== 0 && day !== 6) businessDaysWithEntries++;
    });
    const fillRate = businessDaysElapsed > 0 ? (businessDaysWithEntries / businessDaysElapsed) * 100 : 0;

    const hoursPerRemainingDay = businessDaysRemaining > 0 ? (totalHours / businessDaysElapsed) * businessDaysRemaining : 0;

    return {
      entries,
      totalHours: Math.round(totalHours * 100) / 100,
      avgHoursPerDay: Math.round(avgHoursPerDay * 100) / 100,
      topContributor,
      topContributorHours: Math.round(topContributorHours * 100) / 100,
      hoursPerRemainingDay: Math.round(hoursPerRemainingDay * 100) / 100,
      activeProjects: projectSet.size,
      fillRate: Math.round(fillRate * 10) / 10,
      memberSummaries,
      clientSummaries,
      dailyHours,
      activityDistribution,
      members: Array.from(memberMap.keys()).sort(),
      projects: Array.from(projectSet).sort(),
      activityTypes: Array.from(activitySet).sort(),
      businessDaysInMonth: businessDays,
      businessDaysElapsed,
      businessDaysRemaining,
      memberCount: memberMap.size,
    };
  }, [entries, selectedMonth, selectedYear]);

  const importCSV = useCallback(async (csvText: string, month: number, year: number) => {
    // Parse CSV handling multiline quoted fields
    const records = parseCSVRecords(csvText);
    if (records.length < 2) {
      toast({ title: "Erro", description: "CSV vazio ou inválido.", variant: "destructive" });
      return false;
    }

    // Parse header (first record), remove BOM
    const header = records[0].map(h => h.replace(/^\uFEFF/, "").toLowerCase().trim());
    const findCol = (names: string[]) => header.findIndex(h => h != null && names.some(n => h.includes(n)));

    const taskCol = findCol(["nome da tarefa", "task name", "name"]);
    const assigneeCol = findCol(["responsável", "assignee", "responsavel"]);
    const projectCol = findCol(["projeto", "project"]);
    const dateCol = findCol(["data de conclusão", "completed at", "completed", "data"]);
    const hoursCol = findCol(["horas lançadas", "horas", "hours", "actual time"]);
    const clientCol = findCol(["cliente", "client"]);
    const activityCol = findCol(["tipo de atividade", "tipo", "activity", "tags"]);
    const descCol = findCol(["descrição", "descrição ts", "description", "notes"]);

    console.log("CSV columns detected:", { taskCol, assigneeCol, projectCol, dateCol, hoursCol, clientCol, activityCol, descCol });
    console.log("CSV header:", header);

    if (taskCol === -1 && assigneeCol === -1) {
      toast({ title: "Erro", description: "CSV não possui colunas reconhecidas (Nome da Tarefa, Responsável).", variant: "destructive" });
      return false;
    }

    const newEntries: any[] = [];
    const { data: session } = await supabase.auth.getSession();
    const userId = session?.session?.user?.id;

    for (let i = 1; i < records.length; i++) {
      const fields = records[i];
      if (fields.length <= 1 && !fields[0]?.trim()) continue;

      const hoursStr = hoursCol >= 0 ? (fields[hoursCol] || "") : "";
      let hours = 0;
      if (hoursStr.includes(":")) {
        const parts = hoursStr.split(":");
        hours = (parseInt(parts[0]) || 0) + (parseInt(parts[1]) || 0) / 60;
      } else {
        hours = parseFloat(hoursStr.replace(",", ".")) || 0;
      }
      if (hours <= 0) continue;

      const dateStr = dateCol >= 0
        ? parseImportDate(fields[dateCol])
        : null;

      // Extract activity type from Tags or dedicated column
      let activityType: string | null = null;
      if (activityCol >= 0 && fields[activityCol]) {
        activityType = fields[activityCol].trim() || null;
      }

      // Use description column as fallback context
      const taskName = taskCol >= 0 ? (fields[taskCol] || "Sem título").trim() : "Sem título";
      const assignee = assigneeCol >= 0 ? (fields[assigneeCol] || "Sem responsável").trim() : "Sem responsável";
      const project = projectCol >= 0 ? (fields[projectCol] || "Sem projeto").trim() : "Sem projeto";

      newEntries.push({
        task_name: taskName,
        assignee,
        project,
        completed_date: dateStr,
        hours_logged: Math.round(hours * 100) / 100,
        client: clientCol >= 0 ? (fields[clientCol] || "").trim() || null : null,
        activity_type: activityType,
        month: month + 1,
        year,
        uploaded_by: userId || null,
      });
    }

    if (newEntries.length === 0) {
      toast({ title: "Erro", description: "Nenhum registro válido encontrado no CSV.", variant: "destructive" });
      return false;
    }

    // Delete existing entries for this month/year, then insert new
    const { error: delError } = await supabase.from("time_entries").delete().eq("month", month + 1).eq("year", year);
    if (delError) {
      console.error("Error deleting old entries:", delError);
    }
    
    // Insert in batches of 500
    for (let i = 0; i < newEntries.length; i += 500) {
      const batch = newEntries.slice(i, i + 500);
      const { error } = await supabase.from("time_entries").insert(batch);
      if (error) {
        console.error("Error inserting time entries:", error);
        toast({ title: "Erro", description: `Falha ao salvar dados: ${error.message}`, variant: "destructive" });
        return false;
      }
    }

    toast({ title: "Importação concluída", description: `${newEntries.length} registros importados com sucesso.` });
    await loadData();
    return true;
  }, [loadData]);

  return { dashboardData, isLoading, importCSV, previousMonthHours, lastUpdated, reload: loadData };
}

/** Parse full CSV text handling multiline quoted fields */
function parseCSVRecords(csvText: string): string[][] {
  const records: string[][] = [];
  let current = "";
  let inQuotes = false;
  const fields: string[] = [];

  for (let i = 0; i < csvText.length; i++) {
    const char = csvText[i];
    const next = csvText[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      fields.push(current.trim());
      current = "";
    } else if ((char === '\n' || (char === '\r' && next === '\n')) && !inQuotes) {
      if (char === '\r') i++;
      fields.push(current.trim());
      if (fields.some(f => f !== "")) {
        records.push([...fields]);
      }
      fields.length = 0;
      current = "";
    } else if (char === '\r' && !inQuotes) {
      fields.push(current.trim());
      if (fields.some(f => f !== "")) {
        records.push([...fields]);
      }
      fields.length = 0;
      current = "";
    } else {
      current += char;
    }
  }

  fields.push(current.trim());
  if (fields.some(f => f !== "")) {
    records.push([...fields]);
  }

  return records;
}
