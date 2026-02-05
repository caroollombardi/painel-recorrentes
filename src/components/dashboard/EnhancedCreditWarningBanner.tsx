import { AlertTriangle, AlertCircle, TrendingUp, Calendar } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { MonthProgress } from "@/lib/month-progress";

interface EnhancedCreditWarningBannerProps {
  clientsAtWarning: number;   // 60-79%
  clientsAtRisk: number;      // 80-99%
  clientsAtOverflow: number;  // 100%+
  monthProgress: MonthProgress;
}

export function EnhancedCreditWarningBanner({ 
  clientsAtWarning, 
  clientsAtRisk, 
  clientsAtOverflow,
  monthProgress 
}: EnhancedCreditWarningBannerProps) {
  const totalAlerts = clientsAtWarning + clientsAtRisk + clientsAtOverflow;
  
  if (totalAlerts === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      {/* Nível 3 - Estouro (100%+) - Vermelho crítico */}
      {clientsAtOverflow > 0 && (
        <Alert variant="destructive" className="border-destructive/50 bg-destructive/10">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle className="font-semibold flex items-center gap-2">
            🚨 Estouro de Pacote!
          </AlertTitle>
          <AlertDescription>
            <span className="font-semibold">{clientsAtOverflow} cliente{clientsAtOverflow !== 1 ? 's' : ''}</span> excedeu{clientsAtOverflow !== 1 ? 'ram' : ''} 100% do crédito mensal.
            <span className="block text-xs mt-1 opacity-80">
              Faturamento adicional necessário.
            </span>
          </AlertDescription>
        </Alert>
      )}
      
      {/* Nível 2 - Risco de estouro (80-99%) - Laranja/Vermelho */}
      {clientsAtRisk > 0 && (
        <Alert className="border-orange-500/50 bg-orange-500/10">
          <AlertTriangle className="h-4 w-4 text-orange-600" />
          <AlertTitle className="font-semibold text-orange-600 flex items-center gap-2">
            ⚠️ Risco de Estouro
          </AlertTitle>
          <AlertDescription className="text-foreground/80">
            <span className="font-semibold">{clientsAtRisk} cliente{clientsAtRisk !== 1 ? 's' : ''}</span> atingiu{clientsAtRisk !== 1 ? 'ram' : ''} 80% ou mais do crédito.
            <span className="block text-xs mt-1 opacity-80">
              Avaliar cobrança adicional ou ajuste de escopo.
            </span>
          </AlertDescription>
        </Alert>
      )}
      
      {/* Nível 1 - Atenção interna (60-79%) - Amarelo */}
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
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
