import { useState, useMemo, useCallback } from "react";
import { Clock, Calendar, Target, FolderOpen, CheckCircle, BarChart3, AlertTriangle, Download, Filter, FileDown, TrendingUp, TrendingDown, Users } from "lucide-react";
import { DashboardLoadingSkeleton } from "@/components/dashboard/DashboardSkeleton";
import { MonthSelector } from "@/components/dashboard/MonthSelector";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { HoursMemberChart } from "@/components/hours/HoursMemberChart";
import { HoursDetailTable } from "@/components/hours/HoursDetailTable";
import { DailyHoursChart } from "@/components/hours/DailyHoursChart";
import { ActivityDistributionChart } from "@/components/hours/ActivityDistributionChart";
import { EasyJurImport } from "@/components/hours/EasyJurImport";
import { HoursExecutiveSummary } from "@/components/hours/HoursExecutiveSummary";
import { useHoursData } from "@/hooks/use-hours-data";
import { getMonthProgress } from "@/lib/month-progress";
import { DAILY_TARGET_HOURS, DAILY_ALERT_THRESHOLD, TARGET_MEMBER_COUNT, getMemberPeriodTarget, getTeamTargetAdjustment, isExcludedMember } from "@/lib/hours-constants";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { exportHoursPDF } from "@/lib/hours-pdf-export";

const MONTH_NAMES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

function StatRow({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={cn("text-xs font-semibold text-foreground", valueClass)}>{value}</span>
    </div>
  );
}

function Variation({ value, label }: { value: number | null; label: string }) {
  if (value == null) return null;
  const isUp = value >= 0;
  return (
    <div className="flex items-center gap-1 mt-1.5">
      {isUp
        ? <TrendingUp className="w-3 h-3 text-success-foreground shrink-0" />
        : <TrendingDown className="w-3 h-3 text-destructive shrink-0" />}
      <span className={cn("text-xs font-medium", isUp ? "text-success-foreground" : "text-destructive")}>
        {isUp ? "+" : ""}{value.toFixed(1)}% vs {label}
      </span>
    </div>
  );
}

