import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { IndicadoresContratos } from "@/components/indicadores/IndicadoresContratos";

export default function IndicadoresArea() {
  const { toast } = useToast();
  const [sincronizando, setSincronizando] = useState(false);
  const [versao, setVersao] = useState(0);

  // Puxa do Asana na hora (o mesmo que o cron faz todo dia às 6h).
  const atualizar = async () => {
    setSincronizando(true);
    try {
      const { data } = await supabase.auth.getSession();
      const r = await fetch("/api/sync-contratos", {
        headers: { Authorization: `Bearer ${data.session?.access_token ?? ""}` },
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) throw new Error(j.erro || `Erro ${r.status}`);
      toast({ title: "Indicadores atualizados", description: `${j.tarefas} tarefas de ${j.projetos} projetos lidas do Asana.` });
      setVersao((v) => v + 1);
    } catch (e) {
      toast({ title: "Não foi possível atualizar", description: (e as Error).message, variant: "destructive" });
    } finally {
      setSincronizando(false);
    }
  };

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-display font-semibold text-foreground">Indicadores por área</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Resultado de cada área, calculado a partir do Asana</p>
          </div>
          <Button variant="outline" size="sm" onClick={atualizar} disabled={sincronizando}>
            <RefreshCw className={sincronizando ? "w-4 h-4 mr-2 animate-spin" : "w-4 h-4 mr-2"} />
            {sincronizando ? "Atualizando…" : "Atualizar do Asana"}
          </Button>
        </div>
        <IndicadoresContratos versao={versao} />
      </div>
    </AppShell>
  );
}
