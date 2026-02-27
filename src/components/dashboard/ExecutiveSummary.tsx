import { useState } from "react";
import { ChevronDown, ChevronUp, FileText } from "lucide-react";
import { DashboardData, ClientData } from "@/lib/data-parser";
import { MonthProgress } from "@/lib/month-progress";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface ExecutiveSummaryProps {
  data: DashboardData;
  previousMonthTotalValor: number | null;
  previousMonthTotalHoras: number | null;
  previousMonthName: string | null;
  showValues: boolean;
  defaultExpanded?: boolean;
}

const MONTH_NAMES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

export function ExecutiveSummary({
  data,
  previousMonthTotalValor,
  previousMonthTotalHoras,
  previousMonthName,
  showValues,
  defaultExpanded = true,
}: ExecutiveSummaryProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);

  const currentMonthName = MONTH_NAMES[new Date().getMonth()];
  const clientCount = data.clients.filter(c => c.valorMensal > 0).length;

  // Overflow clients
  const overflowClients = data.clients.filter(
    c => c.creditUsage && c.creditUsage.percentualUsado >= 100
  );
  const riskClients = data.clients.filter(
    c => c.creditUsage && c.creditUsage.percentualUsado >= 80 && c.creditUsage.percentualUsado < 100
  );

  // Comparison
  const valorVariation = previousMonthTotalValor && previousMonthTotalValor > 0
    ? ((data.totalValor - previousMonthTotalValor) / previousMonthTotalValor) * 100
    : null;

  // Projection
  const projected = data.monthProgress.percentElapsed > 0
    ? (data.totalValor / (data.monthProgress.percentElapsed / 100))
    : data.totalValor;

  // Build summary lines
  const lines: string[] = [];

  // Opening line
  lines.push(
    `Em ${currentMonthName}, o escritório acumula ${data.totalHoras.toFixed(1)}h em ${clientCount} contratos recorrentes${showValues ? `, gerando ${formatCurrency(data.totalValor)}` : ""}.`
  );

  // Overflow warning
  if (overflowClients.length > 0) {
    const names = overflowClients.map(c => c.project).join(", ");
    lines.push(
      `⚠️ ${overflowClients.length} cliente${overflowClients.length !== 1 ? "s" : ""} em estouro de crédito (${names}), necessitando faturamento adicional.`
    );
  }

  // Risk warning
  if (riskClients.length > 0) {
    const names = riskClients.map(c => c.project).join(", ");
    lines.push(
      `${riskClients.length} cliente${riskClients.length !== 1 ? "s" : ""} em risco de estouro (${names}).`
    );
  }

  // Comparison with previous month
  if (valorVariation !== null && previousMonthName && showValues) {
    const direction = valorVariation >= 0 ? "aumento" : "redução";
    lines.push(
      `Em comparação com ${previousMonthName}, houve ${direction} de ${Math.abs(valorVariation).toFixed(1)}% no valor total.`
    );
  }

  // Projection
  if (showValues) {
    lines.push(
      `A projeção para o fim do mês é de ${formatCurrency(projected)}.`
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card shadow-sm overflow-hidden animate-fade-in">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-5 py-3 hover:bg-muted/30 transition-colors"
      >
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-primary" />
          <span className="text-sm font-semibold text-foreground">Resumo Executivo</span>
        </div>
        {isExpanded ? (
          <ChevronUp className="w-4 h-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        )}
      </button>

      {isExpanded && (
        <div className="px-5 pb-4 border-l-4 border-primary ml-4 mr-4 mb-4">
          <div className="space-y-2 text-sm text-foreground/90 leading-relaxed">
            {lines.map((line, i) => (
              <p key={i}>{line}</p>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
