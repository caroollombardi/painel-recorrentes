import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Clock, Users, DollarSign, TrendingUp, AlertTriangle, Eye, EyeOff, Upload, UsersRound, Settings, Monitor } from "lucide-react";
import { DashboardData, ClientData } from "@/lib/data-parser";
import { generateTopClientPhrase } from "@/lib/month-progress";
import { KPICard } from "@/components/dashboard/KPICard";
import { HoursChart } from "@/components/dashboard/HoursChart";
import { ClientValueTable, ClientValueTableHandle } from "@/components/dashboard/ClientValueTable";
import { EnhancedCreditWarningBanner } from "@/components/dashboard/EnhancedCreditWarningBanner";
import { MonthProgressIndicator } from "@/components/dashboard/MonthProgressIndicator";
import { MonthSelector } from "@/components/dashboard/MonthSelector";
import { UserProfileDropdown } from "@/components/dashboard/UserProfileDropdown";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/contexts/AuthContext";
import { usePresentationMode } from "@/hooks/use-presentation-mode";
import { PresentationMode } from "@/components/dashboard/PresentationMode";
import { cn } from "@/lib/utils";
import wsaLogo from "@/assets/wsa-logo.png";

interface DashboardProps {
  data: DashboardData;
}

export function Dashboard({ data }: DashboardProps) {
  const navigate = useNavigate();
  const { isAdmin, signOut, user, hasRole } = useAuth();
  const canAccessMetas = hasRole('socio') || hasRole('gestao');
  const [selectedClient, setSelectedClient] = useState<string>("all");
  const [showValues, setShowValues] = useState<boolean>(true);
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [isScrolled, setIsScrolled] = useState(false);
  const presentation = usePresentationMode();
  const tableRef = useRef<ClientValueTableHandle>(null);

  // Compact header on scroll
  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 40);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

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

  // Compute KPIs from filtered data
  const filteredKPIs = useMemo(() => {
    const clients = filteredData;
    const totalHoras = clients.reduce((sum, c) => sum + c.horasMensal, 0);
    const totalValor = clients.reduce((sum, c) => sum + c.valorMensal, 0);
    const avgHourlyRate = totalHoras > 0 ? totalValor / totalHoras : 0;

    let topClient = '';
    let topClientHours = 0;
    let topClientValor = 0;
    clients.forEach(c => {
      if (c.horasMensal > topClientHours) {
        topClientHours = c.horasMensal;
        topClientValor = c.valorMensal;
        topClient = c.project;
      }
    });

    let clientsAtWarning = 0;
    let clientsAtCritical = 0;
    let clientsAtRisk = 0;
    let clientsAtOverflow = 0;
    clients.forEach(c => {
      if (c.creditUsage) {
        const pct = c.creditUsage.percentualUsado;
        if (pct >= 100) { clientsAtOverflow++; clientsAtCritical++; }
        else if (pct >= 80) { clientsAtRisk++; clientsAtCritical++; }
        else if (pct >= 60) { clientsAtWarning++; }
      }
    });

    return { totalHoras, totalValor, avgHourlyRate, topClient, topClientHours, topClientValor, clientsAtWarning, clientsAtCritical, clientsAtRisk, clientsAtOverflow };
  }, [filteredData]);

  const formatCurrency = (value: number) => {
    if (!showValues) return "—";
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  };

  const handleLogout = async () => {
    await signOut();
    navigate('/auth');
  };

  const handleAlertClientClick = useCallback((clientName: string) => {
    tableRef.current?.scrollToClient(clientName);
  }, []);

  if (presentation.isActive) {
    return (
      <PresentationMode
        data={data}
        currentSlide={presentation.currentSlide}
        slideCount={presentation.slideCount}
        onExit={presentation.toggle}
      />
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header - compact on scroll */}
      <header className={cn(
        "border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10 transition-all duration-300",
      )}>
        <div className="container py-3">
          {/* Navbar row: Logo left, actions right */}
          <div className="flex items-center justify-between">
            <img 
              src={wsaLogo} 
              alt="Wolff e Scripes Advogados" 
              className={cn("object-contain transition-all duration-300", isScrolled ? "h-7" : "h-10")}
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
                    <span className="hidden md:inline">Atualizar Dados</span>
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => navigate('/users')}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <UsersRound className="w-4 h-4 mr-2" />
                    <span className="hidden md:inline">Usuários</span>
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => navigate('/settings')}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <Settings className="w-4 h-4 mr-2" />
                    <span className="hidden md:inline">Configurações</span>
                  </Button>
                </>
              )}
              {!isAdmin && canAccessMetas && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => navigate('/settings')}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <Settings className="w-4 h-4 mr-2" />
                  <span className="hidden md:inline">Configurações</span>
                </Button>
              )}

              {/* Toggle values */}
              <div className="flex items-center gap-2 bg-muted/50 px-3 py-1.5 rounded-lg">
                {showValues ? (
                  <Eye className="w-4 h-4 text-muted-foreground" />
                ) : (
                  <EyeOff className="w-4 h-4 text-muted-foreground" />
                )}
                <Label htmlFor="show-values" className="text-sm text-muted-foreground cursor-pointer hidden md:inline">
                  Exibir valores (R$)
                </Label>
                <Switch
                  id="show-values"
                  checked={showValues}
                  onCheckedChange={setShowValues}
                />
              </div>

              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={presentation.toggle}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <Monitor className="w-4 h-4 mr-2" />
                      <span className="hidden md:inline">Modo TV</span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Atalho: tecla <kbd className="px-1 py-0.5 bg-muted rounded text-xs font-mono">F</kbd></p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>

              {/* User Profile Dropdown */}
              <UserProfileDropdown email={user?.email || ''} onLogout={handleLogout} />
            </div>
          </div>
          
          {/* Title row - hidden when scrolled */}
          <div className={cn(
            "overflow-hidden transition-all duration-300",
            isScrolled ? "max-h-0 opacity-0 mt-0" : "max-h-24 opacity-100 mt-3"
          )}>
            <h1 className="text-2xl md:text-3xl font-display font-bold tracking-tight">
              Análise <span style={{ color: '#FB7435' }}>Clientes Recorrentes</span>
            </h1>
            <p className="text-muted-foreground mt-1">
              Análise de horas e valores por advogado
            </p>
          </div>
        </div>
      </header>

      <main className="container py-8 space-y-8">
        {/* Month Progress Indicator */}
        <MonthProgressIndicator monthProgress={data.monthProgress} />
        
        {/* Enhanced Credit Warning Banner */}
        <EnhancedCreditWarningBanner 
          clientsAtWarning={data.clientsAtWarning}
          clientsAtRisk={data.clientsAtRisk}
          clientsAtOverflow={data.clientsAtOverflow}
          monthProgress={data.monthProgress}
          clients={data.clients}
          onClientClick={handleAlertClientClick}
        />

        {/* KPI Cards */}
        <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <KPICard
            title="Total Horas Recorrentes"
            value={`${filteredKPIs.totalHoras.toFixed(1)}h`}
            subtitle="Contratos fixos mensais"
            icon={<Clock className="w-5 h-5 text-primary" />}
            variant="accent"
            delay={0}
          />
          <KPICard
            title="Valor Total Recorrente"
            value={showValues ? formatCurrency(filteredKPIs.totalValor) : "—"}
            subtitle={showValues ? "Calculado pelo valor/hora de cada advogado" : "Valores ocultos"}
            icon={<DollarSign className="w-5 h-5 text-primary" />}
            variant="accent"
            delay={50}
          />
          <KPICard
            title="Top Cliente"
            value={filteredKPIs.topClient || "—"}
            subtitle={
              filteredKPIs.topClient && filteredData.find(c => c.project === filteredKPIs.topClient)?.creditUsage
                ? generateTopClientPhrase(
                    filteredKPIs.topClient,
                    filteredData.find(c => c.project === filteredKPIs.topClient)?.creditUsage?.percentualUsado || 0,
                    filteredKPIs.topClientHours,
                    filteredKPIs.topClientValor,
                    data.monthProgress
                  )
                : showValues 
                  ? `${formatCurrency(filteredKPIs.topClientValor)} (${filteredKPIs.topClientHours.toFixed(1)}h)`
                  : `${filteredKPIs.topClientHours.toFixed(1)}h`
            }
            icon={<Users className="w-5 h-5 text-muted-foreground" />}
            variant="highlight"
            delay={100}
          />
          <KPICard
            title="Média Valor/Hora"
            value={showValues ? formatCurrency(filteredKPIs.avgHourlyRate) : "—"}
            subtitle={showValues ? "Média ponderada por hora" : "Valores ocultos"}
            icon={<TrendingUp className="w-5 h-5 text-muted-foreground" />}
            delay={150}
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
            variant={(filteredKPIs.clientsAtCritical > 0) ? "accent" : undefined}
            delay={200}
          />
        </section>

        {/* Filters with Month Selector */}
        <section className="flex flex-wrap items-end gap-4 p-4 bg-card rounded-lg border border-border animate-fade-in">
          <div className="flex items-center gap-2 text-muted-foreground">
            <span className="text-sm font-medium">Filtros:</span>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Cliente Recorrente</label>
            <select
              value={selectedClient}
              onChange={(e) => setSelectedClient(e.target.value)}
              className="h-9 w-[200px] rounded-md border border-border bg-background px-3 text-sm"
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
                Clique para ver os advogados que trabalham e seus valores/hora
              </p>
            </div>
          </div>
          <ClientValueTable ref={tableRef} data={filteredData} showValues={showValues} />
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
