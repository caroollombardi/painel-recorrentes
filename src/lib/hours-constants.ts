/** Meta individual padrão: cada membro deve lançar esta quantidade de horas por dia útil */
export const DAILY_TARGET_HOURS = 6;

/** Limite de horas/dia por membro que indica necessidade de aceleração */
export const DAILY_ALERT_THRESHOLD = 8;

/** Membros excluídos da computação de lançamento de horas */
export const EXCLUDED_MEMBERS = [
  "Lorenzo",
  "Pedro",
  "Carol",
];

/** Verifica se um membro é excluído da meta */
export function isExcludedMember(name: string): boolean {
  const lower = name.toLowerCase();
  return EXCLUDED_MEMBERS.some(ex => lower.includes(ex.toLowerCase()));
}

/** Número fixo de membros considerados para a meta */
export const TARGET_MEMBER_COUNT = 8;

/**
 * Metas individuais customizadas (horas/dia).
 * Membros não listados aqui usam DAILY_TARGET_HOURS.
 */
export const MEMBER_DAILY_TARGETS: Record<string, number> = {
  "Laura": 3.5,
};

/**
 * Abatimentos de horas na meta por ausências (férias, folgas, etc).
 * Chave: "NomeMembro-YYYY-MM", Valor: horas a descontar da meta do período.
 */
export const MEMBER_TARGET_ADJUSTMENTS: Record<string, Record<string, number>> = {
  "Sabrina": { "2026-03": 6 }, // Férias dia 13/03
  "Manuela": { "2026-03": 36 }, // Férias 02/03 a 09/03 (6 dias úteis × 6h)
};

/** Retorna a meta diária de um membro (customizada ou padrão) */
export function getMemberDailyTarget(name: string): number {
  const match = Object.entries(MEMBER_DAILY_TARGETS).find(
    ([key]) => name.toLowerCase().includes(key.toLowerCase())
  );
  return match ? match[1] : DAILY_TARGET_HOURS;
}

/** Retorna o abatimento de horas na meta para um membro em um mês específico */
export function getMemberTargetAdjustment(name: string, month: number, year: number): number {
  const monthStr = `${year}-${String(month + 1).padStart(2, "0")}`;
  const match = Object.entries(MEMBER_TARGET_ADJUSTMENTS).find(
    ([key]) => name.toLowerCase().includes(key.toLowerCase())
  );
  if (!match) return 0;
  return match[1][monthStr] || 0;
}

/**
 * Retorna a meta total de um membro para o período (dias úteis × meta diária - abatimentos).
 * Use esta função em vez de calcular manualmente.
 */
export function getMemberPeriodTarget(name: string, businessDays: number, month: number, year: number): number {
  const dailyTarget = getMemberDailyTarget(name);
  const adjustment = getMemberTargetAdjustment(name, month, year);
  return Math.max(0, businessDays * dailyTarget - adjustment);
}

/**
 * Meta diária total do time considerando metas individuais.
 * Se memberNames for fornecido, soma as metas individuais;
 * caso contrário, usa TARGET_MEMBER_COUNT * DAILY_TARGET_HOURS.
 */
export function getTeamDailyTarget(memberNames?: string[]): number {
  if (!memberNames) return TARGET_MEMBER_COUNT * DAILY_TARGET_HOURS;
  return memberNames.reduce((sum, name) => sum + getMemberDailyTarget(name), 0);
}

/** Retorna o total de horas de abatimento do time para um mês (soma de todos os membros) */
export function getTeamTargetAdjustment(month: number, year: number): number {
  const monthStr = `${year}-${String(month + 1).padStart(2, "0")}`;
  let total = 0;
  for (const adjustments of Object.values(MEMBER_TARGET_ADJUSTMENTS)) {
    total += adjustments[monthStr] || 0;
  }
  return total;
}
