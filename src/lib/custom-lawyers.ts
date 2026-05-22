/**
 * Advogados/colaboradores custom cadastrados manualmente pela Carol
 * (ex.: estagiários novos, contratados recentes que ainda não estão na lista
 * hardcoded em lawyer-prices.ts).
 *
 * Armazenado em localStorage pra evitar uma migration de banco só pra isso.
 * Se quiser persistir no Supabase no futuro, é só trocar as funções daqui
 * pra fazer fetch — a API pública (`getCustomLawyerRate`, `addCustomLawyer`,
 * etc.) continua igual.
 */

const STORAGE_KEY = "wsa_custom_lawyers_v1";

export interface CustomLawyer {
  name: string;
  hourlyRate: number;
  createdAt: string;
}

function loadAll(): CustomLawyer[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveAll(list: CustomLawyer[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

export function getCustomLawyers(): CustomLawyer[] {
  return loadAll();
}

/**
 * Busca a taxa de um colaborador custom (case-insensitive, com fallback
 * a match parcial por primeiro nome).
 */
export function getCustomLawyerRate(name: string): number {
  if (!name) return 0;
  const list = loadAll();
  const target = name.toLowerCase().trim();

  const exact = list.find(l => l.name.toLowerCase() === target);
  if (exact) return exact.hourlyRate;

  // Match parcial (primeiro nome)
  const firstName = target.split(" ")[0];
  const partial = list.find(
    l =>
      l.name.toLowerCase().includes(target) ||
      target.includes(l.name.toLowerCase().split(" ")[0]) ||
      l.name.toLowerCase().startsWith(firstName)
  );
  return partial ? partial.hourlyRate : 0;
}

export function addCustomLawyer(name: string, hourlyRate: number): void {
  const trimmedName = name.trim();
  if (!trimmedName || hourlyRate < 0) return;

  const list = loadAll();
  const existing = list.findIndex(
    l => l.name.toLowerCase() === trimmedName.toLowerCase()
  );

  if (existing >= 0) {
    list[existing] = {
      ...list[existing],
      hourlyRate,
    };
  } else {
    list.push({
      name: trimmedName,
      hourlyRate,
      createdAt: new Date().toISOString(),
    });
  }
  saveAll(list);
}

export function removeCustomLawyer(name: string): void {
  const list = loadAll().filter(
    l => l.name.toLowerCase() !== name.toLowerCase()
  );
  saveAll(list);
}
