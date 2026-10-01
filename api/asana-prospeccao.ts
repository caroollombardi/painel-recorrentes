import type { VercelRequest, VercelResponse } from "@vercel/node";

export const config = { maxDuration: 60 };

const ASANA_BASE = "https://app.asana.com/api/1.0";
const PORTFOLIO_GID = "1211494420370314"; // WSA - PROSPECÇÃO
const CONCURRENCY = 8;

// --- Placar de reuniões agendadas (competição Pedro x Lorenzo) ---
// Entram no placar todos os projetos do portfólio, menos os concluídos há mais de 30 dias.
// Concluída em até 5 min após a criação do projeto = marcada no cadastro, não no agendamento real
const CADASTRO_JANELA_MS = 5 * 60 * 1000;
const PULAR_CONCLUIDOS_APOS_MS = 30 * 86400000;

function normalizar(nome: string): string {
  return nome.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ");
}

function isTarefaAgendamento(nome: string): boolean {
  return /^agendar reuniao/.test(normalizar(nome));
}

// A tarefa "Reunião Comercial" guarda, no prazo, a data em que a reunião vai acontecer
function isTarefaReuniao(nome: string): boolean {
  return /^reuniao comercial/.test(normalizar(nome));
}

function concluidoEm(p: PortfolioItem): string | null {
  return p.completed_at ?? (classifyStatusGeral(p.current_status?.color) === "concluido" ? p.modified_at : null);
}

function concluidoHaMaisDe30Dias(p: PortfolioItem): boolean {
  const em = concluidoEm(p);
  return !!em && Date.now() - new Date(em).getTime() > PULAR_CONCLUIDOS_APOS_MS;
}

function estaNoPlacar(p: PortfolioItem): boolean {
  return !concluidoHaMaisDe30Dias(p);
}

// Quem colocou a data na "Reunião Comercial": última alteração de prazo no histórico da tarefa
async function buscarQuemColocouData(pat: string, taskGid: string): Promise<{ nome: string; em: string } | null> {
  try {
    const stories = await asanaGetAll<{ resource_subtype: string; created_at: string; created_by: { name: string } | null }>(
      `/tasks/${taskGid}/stories?opt_fields=resource_subtype,created_at,created_by.name&limit=100`,
      pat
    );
    const alteracoes = stories
      .filter((st) => st.resource_subtype === "due_date_changed" && st.created_by?.name)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    const ultima = alteracoes[0];
    return ultima ? { nome: ultima.created_by!.name, em: ultima.created_at } : null;
  } catch {
    return null;
  }
}

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
  completed_at: string | null;
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
  completed_at: string | null;
  completed_by: { name: string } | null;
  assignee: { name: string } | null;
  due_on: string | null;
  due_at: string | null;
  created_at: string;
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

interface ReuniaoAgendamento {
  // "agendar": tarefa "Agendar reunião comercial" (template novo)
  // "reuniao": projeto só com "Reunião Comercial" (template antigo) — vale a data colocada nela
  origem: "agendar" | "reuniao";
  taskGid: string;
  taskName: string;
  concluida: boolean;
  concluidaEm: string | null;
  concluidaPor: string | null;
  responsavel: string | null;
  prazo: string | null;
  concluidaNoCadastro: boolean;
  reuniaoTaskGid: string | null;
  reuniaoData: string | null;
  reuniaoDataPor: string | null;
}

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
  noPlacar: boolean;
  agendamento: ReuniaoAgendamento | null;
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

// O que o painel devolve da cópia salva para não reler projetos antigos
interface AnaliseSalva {
  modifiedAt: string;
  desfecho: Desfecho;
  motivo: string;
  motivoFonte: MotivoFonte;
  etapaAtual: Etapa;
  areaJuridica: string | null;
  origemLead: string | null;
  agendamento?: ReuniaoAgendamento | null;
}

type Analise = {
  desfecho: Desfecho; motivo: string; motivoFonte: MotivoFonte; etapaAtual: Etapa;
  areaJuridica: string | null; origemLead: string | null;
};

