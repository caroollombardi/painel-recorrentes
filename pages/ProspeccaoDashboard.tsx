import { useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, LabelList, Legend,
} from "recharts";
import { AppShell } from "@/components/layout/AppShell";
import { useProspeccaoData, type Etapa, type ProspeccaoItem } from "@/hooks/use-prospeccao-data";
import { PlacarReunioes, SEMPRE_NO_PLACAR, formatarReuniao } from "@/components/prospeccao/PlacarReunioes";
import { ListaOportunidades } from "@/components/prospeccao/ListaOportunidades";
import { PendenciasCadastro } from "@/components/prospeccao/PendenciasCadastro";
import { InfoDica } from "@/components/prospeccao/InfoDica";
import { calcularIndicadores, TEMPOS_DESDE, type TempoEtapa } from "@/lib/indicadores-prospeccao";
import {
  calcularFluxo, calcularConversao, marcarParados, FATOR_PARADO, MINIMO_DIAS_PARADO, type Taxa,
} from "@/lib/saude-pipeline";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

const LARANJA = "#FB7435";

const DESFECHO_LABEL: Record<string, string> = {
  ganho: "Ganho",
  perdido: "Perdido",
  generico: "Motivo genérico",
  vazio: "Sem classificação",
};

const DESFECHO_COLOR: Record<string, string> = {
  ganho: "hsl(var(--success))",
  perdido: "hsl(var(--destructive))",
  generico: "hsl(var(--warning))",
  vazio: "hsl(var(--muted-foreground))",
};

// "Em espera" fica numa barra própria: lead em espera não aparece com etapa do funil.
// Projeto concluído também não fica em etapa de andamento: vai para Ganho, Perdido ou "Encerrado sem resultado".
type BarraFunil = Etapa | "Em espera" | "Encerrado sem resultado";

const ETAPAS_EM_ANDAMENTO: Etapa[] = ["Lead recebido", "Reunião", "Proposta enviada", "Negociação"];

// Projetos em modelo antigo ("Sem estrutura de funil") não entram no gráfico: ficam nas pendências de cadastro.
const ETAPA_ORDER: BarraFunil[] = ["Lead recebido", "Reunião", "Proposta enviada", "Negociação", "Em espera", "Ganho", "Perdido", "Encerrado sem resultado"];

const ETAPA_COLOR: Record<BarraFunil, string> = {
  "Lead recebido": "hsl(var(--muted-foreground))",
  "Reunião": "#378ADD",
  "Proposta enviada": "#7F77DD",
  "Negociação": "hsl(var(--warning))",
  "Em espera": "#9AB8D6",
  "Ganho": "hsl(var(--success))",
  "Perdido": "hsl(var(--destructive))",
  "Encerrado sem resultado": "hsl(var(--muted-foreground) / 0.5)",
  "Sem estrutura de funil": "hsl(var(--border))",
};

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const rotuloMes = (mes: string) => `${MESES[Number(mes.slice(5, 7)) - 1]}/${mes.slice(2, 4)}`;
const desdeBR = new Date(TEMPOS_DESDE).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
const primeiroNome = (n: string | null) => (n ? n.split(" ")[0] : "Sem responsável");

type Painel = "ativos" | "espera" | "encerramentos" | "reunioes";

function barraDoItem(i: ProspeccaoItem): BarraFunil {
  if (!ETAPAS_EM_ANDAMENTO.includes(i.etapaAtual)) return i.etapaAtual;
  if (i.statusGeral === "em_espera") return "Em espera";
  if (i.statusGeral === "concluido") {
    if (i.desfecho === "ganho") return "Ganho";
    if (i.desfecho === "perdido") return "Perdido";
    return "Encerrado sem resultado";
  }
  return i.etapaAtual;
}

function formatarDias(t: TempoEtapa) {
  if (t.mediana === null) return "—";
  return `${t.mediana.toLocaleString("pt-BR")} ${t.mediana === 1 ? "dia" : "dias"}`;
}

