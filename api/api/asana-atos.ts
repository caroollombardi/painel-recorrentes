import type { VercelRequest, VercelResponse } from "@vercel/node";

export const config = { maxDuration: 60 };

const WORKSPACE_GID = "1209757363771221";
const ASANA_BASE = "https://app.asana.com/api/1.0";
const CONCURRENCY = 8;

// O Asana marca o tipo de contrato de cada TASK no custom field "CONTRATO".
// ATENÇÃO: esse campo é MULTI-SELECT (multi_enum), então display_value vem como
// lista concatenada (ex: "MENSAL, ATO"). Comparação tem que ser "contém", nunca "igual".
const CONTRACT_FIELD_NAME = "CONTRATO";
const ATO_FIELD_VALUE = "ATO";

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------

const normalize = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[–—]/g, "-")
    .trim()
    .toUpperCase();

/**
 * Um projeto é de ATO quando o último segmento do nome (separado por " - ")
 * começa com "ATO".
 *   "ARTUR AMARANTE (SE MEXA) - Estruturação Societária - ATO"      → true
 *   "CAPITARE TECNOLOGIA - Assessoria Societária - Ato com Êxito"   → true
 *   "GENIA - Assessoria Jurídica Societário - Mensal"               → false
 */
function isAtoProject(name: string): boolean {
  const segments = normalize(name)
    .split(" - ")
    .map((s) => s.trim())
    .filter(Boolean);
  if (segments.length === 0) return false;
  return /^ATO\b/.test(segments[segments.length - 1]);
}

function taskHasAtoTag(task: AsanaTask): boolean {
  const field = (task.custom_fields ?? []).find(
    (f) => normalize(f.name ?? "") === CONTRACT_FIELD_NAME
  );
  if (!field?.display_value) return false;
  return field.display_value
    .split(",")
    .map((v) => normalize(v))
    .includes(ATO_FIELD_VALUE);
}

