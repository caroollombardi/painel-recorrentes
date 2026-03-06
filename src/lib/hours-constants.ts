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

/** Retorna a meta diária de um membro (customizada ou padrão) */
export function getMemberDailyTarget(name: string): number {
  const match = Object.entries(MEMBER_DAILY_TARGETS).find(
    ([key]) => name.toLowerCase().includes(key.toLowerCase())
  );
  return match ? match[1] : DAILY_TARGET_HOURS;
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
