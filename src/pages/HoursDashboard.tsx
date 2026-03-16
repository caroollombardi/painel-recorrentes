import { useState, useMemo, useCallback } from "react";
import { Clock, Calendar, User, Target, FolderOpen, CheckCircle, BarChart3, AlertTriangle, Download, Filter } from "lucide-react";
import { KPICard } from "@/components/dashboard/KPICard";
import { DashboardLoadingSkeleton } from "@/components/dashboard/DashboardSkeleton";
import { MonthSelector } from "@/components/dashboard/MonthSelector";
import { MonthProgressIndicator } from "@/components/dashboard/MonthProgressIndicator";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { HoursMemberChart } from "@/components/hours/HoursMemberChart";
import { HoursDetailTable } from "@/components/hours/HoursDetailTable";
import { DailyHoursChart } from "@/components/hours/DailyHoursChart";
import { ActivityDistributionChart } from "@/components/hours/ActivityDistributionChart";

import { HoursExecutiveSummary } from "@/components/hours/HoursExecutiveSummary";
import { useHoursData } from "@/hooks/use-hours-data";
import { getMonthProgress } from "@/lib/month-progress";
import { DAILY_TARGET_HOURS, DAILY_ALERT_THRESHOLD, TARGET_MEMBER_COUNT, getMemberDailyTarget, isExcludedMember } from "@/lib/hours-constants";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const MONTH_NAMES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

