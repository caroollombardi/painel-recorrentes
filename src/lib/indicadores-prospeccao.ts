import type { ProspeccaoItem } from "@/hooks/use-prospeccao-data";

// Projetos anteriores a esta data tiveram tarefas marcadas em lote (ex.: 14/09),
// então as datas não medem o tempo real. Eles contam no índice, mas não nos tempos.
export const TEMPOS_DESDE = "2026-09-30T00:00:00-03:00";

const DIA_MS = 86_400_000;

const dias = (inicio: string, fim: string) => (new Date(fim).getTime() - new Date(inicio).getTime()) / DIA_MS;

function mediana(valores: number[]): number | null {
  if (!valores.length) return null;
  const v = [...valores].sort((a, b) => a - b);
  const meio = Math.floor(v.length / 2);
  const m = v.length % 2 ? v[meio] : (v[meio - 1] + v[meio]) / 2;
  return Math.round(m * 10) / 10;
}

export const mesSP = (iso: string) =>
  new Date(iso).toLocaleString("sv-SE", { timeZone: "America/Sao_Paulo" }).slice(0, 7);

export interface TempoEtapa {
  mediana: number | null;
  base: number;
}

export interface LeadAberto {
  gid: string;
  nome: string;
  owner: string | null;
  etapa: "Aguardando proposta" | "Aguardando decisão";
  diasNaEtapa: number;
}

export interface IndicadoresComerciais {
  ganhos: number;
  perdidos: number;
  indiceFechamento: number | null;
  ateProposta: TempoEtapa;
  ateGanho: TempoEtapa;
  atePerda: TempoEtapa;
  leadsPorMes: { mes: string; leads: number }[];
  abertos: LeadAberto[];
}

export function calcularIndicadores(items: ProspeccaoItem[], agora = Date.now()): IndicadoresComerciais {
  const decididos = items.filter((i) => i.desfecho === "ganho" || i.desfecho === "perdido");
  const ganhos = decididos.filter((i) => i.desfecho === "ganho").length;
  const perdidos = decididos.length - ganhos;

  const recentes = items.filter((i) => i.createdAt >= TEMPOS_DESDE && i.marcos);
  const ateProposta = recentes
    .filter((i) => i.marcos!.propostaEm)
    .map((i) => dias(i.createdAt, i.marcos!.propostaEm!))
    .filter((d) => d >= 0);
  const propostaAteDecisao = (desfecho: "ganho" | "perdido") =>
    recentes
      .filter((i) => i.desfecho === desfecho && i.marcos!.propostaEm && i.marcos!.decisaoEm)
      .map((i) => dias(i.marcos!.propostaEm!, i.marcos!.decisaoEm!))
      .filter((d) => d >= 0);
  const ganhosT = propostaAteDecisao("ganho");
  const perdasT = propostaAteDecisao("perdido");

  const porMes: Record<string, number> = {};
  for (const i of items) porMes[mesSP(i.createdAt)] = (porMes[mesSP(i.createdAt)] ?? 0) + 1;
  const leadsPorMes = Object.keys(porMes).sort().slice(-6).map((mes) => ({ mes, leads: porMes[mes] }));

  const abertos: LeadAberto[] = items
    .filter((i) => i.statusGeral !== "concluido" && !i.desfecho && i.marcos)
    .map((i) => {
      const proposta = i.marcos!.propostaEm;
      return {
        gid: i.gid,
        nome: i.name,
        owner: i.owner,
        etapa: proposta ? ("Aguardando decisão" as const) : ("Aguardando proposta" as const),
        diasNaEtapa: Math.floor((agora - new Date(proposta ?? i.createdAt).getTime()) / DIA_MS),
      };
    })
    .sort((a, b) => b.diasNaEtapa - a.diasNaEtapa);

  return {
    ganhos,
    perdidos,
    indiceFechamento: decididos.length ? Math.round((ganhos / decididos.length) * 100) : null,
    ateProposta: { mediana: mediana(ateProposta), base: ateProposta.length },
    ateGanho: { mediana: mediana(ganhosT), base: ganhosT.length },
    atePerda: { mediana: mediana(perdasT), base: perdasT.length },
    leadsPorMes,
    abertos,
  };
}
