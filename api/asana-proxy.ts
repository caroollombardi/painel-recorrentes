import type { VercelRequest, VercelResponse } from "@vercel/node";

const WORKSPACE_GID = "1209757363771221";
const ASANA_BASE = "https://app.asana.com/api/1.0";

const CLIENT_ALIASES: Record<string, string[]> = {
  "SUPLOS": ["SUPLOS (ALMOX)"],
};

async function verifySupabaseToken(token: string): Promise<boolean> {
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl || !supabaseAnonKey) return false;

  const res = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: supabaseAnonKey,
    },
  });
  return res.ok;
}

async function asanaGet(path: string, pat: string): Promise<unknown> {
  const res = await fetch(`${ASANA_BASE}${path}`, {
    headers: { Authorization: `Bearer ${pat}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Asana API error ${res.status}`);
  }
  const json = (await res.json()) as { data: unknown; next_page: { offset: string } | null };
  return json;
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

interface AsanaProject {
  gid: string;
  name: string;
  archived: boolean;
}

interface AsanaTask {
  gid: string;
  name: string;
  due_on: string | null;
  completed: boolean;
  completed_at: string | null;
  assignee: { name: string } | null;
}

interface CategorizedTask extends AsanaTask {
  projectName: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Verify Supabase session token
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  const isValid = await verifySupabaseToken(token);
  if (!isValid) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const pat = process.env.ASANA_PAT;
    if (!pat) {
      return res.status(500).json({ error: "Configuração incompleta" });
    }

    const clientName = (req.body?.client as string)?.trim();
    if (!clientName || clientName.length < 2) {
      return res.status(400).json({ error: "client é obrigatório" });
    }

    const clientKey = clientName.toUpperCase();
    const searchKeys = [clientKey, ...(CLIENT_ALIASES[clientKey] ?? [])];

    const projects = await asanaGetAll<AsanaProject>(
      `/workspaces/${WORKSPACE_GID}/projects?opt_fields=name,gid,archived&limit=100`,
      pat
    );

    const matching = projects.filter((p) => {
      if (p.archived) return false;
      const key = p.name.split(" - ")[0].trim().toUpperCase();
      return searchKeys.some((sk) => key === sk || sk.startsWith(key) || key.startsWith(sk));
    });

    if (matching.length === 0) {
      return res.json({
        projects: [],
        tasks: { overdue: [], dueSoon: [], recentlyCompleted: [], upcoming: [] },
      });
    }

    const now = new Date();
    const today = now.toISOString().split("T")[0];
    const in7Days = new Date(now.getTime() + 7 * 86400000).toISOString().split("T")[0];
    const ago30Days = new Date(now.getTime() - 30 * 86400000).toISOString();

    const overdue: CategorizedTask[] = [];
    const dueSoon: CategorizedTask[] = [];
    const recentlyCompleted: CategorizedTask[] = [];
    const upcoming: CategorizedTask[] = [];

    for (const project of matching) {
      const tasks = await asanaGetAll<AsanaTask>(
        `/projects/${project.gid}/tasks` +
          `?opt_fields=name,due_on,completed,completed_at,assignee.name` +
          `&completed_since=${encodeURIComponent(ago30Days)}&limit=100`,
        pat
      );

      for (const t of tasks) {
        const task: CategorizedTask = { ...t, projectName: project.name };
        if (t.completed) {
          recentlyCompleted.push(task);
        } else if (t.due_on) {
          if (t.due_on < today) overdue.push(task);
          else if (t.due_on <= in7Days) dueSoon.push(task);
          else upcoming.push(task);
        }
      }
    }

    overdue.sort((a, b) => (a.due_on ?? "").localeCompare(b.due_on ?? ""));
    dueSoon.sort((a, b) => (a.due_on ?? "").localeCompare(b.due_on ?? ""));
    recentlyCompleted.sort((a, b) =>
      (b.completed_at ?? "").localeCompare(a.completed_at ?? "")
    );
    upcoming.sort((a, b) => (a.due_on ?? "").localeCompare(b.due_on ?? ""));

    return res.json({
      projects: matching.map((p) => ({ gid: p.gid, name: p.name })),
      tasks: {
        overdue: overdue.slice(0, 20),
        dueSoon: dueSoon.slice(0, 20),
        recentlyCompleted: recentlyCompleted.slice(0, 20),
        upcoming: upcoming.slice(0, 20),
      },
    });
  } catch (err: unknown) {
    console.error("asana-proxy:", err instanceof Error ? err.message : String(err));
    return res.status(500).json({ error: "Erro ao buscar dados do Asana" });
  }
}
