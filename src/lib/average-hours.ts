import { AverageHoursInfo, HealthStatus, TaskRecord } from "./data-parser";
import { ContractValue } from "./contract-values";

/**
 * Calculate months active from task completion dates.
 * If < 30 days, calculates proportionally.
 */
function calculateMonthsActive(dates: Date[]): number {
  if (dates.length === 0) return 1;

  const sorted = dates.sort((a, b) => a.getTime() - b.getTime());
  const earliest = sorted[0];
  const latest = sorted[sorted.length - 1];

  const diffMs = latest.getTime() - earliest.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);

  if (diffDays < 30) {
    // Proportional calculation for < 30 days
    return Math.max(diffDays / 30, 1 / 30); // minimum ~1 day
  }

  // Calculate months (approximate)
  const months = diffDays / 30.44; // average days per month
  return Math.max(Math.round(months * 10) / 10, 1);
}

function parseCompletedDate(dateStr: string): Date | null {
  if (!dateStr || dateStr.trim() === '') return null;
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? null : d;
}

function getHealthStatus(avgHours: number, contractedHours: number): HealthStatus {
  const ratio = (avgHours / contractedHours) * 100;
  if (ratio <= 90) return 'green';
  if (ratio <= 110) return 'yellow';
  return 'red';
}

/**
 * Calculate average monthly hours for a client based on task records.
 */
export function calculateAverageHours(
  clientProject: string,
  clientHours: number,
  clientAvgRate: number,
  records: TaskRecord[],
  contract: ContractValue | null
): AverageHoursInfo | null {
  // Get all completion dates for this client
  const clientRecords = records.filter(r => r.project === clientProject);
  const dates = clientRecords
    .map(r => parseCompletedDate(r.completedAt))
    .filter((d): d is Date => d !== null);

  const mesesAtivos = calculateMonthsActive(dates);
  const horasMediasMensais = Math.round((clientHours / mesesAtivos) * 10) / 10;

  // Derive contracted hours from credit value / weighted avg hourly rate
  let horasContratadas: number | null = null;
  let healthStatus: HealthStatus | null = null;

  if (contract && clientAvgRate > 0) {
    horasContratadas = Math.round((contract.valorMensalCredito / clientAvgRate) * 10) / 10;
    healthStatus = getHealthStatus(horasMediasMensais, horasContratadas);
  }

  return {
    horasMediasMensais,
    mesesAtivos,
    horasContratadas,
    healthStatus,
  };
}
