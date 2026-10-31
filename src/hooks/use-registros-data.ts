import { useState, useEffect, useCallback } from "react";

export interface Registro {
  key: string;
  projectGid: string;
  projectName: string;
  documento: string;
  responsaveis: string[];
  inicio: string;
  ultimaConclusao: string | null;
  aberto: boolean;
  minutos: number;
  tarefas: number;
  tarefasSemHora: number;
  exigencias: number;
  protocolos: number;
  diasCiclo: number;
  minutosPorResponsavel: Record<string, number>;
  tarefasAbertas: { gid: string; name: string; responsavel: string | null; criadaEm: string }[];
}

export interface RegistrosData {
  generatedAt: string;
  periodoMeses: number;
  tarefasLidas: number;
  registros: Registro[];
}

let cache: { data: RegistrosData; timestamp: number } | null = null;
const CACHE_TTL = 5 * 60 * 1000;

export function useRegistrosData() {
  const [data, setData] = useState<RegistrosData | null>(cache?.data ?? null);
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
      const res = await fetch("/api/asana-registros");
      const result = await res.json();
      if (!res.ok || result?.error) {
        setError(result?.error || "Erro ao buscar dados do Asana");
        return;
      }
      cache = { data: result as RegistrosData, timestamp: Date.now() };
      setData(result as RegistrosData);
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
