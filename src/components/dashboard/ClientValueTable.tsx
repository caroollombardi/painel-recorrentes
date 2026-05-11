import React, { useState, useMemo, useRef, useCallback, useImperativeHandle, forwardRef } from "react";
import { ClientData, HealthStatus } from "@/lib/data-parser";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DollarSign, ChevronDown, ChevronRight, User, AlertTriangle, AlertCircle, ArrowUpDown, ArrowUp, ArrowDown, ListChecks, FileText, Calendar } from "lucide-react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { TimeEntry } from "@/hooks/use-hours-data";
import { cn } from "@/lib/utils";
import { CreditUsageBar } from "./CreditUsageBar";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";

export interface ClientValueTableHandle {
  scrollToClient: (clientName: string) => void;
}

interface ClientValueTableProps {
  data: ClientData[];
  showValues?: boolean;
  clientVariations?: Record<string, number | null>;
  onAsanaClick?: (clientName: string) => void;
  timeEntries?: TimeEntry[];
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

type StatusGroup = 'overflow' | 'risk' | 'warning' | 'healthy' | 'avulso';

function getClientStatus(client: ClientData): StatusGroup {
  if (!client.creditUsage) return 'avulso';
  const pct = client.creditUsage.percentualUsado;
  if (pct >= 100) return 'overflow';
  if (pct >= 80) return 'risk';
  if (pct >= 60) return 'warning';
  return 'healthy';
}

const statusConfig: Record<StatusGroup, { label: string; emoji: string; bgClass: string; headerBg: string }> = {
  overflow: { label: 'Estouro', emoji: '🚨', bgClass: 'bg-destructive/5 hover:bg-destructive/10', headerBg: 'bg-destructive/10 border-destructive/20' },
  risk: { label: 'Risco', emoji: '⚠️', bgClass: 'bg-risk/5 hover:bg-risk/10', headerBg: 'bg-risk/10 border-risk/20' },
  warning: { label: 'Atenção', emoji: '🔔', bgClass: 'bg-warning/5 hover:bg-warning/10', headerBg: 'bg-warning/10 border-warning/20' },
  healthy: { label: 'Saudável', emoji: '✅', bgClass: 'bg-success/5 hover:bg-success/10', headerBg: 'bg-success/10 border-success/20' },
  avulso: { label: 'Avulso', emoji: '📋', bgClass: 'hover:bg-muted/50', headerBg: 'bg-muted/30 border-border' },
};

const statusOrder: StatusGroup[] = ['overflow', 'risk', 'warning', 'healthy', 'avulso'];

const badgeTooltips: Record<string, string> = {
  'Saudável': 'Abaixo de 60% do crédito consumido',
  'Atenção': 'Entre 60% e 80% do crédito consumido',
  'Risco': 'Entre 80% e 100% do crédito consumido',
  'Estouro': 'Acima de 100% do crédito consumido',
};

export const ClientValueTable = forwardRef<ClientValueTableHandle, ClientValueTableProps>(
  function ClientValueTable({ data, showValues = true, clientVariations = {}, onAsanaClick, timeEntries }, ref) {
  const [expandedClients, setExpandedClients] = useState<Set<string>>(new Set());
  const [expandedLawyers, setExpandedLawyers] = useState<Set<string>>(new Set());
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const rowRefs = useRef<Map<string, HTMLTableRowElement>>(new Map());

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(prev => prev === 'desc' ? 'asc' : 'desc');
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  const scrollToClient = useCallback((clientName: string) => {
    setExpandedClients(prev => {
      const next = new Set(prev);
      next.add(clientName);
      return next;
    });
    setTimeout(() => {
      const el = rowRefs.current.get(clientName);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('ring-2', 'ring-primary', 'ring-offset-1');
        setTimeout(() => el.classList.remove('ring-2', 'ring-primary', 'ring-offset-1'), 2000);
      }
    }, 100);
  }, []);

  useImperativeHandle(ref, () => ({ scrollToClient }), [scrollToClient]);

  const sortedData = useMemo(() => {
    let sorted = [...data].filter(c => c.valorMensal > 0);

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
    } else {
      sorted.sort((a, b) => b.valorMensal - a.valorMensal);
    }
    return sorted;
  }, [data, sortKey, sortDir]);

