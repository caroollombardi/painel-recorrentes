import type { VercelRequest, VercelResponse } from "@vercel/node";

export const config = { maxDuration: 60 };

const ASANA_BASE = "https://app.asana.com/api/1.0";
const PORTFOLIO_GID = "1211494420370314"; // WSA - PROSPECÇÃO
const CONCURRENCY = 8;

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

interface PortfolioItem {
  gid: string;
  name: string;
  archived: boolean;
  created_at: string;
  modified_at: string;
  owner: { name: string } | null;
  current_status: { color: string; text: string } | null;
}

interface AsanaTask {
  gid: string;
  name: string;
  completed: boolean;
  notes: string;
  memberships: { section: { name: string } }[];
  custom_fields: { name: string; display_value: string | null }[];
}

type StatusGeral = "em_dia" | "em_espera" | "concluido" | "sem_status";
type Desfecho = "ganho" | "perdido" | "generico" | "vazio" | null;
type MotivoFonte = "tarefa_funil" | "status_projeto" | "nao_encontrado";
type Etapa =
  | "Lead recebido" | "Reunião" | "Proposta enviada" | "Negociação"
  | "Ganho" | "Perdido" | "Sem estrutura de funil";

interface ProspeccaoItem {
  gid: string;
  name: string;
  owner: string | null;
  statusGeral: StatusGeral;
  desfecho: Desfecho;
  motivo: string;
  motivoFonte: MotivoFonte;
  etapaAtual: Etapa;
  areaJuridica: string | null;
  origemLead: string | null;
  createdAt: string;
  modifiedAt: string;
}

// --- Classificação legada (fallback), lida no texto livre do status do projeto ---
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

function classifyDesfechoLegado(resumo: string): Desfecho {
  if (!resumo) return "vazio";
  const lower = resumo.toLowerCase();
  if (GENERICO_HINTS.some((h) => lower.includes(h))) return "generico";
  if (PERDIDO_HINTS.some((h) => lower.includes(h))) return "perdido";
  if (GANHO_HINTS.some((h) => lower.includes(h))) return "ganho";
  return "generico";
}

function classifyStatusGeral(color: string | undefined): StatusGeral {
  if (color === "green") return "em_dia";
  if (color === "blue") return "em_espera";
  if (color === "complete") return "concluido";
  return "sem_status";
}

function bucketEtapa(taskName: string): Etapa | null {
  const n = taskName.trim().toLowerCase();
  if (n.includes("ganho")) return "Ganho";
  if (n.includes("perdido")) return "Perdido";
  if (n.includes("lead recebido")) return "Lead recebido";
  if (n.includes("reunião comercial") || n.includes("reuniao comercial")) return "Reunião";
  if (n.includes("qualificação") || n.includes("qualificacao") || n.includes("salvar proposta") || n.includes("enviar proposta")) return "Proposta enviada";
  if (n.includes("fup") || n.includes("negociação") || n.includes("negociacao")) return "Negociação";
  return null;
}

function findField(fields: { name: string; display_value: string | null }[], label: string): string | null {
  const f = fields.find((c) => c.name.trim().toLowerCase() === label.toLowerCase());
  return f?.display_value?.trim() || null;
}

