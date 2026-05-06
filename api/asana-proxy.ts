import type { VercelRequest, VercelResponse } from "@vercel/node";

const WORKSPACE_GID = "1209757363771221";
const ASANA_BASE = "https://app.asana.com/api/1.0";

async function asanaGet(path: string, pat: string): Promise<unknown> {
  const res = await fetch(`${ASANA_BASE}${path}`, {
    headers: { Authorization: `Bearer ${pat}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Asana ${path} → ${res.status}: ${text}`);
  }
  const json = (await res.json()) as { data: unknown };
  return json.data;
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

  try {
    const pat = process.env.ASANA_PAT;
    if (!pat) {
      return res.status(500).json({ error: "ASANA_PAT não configurado" });
    }

    const clientName = (req.body?.client as string)?.trim();
    if (!clientName) {
      return res.status(400).json({ error: "client é obrigatório" });
    }

    const clientKey = clientName.toUpperCase();

    const projects = (await asanaGet(
      `/workspaces/${WORKSPACE_GID}/projects?opt_fields=name,gid,archived&limit=100`,
      pat
    )) as AsanaProject[];

    const matching = projects.filter((p) => {
      if (p.archived) return false;
      const key = p.name.split(" - ")[0].trim().toUpperCase();
      return key === clientKey || clientKey.startsWith(key) || key.startsWith(clientKey);
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

    for (const project of matching.slice(0, 5)) {
      const tasks = (await asanaGet(
        `/projects/${project.gid}/tasks` +
          `?opt_fields=name,due_on,completed,completed_at,assignee.name` +
          `&completed_since=${encodeURIComponent(ago30Days)}&limit=100`,
        pat
      )) as AsanaTask[];

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
      projects: matching.slice(0, 5).map((p) => ({ gid: p.gid, name: p.name })),
      tasks: {
        overdue: overdue.slice(0, 20),
        dueSoon: dueSoon.slice(0, 20),
        recentlyCompleted: recentlyCompleted.slice(0, 20),
        upcoming: upcoming.slice(0, 20),
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("asana-proxy:", msg);
    return res.status(500).json({ error: msg });
  }
}
