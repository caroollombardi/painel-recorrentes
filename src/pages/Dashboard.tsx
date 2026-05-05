import { useState, useRef, useCallback } from "react";
import { Clock, DollarSign, TrendingUp, AlertTriangle, Target, BarChart2, ChevronUp } from "lucide-react";
import { DashboardData } from "@/lib/data-parser";
import { KPICard } from "@/components/dashboard/KPICard";
import { HoursChart } from "@/components/dashboard/HoursChart";
import { ClientValueTable, ClientValueTableHandle } from "@/components/dashboard/ClientValueTable";
import { CompactAlertStrip } from "@/components/dashboard/CompactAlertStrip";
import { MonthProgressIndicator } from "@/components/dashboard/MonthProgressIndicator";
import { MonthSelector } from "@/components/dashboard/MonthSelector";
import { ExecutiveSummary } from "@/components/dashboard/ExecutiveSummary";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
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
  const [showChart, setShowChart] = useState(false);
  const presentation = usePresentationMode();
  const tableRef = useRef<ClientValueTableHandle>(null);
  const { getPreviousMonthSnapshot } = useMonthlySnapshots();

  const prevSnapshot = getPreviousMonthSnapshot(selectedMonth, selectedYear);

  const prevMonthName = (() => {
    let pm = selectedMonth - 1;
    if (pm < 0) pm = 11;
    return MONTH_NAMES[pm];
  })();

  const { filteredData, filteredKPIs, clientList, horasVariation, valorVariation, clientVariations, projected } =
    useFilteredKPIs(data, selectedClient, prevSnapshot ?? null);

  const formatCurrency = (value: number) => {
    if (!showValues) return "—";
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
  };

  const handleAlertClientClick = useCallback((clientName: string) => {
    tableRef.current?.scrollToClient(clientName);
  }, []);

  const projectedVariation = prevSnapshot && prevSnapshot.total_valor > 0
    ? ((projected - prevSnapshot.total_valor) / prevSnapshot.total_valor) * 100
    : null;

  const activeFilterCount = selectedClient !== "all" ? 1 : 0;

  const alertCount = data.clients.filter(
    c => c.creditUsage && c.creditUsage.percentualUsado >= 60
  ).length;

  const totalAlerting = filteredKPIs.clientsAtWarning + filteredKPIs.clientsAtCritical;

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

      <main className="container py-5 space-y-4">
        {/* Status bar: month progress + alert chips in one row */}
        <section className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <MonthProgressIndicator
            monthProgress={data.monthProgress}
            className="bg-transparent px-0 py-0"
          />
          {alertCount > 0 && (
            <>
              <div className="h-4 w-px bg-border hidden sm:block" />
              <CompactAlertStrip
                clients={data.clients}
                monthProgress={data.monthProgress}
                onClientClick={handleAlertClientClick}
              />
            </>
          )}
        </section>

        {/* KPI Cards — 4 cards, always above the fold on desktop */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KPICard
            title="Total Horas"
            value={`${filteredKPIs.totalHoras.toFixed(1)}h`}
            subtitle="Contratos recorrentes"
            variationPercent={selectedClient === "all" ? horasVariation : undefined}
            icon={<Clock className="w-5 h-5 text-primary" />}
            delay={0}
            promoted
            tooltipText="Soma de todas as horas registradas em contratos recorrentes no período selecionado"
          />
          <KPICard
            title="Valor Recorrente"
            value={showValues ? formatCurrency(filteredKPIs.totalValor) : "—"}
            subtitle={showValues ? "Horas × valor/hora" : "Valores ocultos"}
            variationPercent={selectedClient === "all" && showValues ? valorVariation : undefined}
            icon={<DollarSign className="w-5 h-5 text-primary" />}
            delay={50}
            promoted
            tooltipText="Soma dos valores calculados (horas × valor/hora) de todos os contratos recorrentes"
          />
          <KPICard
            title="Projeção Mensal"
            value={showValues ? formatCurrency(projected) : "—"}
            subtitle={showValues ? "Estimativa fim do mês" : "Valores ocultos"}
            variationPercent={selectedClient === "all" && showValues ? projectedVariation : undefined}
            icon={<Target className="w-5 h-5 text-primary" />}
            delay={100}
            tooltipText="Projeção do valor total para o fim do mês, baseada no ritmo de consumo atual"
          />
          <KPICard
            title="Clientes em Alerta"
            value={`${totalAlerting}`}
            subtitle={
              filteredKPIs.clientsAtOverflow > 0
                ? `🚨 ${filteredKPIs.clientsAtOverflow} estouro, ⚠️ ${filteredKPIs.clientsAtRisk} risco`
                : filteredKPIs.clientsAtRisk > 0
                  ? `⚠️ ${filteredKPIs.clientsAtRisk} risco, 🔔 ${filteredKPIs.clientsAtWarning} atenção`
                  : filteredKPIs.clientsAtWarning > 0
                    ? `🔔 ${filteredKPIs.clientsAtWarning} em atenção`
                    : "Tudo dentro do limite"
            }
            icon={<AlertTriangle className="w-5 h-5" />}
            variant={totalAlerting > 0 ? "accent" : "default"}
            delay={150}
            tooltipText="Clientes com consumo de crédito acima de 60% (atenção), 80% (risco) ou 100% (estouro)"
          />
        </section>

        {/* Filters + chart toggle in one bar */}
        <section className="flex flex-wrap items-center gap-3 px-4 py-3 bg-card rounded-lg border border-border animate-fade-in">
          <span className="text-sm font-medium text-muted-foreground shrink-0">Filtros:</span>
          {activeFilterCount > 0 && (
            <Badge variant="secondary" className="text-xs bg-primary/10 text-primary border-primary/20">
              {activeFilterCount} ativo
            </Badge>
          )}
          <select
            value={selectedClient}
            onChange={(e) => setSelectedClient(e.target.value)}
            className={cn(
              "h-9 w-full sm:w-[200px] rounded-md border bg-background px-3 text-sm",
              selectedClient !== "all" ? "border-primary bg-primary/5" : "border-border"
            )}
          >
            <option value="all">Todos os clientes</option>
            {clientList.map((client) => (
              <option key={client} value={client}>{client}</option>
            ))}
          </select>
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
              className="text-xs text-muted-foreground"
            >
              Limpar
            </Button>
          )}
          <div className="flex-1" />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowChart(v => !v)}
            className="text-muted-foreground hover:text-foreground shrink-0"
          >
            {showChart
              ? <><ChevronUp className="w-4 h-4 mr-1.5" />Ocultar gráfico</>
              : <><BarChart2 className="w-4 h-4 mr-1.5" />Ver gráfico</>
            }
          </Button>
        </section>

        {/* Chart — optional, toggled by user */}
        {showChart && (
          <section className="bg-card rounded-lg border border-border p-6 shadow-sm animate-fade-in">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-display font-semibold text-foreground">Horas por Cliente</h2>
                <p className="text-xs text-muted-foreground mt-0.5">Ordenado do maior para o menor consumo</p>
              </div>
            </div>
            <HoursChart data={filteredData} showValues={showValues} />
          </section>
        )}

        {/* Client table — main content */}
        <section className="bg-card rounded-lg border border-border p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 rounded-lg bg-primary/10">
              <DollarSign className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="text-xl font-display font-semibold text-foreground">
                Clientes Recorrentes
              </h2>
              <p className="text-sm text-muted-foreground">
                Clique para ver os advogados e seus valores/hora
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

        {/* Executive summary — disponível no fim para análise detalhada */}
        <ExecutiveSummary
          data={data}
          previousMonthTotalValor={prevSnapshot?.total_valor ?? null}
          previousMonthTotalHoras={prevSnapshot?.total_horas ?? null}
          previousMonthName={prevSnapshot ? prevMonthName : null}
          showValues={showValues}
          defaultExpanded={false}
        />
      </main>

      <footer className="border-t border-border bg-card/50 py-6">
        <div className="container text-center text-sm text-muted-foreground">
          <a href="https://wolffescripes.com.br" target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors">Wolff e Scripes Advogados</a>
          {" "}&bull;{" "}Dashboard de Clientes Recorrentes
        </div>
      </footer>
    </div>
  );
}

export default Dashboard;
