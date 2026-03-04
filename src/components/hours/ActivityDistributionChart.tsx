import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from "recharts";

interface ActivityDistributionChartProps {
  data: { type: string; hours: number; percent: number }[];
}

const COLORS = [
  "hsl(20, 95%, 60%)",
  "hsl(20, 85%, 45%)",
  "hsl(30, 90%, 55%)",
  "hsl(40, 85%, 50%)",
  "hsl(220, 14%, 55%)",
  "hsl(220, 14%, 70%)",
  "hsl(10, 80%, 55%)",
  "hsl(50, 80%, 50%)",
];

const RADIAN = Math.PI / 180;

function renderCustomLabel({ cx, cy, midAngle, innerRadius, outerRadius, percent }: any) {
  if (percent < 0.10) return null; // Don't show label for small slices (<10%)
  const radius = innerRadius + (outerRadius - innerRadius) * 0.55;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);
  return (
    <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight={600}>
      {(percent * 100).toFixed(0)}%
    </text>
  );
}

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
    <div className="w-full h-[400px]">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="45%"
            innerRadius={70}
            outerRadius={130}
            dataKey="hours"
            nameKey="type"
            paddingAngle={2}
            label={renderCustomLabel}
            labelLine={false}
          >
            {data.map((_, i) => (
              <Cell key={i} fill={COLORS[i % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip content={<CustomTooltip />} />
          <Legend
            layout="horizontal"
            verticalAlign="bottom"
            align="center"
            formatter={(value: string, entry: any) => {
              const item = data.find(d => d.type === value);
              return (
                <span className="text-sm text-foreground">
                  {value} {item ? `(${item.percent.toFixed(0)}%)` : ''}
                </span>
              );
            }}
            iconType="circle"
            iconSize={8}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
