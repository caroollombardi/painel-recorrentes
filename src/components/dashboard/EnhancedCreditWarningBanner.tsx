import { AlertTriangle, AlertCircle, Calendar } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { MonthProgress } from "@/lib/month-progress";
import { ClientData } from "@/lib/data-parser";

interface EnhancedCreditWarningBannerProps {
  clientsAtWarning: number;
  clientsAtRisk: number;
  clientsAtOverflow: number;
  monthProgress: MonthProgress;
  clients?: ClientData[];
  onClientClick?: (clientName: string) => void;
}

export function EnhancedCreditWarningBanner({ 
  clientsAtWarning, 
  clientsAtRisk, 
  clientsAtOverflow,
  monthProgress,
  clients = [],
  onClientClick,
}: EnhancedCreditWarningBannerProps) {
  const totalAlerts = clientsAtWarning + clientsAtRisk + clientsAtOverflow;
  
  if (totalAlerts === 0) {
    return null;
  }

  const overflowClients = clients.filter(c => c.creditUsage && c.creditUsage.percentualUsado >= 100);
  const riskClients = clients.filter(c => c.creditUsage && c.creditUsage.percentualUsado >= 80 && c.creditUsage.percentualUsado < 100);
  const warningClients = clients.filter(c => c.creditUsage && c.creditUsage.percentualUsado >= 60 && c.creditUsage.percentualUsado < 80);

  const ClientList = ({ items }: { items: ClientData[] }) => {
    if (items.length === 0 || !onClientClick) return null;
    return (
      <div className="flex flex-wrap gap-1.5 mt-2">
        {items.map(c => (
          <button
            key={c.project}
            onClick={(e) => { e.stopPropagation(); onClientClick(c.project); }}
            className="text-xs px-2 py-0.5 rounded-full bg-background/50 border border-current/20 hover:bg-background/80 transition-colors cursor-pointer underline-offset-2 hover:underline"
          >
            {c.project} ({c.creditUsage?.percentualUsado.toFixed(0)}%)
          </button>
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-3">
      {clientsAtOverflow > 0 && (
        <Alert variant="destructive" className="border-destructive/50 bg-destructive/10">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle className="font-semibold flex items-center gap-2">
            🚨 Estouro de Crédito!
          </AlertTitle>
          <AlertDescription>
            <span className="font-semibold">{clientsAtOverflow} cliente{clientsAtOverflow !== 1 ? 's' : ''}</span> excedeu{clientsAtOverflow !== 1 ? 'ram' : ''} 100% do crédito mensal.
            <span className="block text-xs mt-1 opacity-80">
              Faturamento adicional necessário.
            </span>
            <ClientList items={overflowClients} />
          </AlertDescription>
        </Alert>
      )}
      
      {clientsAtRisk > 0 && (
        <Alert className="border-risk/50 bg-risk/10">
          <AlertTriangle className="h-4 w-4 text-risk-foreground" />
          <AlertTitle className="font-semibold text-risk-foreground flex items-center gap-2">
            ⚠️ Risco de Estouro
          </AlertTitle>
          <AlertDescription className="text-foreground/80">
            <span className="font-semibold">{clientsAtRisk} cliente{clientsAtRisk !== 1 ? 's' : ''}</span> atingiu{clientsAtRisk !== 1 ? 'ram' : ''} 80% ou mais do crédito.
            <span className="block text-xs mt-1 opacity-80">
              Avaliar cobrança adicional ou ajuste de escopo.
            </span>
            <ClientList items={riskClients} />
          </AlertDescription>
        </Alert>
      )}
      
      {clientsAtWarning > 0 && (
        <Alert className="border-amber-500/50 bg-amber-500/10">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <AlertTitle className="font-semibold text-amber-600 flex items-center gap-2">
            🔔 Atenção Interna
          </AlertTitle>
          <AlertDescription className="text-foreground/80">
            <span className="font-semibold">{clientsAtWarning} cliente{clientsAtWarning !== 1 ? 's' : ''}</span> atingiu{clientsAtWarning !== 1 ? 'ram' : ''} 60% do crédito mensal.
            <span className="flex items-center gap-1 text-xs mt-1 opacity-80">
              <Calendar className="w-3 h-3" />
              {monthProgress.percentElapsed.toFixed(0)}% do mês decorrido (dia {monthProgress.currentDay}/{monthProgress.totalDays})
            </span>
            <ClientList items={warningClients} />
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}