function extrairAgendamento(tasks: AsanaTask[], projectCreatedAt: string): ReuniaoAgendamento | null {
  const candidatas = tasks.filter((t) => isTarefaAgendamento(t.name));
  if (candidatas.length === 0) {
    // Template antigo: só existe "Reunião Comercial". Agendada = tem data; o autor e o momento
    // vêm do histórico da tarefa (preenchidos em analisarProjeto).
    const r = tasks.find((t) => isTarefaReuniao(t.name));
    if (!r) return null;
    const data = r.due_at ?? r.due_on ?? null;
    return {
      origem: "reuniao",
      taskGid: r.gid,
      taskName: r.name.trim(),
      concluida: !!data || r.completed,
      concluidaEm: data ? null : r.completed ? r.completed_at : null,
      concluidaPor: data ? null : r.completed ? (r.completed_by?.name ?? r.assignee?.name ?? null) : null,
      responsavel: r.assignee?.name ?? null,
      prazo: null,
      concluidaNoCadastro: false,
      reuniaoTaskGid: r.gid,
      reuniaoData: data,
      reuniaoDataPor: null,
    };
  }
  // Se houver mais de uma, vale a primeira concluída (a mais antiga); se nenhuma foi concluída, a primeira da lista
  const concluidas = candidatas
    .filter((t) => t.completed && t.completed_at)
    .sort((a, b) => new Date(a.completed_at!).getTime() - new Date(b.completed_at!).getTime());
  const t = concluidas[0] ?? candidatas[0];
  const reuniao = tasks.find((r) => isTarefaReuniao(r.name)) ?? null;
  const concluidaNoCadastro =
    !!t.completed_at &&
    new Date(t.completed_at).getTime() - new Date(projectCreatedAt).getTime() <= CADASTRO_JANELA_MS;
  return {
    origem: "agendar",
    taskGid: t.gid,
    taskName: t.name.trim(),
    concluida: t.completed,
    concluidaEm: t.completed ? t.completed_at : null,
    concluidaPor: t.completed ? (t.completed_by?.name ?? t.assignee?.name ?? null) : null,
    responsavel: t.assignee?.name ?? null,
    prazo: t.due_on,
    concluidaNoCadastro,
    reuniaoTaskGid: reuniao?.gid ?? null,
    reuniaoData: reuniao ? (reuniao.due_at ?? reuniao.due_on ?? null) : null,
    reuniaoDataPor: null,
  };
}

