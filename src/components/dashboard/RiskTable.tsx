import { ClientData } from "@/lib/data-parser";
import { AlertTriangle } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface RiskTableProps {
  data: ClientData[];
}

export function RiskTable({ data }: RiskTableProps) {
  const riskClients = data.filter(client => client.isRisk);

  if (riskClients.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        Nenhum cliente com risco de margem identificado.
      </div>
    );
  }

  return (
    <div className="animate-fade-in" style={{ animationDelay: '400ms' }}>
      <Table>
        <TableHeader>
          <TableRow className="border-border hover:bg-transparent">
            <TableHead className="text-muted-foreground font-medium">Cliente</TableHead>
            <TableHead className="text-muted-foreground font-medium text-right">Horas MENSAL</TableHead>
            <TableHead className="text-muted-foreground font-medium text-right">Horas OUTROS</TableHead>
            <TableHead className="text-muted-foreground font-medium text-right">Diferença</TableHead>
            <TableHead className="text-muted-foreground font-medium text-center">Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {riskClients.map((client, index) => {
            const diff = client.horasMensal - client.horasOutros;
            return (
              <TableRow 
                key={client.project} 
                className="border-border hover:bg-muted/50 transition-colors"
                style={{ animationDelay: `${450 + index * 50}ms` }}
              >
                <TableCell className="font-medium text-foreground">
                  {client.project}
                </TableCell>
                <TableCell className="text-right font-mono text-primary font-semibold">
                  {client.horasMensal.toFixed(2)}h
                </TableCell>
                <TableCell className="text-right font-mono text-muted-foreground">
                  {client.horasOutros.toFixed(2)}h
                </TableCell>
                <TableCell className="text-right font-mono text-primary font-semibold">
                  +{diff.toFixed(2)}h
                </TableCell>
                <TableCell className="text-center">
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 text-primary">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span className="text-xs font-medium">Risco</span>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
