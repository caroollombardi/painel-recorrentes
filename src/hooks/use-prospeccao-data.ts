import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export type Desfecho = "ganho" | "perdido" | "generico" | "vazio" | null;
export type StatusGeral = "em_dia" | "em_espera" | "concluido" | "sem_status";
export type MotivoFonte = "tarefa_funil" | "status_projeto" | "nao_encontrado";
export type Etapa =
  | "Lead recebido" | "Reunião" | "Proposta enviada" | "Negociação"
  | "Ganho" | "Perdido" | "Sem estrutura de funil";

export interface ReuniaoAgendamento {
  taskGid: string;
  taskName: string;
  concluida: boolean;
  concluidaEm: string | null;
  concluidaPor: string | null;
  responsavel: string | null;
  prazo: string | null;
  concluidaNoCadastro: boolean;
  reuniaoTaskGid: string | null;
  reuniaoData: string | null;
  reuniaoDataPor: string | null;
}

export interface ReuniaoAgendada {
  projetoGid: string;
  projeto: string;
  dono: string | null;
  taskGid: string;
  agendadaEm: string;
  agendadaPor: string;
  responsavel: string | null;
  concluidaNoCadastro: boolean;
  reuniaoData: string;
  reuniaoDataPor: string;
}

export interface AgendadaSemData {
  projetoGid: string;
  projeto: string;
  agendadaPor: string;
  taskGid: string;
  temTarefaReuniao: boolean;
}

export interface ReuniaoPendente {
  projetoGid: string;
  projeto: string;
  dono: string | null;
  taskGid: string;
  responsavel: string | null;
  prazo: string | null;
}

export interface PlacarReunioes {
  inicio: string;
  projetosNoPlacar: number;
  reunioesAgendadas: ReuniaoAgendada[];
  reunioesPendentes: ReuniaoPendente[];
  agendadasSemData?: AgendadaSemData[];
  semTarefaAgendamento: { projetoGid: string; projeto: string; dono: string | null }[];
}

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
  noPlacar?: boolean;
  agendamento?: ReuniaoAgendamento | null;
}

export interface ProspeccaoData {
  generatedAt: string;
  leitura?: { projetos: number; reaproveitados: number; lidosNoAsana: number };
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
  placar?: PlacarReunioes;
  items: ProspeccaoItem[];
}

// O funil é lido de uma cópia salva no Supabase (mesma tabela do Clientes Recorrentes),
// então a página abre na hora. Um admin atualiza a cópia com "Atualizar do Asana".
export const PROSPECCAO_SNAPSHOT_KEY = "__prospeccao_snapshot__";

let cache: { data: ProspeccaoData; updatedAt: Date | null } | null = null;

async function buscarDoAsana(anterior?: ProspeccaoData | null): Promise<ProspeccaoData> {
  // Manda a análise dos projetos já concluídos para o servidor não precisar reler os antigos
  const anteriores: Record<string, unknown> = {};
  for (const i of anterior?.items ?? []) {
    if (i.statusGeral !== "concluido") continue;
    anteriores[i.gid] = {
      modifiedAt: i.modifiedAt,
      desfecho: i.desfecho,
      motivo: i.motivo,
      motivoFonte: i.motivoFonte,
      etapaAtual: i.etapaAtual,
      areaJuridica: i.areaJuridica,
      origemLead: i.origemLead,
      agendamento: i.agendamento ?? null,
    };
  }
  const res = await fetch("/api/asana-prospeccao", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ anteriores }),
  });
  const result = await res.json();
  if (!res.ok || result?.error) throw new Error(result?.error || "Erro ao buscar dados do Asana");
  return result as ProspeccaoData;
}

async function lerSnapshot(): Promise<{ data: ProspeccaoData; updatedAt: Date } | null> {
  const { data, error } = await supabase
    .from("dashboard_data")
    .select("data, updated_at")
    .eq("file_name", PROSPECCAO_SNAPSHOT_KEY)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data?.data) return null;
  return { data: data.data as unknown as ProspeccaoData, updatedAt: new Date(data.updated_at) };
}

async function salvarSnapshot(payload: ProspeccaoData) {
  const json = JSON.parse(JSON.stringify(payload));
  const { data: existente } = await supabase
    .from("dashboard_data").select("id").eq("file_name", PROSPECCAO_SNAPSHOT_KEY).maybeSingle();
  const { error } = existente
    ? await supabase.from("dashboard_data")
        .update({ data: json, updated_at: new Date().toISOString() })
        .eq("id", existente.id)
    : await supabase.from("dashboard_data").insert({ file_name: PROSPECCAO_SNAPSHOT_KEY, data: json });
  if (error) throw new Error(error.message);
}

/** Busca no Asana e grava a cópia no Supabase. Só admins conseguem gravar. */
export async function sincronizarProspeccaoDoAsana(): Promise<ProspeccaoData> {
  let anterior: ProspeccaoData | null = cache?.data ?? null;
  if (!anterior) {
    try { anterior = (await lerSnapshot())?.data ?? null; } catch { anterior = null; }
  }
  const fresh = await buscarDoAsana(anterior);
  await salvarSnapshot(fresh);
  cache = { data: fresh, updatedAt: new Date() };
  window.dispatchEvent(new Event("prospeccaoAtualizada"));
  return fresh;
}

export function useProspeccaoData() {
  const [data, setData] = useState<ProspeccaoData | null>(cache?.data ?? null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(cache?.updatedAt ?? null);
  const [isLoading, setIsLoading] = useState(!cache);
  const [isSyncing, setIsSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(!cache);
    setError(null);
    try {
      const snap = await lerSnapshot();
      if (snap) {
        cache = snap;
        setData(snap.data);
        setUpdatedAt(snap.updatedAt);
      } else {
        // Ainda não existe cópia salva: mostra a leitura direta do Asana, sem gravar
        const fresh = await buscarDoAsana();
        cache = { data: fresh, updatedAt: null };
        setData(fresh);
        setUpdatedAt(new Date(fresh.generatedAt));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar o funil de prospecção");
    } finally {
      setIsLoading(false);
    }
  }, []);

  const sincronizar = useCallback(async () => {
    setIsSyncing(true);
    setError(null);
    try {
      const fresh = await sincronizarProspeccaoDoAsana();
      setData(fresh);
      setUpdatedAt(new Date());
    } finally {
      setIsSyncing(false);
    }
  }, []);

  useEffect(() => {
    load();
    const onAtualizada = () => {
      if (cache) {
        setData(cache.data);
        setUpdatedAt(cache.updatedAt);
      }
    };
    window.addEventListener("prospeccaoAtualizada", onAtualizada);
    return () => window.removeEventListener("prospeccaoAtualizada", onAtualizada);
  }, [load]);

  return { data, updatedAt, isLoading, isSyncing, error, reload: load, sincronizar };
}
