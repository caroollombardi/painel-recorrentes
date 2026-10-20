import { Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

/** Ícone discreto que guarda a explicação de regra/metodologia fora da tela. */
export function InfoDica({ texto }: { texto: string }) {
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label="Como este número é calculado"
            className="inline-flex text-muted-foreground/60 hover:text-foreground transition-colors align-middle"
          >
            <Info className="w-3.5 h-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-[300px] text-xs leading-relaxed">
          {texto}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
