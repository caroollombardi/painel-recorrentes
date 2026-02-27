import { TrendingUp, TrendingDown, Target } from "lucide-react";
import { MonthProgress } from "@/lib/month-progress";
import { cn } from "@/lib/utils";

interface RevenueProjectionProps {
  totalValorAtual: number;
  monthProgress: MonthProgress;
  previousMonthValor: number | null;
  metaMensal: number | null; // from Metas 2026
  showValues: boolean;
}

export function RevenueProjection({
  totalValorAtual,
  monthProgress,
  previousMonthValor,
  metaMensal,
  showValues,
}: RevenueProjectionProps) {
  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);

  // Projeção = (valor atual / % mês decorrido) * 100
  const projected = monthProgress.percentElapsed > 0
    ? (totalValorAtual / (monthProgress.percentElapsed / 100))
    : totalValorAtual;

  const projectedVariation = previousMonthValor && previousMonthValor > 0
    ? ((projected - previousMonthValor) / previousMonthValor) * 100
    : null;

  const metaPercent = metaMensal && metaMensal > 0
    ? (projected / metaMensal) * 100
    : null;

  if (!showValues) return null;

  return (
    <section className="bg-card rounded-lg border border-border p-5 shadow-sm animate-fade-in">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-primary/10">
            <Target className="w-5 h-5 text-primary" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground font-medium">Projeção para fim do mês</p>
            <p className="text-2xl font-display font-bold text-foreground">
              {formatCurrency(projected)}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-6">
          {projectedVariation !== null && (
            <div className="flex items-center gap-1.5">
              {projectedVariation >= 0 ? (
                <TrendingUp className="w-4 h-4 text-emerald-600" />
              ) : (
                <TrendingDown className="w-4 h-4 text-destructive" />
              )}
              <span className={cn(
                "text-sm font-semibold",
                projectedVariation >= 0 ? "text-emerald-600" : "text-destructive"
              )}>
                {projectedVariation >= 0 ? "↑" : "↓"} {Math.abs(projectedVariation).toFixed(1)}%
              </span>
              <span className="text-xs text-muted-foreground">vs. mês anterior</span>
            </div>
          )}

          {metaPercent !== null && (
            <div className="flex items-center gap-1.5 pl-4 border-l border-border">
              <span className={cn(
                "text-sm font-semibold",
                metaPercent >= 100 ? "text-emerald-600" : metaPercent >= 80 ? "text-amber-600" : "text-destructive"
              )}>
                {metaPercent.toFixed(0)}%
              </span>
              <span className="text-xs text-muted-foreground">da meta mensal</span>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
