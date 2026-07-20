import { useState, useEffect, useCallback } from "react";

export type Desfecho = "ganho" | "perdido" | "generico" | "vazio" | null;
export type StatusGeral = "em_dia" | "em_espera" | "concluido" | "sem_status";

export interface ProspeccaoItem {
  gid: string;
  name: string;
  owner: string | null;
  statusGeral: StatusGeral;
  desfecho: Desfecho;
  resumo: string;
  modifiedAt: string;
}

export interface ProspeccaoData {
  generatedAt: string;
  resumo: {
    total: number;
    emDia: number;
    emEspera: number;
    semStatus: number;
    concluidos: number;
    ganho: number;
    perdido: number;
    generico: number;
    vazio: number;
    taxaSemMotivo: number;
  };
  porResponsavel: Record<string, { concluidos: number; semMotivo: number }>;
  pendentes: { gid: string; name: string; owner: string | null; desfecho: Desfecho }[];
  items: ProspeccaoItem[];
}

let cache: { data: ProspeccaoData; timestamp: number } | null = null;
const CACHE_TTL = 5 * 60 * 1000;

export function useProspeccaoData() {
  const [data, setData] = useState<ProspeccaoData | null>(cache?.data ?? null);
  const [isLoading, setIsLoading] = useState(!cache);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (force = false) => {
    if (!force && cache && Date.now() - cache.timestamp < CACHE_TTL) {
      setData(cache.data);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/asana-prospeccao");
      const result = await res.json();
      if (!res.ok || result?.error) {
        setError(result?.error || "Erro ao buscar dados do Asana");
        return;
      }
      cache = { data: result as ProspeccaoData, timestamp: Date.now() };
      setData(result as ProspeccaoData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao buscar dados do Asana");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { data, isLoading, error, reload: () => load(true) };
}
