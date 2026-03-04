import { useState, useMemo } from "react";
import { Clock, Calendar, User, Target, FolderOpen, CheckCircle, Upload, BarChart3 } from "lucide-react";
import { KPICard } from "@/components/dashboard/KPICard";
import { MonthSelector } from "@/components/dashboard/MonthSelector";
import { MonthProgressIndicator } from "@/components/dashboard/MonthProgressIndicator";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { HoursMemberChart } from "@/components/hours/HoursMemberChart";
import { HoursDetailTable } from "@/components/hours/HoursDetailTable";
import { DailyHoursChart } from "@/components/hours/DailyHoursChart";
import { ActivityDistributionChart } from "@/components/hours/ActivityDistributionChart";
import { HoursCSVImport } from "@/components/hours/HoursCSVImport";
import { HoursExecutiveSummary } from "@/components/hours/HoursExecutiveSummary";
import { useHoursData } from "@/hooks/use-hours-data";
import { getMonthProgress } from "@/lib/month-progress";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export default function HoursDashboard() {
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [memberFilter, setMemberFilter] = useState("all");
  const [projectFilter, setProjectFilter] = useState("all");
  const [activityFilter, setActivityFilter] = useState("all");
  const [showImport, setShowImport] = useState(false);

  const { dashboardData, isLoading, importCSV, previousMonthHours } = useHoursData(selectedMonth, selectedYear);

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

  // Avg hours/day variation (approximate: assume same business days)
  const avgHoursVariation = useMemo(() => {
    if (!dashboardData || !previousMonthHours || previousMonthHours === 0) return null;
    // Use same ratio as total hours since business days are similar
    return hoursVariation;
  }, [dashboardData, previousMonthHours, hoursVariation]);

  const handleImport = async (csvText: string) => {
    const success = await importCSV(csvText, selectedMonth, selectedYear);
    if (success) setShowImport(false);
  };

  // Filter count
  const activeFilterCount = [memberFilter, projectFilter, activityFilter].filter(f => f !== "all").length;

  const clearFilters = () => {
    setMemberFilter("all");
    setProjectFilter("all");
    setActivityFilter("all");
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <DashboardHeader activeTab="horas" />
        <div className="flex items-center justify-center py-32">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader activeTab="horas" />

      <main className="container py-8 space-y-6">
        {/* Executive Summary */}
        {dashboardData && (
          <HoursExecutiveSummary data={dashboardData} previousMonthHours={previousMonthHours} />
        )}

        {/* Month Progress */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <MonthProgressIndicator monthProgress={monthProgress} />
          {dashboardData && (
            <div className="flex items-center gap-4 bg-muted/30 rounded-lg px-4 py-2">
            <span className="text-sm font-semibold text-foreground" style={{ fontWeight: 600 }}>
                {dashboardData.totalHours.toFixed(1)}h lançadas
              </span>
              <div className="h-4 w-px bg-border" />
              <span className="text-sm font-semibold text-primary" style={{ fontWeight: 600 }}>
                {monthProgress.percentElapsed.toFixed(0)}% concluído
              </span>
            </div>
          )}
        </div>

        {/* KPI Cards */}
        <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <KPICard
            title="Total de Horas Lançadas"
            value={dashboardData ? `${dashboardData.totalHours.toFixed(1)}h` : "0h"}
            subtitle="Soma de todas as horas no período"
            variationPercent={hoursVariation}
            variation={hoursVariation === null ? "— vs. mês anterior" : undefined}
            icon={<Clock className="w-5 h-5 text-primary" />}
            delay={0}
            promoted
            tooltipText="Soma de todas as horas registradas no período selecionado"
          />
          <KPICard
            title="Média de Horas/Dia"
            value={dashboardData ? `${dashboardData.avgHoursPerDay.toFixed(1)}h` : "0h"}
            subtitle="Por dia útil do período"
            variationPercent={avgHoursVariation}
            variation={avgHoursVariation === null ? "— vs. mês anterior" : undefined}
            icon={<Calendar className="w-5 h-5 text-primary" />}
            delay={50}
            promoted
            tooltipText="Total de horas dividido pelo número de dias úteis com lançamento"
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
          <KPICard
            title="Horas Restantes no Mês"
            value={dashboardData ? `${dashboardData.hoursPerRemainingDay.toFixed(1)}h` : "0h"}
            subtitle={dashboardData && monthProgress.daysRemaining > 0
              ? `≈ ${(dashboardData.hoursPerRemainingDay / monthProgress.daysRemaining).toFixed(1)}h por dia útil restante`
              : "Sem dias úteis restantes"}
            icon={<Target className="w-5 h-5 text-muted-foreground" />}
            delay={150}
            tooltipText="Total de horas que faltam para atingir a meta mensal. O subtítulo mostra a média por dia útil restante."
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

        {/* Filters */}
        <section className="flex flex-wrap items-end gap-4 p-4 bg-card rounded-lg border border-border animate-fade-in">
          <div className="flex items-center gap-2 text-muted-foreground">
            <span className="text-sm font-medium">Filtros:</span>
            {activeFilterCount > 0 && (
              <Badge variant="secondary" className="text-xs bg-primary/10 text-primary border-primary/20">
                {activeFilterCount} filtro{activeFilterCount > 1 ? "s" : ""} ativo{activeFilterCount > 1 ? "s" : ""}
              </Badge>
            )}
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Membro do Time</label>
            <select
              value={memberFilter}
              onChange={(e) => setMemberFilter(e.target.value)}
              className={cn(
                "h-9 w-[200px] rounded-md border bg-background px-3 text-sm",
                memberFilter !== "all" ? "border-[#F97316] bg-[#F97316]/5" : "border-border"
              )}
            >
              <option value="all">Todos os membros</option>
              {dashboardData?.members.map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Projeto/Cliente</label>
            <select
              value={projectFilter}
              onChange={(e) => setProjectFilter(e.target.value)}
              className={cn(
                "h-9 w-[200px] rounded-md border bg-background px-3 text-sm",
                projectFilter !== "all" ? "border-[#F97316] bg-[#F97316]/5" : "border-border"
              )}
            >
              <option value="all">Todos os projetos</option>
              {dashboardData?.projects.map(p => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Tipo de Atividade</label>
            <select
              value={activityFilter}
              onChange={(e) => setActivityFilter(e.target.value)}
              className={cn(
                "h-9 w-[200px] rounded-md border bg-background px-3 text-sm",
                activityFilter !== "all" ? "border-[#F97316] bg-[#F97316]/5" : "border-border"
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
          <Button variant="outline" size="sm" onClick={() => setShowImport(true)} className="ml-auto">
            <Upload className="w-4 h-4 mr-2" />
            Importar CSV
          </Button>
        </section>

        {/* CSV Import Dialog */}
        {showImport && (
          <HoursCSVImport
            onImport={handleImport}
            onClose={() => setShowImport(false)}
            selectedMonth={selectedMonth}
            selectedYear={selectedYear}
          />
        )}

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
              <HoursMemberChart data={dashboardData.memberSummaries} />
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
              <HoursDetailTable data={dashboardData.memberSummaries} totalHours={dashboardData.totalHours} />
            </section>

            {/* Daily Evolution & Activity Distribution */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <section className="bg-card rounded-lg border border-border p-6 shadow-sm">
                <h2 className="text-xl font-display font-semibold text-foreground mb-4">
                  Evolução Diária de Horas
                </h2>
                <DailyHoursChart data={dashboardData.dailyHours} />
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
                Importe uma planilha CSV clicando em "Importar Dados" para visualizar os dados do período.
              </p>
            </div>
            <Button variant="outline" onClick={() => setShowImport(true)} className="mt-2">
              <Upload className="w-4 h-4 mr-2" />
              Importar Dados
            </Button>
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
