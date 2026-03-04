import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

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
}

export interface MemberSummary {
  name: string;
  totalHours: number;
  percentOfTotal: number;
  projects: { project: string; hours: number; activityType: string | null }[];
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
  dailyHours: { date: string; hours: number }[];
  activityDistribution: { type: string; hours: number; percent: number }[];
  members: string[];
  projects: string[];
  activityTypes: string[];
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

function getBusinessDaysElapsed(month: number, year: number): number {
  const now = new Date();
  const isCurrentMonth = now.getMonth() === month && now.getFullYear() === year;
  const lastDay = isCurrentMonth ? now.getDate() : new Date(year, month + 1, 0).getDate();
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
        setEntries((data as TimeEntry[]) || []);
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

  const dashboardData = useMemo((): HoursDashboardData | null => {
    if (entries.length === 0) return null;

    const totalHours = entries.reduce((s, e) => s + Number(e.hours_logged), 0);
    const businessDays = getBusinessDaysInMonth(selectedMonth, selectedYear);
    const businessDaysElapsed = getBusinessDaysElapsed(selectedMonth, selectedYear);
    const businessDaysRemaining = getBusinessDaysRemaining(selectedMonth, selectedYear);
    const avgHoursPerDay = businessDaysElapsed > 0 ? totalHours / businessDaysElapsed : 0;

    // Members
    const memberMap = new Map<string, { hours: number; projects: Map<string, { hours: number; activityType: string | null }> }>();
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
      if (!m.projects.has(proj)) m.projects.set(proj, { hours: 0, activityType: e.activity_type });
      m.projects.get(proj)!.hours += Number(e.hours_logged);

      const at = e.activity_type || "Outros";
      activitySet.add(at);
      activityMap.set(at, (activityMap.get(at) || 0) + Number(e.hours_logged));

      if (e.completed_date) {
        dailyMap.set(e.completed_date, (dailyMap.get(e.completed_date) || 0) + Number(e.hours_logged));
        daysWithEntries.add(e.completed_date);
      }
    });

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
      dailyHours,
      activityDistribution,
      members: Array.from(memberMap.keys()).sort(),
      projects: Array.from(projectSet).sort(),
      activityTypes: Array.from(activitySet).sort(),
    };
  }, [entries, selectedMonth, selectedYear]);

  const importCSV = useCallback(async (csvText: string, month: number, year: number) => {
    const lines = csvText.split("\n");
    if (lines.length < 2) {
      toast({ title: "Erro", description: "CSV vazio ou inválido.", variant: "destructive" });
      return false;
    }

    // Parse header
    const header = parseCSVLine(lines[0]).map(h => h.toLowerCase().trim());
    const findCol = (names: string[]) => header.findIndex(h => names.some(n => h.includes(n)));

    const taskCol = findCol(["nome da tarefa", "task name", "name"]);
    const assigneeCol = findCol(["responsável", "assignee", "responsavel"]);
    const projectCol = findCol(["projeto", "project"]);
    const dateCol = findCol(["data de conclusão", "completed", "data", "date"]);
    const hoursCol = findCol(["horas", "hours", "actual time", "time"]);
    const clientCol = findCol(["cliente", "client"]);
    const activityCol = findCol(["tipo de atividade", "tipo", "activity", "type"]);

    if (taskCol === -1 && assigneeCol === -1) {
      toast({ title: "Erro", description: "CSV não possui colunas reconhecidas (Nome da Tarefa, Responsável).", variant: "destructive" });
      return false;
    }

    const newEntries: any[] = [];
    const { data: session } = await supabase.auth.getSession();
    const userId = session?.session?.user?.id;

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      const fields = parseCSVLine(line);

      const hoursStr = hoursCol >= 0 ? fields[hoursCol] : "";
      let hours = 0;
      if (hoursStr.includes(":")) {
        const parts = hoursStr.split(":");
        hours = (parseInt(parts[0]) || 0) + (parseInt(parts[1]) || 0) / 60;
      } else {
        hours = parseFloat(hoursStr.replace(",", ".")) || 0;
      }
      if (hours <= 0) continue;

      let dateStr: string | null = null;
      if (dateCol >= 0 && fields[dateCol]) {
        const raw = fields[dateCol].trim();
        // Try ISO format or common formats
        const d = new Date(raw);
        if (!isNaN(d.getTime())) {
          dateStr = d.toISOString().split("T")[0];
        }
      }

      newEntries.push({
        task_name: taskCol >= 0 ? fields[taskCol] || "Sem título" : "Sem título",
        assignee: assigneeCol >= 0 ? fields[assigneeCol] || "Sem responsável" : "Sem responsável",
        project: projectCol >= 0 ? fields[projectCol] || "Sem projeto" : "Sem projeto",
        completed_date: dateStr,
        hours_logged: Math.round(hours * 100) / 100,
        client: clientCol >= 0 ? fields[clientCol] || null : null,
        activity_type: activityCol >= 0 ? fields[activityCol] || null : null,
        month: month + 1, // 1-12
        year,
        uploaded_by: userId || null,
      });
    }

    if (newEntries.length === 0) {
      toast({ title: "Erro", description: "Nenhum registro válido encontrado no CSV.", variant: "destructive" });
      return false;
    }

    // Delete existing entries for this month/year, then insert new
    await supabase.from("time_entries").delete().eq("month", month + 1).eq("year", year);
    
    // Insert in batches of 500
    for (let i = 0; i < newEntries.length; i += 500) {
      const batch = newEntries.slice(i, i + 500);
      const { error } = await supabase.from("time_entries").insert(batch);
      if (error) {
        console.error("Error inserting time entries:", error);
        toast({ title: "Erro", description: "Falha ao salvar dados. Verifique as permissões.", variant: "destructive" });
        return false;
      }
    }

    toast({ title: "Importação concluída", description: `${newEntries.length} registros importados com sucesso.` });
    await loadData();
    return true;
  }, [loadData]);

  return { dashboardData, isLoading, importCSV, previousMonthHours, reload: loadData };
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') { inQuotes = !inQuotes; }
    else if (char === "," && !inQuotes) { result.push(current.trim()); current = ""; }
    else { current += char; }
  }
  result.push(current.trim());
  return result;
}
