import { cn } from "@/lib/utils";
import { CreditUsage } from "@/lib/data-parser";

interface CreditUsageBarProps {
  creditUsage: CreditUsage;
  compact?: boolean;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);
}

export function CreditUsageBar({ creditUsage, compact = false }: CreditUsageBarProps) {
  const { percentualUsado, isWarning, isCritical } = creditUsage;
  
  // Traffic light: <60% verde, 60-80% amarelo, >80% vermelho
  const getBarColor = () => {
    if (isCritical) return "bg-destructive"; // >80% - vermelho
    if (isWarning) return "bg-amber-500"; // 60-80% - amarelo
    return "bg-emerald-500"; // <60% - verde
  };
  
  const getTextColor = () => {
    if (isCritical) return "text-destructive"; // >80% - vermelho
    if (isWarning) return "text-amber-600"; // 60-80% - amarelo
    return "text-emerald-600"; // <60% - verde
  };

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        <div className="w-20 h-2 bg-muted rounded-full overflow-hidden">
          <div 
            className={cn("h-full transition-all duration-500", getBarColor())}
            style={{ width: `${Math.min(percentualUsado, 100)}%` }}
          />
        </div>
        <span className={cn("text-xs font-medium w-12 text-right", getTextColor())}>
          {percentualUsado.toFixed(0)}%
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">
          Consumido: {formatCurrency(creditUsage.valorConsumido)} / {formatCurrency(creditUsage.valorCredito)}
        </span>
        <span className={cn("font-semibold", getTextColor())}>
          {percentualUsado.toFixed(1)}%
        </span>
      </div>
      
      <div className="w-full h-3 bg-muted rounded-full overflow-hidden">
        <div 
          className={cn("h-full transition-all duration-500", getBarColor())}
          style={{ width: `${Math.min(percentualUsado, 100)}%` }}
        />
      </div>
      
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>Valor pago: {formatCurrency(creditUsage.valorPago)}</span>
        <span>Crédito: {formatCurrency(creditUsage.valorCredito)}</span>
      </div>
    </div>
  );
}