async function analisarProjeto(pat: string, project: PortfolioItem): Promise<{
  desfecho: Desfecho; motivo: string; motivoFonte: MotivoFonte; etapaAtual: Etapa;
  areaJuridica: string | null; origemLead: string | null;
}> {
  const color = project.current_status?.color;
  const statusGeral = classifyStatusGeral(color);
  const resumoLegado = project.current_status?.text ? extractResumo(project.current_status.text) : "";

  let tasks: AsanaTask[] = [];
  try {
    tasks = await asanaGetAll<AsanaTask>(
      `/projects/${project.gid}/tasks?opt_fields=name,completed,notes,memberships.section.name,custom_fields.name,custom_fields.display_value&limit=100`,
      pat
    );
  } catch {
    tasks = [];
  }

  const comercial = tasks.filter((t) => t.memberships.some((m) => m.section?.name === "FASE COMERCIAL"));

  if (comercial.length === 0) {
    // Projeto sem o template de funil (comum em prospecções antigas) — usa o fallback antigo
    return {
      desfecho: statusGeral === "concluido" ? classifyDesfechoLegado(resumoLegado) : null,
      motivo: resumoLegado,
      motivoFonte: statusGeral === "concluido" ? "status_projeto" : "nao_encontrado",
      etapaAtual: "Sem estrutura de funil",
      areaJuridica: null,
      origemLead: null,
    };
  }

  const leadTask = comercial.find((t) => t.name.trim().toLowerCase().includes("lead recebido"));
  const areaJuridica = leadTask ? findField(leadTask.custom_fields, "Área jurídica") : null;
  const origemLead = leadTask ? findField(leadTask.custom_fields, "Origem do Lead") : null;

  const posVenda = tasks.filter((t) =>
    t.memberships.some((m) => m.section?.name === "FASE CONTRATUAL" || m.section?.name === "FASE ONBOARDING")
  );
  const avancouPosVenda = posVenda.some((t) => t.completed);

  const terminal = comercial.find((t) => t.completed && /ganho|perdido/i.test(t.name));

  if (avancouPosVenda) {
    // Sinal mais forte: se qualquer tarefa de fase contratual/onboarding foi concluída,
    // o negócio foi ganho, mesmo que a tarefa "Ganho" em si não tenha sido marcada.
    return {
      desfecho: "ganho",
      motivo: terminal?.notes?.trim() || "",
      motivoFonte: "tarefa_funil",
      etapaAtual: "Ganho",
      areaJuridica,
      origemLead,
    };
  }

  if (terminal) {
    const isGanho = /ganho/i.test(terminal.name);
    return {
      desfecho: isGanho ? "ganho" : "perdido",
      motivo: terminal.notes?.trim() || "",
      motivoFonte: "tarefa_funil",
      etapaAtual: isGanho ? "Ganho" : "Perdido",
      areaJuridica,
      origemLead,
    };
  }

  // Ainda em andamento: etapa = última tarefa concluída da fase comercial, na ordem em que aparecem
  let etapaAtual: Etapa = "Lead recebido";
  for (const t of comercial) {
    if (!t.completed) continue;
    const bucket = bucketEtapa(t.name);
    if (bucket && bucket !== "Ganho" && bucket !== "Perdido") etapaAtual = bucket;
  }

  return {
    desfecho: statusGeral === "concluido" ? classifyDesfechoLegado(resumoLegado) : null,
    motivo: statusGeral === "concluido" ? resumoLegado : "",
    motivoFonte: statusGeral === "concluido" ? "status_projeto" : "nao_encontrado",
    etapaAtual,
    areaJuridica,
    origemLead,
  };
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

    const filtered = rawItems.filter(
      (p) => !p.archived && !p.name.trim().toLowerCase().includes("[nome do cliente]")
    );

    const analises = await mapWithConcurrency(filtered, CONCURRENCY, (p) => analisarProjeto(pat, p));

    const items: ProspeccaoItem[] = filtered.map((p, idx) => {
      const a = analises[idx];
      return {
        gid: p.gid,
        name: p.name.trim(),
        owner: p.owner?.name ?? null,
        statusGeral: classifyStatusGeral(p.current_status?.color),
        desfecho: a.desfecho,
        motivo: a.motivo,
        motivoFonte: a.motivoFonte,
        etapaAtual: a.etapaAtual,
        areaJuridica: a.areaJuridica,
        origemLead: a.origemLead,
        createdAt: p.created_at,
        modifiedAt: p.modified_at,
      };
    });

    const total = items.length;
    const emDiaItems = items.filter((i) => i.statusGeral === "em_dia");
    const emEsperaItems = items.filter((i) => i.statusGeral === "em_espera");
    const emDia = emDiaItems.length;
    const emEspera = emEsperaItems.length;
    const semStatus = items.filter((i) => i.statusGeral === "sem_status").length;
    const concluidos = items.filter((i) => i.statusGeral === "concluido");
    const ganho = concluidos.filter((i) => i.desfecho === "ganho").length;
    const perdido = concluidos.filter((i) => i.desfecho === "perdido").length;
    const generico = concluidos.filter((i) => i.desfecho === "generico").length;
    const vazio = concluidos.filter((i) => i.desfecho === "vazio").length;

    const now = Date.now();
    const seteDias = 7 * 86400000;
    const trintaDias = 30 * 86400000;
    const emEsperaAntigos = emEsperaItems.filter((i) => now - new Date(i.modifiedAt).getTime() > seteDias).length;
    const novosUltimos30Dias = items.filter((i) => now - new Date(i.createdAt).getTime() <= trintaDias).length;
    const comEstruturaFunil = items.filter((i) => i.etapaAtual !== "Sem estrutura de funil").length;

    const pendentes = concluidos
      .filter((i) => i.desfecho === "vazio" || i.desfecho === "generico")
      .map((i) => ({ gid: i.gid, name: i.name, owner: i.owner, desfecho: i.desfecho, motivoFonte: i.motivoFonte }))
      .sort((a, b) => (a.owner ?? "").localeCompare(b.owner ?? ""));

    const porResponsavel: Record<string, { concluidos: number; semMotivo: number; pct: number }> = {};
    for (const i of concluidos) {
      const owner = i.owner ?? "Sem responsável";
      if (!porResponsavel[owner]) porResponsavel[owner] = { concluidos: 0, semMotivo: 0, pct: 0 };
      porResponsavel[owner].concluidos += 1;
      if (i.desfecho === "vazio" || i.desfecho === "generico") porResponsavel[owner].semMotivo += 1;
    }
    for (const owner of Object.keys(porResponsavel)) {
      const r = porResponsavel[owner];
      r.pct = r.concluidos > 0 ? Math.round((r.semMotivo / r.concluidos) * 100) : 0;
    }

    const funilEtapas: Record<Etapa, number> = {
      "Lead recebido": 0, "Reunião": 0, "Proposta enviada": 0, "Negociação": 0,
      "Ganho": 0, "Perdido": 0, "Sem estrutura de funil": 0,
    };
    for (const i of items) funilEtapas[i.etapaAtual] += 1;

    const origemLeadCounts: Record<string, number> = {};
    const areaJuridicaCounts: Record<string, number> = {};
    for (const i of items) {
      if (i.origemLead) origemLeadCounts[i.origemLead] = (origemLeadCounts[i.origemLead] ?? 0) + 1;
      if (i.areaJuridica) areaJuridicaCounts[i.areaJuridica] = (areaJuridicaCounts[i.areaJuridica] ?? 0) + 1;
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
        emEsperaAntigos,
        novosUltimos30Dias,
        semMotivo: vazio + generico,
        taxaSemMotivo: concluidos.length > 0 ? Math.round(((vazio + generico) / concluidos.length) * 100) : 0,
        taxaConversaoClassificados: ganho + perdido > 0 ? Math.round((ganho / (ganho + perdido)) * 100) : null,
        comEstruturaFunil,
        semEstruturaFunil: total - comEstruturaFunil,
      },
      funilEtapas,
      origemLeadCounts,
      areaJuridicaCounts,
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
