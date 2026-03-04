import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown, HelpCircle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";

interface KPICardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  subtitleClassName?: string;
  variation?: string;
  variationPercent?: number | null;
  icon?: React.ReactNode;
  variant?: "default" | "accent" | "highlight";
  delay?: number;
  promoted?: boolean;
  tooltipText?: string;
  valueClassName?: string;
  extraLine?: string;
  extraLineClassName?: string;
}

export function KPICard({ 
  title, 
  value, 
  subtitle,
  subtitleClassName,
  variation,
  variationPercent,
  icon,
  variant = "default",
  delay = 0,
  promoted = false,
  tooltipText,
  valueClassName,
  extraLine,
  extraLineClassName,
}: KPICardProps) {
  const hasVariation = variationPercent !== undefined && variationPercent !== null;

  return (
    <div 
      className={cn(
        "relative overflow-hidden rounded-lg p-6 shadow-sm transition-all duration-300 hover:shadow-md animate-fade-in",
        variant === "default" && "bg-card border border-border",
        variant === "accent" && "bg-primary text-primary-foreground",
        variant === "highlight" && "bg-card border-2 border-primary",
        promoted && variant !== "accent" && "bg-gradient-to-br from-card to-primary/5"
      )}
      style={{ animationDelay: `${delay}ms` }}
    >
      {/* Info tooltip */}
      {tooltipText && (
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button className="absolute top-3 right-3 w-5 h-5 flex items-center justify-center rounded-full border border-[#D1D5DB] hover:border-[#F97316] hover:bg-[#F97316]/5 transition-colors group">
                <HelpCircle className={cn(
                  "w-4 h-4 transition-colors",
                  variant === "accent" 
                    ? "text-primary-foreground/60 group-hover:text-primary-foreground" 
                    : "text-[#9CA3AF] group-hover:text-[#F97316]"
                )} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-xs text-xs">
              {tooltipText}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}

      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <p className={cn(
            "text-sm font-medium uppercase tracking-wider",
            variant === "accent" ? "text-primary-foreground/80" : "text-muted-foreground"
          )}>
            {title}
          </p>
          <p className={cn(
            "font-display font-bold tracking-tight",
            promoted ? "text-4xl" : "text-3xl",
            valueClassName
              ? valueClassName
              : variant === "accent" ? "text-primary-foreground" : "text-foreground"
          )}>
            {value}
          </p>
          {subtitle && (
            <p className={cn(
              "text-sm",
              subtitleClassName
                ? subtitleClassName
                : variant === "accent" ? "text-primary-foreground/70" : "text-muted-foreground"
            )}>
              {subtitle}
            </p>
          )}
          {extraLine && (
            <p className={cn(
              "text-xs font-medium",
              extraLineClassName || (variant === "accent" ? "text-primary-foreground/60" : "text-muted-foreground/80")
            )}>
              {extraLine}
            </p>
          )}
          {hasVariation && (
            <div className="flex items-center gap-1 mt-1">
              {variationPercent >= 0 ? (
                <TrendingUp className={cn("w-3 h-3", variant === "accent" ? "text-primary-foreground/70" : "text-emerald-600")} />
              ) : (
                <TrendingDown className={cn("w-3 h-3", variant === "accent" ? "text-primary-foreground/70" : "text-destructive")} />
              )}
              <span className={cn(
                "text-xs font-semibold",
                variant === "accent" 
                  ? "text-primary-foreground/70"
                  : variationPercent >= 0 ? "text-emerald-600" : "text-destructive"
              )}>
                {variationPercent >= 0 ? "↑" : "↓"} {Math.abs(variationPercent).toFixed(1)}%
              </span>
              <span className={cn(
                "text-xs",
                variant === "accent" ? "text-primary-foreground/50" : "text-muted-foreground/70"
              )}>
                vs. mês anterior
              </span>
            </div>
          )}
          {variation && !hasVariation && (
            <p className={cn(
              "text-xs mt-1",
              variant === "accent" ? "text-primary-foreground/50" : "text-muted-foreground/70"
            )}>
              {variation}
            </p>
          )}
        </div>
        {icon && (
          <div className={cn(
            "rounded-full p-3",
            variant === "accent" ? "bg-primary-foreground/10" : "bg-muted"
          )}>
            {icon}
          </div>
        )}
      </div>
    </div>
  );
}
