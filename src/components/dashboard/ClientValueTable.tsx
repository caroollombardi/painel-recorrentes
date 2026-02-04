import { useState } from "react";
import { ClientData } from "@/lib/data-parser";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DollarSign, ChevronDown, ChevronRight, User, AlertTriangle, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { CreditUsageBar } from "./CreditUsageBar";

interface ClientValueTableProps {
  data: ClientData[];
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);
}

export function ClientValueTable({ data }: ClientValueTableProps) {
  const [expandedClients, setExpandedClients] = useState<Set<string>>(new Set());
  
  // Sort by total value descending
  const sortedData = [...data].sort((a, b) => b.valorMensal - a.valorMensal);
  
  // Only show clients with value > 0
  const clientsWithValue = sortedData.filter(c => c.valorMensal > 0);

  const toggleClient = (project: string) => {
    const newExpanded = new Set(expandedClients);
    if (newExpanded.has(project)) {
      newExpanded.delete(project);
    } else {
      newExpanded.add(project);
    }
    setExpandedClients(newExpanded);
  };

  if (clientsWithValue.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <DollarSign className="w-12 h-12 mx-auto mb-4 opacity-30" />
        <p>Nenhum cliente MENSAL com valor calculado.</p>
        <p className="text-sm mt-2">Verifique se os advogados das tarefas estão na tabela de preços.</p>
      </div>
    );
  }

  const totalValue = clientsWithValue.reduce((sum, c) => sum + c.valorMensal, 0);
  const totalHours = clientsWithValue.reduce((sum, c) => sum + c.horasMensal, 0);

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="border-border">
              <TableHead className="text-muted-foreground font-semibold w-8"></TableHead>
              <TableHead className="text-muted-foreground font-semibold">Cliente MENSAL</TableHead>
              <TableHead className="text-muted-foreground font-semibold text-right">Horas</TableHead>
              <TableHead className="text-muted-foreground font-semibold text-right">Valor Consumido</TableHead>
              <TableHead className="text-muted-foreground font-semibold text-center">Uso do Crédito</TableHead>
              <TableHead className="text-muted-foreground font-semibold text-right">% do Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {clientsWithValue.map((client, index) => {
              const percentage = totalValue > 0 ? (client.valorMensal / totalValue) * 100 : 0;
              const isExpanded = expandedClients.has(client.project);
              
              return (
                <>
                  <TableRow 
                    key={client.project} 
                    className={cn(
                      "border-border hover:bg-muted/50 transition-colors cursor-pointer",
                      isExpanded && "bg-muted/30"
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
                          <AlertTriangle className="w-4 h-4 text-primary flex-shrink-0" />
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
                          client.creditUsage?.isWarning && !client.creditUsage?.isCritical && "text-primary font-semibold"
                        )}>
                          {client.project}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          ({client.lawyers.length} advogado{client.lawyers.length !== 1 ? 's' : ''})
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {client.horasMensal.toFixed(1)}h
                    </TableCell>
                    <TableCell className="text-right font-semibold text-primary">
                      {formatCurrency(client.valorMensal)}
                    </TableCell>
                    <TableCell className="text-center">
                      {client.creditUsage ? (
                        <CreditUsageBar creditUsage={client.creditUsage} compact />
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-16 h-2 bg-muted rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-secondary transition-all duration-500"
                            style={{ width: `${Math.min(percentage, 100)}%` }}
                          />
                        </div>
                        <span className="text-sm text-muted-foreground w-12 text-right">
                          {percentage.toFixed(1)}%
                        </span>
                      </div>
                    </TableCell>
                  </TableRow>
                  
                  {/* Expanded Lawyers */}
                  {isExpanded && client.lawyers.map((lawyer) => (
                    <TableRow 
                      key={`${client.project}-${lawyer.name}`}
                      className="bg-muted/20 border-border"
                    >
                      <TableCell></TableCell>
                      <TableCell className="pl-12">
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <User className="w-4 h-4" />
                          <span className="font-medium text-foreground">{lawyer.name}</span>
                          <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                            {formatCurrency(lawyer.hourlyRate)}/h
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {lawyer.hours.toFixed(1)}h
                      </TableCell>
                      <TableCell className="text-right text-foreground">
                        {formatCurrency(lawyer.value)}
                      </TableCell>
                      <TableCell></TableCell>
                      <TableCell className="text-right text-muted-foreground text-sm">
                        {((lawyer.value / client.valorMensal) * 100).toFixed(0)}% do cliente
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
          <span>{clientsWithValue.length} clientes MENSAL</span>
          <span>•</span>
          <span>{totalHours.toFixed(1)}h totais</span>
        </div>
        <div className="text-right">
          <span className="text-sm text-muted-foreground">Valor Total MENSAL: </span>
          <span className="text-lg font-bold text-primary">{formatCurrency(totalValue)}</span>
        </div>
      </div>
    </div>
  );
}
