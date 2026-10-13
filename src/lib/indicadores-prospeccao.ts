import type { ProspeccaoItem } from "@/hooks/use-prospeccao-data";

// Projetos anteriores a esta data tiveram tarefas marcadas em lote (ex.: 14/09),
// então as datas não medem o tempo real. Eles contam no índice, mas não nos tempos.
export const TEMPOS_DESDE = "2026-09-30T00:00:00-03:00";
const TEMPOS_DESDE_MS = new Date(TEMPOS_DESDE).getTime();

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

export type EtapaEmDia = "Aguardando reunião" | "Aguardando proposta" | "Aguardando decisão" | "Sem etapas no Asana";

export interface LeadEmDia {
  gid: string;
  nome: string;
  owner: string | null;
  etapa: EtapaEmDia;
  semStatus: boolean;
  dias: number; // dias na etapa atual
}

export interface LeadEmEspera {
  gid: string;
  nome: string;
  owner: string | null;
  dias: number; // dias desde a última atualização de status do projeto no Asana
}

export interface IndicadoresComerciais {
  status: { emDia: number; emEspera: number; concluidos: number; semStatus: number };
  concluidosSemResultado: number;
  ganhos: number;
  perdidos: number;
  indiceFechamento: number | null;
  ateProposta: TempoEtapa;
  ateGanho: TempoEtapa;
  atePerda: TempoEtapa;
  leadsPorMes: { mes: string; leads: number }[];
  emDia: LeadEmDia[];
  emEspera: LeadEmEspera[];
}

export function calcularIndicadores(items: ProspeccaoItem[], agora = Date.now()): IndicadoresComerciais {
  const desde = (iso: string) => Math.max(0, Math.floor((agora - new Date(iso).getTime()) / DIA_MS));

  const decididos = items.filter((i) => i.desfecho === "ganho" || i.desfecho === "perdido");
  const ganhos = decididos.filter((i) => i.desfecho === "ganho").length;
  const perdidos = decididos.length - ganhos;

  const recentes = items.filter((i) => new Date(i.createdAt).getTime() >= TEMPOS_DESDE_MS && i.marcos);
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
  // Últimos 6 meses, incluindo os meses sem nenhum lead
  const leadsPorMes: { mes: string; leads: number }[] = [];
  const [anoAtual, mesAtual] = mesSP(new Date(agora).toISOString()).split("-").map(Number);
  for (let k = 5; k >= 0; k--) {
    const d = new Date(Date.UTC(anoAtual, mesAtual - 1 - k, 1));
    const mes = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    leadsPorMes.push({ mes, leads: porMes[mes] ?? 0 });
  }

  // O status do projeto no Asana manda: só lead "Em dia" (ou sem status) tem etapa em andamento.
  // "Em espera" fica numa lista própria; "Concluído" está encerrado, seja ganho ou perdido.
  const emDia: LeadEmDia[] = items
    .filter((i) => (i.statusGeral === "em_dia" || i.statusGeral === "sem_status") && !i.desfecho)
    .map((i) => {
      const proposta = i.marcos?.propostaEm ?? null;
      // Reunião já aconteceu: tarefa "Reunião Comercial" concluída ou data da reunião no passado
      const dataReuniao = i.agendamento?.reuniaoData;
      const teveReuniao =
        i.etapaAtual === "Reunião" ||
        i.etapaAtual === "Negociação" ||
        (!!dataReuniao && new Date(dataReuniao.length <= 10 ? `${dataReuniao}T23:59:59-03:00` : dataReuniao).getTime() <= agora);
      const etapa: EtapaEmDia = proposta
        ? "Aguardando decisão"
        : i.etapaAtual === "Sem estrutura de funil"
          ? "Sem etapas no Asana"
          : teveReuniao
            ? "Aguardando proposta"
            : "Aguardando reunião";
      return {
        gid: i.gid,
        nome: i.name,
        owner: i.owner,
        etapa,
        semStatus: i.statusGeral === "sem_status",
        dias: desde(proposta ?? i.createdAt),
      };
    })
    .sort((a, b) => b.dias - a.dias);

  const emEspera: LeadEmEspera[] = items
    .filter((i) => i.statusGeral === "em_espera")
    .map((i) => ({ gid: i.gid, nome: i.name, owner: i.owner, dias: desde(i.statusDesde ?? i.modifiedAt) }))
    .sort((a, b) => b.dias - a.dias);

  return {
    status: {
      emDia: items.filter((i) => i.statusGeral === "em_dia").length,
      emEspera: emEspera.length,
      concluidos: items.filter((i) => i.statusGeral === "concluido").length,
      semStatus: items.filter((i) => i.statusGeral === "sem_status").length,
    },
    // Concluídos sem ganho nem perda identificáveis: ficam fora do índice de fechamento
    concluidosSemResultado: items.filter(
      (i) => i.statusGeral === "concluido" && i.desfecho !== "ganho" && i.desfecho !== "perdido"
    ).length,
    ganhos,
    perdidos,
    indiceFechamento: decididos.length ? Math.round((ganhos / decididos.length) * 100) : null,
    ateProposta: { mediana: mediana(ateProposta), base: ateProposta.length },
    ateGanho: { mediana: mediana(ganhosT), base: ganhosT.length },
    atePerda: { mediana: mediana(perdasT), base: perdasT.length },
    leadsPorMes,
    emDia,
    emEspera,
  };
}