  // Group by status
  const groupedData = useMemo(() => {
    const groups: Record<StatusGroup, ClientData[]> = {
      overflow: [], risk: [], warning: [], healthy: [], avulso: [],
    };
    sortedData.forEach(c => {
      groups[getClientStatus(c)].push(c);
    });
    return groups;
  }, [sortedData]);

  const toggleClient = (project: string) => {
    const newExpanded = new Set(expandedClients);
    if (newExpanded.has(project)) {
      newExpanded.delete(project);
    } else {
      newExpanded.add(project);
    }
    setExpandedClients(newExpanded);
  };

  const toggleLawyer = (key: string) => {
    const next = new Set(expandedLawyers);
    if (next.has(key)) next.delete(key); else next.add(key);
    setExpandedLawyers(next);
  };

  const getLawyerEntries = (clientProject: string, lawyerName: string): TimeEntry[] => {
    if (!timeEntries) return [];
    const cp = clientProject.toLowerCase();
    return timeEntries.filter(e => {
      if ((e.assignee || "").toLowerCase() !== lawyerName.toLowerCase()) return false;
      if ((e.contract_type || "").toUpperCase() !== "MENSAL") return false;
      const ep = (e.project || "").toLowerCase();
      const ec = (e.client || "").toLowerCase();
      return ep === cp || ep.startsWith(cp) || cp.startsWith(ep) || ec === cp || ec.includes(cp) || cp.includes(ec);
    }).sort((a, b) => (b.completed_date || "").localeCompare(a.completed_date || ""));
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

  const renderClientRow = (client: ClientData) => {
    const isExpanded = expandedClients.has(client.project);
    const status = getClientStatus(client);
    const config = statusConfig[status];
    const isAvulso = !client.creditUsage;

    return (
      <React.Fragment key={client.project}>
        <TableRow 
          ref={(el) => { if (el) rowRefs.current.set(client.project, el); }}
          className={cn(
            "border-border transition-all cursor-pointer",
            config.bgClass,
            isExpanded && "bg-muted/30",
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
                <AlertTriangle className="w-4 h-4 text-warning-foreground flex-shrink-0" />
              )}
              <span translate="no" className={cn(
                client.creditUsage?.isCritical && "text-destructive font-semibold",
                client.creditUsage?.isWarning && !client.creditUsage?.isCritical && "text-warning-foreground font-semibold"
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
              {onAsanaClick && (
                <button
                  onClick={(e) => { e.stopPropagation(); onAsanaClick(client.project); }}
                  className="ml-auto text-muted-foreground/40 hover:text-primary transition-colors p-0.5 rounded flex-shrink-0"
                  title="Ver tarefas no Asana"
                >
                  <ListChecks className="w-3.5 h-3.5" />
                </button>
              )}
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
            <div className="flex items-center justify-end gap-1.5">
              <span>{client.horasMensal.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} h</span>
              {(() => {
                const prevHoras = clientVariations[client.project];
                if (prevHoras != null && prevHoras > 0) {
                  const pctChange = ((client.horasMensal - prevHoras) / prevHoras) * 100;
                  if (Math.abs(pctChange) >= 0.5) {
                    return (
                      <span className={cn("text-[10px] font-semibold", pctChange >= 0 ? "text-success-foreground" : "text-destructive")}>
                        {pctChange >= 0 ? "↑" : "↓"}{Math.abs(pctChange).toFixed(0)}%
                      </span>
                    );
                  }
                }
                return null;
              })()}
            </div>
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
                                health === 'green' && "border-success/50 text-success-foreground bg-success/10",
                                health === 'yellow' && "border-warning/50 text-warning-foreground bg-warning/10",
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
        {isExpanded && client.lawyers.map((lawyer) => {
          const pct = client.horasMensal > 0 ? (lawyer.hours / client.horasMensal) * 100 : 0;
          const lawyerKey = `${client.project}::${lawyer.name}`;
          const isLawyerExpanded = expandedLawyers.has(lawyerKey);
          const entries = getLawyerEntries(client.project, lawyer.name);
          return (
            <React.Fragment key={lawyerKey}>
              <TableRow
                className={cn("bg-muted/20 border-border transition-colors", entries.length > 0 && "cursor-pointer hover:bg-muted/30")}
                onClick={() => entries.length > 0 && toggleLawyer(lawyerKey)}
              >
                <TableCell className="p-2 pl-4">
                  {entries.length > 0 && (
                    isLawyerExpanded
                      ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                      : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                  )}
                </TableCell>
                <TableCell></TableCell>
                <TableCell className="pl-8">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <User className="w-4 h-4" />
                    <span className="font-medium text-foreground" translate="no">{lawyer.name}</span>
                    {showValues && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                        {formatCurrency(lawyer.hourlyRate, showValues)}/h
                      </span>
                    )}
                    {entries.length > 0 && (
                      <span className="text-[10px] text-muted-foreground">
                        ({entries.length} lançamento{entries.length !== 1 ? "s" : ""})
                      </span>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-center">
                  <div className="flex items-center gap-2 justify-center">
                    <Progress value={Math.min(pct, 100)} className="w-12 h-1.5" />
                    <span className="text-xs text-muted-foreground font-medium">{pct.toFixed(0)}%</span>
                  </div>
                </TableCell>
                <TableCell className="text-right text-muted-foreground">
                  {lawyer.hours.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} h
                </TableCell>
                <TableCell className="text-right text-foreground">
                  {formatCurrency(lawyer.value, showValues)}
                </TableCell>
              </TableRow>

              {/* Lançamentos do advogado */}
              {isLawyerExpanded && entries.map((entry, idx) => (
                <TableRow key={`${lawyerKey}-entry-${idx}`} className="bg-muted/10 border-border/50">
                  <TableCell></TableCell>
                  <TableCell></TableCell>
                  <TableCell colSpan={2} className="pl-14">
                    <div className="flex items-start gap-2 py-0.5">
                      <FileText className="w-3.5 h-3.5 mt-0.5 shrink-0 text-muted-foreground/60" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-foreground/80 leading-snug">{entry.task_name || "Sem descrição"}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          {entry.completed_date && (
                            <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                              <Calendar className="w-3 h-3" />
                              {format(parseISO(entry.completed_date), "dd/MM/yyyy", { locale: ptBR })}
                            </span>
                          )}
                          {entry.activity_type && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">
                              {entry.activity_type}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground text-sm pr-4">
                    {entry.hours_logged.toFixed(2)}h
                  </TableCell>
                  <TableCell></TableCell>
                </TableRow>
              ))}
            </React.Fragment>
          );
        })}
      </React.Fragment>
    );
  };

  // If sorting is active, don't group - just render flat
  const useGrouping = !sortKey;

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
            {useGrouping ? (
              statusOrder.map(status => {
                const clients = groupedData[status];
                if (clients.length === 0) return null;
                const config = statusConfig[status];
                return (
                  <React.Fragment key={status}>
                    <TableRow className={cn("border-border", config.headerBg)}>
                      <TableCell colSpan={6} className="py-2 px-4">
                        <span className="text-sm font-semibold">
                          {config.emoji} {config.label}
                          <span className="font-normal text-muted-foreground ml-2">
                            ({clients.length} cliente{clients.length !== 1 ? 's' : ''})
                          </span>
                        </span>
                      </TableCell>
                    </TableRow>
                    {clients.map(renderClientRow)}
                  </React.Fragment>
                );
              })
            ) : (
              sortedData.map(renderClientRow)
            )}
          </TableBody>
        </Table>
      </div>
      
      {/* Summary Footer */}
      <div className="flex items-center justify-between pt-4 border-t border-border">
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <span>{sortedData.length} clientes recorrentes</span>
          <span>•</span>
          <span>{totalHours.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} h totais</span>
        </div>
        <div className="text-right">
          <span className="text-sm text-muted-foreground">Valor Total Recorrente: </span>
          <span className="text-lg font-bold text-primary">{formatCurrency(totalValue, showValues)}</span>
        </div>
      </div>
      
      <p className="text-xs text-muted-foreground/70 mt-3 leading-relaxed">
        Uso do crédito (%) refere-se ao percentual do pacote mensal contratado já consumido por cada cliente no período.
      </p>
    </div>
  );
});