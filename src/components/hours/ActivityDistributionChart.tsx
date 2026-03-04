import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from "recharts";

interface ActivityDistributionChartProps {
  data: { type: string; hours: number; percent: number }[];
}

const COLORS = [
  "hsl(20, 95%, 60%)",    // primary orange
  "hsl(20, 85%, 45%)",    // darker orange
  "hsl(30, 90%, 55%)",    // amber
  "hsl(40, 85%, 50%)",    // gold
  "hsl(220, 14%, 55%)",   // muted
  "hsl(220, 14%, 70%)",   // lighter muted
  "hsl(10, 80%, 55%)",    // red-orange
  "hsl(50, 80%, 50%)",    // yellow
];

export function ActivityDistributionChart({ data }: ActivityDistributionChartProps) {
  if (data.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-8">Sem dados de atividades disponíveis.</p>;
  }

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload?.length) {
      const d = payload[0].payload;
      return (
        <div className="bg-card border border-border rounded-lg p-3 shadow-lg">
          <p className="text-sm font-medium text-foreground">{d.type}</p>
          <p className="text-sm text-primary font-semibold">{d.hours.toFixed(1)}h ({d.percent.toFixed(0)}%)</p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="w-full h-[300px]">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={60}
            outerRadius={100}
            dataKey="hours"
            nameKey="type"
            paddingAngle={2}
          >
            {data.map((_, i) => (
              <Cell key={i} fill={COLORS[i % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip content={<CustomTooltip />} />
          <Legend
            formatter={(value: string) => <span className="text-sm text-foreground">{value}</span>}
            iconType="circle"
            iconSize={8}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
