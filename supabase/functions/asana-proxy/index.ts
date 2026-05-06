import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const ALLOWED_ORIGIN = "https://painel-recorrentes.vercel.app";

const corsHeaders = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const WORKSPACE_GID = "1209757363771221";
const ASANA_BASE = "https://app.asana.com/api/1.0";

async function verifyToken(authHeader: string | null): Promise<boolean> {
  if (!authHeader?.startsWith("Bearer ")) return false;
  const token = authHeader.slice(7);
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !supabaseAnonKey) return false;

  const res = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: supabaseAnonKey,
    },
  });
  return res.ok;
}

async function asanaGet(path: string, pat: string): Promise<{ data: unknown; next_page: { offset: string } | null }> {
  const res = await fetch(`${ASANA_BASE}${path}`, {
    headers: { Authorization: `Bearer ${pat}` },
  });
  if (!res.ok) throw new Error(`Asana API error ${res.status}`);
  return res.json();
}

async function asanaGetAll<T>(basePath: string, pat: string): Promise<T[]> {
  const results: T[] = [];
  let offset: string | null = null;
  do {
    const url = offset ? `${basePath}&offset=${encodeURIComponent(offset)}` : basePath;
    const json = await asanaGet(url, pat);
    results.push(...(json.data as T[]));
    offset = json.next_page?.offset ?? null;
  } while (offset);
  return results;
}

interface AsanaProject { gid: string; name: string; archived: boolean; }
interface AsanaTask {
  gid: string; name: string; due_on: string | null;
  completed: boolean; completed_at: string | null;
  assignee: { name: string } | null;
}
interface CategorizedTask extends AsanaTask { projectName: string; }

const CLIENT_ALIASES: Record<string, string[]> = {
  "SUPLOS": ["SUPLOS (ALMOX)"],
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Verify session token
  const authorized = await verifyToken(req.headers.get("authorization"));
  if (!authorized) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const pat = Deno.env.get("ASANA_PAT");
    if (!pat) {
      return new Response(JSON.stringify({ error: "Configuração incompleta" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json() as { client?: string };
    const clientName = body.client?.trim();
    if (!clientName || clientName.length < 2) {
      return new Response(JSON.stringify({ error: "client é obrigatório" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const clientKey = clientName.toUpperCase();
    const searchKeys = [clientKey, ...(CLIENT_ALIASES[clientKey] ?? [])];

    const projects = await asanaGetAll<AsanaProject>(
      `/workspaces/${WORKSPACE_GID}/projects?opt_fields=name,gid,archived&limit=100`, pat
    );

    const matching = projects.filter((p) => {
      if (p.archived) return false;
      const key = p.name.split(" - ")[0].trim().toUpperCase();
      return searchKeys.some((sk) => key === sk || sk.startsWith(key) || key.startsWith(sk));
    });

    if (matching.length === 0) {
      return new Response(
        JSON.stringify({ projects: [], tasks: { overdue: [], dueSoon: [], recentlyCompleted: [], upcoming: [] } }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
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
        `/projects/${project.gid}/tasks?opt_fields=name,due_on,completed,completed_at,assignee.name` +
        `&completed_since=${encodeURIComponent(ago30Days)}&limit=100`, pat
      );
      for (const t of tasks) {
        const task: CategorizedTask = { ...t, projectName: project.name };
        if (t.completed) recentlyCompleted.push(task);
        else if (t.due_on) {
          if (t.due_on < today) overdue.push(task);
          else if (t.due_on <= in7Days) dueSoon.push(task);
          else upcoming.push(task);
        }
      }
    }

    overdue.sort((a, b) => (a.due_on ?? "").localeCompare(b.due_on ?? ""));
    dueSoon.sort((a, b) => (a.due_on ?? "").localeCompare(b.due_on ?? ""));
    recentlyCompleted.sort((a, b) => (b.completed_at ?? "").localeCompare(a.completed_at ?? ""));
    upcoming.sort((a, b) => (a.due_on ?? "").localeCompare(b.due_on ?? ""));

    return new Response(
      JSON.stringify({
        projects: matching.map((p) => ({ gid: p.gid, name: p.name })),
        tasks: {
          overdue: overdue.slice(0, 20),
          dueSoon: dueSoon.slice(0, 20),
          recentlyCompleted: recentlyCompleted.slice(0, 20),
          upcoming: upcoming.slice(0, 20),
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    console.error("asana-proxy:", err instanceof Error ? err.message : String(err));
    return new Response(JSON.stringify({ error: "Erro ao buscar dados do Asana" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
