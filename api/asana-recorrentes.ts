import type { VercelRequest, VercelResponse } from "@vercel/node";

export const config = { maxDuration: 60 };

const WORKSPACE_GID = "1209757363771221";
const ASANA_BASE = "https://app.asana.com/api/1.0";
const CONCURRENCY = 8;

const CLIENT_ALIASES: Record<string, string[]> = {
  "SUPLOS": ["SUPLOS (ALMOX)"],
};

// O Asana marca o tipo de contrato de cada TASK (não do projeto) através do
// custom field "CONTRATO" (single-select). Só tasks com valor "MENSAL" nesse
// campo entram no cálculo de Horas Consumidas / Uso do Crédito.
const CONTRACT_FIELD_NAME = "CONTRATO";
const RECURRING_FIELD_VALUE = "MENSAL";

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
}

interface AsanaTask {
  gid: string;
  name: string;
  completed: boolean;
  completed_at: string | null;
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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

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

    const perJob = await mapWithConcurrency(jobs, CONCURRENCY, async (job): Promise<RawRecord[]> => {
      try {
        const tasks = await asanaGetAll<AsanaTask>(
          `/projects/${job.project.gid}/tasks` +
            `?opt_fields=name,completed,completed_at,actual_time_minutes,assignee.name,custom_fields.name,custom_fields.display_value` +
            `&completed_since=${encodeURIComponent(monthStart)}&limit=100`,
          pat
        );
        return tasks
          .filter((t) => t.completed && t.actual_time_minutes && t.actual_time_minutes > 0 && isRecurringTask(t))
          .map((t) => ({
            taskId: t.gid,
            taskName: t.name,
            project: job.clientName,
            assignee: t.assignee?.name ?? "",
            actualTimeMinutes: t.actual_time_minutes as number,
            completedAt: t.completed_at ?? "",
          }));
      } catch {
        return [];
      }
    });

    return res.json({
      generatedAt: new Date().toISOString(),
      clientsSearched: clientNames.length,
      projectsFound: jobs.length,
      records: perJob.flat(),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("asana-recorrentes:", msg);
    return res.status(500).json({ error: msg });
  }
}
