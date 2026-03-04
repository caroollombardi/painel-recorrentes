import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, ReferenceArea } from "recharts";
import { DAILY_TARGET_HOURS } from "@/lib/hours-constants";

interface DailyHoursChartProps {
  data: { date: string; hours: number }[];
  dailyTarget?: number;
}

export function DailyHoursChart({ data, dailyTarget = DAILY_TARGET_HOURS }: DailyHoursChartProps) {
  const chartData = data.map(d => ({
    ...d,
    label: new Date(d.date + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
  }));

  const lastPoint = chartData.length > 0 ? chartData[chartData.length - 1] : null;

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload?.length) {
      const d = payload[0].payload;
      return (
        <div className="bg-card border border-border rounded-lg p-3 shadow-lg">
          <p className="text-sm font-medium text-foreground">{d.label}</p>
          <p className="text-sm text-primary font-semibold">{d.hours.toFixed(1)}h</p>
          <p className="text-xs text-muted-foreground">Meta: {dailyTarget}h</p>
        </div>
      );
    }
    return null;
  };

  if (chartData.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-8">Sem dados diários disponíveis.</p>;
  }

  return (
    <div className="w-full h-[300px]">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="hoursGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
              <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
          <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
          <Tooltip content={<CustomTooltip />} />
          {/* Shaded area from 0 to target */}
          <ReferenceArea y1={0} y2={dailyTarget} fill="#EF4444" fillOpacity={0.04} />
          <ReferenceLine
            y={dailyTarget}
            stroke="#EF4444"
            strokeDasharray="5 5"
            label={{ value: `Meta: ${dailyTarget}h/dia`, position: "right", fontSize: 10, fill: "#EF4444" }}
          />
          <Area type="monotone" dataKey="hours" stroke="hsl(var(--primary))" strokeWidth={2} fill="url(#hoursGradient)" />
        </AreaChart>
      </ResponsiveContainer>
      {/* Last point annotation */}
      {lastPoint && (
        <div className="flex justify-end pr-4 -mt-2">
          <span className="text-xs font-semibold text-primary bg-card px-1.5 py-0.5 rounded border border-border">
            {lastPoint.hours.toFixed(1)}h
          </span>
        </div>
      )}
      {/* Legend */}
      <div className="flex items-center justify-center gap-6 mt-3">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: "hsl(var(--primary))" }} />
          <span className="text-xs text-muted-foreground">Horas lançadas</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-6 border-t-2 border-dashed" style={{ borderColor: "#EF4444" }} />
          <span className="text-xs text-muted-foreground">Meta diária ({dailyTarget}h)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: "rgba(239,68,68,0.04)", border: "1px solid rgba(239,68,68,0.2)" }} />
          <span className="text-xs text-muted-foreground">Zona abaixo da meta</span>
        </div>
      </div>
    </div>
  );
}
