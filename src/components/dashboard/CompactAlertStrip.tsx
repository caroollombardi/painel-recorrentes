import { useState } from "react";
import { Calendar, AlertTriangle as AlertTriangleIcon } from "lucide-react";
import { ClientData } from "@/lib/data-parser";
import { MonthProgress } from "@/lib/month-progress";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface CompactAlertStripProps {
  clients: ClientData[];
  monthProgress: MonthProgress;
  onClientClick?: (clientName: string) => void;
}

type AlertLevel = "overflow" | "risk" | "warning";

interface AlertChip {
  client: ClientData;
  level: AlertLevel;
  percent: number;
}

const levelConfig: Record<AlertLevel, { emoji: string; bg: string; text: string; border: string; label: string }> = {
  overflow: {
    emoji: "🔥",
    bg: "bg-destructive/10",
    text: "text-destructive",
    border: "border-destructive/30",
    label: "Estouro de Crédito",
  },
  risk: {
    emoji: "⚠️",
    bg: "bg-risk/10",
    text: "text-risk-foreground",
    border: "border-risk/30",
    label: "Risco de Estouro",
  },
  warning: {
    emoji: "🔔",
    bg: "bg-warning/10",
    text: "text-warning-foreground",
    border: "border-warning/30",
    label: "Atenção Interna",
  },
};

export function CompactAlertStrip({ clients, monthProgress, onClientClick }: CompactAlertStripProps) {
  const [expanded, setExpanded] = useState(false);

  const chips: AlertChip[] = [];

  clients.forEach((c) => {
    if (!c.creditUsage) return;
    const pct = c.creditUsage.percentualUsado;
    if (pct >= 100) chips.push({ client: c, level: "overflow", percent: pct });
    else if (pct >= 80) chips.push({ client: c, level: "risk", percent: pct });
    else if (pct >= 60) chips.push({ client: c, level: "warning", percent: pct });
  });

  if (chips.length === 0) return null;

  const order: Record<AlertLevel, number> = { overflow: 0, risk: 1, warning: 2 };
  chips.sort((a, b) => order[a.level] - order[b.level] || b.percent - a.percent);

  const MAX_VISIBLE = 5;
  const visibleChips = expanded ? chips : chips.slice(0, MAX_VISIBLE);
  const remaining = chips.length - MAX_VISIBLE;

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex items-center gap-2 flex-wrap animate-fade-in">
        {visibleChips.map((chip) => {
          const config = levelConfig[chip.level];
          const cu = chip.client.creditUsage!;
          const formatCurrency = (v: number) =>
            new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

          return (
            <Tooltip key={chip.client.project}>
              <TooltipTrigger asChild>
                <button
                  onClick={() => onClientClick?.(chip.client.project)}
                  className={cn(
                    "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all",
                    "hover:shadow-md hover:scale-105 cursor-pointer",
                    config.bg,
                    config.text,
                    config.border
                  )}
                >
                  <AlertTriangleIcon className="w-3 h-3" />
                  <span className="truncate max-w-[120px]">{chip.client.project}</span>
                  <span className="opacity-80">({chip.percent.toFixed(0)}%)</span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-xs">
                <div className="space-y-1.5">
                  <p className="font-semibold">{config.label}: {chip.client.project}</p>
                  <p className="text-xs">
                    Cliente {chip.client.project} consumiu {chip.percent.toFixed(1)}% do crédito contratado.
                    {chip.level === "overflow" && " Estouro de crédito."}
                    {chip.level === "risk" && " Risco de estouro."}
                  </p>
                  <p className="text-xs">Valor consumido: {formatCurrency(cu.valorConsumido)} / {formatCurrency(cu.valorCredito)}</p>
                  {chip.level === "overflow" && (
                    <p className="text-xs font-medium">Faturamento adicional necessário.</p>
                  )}
                  {chip.level === "risk" && (
                    <p className="text-xs">Avaliar cobrança adicional ou ajuste de escopo.</p>
                  )}
                  <p className="text-xs flex items-center gap-1 opacity-70">
                    <Calendar className="w-3 h-3" />
                    {monthProgress.percentElapsed.toFixed(0)}% do mês decorrido (dia {monthProgress.currentDay}/{monthProgress.totalDays})
                  </p>
                </div>
              </TooltipContent>
            </Tooltip>
          );
        })}

        {!expanded && remaining > 0 && (
          <button
            onClick={() => setExpanded(true)}
            className="inline-flex items-center px-3 py-1.5 rounded-full text-xs font-medium border border-border bg-muted/50 text-muted-foreground hover:bg-muted transition-colors cursor-pointer"
          >
            +{remaining} mais
          </button>
        )}

        {expanded && chips.length > MAX_VISIBLE && (
          <button
            onClick={() => setExpanded(false)}
            className="inline-flex items-center px-3 py-1.5 rounded-full text-xs font-medium border border-border bg-muted/50 text-muted-foreground hover:bg-muted transition-colors cursor-pointer"
          >
            Mostrar menos
          </button>
        )}
      </div>
    </TooltipProvider>
  );
}
