import { useState, useEffect, useCallback } from "react";

export type Desfecho = "ganho" | "perdido" | "generico" | "vazio" | null;
export type StatusGeral = "em_dia" | "em_espera" | "concluido" | "sem_status";
export type MotivoFonte = "tarefa_funil" | "status_projeto" | "nao_encontrado";
export type Etapa =
  | "Lead recebido" | "Reunião" | "Proposta enviada" | "Negociação"
  | "Ganho" | "Perdido" | "Sem estrutura de funil";

export interface ProspeccaoItem {
  gid: string;
  name: string;
  owner: string | null;
  statusGeral: StatusGeral;
  desfecho: Desfecho;
  motivo: string;
  motivoFonte: MotivoFonte;
  etapaAtual: Etapa;
  areaJuridica: string | null;
  origemLead: string | null;
  createdAt: string;
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
    emEsperaAntigos: number;
    novosUltimos30Dias: number;
    semMotivo: number;
    taxaSemMotivo: number;
    taxaConversaoClassificados: number | null;
    comEstruturaFunil: number;
    semEstruturaFunil: number;
  };
  funilEtapas: Record<Etapa, number>;
  origemLeadCounts: Record<string, number>;
  areaJuridicaCounts: Record<string, number>;
  porResponsavel: Record<string, { concluidos: number; semMotivo: number; pct: number }>;
  pendentes: { gid: string; name: string; owner: string | null; desfecho: Desfecho; motivoFonte: MotivoFonte }[];
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
