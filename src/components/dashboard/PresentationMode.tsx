import { useEffect } from "react";
import { Clock, DollarSign, Users, TrendingUp, AlertTriangle, X, Monitor } from "lucide-react";
import { DashboardData } from "@/lib/data-parser";
import { generateTopClientPhrase } from "@/lib/month-progress";
import { KPICard } from "@/components/dashboard/KPICard";
import { HoursChart } from "@/components/dashboard/HoursChart";
import { ClientValueTable } from "@/components/dashboard/ClientValueTable";
import { EnhancedCreditWarningBanner } from "@/components/dashboard/EnhancedCreditWarningBanner";
import { MonthProgressIndicator } from "@/components/dashboard/MonthProgressIndicator";
import { Button } from "@/components/ui/button";
import wsaLogo from "@/assets/wsa-logo.png";
import { cn } from "@/lib/utils";

interface PresentationModeProps {
  data: DashboardData;
  currentSlide: number;
  slideCount: number;
  onExit: () => void;
}

function SlideIndicator({ current, total }: { current: number; total: number }) {
  const labels = ["Visão Executiva", "Consumo de Horas", "Valor por Cliente"];
  return (
    <div className="flex items-center gap-3">
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} className="flex items-center gap-2">
          <div
            className={cn(
              "h-2 rounded-full transition-all duration-500",
              i === current
                ? "w-8 bg-primary"
                : "w-2 bg-muted-foreground/30"
            )}
          />
          {i === current && (
            <span className="text-xs text-muted-foreground font-medium animate-fade-in">
              {labels[i]}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

function PresentationSlide({
  isActive,
  children,
}: {
  isActive: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "absolute inset-0 transition-all duration-700 ease-in-out",
        isActive
          ? "opacity-100 translate-x-0"
          : "opacity-0 translate-x-8 pointer-events-none"
      )}
    >
      {children}
    </div>
  );
}

export function PresentationMode({
  data,
  currentSlide,
  slideCount,
  onExit,
}: PresentationModeProps) {
  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);

  // Lock body scroll when in presentation mode
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      {/* Minimal top bar */}
      <header className="flex items-center justify-between px-6 py-3 bg-card/80 backdrop-blur-sm border-b border-border/50 shrink-0">
        <div className="flex items-center gap-4">
          <img
            src={wsaLogo}
            alt="WSA"
            className="h-7 object-contain"
          />
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Monitor className="w-4 h-4 text-primary" />
            <span className="font-medium" translate="no">Modo TV</span>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <SlideIndicator current={currentSlide} total={slideCount} />
          <Button
            variant="ghost"
            size="icon"
            onClick={onExit}
            className="text-muted-foreground hover:text-foreground h-8 w-8"
            title="Sair (ESC ou F)"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      </header>

      {/* Slide area */}
      <div className="flex-1 relative overflow-hidden">
        {/* Slide 1 – Visão Executiva */}
        <PresentationSlide isActive={currentSlide === 0}>
          <div className="h-full overflow-auto p-8 space-y-6">
            <div className="text-center mb-2">
              <h2 className="text-2xl font-display font-bold text-foreground">
                Visão <span className="text-primary">Executiva</span>
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                Resumo estratégico de clientes recorrentes
              </p>
            </div>

            <MonthProgressIndicator
              monthProgress={data.monthProgress}
              className="mx-auto max-w-2xl justify-center"
            />

            <EnhancedCreditWarningBanner
              clientsAtWarning={data.clientsAtWarning}
              clientsAtRisk={data.clientsAtRisk}
              clientsAtOverflow={data.clientsAtOverflow}
              monthProgress={data.monthProgress}
            />

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
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
                value="—"
                subtitle="Oculto no modo apresentação"
                icon={<DollarSign className="w-5 h-5 text-primary" />}
                variant="accent"
                delay={50}
              />
              <KPICard
                title="Top Cliente"
                value={data.topClient || "—"}
                subtitle={
                  data.topClient &&
                  data.clients.find((c) => c.project === data.topClient)
                    ?.creditUsage
                    ? generateTopClientPhrase(
                        data.topClient,
                        data.clients.find(
                          (c) => c.project === data.topClient
                        )?.creditUsage?.percentualUsado || 0,
                        data.topClientHours,
                        data.topClientValor,
                        data.monthProgress
                      )
                    : `${data.topClientHours.toFixed(1)}h`
                }
                icon={<Users className="w-5 h-5 text-muted-foreground" />}
                variant="highlight"
                delay={100}
              />
              <KPICard
                title="Média Valor/Hora"
                value="—"
                subtitle="Oculto no modo apresentação"
                icon={
                  <TrendingUp className="w-5 h-5 text-muted-foreground" />
                }
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
                icon={
                  <AlertTriangle className="w-5 h-5 text-primary" />
                }
                variant={
                  data.clientsAtCritical > 0 ? "accent" : undefined
                }
                delay={200}
              />
            </div>
          </div>
        </PresentationSlide>

        {/* Slide 2 – Consumo de Horas por Cliente */}
        <PresentationSlide isActive={currentSlide === 1}>
          <div className="h-full overflow-auto p-8">
            <div className="text-center mb-6">
              <h2 className="text-2xl font-display font-bold text-foreground">
                Consumo de <span className="text-primary">Horas</span> por Cliente
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                Ordenado do maior para o menor consumo
              </p>
            </div>

            <div className="bg-card rounded-lg border border-border p-6 shadow-sm max-w-6xl mx-auto">
              <HoursChart data={data.clients} showValues={false} />
            </div>
          </div>
        </PresentationSlide>

        {/* Slide 3 – Valor por Cliente Recorrente */}
        <PresentationSlide isActive={currentSlide === 2}>
          <div className="h-full overflow-auto p-8">
            <div className="text-center mb-6">
              <h2 className="text-2xl font-display font-bold text-foreground">
                Valor por <span className="text-primary">Cliente Recorrente</span>
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                Uso de crédito, horas consumidas e valor detalhado
              </p>
            </div>

            <div className="bg-card rounded-lg border border-border p-6 shadow-sm max-w-7xl mx-auto">
              <ClientValueTable data={data.clients} showValues={false} />
            </div>
          </div>
        </PresentationSlide>
      </div>

      {/* Progress bar at bottom */}
      <div className="h-1 bg-muted shrink-0">
        <div
          className="h-full bg-primary transition-all duration-700"
          style={{
            width: `${((currentSlide + 1) / slideCount) * 100}%`,
          }}
        />
      </div>
    </div>
  );
}
