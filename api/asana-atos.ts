import type { VercelRequest, VercelResponse } from "@vercel/node";

export const config = { maxDuration: 60 };

const WORKSPACE_GID = "1209757363771221";
const ASANA_BASE = "https://app.asana.com/api/1.0";
const CONCURRENCY = 10;

// Orçamento de tempo: a Vercel corta a função em 60s. Paramos antes disso e
// devolvemos resultado parcial COM AVISO, em vez de estourar e não devolver nada.
const TIME_BUDGET_MS = 46_000;

// O Asana marca o tipo de contrato de cada TASK no custom field "CONTRATO".
// ATENÇÃO: o campo é MULTI-SELECT (multi_enum) — display_value vem como lista
// concatenada ("MENSAL, ATO"). Comparação sempre por "contém", nunca por "igual".
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
 * CAMINHO 1 — o projeto inteiro é um ato, identificado pelo nome:
 * o último segmento (separado por " - ") começa com "ATO".
 *   "ARTUR AMARANTE (SE MEXA) - Estruturação Societária - ATO"    → true
 *   "CAPITARE TECNOLOGIA - Assessoria Societária - Ato com Êxito" → true
 *   "GENIA - Assessoria Jurídica Societário - Mensal"             → false
 */
function isAtoProject(name: string): boolean {
  const segments = normalize(name)
    .split(" - ")
    .map((s) => s.trim())
    .filter(Boolean);
  if (segments.length === 0) return false;
  return /^ATO\b/.test(segments[segments.length - 1]);
}

