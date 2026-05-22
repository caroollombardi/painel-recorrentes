import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { AtoProjetoDB, AtoLancamentoDB } from "@/lib/atos-parser";

export interface AtoProjetoComLancamentos {
  projeto: AtoProjetoDB;
  lancamentos: AtoLancamentoDB[];
}

export function useAtosData() {
  const [projetos, setProjetos] = useState<AtoProjetoComLancamentos[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    const { data: projetosData, error: projErr } = await supabase
      .from("atos_projetos")
      .select("*")
      .order("updated_at", { ascending: false });

    if (projErr) {
      setError(projErr.message);
      setIsLoading(false);
      return;
    }

    if (!projetosData || projetosData.length === 0) {
      setProjetos([]);
      setIsLoading(false);
      return;
    }

    const projetoIds = projetosData.map(p => p.id);
    const { data: lancamentosData, error: lanErr } = await supabase
      .from("atos_lancamentos")
      .select("*")
      .in("projeto_id", projetoIds);

    if (lanErr) {
      setError(lanErr.message);
      setIsLoading(false);
      return;
    }

    const lancamentosMap = new Map<string, AtoLancamentoDB[]>();
    (lancamentosData ?? []).forEach(l => {
      if (!lancamentosMap.has(l.projeto_id)) lancamentosMap.set(l.projeto_id, []);
      lancamentosMap.get(l.projeto_id)!.push(l as AtoLancamentoDB);
    });

    const combined: AtoProjetoComLancamentos[] = projetosData.map(p => ({
      projeto: p as AtoProjetoDB,
      lancamentos: lancamentosMap.get(p.id) ?? [],
    }));

    setProjetos(combined);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { projetos, isLoading, error, reload: load };
}
