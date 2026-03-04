import { useState, useRef, useCallback } from "react";
import { Clock, Users, DollarSign, TrendingUp, AlertTriangle, Target } from "lucide-react";
import { DashboardData } from "@/lib/data-parser";
import { KPICard } from "@/components/dashboard/KPICard";
import { HoursChart } from "@/components/dashboard/HoursChart";
import { ClientValueTable, ClientValueTableHandle } from "@/components/dashboard/ClientValueTable";
import { CompactAlertStrip } from "@/components/dashboard/CompactAlertStrip";
import { MonthProgressIndicator } from "@/components/dashboard/MonthProgressIndicator";
import { MonthSelector } from "@/components/dashboard/MonthSelector";
import { ExecutiveSummary } from "@/components/dashboard/ExecutiveSummary";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { usePresentationMode } from "@/hooks/use-presentation-mode";
import { useMonthlySnapshots } from "@/hooks/use-monthly-snapshots";
import { useFilteredKPIs } from "@/hooks/useFilteredKPIs";
import { PresentationMode } from "@/components/dashboard/PresentationMode";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const MONTH_NAMES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

interface DashboardProps {
  data: DashboardData;
}

export function Dashboard({ data }: DashboardProps) {
  const [selectedClient, setSelectedClient] = useState<string>("all");
  const [showValues, setShowValues] = useState<boolean>(true);
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const presentation = usePresentationMode();
  const tableRef = useRef<ClientValueTableHandle>(null);
  const { getPreviousMonthSnapshot } = useMonthlySnapshots();

  const prevSnapshot = (() => {
    return getPreviousMonthSnapshot(selectedMonth, selectedYear);
  })();

  const prevMonthName = (() => {
    let pm = selectedMonth - 1;
    if (pm < 0) pm = 11;
    return MONTH_NAMES[pm];
  })();

  const { filteredData, filteredKPIs, clientList, horasVariation, valorVariation, clientVariations, projected } =
    useFilteredKPIs(data, selectedClient, prevSnapshot ?? null);

  const formatCurrency = (value: number) => {
    if (!showValues) return "—";
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  };

  const handleAlertClientClick = useCallback((clientName: string) => {
    tableRef.current?.scrollToClient(clientName);
  }, []);

  const topClientSubtitle = (() => {
    const tc = filteredData.find(c => c.project === filteredKPIs.topClient);
    if (!tc?.creditUsage) {
      return showValues
        ? `${formatCurrency(filteredKPIs.topClientValor)} (${filteredKPIs.topClientHours.toFixed(1)}h)`
        : `${filteredKPIs.topClientHours.toFixed(1)}h`;
    }
    const pct = tc.creditUsage.percentualUsado;
    return `${pct.toFixed(0)}% do crédito em ${data.monthProgress.currentDay}/${data.monthProgress.totalDays} dias`;
  })();

  const topClientTooltip = (() => {
    const tc = filteredData.find(c => c.project === filteredKPIs.topClient);
    if (!tc?.creditUsage) return null;
    const pct = tc.creditUsage.percentualUsado;
    const analysis = tc.creditUsage.analysis;
    let text = `${filteredKPIs.topClient}: ${pct.toFixed(0)}% do crédito consumido`;
    text += ` | ${filteredKPIs.topClientHours.toFixed(1)}h`;
    if (showValues) text += ` | ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(filteredKPIs.topClientValor)}`;
    if (analysis?.isAheadOfSchedule) {
      text += ` | Ritmo ${analysis.consumptionRate.toFixed(1)}x acima do esperado`;
      if (analysis.projectedEndOfMonth > 100) text += ` | Projeção: ${analysis.projectedEndOfMonth.toFixed(0)}%`;
    }
    return text;
  })();

  const projectedVariation = prevSnapshot && prevSnapshot.total_valor > 0
    ? ((projected - prevSnapshot.total_valor) / prevSnapshot.total_valor) * 100
    : null;

  // Filter state
  const activeFilterCount = (selectedClient !== "all" ? 1 : 0);

  if (presentation.isActive) {
    return (
      <PresentationMode
        data={data}
        currentSlide={presentation.currentSlide}
        slideCount={presentation.slideCount}
        onExit={presentation.toggle}
        previousMonthTotalValor={prevSnapshot?.total_valor ?? null}
        previousMonthTotalHoras={prevSnapshot?.total_horas ?? null}
        previousMonthName={prevMonthName}
      />
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader
        activeTab="recorrentes"
        showValues={showValues}
        onShowValuesChange={setShowValues}
        onPresentationToggle={presentation.toggle}
      />

      <main className="container py-8 space-y-6">
        <ExecutiveSummary
          data={data}
          previousMonthTotalValor={prevSnapshot?.total_valor ?? null}
          previousMonthTotalHoras={prevSnapshot?.total_horas ?? null}
          previousMonthName={prevSnapshot ? prevMonthName : null}
          showValues={showValues}
          defaultExpanded={false}
        />

        <MonthProgressIndicator monthProgress={data.monthProgress} />

        <CompactAlertStrip
          clients={data.clients}
          monthProgress={data.monthProgress}
          onClientClick={handleAlertClientClick}
        />

        {/* KPI Cards */}
        <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <KPICard
            title="Total Horas Recorrentes"
            value={`${filteredKPIs.totalHoras.toFixed(1)}h`}
            subtitle="Contratos fixos mensais"
            variationPercent={selectedClient === "all" ? horasVariation : undefined}
            icon={<Clock className="w-5 h-5 text-primary" />}
            delay={0}
            promoted
            tooltipText="Soma de todas as horas registradas em contratos recorrentes no período selecionado"
          />
          <KPICard
            title="Valor Total Recorrente"
            value={showValues ? formatCurrency(filteredKPIs.totalValor) : "—"}
            subtitle={showValues ? "Calculado pelo valor/hora de cada advogado" : "Valores ocultos"}
            variationPercent={selectedClient === "all" && showValues ? valorVariation : undefined}
            icon={<DollarSign className="w-5 h-5 text-primary" />}
            delay={50}
            promoted
            tooltipText="Soma dos valores calculados (horas × valor/hora) de todos os contratos recorrentes"
          />
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div>
                  <KPICard
                    title="Top Cliente"
                    value={filteredKPIs.topClient || "—"}
                    subtitle={topClientSubtitle}
                    icon={<Users className="w-5 h-5 text-muted-foreground" />}
                    variant="highlight"
                    delay={100}
                    promoted
                    tooltipText="Cliente recorrente com maior volume de horas consumidas no período"
                  />
                </div>
              </TooltipTrigger>
              {topClientTooltip && (
                <TooltipContent side="bottom" className="max-w-sm">
                  <p className="text-xs">{topClientTooltip}</p>
                </TooltipContent>
              )}
            </Tooltip>
          </TooltipProvider>
          <KPICard
            title="Média Valor/Hora"
            value={showValues ? formatCurrency(filteredKPIs.avgHourlyRate) : "—"}
            subtitle={showValues ? "Média ponderada por hora" : "Valores ocultos"}
            icon={<TrendingUp className="w-5 h-5 text-muted-foreground" />}
            delay={150}
            tooltipText="Valor total recorrente dividido pelo total de horas — média ponderada por advogado"
          />
          <KPICard
            title="Clientes em Alerta"
            value={`${filteredKPIs.clientsAtWarning + filteredKPIs.clientsAtCritical}`}
            subtitle={
              filteredKPIs.clientsAtOverflow > 0
                ? `🚨 ${filteredKPIs.clientsAtOverflow} estouro, ⚠️ ${filteredKPIs.clientsAtRisk} risco, 🔔 ${filteredKPIs.clientsAtWarning} atenção`
                : filteredKPIs.clientsAtRisk > 0
                  ? `⚠️ ${filteredKPIs.clientsAtRisk} risco, 🔔 ${filteredKPIs.clientsAtWarning} atenção`
                  : `🔔 ${filteredKPIs.clientsAtWarning} em atenção`
            }
            icon={<AlertTriangle className="w-5 h-5 text-primary" />}
            variant="accent"
            delay={200}
            tooltipText="Número de clientes com consumo de crédito acima de 60% (atenção), 80% (risco) ou 100% (estouro)"
          />
          {showValues && (
            <KPICard
              title="Projeção Mensal"
              value={formatCurrency(projected)}
              subtitle="Estimativa para fim do mês"
              variationPercent={selectedClient === "all" ? projectedVariation : undefined}
              icon={<Target className="w-5 h-5 text-primary" />}
              delay={250}
              tooltipText="Projeção do valor total recorrente para o fim do mês, baseada no ritmo de consumo atual"
            />
          )}
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
            <label className="text-xs text-muted-foreground">Cliente Recorrente</label>
            <select
              value={selectedClient}
              onChange={(e) => setSelectedClient(e.target.value)}
              className={cn(
                "h-9 w-[200px] rounded-md border bg-background px-3 text-sm",
                selectedClient !== "all" ? "border-[#F97316] bg-[#F97316]/5" : "border-border"
              )}
            >
              <option value="all">Todos os clientes</option>
              {clientList.map((client) => (
                <option key={client} value={client}>{client}</option>
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
              onClick={() => setSelectedClient("all")}
              className="text-muted-foreground hover:text-foreground text-xs"
            >
              Limpar filtros
            </Button>
          )}
        </section>

        {/* Hours Chart */}
        <section className="bg-card rounded-lg border border-border p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl font-display font-semibold text-foreground">
                Horas por Cliente Recorrente
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                Ordenado do maior para o menor consumo
              </p>
            </div>
          </div>
          <HoursChart data={filteredData} showValues={showValues} />
        </section>

        {/* Client Value Table */}
        <section className="bg-card rounded-lg border border-border p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 rounded-lg bg-primary/10">
              <DollarSign className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="text-xl font-display font-semibold text-foreground">
                Valor por Cliente Recorrente
              </h2>
              <p className="text-sm text-muted-foreground">
                Clique para ver os advogados que trabalham e seus valores/hora
              </p>
            </div>
          </div>
          <ClientValueTable
            ref={tableRef}
            data={filteredData}
            showValues={showValues}
            clientVariations={clientVariations}
          />
        </section>
      </main>

      <footer className="border-t border-border bg-card/50 py-6">
        <div className="container text-center text-sm text-muted-foreground">
          <a href="https://wolffescripes.com.br" target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors">Wolff e Scripes Advogados</a> • Dashboard de Clientes Recorrentes • <span className="text-muted-foreground/50">v1.0</span>
        </div>
      </footer>
    </div>
  );
}

export default Dashboard;
