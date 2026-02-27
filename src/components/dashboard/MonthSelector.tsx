import { useState } from "react";
import { ChevronLeft, ChevronRight, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface MonthSelectorProps {
  currentMonth: number; // 0-11
  currentYear: number;
  onChange: (month: number, year: number) => void;
}

const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

const MONTH_SHORT = [
  'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
  'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'
];

export function MonthSelector({ currentMonth, currentYear, onChange }: MonthSelectorProps) {
  const now = new Date();
  const isCurrentMonth = currentMonth === now.getMonth() && currentYear === now.getFullYear();
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [pickerYear, setPickerYear] = useState(currentYear);

  const goBack = () => {
    if (currentMonth === 0) {
      onChange(11, currentYear - 1);
    } else {
      onChange(currentMonth - 1, currentYear);
    }
  };

  const goForward = () => {
    if (isCurrentMonth) return;
    if (currentMonth === 11) {
      onChange(0, currentYear + 1);
    } else {
      onChange(currentMonth + 1, currentYear);
    }
  };

  const selectMonth = (month: number) => {
    const isInFuture = pickerYear > now.getFullYear() || (pickerYear === now.getFullYear() && month > now.getMonth());
    if (isInFuture) return;
    onChange(month, pickerYear);
    setPopoverOpen(false);
  };

  const handleOpenChange = (open: boolean) => {
    setPopoverOpen(open);
    if (open) setPickerYear(currentYear);
  };

  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-muted-foreground">Período</label>
      <div className="flex items-center gap-1 bg-background border border-border rounded-lg px-2 py-1">
        <Calendar className="w-4 h-4 text-muted-foreground mr-1" />
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={goBack}>
          <ChevronLeft className="w-4 h-4" />
        </Button>
        
        <Popover open={popoverOpen} onOpenChange={handleOpenChange}>
          <PopoverTrigger asChild>
            <button className="text-sm font-medium min-w-[120px] text-center hover:text-primary transition-colors cursor-pointer rounded px-2 py-1 hover:bg-muted">
              {MONTH_NAMES[currentMonth]} {currentYear}
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-3" align="center">
            <div className="flex items-center justify-between mb-3">
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setPickerYear(y => y - 1)}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <span className="text-sm font-semibold">{pickerYear}</span>
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-7 w-7" 
                onClick={() => setPickerYear(y => y + 1)}
                disabled={pickerYear >= now.getFullYear()}
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {MONTH_SHORT.map((name, i) => {
                const isFuture = pickerYear > now.getFullYear() || (pickerYear === now.getFullYear() && i > now.getMonth());
                const isSelected = i === currentMonth && pickerYear === currentYear;
                return (
                  <button
                    key={i}
                    disabled={isFuture}
                    onClick={() => selectMonth(i)}
                    className={cn(
                      "text-sm py-1.5 px-2 rounded-md transition-colors",
                      isFuture && "opacity-30 cursor-not-allowed",
                      isSelected && "bg-primary text-primary-foreground font-semibold",
                      !isSelected && !isFuture && "hover:bg-muted cursor-pointer"
                    )}
                  >
                    {name}
                  </button>
                );
              })}
            </div>
          </PopoverContent>
        </Popover>

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