import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, Legend } from "recharts";
import { ClientData } from "@/lib/data-parser";

interface HoursChartProps {
  data: ClientData[];
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);
}

export function HoursChart({ data }: HoursChartProps) {
  const chartData = data.slice(0, 15).map(client => ({
    name: client.project.length > 20 
      ? client.project.substring(0, 20) + '...' 
      : client.project,
    fullName: client.project,
    horas: client.horasMensal,
    valor: client.valorMensal,
    lawyerCount: client.lawyers.length,
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
              <span className="text-muted-foreground">Horas:</span>
              <span className="font-medium text-foreground">{data.horas.toFixed(2)}h</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-chart-outros" />
              <span className="text-muted-foreground">Valor:</span>
              <span className="font-medium text-foreground">{formatCurrency(data.valor)}</span>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <span>{data.lawyerCount} advogado{data.lawyerCount !== 1 ? 's' : ''}</span>
            </div>
          </div>
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
            formatter={() => (
              <span className="text-sm text-muted-foreground">
                Horas Clientes Recorrentes
              </span>
            )}
          />
          <Bar 
            dataKey="horas" 
            name="horas"
            radius={[0, 4, 4, 0]}
            maxBarSize={24}
            fill="hsl(var(--primary))"
          >
            {chartData.map((entry, index) => (
              <Cell 
                key={`cell-${index}`} 
                fill={index < 3 ? 'hsl(var(--primary))' : 'hsl(var(--primary) / 0.7)'}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
