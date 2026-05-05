import { useState, useRef, useCallback } from "react";
import { TrendingUp, TrendingDown, AlertTriangle, BarChart2, ChevronUp, Calendar } from "lucide-react";
import { DashboardData } from "@/lib/data-parser";
import { HoursChart } from "@/components/dashboard/HoursChart";
import { ClientValueTable, ClientValueTableHandle } from "@/components/dashboard/ClientValueTable";
import { MonthSelector } from "@/components/dashboard/MonthSelector";
import { ExecutiveSummary } from "@/components/dashboard/ExecutiveSummary";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { usePresentationMode } from "@/hooks/use-presentation-mode";
import { useMonthlySnapshots } from "@/hooks/use-monthly-snapshots";
import { useFilteredKPIs } from "@/hooks/useFilteredKPIs";
import { PresentationMode } from "@/components/dashboard/PresentationMode";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const MONTH_NAMES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

const MONTH_NAMES_DISPLAY = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

type AlertLevel = "overflow" | "risk" | "warning";

interface AlertChip {
  project: string;
  percent: number;
  level: AlertLevel;
}

interface DashboardProps {
  data: DashboardData;
}

function Variation({ value, label }: { value: number | null | undefined; label: string }) {
  if (value == null) return null;
  return (
    <div className="flex items-center gap-1 mt-1.5">
      {value >= 0
        ? <TrendingUp className="w-3 h-3 text-success-foreground shrink-0" />
        : <TrendingDown className="w-3 h-3 text-destructive shrink-0" />}
      <span className={cn("text-xs font-medium", value >= 0 ? "text-success-foreground" : "text-destructive")}>
        {value >= 0 ? "+" : ""}{value.toFixed(1)}% vs {label}
      </span>
    </div>
  );
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

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);

  const handleAlertClientClick = useCallback((clientName: string) => {
    tableRef.current?.scrollToClient(clientName);
  }, []);

  const projectedVariation = prevSnapshot && prevSnapshot.total_valor > 0
    ? ((projected - prevSnapshot.total_valor) / prevSnapshot.total_valor) * 100
    : null;

  const alertChips: AlertChip[] = data.clients
    .filter(c => c.creditUsage && c.creditUsage.percentualUsado >= 60)
    .map(c => {
      const pct = c.creditUsage!.percentualUsado;
      const level: AlertLevel = pct >= 100 ? "overflow" : pct >= 80 ? "risk" : "warning";
      return { project: c.project, percent: pct, level };
    })
    .sort((a, b) => {
      const order: Record<AlertLevel, number> = { overflow: 0, risk: 1, warning: 2 };
      return order[a.level] - order[b.level] || b.percent - a.percent;
    });

  const overflowCount = alertChips.filter(c => c.level === "overflow").length;
  const riskCount = alertChips.filter(c => c.level === "risk").length;
  const warningCount = alertChips.filter(c => c.level === "warning").length;
  const bannerLevel: AlertLevel = overflowCount > 0 ? "overflow" : riskCount > 0 ? "risk" : "warning";
  const bannerLabel =
    overflowCount > 0 ? `${overflowCount} cliente${overflowCount > 1 ? "s" : ""} estourou o crédito` :
    riskCount > 0    ? `${riskCount} cliente${riskCount > 1 ? "s" : ""} em risco de estouro` :
                       `${warningCount} cliente${warningCount > 1 ? "s" : ""} em atenção`;

  const chipStyles: Record<AlertLevel, string> = {
    overflow: "bg-destructive/10 border-destructive/40 text-destructive hover:bg-destructive/20",
    risk:     "bg-risk/10 border-risk/40 text-risk-foreground hover:bg-risk/20",
    warning:  "bg-warning/10 border-warning/40 text-warning-foreground hover:bg-warning/20",
  };
  const bannerBorder: Record<AlertLevel, string> = {
    overflow: "border-l-destructive",
    risk:     "border-l-risk",
    warning:  "border-l-warning",
  };
  const bannerTitleColor: Record<AlertLevel, string> = {
    overflow: "text-destructive",
    risk:     "text-risk-foreground",
    warning:  "text-warning-foreground",
  };

  const { percentElapsed, currentDay, totalDays, daysRemaining } = data.monthProgress;
  const currentMonthDisplay = MONTH_NAMES_DISPLAY[new Date().getMonth()];

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

      <main className="container py-5 space-y-3">

        {/* ── Hero metrics ── três números grandes + barra de progresso ── */}
        <section className="bg-gradient-to-br from-card to-primary/5 border border-border rounded-xl overflow-hidden shadow-sm">

          {/* Três métricas principais */}
          <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-border">

            <div className="px-6 py-5">
              <p className="text-xs uppercase tracking-widest text-muted-foreground font-semibold mb-2">
                Total horas
              </p>
              <p className="text-4xl font-display font-bold text-foreground leading-none">
                {filteredKPIs.totalHoras.toFixed(1)}
                <span className="text-2xl text-muted-foreground font-normal ml-1">h</span>
              </p>
              {selectedClient === "all" && (
                <Variation value={horasVariation} label={prevMonthName} />
              )}
            </div>

            <div className="px-6 py-5">
              <p className="text-xs uppercase tracking-widest text-muted-foreground font-semibold mb-2">
                Valor recorrente
              </p>
              <p className={cn(
                "text-4xl font-display font-bold leading-none",
                showValues ? "text-primary" : "text-foreground"
              )}>
                {showValues ? formatCurrency(filteredKPIs.totalValor) : "—"}
              </p>
              {showValues && selectedClient === "all" && (
                <Variation value={valorVariation} label={prevMonthName} />
              )}
            </div>

            <div className="px-6 py-5">
              <p className="text-xs uppercase tracking-widest text-muted-foreground font-semibold mb-2">
                Projeção fim do mês
              </p>
              <p className="text-4xl font-display font-bold text-foreground leading-none">
                {showValues ? formatCurrency(projected) : "—"}
              </p>
              {showValues && selectedClient === "all" && (
                <Variation value={projectedVariation} label={prevMonthName} />
              )}
            </div>

          </div>

          {/* Barra de progresso do mês — rodapé do hero */}
          <div className="border-t border-border bg-muted/20 px-6 py-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Calendar className="w-3.5 h-3.5" />
              <span className="font-medium">{currentMonthDisplay}</span>
            </div>
            <span className="text-xs text-muted-foreground">
              Dia <span className="font-semibold text-foreground">{currentDay}</span>/{totalDays}
            </span>
            <div className="flex-1 min-w-[80px] h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all duration-500"
                style={{ width: `${percentElapsed}%` }}
              />
            </div>
            <span className="text-xs font-bold text-primary">{percentElapsed.toFixed(0)}%</span>
            <span className="text-xs text-muted-foreground">{daysRemaining} dias restantes</span>
          </div>

        </section>

        {/* ── Alert banner ── só aparece quando há clientes em alerta ── */}
        {alertChips.length > 0 && (
          <section className={cn(
            "bg-card border-l-4 border border-border/60 rounded-lg px-5 py-3.5",
            bannerBorder[bannerLevel]
          )}>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <div className={cn(
                "flex items-center gap-1.5 text-sm font-semibold shrink-0",
                bannerTitleColor[bannerLevel]
              )}>
                <AlertTriangle className="w-4 h-4" />
                <span>{bannerLabel}</span>
              </div>
              <div className="h-4 w-px bg-border hidden sm:block" />
              {alertChips.slice(0, 9).map(chip => (
                <button
                  key={chip.project}
                  onClick={() => handleAlertClientClick(chip.project)}
                  className={cn(
                    "inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold",
                    "border transition-colors cursor-pointer",
                    chipStyles[chip.level]
                  )}
                >
                  {chip.project}
                  <span className="opacity-70">({chip.percent.toFixed(0)}%)</span>
                </button>
              ))}
              {alertChips.length > 9 && (
                <span className="text-xs text-muted-foreground">+{alertChips.length - 9} mais</span>
              )}
            </div>
          </section>
        )}

        {/* ── Filtros + toggle de gráfico ── */}
        <section className="flex flex-wrap items-center gap-3 px-4 py-2.5 bg-card rounded-lg border border-border">
          <select
            value={selectedClient}
            onChange={(e) => setSelectedClient(e.target.value)}
            className={cn(
              "h-8 w-full sm:w-[200px] rounded-md border bg-background px-3 text-sm",
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
          {selectedClient !== "all" && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelectedClient("all")}
              className="h-8 text-xs text-muted-foreground px-2"
            >
              Limpar filtro
            </Button>
          )}
          <div className="flex-1" />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowChart(v => !v)}
            className="h-8 text-xs text-muted-foreground hover:text-foreground"
          >
            {showChart
              ? <><ChevronUp className="w-3.5 h-3.5 mr-1" />Ocultar gráfico</>
              : <><BarChart2 className="w-3.5 h-3.5 mr-1" />Ver gráfico</>
            }
          </Button>
        </section>

        {/* ── Gráfico ── oculto por padrão ── */}
        {showChart && (
          <section className="bg-card rounded-xl border border-border p-6 shadow-sm animate-fade-in">
            <h2 className="text-base font-display font-semibold text-foreground mb-4">
              Horas por cliente — consumo vs. crédito disponível
            </h2>
            <HoursChart data={filteredData} showValues={showValues} />
          </section>
        )}

        {/* ── Tabela ── conteúdo principal ── */}
        <section className="bg-card rounded-xl border border-border overflow-hidden shadow-sm">
          <div className="px-6 py-4 border-b border-border bg-muted/20">
            <h2 className="text-base font-display font-semibold text-foreground">
              Clientes Recorrentes
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Clique em um cliente para ver o detalhamento por advogado
            </p>
          </div>
          <div className="p-6">
            <ClientValueTable
              ref={tableRef}
              data={filteredData}
              showValues={showValues}
              clientVariations={clientVariations}
            />
          </div>
        </section>

        {/* ── Resumo executivo ── disponível no fim ── */}
        <ExecutiveSummary
          data={data}
          previousMonthTotalValor={prevSnapshot?.total_valor ?? null}
          previousMonthTotalHoras={prevSnapshot?.total_horas ?? null}
          previousMonthName={prevSnapshot ? prevMonthName : null}
          showValues={showValues}
          defaultExpanded={false}
        />

      </main>

      <footer className="border-t border-border bg-card/50 py-6 mt-6">
        <div className="container text-center text-sm text-muted-foreground">
          <a
            href="https://wolffescripes.com.br"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-foreground transition-colors"
          >
            Wolff e Scripes Advogados
          </a>
          {" "}&bull;{" "}Dashboard de Clientes Recorrentes
        </div>
      </footer>
    </div>
  );
}

export default Dashboard;
