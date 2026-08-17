import { importAtosProjetos, ParsedAtoProjeto } from "./atos-parser";

interface ProjetoRef {
  gid: string;
  name: string;
}

export interface SyncProgress {
  fase: "listando" | "atos-por-nome" | "varrendo-tags" | "salvando" | "concluido";
  processados: number;
  total: number;
  encontrados: number;
}

export interface AsanaAtosSyncResult {
  success: boolean;
  error?: string;
  atosPorNome: number;
  atosPorTag: number;
  lancamentos: number;
  minutos: number;
  projetosVarridos: number;
  totalProjetosAtivos: number;
  warnings: string[];
  source: string;
}

const LOTE_NOME = 2; // projetos de ato por chamada (cada um puxa lançamento por lançamento)
const LOTE_TAG = 40; // projetos por chamada na varredura de tag (1 chamada cada, barato)

async function callEndpoint(body: Record<string, unknown>) {
  const res = await fetch("/api/asana-atos", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const texto = await res.text();
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(texto);
  } catch {
    // A Vercel devolve HTML/texto em caso de timeout ou erro de plataforma.
    // Traduz pra algo que faça sentido em vez de "Unexpected token".
    throw new Error(
      res.status === 504
        ? "A chamada ao Asana passou do tempo limite da Vercel. Tente novamente — o progresso já salvo é preservado."
        : `Erro ${res.status} na chamada ao servidor (resposta não-JSON).`
    );
  }

  if (!res.ok || payload?.error) {
    throw new Error(String(payload?.error ?? `Erro ${res.status}`));
  }
  return payload;
}

/**
 * Sincroniza os atos do Asana em lotes.
 *
 * Faz duas coisas distintas, porque os atos são marcados de dois jeitos:
 *  1. Projeto cujo nome termina em "- Ato" → o projeto inteiro é o ato
 *  2. Projeto com outro nome, mas com atividades marcadas ATO no campo
 *     CONTRATO → só as atividades marcadas contam
 *
 * Cada lote é gravado assim que chega, então uma falha no meio do caminho
 * não perde o que já foi processado.
 */
export async function syncAtosFromAsana(
  onProgress?: (p: SyncProgress) => void
): Promise<AsanaAtosSyncResult> {
  const warnings: string[] = [];
  let source = "time_tracking_entries";
  let atosPorNome = 0;
  let atosPorTag = 0;
  let lancamentos = 0;
  let minutos = 0;
  let projetosVarridos = 0;

  const report = (p: SyncProgress) => onProgress?.(p);

  // ---------------------------------------------------------------
  // 1. Classificação dos projetos
  // ---------------------------------------------------------------
  report({ fase: "listando", processados: 0, total: 0, encontrados: 0 });

  const lista = await callEndpoint({ action: "list" });
  const porNome = (lista.porNome ?? []) as ProjetoRef[];
  const candidatos = (lista.candidatos ?? []) as ProjetoRef[];
  const totalProjetosAtivos = Number(lista.totalProjetosAtivos ?? 0);

  // ---------------------------------------------------------------
  // 2. Varredura em lotes, gravando conforme avança
  // ---------------------------------------------------------------
  async function processar(
    fila: ProjetoRef[],
    mode: "nome" | "tag",
    tamanhoLote: number,
    fase: SyncProgress["fase"]
  ) {
    let restante = [...fila];
    let processados = 0;

    while (restante.length > 0) {
      const lote = restante.slice(0, tamanhoLote);
      restante = restante.slice(lote.length);

      const resp = await callEndpoint({ action: "scan", mode, projetos: lote });

      const projetos = (resp.projetos ?? []) as ParsedAtoProjeto[];
      const pendentes = (resp.pendentes ?? []) as ProjetoRef[];
      const respWarnings = (resp.warnings ?? []) as string[];
      const stats = (resp.stats ?? {}) as Record<string, number>;

      if (resp.source === "actual_time_minutes") source = "actual_time_minutes";

      for (const w of respWarnings) {
        if (!warnings.includes(w)) warnings.push(w);
      }

      // O servidor devolve o que não caiu no orçamento de tempo dele;
      // volta pra fila e continua na próxima chamada.
      if (pendentes.length > 0) restante = [...pendentes, ...restante];

      projetosVarridos += Number(stats.projetosVarridos ?? 0);
      lancamentos += Number(stats.lancamentos ?? 0);
      minutos += Number(stats.minutos ?? 0);

      if (projetos.length > 0) {
        const r = await importAtosProjetos(projetos);
        if (!r.success) throw new Error(r.error ?? "Erro ao gravar os atos no banco.");
        if (mode === "nome") atosPorNome += projetos.length;
        else atosPorTag += projetos.length;
      }

      processados += lote.length - pendentes.length;
      report({
        fase,
        processados: Math.max(processados, 0),
        total: fila.length,
        encontrados: atosPorNome + atosPorTag,
      });
    }
  }

  await processar(porNome, "nome", LOTE_NOME, "atos-por-nome");
  await processar(candidatos, "tag", LOTE_TAG, "varrendo-tags");

  report({
    fase: "concluido",
    processados: porNome.length + candidatos.length,
    total: porNome.length + candidatos.length,
    encontrados: atosPorNome + atosPorTag,
  });

  return {
    success: true,
    atosPorNome,
    atosPorTag,
    lancamentos,
    minutos,
    projetosVarridos,
    totalProjetosAtivos,
    warnings,
    source,
  };
}
