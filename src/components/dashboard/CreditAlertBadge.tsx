import { cn } from "@/lib/utils";
import { ConsumptionAnalysis, getRiskStyles } from "@/lib/month-progress";
import { AlertTriangle, AlertCircle, TrendingUp, CheckCircle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface CreditAlertBadgeProps {
  analysis: ConsumptionAnalysis;
  showRate?: boolean;
  compact?: boolean;
}

export function CreditAlertBadge({ analysis, showRate = true, compact = false }: CreditAlertBadgeProps) {
  const styles = getRiskStyles(analysis.riskLevel);
  
  const getIcon = () => {
    switch (analysis.riskLevel) {
      case 'critical':
        return <AlertCircle className={cn("w-3.5 h-3.5", styles.textColor)} />;
      case 'risk':
        return <AlertTriangle className={cn("w-3.5 h-3.5", styles.textColor)} />;
      case 'attention':
        return <AlertTriangle className={cn("w-3.5 h-3.5", styles.textColor)} />;
      default:
        return <CheckCircle className={cn("w-3.5 h-3.5", styles.textColor)} />;
    }
  };
  
  const tooltipContent = (
    <div className="space-y-1 text-xs">
      <div className="font-semibold">{styles.label}</div>
      <div>Consumido: {analysis.percentConsumed.toFixed(1)}%</div>
      <div>Mês decorrido: {analysis.percentElapsed.toFixed(1)}%</div>
      <div>Ritmo: {analysis.consumptionRate.toFixed(2)}x</div>
      {analysis.projectedEndOfMonth > 0 && (
        <div className="pt-1 border-t border-border/50">
          Projeção fim do mês: {analysis.projectedEndOfMonth.toFixed(0)}%
        </div>
      )}
    </div>
  );
  
  if (compact) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className={cn(
              "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium border",
              styles.badgeClass
            )}>
              {getIcon()}
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
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className={cn(
            "inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium border",
            styles.badgeClass
          )}>
            {getIcon()}
            <span>{styles.label}</span>
            {showRate && analysis.isAheadOfSchedule && (
              <span className="flex items-center gap-0.5 ml-1 opacity-80">
                <TrendingUp className="w-3 h-3" />
                {analysis.consumptionRate.toFixed(1)}x
              </span>
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
