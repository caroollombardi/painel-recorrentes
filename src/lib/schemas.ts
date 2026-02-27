import { z } from "zod";

// Schema for validating LawyerWork
const lawyerWorkSchema = z.object({
  name: z.string(),
  hours: z.number(),
  hourlyRate: z.number(),
  value: z.number(),
});

// Schema for ConsumptionAnalysis
const consumptionAnalysisSchema = z.object({
  percentConsumed: z.number(),
  percentElapsed: z.number(),
  consumptionRate: z.number(),
  isAheadOfSchedule: z.boolean(),
  projectedEndOfMonth: z.number(),
  riskLevel: z.enum(["ok", "attention", "risk", "critical"]),
}).optional();

// Schema for CreditUsage
const creditUsageSchema = z.object({
  valorPago: z.number(),
  valorCredito: z.number(),
  valorConsumido: z.number(),
  percentualUsado: z.number(),
  isWarning: z.boolean(),
  isCritical: z.boolean(),
  analysis: consumptionAnalysisSchema,
}).nullable();

// Schema for ClientData
const clientDataSchema = z.object({
  project: z.string(),
  horasMensal: z.number(),
  valorMensal: z.number(),
  lawyers: z.array(lawyerWorkSchema),
  creditUsage: creditUsageSchema,
});

// Schema for MonthProgress
const monthProgressSchema = z.object({
  currentDay: z.number(),
  totalDays: z.number(),
  percentElapsed: z.number(),
  daysRemaining: z.number(),
});

// Schema for DashboardData
export const dashboardDataSchema = z.object({
  clients: z.array(clientDataSchema),
  totalHoras: z.number(),
  totalValor: z.number(),
  topClient: z.string(),
  topClientHours: z.number(),
  topClientValor: z.number(),
  avgHourlyRate: z.number(),
  clientsAtWarning: z.number(),
  clientsAtCritical: z.number(),
  clientsAtRisk: z.number(),
  clientsAtOverflow: z.number(),
  monthProgress: monthProgressSchema,
});
