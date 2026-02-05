import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Clock, Users, DollarSign, TrendingUp, AlertTriangle, Eye, EyeOff, Upload, UsersRound, LogOut, Settings } from "lucide-react";
import { DashboardData, ClientData } from "@/lib/data-parser";
import { generateTopClientPhrase } from "@/lib/month-progress";
import { KPICard } from "@/components/dashboard/KPICard";
import { HoursChart } from "@/components/dashboard/HoursChart";
import { ClientFilter } from "@/components/dashboard/ClientFilter";
import { ClientValueTable } from "@/components/dashboard/ClientValueTable";
import { EnhancedCreditWarningBanner } from "@/components/dashboard/EnhancedCreditWarningBanner";
import { MonthProgressIndicator } from "@/components/dashboard/MonthProgressIndicator";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import wsaLogo from "@/assets/wsa-logo.png";

interface DashboardProps {
  data: DashboardData;
}

export function Dashboard({ data }: DashboardProps) {
  const navigate = useNavigate();
  const { isAdmin, signOut, user } = useAuth();
  const [selectedClient, setSelectedClient] = useState<string>("all");
  const [showValues, setShowValues] = useState<boolean>(true);

  const filteredData = useMemo<ClientData[]>(() => {
    let filtered = data.clients;

    if (selectedClient !== "all") {
      filtered = filtered.filter(c => c.project === selectedClient);
    }

    return filtered;
  }, [data.clients, selectedClient]);

  const clientList = useMemo(() => {
    return data.clients.map(c => c.project);
  }, [data.clients]);

  const formatCurrency = (value: number) => {
    if (!showValues) return "—";
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  };

  const handleLogout = async () => {
    await signOut();
    navigate('/auth');
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header - Corporate left-aligned layout */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container py-4">
          {/* Top row: Logo left, user actions right */}
          <div className="flex items-center justify-between mb-4">
            <img 
              src={wsaLogo} 
              alt="Wolff e Scripes Advogados" 
              className="h-10 object-contain"
            />
            <div className="flex items-center gap-2">
              {isAdmin && (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => navigate('/admin')}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <Upload className="w-4 h-4 mr-2" />
                    Atualizar Dados
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => navigate('/users')}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <UsersRound className="w-4 h-4 mr-2" />
                    Usuários
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => navigate('/settings')}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <Settings className="w-4 h-4 mr-2" />
                    Configurações
                  </Button>
                </>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={handleLogout}
                className="text-muted-foreground hover:text-foreground"
              >
                <LogOut className="w-4 h-4 mr-2" />
                Sair
              </Button>
            </div>
          </div>
          
          {/* Title row */}
          <div className="mb-4">
            <h1 className="text-2xl md:text-3xl font-display font-bold tracking-tight">
              Análise <span style={{ color: '#FB7435' }}>Clientes Recorrentes</span>
            </h1>
            <p className="text-muted-foreground mt-1">
              Análise de horas e valores por advogado
            </p>
          </div>
          
          {/* Controls row */}
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pt-4 border-t border-border/50">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Clock className="w-4 h-4" />
                <span>Dados atualizados</span>
              </div>
              <div className="flex items-center gap-2 bg-muted/50 px-3 py-1.5 rounded-lg">
                {showValues ? (
                  <Eye className="w-4 h-4 text-muted-foreground" />
                ) : (
                  <EyeOff className="w-4 h-4 text-muted-foreground" />
                )}
                <Label htmlFor="show-values" className="text-sm text-muted-foreground cursor-pointer">
                  Exibir valores (R$)
                </Label>
                <Switch
                  id="show-values"
                  checked={showValues}
                  onCheckedChange={setShowValues}
                />
              </div>
            </div>
            <div className="text-sm text-muted-foreground">
              {user?.email}
            </div>
          </div>
        </div>
      </header>

      <main className="container py-8 space-y-8">
        {/* Month Progress Indicator */}
        <MonthProgressIndicator monthProgress={data.monthProgress} />
        
        {/* Enhanced Credit Warning Banner with 3 levels */}
        <EnhancedCreditWarningBanner 
          clientsAtWarning={data.clientsAtWarning}
          clientsAtRisk={data.clientsAtRisk}
          clientsAtOverflow={data.clientsAtOverflow}
          monthProgress={data.monthProgress}
        />

        {/* KPI Cards */}
        <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <KPICard
            title="Total Horas Recorrentes"
            value={`${data.totalHoras.toFixed(1)}h`}
            subtitle="Contratos fixos mensais"
            icon={<Clock className="w-5 h-5 text-primary" />}
            variant="accent"
            delay={0}
          />
          <KPICard
            title="Valor Total Recorrente"
            value={showValues ? formatCurrency(data.totalValor) : "—"}
            subtitle={showValues ? "Baseado na tabela de preços" : "Valores ocultos"}
            icon={<DollarSign className="w-5 h-5 text-primary" />}
            variant="accent"
            delay={50}
          />
          <KPICard
            title="Top Cliente"
            value={data.topClient || "—"}
            subtitle={
              data.topClient && data.clients.find(c => c.project === data.topClient)?.creditUsage
                ? generateTopClientPhrase(
                    data.topClient,
                    data.clients.find(c => c.project === data.topClient)?.creditUsage?.percentualUsado || 0,
                    data.topClientHours,
                    data.topClientValor,
                    data.monthProgress
                  )
                : showValues 
                  ? `${formatCurrency(data.topClientValor)} (${data.topClientHours.toFixed(1)}h)`
                  : `${data.topClientHours.toFixed(1)}h`
            }
            icon={<Users className="w-5 h-5 text-muted-foreground" />}
            variant="highlight"
            delay={100}
          />
          <KPICard
            title="Média Valor/Hora"
            value={showValues ? formatCurrency(data.avgHourlyRate) : "—"}
            subtitle={showValues ? "Média ponderada por hora" : "Valores ocultos"}
            icon={<TrendingUp className="w-5 h-5 text-muted-foreground" />}
            delay={150}
          />
          <KPICard
            title="Clientes em Alerta"
            value={`${data.clientsAtWarning + data.clientsAtCritical}`}
            subtitle={
              data.clientsAtOverflow > 0 
                ? `🚨 ${data.clientsAtOverflow} estouro, ⚠️ ${data.clientsAtRisk} risco, 🔔 ${data.clientsAtWarning} atenção`
                : data.clientsAtRisk > 0
                  ? `⚠️ ${data.clientsAtRisk} risco, 🔔 ${data.clientsAtWarning} atenção`
                  : `🔔 ${data.clientsAtWarning} em atenção`
            }
            icon={<AlertTriangle className="w-5 h-5 text-primary" />}
            variant={(data.clientsAtCritical > 0) ? "accent" : undefined}
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
                Clique para ver os advogados que trabalharam e seus valores/hora
              </p>
            </div>
          </div>
          <ClientValueTable data={filteredData} showValues={showValues} />
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-border bg-card/50 py-6">
        <div className="container text-center text-sm text-muted-foreground">
          Wolff e Scripes Advogados • Dashboard de Clientes Recorrentes
        </div>
      </footer>
    </div>
  );
}

export default Dashboard;
