import { getLawyerHourlyRate } from "./lawyer-prices";
import { getClientContract, calculateCreditUsage } from "./contract-values";
import { getMonthProgress, analyzeConsumption } from "./month-progress";
import { DashboardData, ClientData, TaskRecord, LawyerWork, CreditUsage } from "./data-parser";

interface RawRecord {
  taskId: string;
  taskName: string;
  project: string;
  assignee: string;
  actualTimeMinutes: number;
  completedAt: string;
}

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

  return buildDashboardDataFromRecords(records);
}

// Espelha a agregação de xlsx-parser.ts (mantida separada de propósito, pra não
// arriscar alterar o fluxo de importação de planilha que já está em produção).
function buildDashboardDataFromRecords(records: TaskRecord[]): DashboardData {
  const clientMap = new Map<string, Map<string, { hours: number; hourlyRate: number; value: number }>>();

  records.forEach((record) => {
    if (!clientMap.has(record.project)) clientMap.set(record.project, new Map());
    const lawyerMap = clientMap.get(record.project)!;
    const current = lawyerMap.get(record.assignee) || { hours: 0, hourlyRate: record.hourlyRate, value: 0 };
    current.hours += record.hours;
    current.value += record.value;
    current.hourlyRate = record.hourlyRate;
    lawyerMap.set(record.assignee, current);
  });

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

    lawyerMap.forEach((data, name) => {
      if (name) {
        lawyers.push({
          name,
          hours: Math.round(data.hours * 100) / 100,
          hourlyRate: data.hourlyRate,
          value: Math.round(data.value * 100) / 100,
        });
      }
      clientHours += data.hours;
      clientValor += data.value;
    });

    lawyers.sort((a, b) => b.hours - a.hours);

    totalHoras += clientHours;
    totalValor += clientValor;

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
    clientsAtWarning,
    clientsAtCritical,
    clientsAtRisk,
    clientsAtOverflow,
    monthProgress,
  };
}
