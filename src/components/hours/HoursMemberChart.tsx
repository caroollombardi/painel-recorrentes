import { useState } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, ReferenceLine } from "recharts";
import { MemberSummary } from "@/hooks/use-hours-data";
import { getMemberPeriodTarget, isExcludedMember } from "@/lib/hours-constants";

interface HoursMemberChartProps {
  data: MemberSummary[];
  individualTarget?: number;
  businessDaysElapsed?: number;
  dailyTargetHours?: number;
  month?: number;
  year?: number;
}

export function HoursMemberChart({ data, individualTarget, businessDaysElapsed = 0, dailyTargetHours = 6, month = new Date().getMonth(), year = new Date().getFullYear() }: HoursMemberChartProps) {
  const [expanded, setExpanded] = useState(false);
  const DEFAULT_LIMIT = 10;

  const chartData = data.map(m => {
    const excluded = isExcludedMember(m.name);
    const memberTarget = excluded ? undefined : (businessDaysElapsed > 0 ? getMemberPeriodTarget(m.name, businessDaysElapsed, month, year) : individualTarget);
    return {
      name: m.name,
      fullName: m.name,
      horas: m.totalHours,
      projects: m.projects.length,
      aboveMeta: excluded ? true : (memberTarget ? m.totalHours >= memberTarget : true),
      memberTarget,
      excluded,
    };
  });

  const visibleData = expanded ? chartData : chartData.slice(0, DEFAULT_LIMIT);
  const barHeight = 32;
  const chartHeight = Math.max(300, visibleData.length * barHeight + 80);

  const targetLabel = individualTarget && businessDaysElapsed > 0
    ? `Meta: ${individualTarget.toFixed(0)}h (${dailyTargetHours}h × ${businessDaysElapsed} dias)`
    : individualTarget ? `Meta: ${individualTarget.toFixed(0)}h` : "";

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload?.length) {
      const d = payload[0].payload;
      const diff = d.memberTarget ? d.horas - d.memberTarget : null;
      return (
        <div className="bg-card border border-border rounded-lg p-4 shadow-lg">
          <p className="font-display font-semibold text-foreground mb-1">{d.fullName}</p>
          <p className="text-sm text-muted-foreground">{d.horas.toFixed(1)}h • {d.projects} projeto{d.projects !== 1 ? "s" : ""}</p>
          {diff !== null && (
            <p className={`text-sm font-semibold mt-1 ${diff >= 0 ? "text-success-foreground" : "text-destructive"}`}>
              {diff >= 0 ? "+" : ""}{diff.toFixed(1)}h vs. meta
            </p>
          )}
        </div>
      );
    }
    return null;
  };

  if (data.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground text-sm">
        Nenhum dado disponível para o período selecionado.
      </div>
    );
  }

  return (
    <div className="w-full animate-fade-in" style={{ animationDelay: "300ms" }}>
      <div style={{ height: `${chartHeight}px` }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={visibleData} layout="vertical" margin={{ top: 10, right: 30, left: 120, bottom: 10 }}>
            <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
            <YAxis type="category" dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} width={160} tick={{ fontSize: 11, width: 155 }} />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: "hsl(var(--muted) / 0.5)" }} />
            {individualTarget && individualTarget > 0 && (
              <ReferenceLine
                x={individualTarget}
                stroke="hsl(var(--muted-foreground))"
                strokeDasharray="5 5"
              />
            )}
            <Bar dataKey="horas" radius={[0, 4, 4, 0]} maxBarSize={20}>
              {visibleData.map((entry, i) => (
                <Cell
                  key={i}
                  fill={
                    entry.aboveMeta
                      ? (i < 3 ? "hsl(var(--primary))" : "hsl(var(--primary) / 0.7)")
                      : "hsl(0 70% 60% / 0.5)"
                  }
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      {/* Legend */}
      <div className="flex items-center justify-center gap-6 mt-2 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-primary" />
          <span className="text-xs text-muted-foreground">Acima da meta</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: "hsl(0 70% 60% / 0.5)" }} />
          <span className="text-xs text-muted-foreground">Abaixo da meta</span>
        </div>
        {individualTarget && individualTarget > 0 && (
          <div className="flex items-center gap-2">
            <div className="w-6 border-t-2 border-dashed border-muted-foreground" />
            <span className="text-xs text-muted-foreground">Meta padrão ({individualTarget.toFixed(0)}h — {dailyTargetHours}h × {businessDaysElapsed} dias). Metas individuais podem variar.</span>
          </div>
        )}
      </div>
      <div className="flex items-center justify-center gap-4 mt-1">
        <p className="text-xs text-muted-foreground/60">
          Exibindo {visibleData.length} de {chartData.length} membros
        </p>
        {chartData.length > DEFAULT_LIMIT && (
          <button onClick={() => setExpanded(!expanded)} className="text-xs text-primary hover:underline cursor-pointer font-medium">
            {expanded ? "Mostrar menos ▲" : `Ver todos os ${chartData.length} membros ▼`}
          </button>
        )}
      </div>
    </div>
  );
}
