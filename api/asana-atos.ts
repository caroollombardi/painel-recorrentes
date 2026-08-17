import type { VercelRequest, VercelResponse } from "@vercel/node";

export const config = { maxDuration: 60 };

const WORKSPACE_GID = "1209757363771221";
const ASANA_BASE = "https://app.asana.com/api/1.0";
const CONCURRENCY = 10;

// Orçamento por CHAMADA. Baixo de propósito: o painel chama esse endpoint
// muitas vezes em sequência, e cada chamada precisa caber com folga no limite
// da Vercel (10s no plano Hobby, 60s no Pro). Nunca voltamos vazio: se o tempo
// acabar, devolvemos o que deu e a lista do que ficou pendente.
const TIME_BUDGET_MS = 7_000;

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

/** CAMINHO 1 — projeto inteiro é ato: último segmento do nome começa com "ATO". */
function isAtoProject(name: string): boolean {
  const segments = normalize(name)
    .split(" - ")
    .map((s) => s.trim())
    .filter(Boolean);
  if (segments.length === 0) return false;
  return /^ATO\b/.test(segments[segments.length - 1]);
}

/**
 * CAMINHO 2 — atividade marcada como ATO no campo CONTRATO.
 * O campo é MULTI-SELECT: display_value vem como lista ("MENSAL, ATO").
 */
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

  if (res.status === 429 && attempt < 2) {
    const retryAfter = Number(res.headers.get("Retry-After") ?? "1");
    await sleep(Math.min(retryAfter * 1000, 3000));
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

interface Lancamento {
  colaborador_nome: string;
  tarefa_nome: string;
  asana_task_id: string;
  duracao_minutos: number;
  billable: boolean;
  data_lancamento: string | null;
  descricao: string;
}

interface Projeto {
  asana_project_id: string;
  nome_projeto: string;
  lancamentos: Lancamento[];
}

interface ProjetoRef {
  gid: string;
  name: string;
}

// ---------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === "OPTIONS") return res.status(200).end();

  const startedAt = Date.now();
  const budgetLeft = () => TIME_BUDGET_MS - (Date.now() - startedAt);

  try {
    const pat = process.env.ASANA_PAT;
    if (!pat) return res.status(500).json({ error: "ASANA_PAT não configurado" });

    const action = (req.body?.action as string) ?? (req.query?.action as string) ?? "list";

    // =================================================================
    // AÇÃO "list" — classifica os projetos. Rápido: só lista projetos,
    // não lê atividade nenhuma.
    // =================================================================
    if (action === "list") {
      const all = await asanaGetAll<AsanaProject>(
        `/workspaces/${WORKSPACE_GID}/projects?archived=false&opt_fields=name,archived&limit=100`,
        pat
      );
      const ativos = all.filter((p) => !p.archived);

      const porNome: ProjetoRef[] = [];
      const candidatos: ProjetoRef[] = [];
      for (const p of ativos) {
        (isAtoProject(p.name) ? porNome : candidatos).push({ gid: p.gid, name: p.name });
      }

      return res.status(200).json({
        action: "list",
        porNome,
        candidatos,
        totalProjetosAtivos: ativos.length,
        duracaoMs: Date.now() - startedAt,
      });
    }

    // =================================================================
    // AÇÃO "scan" — processa um LOTE de projetos.
    //   mode "nome": projeto inteiro é ato → toda atividade com hora conta
    //   mode "tag":  só as atividades marcadas ATO contam
    // Devolve `pendentes` com o que não caber no orçamento de tempo.
    // =================================================================
    if (action === "scan") {
      const projetosEntrada = (req.body?.projetos ?? []) as ProjetoRef[];
      const mode = (req.body?.mode as string) === "nome" ? "nome" : "tag";

      if (!Array.isArray(projetosEntrada) || projetosEntrada.length === 0) {
        return res.status(400).json({ error: "projetos é obrigatório na ação scan" });
      }

      const TASK_FIELDS =
        `?opt_fields=name,actual_time_minutes,assignee.name,` +
        `custom_fields.name,custom_fields.display_value&limit=100`;

      const warnings: string[] = [];
      const projetos: Projeto[] = [];
      const pendentes: ProjetoRef[] = [];

      let entriesAvailable = true;
      let usedFallback = false;
      let totalLancamentos = 0;
      let totalMinutos = 0;
      let projetosVarridos = 0;

      // No modo "tag" o custo por projeto é 1 chamada (a maioria não tem ato
      // nenhum), então processamos em blocos maiores. No modo "nome" cada
      // projeto puxa lançamento por lançamento, então vai de 1 em 1.
      const blocoSize = mode === "tag" ? CONCURRENCY : 1;

      for (let i = 0; i < projetosEntrada.length; i += blocoSize) {
        const bloco = projetosEntrada.slice(i, i + blocoSize);

        if (budgetLeft() < 2_500) {
          pendentes.push(...projetosEntrada.slice(i));
          break;
        }

        const resultados = await mapWithConcurrency(bloco, CONCURRENCY, async (ref) => {
          let tasks: AsanaTask[] = [];
          try {
            tasks = await asanaGetAll<AsanaTask>(`/projects/${ref.gid}/tasks${TASK_FIELDS}`, pat);
          } catch {
            warnings.push(`${ref.name}: não foi possível ler as atividades no Asana.`);
            return null;
          }
          projetosVarridos++;

          const relevantes = mode === "nome" ? tasks : tasks.filter(taskHasAtoTag);
          const comHoras = relevantes.filter((t) => (t.actual_time_minutes ?? 0) > 0);

          if (mode === "nome") {
            const semTag = comHoras.filter((t) => !taskHasAtoTag(t));
            if (semTag.length > 0) {
              warnings.push(
                `${ref.name}: ${semTag.length} atividade(s) com horas lançadas sem a tag ATO no ` +
                  `campo CONTRATO. As horas foram contadas (o projeto é de ato pelo nome), mas ` +
                  `vale corrigir no Asana.`
              );
            }
            if (comHoras.length === 0) {
              warnings.push(`${ref.name}: nenhuma hora lançada no Asana ainda.`);
            }
          } else if (comHoras.length === 0) {
            // Projeto sem atividade ATO com hora: não vira linha no painel
            return null;
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
                        billable: true,
                        data_lancamento: e.entered_on ?? null,
                        descricao: "",
                      }));
                  }
                } catch (err) {
                  const status = (err as { status?: number }).status;
                  if (status === 402 || status === 403 || status === 404) {
                    entriesAvailable = false;
                  }
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

          return {
            asana_project_id: ref.gid,
            // No modo "tag" a linha representa só as atividades marcadas, não o
            // projeto inteiro — o sufixo deixa isso explícito na tabela.
            nome_projeto: mode === "tag" ? `${ref.name} (atividades ATO)` : ref.name,
            lancamentos,
          } as Projeto;
        });

        for (const r of resultados) {
          if (!r) continue;
          projetos.push(r);
          totalLancamentos += r.lancamentos.length;
          totalMinutos += r.lancamentos.reduce((s, l) => s + l.duracao_minutos, 0);
        }
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

      return res.status(200).json({
        action: "scan",
        mode,
        projetos,
        pendentes,
        warnings,
        source: entriesAvailable ? "time_tracking_entries" : "actual_time_minutes",
        stats: {
          projetosVarridos,
          lancamentos: totalLancamentos,
          minutos: totalMinutos,
          duracaoMs: Date.now() - startedAt,
        },
      });
    }

    return res.status(400).json({ error: `Ação desconhecida: ${action}` });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: message });
  }
}
