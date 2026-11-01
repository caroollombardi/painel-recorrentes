import type { VercelRequest, VercelResponse } from "@vercel/node";
// extensão .js obrigatória: o projeto é "type": "module" e a Vercel roda o JS compilado
import { agruparRegistros, type RegistroTask } from "./_lib/registros-core.js";

export const config = { maxDuration: 60 };

const ASANA_BASE = "https://app.asana.com/api/1.0";
const WORKSPACE_GID = "1209757363771221"; // Wolff & Scripes Advogados
// A busca do Asana tem limite de chamadas por minuto bem menor que o resto da API:
// poucas chamadas em paralelo, janelas trimestrais e nova tentativa quando vier 429
const CONCURRENCY = 3;
const SEARCH_LIMIT = 100;
const MAX_TENTATIVAS = 4;
const OPT_FIELDS = "name,completed,created_at,completed_at,actual_time_minutes,assignee.name,projects.name";
// A busca casa palavras inteiras; tarefas de "junta"/"JUCEPAR" quase sempre trazem também registro ou protocolo
const TERMOS = ["registro", "registrar", "protocolo", "exigência", "rerratificação"];

async function asanaGet(path: string, pat: string, tentativa = 1): Promise<unknown> {
  const res = await fetch(`${ASANA_BASE}${path}`, { headers: { Authorization: `Bearer ${pat}` } });
  if (res.status === 429 && tentativa < MAX_TENTATIVAS) {
    const espera = Math.min(Number(res.headers.get("retry-after")) || 2 ** tentativa, 20);
    await new Promise((r) => setTimeout(r, espera * 1000));
    return asanaGet(path, pat, tentativa + 1);
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Asana ${path} → ${res.status}: ${text}`);
  }
  return res.json();
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(new Array(Math.min(limit, items.length)).fill(0).map(worker));
  return results;
}

function searchPath(termo: string, extra: string): string {
  return `/workspaces/${WORKSPACE_GID}/tasks/search?text=${encodeURIComponent(termo)}` +
    `&opt_fields=${OPT_FIELDS}&limit=${SEARCH_LIMIT}&sort_by=created_at&sort_ascending=true${extra}`;
}

// A busca não pagina: se a janela vier cheia, divide ao meio até caber
async function buscarJanela(pat: string, termo: string, inicio: Date, fim: Date, profundidade = 0): Promise<RegistroTask[]> {
  const extra = `&created_at.after=${inicio.toISOString()}&created_at.before=${fim.toISOString()}`;
  const json = (await asanaGet(searchPath(termo, extra), pat)) as { data: RegistroTask[] };
  if (json.data.length < SEARCH_LIMIT || profundidade >= 5) return json.data;
  const meio = new Date((inicio.getTime() + fim.getTime()) / 2);
  const [a, b] = await Promise.all([
    buscarJanela(pat, termo, inicio, meio, profundidade + 1),
    buscarJanela(pat, termo, meio, fim, profundidade + 1),
  ]);
  return [...a, ...b];
}

function janelas(meses: number, agora: Date, mesesPorJanela = 3): [Date, Date][] {
  const lista: [Date, Date][] = [];
  const fimTotal = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth() + 1, 1));
  for (let i = meses; i > 0; i -= mesesPorJanela) {
    const inicio = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth() + 1 - i, 1));
    const fim = new Date(Math.min(
      Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth() + 1 - i + mesesPorJanela, 1),
      fimTotal.getTime(),
    ));
    lista.push([inicio, fim]);
  }
  return lista;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  try {
    const pat = process.env.ASANA_PAT;
    if (!pat) return res.status(500).json({ error: "ASANA_PAT não configurado" });

    const meses = Math.min(Math.max(Number(req.query.meses) || 13, 1), 24);
    const agora = new Date();

    const consultas: (() => Promise<RegistroTask[]>)[] = [];
    for (const termo of TERMOS) {
      for (const [inicio, fim] of janelas(meses, agora)) {
        consultas.push(() => buscarJanela(pat, termo, inicio, fim));
      }
      // registros ainda abertos que começaram antes da janela
      consultas.push(async () =>
        ((await asanaGet(searchPath(termo, "&completed=false"), pat)) as { data: RegistroTask[] }).data
      );
    }

    const resultados = await mapWithConcurrency(consultas, CONCURRENCY, (fn) => fn());
    const porGid = new Map<string, RegistroTask>();
    for (const t of resultados.flat()) porGid.set(t.gid, t);

    const registros = agruparRegistros([...porGid.values()], agora);

    // cache na borda da Vercel: evita refazer dezenas de buscas no Asana a cada visita
    res.setHeader("Cache-Control", "s-maxage=600, stale-while-revalidate=1800");
    return res.json({
      generatedAt: agora.toISOString(),
      periodoMeses: meses,
      tarefasLidas: porGid.size,
      registros,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("asana-registros:", msg);
    return res.status(500).json({ error: msg });
  }
}
