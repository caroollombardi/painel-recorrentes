import { AlertTriangle, AlertCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface CreditWarningBannerProps {
  clientsAtWarning: number;
  clientsAtCritical: number;
}

export function CreditWarningBanner({ clientsAtWarning, clientsAtCritical }: CreditWarningBannerProps) {
  if (clientsAtWarning === 0 && clientsAtCritical === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      {clientsAtCritical > 0 && (
        <Alert variant="destructive" className="border-destructive/50 bg-destructive/10">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle className="font-semibold">Limite de Crédito Excedido!</AlertTitle>
          <AlertDescription>
            {clientsAtCritical} cliente{clientsAtCritical !== 1 ? 's' : ''} ultrapassou{clientsAtCritical !== 1 ? 'aram' : ''} 100% do crédito mensal disponível.
          </AlertDescription>
        </Alert>
      )}
      
      {clientsAtWarning > 0 && (
        <Alert className="border-primary/50 bg-primary/10">
          <AlertTriangle className="h-4 w-4 text-primary" />
          <AlertTitle className="font-semibold text-primary">Alerta de Consumo Alto</AlertTitle>
          <AlertDescription className="text-foreground/80">
            {clientsAtWarning} cliente{clientsAtWarning !== 1 ? 's' : ''} atingiu{clientsAtWarning !== 1 ? 'ram' : ''} 80% ou mais do crédito mensal.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
