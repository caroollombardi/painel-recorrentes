import type { VercelRequest, VercelResponse } from "@vercel/node";

export const config = { maxDuration: 60 };

const WORKSPACE_GID = "1209757363771221";
const ASANA_BASE = "https://app.asana.com/api/1.0";
const CONCURRENCY = 4; // menos chamadas simultâneas = menos risco de 429

const CLIENT_ALIASES: Record<string, string[]> = {
  "SUPLOS": ["SUPLOS (ALMOX)"],
};

// O Asana marca o tipo de contrato de cada TASK (não do projeto) através do
// custom field "CONTRATO" (single-select). Só tasks com valor "MENSAL" nesse
// campo entram no cálculo de Horas Consumidas / Uso do Crédito.
const CONTRACT_FIELD_NAME = "CONTRATO";
const RECURRING_FIELD_VALUE = "MENSAL";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Quando o Asana responde 429 (limite de uso), ele diz no header Retry-After
// quantos segundos esperar. Esperamos e tentamos de novo, até 4 vezes, sem
// passar de ~40 s no total para caber no limite de 60 s da Vercel.
const MAX_TENTATIVAS = 4;
const ESPERA_MAX_TOTAL_MS = 40_000;
let esperaAcumuladaMs = 0;

async function asanaGet(path: string, pat: string): Promise<unknown> {
  for (let tentativa = 1; ; tentativa++) {
    const res = await fetch(`${ASANA_BASE}${path}`, {
      headers: { Authorization: `Bearer ${pat}` },
    });
    if (res.status === 429 && tentativa < MAX_TENTATIVAS) {
      const retryAfter = Number(res.headers.get("retry-after")) || 2 ** tentativa;
      const esperaMs = Math.min(retryAfter, 20) * 1000;
      if (esperaAcumuladaMs + esperaMs <= ESPERA_MAX_TOTAL_MS) {
        esperaAcumuladaMs += esperaMs;
        await sleep(esperaMs);
        continue;
      }
    }
    if (!res.ok) {
      const text = await res.text();
      if (res.status === 429) {
        throw new Error("O Asana pediu uma pausa (limite de uso). Aguarde 1 minuto e clique em atualizar de novo.");
      }
      throw new Error(`Asana ${path} → ${res.status}: ${text}`);
    }
    return res.json();
  }
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

function isRecurringTask(task: AsanaTask): boolean {
  const field = (task.custom_fields ?? []).find(
    (f) => f.name?.trim().toUpperCase() === CONTRACT_FIELD_NAME
  );
  // CONTRATO é multi-select: display_value vem como lista ("MENSAL, ATO").
  // Comparar com === descartava silenciosamente toda task com mais de um valor.
  if (!field?.display_value) return false;
  return field.display_value
    .split(",")
    .map((v) => v.trim().toUpperCase())
    .includes(RECURRING_FIELD_VALUE);
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

interface AsanaProject {
  gid: string;
  name: string;
  archived: boolean;
}

interface AsanaCustomField {
  name: string;
  display_value: string | null;
  number_value?: number | null;
  representation_type?: string | null;
}

interface AsanaTask {
  gid: string;
  name: string;
  completed: boolean;
  completed_at: string | null;
  due_on: string | null;
  actual_time_minutes: number | null;
  assignee: { name: string } | null;
  custom_fields?: AsanaCustomField[];
}

interface RawRecord {
  taskId: string;
  taskName: string;
  project: string; // nome do cliente (não do projeto do Asana)
  assignee: string;
  actualTimeMinutes: number;
  completedAt: string;
}

// Tarefa ainda aberta, com prazo no mês corrente: vira provisão de horas.
interface ProvisaoRecord {
  taskId: string;
  taskName: string;
  project: string;
  assignee: string;
  /** null = a tarefa não tem horas estimadas preenchidas no Asana. */
  estimatedMinutes: number | null;
  dueOn: string;
}

// Campo de estimativa do Asana. O nativo ("Estimated time"/"Tempo estimado")
// vem SEMPRE em minutos (ex.: number_value 60, display "1h 00m"); a API não
// devolve representation_type para ele, então a unidade é decidida pelo nome.
// Só um campo numérico próprio chamado "Horas estimadas" é lido como horas.
const ESTIMATE_FIELDS_MINUTES = ["ESTIMATED TIME", "TEMPO ESTIMADO"];
const ESTIMATE_FIELDS_HOURS = ["HORAS ESTIMADAS"];

function estimatedMinutes(task: AsanaTask): number | null {
  const fields = task.custom_fields ?? [];
  const nome = (f: AsanaCustomField) => f.name?.trim().toUpperCase() ?? "";
  const emMinutos = fields.find((f) => ESTIMATE_FIELDS_MINUTES.includes(nome(f)));
  if (emMinutos?.number_value != null && emMinutos.number_value > 0) return emMinutos.number_value;
  const emHoras = fields.find((f) => ESTIMATE_FIELDS_HOURS.includes(nome(f)));
  if (emHoras?.number_value != null && emHoras.number_value > 0) {
    // Se o display vier como duração ("1h 00m"), o número já está em minutos.
    return /\d+\s*h/i.test(emHoras.display_value ?? "") ? emHoras.number_value : emHoras.number_value * 60;
  }
  return null;
}

// Mês corrente no fuso do escritório, no formato "YYYY-MM".
function currentMonthKey(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date());
  const y = parts.find((p) => p.type === "year")?.value;
  const m = parts.find((p) => p.type === "month")?.value;
  return `${y}-${m}`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  esperaAcumuladaMs = 0;
  try {
    const pat = process.env.ASANA_PAT;
    if (!pat) return res.status(500).json({ error: "ASANA_PAT não configurado" });

    const clientNames = (req.body?.clientNames as string[]) ?? [];
    if (!Array.isArray(clientNames) || clientNames.length === 0) {
      return res.status(400).json({ error: "clientNames é obrigatório" });
    }

    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1)).toISOString();

    const projects = await asanaGetAll<AsanaProject>(
      `/workspaces/${WORKSPACE_GID}/projects?opt_fields=name,archived&limit=100`,
      pat
    );

    const jobs: { project: AsanaProject; clientName: string }[] = [];
    for (const clientName of clientNames) {
      const key = clientName.trim().toUpperCase();
      const searchKeys = [key, ...(CLIENT_ALIASES[key] ?? [])];
      const matching = projects.filter((p) => {
        if (p.archived) return false;
        const pKey = p.name.split(" - ")[0].trim().toUpperCase();
        return searchKeys.some((sk) => pKey === sk || sk.startsWith(pKey) || pKey.startsWith(sk));
      });
      for (const p of matching) jobs.push({ project: p, clientName });
    }

    const monthKey = currentMonthKey();

    const perJob = await mapWithConcurrency(jobs, CONCURRENCY, async (job): Promise<{ records: RawRecord[]; provisoes: ProvisaoRecord[] }> => {
      try {
        const tasks = await asanaGetAll<AsanaTask>(
          `/projects/${job.project.gid}/tasks` +
            `?opt_fields=name,completed,completed_at,due_on,actual_time_minutes,assignee.name,` +
            `custom_fields.name,custom_fields.display_value,custom_fields.number_value,custom_fields.representation_type` +
            `&completed_since=${encodeURIComponent(monthStart)}&limit=100`,
          pat
        );
        // completed_since também traz as tarefas ainda abertas — são elas que
        // formam a provisão (sem nenhuma chamada extra ao Asana).
        const provisoes: ProvisaoRecord[] = tasks
          .filter((t) => !t.completed && t.due_on?.startsWith(monthKey) && isRecurringTask(t))
          .map((t) => ({
            taskId: t.gid,
            taskName: t.name,
            project: job.clientName,
            assignee: t.assignee?.name ?? "",
            estimatedMinutes: estimatedMinutes(t),
            dueOn: t.due_on as string,
          }));

        const records = tasks
          .filter((t) => t.completed && t.actual_time_minutes && t.actual_time_minutes > 0 && isRecurringTask(t))
          .map((t) => ({
            taskId: t.gid,
            taskName: t.name,
            project: job.clientName,
            assignee: t.assignee?.name ?? "",
            actualTimeMinutes: t.actual_time_minutes as number,
            completedAt: t.completed_at ?? "",
          }));

        return { records, provisoes };
      } catch {
        return { records: [], provisoes: [] };
      }
    });

    return res.json({
      generatedAt: new Date().toISOString(),
      clientsSearched: clientNames.length,
      projectsFound: jobs.length,
      records: perJob.flatMap((j) => j.records),
      provisoes: perJob.flatMap((j) => j.provisoes),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("asana-recorrentes:", msg);
    return res.status(500).json({ error: msg });
  }
}
