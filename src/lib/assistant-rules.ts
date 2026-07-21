export interface AssistantContext {
  recorrentes: { contratos: number; emAlerta: number; clientesAlerta: string[] };
  atos: { total: number; deficit: number; projetosDeficit: string[] };
  horas: { fillRate: number; horasUltimoDia: number; ultimaData: string | null };
  prospeccao: {
    total: number;
    semMotivo: number;
    porResponsavel: Record<string, { concluidos: number; semMotivo: number; pct: number }>;
  };
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function responderPergunta(pergunta: string, ctx: AssistantContext): string {
  const q = normalize(pergunta);

  const has = (...words: string[]) => words.some((w) => q.includes(w));

  if (!q.trim() || has("ajuda", "o que voce faz", "o que voce sabe", "help")) {
    return [
      "Hoje eu só respondo perguntas sobre números que já existem nos módulos. Por exemplo:",
      "- quantos contratos ativos temos?",
      "- quantos clientes estão em alerta?",
      "- quantas horas foram lançadas no último dia?",
      "- qual o percentual de preenchimento de horas?",
      "- quantos projetos de atos estão em déficit?",
      "- quantos projetos estão no pipeline de prospecção?",
      "- quantos projetos de prospecção estão sem motivo?",
      "- quem tem mais pendência de motivo na prospecção?",
    ].join("\n");
  }

  if (has("ato") && has("deficit", "prejuizo", "negativ")) {
    if (ctx.atos.deficit === 0) return "Nenhum projeto de atos está em déficit no momento.";
    const lista = ctx.atos.projetosDeficit.slice(0, 5).join(", ");
    return `${ctx.atos.deficit} projeto(s) de atos estão em déficit${lista ? `: ${lista}` : ""}${ctx.atos.projetosDeficit.length > 5 ? "..." : ""}.`;
  }

  if (has("ato") && has("quant", "projeto", "import")) {
    return `Há ${ctx.atos.total} projeto(s) de atos importados.`;
  }

  if (has("client", "contrato") && has("alert", "atras", "critic", "risco")) {
    if (ctx.recorrentes.emAlerta === 0) return "Nenhum cliente recorrente está em alerta crítico no momento.";
    const lista = ctx.recorrentes.clientesAlerta.slice(0, 5).join(", ");
    return `${ctx.recorrentes.emAlerta} cliente(s) estão em alerta crítico${lista ? `: ${lista}` : ""}${ctx.recorrentes.clientesAlerta.length > 5 ? "..." : ""}.`;
  }

  if (has("client", "contrato") && has("quant", "ativ", "total")) {
    return `Há ${ctx.recorrentes.contratos} contrato(s) recorrente(s) ativo(s).`;
  }

  if (has("hora") && has("preench", "percentual", "fill")) {
    return `O preenchimento de horas está em ${ctx.horas.fillRate}% dos dias úteis do mês.`;
  }

  if (has("hora") && has("hoje", "ontem", "ultimo", "quant")) {
    if (!ctx.horas.ultimaData) return "Ainda não encontrei lançamentos de horas neste mês.";
    const data = new Date(ctx.horas.ultimaData + "T12:00:00").toLocaleDateString("pt-BR");
    return `Foram lançadas ${ctx.horas.horasUltimoDia}h no último dia com registro (${data}).`;
  }

  if (has("prospec", "funil") && has("motivo", "pendenc", "classific")) {
    return `${ctx.prospeccao.semMotivo} projeto(s) de prospecção concluídos estão sem motivo de ganho ou perda registrado.`;
  }

  if (has("prospec", "funil") && has("quant", "pipeline", "total")) {
    return `Há ${ctx.prospeccao.total} projeto(s) no pipeline de prospecção.`;
  }

  if (has("quem") && has("atras", "pendente", "motivo")) {
    const entries = Object.entries(ctx.prospeccao.porResponsavel).sort((a, b) => b[1].pct - a[1].pct);
    if (entries.length === 0) return "Ainda não tenho dados de responsáveis na prospecção.";
    const [nome, v] = entries[0];
    return `${nome} tem a maior pendência: ${v.semMotivo} de ${v.concluidos} projetos concluídos sem motivo (${v.pct}%).`;
  }

  return "Ainda não sei responder isso. Pergunte sobre contratos, horas, atos ou prospecção — ou digite \"ajuda\" pra ver exemplos.";
}
