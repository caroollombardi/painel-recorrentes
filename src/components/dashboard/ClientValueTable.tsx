import { useState, useMemo } from "react";
import { ClientData, HealthStatus } from "@/lib/data-parser";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DollarSign, ChevronDown, ChevronRight, User, AlertTriangle, AlertCircle, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { CreditUsageBar } from "./CreditUsageBar";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";

interface ClientValueTableProps {
  data: ClientData[];
  showValues?: boolean;
}

function formatCurrency(value: number, show: boolean = true): string {
  if (!show) return "—";
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);
}

type SortKey = 'horas' | 'valorMedioHora' | 'valorConsumed';
type SortDir = 'asc' | 'desc';

function getValorMedioHora(client: ClientData): number | null {
  if (client.creditUsage && client.horasMensal > 0) {
    return client.creditUsage.valorPago / client.horasMensal;
  }
  return null;
}

const badgeTooltips: Record<string, string> = {
  'Saudável': 'Abaixo de 60% do crédito consumido',
  'Atenção': 'Entre 60% e 80% do crédito consumido',
  'Risco': 'Entre 80% e 100% do crédito consumido',
  'Estouro': 'Acima de 100% do crédito consumido',
};

export function ClientValueTable({ data, showValues = true }: ClientValueTableProps) {
  const [expandedClients, setExpandedClients] = useState<Set<string>>(new Set());
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(prev => prev === 'desc' ? 'asc' : 'desc');
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  const sortedData = useMemo(() => {
    let sorted = [...data].sort((a, b) => b.valorMensal - a.valorMensal);
    sorted = sorted.filter(c => c.valorMensal > 0);

    if (sortKey) {
      sorted.sort((a, b) => {
        let aVal = 0, bVal = 0;
        if (sortKey === 'horas') {
          aVal = a.horasMensal; bVal = b.horasMensal;
        } else if (sortKey === 'valorMedioHora') {
          aVal = getValorMedioHora(a) ?? -1;
          bVal = getValorMedioHora(b) ?? -1;
        } else if (sortKey === 'valorConsumed') {
          aVal = a.valorMensal; bVal = b.valorMensal;
        }
        return sortDir === 'desc' ? bVal - aVal : aVal - bVal;
      });
    }
    return sorted;
  }, [data, sortKey, sortDir]);

  const toggleClient = (project: string) => {
    const newExpanded = new Set(expandedClients);
    if (newExpanded.has(project)) {
      newExpanded.delete(project);
    } else {
      newExpanded.add(project);
    }
    setExpandedClients(newExpanded);
  };

  if (sortedData.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <DollarSign className="w-12 h-12 mx-auto mb-4 opacity-30" />
        <p>Nenhum cliente recorrente com valor calculado.</p>
        <p className="text-sm mt-2">Verifique se os advogados das tarefas estão na tabela de preços.</p>
      </div>
    );
  }

  const totalValue = sortedData.reduce((sum, c) => sum + c.valorMensal, 0);
  const totalHours = sortedData.reduce((sum, c) => sum + c.horasMensal, 0);

  const SortableHeader = ({ label, sortKeyName }: { label: string; sortKeyName: SortKey }) => {
    const isActive = sortKey === sortKeyName;
    return (
      <button
        onClick={() => handleSort(sortKeyName)}
        className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
      >
        {label}
        {isActive ? (
          sortDir === 'desc' ? <ArrowDown className="w-3 h-3" /> : <ArrowUp className="w-3 h-3" />
        ) : (
          <ArrowUpDown className="w-3 h-3 opacity-40" />
        )}
      </button>
    );
  };

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="border-border">
              <TableHead className="text-muted-foreground font-semibold w-8"></TableHead>
              <TableHead className="text-muted-foreground font-semibold">Cliente Recorrente</TableHead>
              <TableHead className="text-muted-foreground font-semibold text-center">Uso do Crédito</TableHead>
              <TableHead className="text-muted-foreground font-semibold text-right">
                <SortableHeader label="Horas Consumidas" sortKeyName="horas" />
              </TableHead>
              <TableHead className="text-muted-foreground font-semibold text-center">
                <SortableHeader label="Valor Médio/Hora" sortKeyName="valorMedioHora" />
              </TableHead>
              <TableHead className="text-muted-foreground font-semibold text-right">
                <SortableHeader label="Valor Consumido" sortKeyName="valorConsumed" />
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedData.map((client, index) => {
              const isExpanded = expandedClients.has(client.project);
              const isOverflow = client.creditUsage && client.creditUsage.percentualUsado >= 100;
              const isAvulso = !client.creditUsage;
              
              return (
                <>
                  <TableRow 
                    key={client.project} 
                    className={cn(
                      "border-border hover:bg-muted/50 transition-colors cursor-pointer",
                      isExpanded && "bg-muted/30",
                      isOverflow && "bg-destructive/5 hover:bg-destructive/10"
                    )}
                    onClick={() => toggleClient(client.project)}
                  >
                    <TableCell className="w-8 p-2">
                      {client.lawyers.length > 0 && (
                        isExpanded 
                          ? <ChevronDown className="w-4 h-4 text-muted-foreground" />
                          : <ChevronRight className="w-4 h-4 text-muted-foreground" />
                      )}
                    </TableCell>
                    <TableCell className="font-medium text-foreground">
                      <div className="flex items-center gap-2">
                        {client.creditUsage?.isCritical && (
                          <AlertCircle className="w-4 h-4 text-destructive flex-shrink-0" />
                        )}
                        {client.creditUsage?.isWarning && !client.creditUsage?.isCritical && (
                          <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />
                        )}
                        {index < 3 && !client.creditUsage?.isWarning && !client.creditUsage?.isCritical && (
                          <span className={`
                            inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold
                            ${index === 0 ? 'bg-primary text-primary-foreground' : 
                              index === 1 ? 'bg-primary/70 text-primary-foreground' : 
                              'bg-primary/40 text-primary-foreground'}
                          `}>
                            {index + 1}
                          </span>
                        )}
                        <span className={cn(
                          client.creditUsage?.isCritical && "text-destructive font-semibold",
                          client.creditUsage?.isWarning && !client.creditUsage?.isCritical && "text-amber-600 font-semibold"
                        )}>
                          {client.project}
                        </span>
                        {isAvulso && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground border border-border">
                            Avulso
                          </span>
                        )}
                        <span className="text-xs text-muted-foreground">
                          ({client.lawyers.length} advogado{client.lawyers.length !== 1 ? 's' : ''})
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      {client.creditUsage ? (
                        <CreditUsageBar creditUsage={client.creditUsage} compact />
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {client.horasMensal.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} h
                    </TableCell>
                    <TableCell className="text-center">
                      {client.creditUsage && client.horasMensal > 0 ? (
                        (() => {
                          const valorMedioHora = client.creditUsage.valorPago / client.horasMensal;
                          const avgLawyerRate = client.valorMensal / client.horasMensal;
                          const ratio = avgLawyerRate > 0 ? (valorMedioHora / avgLawyerRate) * 100 : 0;
                          const health: HealthStatus = ratio >= 110 ? 'green' : ratio >= 90 ? 'yellow' : 'red';
                          const healthLabel = health === 'green' ? 'Saudável' : health === 'yellow' ? 'Atenção' : 'Risco';
                          return (
                            <div className="flex items-center justify-center gap-1.5">
                              <span className="text-sm font-medium text-foreground">
                                {formatCurrency(valorMedioHora, showValues)}
                              </span>
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <div>
                                      <Badge
                                        variant="outline"
                                        className={cn(
                                          "text-[10px] px-1.5 py-0 cursor-help",
                                          health === 'green' && "border-emerald-500/50 text-emerald-600 bg-emerald-500/10",
                                          health === 'yellow' && "border-amber-500/50 text-amber-600 bg-amber-500/10",
                                          health === 'red' && "border-destructive/50 text-destructive bg-destructive/10",
                                        )}
                                      >
                                        {healthLabel}
                                      </Badge>
                                    </div>
                                  </TooltipTrigger>
                                  <TooltipContent side="top">
                                    <p className="text-xs">{badgeTooltips[healthLabel] || ''}</p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            </div>
                          );
                        })()
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-semibold text-primary">
                      {formatCurrency(client.valorMensal, showValues)}
                    </TableCell>
                  </TableRow>
                  
                  {/* Expanded Lawyers */}
                  {isExpanded && client.lawyers.map((lawyer) => (
                    <TableRow 
                      key={`${client.project}-${lawyer.name}`}
                      className="bg-muted/20 border-border"
                    >
                      <TableCell></TableCell>
                      <TableCell></TableCell>
                      <TableCell className="pl-12">
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <User className="w-4 h-4" />
                          <span className="font-medium text-foreground">{lawyer.name}</span>
                          {showValues && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                              {formatCurrency(lawyer.hourlyRate, showValues)}/h
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell></TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {lawyer.hours.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} h
                      </TableCell>
                      <TableCell className="text-right text-foreground">
                        {formatCurrency(lawyer.value, showValues)}
                      </TableCell>
                    </TableRow>
                  ))}
                </>
              );
            })}
          </TableBody>
        </Table>
      </div>
      
      {/* Summary Footer */}
      <div className="flex items-center justify-between pt-4 border-t border-border">
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <span>{sortedData.length} clientes recorrentes</span>
          <span>•</span>
          <span>{totalHours.toFixed(1)}h totais</span>
        </div>
        <div className="text-right">
          <span className="text-sm text-muted-foreground">Valor Total Recorrente: </span>
          <span className="text-lg font-bold text-primary">{formatCurrency(totalValue, showValues)}</span>
        </div>
      </div>
      
      {/* Micro-legenda explicativa */}
      <p className="text-xs text-muted-foreground/70 mt-3 leading-relaxed">
        Uso do crédito (%) refere-se ao percentual do pacote mensal contratado já consumido por cada cliente no período.
      </p>
    </div>
  );
}
