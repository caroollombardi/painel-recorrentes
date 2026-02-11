import { getLawyerHourlyRate } from "./lawyer-prices";
import { getClientContract, calculateCreditUsage } from "./contract-values";
import { getMonthProgress, analyzeConsumption, type MonthProgress, type ConsumptionAnalysis } from "./month-progress";
import { calculateAverageHours } from "./average-hours";

export interface TaskRecord {
  taskId: string;
  project: string;
  actualTime: string;
  contrato: string;
  hours: number;
  completedAt: string;
  assignee: string;
  hourlyRate: number;
  value: number; // hours * hourlyRate
}

export interface LawyerWork {
  name: string;
  hours: number;
  hourlyRate: number;
  value: number;
}

export interface CreditUsage {
  valorPago: number;
  valorCredito: number;
  valorConsumido: number;
  percentualUsado: number;
  isWarning: boolean;
  isCritical: boolean;
  analysis?: ConsumptionAnalysis; // Análise preditiva
}

export type HealthStatus = 'green' | 'yellow' | 'red';

export interface AverageHoursInfo {
  horasMediasMensais: number;
  mesesAtivos: number;
  horasContratadas: number | null; // derived from credit / avg rate
  healthStatus: HealthStatus | null;
}

export interface ClientData {
  project: string;
  horasMensal: number;
  valorMensal: number;
  lawyers: LawyerWork[];
  creditUsage: CreditUsage | null;
  averageHours: AverageHoursInfo | null;
}

export interface DashboardData {
  clients: ClientData[];
  totalHoras: number;
  totalValor: number;
  topClient: string;
  topClientHours: number;
  topClientValor: number;
  avgHourlyRate: number;
  clientsAtWarning: number;
  clientsAtCritical: number;
  clientsAtRisk: number; // Novo: clientes em 80-99%
  clientsAtOverflow: number; // Novo: clientes em 100%+
  monthProgress: MonthProgress;
}

function parseTimeToHours(time: string): number {
  if (!time || time.trim() === '') return 0;
  
  const parts = time.trim().split(':');
  if (parts.length !== 2) return 0;
  
  const hours = parseInt(parts[0], 10) || 0;
  const minutes = parseInt(parts[1], 10) || 0;
  
  return hours + (minutes / 60);
}

function extractProjectName(project: string): string {
  if (!project) return '';
  // Extract the main client name (before the first ' - ')
  const parts = project.split(' - ');
  return parts[0].trim();
}

export function parseCSVData(csvText: string): DashboardData {
  const lines = csvText.split('\n');
  const records: TaskRecord[] = [];
  
  // Skip header line
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    
    // Parse CSV with quoted fields
    const fields = parseCSVLine(line);
    
    if (fields.length < 20) continue;
    
    const project = fields[12]; // Projects column
    const actualTime = fields[17]; // Actual time column
    const contrato = fields[19]; // CONTRATO column
    const completedAt = fields[2]; // Completed At column
    const assignee = fields[6]; // Assignee column
    
    if (!project || !actualTime) continue;
    
    // Only include MENSAL contracts
    if (contrato?.trim() !== 'MENSAL') continue;
    
    const hours = parseTimeToHours(actualTime);
    if (hours === 0) continue;
    
    const hourlyRate = getLawyerHourlyRate(assignee);
    const value = hours * hourlyRate;
    
    records.push({
      taskId: fields[0],
      project: extractProjectName(project),
      actualTime,
      contrato: contrato?.trim() || '',
      hours,
      completedAt,
      assignee: assignee?.trim() || '',
      hourlyRate,
      value,
    });
  }
  
  // Aggregate by client and lawyer
  const clientMap = new Map<string, Map<string, { hours: number; hourlyRate: number; value: number }>>();
  
  records.forEach(record => {
    if (!clientMap.has(record.project)) {
      clientMap.set(record.project, new Map());
    }
    
    const lawyerMap = clientMap.get(record.project)!;
    const current = lawyerMap.get(record.assignee) || { hours: 0, hourlyRate: record.hourlyRate, value: 0 };
    
    current.hours += record.hours;
    current.value += record.value;
    current.hourlyRate = record.hourlyRate; // Keep the rate
    
    lawyerMap.set(record.assignee, current);
  });
  
  // Convert to array and calculate totals
  let totalHoras = 0;
  let totalValor = 0;
  let topClient = '';
  let topClientHours = 0;
  let topClientValor = 0;
  
  const clients: ClientData[] = [];
  let clientsAtWarning = 0;
  let clientsAtCritical = 0;
  let clientsAtRisk = 0;
  let clientsAtOverflow = 0;
  
  // Obter progresso do mês atual
  const monthProgress = getMonthProgress();
  
  clientMap.forEach((lawyerMap, project) => {
    const lawyers: LawyerWork[] = [];
    let clientHours = 0;
    let clientValor = 0;
    
    lawyerMap.forEach((data, name) => {
      if (name) { // Only include if lawyer name exists
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
    
    // Sort lawyers by hours descending
    lawyers.sort((a, b) => b.hours - a.hours);
    
    totalHoras += clientHours;
    totalValor += clientValor;
    
    if (clientHours > topClientHours) {
      topClientHours = clientHours;
      topClientValor = clientValor;
      topClient = project;
    }
    
    // Calculate credit usage for this client
    const contract = getClientContract(project);
    let creditUsage: CreditUsage | null = null;
    
    if (contract) {
      const valorConsumido = Math.round(clientValor * 100) / 100;
      const usage = calculateCreditUsage(valorConsumido, contract.valorMensalCredito);
      
      // Análise preditiva do consumo
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
      
      // Contagem por nível de alerta (3 níveis)
      if (usage.percentual >= 100) {
        clientsAtOverflow++; // Nível 3 - Estouro
        clientsAtCritical++;
      } else if (usage.percentual >= 80) {
        clientsAtRisk++; // Nível 2 - Risco
        clientsAtCritical++;
      } else if (usage.percentual >= 60) {
        clientsAtWarning++; // Nível 1 - Atenção
      }
    }
    
    // Calculate average monthly hours
    const clientAvgRate = clientHours > 0 ? clientValor / clientHours : 0;
    const averageHours = calculateAverageHours(project, clientHours, clientAvgRate, records, contract);
    
    clients.push({
      project,
      horasMensal: Math.round(clientHours * 100) / 100,
      valorMensal: Math.round(clientValor * 100) / 100,
      lawyers,
      creditUsage,
      averageHours,
    });
  });
  
  // Sort by value descending
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

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  
  result.push(current.trim());
  return result;
}
