import { importAtosProjetos, ParsedAtoProjeto, ImportAtosResult } from "./atos-parser";

export interface AsanaAtosSyncResult extends ImportAtosResult {
  warnings: string[];
  source: string;
  stats: {
    projetosEncontrados: number;
    tasksComHoras: number;
    lancamentos: number;
    minutos: number;
  };
}

/**
 * Busca os projetos de ato direto do Asana (via /api/asana-atos) e persiste
 * usando exatamente o mesmo caminho da importação por CSV — ou seja,
 * valor_combinado, toggle de não-billable e contrato anexado são preservados
 * nos projetos que já existem.
 */
export async function syncAtosFromAsana(): Promise<AsanaAtosSyncResult> {
  const res = await fetch("/api/asana-atos", { method: "POST" });
  const payload = await res.json();

  if (!res.ok || payload?.error) {
    throw new Error(payload?.error || "Erro ao buscar atos no Asana");
  }

  const projetos = (payload.projetos ?? []) as ParsedAtoProjeto[];
  const warnings = (payload.warnings ?? []) as string[];
  const stats = payload.stats ?? {
    projetosEncontrados: 0,
    tasksComHoras: 0,
    lancamentos: 0,
    minutos: 0,
  };

  if (projetos.length === 0) {
    return {
      success: true,
      projetosImportados: 0,
      lancamentosImportados: 0,
      projetosSubstituidos: 0,
      warnings,
      source: payload.source ?? "none",
      stats,
    };
  }

  const result = await importAtosProjetos(projetos);

  return { ...result, warnings, source: payload.source ?? "unknown", stats };
}
