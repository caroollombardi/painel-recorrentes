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
import {
  syncAtosFromAsana,
  AsanaAtosSyncResult,
  SyncProgress,
} from "@/lib/asana-atos-import";

interface AtosAsanaSyncProps {
  onSyncComplete: () => void;
}

const fmtHoras = (minutos: number) => {
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return `${h}h${String(m).padStart(2, "0")}`;
};

const LABEL: Record<SyncProgress["fase"], string> = {
  listando: "Listando projetos do Asana...",
  "atos-por-nome": "Lendo atos identificados pelo nome",
  "varrendo-tags": "Procurando atividades com tag ATO",
  salvando: "Salvando...",
  concluido: "Concluído",
};

export function AtosAsanaSync({ onSyncComplete }: AtosAsanaSyncProps) {
  const { toast } = useToast();
  const [syncing, setSyncing] = useState(false);
  const [progress, setProgress] = useState<SyncProgress | null>(null);
  const [result, setResult] = useState<AsanaAtosSyncResult | null>(null);

  const handleSync = async () => {
    setSyncing(true);
    setProgress(null);
    try {
      const res = await syncAtosFromAsana(setProgress);
      setResult(res);
      toast({
        title: "Atos atualizados",
        description:
          `${res.atosPorNome + res.atosPorTag} ato(s) — ${res.atosPorNome} por nome, ` +
          `${res.atosPorTag} por tag · ${res.lancamentos} lançamento(s) · ${fmtHoras(res.minutos)}`,
      });
      onSyncComplete();
    } catch (err) {
      toast({
        title: "Erro na sincronização",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
      // Recarrega mesmo com erro: os lotes que passaram já foram gravados
      onSyncComplete();
    } finally {
      setSyncing(false);
      setProgress(null);
    }
  };

  const pct =
    progress && progress.total > 0
      ? Math.min(100, Math.round((progress.processados / progress.total) * 100))
      : 0;

  return (
    <>
      <div className="flex flex-col items-end gap-1">
        <Button
          variant="outline"
          size="sm"
          onClick={handleSync}
          disabled={syncing}
          className="gap-2"
        >
          <RefreshCw className={`w-4 h-4 ${syncing ? "animate-spin" : ""}`} />
          {syncing ? "Sincronizando..." : "Atualizar do Asana"}
        </Button>

        {syncing && progress && (
          <div className="w-56 space-y-1">
            <p className="text-[10px] text-muted-foreground leading-tight">
              {LABEL[progress.fase]}
              {progress.total > 0 && ` · ${progress.processados}/${progress.total}`}
              {progress.encontrados > 0 && ` · ${progress.encontrados} ato(s)`}
            </p>
            <div className="h-1 w-full bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-300"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        )}
      </div>

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
                {result.atosPorNome} ato(s) por nome de projeto · {result.atosPorTag} por tag
                nas atividades · {result.projetosVarridos} de {result.totalProjetosAtivos}{" "}
                projetos varridos · {fmtHoras(result.minutos)} no total
              </p>
            )}
            <ul className="space-y-2 max-h-72 overflow-y-auto">
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