/** CAMINHO 2 — a atividade individual está marcada como ATO no campo CONTRATO. */
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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function asanaGet(path: string, pat: string, attempt = 0): Promise<unknown> {
  const res = await fetch(`${ASANA_BASE}${path}`, {
    headers: { Authorization: `Bearer ${pat}` },
  });

  // Rate limit: respeita o Retry-After e tenta de novo (até 2 vezes)
  if (res.status === 429 && attempt < 2) {
    const retryAfter = Number(res.headers.get("Retry-After") ?? "1");
    await sleep(Math.min(retryAfter * 1000, 5000));
    return asanaGet(path, pat, attempt + 1);
  }

  if (!res.ok) {
    const text = await res.text();
    const err = new Error(`Asana ${path} → ${res.status}: ${text}`) as Error & {
      status?: number;
    };
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
  duration_minutes: number | null;
  entered_on: string | null;
  created_by: { name: string } | null;
}

/** Mesmo shape de ParsedAtoLancamento (src/lib/atos-parser.ts). */
interface Lancamento {
  colaborador_nome: string;
  tarefa_nome: string;
  asana_task_id: string;
  duracao_minutos: number;
  billable: boolean;
  data_lancamento: string | null;
  descricao: string;
}

/** Mesmo shape de ParsedAtoProjeto. */
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

  const startedAt = Date.now();
  const budgetLeft = () => TIME_BUDGET_MS - (Date.now() - startedAt);

  try {
    const pat = process.env.ASANA_PAT;
    if (!pat) return res.status(500).json({ error: "ASANA_PAT não configurado" });

    const warnings: string[] = [];

    // ---------------------------------------------------------------
    // 1. Todos os projetos ativos do workspace
    // ---------------------------------------------------------------
    const allProjects = await asanaGetAll<AsanaProject>(
      `/workspaces/${WORKSPACE_GID}/projects?archived=false&opt_fields=name,archived&limit=100`,
      pat
    );
    const ativos = allProjects.filter((p) => !p.archived);

    // Caminho 1: projeto de ato pelo nome
    const porNome = ativos.filter((p) => isAtoProject(p.name));
    const porNomeIds = new Set(porNome.map((p) => p.gid));
    // Caminho 2: candidatos a varredura de tag (todos os outros)
    const candidatos = ativos.filter((p) => !porNomeIds.has(p.gid));

    let projetosVarridos = 0;
    let varreduraParcial = false;

    // ---------------------------------------------------------------
    // 2. Busca as tasks. Nos projetos de ato pelo NOME, toda atividade
    //    com hora conta. Nos demais, só as atividades marcadas ATO.
    // ---------------------------------------------------------------
    const TASK_FIELDS =
      `?opt_fields=name,actual_time_minutes,assignee.name,` +
      `custom_fields.name,custom_fields.display_value&limit=100`;

    async function tasksDoProjeto(project: AsanaProject): Promise<AsanaTask[]> {
      try {
        return await asanaGetAll<AsanaTask>(`/projects/${project.gid}/tasks${TASK_FIELDS}`, pat);
      } catch {
        warnings.push(`${project.name}: não foi possível ler as atividades no Asana.`);
        return [];
      }
    }

    // 2a. Projetos de ato pelo nome
    const grupoNome = await mapWithConcurrency(porNome, CONCURRENCY, async (project) => {
      const tasks = await tasksDoProjeto(project);
      projetosVarridos++;
      return { project, tasks, origem: "nome" as const };
    });

    // 2b. Varredura de tag nos demais projetos, dentro do orçamento de tempo
    const grupoTag: { project: AsanaProject; tasks: AsanaTask[]; origem: "tag" }[] = [];
    let idx = 0;
    while (idx < candidatos.length) {
      if (budgetLeft() < 12_000) {
        varreduraParcial = true;
        break;
      }
      const lote = candidatos.slice(idx, idx + CONCURRENCY * 4);
      idx += lote.length;

      const resultados = await mapWithConcurrency(lote, CONCURRENCY, async (project) => {
        const tasks = await tasksDoProjeto(project);
        projetosVarridos++;
        return { project, tasks: tasks.filter(taskHasAtoTag), origem: "tag" as const };
      });

      for (const r of resultados) {
        if (r.tasks.length > 0) grupoTag.push(r);
      }
    }

    if (varreduraParcial) {
      warnings.unshift(
        `A varredura por tag ATO ficou incompleta: ${projetosVarridos} de ${ativos.length} projetos ` +
          `foram verificados antes do limite de tempo. Os atos identificados pelo NOME do projeto ` +
          `estão todos aqui; pode faltar algum que só tem a tag nas atividades. Rode de novo pra continuar.`
      );
    }

    const todos = [...grupoNome, ...grupoTag];

    if (todos.length === 0) {
      return res.status(200).json({
        projetos: [],
        warnings: [
          "Nenhum ato encontrado — nem por nome de projeto terminando em \"- Ato\", nem por atividade marcada como ATO no campo CONTRATO.",
        ],
        source: "none",
        stats: {
          projetosEncontrados: 0,
          porNome: 0,
          porTag: 0,
          projetosVarridos,
          tasksComHoras: 0,
          lancamentos: 0,
          minutos: 0,
        },
      });
    }

    // ---------------------------------------------------------------
    // 3. Lançamentos de tempo, atividade por atividade.
    //    Preferido: /tasks/{gid}/time_tracking_entries — traz QUEM lançou
    //    cada hora, fiel ao export CSV. Se o plano do Asana não expuser,
    //    cai pro total da atividade atribuído ao responsável.
    // ---------------------------------------------------------------
    let entriesAvailable = true;
    let usedFallback = false;

    const projetos: Projeto[] = [];
    let totalLancamentos = 0;
    let totalMinutos = 0;
    let totalTasksComHoras = 0;

    for (const { project, tasks, origem } of todos) {
      const comHoras = tasks.filter((t) => (t.actual_time_minutes ?? 0) > 0);
      totalTasksComHoras += comHoras.length;

      // Conferência de dados: só faz sentido no grupo "nome", onde a task
      // deveria estar marcada e não está. No grupo "tag" a marcação é o filtro.
      if (origem === "nome") {
        const semTag = comHoras.filter((t) => !taskHasAtoTag(t));
        if (semTag.length > 0) {
          warnings.push(
            `${project.name}: ${semTag.length} atividade(s) com horas lançadas sem a tag ATO no campo ` +
              `CONTRATO. As horas foram contadas (o projeto é de ato pelo nome), mas vale corrigir no Asana.`
          );
        }
      }

      const porTask = await mapWithConcurrency(
        comHoras,
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
                    billable: true, // a API não expõe billable por lançamento
                    data_lancamento: e.entered_on ?? null,
                    descricao: "",
                  }));
              }
            } catch (err) {
              const status = (err as { status?: number }).status;
              if (status === 402 || status === 403 || status === 404) entriesAvailable = false;
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

      const lancamentos = porTask.flat();
      if (lancamentos.length === 0) {
        if (origem === "nome") {
          warnings.push(`${project.name}: nenhuma hora lançada no Asana ainda.`);
        }
        // Grupo "tag" sem hora nenhuma não vira linha no painel
        if (origem === "tag") continue;
      }

      totalLancamentos += lancamentos.length;
      totalMinutos += lancamentos.reduce((s, l) => s + l.duracao_minutos, 0);

      projetos.push({
        asana_project_id: project.gid,
        // No grupo "tag" a linha representa só as atividades marcadas, não o
        // projeto inteiro — o sufixo deixa isso explícito na tabela do painel.
        nome_projeto:
          origem === "tag" ? `${project.name} (atividades ATO)` : project.name,
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
        "Algumas atividades tinham hora no total mas sem lançamentos detalhados; " +
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
        projetosEncontrados: projetos.length,
        porNome: porNome.length,
        porTag: projetos.length - porNome.length,
        projetosVarridos,
        totalProjetosAtivos: ativos.length,
        varreduraParcial,
        tasksComHoras: totalTasksComHoras,
        lancamentos: totalLancamentos,
        minutos: totalMinutos,
        duracaoMs: Date.now() - startedAt,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: message });
  }
}
