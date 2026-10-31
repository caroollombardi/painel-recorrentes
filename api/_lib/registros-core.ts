// Lógica pura do painel de Registros na Junta: classifica tarefas do Asana e agrupa por documento registrado.
// Fica separada da rota para poder ser testada sem chamar o Asana.

export interface RegistroTask {
  gid: string;
  name: string;
  completed: boolean;
  created_at: string;
  completed_at: string | null;
  actual_time_minutes: number | null;
  assignee: { name: string } | null;
  projects: { gid: string; name: string }[];
}

export interface Registro {
  key: string;
  projectGid: string;
  projectName: string;
  documento: string;
  responsaveis: string[];
  inicio: string;
  ultimaConclusao: string | null;
  aberto: boolean;
  minutos: number;
  tarefas: number;
  tarefasSemHora: number;
  exigencias: number;
  protocolos: number;
  diasCiclo: number;
  minutosPorResponsavel: Record<string, number>;
  tarefasAbertas: { gid: string; name: string; responsavel: string | null; criadaEm: string }[];
}

const REGISTRO_RE = /registr|protocol|exig[eê]ncia|junta|jucepar|jucesp|rerratifica|redesim|\bdbe\b|\bfcn\b|viabilidade/i;
// "Registro" aparece também em coisas que não são da junta comercial
const FORA_RE = /marca|inpi|im[oó]ve(l|is)|cart[oó]rio|matr[ií]cula|\brtd\b|t[ií]tulos e documentos|bacen|\bccv\b|compra e venda|escritura|procec|horas?\b|timesheet|decis[õo]es|ponto\b|oab\b/i;
const EXIGENCIA_RE = /exig[eê]ncia|rerratifica|refazer protocolo|novo protocolo/i;
const PROTOCOLO_NUM_RE = /PRP\s?\d{6,}/gi;

export const PROJETOS_IGNORADOS = [/funda[cç][aã]o com ia/i, /novas solicita[cç][oõ]es/i];

export function isTarefaDeRegistro(t: Pick<RegistroTask, "name" | "projects">): boolean {
  if (!t.projects?.length) return false;
  if (t.projects.every((p) => PROJETOS_IGNORADOS.some((re) => re.test(p.name)))) return false;
  return REGISTRO_RE.test(t.name) && !FORA_RE.test(t.name);
}

export function documentoDaTarefa(name: string): string {
  // 1 ou 2 dígitos, para não confundir o número do protocolo (PRP2611390169) com o ordinal da ACS
  const ord = name.match(/(?<![\w])(\d{1,2})\s*[ªº°]?\s*ACS/i);
  if (ord) return `${ord[1]}ª ACS`;
  if (/\bACS\b|altera[cç][aã]o (do |de )?contrato social|altera[cç][aã]o contratual/i.test(name)) return "ACS";
  if (/constitui[cç][aã]o|contrato social/i.test(name)) return "Contrato social";
  if (/estatuto/i.test(name)) return "Estatuto social";
  if (/\bata\b|\bage\b|\bago\b|\brca\b/i.test(name)) return "Ata";
  return "Registro";
}

function diasEntre(a: string, b: string): number {
  return Math.max(0, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000));
}

export function agruparRegistros(tasks: RegistroTask[], agora: Date = new Date()): Registro[] {
  const grupos = new Map<string, { project: { gid: string; name: string }; documento: string; tasks: RegistroTask[] }>();

  for (const t of tasks) {
    if (!isTarefaDeRegistro(t)) continue;
    const project = t.projects.find((p) => !PROJETOS_IGNORADOS.some((re) => re.test(p.name))) ?? t.projects[0];
    const documento = documentoDaTarefa(t.name);
    const key = `${project.gid}::${documento}`;
    if (!grupos.has(key)) grupos.set(key, { project, documento, tasks: [] });
    const g = grupos.get(key)!;
    if (!g.tasks.some((x) => x.gid === t.gid)) g.tasks.push(t);
  }

  const registros: Registro[] = [];
  for (const [key, g] of grupos) {
    const ts = g.tasks;
    const inicio = ts.map((t) => t.created_at).sort()[0];
    const conclusoes = ts.filter((t) => t.completed && t.completed_at).map((t) => t.completed_at as string).sort();
    const ultimaConclusao = conclusoes.length ? conclusoes[conclusoes.length - 1] : null;
    const abertas = ts.filter((t) => !t.completed);
    const aberto = abertas.length > 0;
    const protocolosNum = new Set(ts.flatMap((t) => (t.name.match(PROTOCOLO_NUM_RE) ?? []).map((p) => p.replace(/\s/g, "").toUpperCase())));
    const temProtocolo = ts.some((t) => /protocol|registr/i.test(t.name));
    const minutosPorResponsavel: Record<string, number> = {};
    for (const t of ts) {
      const nome = t.assignee?.name ?? "Sem responsável";
      minutosPorResponsavel[nome] = (minutosPorResponsavel[nome] ?? 0) + (t.actual_time_minutes ?? 0);
    }

    registros.push({
      key,
      projectGid: g.project.gid,
      projectName: g.project.name.trim(),
      documento: g.documento,
      responsaveis: [...new Set(ts.map((t) => t.assignee?.name).filter((n): n is string => !!n))],
      inicio,
      ultimaConclusao,
      aberto,
      minutos: ts.reduce((s, t) => s + (t.actual_time_minutes ?? 0), 0),
      tarefas: ts.length,
      tarefasSemHora: ts.filter((t) => t.completed && !t.actual_time_minutes).length,
      exigencias: ts.filter((t) => EXIGENCIA_RE.test(t.name)).length,
      protocolos: Math.max(protocolosNum.size, temProtocolo ? 1 : 0),
      diasCiclo: diasEntre(inicio, aberto ? agora.toISOString() : (ultimaConclusao ?? inicio)),
      minutosPorResponsavel,
      tarefasAbertas: abertas.map((t) => ({ gid: t.gid, name: t.name.trim(), responsavel: t.assignee?.name ?? null, criadaEm: t.created_at })),
    });
  }

  return registros.sort((a, b) => b.inicio.localeCompare(a.inicio));
}

export function mediana(valores: number[]): number | null {
  if (!valores.length) return null;
  const v = [...valores].sort((a, b) => a - b);
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}