async function asanaGet(path: string, pat: string): Promise<unknown> {
  const res = await fetch(`${ASANA_BASE}${path}`, {
    headers: { Authorization: `Bearer ${pat}` },
  });
  if (!res.ok) {
    const text = await res.text();
    const err = new Error(`Asana ${path} → ${res.status}: ${text}`) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  return res.json();
}

async function asanaGetAll<T>(basePath: string, pat: string): Promise<T[]> {
  const results: T[] = [];
  let offset: string | null = null;
  do {
    const url = offset ? `${basePath}&offset=${encodeURIComponent(offset)}` : basePath;
    const json = (await asanaGet(url, pat)) as {
      data: T[];
      next_page: { offset: string } | null;
    };
    results.push(...json.data);
    offset = json.next_page?.offset ?? null;
  } while (offset);
  return results;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
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

// ---------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------

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
  actual_time_minutes: number | null;
  assignee: { name: string } | null;
  custom_fields?: AsanaCustomField[];
}

interface AsanaTimeEntry {
  gid: string;
  duration_minutes: number | null;
  entered_on: string | null;
  created_by: { name: string } | null;
}

/** Mesmo shape que o parser do CSV produz (ParsedAtoLancamento). */
interface Lancamento {
  colaborador_nome: string;
  tarefa_nome: string;
  asana_task_id: string;
  duracao_minutos: number;
  billable: boolean;
  data_lancamento: string | null;
  descricao: string;
}

/** Mesmo shape que ParsedAtoProjeto. */
interface Projeto {
  asana_project_id: string;
  nome_projeto: string;
  lancamentos: Lancamento[];
}

// ---------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST" && req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const pat = process.env.ASANA_PAT;
    if (!pat) return res.status(500).json({ error: "ASANA_PAT não configurado" });

    // 1. Todos os projetos do workspace → filtra os de ato
    const allProjects = await asanaGetAll<AsanaProject>(
      `/workspaces/${WORKSPACE_GID}/projects?opt_fields=name,archived&limit=100`,
      pat
    );

    const atoProjects = allProjects.filter((p) => !p.archived && isAtoProject(p.name));

    if (atoProjects.length === 0) {
      return res.status(200).json({
        projetos: [],
        warnings: [
          "Nenhum projeto de ato encontrado. O padrão esperado é o nome terminar em \"- Ato\" (ex: \"CLIENTE - Assessoria Societária - Ato\").",
        ],
        source: "none",
        stats: { projetosEncontrados: 0, tasksComHoras: 0, lancamentos: 0, minutos: 0 },
      });
    }

    // 2. Tasks de cada projeto de ato
    const perProject = await mapWithConcurrency(atoProjects, CONCURRENCY, async (project) => {
      const tasks = await asanaGetAll<AsanaTask>(
        `/projects/${project.gid}/tasks` +
          `?opt_fields=name,actual_time_minutes,assignee.name,custom_fields.name,custom_fields.display_value` +
          `&limit=100`,
        pat
      );
      return { project, tasks };
    });

    // 3. Lançamentos de tempo, task por task.
    //    Caminho preferido: /tasks/{gid}/time_tracking_entries — traz QUEM lançou
    //    cada hora (created_by), fiel ao export CSV de Time Tracking.
    //    Se o plano do Asana não expõe esse endpoint, cai pro fallback:
    //    actual_time_minutes atribuído ao responsável da task.
    let entriesAvailable = true;
    let usedFallback = false;

    const warnings: string[] = [];
    const projetos: Projeto[] = [];
    let totalLancamentos = 0;
    let totalMinutos = 0;
    let totalTasksComHoras = 0;

    for (const { project, tasks } of perProject) {
      const tasksComHoras = tasks.filter((t) => (t.actual_time_minutes ?? 0) > 0);
      totalTasksComHoras += tasksComHoras.length;

      // Conferência de dados: task com hora lançada mas sem a tag ATO no CONTRATO
      const semTag = tasksComHoras.filter((t) => !taskHasAtoTag(t));
      if (semTag.length > 0) {
        warnings.push(
          `${project.name}: ${semTag.length} atividade(s) com horas lançadas sem a tag ATO no campo CONTRATO. ` +
            `As horas foram contadas (o projeto é de ato), mas vale corrigir a marcação no Asana.`
        );
      }

      const lancamentosPorTask = await mapWithConcurrency(
        tasksComHoras,
        CONCURRENCY,
        async (task): Promise<Lancamento[]> => {
          if (entriesAvailable) {
            try {
              const entries = await asanaGetAll<AsanaTimeEntry>(
                `/tasks/${task.gid}/time_tracking_entries` +
                  `?opt_fields=duration_minutes,entered_on,created_by.name&limit=100`,
                pat
              );
              if (entries.length > 0) {
                return entries
                  .filter((e) => (e.duration_minutes ?? 0) > 0)
                  .map((e) => ({
                    colaborador_nome: e.created_by?.name?.trim() || "Não identificado",
                    tarefa_nome: task.name,
                    asana_task_id: task.gid,
                    duracao_minutos: e.duration_minutes ?? 0,
                    billable: true, // a API não expõe o status billable por lançamento
                    data_lancamento: e.entered_on ?? null,
                    descricao: "",
                  }));
              }
              // Task com actual_time_minutes mas sem entries detalhados → usa o total
            } catch (err) {
              const status = (err as { status?: number }).status;
              if (status === 402 || status === 403 || status === 404) {
                entriesAvailable = false;
              }
              // qualquer outro erro nessa task: cai pro fallback só nela
            }
          }

          usedFallback = true;
          return [
            {
              colaborador_nome: task.assignee?.name?.trim() || "Não identificado",
              tarefa_nome: task.name,
              asana_task_id: task.gid,
              duracao_minutos: task.actual_time_minutes ?? 0,
              billable: true,
              data_lancamento: null,
              descricao: "",
            },
          ];
        }
      );

      const lancamentos = lancamentosPorTask.flat();
      totalLancamentos += lancamentos.length;
      totalMinutos += lancamentos.reduce((s, l) => s + l.duracao_minutos, 0);

      if (lancamentos.length === 0) {
        warnings.push(`${project.name}: nenhuma hora lançada no Asana ainda.`);
      }

      projetos.push({
        asana_project_id: project.gid,
        nome_projeto: project.name,
        lancamentos,
      });
    }

    if (!entriesAvailable) {
      warnings.unshift(
        "O detalhamento por lançamento não está disponível nesse plano do Asana. " +
          "As horas foram atribuídas ao RESPONSÁVEL da atividade, não a quem lançou — " +
          "se alguém lançou hora em atividade de outra pessoa, o custo sai pela taxa errada."
      );
    } else if (usedFallback) {
      warnings.push(
        "Algumas atividades tinham horas no total mas sem lançamentos detalhados; " +
          "nessas, a hora foi atribuída ao responsável da atividade."
      );
    }

    warnings.push(
      "O status billable/não-billable não vem pela API — todos os lançamentos entram como billable."
    );

    return res.status(200).json({
      projetos,
      warnings,
      source: entriesAvailable ? "time_tracking_entries" : "actual_time_minutes",
      stats: {
        projetosEncontrados: atoProjects.length,
        tasksComHoras: totalTasksComHoras,
        lancamentos: totalLancamentos,
        minutos: totalMinutos,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: message });
  }
}