export default function HoursDashboard() {
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [memberFilter, setMemberFilter] = useState("all");
  const [projectFilter, setProjectFilter] = useState("all");
  const [activityFilter, setActivityFilter] = useState("all");
  

  const { dashboardData, isLoading, previousMonthHours } = useHoursData(selectedMonth, selectedYear);

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

    return {
      ...dashboardData,
      totalHours: Math.round(totalHours * 100) / 100,
    };
  }, [dashboardData, memberFilter, projectFilter, activityFilter]);

  const hoursVariation = useMemo(() => {
    if (!dashboardData || !previousMonthHours || previousMonthHours === 0) return null;
    return ((dashboardData.totalHours - previousMonthHours) / previousMonthHours) * 100;
  }, [dashboardData, previousMonthHours]);

  const avgHoursVariation = useMemo(() => {
    if (!dashboardData || !previousMonthHours || previousMonthHours === 0) return null;
    return hoursVariation;
  }, [dashboardData, previousMonthHours, hoursVariation]);




  const activeFilterCount = [memberFilter, projectFilter, activityFilter].filter(f => f !== "all").length;

  const clearFilters = () => {
    setMemberFilter("all");
    setProjectFilter("all");
    setActivityFilter("all");
  };

  // --- Meta calculations ---
  const activeMemberCount = memberFilter !== "all" ? 1 : TARGET_MEMBER_COUNT;
  const businessDaysInMonth = dashboardData?.businessDaysInMonth ?? 0;
  const businessDaysElapsed = dashboardData?.businessDaysElapsed ?? 0;
  const businessDaysRemaining = dashboardData?.businessDaysRemaining ?? 0;
  const totalHoursLaunched = dashboardData?.totalHours ?? 0;

  const monthlyTarget = businessDaysInMonth * DAILY_TARGET_HOURS * activeMemberCount;
  const hoursExpectedSoFar = businessDaysElapsed * DAILY_TARGET_HOURS * activeMemberCount;
  const hoursRemaining = Math.max(0, monthlyTarget - totalHoursLaunched);
  const hoursPerRemainingDayPerMember = businessDaysRemaining > 0 && activeMemberCount > 0
    ? hoursRemaining / businessDaysRemaining / activeMemberCount
    : 0;
  const progressPercent = monthlyTarget > 0 ? (totalHoursLaunched / monthlyTarget) * 100 : 0;
  const expectedProgressPercent = businessDaysInMonth > 0 ? (businessDaysElapsed / businessDaysInMonth) * 100 : 0;
  const needsAcceleration = hoursPerRemainingDayPerMember > DAILY_ALERT_THRESHOLD;

  // Daily target for the daily chart
  const dailyChartTarget = DAILY_TARGET_HOURS * activeMemberCount;

  // Avg hours/day meta comparison
  const avgDayMeta = DAILY_TARGET_HOURS * activeMemberCount;
  const avgHoursValue = dashboardData?.avgHoursPerDay ?? 0;
  const avgPerMember = activeMemberCount > 0 ? avgHoursValue / activeMemberCount : 0;
  const avgMetaRatio = avgDayMeta > 0 ? avgHoursValue / avgDayMeta : 0;
  const avgValueColor = avgMetaRatio >= 1 ? "text-success-foreground" : avgMetaRatio >= 0.8 ? "text-risk-foreground" : "text-destructive";

  // Individual target for member chart
  const individualTargetForPeriod = businessDaysElapsed * DAILY_TARGET_HOURS;

  // #1 - Progress bar risk color
  const progressRatio = expectedProgressPercent > 0 ? progressPercent / expectedProgressPercent : 1;
  const progressBarColor = progressRatio >= 1 ? "bg-success" : progressRatio >= 0.7 ? "bg-warning" : "bg-destructive";
  const progressBarTextColor = progressRatio >= 1 ? "text-success-foreground" : progressRatio >= 0.7 ? "text-warning-foreground" : "text-destructive";

  // #2 - Total hours expected context
  const expectedHoursColor = totalHoursLaunched >= hoursExpectedSoFar ? "text-success-foreground" : totalHoursLaunched >= hoursExpectedSoFar * 0.8 ? "text-warning-foreground" : "text-destructive";

  // #4 - Horas restantes humanized
  const hoursRemainingFormatted = hoursRemaining.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const currentPace = businessDaysElapsed > 0 ? totalHoursLaunched / businessDaysElapsed / activeMemberCount : 0;
  const projectedCompletion = monthlyTarget > 0 && currentPace > 0
    ? Math.min(100, (currentPace * businessDaysInMonth * activeMemberCount / monthlyTarget) * 100)
    : 0;

  // #10 - Filter result counts
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

  // #12 - Export CSV
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
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `horas_${MONTH_NAMES[selectedMonth]}_${selectedYear}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [dashboardData, memberFilter, projectFilter, activityFilter, activeFilterCount, selectedMonth, selectedYear]);

  // #10 - Quick filter: below target members
  const belowTargetMembers = useMemo(() => {
    if (!dashboardData || businessDaysElapsed <= 0) return [];
   return dashboardData.memberSummaries.filter(m => {
      if (isExcludedMember(m.name)) return false;
      const memberTarget = businessDaysElapsed * getMemberDailyTarget(m.name);
      return m.totalHours < memberTarget;
    });
  }, [dashboardData, businessDaysElapsed]);

  const [showBelowTargetOnly, setShowBelowTargetOnly] = useState(false);

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

      <main className="container py-8 space-y-6">
        {/* Executive Summary */}
        {dashboardData && (
          <HoursExecutiveSummary
            data={dashboardData}
            previousMonthHours={previousMonthHours}
            monthlyTarget={monthlyTarget}
            hoursExpectedSoFar={hoursExpectedSoFar}
            individualTargetForPeriod={individualTargetForPeriod}
            activeMemberCount={activeMemberCount}
            businessDaysRemaining={businessDaysRemaining}
          />
        )}

        {/* Month Progress - #1 risk colors */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <MonthProgressIndicator monthProgress={monthProgress} />
          {dashboardData && (
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-4 bg-muted/30 rounded-lg px-4 py-2 cursor-help">
                    <span className="text-sm font-semibold text-foreground" style={{ fontWeight: 600 }}>
                      {totalHoursLaunched.toFixed(1)}h lançadas
                    </span>
                    <div className="h-4 w-px bg-border" />
                    <span className={cn("text-sm font-semibold", progressBarTextColor)} style={{ fontWeight: 600 }}>
                      {progressPercent.toFixed(0)}% da meta
                    </span>
                    {/* Progress bar with risk color */}
                    <div className="relative w-32 h-2 bg-muted rounded-full overflow-visible">
                      <div
                        className={cn("h-full rounded-full transition-all duration-500", progressBarColor)}
                        style={{ width: `${Math.min(progressPercent, 100)}%` }}
                      />
                      {/* Expected position marker */}
                      <div
                        className="absolute top-1/2 -translate-y-1/2 w-0.5 h-4 bg-foreground/40 rounded-full"
                        style={{ left: `${Math.min(expectedProgressPercent, 100)}%` }}
                      />
                    </div>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-xs text-xs">
                  <p>Esperado até hoje: <strong>{expectedProgressPercent.toFixed(0)}%</strong> da meta ({hoursExpectedSoFar.toFixed(0)}h)</p>
                  <p>Realizado: <strong>{progressPercent.toFixed(0)}%</strong> ({totalHoursLaunched.toFixed(1)}h)</p>
                  <p className="mt-1">
                    {progressRatio >= 1 ? "✅ No ritmo ou à frente" : progressRatio >= 0.7 ? "⚠️ Atenção: abaixo do esperado" : "🚨 Risco: muito abaixo da meta"}
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>

        {/* KPI Cards */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* #2 - Total Horas with expected context */}
          <KPICard
            title="Total de Horas Lançadas"
            value={dashboardData ? `${totalHoursLaunched.toFixed(1)}h` : "0h"}
            subtitle={dashboardData ? `Esperado até hoje: ${hoursExpectedSoFar.toFixed(0)}h` : "Soma de todas as horas no período"}
            subtitleClassName={dashboardData ? expectedHoursColor : undefined}
            variationPercent={hoursVariation}
            variation={hoursVariation === null ? "— vs. mês anterior" : undefined}
            icon={<Clock className="w-5 h-5 text-primary" />}
            delay={0}
            promoted
            tooltipText={`Meta mensal: ${monthlyTarget.toFixed(0)}h. Pro-rata hoje: ${hoursExpectedSoFar.toFixed(0)}h (${businessDaysElapsed} de ${businessDaysInMonth} dias úteis). Realizado: ${totalHoursLaunched.toFixed(1)}h.`}
          />
          {/* #3 - Média horas/dia clarified */}
          <KPICard
            title="Média de Horas/Dia"
            value={dashboardData ? `${avgHoursValue.toFixed(1)}h / dia` : "0h"}
            subtitle={dashboardData
              ? `≈ ${avgPerMember.toFixed(1)}h por membro/dia (meta: ${DAILY_TARGET_HOURS}h)`
              : "Por dia útil do período"}
            subtitleClassName={avgPerMember >= DAILY_TARGET_HOURS ? "text-success-foreground" : "text-destructive"}
            variationPercent={avgHoursVariation}
            variation={avgHoursVariation === null ? "— vs. mês anterior" : undefined}
            icon={<Calendar className="w-5 h-5 text-primary" />}
            delay={50}
            promoted
            tooltipText={`Time todo: ${avgHoursValue.toFixed(1)}h/dia. Por membro: ${avgPerMember.toFixed(1)}h/dia. Meta individual: ${DAILY_TARGET_HOURS}h/dia.`}
            valueClassName={avgValueColor}
          />
          <KPICard
            title="Top Colaborador"
            value={dashboardData?.topContributor || "—"}
            subtitle={dashboardData ? `${dashboardData.topContributorHours.toFixed(1)}h lançadas` : ""}
            icon={<User className="w-5 h-5 text-muted-foreground" />}
            variant="highlight"
            delay={100}
            promoted
            tooltipText="Membro com maior volume de horas lançadas no período"
          />
          {/* #4 - Horas restantes humanized */}
          <KPICard
            title="Horas Restantes no Mês"
            value={dashboardData ? `${hoursRemainingFormatted}h` : "0h"}
            subtitle={dashboardData && businessDaysRemaining > 0
              ? `≈ ${hoursPerRemainingDayPerMember.toFixed(1)}h/dia × ${activeMemberCount} membro${activeMemberCount > 1 ? "s" : ""} × ${businessDaysRemaining} dias`
              : "Sem dias úteis restantes"}
            extraLine={dashboardData && currentPace > 0
              ? `No ritmo atual (${currentPace.toFixed(1)}h/dia), o time atingirá ${projectedCompletion.toFixed(0)}% da meta.`
              : undefined}
            extraLineClassName={projectedCompletion >= 90 ? "text-emerald-600" : projectedCompletion >= 70 ? "text-amber-600" : "text-destructive"}
            icon={needsAcceleration
              ? <AlertTriangle className="w-5 h-5 text-amber-500" />
              : <Target className="w-5 h-5 text-muted-foreground" />}
            delay={150}
            tooltipText={`Meta mensal: ${monthlyTarget.toFixed(0)}h (${businessDaysInMonth} dias × ${DAILY_TARGET_HOURS}h × ${activeMemberCount} membro${activeMemberCount > 1 ? "s" : ""}). Restam ${hoursRemainingFormatted}h.`}
            variant={needsAcceleration ? "accent" : "default"}
          />
          <KPICard
            title="Projetos Ativos"
            value={dashboardData ? `${dashboardData.activeProjects}` : "0"}
            subtitle="Com horas lançadas no período"
            icon={<FolderOpen className="w-5 h-5 text-primary" />}
            delay={200}
            tooltipText="Projetos distintos que receberam lançamento de horas no período"
          />
          <KPICard
            title="Taxa de Preenchimento"
            value={dashboardData ? `${dashboardData.fillRate.toFixed(0)}%` : "0%"}
            subtitle="Dias úteis com lançamento de horas"
            icon={<CheckCircle className="w-5 h-5 text-primary" />}
            variant={dashboardData && dashboardData.fillRate >= 80 ? "default" : "accent"}
            delay={250}
            tooltipText="Percentual de dias úteis do período com pelo menos um lançamento"
          />
        </section>

        {/* Filters - #10 result count, quick filter */}
        <section className="space-y-2">
          <div className="flex flex-wrap items-end gap-3 sm:gap-4 p-4 bg-card rounded-lg border border-border animate-fade-in">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Filter className="w-4 h-4" />
              <span className="text-sm font-medium">Filtros:</span>
              {activeFilterCount > 0 && (
                <Badge variant="secondary" className="text-xs bg-primary/10 text-primary border-primary/20">
                  {activeFilterCount}
                </Badge>
              )}
            </div>
            <div className="flex flex-col gap-1 w-full sm:w-auto">
              <label className="text-xs text-muted-foreground">Membro do Time</label>
              <select
                value={memberFilter}
                onChange={(e) => { setMemberFilter(e.target.value); setShowBelowTargetOnly(false); }}
                className={cn(
                  "h-9 w-full sm:w-[200px] rounded-md border bg-background px-3 text-sm",
                  memberFilter !== "all" ? "border-primary bg-primary/5" : "border-border"
                )}
              >
                <option value="all">Todos os membros</option>
                {dashboardData?.members.map(m => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1 w-full sm:w-auto">
              <label className="text-xs text-muted-foreground">Projeto/Cliente</label>
              <select
                value={projectFilter}
                onChange={(e) => setProjectFilter(e.target.value)}
                className={cn(
                  "h-9 w-full sm:w-[200px] rounded-md border bg-background px-3 text-sm",
                  projectFilter !== "all" ? "border-primary bg-primary/5" : "border-border"
                )}
              >
                <option value="all">Todos os projetos</option>
                {dashboardData?.projects.map(p => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1 w-full sm:w-auto">
              <label className="text-xs text-muted-foreground">Tipo de Atividade</label>
              <select
                value={activityFilter}
                onChange={(e) => setActivityFilter(e.target.value)}
                className={cn(
                  "h-9 w-full sm:w-[200px] rounded-md border bg-background px-3 text-sm",
                  activityFilter !== "all" ? "border-primary bg-primary/5" : "border-border"
                )}
              >
                <option value="all">Todas as atividades</option>
                {dashboardData?.activityTypes.map(a => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
            </div>
            <MonthSelector
              currentMonth={selectedMonth}
              currentYear={selectedYear}
              onChange={(m, y) => { setSelectedMonth(m); setSelectedYear(y); }}
            />
            {activeFilterCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearFilters}
                className="text-destructive hover:text-destructive/80 text-xs"
              >
                ✕ Limpar filtros
              </Button>
            )}
            <div className="ml-auto flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={exportCSV} disabled={!dashboardData}>
                <Download className="w-4 h-4 mr-2" />
                Exportar
              </Button>


            </div>
          </div>
          {/* Result count & quick filter chips */}
          {dashboardData && (
            <div className="flex items-center gap-3 px-4 flex-wrap">
              <span className="text-xs text-muted-foreground">
                Exibindo {filteredEntries} de {totalEntries} lançamentos — {MONTH_NAMES[selectedMonth]} {selectedYear}
              </span>
              {belowTargetMembers.length > 0 && memberFilter === "all" && (
                <button
                  onClick={() => setShowBelowTargetOnly(!showBelowTargetOnly)}
                  className={cn(
                    "text-xs px-3 py-1 rounded-full border transition-colors",
                    showBelowTargetOnly
                      ? "bg-destructive/10 border-destructive/30 text-destructive"
                      : "bg-muted border-border text-muted-foreground hover:border-primary/50"
                  )}
                >
                  ⚠ {belowTargetMembers.length} membro{belowTargetMembers.length > 1 ? "s" : ""} abaixo da meta
                </button>
              )}
            </div>
          )}
        </section>






        {dashboardData ? (
          <>
            {/* Hours by Member Chart */}
            <section className="bg-card rounded-lg border border-border p-6 shadow-sm">
              <div className="mb-4">
                <h2 className="text-xl font-display font-semibold text-foreground">
                  Horas por Membro do Time
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Ordenado do maior para o menor lançamento
                </p>
              </div>
              <HoursMemberChart
                data={showBelowTargetOnly ? belowTargetMembers : dashboardData.memberSummaries}
                individualTarget={individualTargetForPeriod}
                businessDaysElapsed={businessDaysElapsed}
                dailyTargetHours={DAILY_TARGET_HOURS}
              />
            </section>

            {/* Detail Table */}
            <section className="bg-card rounded-lg border border-border p-6 shadow-sm">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 rounded-lg bg-primary/10">
                  <Clock className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h2 className="text-xl font-display font-semibold text-foreground">
                    Detalhamento de Horas
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    Clique para ver os projetos de cada membro
                  </p>
                </div>
              </div>
              <HoursDetailTable
                data={showBelowTargetOnly ? belowTargetMembers : dashboardData.memberSummaries}
                totalHours={dashboardData.totalHours}
                individualTarget={individualTargetForPeriod}
                businessDaysElapsed={businessDaysElapsed}
                businessDaysRemaining={businessDaysRemaining}
                dailyTargetHours={DAILY_TARGET_HOURS}
              />
            </section>

            {/* Daily Evolution & Activity Distribution */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <section className="bg-card rounded-lg border border-border p-6 shadow-sm">
                <h2 className="text-xl font-display font-semibold text-foreground mb-4">
                  Evolução Diária de Horas
                </h2>
                <DailyHoursChart data={dashboardData.dailyHours} dailyTarget={dailyChartTarget} />
              </section>

              <section className="bg-card rounded-lg border border-border p-6 shadow-sm">
                <h2 className="text-xl font-display font-semibold text-foreground mb-4">
                  Distribuição por Tipo de Atividade
                </h2>
                <ActivityDistributionChart data={dashboardData.activityDistribution} />
              </section>
            </div>
          </>
        ) : (
          /* Enhanced Empty State */
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
      </main>

      <footer className="border-t border-border bg-card/50 py-6">
        <div className="container text-center text-sm text-muted-foreground">
          <a href="https://wolffescripes.com.br" target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors">Wolff e Scripes Advogados</a> • Dashboard de Lançamento de Horas • <span className="text-muted-foreground/50">v1.0</span>
        </div>
      </footer>
    </div>
  );
}
