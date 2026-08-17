import { useState } from "react";
import { RefreshCw, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { syncAtosFromAsana, AsanaAtosSyncResult } from "@/lib/asana-atos-import";

interface AtosAsanaSyncProps {
  onSyncComplete: () => void;
}

const fmtHoras = (minutos: number) => {
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return `${h}h${String(m).padStart(2, "0")}`;
};

export function AtosAsanaSync({ onSyncComplete }: AtosAsanaSyncProps) {
  const { toast } = useToast();
  const [syncing, setSyncing] = useState(false);
  const [result, setResult] = useState<AsanaAtosSyncResult | null>(null);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = await syncAtosFromAsana();
      setResult(res);
      if (res.success) {
        const quebra =
          res.stats.porTag !== undefined
            ? ` (${res.stats.porNome ?? 0} por nome, ${res.stats.porTag} por tag)`
            : "";
        toast({
          title: "Atos atualizados",
          description: `${res.stats.projetosEncontrados} ato(s)${quebra} · ${res.stats.lancamentos} lançamento(s) · ${fmtHoras(res.stats.minutos)}`,
        });
        onSyncComplete();
      } else {
        toast({
          title: "Erro ao salvar",
          description: res.error ?? "Não foi possível gravar os atos.",
          variant: "destructive",
        });
      }
    } catch (err) {
      toast({
        title: "Erro na sincronização",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setSyncing(false);
    }
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={handleSync}
        disabled={syncing}
        className="gap-2"
      >
        <RefreshCw className={`w-4 h-4 ${syncing ? "animate-spin" : ""}`} />
        {syncing ? "Buscando no Asana..." : "Atualizar do Asana"}
      </Button>

      <Dialog
        open={!!result && result.warnings.length > 0}
        onOpenChange={(open) => !open && setResult(null)}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="w-4 h-4 text-warning-foreground" />
              Pontos de atenção da sincronização
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            {result && (
              <p className="text-sm text-muted-foreground">
                {result.stats.projetosEncontrados} projeto(s) de ato ·{" "}
                {result.projetosSubstituidos} atualizado(s) ·{" "}
                {result.projetosImportados - result.projetosSubstituidos} novo(s) ·{" "}
                {fmtHoras(result.stats.minutos)} no total
              </p>
            )}
            <ul className="space-y-2 max-h-64 overflow-y-auto">
              {result?.warnings.map((w, i) => (
                <li
                  key={i}
                  className="text-xs text-muted-foreground bg-muted/40 rounded-md px-3 py-2"
                >
                  {w}
                </li>
              ))}
            </ul>
          </div>

          <DialogFooter>
            <Button size="sm" onClick={() => setResult(null)}>
              Entendi
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
