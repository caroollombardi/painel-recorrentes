import type { VercelRequest, VercelResponse } from "@vercel/node";

const ASANA_BASE = "https://app.asana.com/api/1.0";
const PORTFOLIO_GID = "1211494420370314"; // WSA - PROSPECÇÃO

async function asanaGet(path: string, pat: string): Promise<unknown> {
  const res = await fetch(`${ASANA_BASE}${path}`, {
    headers: { Authorization: `Bearer ${pat}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Asana ${path} → ${res.status}: ${text}`);
  }
  return res.json();
}

async function asanaGetAll<T>(basePath: string, pat: string): Promise<T[]> {
  const results: T[] = [];
  let offset: string | null = null;
  do {
    const url = offset ? `${basePath}&offset=${encodeURIComponent(offset)}` : basePath;
    const json = (await asanaGet(url, pat)) as { data: T[]; next_page: { offset: string } | null };
    results.push(...json.data);
    offset = json.next_page?.offset ?? null;
  } while (offset);
  return results;
}

interface PortfolioItem {
  gid: string;
  name: string;
  archived: boolean;
  created_at: string;
  modified_at: string;
  owner: { name: string } | null;
  current_status: { color: string; text: string } | null;
}

type StatusGeral = "em_dia" | "em_espera" | "concluido" | "sem_status";
type Desfecho = "ganho" | "perdido" | "generico" | "vazio" | null;

interface ProspeccaoItem {
  gid: string;
  name: string;
  owner: string | null;
  statusGeral: StatusGeral;
  desfecho: Desfecho;
  resumo: string;
  modifiedAt: string;
}

const GANHO_HINTS = ["negócio fechado", "negocio fechado", "contrato assinado", "contrato atualizado", "fechado."];
const PERDIDO_HINTS = [
  "não seguiu", "nao seguiu", "não fechou", "nao fechou", "não respondeu", "nao respondeu",
  "recusado", "não renovou", "nao renovou", "mais barato", "desistiu", "não avançou", "nao avancou",
];
const GENERICO_HINTS = ["foi marcado como concluído", "foi marcado como concluido"];

function extractResumo(fullText: string): string {
  const match = fullText.match(/Resumo\s*([\s\S]*?)(?:Próximos passos|Proximos passos|$)/i);
  return (match?.[1] ?? "").replace(/-{3,}/g, "").trim();
}

function classifyDesfecho(resumo: string): Desfecho {
  if (!resumo) return "vazio";
  const lower = resumo.toLowerCase();
  if (GENERICO_HINTS.some((h) => lower.includes(h))) return "generico";
  if (PERDIDO_HINTS.some((h) => lower.includes(h))) return "perdido";
  if (GANHO_HINTS.some((h) => lower.includes(h))) return "ganho";
  return "generico"; // tem texto mas não bate com os padrões conhecidos — precisa de revisão humana
}

function classifyStatusGeral(color: string | undefined): StatusGeral {
  if (color === "green") return "em_dia";
  if (color === "blue") return "em_espera";
  if (color === "complete") return "concluido";
  return "sem_status";
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  try {
    const pat = process.env.ASANA_PAT;
    if (!pat) return res.status(500).json({ error: "ASANA_PAT não configurado" });

    const rawItems = await asanaGetAll<PortfolioItem>(
      `/portfolios/${PORTFOLIO_GID}/items` +
        `?opt_fields=name,archived,created_at,modified_at,owner.name,current_status.color,current_status.text` +
        `&limit=100`,
      pat
    );

    const items: ProspeccaoItem[] = rawItems
      .filter((p) => !p.archived && !p.name.trim().toLowerCase().includes("[nome do cliente]"))
      .map((p) => {
        const color = p.current_status?.color;
        const statusGeral = classifyStatusGeral(color);
        const resumo = p.current_status?.text ? extractResumo(p.current_status.text) : "";
        return {
          gid: p.gid,
          name: p.name.trim(),
          owner: p.owner?.name ?? null,
          statusGeral,
          desfecho: statusGeral === "concluido" ? classifyDesfecho(resumo) : null,
          resumo,
          modifiedAt: p.modified_at,
        };
      });

    const total = items.length;
    const emDia = items.filter((i) => i.statusGeral === "em_dia").length;
    const emEspera = items.filter((i) => i.statusGeral === "em_espera").length;
    const semStatus = items.filter((i) => i.statusGeral === "sem_status").length;
    const concluidos = items.filter((i) => i.statusGeral === "concluido");
    const ganho = concluidos.filter((i) => i.desfecho === "ganho").length;
    const perdido = concluidos.filter((i) => i.desfecho === "perdido").length;
    const generico = concluidos.filter((i) => i.desfecho === "generico").length;
    const vazio = concluidos.filter((i) => i.desfecho === "vazio").length;

    const pendentes = concluidos
      .filter((i) => i.desfecho === "vazio" || i.desfecho === "generico")
      .map((i) => ({ gid: i.gid, name: i.name, owner: i.owner, desfecho: i.desfecho }))
      .sort((a, b) => (a.owner ?? "").localeCompare(b.owner ?? ""));

    const porResponsavel: Record<string, { concluidos: number; semMotivo: number }> = {};
    for (const i of concluidos) {
      const owner = i.owner ?? "Sem responsável";
      if (!porResponsavel[owner]) porResponsavel[owner] = { concluidos: 0, semMotivo: 0 };
      porResponsavel[owner].concluidos += 1;
      if (i.desfecho === "vazio" || i.desfecho === "generico") porResponsavel[owner].semMotivo += 1;
    }

    return res.json({
      generatedAt: new Date().toISOString(),
      resumo: {
        total,
        emDia,
        emEspera,
        semStatus,
        concluidos: concluidos.length,
        ganho,
        perdido,
        generico,
        vazio,
        taxaSemMotivo: concluidos.length > 0 ? Math.round(((vazio + generico) / concluidos.length) * 100) : 0,
      },
      porResponsavel,
      pendentes,
      items,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("asana-prospeccao:", msg);
    return res.status(500).json({ error: msg });
  }
}
