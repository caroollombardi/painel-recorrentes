import type { VercelRequest, VercelResponse } from "@vercel/node";
// extensão .js obrigatória: o projeto é "type": "module" e a Vercel roda o JS compilado
import { agruparRegistros, type RegistroTask } from "./_lib/registros-core.js";

export const config = { maxDuration: 60 };

const ASANA_BASE = "https://app.asana.com/api/1.0";
const WORKSPACE_GID = "1209757363771221"; // Wolff & Scripes Advogados
const CONCURRENCY = 8;
const SEARCH_LIMIT = 100;
const OPT_FIELDS = "name,completed,created_at,completed_at,actual_time_minutes,assignee.name,projects.name";
// A busca do Asana casa palavras inteiras, então cada variação entra separada
const TERMOS = ["registro", "registros", "registrar", "protocolo", "exigência", "junta", "JUCEPAR", "rerratificação"];

async function asanaGet(path: string, pat: string): Promise<unknown> {
  const res = await fetch(`${ASANA_BASE}${path}`, { headers: { Authorization: `Bearer ${pat}` } });
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

function janelasMensais(meses: number, agora: Date): [Date, Date][] {
  const janelas: [Date, Date][] = [];
  for (let i = meses - 1; i >= 0; i--) {
    const inicio = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth() - i, 1));
    const fim = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth() - i + 1, 1));
    janelas.push([inicio, fim]);
  }
  return janelas;
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
      for (const [inicio, fim] of janelasMensais(meses, agora)) {
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
