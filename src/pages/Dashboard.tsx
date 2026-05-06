import { useState, useRef, useCallback } from "react";
import { TrendingUp, TrendingDown, AlertTriangle, BarChart2, ChevronUp, Calendar, Clock, Users, Download } from "lucide-react";
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
  lastUpdated?: Date | null;
}

function Variation({ value, label, white = false }: { value: number | null | undefined; label: string; white?: boolean }) {
  if (value == null) return null;
  const isUp = value >= 0;
  const textClass = white
    ? "text-white/75"
    : isUp ? "text-success-foreground" : "text-destructive";
  const iconClass = white ? "text-white/75" : isUp ? "text-success-foreground" : "text-destructive";
  return (
    <div className="flex items-center gap-1 mt-1.5">
      {isUp
        ? <TrendingUp className={cn("w-3 h-3 shrink-0", iconClass)} />
        : <TrendingDown className={cn("w-3 h-3 shrink-0", iconClass)} />}
      <span className={cn("text-xs font-medium", textClass)}>
        {isUp ? "+" : ""}{value.toFixed(1)}% vs {label}
      </span>
    </div>
  );
}

export function Dashboard({ data, lastUpdated }: DashboardProps) {
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

  const exportCSV = useCallback(() => {
    const MONTH_NAMES_PT = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
    const rows = data.clients
      .filter(c => c.valorMensal > 0)
      .map(c => {
        const pct = c.creditUsage?.percentualUsado ?? null;
        const status = !c.creditUsage ? "Avulso" : pct! >= 100 ? "Estouro" : pct! >= 80 ? "Risco" : pct! >= 60 ? "Atenção" : "Saudável";
        return [
          `"${c.project}"`,
          c.horasMensal.toFixed(1),
          c.valorMensal.toFixed(2),
          c.creditUsage?.valorPago.toFixed(2) ?? "",
          c.creditUsage?.valorCredito.toFixed(2) ?? "",
          pct != null ? pct.toFixed(1) : "",
          status,
        ].join(",");
      });
    const header = "Cliente,Horas,Valor Consumido,Valor Contrato,Crédito Total,% Crédito,Status";
    const now = new Date();
    const csv = [header, ...rows].join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `recorrentes_${MONTH_NAMES_PT[now.getMonth()]}_${now.getFullYear()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [data]);

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
  const alertCardBorder: Record<AlertLevel, string> = {
    overflow: "border-destructive/40",
    risk:     "border-risk/40",
    warning:  "border-warning/40",
  };
  const alertCardBg: Record<AlertLevel, string> = {
    overflow: "bg-destructive/5",
    risk:     "bg-risk/5",
    warning:  "bg-warning/5",
  };
  const alertTitleColor: Record<AlertLevel, string> = {
    overflow: "text-destructive",
    risk:     "text-risk-foreground",
    warning:  "text-warning-foreground",
  };

  const { percentElapsed, currentDay, totalDays, daysRemaining } = data.monthProgress;
  const currentMonthDisplay = MONTH_NAMES_DISPLAY[new Date().getMonth()];
  const recurringClientsCount = data.clients.filter(c => c.creditUsage !== null).length;
  const visibleClientCount = filteredData.filter(c => c.valorMensal > 0).length;

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

      <div className="container py-5">
        <div className="flex gap-5 items-start">

          {/* ── SIDEBAR (desktop only, sticky) ── */}
          <aside className="hidden lg:flex flex-col gap-3 w-72 xl:w-80 shrink-0 sticky top-[70px]">

            {/* Hero: Valor Recorrente */}
            <div className="rounded-xl p-5 shadow-md" style={{ background: "#FB7435" }}>
              <p className="text-[10px] uppercase tracking-widest text-white/70 font-bold mb-1.5">
                Valor Recorrente
              </p>
              <p className="text-[2rem] font-display font-bold text-white leading-none">
                {showValues ? formatCurrency(filteredKPIs.totalValor) : "—"}
              </p>
              {showValues && selectedClient === "all" && valorVariation != null && (
                <Variation value={valorVariation} label={prevMonthName} white />
              )}
            </div>

            {/* Horas + Clientes */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-card border border-border rounded-xl p-4">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                  <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">Horas</p>
                </div>
                <p className="text-2xl font-display font-bold text-foreground leading-none">
                  {filteredKPIs.totalHoras.toFixed(1)}
                  <span className="text-sm text-muted-foreground font-normal ml-0.5">h</span>
                </p>
                {selectedClient === "all" && (
                  <Variation value={horasVariation} label={prevMonthName} />
                )}
              </div>
              <div className="bg-card border border-border rounded-xl p-4">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <Users className="w-3.5 h-3.5 text-muted-foreground" />
                  <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">Clientes</p>
                </div>
                <p className="text-2xl font-display font-bold text-foreground leading-none">
                  {recurringClientsCount}
                </p>
                <p className="text-[10px] text-muted-foreground mt-1.5 font-medium uppercase tracking-widest">recorrentes</p>
              </div>
            </div>

            {/* Progresso do mês */}
            <div className="bg-card border border-border rounded-xl p-4">
              <div className="flex items-center justify-between mb-2.5">
                <div className="flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">{currentMonthDisplay}</span>
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
                Dia <span className="font-semibold text-foreground">{currentDay}</span>/{totalDays} &middot; {daysRemaining} dias restantes
              </p>
            </div>

            {/* Projeção */}
            <div className="bg-card border border-border rounded-xl p-4">
              <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest mb-1.5">Projeção fim do mês</p>
              <p className="text-xl font-display font-bold text-foreground leading-none">
                {showValues ? formatCurrency(projected) : "—"}
              </p>
              {showValues && selectedClient === "all" && (
                <Variation value={projectedVariation} label={prevMonthName} />
              )}
            </div>

            {/* Alertas */}
            {alertChips.length > 0 && (
              <div className={cn(
                "border rounded-xl p-4",
                alertCardBg[bannerLevel],
                alertCardBorder[bannerLevel]
              )}>
                <div className={cn("flex items-center gap-1.5 mb-2.5", alertTitleColor[bannerLevel])}>
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <p className="text-[10px] font-bold uppercase tracking-widest">{bannerLabel}</p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {alertChips.map(chip => (
                    <button
                      key={chip.project}
                      onClick={() => handleAlertClientClick(chip.project)}
                      className={cn(
                        "inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold border transition-colors cursor-pointer",
                        chipStyles[chip.level]
                      )}
                    >
                      {chip.project}
                      <span className="opacity-70">({chip.percent.toFixed(0)}%)</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Filtros */}
            <div className="bg-card border border-border rounded-xl p-4 space-y-2.5">
              <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">Filtros</p>
              <select
                value={selectedClient}
                onChange={(e) => setSelectedClient(e.target.value)}
                className={cn(
                  "w-full h-8 rounded-md border bg-background px-3 text-sm",
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
                  className="w-full h-7 text-xs text-muted-foreground"
                >
                  Limpar filtro
                </Button>
              )}
            </div>

            {/* Export + timestamp */}
            <div className="space-y-2">
              <Button
                variant="outline"
                size="sm"
                onClick={exportCSV}
                className="w-full h-8 text-xs"
              >
                <Download className="w-3.5 h-3.5 mr-1.5" />
                Exportar CSV
              </Button>
              {lastUpdated && (
                <p className="text-[10px] text-muted-foreground text-center leading-relaxed">
                  Atualizado em{" "}
                  {lastUpdated.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "2-digit" })}
                  {" "}às{" "}
                  {lastUpdated.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                </p>
              )}
            </div>

          </aside>

          {/* ── CONTEÚDO PRINCIPAL ── */}
          <div className="flex-1 min-w-0 space-y-4">

            {/* Mobile: KPIs empilhados (apenas em telas pequenas) */}
            <div className="lg:hidden space-y-3">
              <div className="rounded-xl p-5 shadow-md" style={{ background: "#FB7435" }}>
                <p className="text-[10px] uppercase tracking-widest text-white/70 font-bold mb-1.5">Valor Recorrente</p>
                <p className="text-3xl font-display font-bold text-white leading-none">
                  {showValues ? formatCurrency(filteredKPIs.totalValor) : "—"}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-card border border-border rounded-xl p-3">
                  <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest mb-1">Horas</p>
                  <p className="text-xl font-display font-bold">{filteredKPIs.totalHoras.toFixed(1)}<span className="text-sm text-muted-foreground ml-0.5">h</span></p>
                </div>
                <div className="bg-card border border-border rounded-xl p-3">
                  <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest mb-1">Projeção</p>
                  <p className="text-xl font-display font-bold leading-tight">{showValues ? formatCurrency(projected) : "—"}</p>
                </div>
              </div>
              <div className="bg-card border border-border rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-muted-foreground font-medium">{currentMonthDisplay} · Dia {currentDay}/{totalDays}</span>
                  <span className="text-xs font-bold text-primary">{percentElapsed.toFixed(0)}% decorrido</span>
                </div>
                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-primary rounded-full" style={{ width: `${percentElapsed}%` }} />
                </div>
              </div>
              {alertChips.length > 0 && (
                <div className={cn("border rounded-xl p-4", alertCardBg[bannerLevel], alertCardBorder[bannerLevel])}>
                  <div className={cn("flex items-center gap-1.5 mb-2", alertTitleColor[bannerLevel])}>
                    <AlertTriangle className="w-4 h-4" />
                    <span className="text-sm font-semibold">{bannerLabel}</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {alertChips.map(chip => (
                      <button
                        key={chip.project}
                        onClick={() => handleAlertClientClick(chip.project)}
                        className={cn("inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold border transition-colors", chipStyles[chip.level])}
                      >
                        {chip.project} <span className="opacity-70">({chip.percent.toFixed(0)}%)</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <select
                  value={selectedClient}
                  onChange={(e) => setSelectedClient(e.target.value)}
                  className={cn("h-8 flex-1 min-w-[140px] rounded-md border bg-background px-3 text-sm",
                    selectedClient !== "all" ? "border-primary" : "border-border")}
                >
                  <option value="all">Todos os clientes</option>
                  {clientList.map((client) => <option key={client} value={client}>{client}</option>)}
                </select>
                <MonthSelector
                  currentMonth={selectedMonth}
                  currentYear={selectedYear}
                  onChange={(m, y) => { setSelectedMonth(m); setSelectedYear(y); }}
                />
              </div>
            </div>

            {/* Cabeçalho da tabela + toggle de gráfico */}
            <div className="flex items-center justify-between">
              <h2 className="text-base font-display font-semibold text-foreground">
                Clientes Recorrentes
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  · {visibleClientCount} {visibleClientCount === 1 ? "cliente" : "clientes"}
                </span>
              </h2>
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
            </div>

            {/* Gráfico (oculto por padrão) */}
            {showChart && (
              <section className="bg-card rounded-xl border border-border p-6 shadow-sm">
                <h3 className="text-sm font-semibold text-foreground mb-4">
                  Horas por cliente — consumo vs. crédito disponível
                </h3>
                <HoursChart data={filteredData} showValues={showValues} />
              </section>
            )}

            {/* Tabela principal */}
            <section className="bg-card rounded-xl border border-border overflow-hidden shadow-sm">
              <div className="p-6">
                <ClientValueTable
                  ref={tableRef}
                  data={filteredData}
                  showValues={showValues}
                  clientVariations={clientVariations}
                />
              </div>
            </section>

            {/* Resumo executivo */}
            <ExecutiveSummary
              data={data}
              previousMonthTotalValor={prevSnapshot?.total_valor ?? null}
              previousMonthTotalHoras={prevSnapshot?.total_horas ?? null}
              previousMonthName={prevSnapshot ? prevMonthName : null}
              showValues={showValues}
              defaultExpanded={false}
            />

          </div>
        </div>
      </div>

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
