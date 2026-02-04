import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, Legend } from "recharts";
import { ClientData } from "@/lib/data-parser";
import { AlertTriangle } from "lucide-react";

interface HoursChartProps {
  data: ClientData[];
}

export function HoursChart({ data }: HoursChartProps) {
  const chartData = data.slice(0, 15).map(client => ({
    name: client.project.length > 20 
      ? client.project.substring(0, 20) + '...' 
      : client.project,
    fullName: client.project,
    mensal: client.horasMensal,
    outros: client.horasOutros,
    isRisk: client.isRisk,
  }));

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-card border border-border rounded-lg p-4 shadow-lg">
          <p className="font-display font-semibold text-foreground mb-2">
            {data.fullName}
          </p>
          <div className="space-y-1 text-sm">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-primary" />
              <span className="text-muted-foreground">MENSAL:</span>
              <span className="font-medium text-foreground">{data.mensal.toFixed(2)}h</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-chart-outros" />
              <span className="text-muted-foreground">OUTROS:</span>
              <span className="font-medium text-foreground">{data.outros.toFixed(2)}h</span>
            </div>
          </div>
          {data.isRisk && (
            <div className="mt-3 flex items-center gap-2 text-primary">
              <AlertTriangle className="w-4 h-4" />
              <span className="text-xs font-medium">Risco de Margem</span>
            </div>
          )}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="w-full h-[500px] animate-fade-in" style={{ animationDelay: '300ms' }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={chartData}
          layout="vertical"
          margin={{ top: 20, right: 30, left: 100, bottom: 20 }}
          barGap={2}
        >
          <XAxis 
            type="number" 
            stroke="hsl(var(--muted-foreground))"
            fontSize={12}
            tickLine={false}
            axisLine={false}
          />
          <YAxis 
            type="category" 
            dataKey="name" 
            stroke="hsl(var(--muted-foreground))"
            fontSize={12}
            tickLine={false}
            axisLine={false}
            width={95}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: 'hsl(var(--muted) / 0.5)' }} />
          <Legend 
            wrapperStyle={{ paddingTop: 20 }}
            formatter={(value) => (
              <span className="text-sm text-muted-foreground capitalize">
                {value === 'mensal' ? 'MENSAL' : 'OUTROS (ATO/TABELA)'}
              </span>
            )}
          />
          <Bar 
            dataKey="mensal" 
            name="mensal"
            radius={[0, 4, 4, 0]}
            maxBarSize={24}
          >
            {chartData.map((entry, index) => (
              <Cell 
                key={`mensal-${index}`} 
                fill={entry.isRisk ? 'hsl(var(--primary))' : 'hsl(var(--primary) / 0.7)'}
              />
            ))}
          </Bar>
          <Bar 
            dataKey="outros" 
            name="outros"
            fill="hsl(var(--chart-outros))"
            radius={[0, 4, 4, 0]}
            maxBarSize={24}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
