import { Calendar, TrendingUp } from "lucide-react";
import { MonthProgress } from "@/lib/month-progress";
import { cn } from "@/lib/utils";

interface MonthProgressIndicatorProps {
  monthProgress: MonthProgress;
  className?: string;
}

export function MonthProgressIndicator({ monthProgress, className }: MonthProgressIndicatorProps) {
  const { currentDay, totalDays, percentElapsed, daysRemaining } = monthProgress;
  
  const monthNames = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
  ];
  
  const currentMonth = monthNames[new Date().getMonth()];
  
  return (
    <div className={cn("flex items-center gap-4 bg-muted/30 rounded-lg px-4 py-2", className)}>
      <div className="flex items-center gap-2">
        <Calendar className="w-4 h-4 text-muted-foreground" />
        <span className="text-sm font-medium text-foreground">
          {currentMonth}
        </span>
      </div>
      
      <div className="h-4 w-px bg-border" />
      
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Dia</span>
          <span className="text-sm font-semibold text-foreground">
            {currentDay}/{totalDays}
          </span>
        </div>
        
        <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
          <div 
            className="h-full bg-primary transition-all duration-500"
            style={{ width: `${percentElapsed}%` }}
          />
        </div>
        
        <span className="text-xs font-medium text-primary">
          {percentElapsed.toFixed(0)}%
        </span>
      </div>
      
      <div className="h-4 w-px bg-border" />
      
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <TrendingUp className="w-3 h-3" />
        <span>{daysRemaining} dias restantes</span>
      </div>
    </div>
  );
}
