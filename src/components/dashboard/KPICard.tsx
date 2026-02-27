import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown } from "lucide-react";

interface KPICardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  variation?: string;
  variationPercent?: number | null; // positive = up, negative = down
  icon?: React.ReactNode;
  variant?: "default" | "accent" | "highlight";
  delay?: number;
}

export function KPICard({ 
  title, 
  value, 
  subtitle,
  variation,
  variationPercent,
  icon,
  variant = "default",
  delay = 0 
}: KPICardProps) {
  const hasVariation = variationPercent !== undefined && variationPercent !== null;

  return (
    <div 
      className={cn(
        "relative overflow-hidden rounded-lg p-6 shadow-sm transition-all duration-300 hover:shadow-md animate-fade-in",
        variant === "default" && "bg-card border border-border",
        variant === "accent" && "bg-primary text-primary-foreground",
        variant === "highlight" && "bg-card border-2 border-primary"
      )}
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <p className={cn(
            "text-sm font-medium uppercase tracking-wider",
            variant === "accent" ? "text-primary-foreground/80" : "text-muted-foreground"
          )}>
            {title}
          </p>
          <p className={cn(
            "text-3xl font-display font-bold tracking-tight",
            variant === "accent" ? "text-primary-foreground" : "text-foreground"
          )}>
            {value}
          </p>
          {subtitle && (
            <p className={cn(
              "text-sm",
              variant === "accent" ? "text-primary-foreground/70" : "text-muted-foreground"
            )}>
              {subtitle}
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