async function analisarProjeto(pat: string, project: PortfolioItem): Promise<Analise & { agendamento: ReuniaoAgendamento | null }> {
  const color = project.current_status?.color;
  const statusGeral = classifyStatusGeral(color);
  const resumoLegado = project.current_status?.text ? extractResumo(project.current_status.text) : "";

  let tasks: AsanaTask[] = [];
  try {
    tasks = await asanaGetAll<AsanaTask>(
      `/projects/${project.gid}/tasks?opt_fields=name,completed,completed_at,completed_by.name,assignee.name,due_on,due_at,created_at,notes,memberships.section.name,custom_fields.name,custom_fields.display_value&limit=100`,
      pat
    );
  } catch {
    tasks = [];
  }

  const agendamento = extrairAgendamento(tasks, project.created_at);
  // Só busca o histórico (1 chamada a mais) quando o ponto está em jogo
  if (agendamento?.concluida && agendamento.reuniaoTaskGid && agendamento.reuniaoData && estaNoPlacar(project)) {
    const quem = await buscarQuemColocouData(pat, agendamento.reuniaoTaskGid);
    agendamento.reuniaoDataPor = quem?.nome ?? null;
    if (agendamento.origem === "reuniao") {
      // Sem "Agendar": o agendamento é o momento em que a data foi colocada, por quem colocou
      const r = tasks.find((t) => t.gid === agendamento.reuniaoTaskGid)!;
      const em = quem?.em ?? r.completed_at ?? r.created_at;
      agendamento.concluidaEm = em;
      agendamento.concluidaPor = quem?.nome ?? r.completed_by?.name ?? r.assignee?.name ?? null;
      agendamento.concluidaNoCadastro =
        new Date(em).getTime() - new Date(project.created_at).getTime() <= CADASTRO_JANELA_MS;
    }
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
      agendamento,
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
      agendamento,
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
      agendamento,
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
    agendamento,
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET" && req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const pat = process.env.ASANA_PAT;
    if (!pat) return res.status(500).json({ error: "ASANA_PAT não configurado" });

    const rawItems = await asanaGetAll<PortfolioItem>(
      `/portfolios/${PORTFOLIO_GID}/items` +
        `?opt_fields=name,archived,created_at,modified_at,completed_at,owner.name,current_status.color,current_status.text` +
        `&limit=100`,
      pat
    );

    const filtered = rawItems.filter(
      (p) => !p.archived && !p.name.trim().toLowerCase().includes("[nome do cliente]")
    );

    // Projetos concluídos há mais de 30 dias e sem mudança desde a última leitura não são relidos:
    // reaproveita a análise que veio da cópia salva (enviada pelo painel no POST).
    const anteriores: Record<string, AnaliseSalva> =
      req.method === "POST" && req.body && typeof req.body === "object" ? (req.body.anteriores ?? {}) : {};
    let reaproveitados = 0;
    const analises = await mapWithConcurrency(filtered, CONCURRENCY, async (p) => {
      const salvo = anteriores[p.gid];
      if (salvo && concluidoHaMaisDe30Dias(p) && salvo.modifiedAt === p.modified_at) {
        reaproveitados += 1;
        return {
          desfecho: salvo.desfecho,
          motivo: salvo.motivo,
          motivoFonte: salvo.motivoFonte,
          etapaAtual: salvo.etapaAtual,
          areaJuridica: salvo.areaJuridica,
          origemLead: salvo.origemLead,
          agendamento: salvo.agendamento ?? null,
        };
      }
      return analisarProjeto(pat, p);
    });

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
        noPlacar: estaNoPlacar(p),
        agendamento: a.agendamento,
      };
    });

    // --- Placar de reuniões agendadas ---
    const placarItems = items.filter((i) => i.noPlacar);
    // Ponto = "Agendar reunião comercial" concluída E "Reunião Comercial" com data preenchida
    const reunioesAgendadas = placarItems
      .filter((i) => i.agendamento?.concluida && i.agendamento.concluidaEm && i.agendamento.reuniaoData)
      .map((i) => ({
        projetoGid: i.gid,
        projeto: i.name,
        dono: i.owner,
        taskGid: i.agendamento!.taskGid,
        agendadaEm: i.agendamento!.concluidaEm as string,
        agendadaPor: i.agendamento!.concluidaPor ?? "Não identificado",
        responsavel: i.agendamento!.responsavel,
        concluidaNoCadastro: i.agendamento!.concluidaNoCadastro,
        reuniaoData: i.agendamento!.reuniaoData as string,
        reuniaoDataPor: i.agendamento!.reuniaoDataPor ?? "Não identificado",
        origem: i.agendamento!.origem ?? "agendar",
      }))
      .sort((a, b) => new Date(b.agendadaEm).getTime() - new Date(a.agendadaEm).getTime());
    // Agendamento concluído, mas sem data na "Reunião Comercial": ainda não pontua
    const agendadasSemData = placarItems
      .filter((i) => i.agendamento?.concluida && !i.agendamento.reuniaoData && i.statusGeral !== "concluido")
      .map((i) => ({
        projetoGid: i.gid,
        projeto: i.name,
        agendadaPor: i.agendamento!.concluidaPor ?? "Não identificado",
        taskGid: i.agendamento!.reuniaoTaskGid ?? i.agendamento!.taskGid,
        temTarefaReuniao: !!i.agendamento!.reuniaoTaskGid,
      }));
    const reunioesPendentes = placarItems
      .filter((i) => i.agendamento && !i.agendamento.concluida && i.statusGeral !== "concluido")
      .map((i) => ({
        projetoGid: i.gid,
        projeto: i.name,
        dono: i.owner,
        taskGid: i.agendamento!.taskGid,
        responsavel: i.agendamento!.responsavel,
        prazo: i.agendamento!.prazo,
      }))
      .sort((a, b) => (a.prazo ?? "9999").localeCompare(b.prazo ?? "9999"));
    const semTarefaAgendamento = placarItems
      .filter((i) => !i.agendamento && i.statusGeral !== "concluido")
      .map((i) => ({ projetoGid: i.gid, projeto: i.name, dono: i.owner }));
    // Reuniões com data de hoje em diante (entre as que pontuaram)
    const hojeBR = new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);
    const reunioesFuturas = reunioesAgendadas
      .filter((r) => (r.reuniaoData.length <= 10 ? r.reuniaoData >= hojeBR : new Date(r.reuniaoData).getTime() >= Date.now()))
      .sort((a, b) => a.reuniaoData.localeCompare(b.reuniaoData));
    const placar = {
      inicio: new Date(Date.now() - PULAR_CONCLUIDOS_APOS_MS).toISOString(),
      reunioesFuturas,
      projetosNoPlacar: placarItems.length,
      reunioesAgendadas,
      reunioesPendentes,
      agendadasSemData,
      semTarefaAgendamento,
    };

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
      leitura: { projetos: filtered.length, reaproveitados, lidosNoAsana: filtered.length - reaproveitados },
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
      placar,
      items,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("asana-prospeccao:", msg);
    return res.status(500).json({ error: msg });
  }
}
