import { useState } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, LabelList } from "recharts";
import { ClientData } from "@/lib/data-parser";

interface HoursChartProps {
  data: ClientData[];
  showValues?: boolean;
}

function formatCurrency(value: number, show: boolean = true): string {
  if (!show) return "—";
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

export function HoursChart({ data, showValues = true }: HoursChartProps) {
  const [expanded, setExpanded] = useState(false);
  const allData = [...data].sort((a, b) => b.horasMensal - a.horasMensal);
  const allChartData = allData.filter(c => c.horasMensal > 0).map(client => {
    let creditoHoras = 0;
    if (client.creditUsage && client.horasMensal > 0 && client.valorMensal > 0) {
      const avgRate = client.valorMensal / client.horasMensal;
      creditoHoras = avgRate > 0 ? client.creditUsage.valorCredito / avgRate : 0;
    }
    const pct = creditoHoras > 0 ? (client.horasMensal / creditoHoras) * 100 : 0;
    return {
      name: client.project,
      fullName: client.project,
      horas: client.horasMensal,
      credito: creditoHoras,
      valor: client.valorMensal,
      lawyerCount: client.lawyers.length,
      percentLabel: creditoHoras > 0 ? `${client.horasMensal.toFixed(0)}/${creditoHoras.toFixed(0)}h — ${pct.toFixed(0)}%` : `${client.horasMensal.toFixed(1)}h`,
    };
  });

  const DEFAULT_LIMIT = 10;
  const chartData = expanded ? allChartData : allChartData.slice(0, DEFAULT_LIMIT);
  const barHeight = 36;
  const chartHeight = Math.max(400, chartData.length * barHeight + 80);

  // Calculate max name length to set Y axis width
  const maxNameLen = Math.max(...chartData.map(d => d.fullName.length), 10);
  const yAxisWidth = Math.min(Math.max(maxNameLen * 5.5, 120), 220);

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const tooltipData = payload[0].payload;
      return (
        <div className="bg-card border border-border rounded-lg p-4 shadow-lg">
          <p className="font-display font-semibold text-foreground mb-2" translate="no">
            {tooltipData.fullName}
          </p>
          <div className="space-y-1 text-sm">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-primary" />
              <span className="text-muted-foreground">Horas Consumidas:</span>
              <span className="font-medium text-foreground">{tooltipData.horas.toFixed(1)}h</span>
            </div>
            {tooltipData.credito > 0 && (
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ background: '#E5E7EB' }} />
                <span className="text-muted-foreground">Crédito Contratado:</span>
                <span className="font-medium text-foreground">{tooltipData.credito.toFixed(1)}h</span>
              </div>
            )}
            {showValues && (
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-chart-outros" />
                <span className="text-muted-foreground">Valor:</span>
                <span className="font-medium text-foreground">{formatCurrency(tooltipData.valor, showValues)}</span>
              </div>
            )}
            <div className="flex items-center gap-2 text-muted-foreground">
              <span>{tooltipData.lawyerCount} advogado{tooltipData.lawyerCount !== 1 ? 's' : ''}</span>
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  const CustomYAxisTick = ({ x, y, payload }: any) => {
    const name = payload.value;
    // Show full name with smaller font for long names
    const fontSize = name.length > 25 ? 9 : name.length > 18 ? 10 : 11;
    return (
      <g transform={`translate(${x},${y})`}>
        <text
          x={-4}
          y={0}
          dy={4}
          textAnchor="end"
          fill="hsl(var(--muted-foreground))"
          fontSize={fontSize}
        >
          {name}
        </text>
      </g>
    );
  };

  const renderPercentLabel = (props: any) => {
    const { x, y, width, value, index } = props;
    const entry = chartData[index];
    if (!entry) return null;
    return (
      <text
        x={(x || 0) + (width || 0) + 6}
        y={y}
        dy={4}
        fill="hsl(var(--muted-foreground))"
        fontSize={10}
        textAnchor="start"
      >
        {entry.percentLabel}
      </text>
    );
  };

  const renderLegend = () => (
    <div className="flex items-center justify-center gap-6 pt-4">
      <div className="flex items-center gap-2">
        <div className="w-3 h-3 rounded-sm bg-primary" />
        <span className="text-sm text-muted-foreground">Horas Consumidas</span>
      </div>
      <div className="flex items-center gap-2">
        <div className="w-3 h-3 rounded-sm" style={{ background: '#E5E7EB' }} />
        <span className="text-sm text-muted-foreground">Crédito Contratado</span>
      </div>
    </div>
  );

  return (
    <div className="w-full animate-fade-in" style={{ animationDelay: '300ms' }}>
      <div style={{ height: `${chartHeight}px` }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData}
            layout="vertical"
            margin={{ top: 10, right: 100, left: 10, bottom: 10 }}
            barGap={-4}
            barCategoryGap="20%"
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
              fontSize={11}
              tickLine={false}
              axisLine={false}
              width={yAxisWidth}
              tick={<CustomYAxisTick />}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'hsl(var(--muted) / 0.5)' }} />
            <Bar 
              dataKey="credito" 
              name="Crédito Contratado"
              radius={[0, 4, 4, 0]}
              maxBarSize={20}
              fill="#E5E7EB"
            />
            <Bar 
              dataKey="horas" 
              name="Horas Consumidas"
              radius={[0, 4, 4, 0]}
              maxBarSize={20}
              fill="hsl(var(--primary))"
            >
              {chartData.map((entry, index) => (
                <Cell 
                  key={`cell-${index}`} 
                  fill={index < 3 ? 'hsl(var(--primary))' : 'hsl(var(--primary) / 0.7)'}
                />
              ))}
              <LabelList content={renderPercentLabel} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      {renderLegend()}
      <div className="flex items-center justify-center gap-4 mt-2">
        <p className="text-xs text-muted-foreground/60">
          Exibindo {chartData.length} de {allChartData.length} clientes
        </p>
        {allChartData.length > DEFAULT_LIMIT && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-xs text-primary hover:underline cursor-pointer font-medium"
          >
            {expanded ? "Mostrar menos ▲" : `Ver todos os ${allChartData.length} clientes ▼`}
          </button>
        )}
      </div>
    </div>
  );
}
