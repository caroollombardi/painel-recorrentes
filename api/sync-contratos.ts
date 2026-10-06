import type { VercelRequest, VercelResponse } from "@vercel/node";

// =====================================================================
// Indicadores da área de Contratos · sincronização Asana → Supabase
// Padrão do time: cada demanda é um projeto com tarefas de elaboração (tag "WSA - Contratos"),
// a tarefa de entrega (tag "WSA - Entrega Externa") e o FUP (tag "WSA - FUP").
// Quando a tag falta, o nome da tarefa serve de reserva ("… Entrega Externa", "FUP - …").
// Grava em public.contratos_tarefas; os indicadores saem das views no Supabase.
//
// Quem pode chamar: o Cron da Vercel (CRON_SECRET) ou um usuário logado no painel.
// GET /api/sync-contratos              → últimos 120 dias
// GET /api/sync-contratos?desde=AAAA-MM-DD → carga histórica
// =====================================================================

export const config = { maxDuration: 60 };

const ASANA = "https://app.asana.com/api/1.0";
const DIAS_PADRAO = 120;
const PARALELO = 6;

const RE_ENTREGA = /entrega\s+externa/i;
const RE_FUP = /^\s*fup\b/i;
const RE_CANCELADO = /^\s*\[cancelad[oa]\]/i;
const TAG_ENTREGA = "wsa - entrega externa";
const TAG_FUP = "wsa - fup";
const TAG_ENTREGA_GID = "1210824813481544";

const OPT_FIELDS = [
  "name", "created_at", "completed", "completed_at", "due_on", "permalink_url",
  "assignee.name", "actual_time_minutes", "tags.name",
  "custom_fields.name", "custom_fields.number_value", "custom_fields.display_value",
].join(",");

interface AsanaTask {
  gid: string;
  name: string;
  created_at: string;
  completed?: boolean;
  completed_at?: string | null;
  due_on?: string | null;
  permalink_url?: string;
  assignee?: { name: string } | null;
  actual_time_minutes?: number | null;
  custom_fields?: { name: string; number_value?: number | null; display_value?: string | null }[];
  tags?: { name: string }[];
  memberships?: { project?: { gid: string; name: string } }[];
}

const norm = (s: string) => (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();

function dataLocal(iso?: string | null): string | null {
  if (!iso) return null;
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(iso));
}

const campo = (t: AsanaTask, nome: string) => (t.custom_fields || []).find((c) => norm(c.name) === norm(nome));
const horas = (min?: number | null) => (min == null ? null : Math.round((min / 60) * 100) / 100);

function tipoTarefa(t: AsanaTask): "entrega" | "fup" | "outra" {
  const tags = (t.tags || []).map((g) => norm(g.name));
  if (tags.includes(TAG_FUP) || RE_FUP.test(t.name || "")) return "fup";
  if (tags.includes(TAG_ENTREGA) || RE_ENTREGA.test(t.name || "")) return "entrega";
  return "outra";
}

function mapearTask(t: AsanaTask, p: { gid: string; name: string }) {
  const est = campo(t, "Estimated time") ?? campo(t, "Tempo estimado");
  return {
    task_gid: t.gid,
    projeto_gid: p.gid,
    projeto_nome: p.name ?? null,
    nome: t.name,
    tipo: tipoTarefa(t),
    cancelada: RE_CANCELADO.test(t.name || ""),
    responsavel: t.assignee?.name ?? null,
    criada_ts: t.created_at,
    criada_em: dataLocal(t.created_at),
    concluida_ts: t.completed ? t.completed_at : null,
    concluida_em: t.completed ? dataLocal(t.completed_at) : null,
    concluida: !!t.completed,
    prazo: t.due_on ?? null,
    horas_estimadas: horas(est?.number_value),
    horas_lancadas: horas(t.actual_time_minutes),
    descricao_ts: campo(t, "Descrição TS")?.display_value ?? null,
    url: t.permalink_url ?? null,
    sincronizado_em: new Date().toISOString(),
  };
}

async function asana(path: string, params: Record<string, string>, pat: string): Promise<any> {
  for (;;) {
    const r = await fetch(`${ASANA}${path}?${new URLSearchParams(params)}`, {
      headers: { Authorization: `Bearer ${pat}` },
    });
    if (r.status === 429) {
      await new Promise((ok) => setTimeout(ok, Number(r.headers.get("retry-after") || 30) * 1000));
      continue;
    }
    if (!r.ok) throw new Error(`Asana ${path}: ${r.status} ${await r.text()}`);
    return r.json();
  }
}

