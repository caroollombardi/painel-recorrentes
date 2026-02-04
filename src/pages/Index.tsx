import { useState, useMemo } from "react";
import { Clock, Users, DollarSign, TrendingUp, AlertTriangle } from "lucide-react";
import { parseCSVData, DashboardData, ClientData } from "@/lib/data-parser";
import { KPICard } from "@/components/dashboard/KPICard";
import { HoursChart } from "@/components/dashboard/HoursChart";
import { ClientFilter } from "@/components/dashboard/ClientFilter";
import { ClientValueTable } from "@/components/dashboard/ClientValueTable";
import { CreditWarningBanner } from "@/components/dashboard/CreditWarningBanner";
import asanaData from "@/data/asana-data.csv?raw";

const Index = () => {
  const [selectedClient, setSelectedClient] = useState<string>("all");

  const dashboardData = useMemo<DashboardData>(() => {
    return parseCSVData(asanaData);
  }, []);

  const filteredData = useMemo<ClientData[]>(() => {
    let filtered = dashboardData.clients;

    if (selectedClient !== "all") {
      filtered = filtered.filter(c => c.project === selectedClient);
    }

    return filtered;
  }, [dashboardData.clients, selectedClient]);

  const clientList = useMemo(() => {
    return dashboardData.clients.map(c => c.project);
  }, [dashboardData.clients]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container py-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h1 className="text-2xl md:text-3xl font-display font-bold tracking-tight">
                Análise <span style={{ color: '#FB7435' }}>Clientes Recorrentes</span>
              </h1>
              <p className="text-muted-foreground mt-1">
                Análise de horas e valores por advogado
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
        {/* Credit Warning Banner */}
        <CreditWarningBanner 
          clientsAtWarning={dashboardData.clientsAtWarning}
          clientsAtCritical={dashboardData.clientsAtCritical}
        />

        {/* KPI Cards */}
        <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <KPICard
            title="Total Horas Recorrentes"
            value={`${dashboardData.totalHoras.toFixed(1)}h`}
            subtitle="Contratos fixos mensais"
            icon={<Clock className="w-5 h-5 text-primary" />}
            variant="accent"
            delay={0}
          />
          <KPICard
            title="Valor Total Recorrente"
            value={formatCurrency(dashboardData.totalValor)}
            subtitle="Baseado na tabela de preços"
            icon={<DollarSign className="w-5 h-5 text-primary" />}
            variant="accent"
            delay={50}
          />
          <KPICard
            title="Top Cliente"
            value={dashboardData.topClient || "—"}
            subtitle={`${formatCurrency(dashboardData.topClientValor)} (${dashboardData.topClientHours.toFixed(1)}h)`}
            icon={<Users className="w-5 h-5 text-muted-foreground" />}
            variant="highlight"
            delay={100}
          />
          <KPICard
            title="Média Valor/Hora"
            value={formatCurrency(dashboardData.avgHourlyRate)}
            subtitle="Média ponderada por hora"
            icon={<TrendingUp className="w-5 h-5 text-muted-foreground" />}
            delay={150}
          />
          <KPICard
            title="Clientes em Alerta"
            value={`${dashboardData.clientsAtWarning + dashboardData.clientsAtCritical}`}
            subtitle={`${dashboardData.clientsAtCritical} crítico${dashboardData.clientsAtCritical !== 1 ? 's' : ''}, ${dashboardData.clientsAtWarning} aviso${dashboardData.clientsAtWarning !== 1 ? 's' : ''}`}
            icon={<AlertTriangle className="w-5 h-5 text-primary" />}
            variant={(dashboardData.clientsAtCritical > 0) ? "accent" : undefined}
            delay={200}
          />
        </section>

        {/* Filters */}
        <section>
          <ClientFilter
            clients={clientList}
            selectedClient={selectedClient}
            onClientChange={setSelectedClient}
          />
        </section>

        {/* Main Chart */}
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
          <HoursChart data={filteredData} />
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
                Clique para ver os advogados que trabalharam e seus valores/hora
              </p>
            </div>
          </div>
          <ClientValueTable data={filteredData} />
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-border bg-card/50 py-6">
        <div className="container text-center text-sm text-muted-foreground">
          Dashboard de Análise Clientes Recorrentes • Dados exportados do Asana
        </div>
      </footer>
    </div>
  );
};

export default Index;
