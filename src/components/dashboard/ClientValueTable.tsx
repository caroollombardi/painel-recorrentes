import { ClientData } from "@/lib/data-parser";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DollarSign, TrendingUp } from "lucide-react";

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
  // Sort by total value descending
  const sortedData = [...data].sort((a, b) => b.valorTotal - a.valorTotal);
  
  // Only show clients with value > 0
  const clientsWithValue = sortedData.filter(c => c.valorTotal > 0);

  if (clientsWithValue.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <DollarSign className="w-12 h-12 mx-auto mb-4 opacity-30" />
        <p>Nenhum cliente com valor calculado.</p>
        <p className="text-sm mt-2">Verifique se os advogados das tarefas estão na tabela de preços.</p>
      </div>
    );
  }

  const totalValue = clientsWithValue.reduce((sum, c) => sum + c.valorTotal, 0);

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="border-border">
              <TableHead className="text-muted-foreground font-semibold">Cliente</TableHead>
              <TableHead className="text-muted-foreground font-semibold text-right">Horas</TableHead>
              <TableHead className="text-muted-foreground font-semibold text-right">Valor MENSAL</TableHead>
              <TableHead className="text-muted-foreground font-semibold text-right">Valor OUTROS</TableHead>
              <TableHead className="text-muted-foreground font-semibold text-right">Valor Total</TableHead>
              <TableHead className="text-muted-foreground font-semibold text-right">% do Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {clientsWithValue.map((client, index) => {
              const percentage = totalValue > 0 ? (client.valorTotal / totalValue) * 100 : 0;
              
              return (
                <TableRow 
                  key={client.project} 
                  className="border-border hover:bg-muted/50 transition-colors"
                  style={{ animationDelay: `${index * 30}ms` }}
                >
                  <TableCell className="font-medium text-foreground">
                    <div className="flex items-center gap-2">
                      {index < 3 && (
                        <span className={`
                          inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold
                          ${index === 0 ? 'bg-primary text-primary-foreground' : 
                            index === 1 ? 'bg-primary/70 text-primary-foreground' : 
                            'bg-primary/40 text-primary-foreground'}
                        `}>
                          {index + 1}
                        </span>
                      )}
                      {client.project}
                    </div>
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {client.totalHoras.toFixed(1)}h
                  </TableCell>
                  <TableCell className="text-right">
                    <span className={client.valorMensal > 0 ? 'text-primary font-medium' : 'text-muted-foreground'}>
                      {formatCurrency(client.valorMensal)}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <span className={client.valorOutros > 0 ? 'text-chart-outros font-medium' : 'text-muted-foreground'}>
                      {formatCurrency(client.valorOutros)}
                    </span>
                  </TableCell>
                  <TableCell className="text-right font-semibold text-foreground">
                    {formatCurrency(client.valorTotal)}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <div className="w-16 h-2 bg-muted rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-primary transition-all duration-500"
                          style={{ width: `${Math.min(percentage, 100)}%` }}
                        />
                      </div>
                      <span className="text-sm text-muted-foreground w-12 text-right">
                        {percentage.toFixed(1)}%
                      </span>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      
      {/* Summary Footer */}
      <div className="flex items-center justify-between pt-4 border-t border-border">
        <div className="flex items-center gap-2 text-muted-foreground">
          <TrendingUp className="w-4 h-4" />
          <span className="text-sm">{clientsWithValue.length} clientes com valor calculado</span>
        </div>
        <div className="text-right">
          <span className="text-sm text-muted-foreground">Total Geral: </span>
          <span className="text-lg font-bold text-foreground">{formatCurrency(totalValue)}</span>
        </div>
      </div>
    </div>
  );
}
