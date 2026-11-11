import { getLawyerHourlyRate } from "./lawyer-prices";
import { getClientContract, calculateCreditUsage } from "./contract-values";
import { getMonthProgress, analyzeConsumption } from "./month-progress";
import { DashboardData, ClientData, TaskRecord, LawyerWork, LawyerTask, CreditUsage, ProvisionTask } from "./data-parser";

interface RawRecord {
  taskId: string;
  taskName: string;
  project: string;
  assignee: string;
  actualTimeMinutes: number;
  completedAt: string;
}

interface RawProvisao {
  taskId: string;
  taskName: string;
  project: string;
  assignee: string;
  estimatedMinutes: number | null;
  dueOn: string;
}

/** Provisão já com responsável normalizado e valor calculado. */
interface ProvisionRecord {
  project: string;
  assignee: string;
  hasEstimate: boolean;
  task: ProvisionTask;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

function formatHoursAsTime(hours: number): string {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return `${h}:${String(m).padStart(2, "0")}`;
}

export async function fetchDashboardDataFromAsana(clientNames: string[]): Promise<DashboardData> {
  const res = await fetch("/api/asana-recorrentes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clientNames }),
  });
  const result = await res.json();
  if (!res.ok || result?.error) {
    throw new Error(result?.error || "Erro ao buscar dados do Asana");
  }

  const raw = result.records as RawRecord[];

  const records: TaskRecord[] = raw.map((r) => {
    const hours = r.actualTimeMinutes / 60;
    const hourlyRate = getLawyerHourlyRate(r.assignee);
    return {
      taskId: r.taskId,
      taskName: r.taskName,
      project: r.project,
      actualTime: formatHoursAsTime(hours),
      contrato: "MENSAL",
      hours,
      completedAt: r.completedAt,
      assignee: r.assignee?.trim() || "",
      hourlyRate,
      value: hours * hourlyRate,
    };
  });

  const rawProvisoes = (result.provisoes ?? []) as RawProvisao[];
  return buildDashboardDataFromRecords(records, rawProvisoes);
}

/**
 * Valor da provisão = horas estimadas × valor-hora do responsável.
 * Tarefa sem responsável (ou com advogado fora da tabela de preços) usa o
 * valor-hora médio já realizado no cliente; se o cliente ainda não tem
 * lançamento no mês, usa a média geral do escritório.
 */
function priceProvisoes(
  raw: RawProvisao[],
  records: TaskRecord[],
): ProvisionRecord[] {
  const porCliente = new Map<string, { h: number; v: number }>();
  let hGeral = 0;
  let vGeral = 0;
  records.forEach((r) => {
    const c = porCliente.get(r.project) || { h: 0, v: 0 };
    c.h += r.hours;
    c.v += r.value;
    porCliente.set(r.project, c);
    hGeral += r.hours;
    vGeral += r.value;
  });
  const mediaGeral = hGeral > 0 ? vGeral / hGeral : 0;

  return raw.map((p) => {
    const assignee = p.assignee?.trim() || "";
    const hours = p.estimatedMinutes ? p.estimatedMinutes / 60 : 0;
    let rate = getLawyerHourlyRate(assignee);
    if (!rate) {
      const c = porCliente.get(p.project);
      rate = c && c.h > 0 ? c.v / c.h : mediaGeral;
    }
    return {
      project: p.project,
      assignee,
      hasEstimate: hours > 0,
      task: {
        taskId: p.taskId,
        taskName: p.taskName || "Sem descrição",
        dueOn: p.dueOn,
        hours: round2(hours),
        value: round2(hours * rate),
      },
    };
  });
}

// Espelha a agregação de xlsx-parser.ts (mantida separada de propósito, pra não
// arriscar alterar o fluxo de importação de planilha que já está em produção).
type LawyerAcc = {
  hours: number;
  hourlyRate: number;
  value: number;
  tasks: LawyerTask[];
  horasProv: number;
  valorProv: number;
  provTasks: ProvisionTask[];
};

const novoAcc = (hourlyRate: number): LawyerAcc => ({
  hours: 0, hourlyRate, value: 0, tasks: [], horasProv: 0, valorProv: 0, provTasks: [],
});

