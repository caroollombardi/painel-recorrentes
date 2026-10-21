import type { ProspeccaoItem } from "@/hooks/use-prospeccao-data";
import { mesSP, type LeadEmDia } from "@/lib/indicadores-prospeccao";

const DIA_MS = 86_400_000;

// ---------------------------------------------------------------------------
// 1 e 2. Entrada e saída do pipe (lei da reposição e regra dos 30 dias)
// ---------------------------------------------------------------------------

/** O lead saiu do pipe quando foi ganho, perdido ou concluído no Asana. */
export function saiuDoPipe(i: ProspeccaoItem): boolean {
  return i.desfecho === "ganho" || i.desfecho === "perdido" || i.statusGeral === "concluido";
}

/** Data de saída: a da decisão registrada; sem ela, a da última atualização de status. */
export function dataDeSaida(i: ProspeccaoItem): string {
  return i.marcos?.decisaoEm ?? i.statusDesde ?? i.modifiedAt;
}

export interface FluxoPipe {
  porMes: { mes: string; entradas: number; saidas: number }[];
  entradas30: number;
  saidas30: number;
  /** Média mensal de novos leads nos 6 meses anteriores aos últimos 30 dias */
  mediaEntradasAnterior: number;
}

export function calcularFluxo(items: ProspeccaoItem[], agora = Date.now()): FluxoPipe {
  const entradasMes: Record<string, number> = {};
  const saidasMes: Record<string, number> = {};
  let entradas30 = 0;
  let saidas30 = 0;
  let entradasAnteriores = 0;

  for (const i of items) {
    const criado = new Date(i.createdAt).getTime();
    entradasMes[mesSP(i.createdAt)] = (entradasMes[mesSP(i.createdAt)] ?? 0) + 1;
    const idade = agora - criado;
    if (idade <= 30 * DIA_MS) entradas30 += 1;
    else if (idade <= 210 * DIA_MS) entradasAnteriores += 1;

    if (saiuDoPipe(i)) {
      const saida = dataDeSaida(i);
      saidasMes[mesSP(saida)] = (saidasMes[mesSP(saida)] ?? 0) + 1;
      if (agora - new Date(saida).getTime() <= 30 * DIA_MS) saidas30 += 1;
    }
  }

  const porMes: FluxoPipe["porMes"] = [];
  const [ano, mes] = mesSP(new Date(agora).toISOString()).split("-").map(Number);
  for (let k = 5; k >= 0; k--) {
    const d = new Date(Date.UTC(ano, mes - 1 - k, 1));
    const chave = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    porMes.push({ mes: chave, entradas: entradasMes[chave] ?? 0, saidas: saidasMes[chave] ?? 0 });
  }

  return {
    porMes,
    entradas30,
    saidas30,
    mediaEntradasAnterior: Math.round((entradasAnteriores / 6) * 10) / 10,
  };
}

// ---------------------------------------------------------------------------
// 3. Conversão por etapa e por sócio (conheça seus números)
// ---------------------------------------------------------------------------

export interface Taxa {
  pct: number | null;
  avancaram: number;
  base: number;
}

export interface Conversao {
  leadReuniao: Taxa;
  reuniaoProposta: Taxa;
  propostaGanho: Taxa;
  geral: Taxa;
}

const taxa = (avancaram: number, base: number): Taxa => ({
  pct: base > 0 ? Math.round((avancaram / base) * 100) : null,
  avancaram,
  base,
});

/**
 * Taxa de cada passagem = quem avançou ÷ (quem avançou + quem foi encerrado naquela etapa).
 * Lead que ainda está na etapa não entra na conta: ele não teve tempo de avançar nem de cair.
 * Só considera projetos com a estrutura de funil no Asana (os antigos não registram as etapas).
 */
export function calcularConversao(items: ProspeccaoItem[], agora = Date.now()): Conversao {
  const comFunil = items.filter((i) => i.etapaAtual !== "Sem estrutura de funil");

  const ganhou = (i: ProspeccaoItem) => i.desfecho === "ganho";
  const encerrado = (i: ProspeccaoItem) => saiuDoPipe(i);
  const chegouProposta = (i: ProspeccaoItem) =>
    ganhou(i) || !!i.marcos?.propostaEm || i.etapaAtual === "Proposta enviada" || i.etapaAtual === "Negociação";
  const reuniaoAconteceu = (i: ProspeccaoItem) => {
    const d = i.agendamento?.reuniaoData;
    if (!d) return false;
    return new Date(d.length <= 10 ? `${d}T23:59:59-03:00` : d).getTime() <= agora;
  };
  const chegouReuniao = (i: ProspeccaoItem) =>
    chegouProposta(i) || i.etapaAtual === "Reunião" || reuniaoAconteceu(i);

  const passagem = (noInicio: (i: ProspeccaoItem) => boolean, avancou: (i: ProspeccaoItem) => boolean) => {
    const universo = comFunil.filter(noInicio);
    const a = universo.filter(avancou).length;
    const caiu = universo.filter((i) => !avancou(i) && encerrado(i)).length;
    return taxa(a, a + caiu);
  };

  const encerrados = comFunil.filter(encerrado);
  return {
    leadReuniao: passagem(() => true, chegouReuniao),
    reuniaoProposta: passagem(chegouReuniao, chegouProposta),
    propostaGanho: passagem(chegouProposta, ganhou),
    geral: taxa(encerrados.filter(ganhou).length, encerrados.length),
  };
}

// ---------------------------------------------------------------------------
// 4. Tempo mata negócio: leads parados além do normal da etapa
// ---------------------------------------------------------------------------

export const FATOR_PARADO = 1.5;
export const MINIMO_DIAS_PARADO = 14;

/**
 * Um lead está parado além do normal quando está há mais de 1,5× o tempo típico
 * (mediana) dos leads ativos na mesma etapa, e há pelo menos 14 dias.
 * Etapa com menos de 3 leads usa como referência o tempo típico do pipe inteiro.
 */
export function marcarParados(leads: LeadEmDia[]): Set<string> {
  const porEtapa: Record<string, number[]> = {};
  for (const l of leads) (porEtapa[l.etapa] ??= []).push(l.dias);

  const med = (dias: number[]) => {
    const v = [...dias].sort((a, b) => a - b);
    const m = Math.floor(v.length / 2);
    return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
  };
  // Etapa com menos de 3 leads não tem referência própria: usa o tempo típico do pipe todo
  const geral = leads.length ? med(leads.map((l) => l.dias)) : 0;
  const mediana: Record<string, number> = {};
  for (const [etapa, dias] of Object.entries(porEtapa)) mediana[etapa] = dias.length >= 3 ? med(dias) : geral;

  return new Set(
    leads
      .filter((l) => l.dias >= MINIMO_DIAS_PARADO && l.dias > mediana[l.etapa] * FATOR_PARADO)
      .map((l) => l.gid)
  );
}
