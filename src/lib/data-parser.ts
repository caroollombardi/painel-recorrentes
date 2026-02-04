import { getLawyerHourlyRate } from "./lawyer-prices";

export interface TaskRecord {
  taskId: string;
  project: string;
  actualTime: string;
  contrato: string;
  hours: number;
  completedAt: string;
  assignee: string;
  value: number; // hours * hourlyRate
}

export interface ClientData {
  project: string;
  horasMensal: number;
  horasOutros: number;
  totalHoras: number;
  isRisk: boolean;
  valorMensal: number;
  valorOutros: number;
  valorTotal: number;
}

export interface DashboardData {
  clients: ClientData[];
  totalMensal: number;
  totalOutros: number;
  topMensalClient: string;
  topMensalHours: number;
  percentDiff: number;
  totalValorMensal: number;
  totalValorOutros: number;
  totalValor: number;
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
      value,
    });
  }
  
  // Aggregate by client
  const clientMap = new Map<string, { mensal: number; outros: number; valorMensal: number; valorOutros: number }>();
  
  records.forEach(record => {
    const current = clientMap.get(record.project) || { mensal: 0, outros: 0, valorMensal: 0, valorOutros: 0 };
    
    if (record.contrato === 'MENSAL') {
      current.mensal += record.hours;
      current.valorMensal += record.value;
    } else if (record.contrato === 'ATO' || record.contrato === 'TABELA') {
      current.outros += record.hours;
      current.valorOutros += record.value;
    }
    
    clientMap.set(record.project, current);
  });
  
  // Convert to array and calculate totals
  let totalMensal = 0;
  let totalOutros = 0;
  let totalValorMensal = 0;
  let totalValorOutros = 0;
  let topMensalClient = '';
  let topMensalHours = 0;
  
  const clients: ClientData[] = [];
  
  clientMap.forEach((data, project) => {
    // Only include clients with at least one of the contract types
    if (data.mensal > 0 || data.outros > 0) {
      totalMensal += data.mensal;
      totalOutros += data.outros;
      totalValorMensal += data.valorMensal;
      totalValorOutros += data.valorOutros;
      
      if (data.mensal > topMensalHours) {
        topMensalHours = data.mensal;
        topMensalClient = project;
      }
      
      clients.push({
        project,
        horasMensal: Math.round(data.mensal * 100) / 100,
        horasOutros: Math.round(data.outros * 100) / 100,
        totalHoras: Math.round((data.mensal + data.outros) * 100) / 100,
        isRisk: data.mensal > data.outros && data.mensal > 0,
        valorMensal: Math.round(data.valorMensal * 100) / 100,
        valorOutros: Math.round(data.valorOutros * 100) / 100,
        valorTotal: Math.round((data.valorMensal + data.valorOutros) * 100) / 100,
      });
    }
  });
  
  // Sort by total hours descending
  clients.sort((a, b) => b.totalHoras - a.totalHoras);
  
  const percentDiff = totalOutros > 0 
    ? Math.round(((totalMensal - totalOutros) / totalOutros) * 100)
    : totalMensal > 0 ? 100 : 0;
  
  return {
    clients,
    totalMensal: Math.round(totalMensal * 100) / 100,
    totalOutros: Math.round(totalOutros * 100) / 100,
    topMensalClient,
    topMensalHours: Math.round(topMensalHours * 100) / 100,
    percentDiff,
    totalValorMensal: Math.round(totalValorMensal * 100) / 100,
    totalValorOutros: Math.round(totalValorOutros * 100) / 100,
    totalValor: Math.round((totalValorMensal + totalValorOutros) * 100) / 100,
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
