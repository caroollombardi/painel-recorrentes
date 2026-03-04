import { useState } from "react";
import { ChevronDown, ChevronUp, FileText } from "lucide-react";
import { HoursDashboardData } from "@/hooks/use-hours-data";
import { cn } from "@/lib/utils";

interface HoursExecutiveSummaryProps {
  data: HoursDashboardData;
  previousMonthHours: number | null;
}

const MONTH_NAMES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

export function HoursExecutiveSummary({ data, previousMonthHours }: HoursExecutiveSummaryProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const currentMonthName = MONTH_NAMES[new Date().getMonth()];
  const memberCount = data.memberSummaries.length;
  const lines: string[] = [];

  lines.push(
    `Em ${currentMonthName}, o time acumula ${data.totalHours.toFixed(1)}h lançadas em ${data.activeProjects} projetos, com ${memberCount} membros ativos.`
  );

  if (data.topContributor) {
    lines.push(
      `O colaborador com mais horas é ${data.topContributor} (${data.topContributorHours.toFixed(1)}h).`
    );
  }

  lines.push(
    `A média diária é de ${data.avgHoursPerDay.toFixed(1)}h por dia útil, com taxa de preenchimento de ${data.fillRate.toFixed(0)}%.`
  );

  if (data.fillRate < 70) {
    lines.push(`⚠️ A taxa de preenchimento está abaixo de 70%. Incentive o time a registrar horas diariamente.`);
  }

  if (previousMonthHours && previousMonthHours > 0) {
    const variation = ((data.totalHours - previousMonthHours) / previousMonthHours) * 100;
    const direction = variation >= 0 ? "aumento" : "redução";
    lines.push(`Em comparação com o mês anterior, houve ${direction} de ${Math.abs(variation).toFixed(1)}% no total de horas.`);
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
        {isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
      </button>

      {isExpanded && (
        <div className="px-5 pb-4 border-l-4 border-primary ml-4 mr-4 mb-4">
          <div className="space-y-2 text-sm text-foreground/90 leading-relaxed">
            {lines.map((line, i) => <p key={i}>{line}</p>)}
          </div>
        </div>
      )}
    </div>
  );
}