export default function ProspeccaoDashboard() {
  const { data, updatedAt, isLoading, isSyncing, error, sincronizar } = useProspeccaoData();
  const { isAdmin } = useAuth();
  const { toast } = useToast();

  const [responsavel, setResponsavel] = useState<string>("todos");
  const [painel, setPainel] = useState<Painel | null>(null);
  const [etapaSel, setEtapaSel] = useState<BarraFunil | null>(null);
  const [desfechoSel, setDesfechoSel] = useState<string | null>(null);

  const handleSync = async () => {
    try {
      await sincronizar();
      toast({ title: "Funil atualizado do Asana", description: "Os dados novos já estão visíveis para todos." });
    } catch (err) {
      toast({
        title: "Erro ao atualizar do Asana",
        description: err instanceof Error ? err.message : "Falha ao buscar dados.",
        variant: "destructive",
      });
    }
  };

  const temOutros = useMemo(
    () => !!data?.items.some((i) => !i.owner || !SEMPRE_NO_PLACAR.includes(i.owner)),
    [data]
  );

  const pertence = (owner: string | null) =>
    responsavel === "todos" ||
    (responsavel === "outros" ? !owner || !SEMPRE_NO_PLACAR.includes(owner) : owner === responsavel);

  const items = useMemo(() => (data ? data.items.filter((i) => pertence(i.owner)) : []), [data, responsavel]);
  const ind = useMemo(() => calcularIndicadores(items), [items]);

  const proximas = useMemo(() => {
    if (!data?.placar?.reunioesFuturas) return [];
    const donoDoProjeto = new Map(data.items.map((i) => [i.gid, i.owner]));
    return data.placar.reunioesFuturas.filter((r) => pertence(donoDoProjeto.get(r.projetoGid) ?? null));
  }, [data, responsavel]);

  const funilChartData = useMemo(() => {
    const contagem: Partial<Record<BarraFunil, number>> = {};
    for (const i of items) {
      const b = barraDoItem(i);
      contagem[b] = (contagem[b] ?? 0) + 1;
    }
    return ETAPA_ORDER.map((etapa) => ({ etapa, value: contagem[etapa] ?? 0 })).filter((d) => d.value > 0);
  }, [items]);

  const itensDaEtapa = useMemo(
    () => (etapaSel ? items.filter((i) => barraDoItem(i) === etapaSel) : []),
    [items, etapaSel]
  );

  const desfechoChartData = useMemo(() => {
    const concluidos = items.filter((i) => i.statusGeral === "concluido");
    return (["ganho", "perdido", "generico", "vazio"] as const)
      .map((key) => {
        const value = concluidos.filter((i) => i.desfecho === key).length;
        return { key, label: DESFECHO_LABEL[key], value, pct: concluidos.length ? Math.round((value / concluidos.length) * 100) : 0 };
      })
      .filter((d) => d.value > 0)
      .sort((a, b) => b.value - a.value);
  }, [items]);

  const itensDoDesfecho = useMemo(
    () => (desfechoSel ? items.filter((i) => i.statusGeral === "concluido" && i.desfecho === desfechoSel) : []),
    [items, desfechoSel]
  );

  const aguardandoDecisao = ind.emDia.filter((l) => l.etapa === "Aguardando decisão").length;
  const parados = useMemo(() => marcarParados(ind.emDia), [ind]);
  const ativosOrdenados = useMemo(
    () => [...ind.emDia].sort((a, b) => Number(parados.has(b.gid)) - Number(parados.has(a.gid)) || b.dias - a.dias),
    [ind, parados]
  );
  const fluxo = useMemo(() => calcularFluxo(items), [items]);

  // Conversão compara os sócios entre si, então ignora o filtro de responsável
  const conversao = useMemo(() => {
    if (!data) return [];
    return [
      ...SEMPRE_NO_PLACAR.map((n) => ({ nome: primeiroNome(n), c: calcularConversao(data.items.filter((i) => i.owner === n)) })),
      { nome: "Escritório", c: calcularConversao(data.items) },
    ];
  }, [data]);
  const esperaAntigos = ind.emEspera.filter((l) => l.dias > 30).length;
  const alternarPainel = (p: Painel) => setPainel((atual) => (atual === p ? null : p));

  const opcoesResponsavel = [
    { valor: "todos", rotulo: "Todos" },
    ...SEMPRE_NO_PLACAR.map((n) => ({ valor: n, rotulo: primeiroNome(n) })),
    ...(temOutros ? [{ valor: "outros", rotulo: "Outros" }] : []),
  ];

  return (
    <AppShell>
      <div className="space-y-5">
        {/* Cabeçalho */}
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-xl font-display font-semibold text-foreground">Funil de prospecção</h1>
            {data && (
              <p className="text-xs text-muted-foreground mt-1">
                {updatedAt
                  ? `Atualizado em ${updatedAt.toLocaleDateString("pt-BR")} às ${updatedAt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`
                  : "Atualização pendente"}
                {" · "}Fonte: Asana
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {data && (
              <div className="flex rounded-lg border border-border bg-card p-0.5" role="group" aria-label="Filtrar por responsável">
                {opcoesResponsavel.map((o) => (
                  <button
                    key={o.valor}
                    type="button"
                    onClick={() => { setResponsavel(o.valor); setEtapaSel(null); setDesfechoSel(null); }}
                    aria-pressed={responsavel === o.valor}
                    className={`px-3 py-1 rounded-md text-sm transition-colors ${
                      responsavel === o.valor ? "bg-muted text-foreground font-medium" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {o.rotulo}
                  </button>
                ))}
              </div>
            )}
            {isAdmin && (
              <Button onClick={handleSync} disabled={isSyncing} variant="outline" size="sm" className="gap-2 h-8">
                <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? "animate-spin" : ""}`} />
                {isSyncing ? "Buscando no Asana..." : "Atualizar do Asana"}
              </Button>
            )}
          </div>
        </header>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            <p className="text-xs text-muted-foreground ml-3">Lendo os projetos no Asana, pode levar alguns segundos...</p>
          </div>
        ) : error ? (
          <div className="p-4 bg-destructive/10 border border-destructive/30 rounded-lg">
            <p className="text-sm text-destructive">Erro: {error}</p>
          </div>
        ) : !data ? null : (
          <>
            {/* 1. Números principais: cada um abre o detalhe */}
            <section className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-border">
                <Kpi
                  rotulo="Pipeline ativo"
                  valor={String(ind.emDia.length)}
                  dica={
                    parados.size > 0
                      ? `${parados.size} parado${parados.size > 1 ? "s" : ""} além do normal`
                      : aguardandoDecisao > 0 ? `${aguardandoDecisao} aguardando decisão do cliente` : "Leads em andamento"
                  }
                  alerta={parados.size > 0}
                  ativo={painel === "ativos"}
                  onClick={() => alternarPainel("ativos")}
                />
                <Kpi
                  rotulo="Em espera"
                  valor={String(ind.emEspera.length)}
                  dica={esperaAntigos > 0 ? `${esperaAntigos} parados há mais de 30 dias` : "Pausados no Asana"}
                  ativo={painel === "espera"}
                  onClick={() => alternarPainel("espera")}
                />
                <Kpi
                  rotulo="Índice de fechamento"
                  valor={ind.indiceFechamento === null ? "—" : `${ind.indiceFechamento}%`}
                  dica={`${ind.ganhos} ganhos em ${ind.ganhos + ind.perdidos} decididos`}
                  ativo={painel === "encerramentos"}
                  onClick={() => alternarPainel("encerramentos")}
                />
                <Kpi
                  rotulo="Próximas reuniões"
                  valor={String(proximas.length)}
                  dica={proximas[0] ? `Próxima: ${formatarReuniao(proximas[0].reuniaoData)}` : "Nenhuma agendada"}
                  ativo={painel === "reunioes"}
                  onClick={() => alternarPainel("reunioes")}
                />
              </div>

              {painel && (
                <div className="border-t border-border px-5 py-4">
                  {painel === "ativos" && parados.size > 0 && (
                    <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1.5">
                      Em vermelho, os parados além do normal, que pedem follow-up primeiro.
                      <InfoDica texto={`Parado além do normal: está na etapa há mais de ${String(FATOR_PARADO).replace(".", ",")}× o tempo típico dos leads ativos na mesma etapa, e há pelo menos ${MINIMO_DIAS_PARADO} dias. Etapas com menos de 3 leads usam o tempo típico do pipe inteiro.`} />
                    </p>
                  )}
                  {painel === "ativos" && (
                    <TabelaRolavel vazio="Nenhum lead em andamento." linhas={ind.emDia.length}>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Projeto</TableHead>
                          <TableHead>Etapa</TableHead>
                          <TableHead className="text-right">Dias na etapa</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {ativosOrdenados.map((l) => (
                          <TableRow key={l.gid}>
                            <TableCell>
                              <LinkProjeto gid={l.gid} nome={l.nome} />
                              {responsavel === "todos" && <span className="block text-xs text-muted-foreground">{primeiroNome(l.owner)}</span>}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">{l.etapa}</TableCell>
                            <TableCell className="text-right">
                              <Badge
                                variant="outline"
                                className={parados.has(l.gid) ? "bg-destructive/10 text-destructive border-destructive/20" : "text-muted-foreground"}
                              >
                                {l.dias}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </TabelaRolavel>
                  )}

                  {painel === "espera" && (
                    <TabelaRolavel vazio="Nenhum lead em espera." linhas={ind.emEspera.length}>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Projeto</TableHead>
                          <TableHead className="text-right">Dias em espera</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {ind.emEspera.map((l) => (
                          <TableRow key={l.gid}>
                            <TableCell>
                              <LinkProjeto gid={l.gid} nome={l.nome} />
                              {responsavel === "todos" && <span className="block text-xs text-muted-foreground">{primeiroNome(l.owner)}</span>}
                            </TableCell>
                            <TableCell className="text-right text-muted-foreground">{l.dias}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </TabelaRolavel>
                  )}

                  {painel === "encerramentos" && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1.5">
                        Como terminaram os projetos encerrados. Clique numa barra para ver os projetos.
                        {ind.concluidosSemResultado > 0 && (
                          <InfoDica texto={`${ind.concluidosSemResultado} encerrados sem ganho ou perda registrado ficam fora do índice de fechamento.`} />
                        )}
                      </p>
                      <BarrasClicaveis
                        dados={desfechoChartData.map((d) => ({ chave: d.key, rotulo: d.label, valor: d.value, texto: `${d.value} · ${d.pct}%`, cor: DESFECHO_COLOR[d.key] }))}
                        selecionada={desfechoSel}
                        onSelecionar={setDesfechoSel}
                      />
                      {desfechoSel && (
                        <ListaOportunidades
                          titulo={DESFECHO_LABEL[desfechoSel]}
                          cor={DESFECHO_COLOR[desfechoSel]}
                          itens={itensDoDesfecho}
                          mostrarMotivo
                          onFechar={() => setDesfechoSel(null)}
                        />
                      )}
                    </div>
                  )}

                  {painel === "reunioes" && (
                    <TabelaRolavel vazio="Nenhuma reunião com data de hoje em diante." linhas={proximas.length}>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Reunião</TableHead>
                          <TableHead>Projeto</TableHead>
                          <TableHead className="text-right">Agendou</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {proximas.map((r) => (
                          <TableRow key={r.taskGid}>
                            <TableCell className="whitespace-nowrap font-medium text-foreground">{formatarReuniao(r.reuniaoData)}</TableCell>
                            <TableCell>
                              <a href={`https://app.asana.com/0/${r.projetoGid}/${r.taskGid}`} target="_blank" rel="noopener noreferrer" className="hover:underline text-foreground">
                                {r.projeto}
                              </a>
                            </TableCell>
                            <TableCell className="text-right text-muted-foreground">{primeiroNome(r.agendadaPor)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </TabelaRolavel>
                  )}
                </div>
              )}
            </section>

            {/* 2. Velocidade e conversão */}
            <section className="bg-card rounded-xl border border-border shadow-sm px-5 py-4">
              <h3 className="text-sm font-display font-semibold text-foreground flex items-center gap-1.5 mb-3">
                Tempo entre etapas
                <InfoDica texto={`Mediana dos leads criados desde ${desdeBR}. Projetos anteriores tiveram tarefas marcadas em lote e distorceriam o tempo real.`} />
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Tempo rotulo="Do lead à proposta" t={ind.ateProposta} />
                <Tempo rotulo="Da proposta ao fechamento" t={ind.ateGanho} />
                <Tempo rotulo="Da proposta à perda" t={ind.atePerda} />
              </div>

              <div className="mt-5 pt-4 border-t border-border">
                <h3 className="text-sm font-display font-semibold text-foreground flex items-center gap-1.5 mb-2">
                  Conversão por etapa
                  <InfoDica texto="De cada 100 leads que passaram pela etapa, quantos avançaram. Conta quem avançou e quem foi encerrado ali; quem ainda está na etapa fica fora. Só entram projetos com a estrutura de funil no Asana." />
                </h3>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead />
                        <TableHead className="text-right">Lead → Reunião</TableHead>
                        <TableHead className="text-right">Reunião → Proposta</TableHead>
                        <TableHead className="text-right">Proposta → Ganho</TableHead>
                        <TableHead className="text-right">Do lead ao contrato</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {conversao.map((linha, k) => (
                        <TableRow key={linha.nome} className={k === conversao.length - 1 ? "bg-muted/30" : ""}>
                          <TableCell className="font-medium text-foreground">{linha.nome}</TableCell>
                          <CelulaTaxa t={linha.c.leadReuniao} />
                          <CelulaTaxa t={linha.c.reuniaoProposta} />
                          <CelulaTaxa t={linha.c.propostaGanho} />
                          <CelulaTaxa t={linha.c.geral} destaque />
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </section>

            {/* 3. Funil e entrada de leads */}
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
              <section className="lg:col-span-3 bg-card rounded-xl border border-border shadow-sm p-5">
                <h3 className="text-sm font-display font-semibold text-foreground mb-1">Etapa atual do pipeline</h3>
                <p className="text-xs text-muted-foreground mb-3">Clique numa barra para ver os projetos.</p>
                <BarrasClicaveis
                  dados={funilChartData.map((d) => ({ chave: d.etapa, rotulo: d.etapa, valor: d.value, texto: String(d.value), cor: ETAPA_COLOR[d.etapa] }))}
                  selecionada={etapaSel}
                  onSelecionar={(k) => setEtapaSel(k as BarraFunil | null)}
                />
              </section>

              <section className="lg:col-span-2 bg-card rounded-xl border border-border shadow-sm p-5">
                <h3 className="text-sm font-display font-semibold text-foreground flex items-center gap-1.5 mb-3">
                  Entrada e saída do pipe
                  <InfoDica texto="Entrada: lead criado no Asana. Saída: lead ganho, perdido ou concluído, na data da decisão (ou da última atualização de status, quando a decisão não foi registrada). Para o pipe não encolher, precisa entrar ao menos o que sai." />
                </h3>
                <div className="grid grid-cols-2 gap-3 mb-1">
                  <div>
                    <p className="text-xs text-muted-foreground">Entraram · 30 dias</p>
                    <p className="text-2xl font-display font-semibold text-foreground tabular-nums">{fluxo.entradas30}</p>
                    <p className={`text-xs ${fluxo.entradas30 < fluxo.mediaEntradasAnterior * 0.8 ? "text-destructive" : "text-muted-foreground"}`}>
                      Média anterior: {Math.round(fluxo.mediaEntradasAnterior)}/mês
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Saíram · 30 dias</p>
                    <p className="text-2xl font-display font-semibold text-foreground tabular-nums">{fluxo.saidas30}</p>
                    <p className={`text-xs ${fluxo.saidas30 > fluxo.entradas30 ? "text-destructive" : "text-muted-foreground"}`}>
                      {fluxo.saidas30 > fluxo.entradas30
                        ? "Pipe encolhendo"
                        : fluxo.entradas30 === fluxo.saidas30 ? "Pipe estável" : "Pipe crescendo"}
                    </p>
                  </div>
                </div>
                <div className="h-[170px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={fluxo.porMes.map((d) => ({ ...d, rotulo: rotuloMes(d.mes) }))} margin={{ top: 8, left: 0, right: 0 }} barGap={2}>
                      <XAxis dataKey="rotulo" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                      <YAxis allowDecimals={false} hide />
                      <Tooltip cursor={{ fill: "hsl(var(--muted))" }} />
                      <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="entradas" name="Entraram" fill="#7F77DD" radius={[3, 3, 0, 0]} maxBarSize={14} />
                      <Bar dataKey="saidas" name="Saíram" fill="hsl(var(--muted-foreground) / 0.45)" radius={[3, 3, 0, 0]} maxBarSize={14} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </section>
            </div>

            {etapaSel && (
              <section className="bg-card rounded-xl border border-border shadow-sm px-5 pb-4">
                <ListaOportunidades
                  titulo={etapaSel}
                  cor={ETAPA_COLOR[etapaSel]}
                  itens={itensDaEtapa}
                  mostrarMotivo={etapaSel === "Ganho" || etapaSel === "Perdido" || etapaSel === "Encerrado sem resultado"}
                  onFechar={() => setEtapaSel(null)}
                />
              </section>
            )}

            {/* 4. Placar dos sócios */}
            {data.placar && <PlacarReunioes placar={data.placar} />}

            {/* 5. Ajustes de cadastro, recolhido */}
            <PendenciasCadastro items={items} placar={data.placar} />
          </>
        )}
      </div>

      <footer className="border-t border-border py-4 mt-8">
        <div className="container text-center text-xs text-muted-foreground">
          <a href="https://wolffescripes.com.br" target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors">
            Wolff e Scripes Advogados
          </a>
        </div>
      </footer>
    </AppShell>
  );
}

function Kpi({
  rotulo, valor, dica, ativo, onClick, alerta = false,
}: { rotulo: string; valor: string; dica: string; ativo: boolean; onClick: () => void; alerta?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={ativo}
      className={`relative text-left px-5 py-4 bg-card transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${ativo ? "!bg-muted/40" : ""}`}
    >
      {ativo && <span className="absolute left-0 right-0 bottom-0 h-0.5" style={{ background: LARANJA }} />}
      <p className="text-xs text-muted-foreground">{rotulo}</p>
      <p className="text-3xl font-display font-semibold text-foreground mt-1 tabular-nums">{valor}</p>
      <p className={`text-xs mt-1 ${alerta ? "text-destructive" : "text-muted-foreground"}`}>{dica}</p>
    </button>
  );
}

function CelulaTaxa({ t, destaque = false }: { t: Taxa; destaque?: boolean }) {
  return (
    <TableCell className="text-right whitespace-nowrap">
      <span className={`tabular-nums ${destaque ? "font-semibold text-foreground" : "text-foreground"}`}>
        {t.pct === null ? "—" : `${t.pct}%`}
      </span>
      <span className="block text-[11px] text-muted-foreground/70">{t.base > 0 ? `${t.avancaram} de ${t.base}` : "sem casos"}</span>
    </TableCell>
  );
}

function Tempo({ rotulo, t }: { rotulo: string; t: TempoEtapa }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{rotulo}</p>
      <p className="text-lg font-display font-semibold text-foreground mt-0.5">{formatarDias(t)}</p>
      <p className="text-xs text-muted-foreground/70">{t.base === 0 ? "Sem casos ainda" : `${t.base} ${t.base === 1 ? "lead" : "leads"}`}</p>
    </div>
  );
}

function BarrasClicaveis({
  dados, selecionada, onSelecionar,
}: {
  dados: { chave: string; rotulo: string; valor: number; texto: string; cor: string }[];
  selecionada: string | null;
  onSelecionar: (chave: string | null) => void;
}) {
  return (
    <div className="cursor-pointer" style={{ height: Math.max(dados.length * 30, 80) }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={dados}
          layout="vertical"
          margin={{ left: 0, right: 56 }}
          barCategoryGap={8}
          onClick={(s: any) => {
            const d = dados.find((x) => x.rotulo === s?.activeLabel);
            if (d) onSelecionar(selecionada === d.chave ? null : d.chave);
          }}
        >
          <XAxis type="number" allowDecimals={false} hide />
          <YAxis type="category" dataKey="rotulo" width={150} tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "hsl(var(--foreground))" }} />
          <Tooltip cursor={{ fill: "hsl(var(--muted))" }} content={() => null} />
          <Bar dataKey="valor" radius={[0, 4, 4, 0]} maxBarSize={16}>
            {dados.map((d) => (
              <Cell key={d.chave} fill={d.cor} fillOpacity={selecionada && selecionada !== d.chave ? 0.3 : 1} />
            ))}
            <LabelList
              dataKey="valor"
              content={(props: any) => {
                const { x, y, width, height, index } = props;
                return (
                  <text x={x + width + 6} y={y + height / 2} dy={4} fontSize={12} fontWeight={600} fill="hsl(var(--foreground))">
                    {dados[index]?.texto}
                  </text>
                );
              }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function TabelaRolavel({ vazio, linhas, children }: { vazio: string; linhas: number; children: React.ReactNode }) {
  if (linhas === 0) return <p className="text-xs text-muted-foreground py-2">{vazio}</p>;
  return (
    <div className="max-h-[340px] overflow-y-auto">
      <Table>{children}</Table>
    </div>
  );
}

function LinkProjeto({ gid, nome }: { gid: string; nome: string }) {
  return (
    <a href={`https://app.asana.com/0/${gid}`} target="_blank" rel="noopener noreferrer" className="hover:underline text-foreground">
      {nome}
    </a>
  );
}
