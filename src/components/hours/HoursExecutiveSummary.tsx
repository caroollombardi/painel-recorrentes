import { useState, useMemo } from "react";
import { ChevronDown, ChevronUp, FileText, AlertTriangle } from "lucide-react";
import { HoursDashboardData } from "@/hooks/use-hours-data";
import { DAILY_TARGET_HOURS } from "@/lib/hours-constants";
import { cn } from "@/lib/utils";

interface HoursExecutiveSummaryProps {
  data: HoursDashboardData;
  previousMonthHours: number | null;
  monthlyTarget?: number;
  hoursExpectedSoFar?: number;
  individualTargetForPeriod?: number;
  activeMemberCount?: number;
  businessDaysRemaining?: number;
}

const MONTH_NAMES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

export function HoursExecutiveSummary({ data, previousMonthHours, monthlyTarget = 0, hoursExpectedSoFar = 0, individualTargetForPeriod = 0, activeMemberCount = 0, businessDaysRemaining = 0 }: HoursExecutiveSummaryProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const currentMonthName = MONTH_NAMES[new Date().getMonth()];
  const memberCount = data.memberSummaries.length;

  const lines: string[] = [];
  const alerts: string[] = [];

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

  // #11 - Risk alert
  if (monthlyTarget > 0) {
    const currentPace = data.businessDaysElapsed > 0 ? data.totalHours / data.businessDaysElapsed : 0;
    const projectedTotal = currentPace * data.businessDaysInMonth;
    const projectedPercent = (projectedTotal / monthlyTarget) * 100;

    if (projectedPercent < 90) {
      alerts.push(`🚨 No ritmo atual, o time atingirá apenas ${projectedPercent.toFixed(0)}% da meta de ${currentMonthName}.`);
    }
  }

  // #11 - Members furthest from target
  const membersBelow = useMemo(() => {
    if (individualTargetForPeriod <= 0) return [];
    return data.memberSummaries
      .map(m => ({
        name: m.name,
        diff: m.totalHours - individualTargetForPeriod,
        needed: businessDaysRemaining > 0
          ? (individualTargetForPeriod + (data.businessDaysInMonth - data.businessDaysElapsed) * DAILY_TARGET_HOURS - m.totalHours) / businessDaysRemaining
          : 0,
      }))
      .filter(m => m.diff < 0)
      .sort((a, b) => a.diff - b.diff)
      .slice(0, 3);
  }, [data.memberSummaries, individualTargetForPeriod, businessDaysRemaining, data.businessDaysInMonth, data.businessDaysElapsed]);

  if (membersBelow.length > 0) {
    alerts.push(`Os ${membersBelow.length} membros mais distantes da meta: ${membersBelow.map(m => `${m.name} (${m.diff.toFixed(1)}h, precisa de ${m.needed.toFixed(1)}h/dia)`).join("; ")}.`);
  }

  // #11 - Best day of the week
  const bestDay = useMemo(() => {
    const dayTotals = [0, 0, 0, 0, 0, 0, 0];
    const dayCounts = [0, 0, 0, 0, 0, 0, 0];
    data.dailyHours.forEach(d => {
      const day = new Date(d.date + "T12:00:00").getDay();
      dayTotals[day] += d.hours;
      dayCounts[day]++;
    });
    const dayNames = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
    let bestIdx = 1, bestAvg = 0;
    for (let i = 1; i <= 5; i++) {
      const avg = dayCounts[i] > 0 ? dayTotals[i] / dayCounts[i] : 0;
      if (avg > bestAvg) { bestAvg = avg; bestIdx = i; }
    }
    return bestAvg > 0 ? `${dayNames[bestIdx]} (média: ${bestAvg.toFixed(1)}h)` : null;
  }, [data.dailyHours]);

  if (bestDay) {
    lines.push(`Melhor dia da semana para lançamentos: ${bestDay}.`);
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
          {alerts.length > 0 && (
            <span className="flex items-center gap-1 text-xs text-destructive font-medium">
              <AlertTriangle className="w-3 h-3" />
              {alerts.length} alerta{alerts.length > 1 ? "s" : ""}
            </span>
          )}
        </div>
        {isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
      </button>

      {isExpanded && (
        <div className="px-5 pb-4 space-y-3">
          {alerts.length > 0 && (
            <div className="p-3 rounded-md bg-destructive/5 border border-destructive/20 space-y-1">
              {alerts.map((alert, i) => (
                <p key={i} className="text-sm text-destructive font-medium">{alert}</p>
              ))}
            </div>
          )}
          <div className="border-l-4 border-primary pl-4 space-y-2 text-sm text-foreground/90 leading-relaxed">
            {lines.map((line, i) => <p key={i}>{line}</p>)}
          </div>
        </div>
      )}
    </div>
  );
}
