import { cn } from "@/lib/utils";
import { CreditUsage } from "@/lib/data-parser";
import { getRiskStyles } from "@/lib/month-progress";
import { TrendingUp } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

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
  const { percentualUsado, analysis } = creditUsage;
  
  // Sistema de cores por nível: <60% verde, 60-79% amarelo, 80-99% laranja, 100%+ vermelho
  const getBarColor = () => {
    if (percentualUsado >= 100) return "bg-destructive"; // Estouro
    if (percentualUsado >= 80) return "bg-orange-500"; // Risco
    if (percentualUsado >= 60) return "bg-amber-500"; // Atenção
    return "bg-emerald-500"; // OK
  };
  
  const getTextColor = () => {
    if (percentualUsado >= 100) return "text-destructive";
    if (percentualUsado >= 80) return "text-orange-600";
    if (percentualUsado >= 60) return "text-amber-600";
    return "text-emerald-600";
  };
  
  const riskLevel = analysis?.riskLevel || 'ok';
  const styles = getRiskStyles(riskLevel);

  if (compact) {
    const tooltipContent = analysis ? (
      <div className="space-y-1 text-xs">
        <div className="font-semibold flex items-center gap-1">
          <span>{styles.emoji}</span>
          <span>{styles.label}</span>
        </div>
        <div>Consumido: {percentualUsado.toFixed(1)}%</div>
        {analysis.percentElapsed > 0 && (
          <>
            <div>Mês decorrido: {analysis.percentElapsed.toFixed(1)}%</div>
            <div className="flex items-center gap-1">
              <TrendingUp className="w-3 h-3" />
              Ritmo: {analysis.consumptionRate.toFixed(2)}x
            </div>
            {analysis.projectedEndOfMonth > 0 && (
              <div className="pt-1 border-t border-border/50">
                Projeção: {analysis.projectedEndOfMonth.toFixed(0)}%
              </div>
            )}
          </>
        )}
      </div>
    ) : (
      <div className="text-xs">{percentualUsado.toFixed(1)}% consumido</div>
    );
    
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-2 cursor-help">
              <div className="w-20 h-2 bg-muted rounded-full overflow-hidden">
                <div 
                  className={cn("h-full transition-all duration-500", getBarColor())}
                  style={{ width: `${Math.min(percentualUsado, 100)}%` }}
                />
              </div>
              <span className={cn("text-xs font-medium w-12 text-right", getTextColor())}>
                {percentualUsado.toFixed(0)}%
              </span>
              {analysis?.isAheadOfSchedule && analysis.consumptionRate > 1.2 && (
                <TrendingUp className={cn("w-3 h-3", getTextColor())} />
              )}
            </div>
          </TooltipTrigger>
          <TooltipContent side="top" className="bg-popover border-border">
            {tooltipContent}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">
          Consumido: {formatCurrency(creditUsage.valorConsumido)} / {formatCurrency(creditUsage.valorCredito)}
        </span>
        <div className="flex items-center gap-2">
          {analysis?.isAheadOfSchedule && (
            <span className={cn("flex items-center gap-1 text-xs", getTextColor())}>
              <TrendingUp className="w-3 h-3" />
              {analysis.consumptionRate.toFixed(1)}x
            </span>
          )}
          <span className={cn("font-semibold", getTextColor())}>
            {percentualUsado.toFixed(1)}%
          </span>
        </div>
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
