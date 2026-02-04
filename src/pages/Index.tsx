import { useState, useMemo, useEffect } from "react";
import { Clock, TrendingUp, AlertTriangle, Users } from "lucide-react";
import { parseCSVData, DashboardData, ClientData } from "@/lib/data-parser";
import { KPICard } from "@/components/dashboard/KPICard";
import { HoursChart } from "@/components/dashboard/HoursChart";
import { ClientFilter } from "@/components/dashboard/ClientFilter";
import { RiskTable } from "@/components/dashboard/RiskTable";
import asanaData from "@/data/asana-data.csv?raw";

const Index = () => {
  const [selectedClient, setSelectedClient] = useState<string>("all");
  const [selectedContract, setSelectedContract] = useState<string>("all");

  const dashboardData = useMemo<DashboardData>(() => {
    return parseCSVData(asanaData);
  }, []);

  const filteredData = useMemo<ClientData[]>(() => {
    let filtered = dashboardData.clients;

    if (selectedClient !== "all") {
      filtered = filtered.filter(c => c.project === selectedClient);
    }

    if (selectedContract === "MENSAL") {
      filtered = filtered.filter(c => c.horasMensal > 0);
    } else if (selectedContract === "OUTROS") {
      filtered = filtered.filter(c => c.horasOutros > 0);
    }

    return filtered;
  }, [dashboardData.clients, selectedClient, selectedContract]);

  const clientList = useMemo(() => {
    return dashboardData.clients.map(c => c.project);
  }, [dashboardData.clients]);

  const riskCount = useMemo(() => {
    return filteredData.filter(c => c.isRisk).length;
  }, [filteredData]);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container py-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h1 className="text-2xl md:text-3xl font-display font-bold text-foreground tracking-tight">
                Dashboard de Consumo de Horas
              </h1>
              <p className="text-muted-foreground mt-1">
                Análise comparativa: MENSAL vs ATO/TABELA
              </p>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Clock className="w-4 h-4" />
              <span>Dados atualizados em tempo real</span>
            </div>
          </div>
        </div>
      </header>

      <main className="container py-8 space-y-8">
        {/* KPI Cards */}
        <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <KPICard
            title="Total Horas MENSAL"
            value={`${dashboardData.totalMensal.toFixed(1)}h`}
            subtitle="Contratos fixos mensais"
            icon={<Clock className="w-5 h-5 text-primary" />}
            variant="accent"
            delay={0}
          />
          <KPICard
            title="Total Horas OUTROS"
            value={`${dashboardData.totalOutros.toFixed(1)}h`}
            subtitle="ATO + TABELA"
            icon={<TrendingUp className="w-5 h-5 text-muted-foreground" />}
            delay={50}
          />
          <KPICard
            title="Top Cliente MENSAL"
            value={dashboardData.topMensalClient || "—"}
            subtitle={`${dashboardData.topMensalHours.toFixed(1)}h consumidas`}
            icon={<Users className="w-5 h-5 text-muted-foreground" />}
            variant="highlight"
            delay={100}
          />
          <KPICard
            title="Diferença MENSAL vs OUTROS"
            value={`${dashboardData.percentDiff > 0 ? '+' : ''}${dashboardData.percentDiff}%`}
            subtitle={dashboardData.percentDiff > 0 ? "MENSAL consome mais" : "OUTROS consome mais"}
            icon={<AlertTriangle className="w-5 h-5 text-primary" />}
            delay={150}
          />
        </section>

        {/* Filters */}
        <section>
          <ClientFilter
            clients={clientList}
            selectedClient={selectedClient}
            onClientChange={setSelectedClient}
            contractTypes={["MENSAL", "OUTROS"]}
            selectedContract={selectedContract}
            onContractChange={setSelectedContract}
          />
        </section>

        {/* Main Chart */}
        <section className="bg-card rounded-lg border border-border p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl font-display font-semibold text-foreground">
                Consumo de Horas por Cliente
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                Ordenado do maior para o menor consumo total
              </p>
            </div>
            <div className="flex items-center gap-4 text-sm">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-primary" />
                <span className="text-muted-foreground">MENSAL</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-chart-outros" />
                <span className="text-muted-foreground">OUTROS</span>
              </div>
            </div>
          </div>
          <HoursChart data={filteredData} />
        </section>

        {/* Risk Table */}
        <section className="bg-card rounded-lg border border-border p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 rounded-lg bg-primary/10">
              <AlertTriangle className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="text-xl font-display font-semibold text-foreground">
                Clientes com Risco de Margem
              </h2>
              <p className="text-sm text-muted-foreground">
                MENSAL &gt; OUTROS — {riskCount} cliente{riskCount !== 1 ? 's' : ''} identificado{riskCount !== 1 ? 's' : ''}
              </p>
            </div>
          </div>
          <RiskTable data={filteredData} />
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-border bg-card/50 py-6">
        <div className="container text-center text-sm text-muted-foreground">
          Dashboard de Análise de Horas • Dados exportados do Asana
        </div>
      </footer>
    </div>
  );
};

export default Index;
