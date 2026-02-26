import { ChevronLeft, ChevronRight, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";

interface MonthSelectorProps {
  currentMonth: number; // 0-11
  currentYear: number;
  onChange: (month: number, year: number) => void;
}

const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

export function MonthSelector({ currentMonth, currentYear, onChange }: MonthSelectorProps) {
  const now = new Date();
  const isCurrentMonth = currentMonth === now.getMonth() && currentYear === now.getFullYear();

  const goBack = () => {
    if (currentMonth === 0) {
      onChange(11, currentYear - 1);
    } else {
      onChange(currentMonth - 1, currentYear);
    }
  };

  const goForward = () => {
    // Don't go past current month
    if (isCurrentMonth) return;
    if (currentMonth === 11) {
      onChange(0, currentYear + 1);
    } else {
      onChange(currentMonth + 1, currentYear);
    }
  };

  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-muted-foreground">Período</label>
      <div className="flex items-center gap-1 bg-background border border-border rounded-lg px-2 py-1">
        <Calendar className="w-4 h-4 text-muted-foreground mr-1" />
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={goBack}>
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <span className="text-sm font-medium min-w-[120px] text-center">
          {MONTH_NAMES[currentMonth]} {currentYear}
        </span>
        <Button 
          variant="ghost" 
          size="icon" 
          className="h-7 w-7" 
          onClick={goForward}
          disabled={isCurrentMonth}
        >
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
