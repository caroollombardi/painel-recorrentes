/** Meta individual padrão: cada membro deve lançar esta quantidade de horas por dia útil */
export const DAILY_TARGET_HOURS = 6;

/** Limite de horas/dia por membro que indica necessidade de aceleração */
export const DAILY_ALERT_THRESHOLD = 8;

/** Membros excluídos da computação de lançamento de horas */
export const EXCLUDED_MEMBERS = [
  "Lorenzo",
  "Pedro",
  "Natalí",
  "Aline",
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
    ([key]) => {
      const [memberName, period] = key.split("-").length > 2
        ? [key.substring(0, key.lastIndexOf("-", key.lastIndexOf("-") - 1)), key.substring(key.lastIndexOf("-", key.lastIndexOf("-") - 1) + 1)]
        : [key, ""];
      return name.toLowerCase().includes(memberName.toLowerCase()) && period === monthStr;
    }
  );
  return match ? match[1] : 0;
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