// A busca do Asana devolve até 100 por chamada e não pagina: avança pela data de criação.
// Duas buscas: pela tag "WSA - Entrega Externa" e pelo nome, para não perder quem esqueceu a tag.
async function buscarEntregas(ws: string, pat: string, desde: string): Promise<AsanaTask[]> {
  const achadas = new Map<string, AsanaTask>();
  const filtros: Record<string, string>[] = [{ "tags.any": TAG_ENTREGA_GID }, { text: "entrega externa" }];
  for (const filtro of filtros) {
    let depois = `${desde}T00:00:00.000Z`;
    for (let i = 0; i < 50; i++) {
      const j = await asana(`/workspaces/${ws}/tasks/search`, {
        ...filtro,
        "created_at.after": depois,
        sort_by: "created_at",
        sort_ascending: "true",
        opt_fields: "name,created_at,tags.name,memberships.project.name",
        limit: "100",
      }, pat);
      for (const t of j.data as AsanaTask[]) if (tipoTarefa(t) === "entrega") achadas.set(t.gid, t);
      if (j.data.length < 100) break;
      depois = j.data[j.data.length - 1].created_at;
    }
  }
  return [...achadas.values()];
}

async function tarefasDoProjeto(gid: string, pat: string): Promise<AsanaTask[]> {
  const out: AsanaTask[] = [];
  let offset: string | undefined;
  do {
    const j = await asana(`/projects/${gid}/tasks`,
      { opt_fields: OPT_FIELDS, limit: "100", ...(offset ? { offset } : {}) }, pat);
    out.push(...j.data);
    offset = j.next_page?.offset;
  } while (offset);
  return out;
}

async function autorizado(req: VercelRequest, supaUrl: string, anonKey?: string): Promise<boolean> {
  const auth = (req.headers.authorization as string) || "";
  if (process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`) return true;
  if (!auth.startsWith("Bearer ") || !anonKey) return false;
  const r = await fetch(`${supaUrl}/auth/v1/user`, { headers: { apikey: anonKey, Authorization: auth } });
  return r.ok;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const e = process.env;
  const PAT = e.ASANA_PAT;
  const WS = e.ASANA_WORKSPACE;
  const SUPA_URL = e.SUPABASE_URL || e.VITE_SUPABASE_URL;
  const SUPA_ANON = e.VITE_SUPABASE_PUBLISHABLE_KEY || e.SUPABASE_ANON_KEY;
  const SUPA_SECRET = e.SUPABASE_SECRET_KEY || e.SUPABASE_SERVICE_ROLE_KEY;

  const faltando = Object.entries({ ASANA_PAT: PAT, ASANA_WORKSPACE: WS, VITE_SUPABASE_URL: SUPA_URL, SUPABASE_SECRET_KEY: SUPA_SECRET })
    .filter(([, v]) => !v).map(([k]) => k);
  if (faltando.length) return res.status(500).json({ ok: false, erro: `Variáveis faltando na Vercel: ${faltando.join(", ")}` });

  if (!(await autorizado(req, SUPA_URL!, SUPA_ANON))) return res.status(401).json({ ok: false, erro: "Não autorizado" });

  try {
    const q = typeof req.query.desde === "string" ? req.query.desde : "";
    const desde = /^\d{4}-\d{2}-\d{2}$/.test(q) ? q : new Date(Date.now() - DIAS_PADRAO * 864e5).toISOString().slice(0, 10);
    const excluir = e.ASANA_EXCLUIR_PROJETOS ? new RegExp(e.ASANA_EXCLUIR_PROJETOS, "i") : null;

    // 1. Projetos que seguem o padrão (têm tarefa de "Entrega Externa")
    const projetos = new Map<string, { gid: string; name: string }>();
    for (const t of await buscarEntregas(WS!, PAT!, desde)) {
      for (const m of t.memberships || []) {
        if (m.project && !excluir?.test(m.project.name || "")) projetos.set(m.project.gid, m.project);
      }
    }

    // 2. Todas as tarefas desses projetos (elaboração, entrega e FUP)
    const linhas = new Map<string, ReturnType<typeof mapearTask>>();
    const fila = [...projetos.values()];
    await Promise.all(Array.from({ length: PARALELO }, async () => {
      while (fila.length) {
        const p = fila.shift()!;
        for (const t of await tarefasDoProjeto(p.gid, PAT!)) linhas.set(t.gid, mapearTask(t, p));
      }
    }));

    // 3. Grava no Supabase (chave nova sb_secret_ vai só no apikey)
    const todas = [...linhas.values()];
    for (let i = 0; i < todas.length; i += 500) {
      const r = await fetch(`${SUPA_URL}/rest/v1/contratos_tarefas?on_conflict=task_gid`, {
        method: "POST",
        headers: {
          apikey: SUPA_SECRET!,
          ...(SUPA_SECRET!.startsWith("sb_") ? {} : { Authorization: `Bearer ${SUPA_SECRET}` }),
          "Content-Type": "application/json",
          Prefer: "resolution=merge-duplicates,return=minimal",
        },
        body: JSON.stringify(todas.slice(i, i + 500)),
      });
      if (!r.ok) throw new Error(`Supabase: ${r.status} ${await r.text()}`);
    }

    return res.status(200).json({ ok: true, desde, projetos: projetos.size, tarefas: todas.length });
  } catch (err) {
    console.error("[sync-contratos]", err);
    return res.status(500).json({ ok: false, erro: (err as Error).message });
  }
}
