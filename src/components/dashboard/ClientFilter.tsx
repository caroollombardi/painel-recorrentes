import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface ClientFilterProps {
  clients: string[];
  selectedClient: string;
  onClientChange: (client: string) => void;
  contractTypes: string[];
  selectedContract: string;
  onContractChange: (contract: string) => void;
}

export function ClientFilter({
  clients,
  selectedClient,
  onClientChange,
  contractTypes,
  selectedContract,
  onContractChange,
}: ClientFilterProps) {
  return (
    <div className="flex flex-wrap gap-4 animate-fade-in" style={{ animationDelay: '100ms' }}>
      <div className="space-y-2">
        <label className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
          Cliente / Projeto
        </label>
        <Select value={selectedClient} onValueChange={onClientChange}>
          <SelectTrigger className="w-[220px] bg-card border-border">
            <SelectValue placeholder="Todos os Clientes" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os Clientes</SelectItem>
            {clients.map((client) => (
              <SelectItem key={client} value={client}>
                {client}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
          Tipo de Contrato
        </label>
        <Select value={selectedContract} onValueChange={onContractChange}>
          <SelectTrigger className="w-[180px] bg-card border-border">
            <SelectValue placeholder="Todos" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            {contractTypes.map((type) => (
              <SelectItem key={type} value={type}>
                {type}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
