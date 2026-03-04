import { useState } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { MemberSummary } from "@/hooks/use-hours-data";

interface HoursMemberChartProps {
  data: MemberSummary[];
}

export function HoursMemberChart({ data }: HoursMemberChartProps) {
  const [expanded, setExpanded] = useState(false);
  const DEFAULT_LIMIT = 10;

  const chartData = data.map(m => ({
    name: m.name.length > 22 ? m.name.substring(0, 22) + "…" : m.name,
    fullName: m.name,
    horas: m.totalHours,
    projects: m.projects.length,
  }));

  const visibleData = expanded ? chartData : chartData.slice(0, DEFAULT_LIMIT);
  const barHeight = 32;
  const chartHeight = Math.max(300, visibleData.length * barHeight + 80);

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload?.length) {
      const d = payload[0].payload;
      return (
        <div className="bg-card border border-border rounded-lg p-4 shadow-lg">
          <p className="font-display font-semibold text-foreground mb-1">{d.fullName}</p>
          <p className="text-sm text-muted-foreground">{d.horas.toFixed(1)}h • {d.projects} projeto{d.projects !== 1 ? "s" : ""}</p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="w-full animate-fade-in" style={{ animationDelay: "300ms" }}>
      <div style={{ height: `${chartHeight}px` }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={visibleData} layout="vertical" margin={{ top: 10, right: 30, left: 120, bottom: 10 }}>
            <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
            <YAxis type="category" dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} width={115} />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: "hsl(var(--muted) / 0.5)" }} />
            <Bar dataKey="horas" radius={[0, 4, 4, 0]} maxBarSize={20} fill="hsl(var(--primary))">
              {visibleData.map((_, i) => (
                <Cell key={i} fill={i < 3 ? "hsl(var(--primary))" : "hsl(var(--primary) / 0.7)"} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="flex items-center justify-center gap-4 mt-2">
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