function buildDashboardDataFromRecords(records: TaskRecord[], rawProvisoes: RawProvisao[] = []): DashboardData {
  const clientMap = new Map<string, Map<string, LawyerAcc>>();
  const semEstimativa = new Map<string, number>();

  records.forEach((record) => {
    if (!clientMap.has(record.project)) clientMap.set(record.project, new Map());
    const lawyerMap = clientMap.get(record.project)!;
    const current = lawyerMap.get(record.assignee) || novoAcc(record.hourlyRate);
    current.hours += record.hours;
    current.value += record.value;
    current.hourlyRate = record.hourlyRate;
    // O detalhe anda ao lado do total, nunca no lugar dele.
    current.tasks.push({
      taskId: record.taskId,
      taskName: record.taskName || "Sem descrição",
      completedAt: record.completedAt || "",
      hours: Math.round(record.hours * 100) / 100,
      value: Math.round(record.value * 100) / 100,
    });
    lawyerMap.set(record.assignee, current);
  });

  // Provisão: entra no mesmo mapa, então um cliente/advogado que só tem
  // tarefas abertas no mês também aparece na tabela.
  priceProvisoes(rawProvisoes, records).forEach((p) => {
    if (!p.hasEstimate) {
      semEstimativa.set(p.project, (semEstimativa.get(p.project) ?? 0) + 1);
    }
    if (!clientMap.has(p.project)) clientMap.set(p.project, new Map());
    const lawyerMap = clientMap.get(p.project)!;
    const current = lawyerMap.get(p.assignee) || novoAcc(getLawyerHourlyRate(p.assignee));
    current.horasProv += p.task.hours;
    current.valorProv += p.task.value;
    current.provTasks.push(p.task);
    lawyerMap.set(p.assignee, current);
  });

  let totalHorasProv = 0;
  let totalValorProv = 0;

  let totalHoras = 0;
  let totalValor = 0;
  let topClient = "";
  let topClientHours = 0;
  let topClientValor = 0;

  const clients: ClientData[] = [];
  let clientsAtWarning = 0;
  let clientsAtCritical = 0;
  let clientsAtRisk = 0;
  let clientsAtOverflow = 0;

  const monthProgress = getMonthProgress();

  clientMap.forEach((lawyerMap, project) => {
    const lawyers: LawyerWork[] = [];
    let clientHours = 0;
    let clientValor = 0;
    let clientHorasProv = 0;
    let clientValorProv = 0;

    lawyerMap.forEach((data, name) => {
      lawyers.push({
        name: name || "Sem responsável",
        hours: round2(data.hours),
        hourlyRate: data.hourlyRate,
        value: round2(data.value),
        tasks: [...data.tasks].sort((a, b) => (b.completedAt || "").localeCompare(a.completedAt || "")),
        horasProvisionadas: round2(data.horasProv),
        valorProvisionado: round2(data.valorProv),
        provisionTasks: [...data.provTasks].sort((a, b) => a.dueOn.localeCompare(b.dueOn)),
      });
      clientHours += data.hours;
      clientValor += data.value;
      clientHorasProv += data.horasProv;
      clientValorProv += data.valorProv;
    });

    // Lançamento sem responsável continua fora da lista (como antes);
    // provisão sem responsável aparece, para não sumir hora prevista.
    const visiveis = lawyers.filter((l) => l.name !== "Sem responsável" || (l.provisionTasks?.length ?? 0) > 0);
    lawyers.length = 0;
    lawyers.push(...visiveis);

    lawyers.sort((a, b) => b.hours - a.hours || (b.horasProvisionadas ?? 0) - (a.horasProvisionadas ?? 0));

    totalHoras += clientHours;
    totalValor += clientValor;
    totalHorasProv += clientHorasProv;
    totalValorProv += clientValorProv;

    if (clientHours > topClientHours) {
      topClientHours = clientHours;
      topClientValor = clientValor;
      topClient = project;
    }

    const contract = getClientContract(project);
    let creditUsage: CreditUsage | null = null;

    if (contract) {
      const valorConsumido = Math.round(clientValor * 100) / 100;
      const usage = calculateCreditUsage(valorConsumido, contract.valorMensalCredito);
      const analysis = analyzeConsumption(usage.percentual, monthProgress);

      creditUsage = {
        valorPago: contract.valorMensalPago,
        valorCredito: contract.valorMensalCredito,
        valorConsumido,
        percentualUsado: usage.percentual,
        isWarning: usage.isWarning,
        isCritical: usage.isCritical,
        analysis,
      };

      if (usage.percentual >= 100) {
        clientsAtOverflow++;
        clientsAtCritical++;
      } else if (usage.percentual >= 80) {
        clientsAtRisk++;
        clientsAtCritical++;
      } else if (usage.percentual >= 60) {
        clientsAtWarning++;
      }
    }

    clients.push({
      project,
      horasMensal: Math.round(clientHours * 100) / 100,
      valorMensal: Math.round(clientValor * 100) / 100,
      lawyers,
      creditUsage,
      horasProvisionadas: round2(clientHorasProv),
      valorProvisionado: round2(clientValorProv),
      tarefasSemEstimativa: semEstimativa.get(project) ?? 0,
    });
  });

  clients.sort((a, b) => b.valorMensal - a.valorMensal);

  const avgHourlyRate = totalHoras > 0 ? totalValor / totalHoras : 0;

  return {
    clients,
    totalHoras: Math.round(totalHoras * 100) / 100,
    totalValor: Math.round(totalValor * 100) / 100,
    topClient,
    topClientHours: Math.round(topClientHours * 100) / 100,
    topClientValor: Math.round(topClientValor * 100) / 100,
    avgHourlyRate: Math.round(avgHourlyRate * 100) / 100,
    totalHorasProvisionadas: round2(totalHorasProv),
    totalValorProvisionado: round2(totalValorProv),
    clientsAtWarning,
    clientsAtCritical,
    clientsAtRisk,
    clientsAtOverflow,
    monthProgress,
  };
}