export default function HoursDashboard() {
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [memberFilter, setMemberFilter] = useState("all");
  const [projectFilter, setProjectFilter] = useState("all");
  const [activityFilter, setActivityFilter] = useState("all");
  const [showBelowTargetOnly, setShowBelowTargetOnly] = useState(false);

  const { dashboardData, isLoading, previousMonthHours, reload } = useHoursData(selectedMonth, selectedYear);
  const monthProgress = useMemo(() => getMonthProgress(), []);

  const filteredData = useMemo(() => {
    if (!dashboardData) return null;
    if (memberFilter === "all" && projectFilter === "all" && activityFilter === "all") return dashboardData;
    const filtered = dashboardData.entries.filter(e => {
      if (memberFilter !== "all" && e.assignee !== memberFilter) return false;
      if (projectFilter !== "all" && e.project !== projectFilter) return false;
      if (activityFilter !== "all" && (e.activity_type || "Outros") !== activityFilter) return false;
      return true;
    });
    const totalHours = filtered.reduce((s, e) => s + Number(e.hours_logged), 0);
    return { ...dashboardData, totalHours: Math.round(totalHours * 100) / 100 };
  }, [dashboardData, memberFilter, projectFilter, activityFilter]);

  const hoursVariation = useMemo(() => {
    if (!dashboardData || !previousMonthHours || previousMonthHours === 0) return null;
    return ((dashboardData.totalHours - previousMonthHours) / previousMonthHours) * 100;
  }, [dashboardData, previousMonthHours]);

  const activeFilterCount = [memberFilter, projectFilter, activityFilter].filter(f => f !== "all").length;

  const clearFilters = () => {
    setMemberFilter("all");
    setProjectFilter("all");
    setActivityFilter("all");
  };

  // Meta calculations
  const activeMemberCount = memberFilter !== "all" ? 1 : TARGET_MEMBER_COUNT;
  const businessDaysInMonth = dashboardData?.businessDaysInMonth ?? 0;
  const businessDaysElapsed = dashboardData?.businessDaysElapsed ?? 0;
  const businessDaysRemaining = dashboardData?.businessDaysRemaining ?? 0;
  const totalHoursLaunched = dashboardData?.totalHours ?? 0;

  const teamAdjustment = getTeamTargetAdjustment(selectedMonth, selectedYear);
  const monthlyTarget = businessDaysInMonth * DAILY_TARGET_HOURS * activeMemberCount - teamAdjustment;
  const hoursExpectedSoFar = businessDaysElapsed * DAILY_TARGET_HOURS * activeMemberCount - teamAdjustment;
  const hoursRemaining = Math.max(0, monthlyTarget - totalHoursLaunched);
  const hoursPerRemainingDayPerMember = businessDaysRemaining > 0 && activeMemberCount > 0
    ? hoursRemaining / businessDaysRemaining / activeMemberCount
    : 0;
  const progressPercent = monthlyTarget > 0 ? (totalHoursLaunched / monthlyTarget) * 100 : 0;
  const expectedProgressPercent = businessDaysInMonth > 0 ? (businessDaysElapsed / businessDaysInMonth) * 100 : 0;
  const needsAcceleration = hoursPerRemainingDayPerMember > DAILY_ALERT_THRESHOLD;

  const dailyChartTarget = DAILY_TARGET_HOURS * activeMemberCount;
  const avgHoursValue = dashboardData?.avgHoursPerDay ?? 0;
  const avgPerMember = activeMemberCount > 0 ? avgHoursValue / activeMemberCount : 0;
  const individualTargetForPeriod = businessDaysElapsed * DAILY_TARGET_HOURS;

  const progressRatio = expectedProgressPercent > 0 ? progressPercent / expectedProgressPercent : 1;
  const progressBarColor = progressRatio >= 1 ? "bg-success" : progressRatio >= 0.7 ? "bg-warning" : "bg-destructive";
  const progressTextColor = progressRatio >= 1 ? "text-success-foreground" : progressRatio >= 0.7 ? "text-warning-foreground" : "text-destructive";
  const progressBorderColor = progressRatio >= 1 ? "border-success/40" : progressRatio >= 0.7 ? "border-warning/40" : "border-destructive/40";
  const progressBgColor = progressRatio >= 1 ? "bg-success/5" : progressRatio >= 0.7 ? "bg-warning/5" : "bg-destructive/5";

  const currentPace = businessDaysElapsed > 0 ? totalHoursLaunched / businessDaysElapsed / activeMemberCount : 0;
  const projectedCompletion = monthlyTarget > 0 && currentPace > 0
    ? Math.min(100, (currentPace * businessDaysInMonth * activeMemberCount / monthlyTarget) * 100)
    : 0;

  const totalEntries = dashboardData?.entries.length ?? 0;
  const filteredEntries = useMemo(() => {
    if (!dashboardData) return 0;
    if (activeFilterCount === 0) return dashboardData.entries.length;
    return dashboardData.entries.filter(e => {
      if (memberFilter !== "all" && e.assignee !== memberFilter) return false;
      if (projectFilter !== "all" && e.project !== projectFilter) return false;
      if (activityFilter !== "all" && (e.activity_type || "Outros") !== activityFilter) return false;
      return true;
    }).length;
  }, [dashboardData, memberFilter, projectFilter, activityFilter, activeFilterCount]);

  const exportCSV = useCallback(() => {
    if (!dashboardData) return;
    let entries = dashboardData.entries;
    if (activeFilterCount > 0) {
      entries = entries.filter(e => {
        if (memberFilter !== "all" && e.assignee !== memberFilter) return false;
        if (projectFilter !== "all" && e.project !== projectFilter) return false;
        if (activityFilter !== "all" && (e.activity_type || "Outros") !== activityFilter) return false;
        return true;
      });
    }
    const header = "Membro,Projeto,Tarefa,Data,Horas,Tipo de Atividade,Cliente";
    const rows = entries.map(e =>
      `"${e.assignee}","${e.project}","${e.task_name}","${e.completed_date || ""}",${e.hours_logged},"${e.activity_type || ""}","${e.client || ""}"`
    );
    const csv = [header, ...rows].join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `horas_${MONTH_NAMES[selectedMonth]}_${selectedYear}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [dashboardData, memberFilter, projectFilter, activityFilter, activeFilterCount, selectedMonth, selectedYear]);

  const belowTargetMembers = useMemo(() => {
    if (!dashboardData || businessDaysElapsed <= 0) return [];
    return dashboardData.memberSummaries.filter(m => {
      if (isExcludedMember(m.name)) return false;
      const memberTarget = getMemberPeriodTarget(m.name, businessDaysElapsed, selectedMonth, selectedYear);
      return m.totalHours < memberTarget;
    });
  }, [dashboardData, businessDaysElapsed, selectedMonth, selectedYear]);

  const { percentElapsed, currentDay, totalDays, daysRemaining } = monthProgress;
  const prevMonthName = MONTH_NAMES[(selectedMonth - 1 + 12) % 12];

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <DashboardHeader activeTab="horas" />
        <main className="container py-8">
          <DashboardLoadingSkeleton />
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader activeTab="horas" />

      <div className="container py-5">
        <div className="flex gap-5 items-start">

          {/* ── SIDEBAR (desktop only, sticky) ── */}
          <aside className="hidden lg:flex flex-col gap-3 w-72 xl:w-80 shrink-0 sticky top-[70px]">

            {/* Hero: progresso da meta */}
            {dashboardData ? (
              <div className={cn("rounded-xl p-5 border shadow-sm", progressBgColor, progressBorderColor)}>
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold mb-1.5">
                  Meta do Mês
                </p>
                <p className={cn("text-[2rem] font-display font-bold leading-none", progressTextColor)}>
                  {progressPercent.toFixed(0)}%
                </p>
                <div className="mt-3 space-y-1">
                  <div className="relative h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className={cn("h-full rounded-full transition-all duration-500", progressBarColor)}
                      style={{ width: `${Math.min(progressPercent, 100)}%` }}
                    />
                    <div
                      className="absolute top-0 h-full w-0.5 bg-foreground/30 rounded-full"
                      style={{ left: `${Math.min(expectedProgressPercent, 100)}%` }}
                    />
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    Esperado: <span className="font-semibold">{expectedProgressPercent.toFixed(0)}%</span>
                    <span className="mx-1">·</span>
                    Realizado: <span className={cn("font-semibold", progressTextColor)}>{progressPercent.toFixed(0)}%</span>
                  </p>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  {totalHoursLaunched.toFixed(1)}h de {monthlyTarget.toFixed(0)}h
                </p>
                <Variation value={hoursVariation} label={prevMonthName} />
              </div>
            ) : (
              <div className="rounded-xl p-5 border border-border bg-card shadow-sm">
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold mb-1.5">Meta do Mês</p>
                <p className="text-[2rem] font-display font-bold text-muted-foreground">—</p>
              </div>
            )}

            {/* Horas + Membros */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-card border border-border rounded-xl p-4">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                  <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">Horas</p>
                </div>
                <p className="text-2xl font-display font-bold text-foreground leading-none">
                  {totalHoursLaunched.toFixed(1)}
                  <span className="text-sm text-muted-foreground font-normal ml-0.5">h</span>
                </p>
                {dashboardData && (
                  <p className={cn("text-[10px] mt-1.5 font-medium",
                    totalHoursLaunched >= hoursExpectedSoFar ? "text-success-foreground" : "text-destructive"
                  )}>
                    esp. {hoursExpectedSoFar.toFixed(0)}h
                  </p>
                )}
              </div>
              <div className="bg-card border border-border rounded-xl p-4">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <Users className="w-3.5 h-3.5 text-muted-foreground" />
                  <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">Membros</p>
                </div>
                <p className="text-2xl font-display font-bold text-foreground leading-none">
                  {dashboardData?.members.length ?? "—"}
                </p>
                <p className="text-[10px] text-muted-foreground mt-1.5 font-medium uppercase tracking-widest">no time</p>
              </div>
            </div>

            {/* Progresso do mês */}
            <div className="bg-card border border-border rounded-xl p-4">
              <div className="flex items-center justify-between mb-2.5">
                <div className="flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                    {MONTH_NAMES[selectedMonth]}
                  </span>
                </div>
                <span className="text-sm font-bold text-primary">{percentElapsed.toFixed(0)}%</span>
              </div>
              <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-500"
                  style={{ width: `${percentElapsed}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Dia <span className="font-semibold text-foreground">{currentDay}</span>/{totalDays}
                {" "}&middot;{" "}{businessDaysRemaining} dias úteis restantes
              </p>
            </div>

            {/* Horas restantes + ritmo */}
            {dashboardData && (
              <div className="bg-card border border-border rounded-xl p-4 space-y-2">
                <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">Ritmo e Projeção</p>
                <StatRow
                  label="Horas restantes"
                  value={`${hoursRemaining.toFixed(1)}h`}
                />
                <StatRow
                  label="Necessário/dia/membro"
                  value={`${hoursPerRemainingDayPerMember.toFixed(1)}h`}
                  valueClass={needsAcceleration ? "text-warning-foreground" : undefined}
                />
                <StatRow
                  label="Ritmo atual/membro"
                  value={`${currentPace.toFixed(1)}h/dia`}
                />
                <StatRow
                  label="Projeção de conclusão"
                  value={`${projectedCompletion.toFixed(0)}%`}
                  valueClass={projectedCompletion >= 90 ? "text-success-foreground" : projectedCompletion >= 70 ? "text-warning-foreground" : "text-destructive"}
                />
                <StatRow
                  label="Média/dia (membro)"
                  value={`${avgPerMember.toFixed(1)}h`}
                  valueClass={avgPerMember >= DAILY_TARGET_HOURS ? "text-success-foreground" : "text-destructive"}
                />
              </div>
            )}

            {/* Alerta: membros abaixo da meta */}
            {belowTargetMembers.length > 0 && (
              <div className="bg-warning/5 border border-warning/40 rounded-xl p-4">
                <div className="flex items-center gap-1.5 mb-2.5 text-warning-foreground">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <p className="text-[10px] font-bold uppercase tracking-widest">
                    {belowTargetMembers.length} membro{belowTargetMembers.length > 1 ? "s" : ""} abaixo da meta
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {belowTargetMembers.map(m => (
                    <button
                      key={m.name}
                      onClick={() => { setMemberFilter(m.name); setShowBelowTargetOnly(false); }}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold border bg-warning/10 border-warning/40 text-warning-foreground hover:bg-warning/20 transition-colors cursor-pointer"
                    >
                      {m.name.split(" ")[0]}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Filtros */}
            <div className="bg-card border border-border rounded-xl p-4 space-y-2.5">
              <div className="flex items-center justify-between">
                <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">Filtros</p>
                {activeFilterCount > 0 && (
                  <button onClick={clearFilters} className="text-[10px] text-destructive hover:underline font-semibold">
                    Limpar ({activeFilterCount})
                  </button>
                )}
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] text-muted-foreground font-medium uppercase tracking-widest">Membro</label>
                <select
                  value={memberFilter}
                  onChange={(e) => { setMemberFilter(e.target.value); setShowBelowTargetOnly(false); }}
                  className={cn("w-full h-8 rounded-md border bg-background px-3 text-sm",
                    memberFilter !== "all" ? "border-primary bg-primary/5" : "border-border")}
                >
                  <option value="all">Todos</option>
                  {dashboardData?.members.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] text-muted-foreground font-medium uppercase tracking-widest">Projeto</label>
                <select
                  value={projectFilter}
                  onChange={(e) => setProjectFilter(e.target.value)}
                  className={cn("w-full h-8 rounded-md border bg-background px-3 text-sm",
                    projectFilter !== "all" ? "border-primary bg-primary/5" : "border-border")}
                >
                  <option value="all">Todos</option>
                  {dashboardData?.projects.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] text-muted-foreground font-medium uppercase tracking-widest">Atividade</label>
                <select
                  value={activityFilter}
                  onChange={(e) => setActivityFilter(e.target.value)}
                  className={cn("w-full h-8 rounded-md border bg-background px-3 text-sm",
                    activityFilter !== "all" ? "border-primary bg-primary/5" : "border-border")}
                >
                  <option value="all">Todas</option>
                  {dashboardData?.activityTypes.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
              </div>
              <MonthSelector
                currentMonth={selectedMonth}
                currentYear={selectedYear}
                onChange={(m, y) => { setSelectedMonth(m); setSelectedYear(y); }}
              />
            </div>

          </aside>

          {/* ── CONTEÚDO PRINCIPAL ── */}
          <div className="flex-1 min-w-0 space-y-4">

            {/* Mobile: KPIs + filtros empilhados */}
            <div className="lg:hidden space-y-3">
              {dashboardData ? (
                <div className={cn("rounded-xl p-5 border shadow-sm", progressBgColor, progressBorderColor)}>
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold mb-1.5">Meta do Mês</p>
                  <p className={cn("text-3xl font-display font-bold leading-none", progressTextColor)}>
                    {progressPercent.toFixed(0)}%
                  </p>
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden mt-2">
                    <div className={cn("h-full rounded-full", progressBarColor)} style={{ width: `${Math.min(progressPercent, 100)}%` }} />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1.5">{totalHoursLaunched.toFixed(1)}h de {monthlyTarget.toFixed(0)}h</p>
                </div>
              ) : null}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-card border border-border rounded-xl p-3">
                  <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest mb-1">Horas</p>
                  <p className="text-xl font-display font-bold">{totalHoursLaunched.toFixed(1)}<span className="text-sm text-muted-foreground ml-0.5">h</span></p>
                </div>
                <div className="bg-card border border-border rounded-xl p-3">
                  <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest mb-1">Restantes</p>
                  <p className="text-xl font-display font-bold">{hoursRemaining.toFixed(1)}<span className="text-sm text-muted-foreground ml-0.5">h</span></p>
                </div>
              </div>
              {belowTargetMembers.length > 0 && (
                <div className="bg-warning/5 border border-warning/40 rounded-xl p-4">
                  <div className="flex items-center gap-1.5 mb-2 text-warning-foreground">
                    <AlertTriangle className="w-4 h-4" />
                    <span className="text-sm font-semibold">{belowTargetMembers.length} membro{belowTargetMembers.length > 1 ? "s" : ""} abaixo da meta</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {belowTargetMembers.map(m => (
                      <button key={m.name} onClick={() => setMemberFilter(m.name)}
                        className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border bg-warning/10 border-warning/40 text-warning-foreground">
                        {m.name.split(" ")[0]}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <select value={memberFilter} onChange={(e) => setMemberFilter(e.target.value)}
                  className={cn("h-8 flex-1 min-w-[120px] rounded-md border bg-background px-3 text-sm",
                    memberFilter !== "all" ? "border-primary" : "border-border")}>
                  <option value="all">Todos os membros</option>
                  {dashboardData?.members.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
                <MonthSelector currentMonth={selectedMonth} currentYear={selectedYear}
                  onChange={(m, y) => { setSelectedMonth(m); setSelectedYear(y); }} />
              </div>
            </div>

            {/* Toolbar: contagem + exports */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-display font-semibold text-foreground">
                  Lançamento de Horas
                  {dashboardData && (
                    <span className="ml-2 text-sm font-normal text-muted-foreground">
                      · {filteredEntries} de {totalEntries} lançamentos
                      {activeFilterCount > 0 && <span className="ml-1 text-primary">· {activeFilterCount} filtro{activeFilterCount > 1 ? "s" : ""} ativo{activeFilterCount > 1 ? "s" : ""}</span>}
                    </span>
                  )}
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">{MONTH_NAMES[selectedMonth]} {selectedYear}</p>
              </div>
              <div className="flex items-center gap-2">
                <EasyJurImport selectedMonth={selectedMonth} selectedYear={selectedYear} onImportComplete={reload} />
                <Button variant="outline" size="sm" onClick={exportCSV} disabled={!dashboardData}>
                  <Download className="w-4 h-4 mr-2" />
                  CSV
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!dashboardData}
                  onClick={() => {
                    if (!dashboardData) return;
                    exportHoursPDF({ data: dashboardData, selectedMonth, selectedYear, previousMonthHours, monthlyTarget, hoursExpectedSoFar, activeMemberCount, businessDaysRemaining });
                  }}
                >
                  <FileDown className="w-4 h-4 mr-2" />
                  PDF
                </Button>
              </div>
            </div>

            {dashboardData ? (
              <>
                {/* Horas por membro */}
                <section className="bg-card rounded-xl border border-border p-6 shadow-sm">
                  <h3 className="text-base font-display font-semibold text-foreground mb-1">Horas por Membro</h3>
                  <p className="text-xs text-muted-foreground mb-4">Ordenado do maior para o menor lançamento</p>
                  <HoursMemberChart
                    data={showBelowTargetOnly ? belowTargetMembers : dashboardData.memberSummaries}
                    individualTarget={individualTargetForPeriod}
                    businessDaysElapsed={businessDaysElapsed}
                    dailyTargetHours={DAILY_TARGET_HOURS}
                    month={selectedMonth}
                    year={selectedYear}
                  />
                </section>

                {/* Detalhamento */}
                <section className="bg-card rounded-xl border border-border p-6 shadow-sm">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 rounded-lg bg-primary/10">
                      <Clock className="w-4 h-4 text-primary" />
                    </div>
                    <div>
                      <h3 className="text-base font-display font-semibold text-foreground">Detalhamento de Horas</h3>
                      <p className="text-xs text-muted-foreground">Clique para ver os projetos de cada membro</p>
                    </div>
                  </div>
                  <HoursDetailTable
                    data={showBelowTargetOnly ? belowTargetMembers : dashboardData.memberSummaries}
                    totalHours={dashboardData.totalHours}
                    individualTarget={individualTargetForPeriod}
                    businessDaysElapsed={businessDaysElapsed}
                    businessDaysRemaining={businessDaysRemaining}
                    dailyTargetHours={DAILY_TARGET_HOURS}
                    month={selectedMonth}
                    year={selectedYear}
                  />
                </section>

                {/* Evolução diária + distribuição */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <section className="bg-card rounded-xl border border-border p-6 shadow-sm">
                    <h3 className="text-base font-display font-semibold text-foreground mb-4">Evolução Diária</h3>
                    <DailyHoursChart data={dashboardData.dailyHours} dailyTarget={dailyChartTarget} />
                  </section>
                  <section className="bg-card rounded-xl border border-border p-6 shadow-sm">
                    <h3 className="text-base font-display font-semibold text-foreground mb-4">Distribuição por Atividade</h3>
                    <ActivityDistributionChart data={dashboardData.activityDistribution} />
                  </section>
                </div>

                {/* Resumo executivo */}
                <HoursExecutiveSummary
                  data={dashboardData}
                  previousMonthHours={previousMonthHours}
                  monthlyTarget={monthlyTarget}
                  hoursExpectedSoFar={hoursExpectedSoFar}
                  individualTargetForPeriod={individualTargetForPeriod}
                  activeMemberCount={activeMemberCount}
                  businessDaysRemaining={businessDaysRemaining}
                  month={selectedMonth}
                  year={selectedYear}
                />
              </>
            ) : (
              <div className="text-center py-20 space-y-6">
                <div className="mx-auto w-24 h-24 rounded-2xl bg-muted/50 flex items-center justify-center">
                  <BarChart3 className="w-12 h-12 text-muted-foreground/30" />
                </div>
                <div className="space-y-2">
                  <h2 className="text-xl font-display font-bold text-foreground">Nenhum dado encontrado</h2>
                  <p className="text-muted-foreground max-w-md mx-auto">
                    Importe a planilha do Asana em "Atualizar Dados" para visualizar os dados do período.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <footer className="border-t border-border bg-card/50 py-6 mt-6">
        <div className="container text-center text-sm text-muted-foreground">
          <a href="https://wolffescripes.com.br" target="_blank" rel="noopener noreferrer"
            className="hover:text-foreground transition-colors">
            Wolff e Scripes Advogados
          </a>
          {" "}&bull;{" "}Dashboard de Lançamento de Horas
        </div>
      </footer>
    </div>
  );
}
