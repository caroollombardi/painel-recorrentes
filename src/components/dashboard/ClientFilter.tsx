import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Filter } from "lucide-react";

interface ClientFilterProps {
  clients: string[];
  selectedClient: string;
  onClientChange: (value: string) => void;
}

export function ClientFilter({
  clients,
  selectedClient,
  onClientChange,
}: ClientFilterProps) {
  return (
    <div className="flex flex-wrap items-center gap-4 p-4 bg-card rounded-lg border border-border animate-fade-in">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Filter className="w-4 h-4" />
        <span className="text-sm font-medium">Filtros:</span>
      </div>
      
      <div className="flex flex-wrap gap-4">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">Cliente MENSAL</label>
          <Select value={selectedClient} onValueChange={onClientChange}>
            <SelectTrigger className="w-[200px] bg-background">
              <SelectValue placeholder="Selecione o cliente" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os clientes</SelectItem>
              {clients.map((client) => (
                <SelectItem key={client} value={client}>
                  {client}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}
