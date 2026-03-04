import { useMemo } from "react";
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
const SMALL_THRESHOLD = 5; // % - suppress labels below this
const GROUP_THRESHOLD = 3; // % - group into "Outros" below this

function renderCustomLabel({ cx, cy, midAngle, innerRadius, outerRadius, percent }: any) {
  if (percent < SMALL_THRESHOLD / 100) return null;
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
  // #9 - Group small slices into "Outros"
  const processedData = useMemo(() => {
    const main = data.filter(d => d.percent >= GROUP_THRESHOLD);
    const small = data.filter(d => d.percent < GROUP_THRESHOLD);
    if (small.length <= 1) return data;
    const othersHours = small.reduce((s, d) => s + d.hours, 0);
    const othersPercent = small.reduce((s, d) => s + d.percent, 0);
    return [
      ...main,
      { type: `Outros (${small.length})`, hours: Math.round(othersHours * 100) / 100, percent: Math.round(othersPercent * 10) / 10 },
    ];
  }, [data]);

  if (data.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-8">Sem dados de atividades disponíveis.</p>;
  }

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload?.length) {
      const d = payload[0].payload;
      return (
        <div className="bg-card border border-border rounded-lg p-3 shadow-lg">
          <p className="text-sm font-medium text-foreground">{d.type}</p>
          <p className="text-sm text-primary font-semibold">{d.hours.toFixed(1)}h</p>
          <p className="text-xs text-muted-foreground">{d.percent.toFixed(1)}% do total</p>
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
            data={processedData}
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
            {processedData.map((_, i) => (
              <Cell key={i} fill={COLORS[i % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip content={<CustomTooltip />} />
          <Legend
            layout="horizontal"
            verticalAlign="bottom"
            align="center"
            formatter={(value: string) => {
              const item = processedData.find(d => d.type === value);
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
