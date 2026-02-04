import { cn } from "@/lib/utils";

interface KPICardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: React.ReactNode;
  variant?: "default" | "accent" | "highlight";
  delay?: number;
}

export function KPICard({ 
  title, 
  value, 
  subtitle, 
  icon,
  variant = "default",
  delay = 0 
}: KPICardProps) {
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
