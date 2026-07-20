import { useMemo, useRef, useState } from "react";
import {
  RefreshCw, FolderKanban, TrendingUp, Clock, AlertTriangle, ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, LabelList,
} from "recharts";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { useProspeccaoData, type Etapa, type MotivoFonte } from "@/hooks/use-prospeccao-data";

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

const ETAPA_ORDER: Etapa[] = ["Lead recebido", "Reunião", "Proposta enviada", "Negociação", "Ganho", "Perdido", "Sem estrutura de funil"];

const ETAPA_COLOR: Record<Etapa, string> = {
  "Lead recebido": "hsl(var(--muted-foreground))",
  "Reunião": "#378ADD",
  "Proposta enviada": "#7F77DD",
  "Negociação": "hsl(var(--warning))",
  "Ganho": "hsl(var(--success))",
  "Perdido": "hsl(var(--destructive))",
  "Sem estrutura de funil": "hsl(var(--border))",
};

const MOTIVO_FONTE_LABEL: Record<MotivoFonte, string> = {
  tarefa_funil: "Tarefa do funil (Asana)",
  status_projeto: "Status do projeto",
  nao_encontrado: "Não encontrado",
};

function pctBadgeClass(pct: number) {
  if (pct <= 20) return "bg-success/10 text-success-foreground border-success/20";
  if (pct <= 50) return "bg-warning/10 text-warning-foreground border-warning/20";
  return "bg-destructive/10 text-destructive border-destructive/20";
}

export default function ProspeccaoDashboard() {
  const { data, isLoading, error, reload } = useProspeccaoData();
  const [ownerFilter, setOwnerFilter] = useState<string>("todos");
  const [statusFilter, setStatusFilter] = useState<string>("todos");
  const pendentesRef = useRef<HTMLDivElement>(null);

  const owners = useMemo(() => {
    if (!data) return [];
    return Object.keys(data.porResponsavel).sort();
  }, [data]);

  const desfechoChartData = useMemo(() => {
    if (!data) return [];
    const { ganho, perdido, generico, vazio, concluidos } = data.resumo;
    return (["vazio", "perdido", "generico", "ganho"] as const)
      .map((key) => {
        const value = { ganho, perdido, generico, vazio }[key];
        return {
          key,
          label: DESFECHO_LABEL[key],
          value,
          pct: concluidos > 0 ? Math.round((value / concluidos) * 100) : 0,
        };
      })
      .sort((a, b) => b.value - a.value);
  }, [data]);

  const funilChartData = useMemo(() => {
    if (!data) return [];
    return ETAPA_ORDER
      .map((etapa) => ({ etapa, value: data.funilEtapas[etapa] ?? 0 }))
      .filter((d) => d.value > 0);
  }, [data]);

  const responsavelData = useMemo(() => {
    if (!data) return [];
    return Object.entries(data.porResponsavel)
      .map(([owner, v]) => ({ owner, ...v }))
      .sort((a, b) => b.semMotivo - a.semMotivo);
  }, [data]);

  const pendentesFiltrados = useMemo(() => {
    if (!data) return [];
    return data.pendentes.filter((p) => {
      if (ownerFilter !== "todos" && (p.owner ?? "Sem responsável") !== ownerFilter) return false;
      if (statusFilter !== "todos" && p.desfecho !== statusFilter) return false;
      return true;
    });
  }, [data, ownerFilter, statusFilter]);

  const scrollToPendentes = () => pendentesRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader activeTab={"prospeccao" as never} />

      <div className="container py-5">
        <div className="space-y-4">
          {/* Cabeçalho da página */}
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-xl font-display font-semibold text-foreground">Funil de prospecção</h1>
              <p className="text-sm text-muted-foreground mt-0.5">Visão executiva do pipeline comercial</p>
              {data && (
                <p className="text-xs text-muted-foreground/70 mt-1">
                  Atualizado hoje às {new Date(data.generatedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                  {" · "}Fonte: Asana{" · "}{data.resumo.total} oportunidades
                </p>
              )}
            </div>
            <Button onClick={reload} className="gap-2 bg-[#FB7435] hover:bg-[#e2632b] text-white">
              <RefreshCw className="w-4 h-4" />
              Atualizar
            </Button>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
              <p className="text-xs text-muted-foreground ml-3">Lendo tarefas de cada projeto no Asana, pode levar alguns segundos...</p>
            </div>
          ) : error ? (
            <div className="p-4 bg-destructive/10 border border-destructive/30 rounded-lg">
              <p className="text-sm text-destructive">Erro: {error}</p>
            </div>
          ) : !data ? null : (
            <>
              {/* Cobertura da estrutura de funil */}
              <p className="text-xs text-muted-foreground">
                {data.resumo.comEstruturaFunil} de {data.resumo.total} projetos usam o padrão de funil (Lead → Reunião → Proposta → Negociação → Ganho/Perdido) na estrutura de tarefas do Asana
                {data.resumo.semEstruturaFunil > 0 && <> · {data.resumo.semEstruturaFunil} ainda em modelo antigo, sem essa estrutura</>}
              </p>

              {/* Filtros */}
              <div className="flex flex-wrap items-center gap-2">
                <Select value={ownerFilter} onValueChange={setOwnerFilter}>
                  <SelectTrigger className="w-[180px] h-8 text-sm"><SelectValue placeholder="Responsável" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos os responsáveis</SelectItem>
                    {owners.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[170px] h-8 text-sm"><SelectValue placeholder="Situação" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todas as situações</SelectItem>
                    <SelectItem value="vazio">Sem classificação</SelectItem>
                    <SelectItem value="generico">Motivo genérico</SelectItem>
                  </SelectContent>
                </Select>
                <span className="text-xs text-muted-foreground/60">
                  Período e tipo de serviço ainda não têm dado confiável pra filtrar
                </span>
              </div>

              {/* Cards com hierarquia por criticidade */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <StatCard
                  icon={FolderKanban}
                  tone="neutral"
                  label="Pipeline total"
                  value={String(data.resumo.total)}
                  hint={data.resumo.novosUltimos30Dias > 0 ? `+${data.resumo.novosUltimos30Dias} nos últimos 30 dias` : undefined}
                />
                <StatCard
                  icon={TrendingUp}
                  tone="success"
                  label="Em andamento"
                  value={String(data.resumo.emDia)}
                  hint={`${Math.round((data.resumo.emDia / data.resumo.total) * 100)}% do pipeline`}
                />
                <StatCard
                  icon={Clock}
                  tone="warning"
                  label="Aguardando retorno"
                  value={String(data.resumo.emEspera)}
                  hint={data.resumo.emEsperaAntigos > 0 ? `${data.resumo.emEsperaAntigos} há mais de 7 dias parado` : undefined}
                />
                <StatCard
                  icon={AlertTriangle}
                  tone="danger"
                  label="Sem motivo de encerramento"
                  value={String(data.resumo.semMotivo)}
                  hint={`${data.resumo.taxaSemMotivo}% dos concluídos`}
                  onClick={scrollToPendentes}
                />
              </div>

              {/* Funil real por etapa */}
              {funilChartData.length > 0 && (
                <section className="bg-card rounded-xl border border-border p-4 shadow-sm">
                  <h3 className="text-sm font-display font-semibold text-foreground mb-1">
                    Etapa atual do pipeline
                  </h3>
                  <p className="text-xs text-muted-foreground mb-3">
                    Onde cada oportunidade está agora, com base nas tarefas concluídas no Asana
                  </p>
                  <div className="h-[190px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={funilChartData} layout="vertical" margin={{ left: 8, right: 30 }} barCategoryGap={10}>
                        <CartesianGrid horizontal={false} stroke="hsl(var(--border))" />
                        <XAxis type="number" allowDecimals={false} hide />
                        <YAxis type="category" dataKey="etapa" width={120} tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "hsl(var(--foreground))" }} />
                        <Tooltip cursor={{ fill: "hsl(var(--muted))" }} />
                        <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={20}>
                          {funilChartData.map((d) => <Cell key={d.etapa} fill={ETAPA_COLOR[d.etapa]} />)}
                          <LabelList dataKey="value" position="right" style={{ fontSize: 12, fontWeight: 500, fill: "hsl(var(--foreground))" }} />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </section>
              )}

              {/* Desfecho + alerta de qualidade lado a lado */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                <section className="bg-card rounded-xl border border-border p-4 shadow-sm">
                  <h3 className="text-sm font-display font-semibold text-foreground mb-1">
                    Classificação dos encerramentos
                  </h3>
                  <p className="text-xs text-muted-foreground mb-3">
                    {data.resumo.concluidos} oportunidades encerradas
                    {data.resumo.taxaConversaoClassificados !== null && (
                      <> · {data.resumo.taxaConversaoClassificados}% de conversão entre as classificadas</>
                    )}
                  </p>
                  <div className="h-[170px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={desfechoChartData} layout="vertical" margin={{ left: 8, right: 44 }} barCategoryGap={14}>
                        <CartesianGrid horizontal={false} stroke="hsl(var(--border))" />
                        <XAxis type="number" allowDecimals={false} hide />
                        <YAxis type="category" dataKey="label" width={110} tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "hsl(var(--foreground))" }} />
                        <Tooltip cursor={{ fill: "hsl(var(--muted))" }} />
                        <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={22}>
                          {desfechoChartData.map((d) => <Cell key={d.key} fill={DESFECHO_COLOR[d.key]} />)}
                          <LabelList
                            dataKey="value"
                            position="right"
                            content={(props: any) => {
                              const { x, y, width, height, index } = props;
                              const d = desfechoChartData[index];
                              return (
                                <text x={x + width + 6} y={y + height / 2} dy={4} fontSize={12} fontWeight={500} fill="hsl(var(--foreground))">
                                  {d.value} · {d.pct}%
                                </text>
                              );
                            }}
                          />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </section>

                <section className="bg-destructive/5 rounded-xl border border-destructive/20 p-4 shadow-sm flex flex-col justify-between">
                  <div>
                    <h3 className="text-sm font-display font-semibold text-foreground mb-1">Qualidade dos dados</h3>
                    <p className="text-sm text-foreground mt-2">
                      <span className="font-semibold">{data.resumo.semMotivo} de {data.resumo.concluidos}</span> oportunidades
                      encerradas não possuem motivo informado.
                    </p>
                    <p className="text-xs text-muted-foreground mt-2">
                      Isso vem só dos projetos em modelo antigo, sem a tarefa Ganho/Perdido no funil — os que já usam o novo padrão têm o motivo automaticamente.
                    </p>
                  </div>
                  <Button variant="outline" size="sm" className="gap-2 mt-4 self-start border-destructive/30 text-destructive hover:bg-destructive/10" onClick={scrollToPendentes}>
                    Ver pendências
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Button>
                </section>
              </div>

              {/* Pendências por responsável — tabela compacta */}
              <section className="bg-card rounded-xl border border-border p-4 shadow-sm">
                <h3 className="text-sm font-display font-semibold text-foreground mb-1">
                  Pendências de encerramento por responsável
                </h3>
                <p className="text-xs text-muted-foreground mb-3">
                  Oportunidades concluídas sem motivo de ganho ou perda registrado
                </p>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Responsável</TableHead>
                      <TableHead className="text-right">Sem motivo</TableHead>
                      <TableHead className="text-right">Total encerrado</TableHead>
                      <TableHead className="text-right">% pendente</TableHead>
                      <TableHead className="text-right">Ação</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {responsavelData.map((r) => (
                      <TableRow key={r.owner}>
                        <TableCell className="font-medium text-foreground">{r.owner}</TableCell>
                        <TableCell className="text-right">{r.semMotivo}</TableCell>
                        <TableCell className="text-right text-muted-foreground">{r.concluidos}</TableCell>
                        <TableCell className="text-right">
                          <Badge variant="outline" className={pctBadgeClass(r.pct)}>{r.pct}%</Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => { setOwnerFilter(r.owner); scrollToPendentes(); }}
                          >
                            Ver projetos
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </section>

              {/* Lista nomeada de pendentes */}
              <section ref={pendentesRef} className="bg-card rounded-xl border border-border p-4 shadow-sm scroll-mt-4">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-sm font-display font-semibold text-foreground">
                    Projetos pendentes de preenchimento
                  </h3>
                  {(ownerFilter !== "todos" || statusFilter !== "todos") && (
                    <Button variant="ghost" size="sm" onClick={() => { setOwnerFilter("todos"); setStatusFilter("todos"); }}>
                      Limpar filtros
                    </Button>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mb-3">
                  {pendentesFiltrados.length} projeto(s) concluído(s) sem motivo claro de ganho ou perda
                </p>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Projeto</TableHead>
                      <TableHead>Responsável</TableHead>
                      <TableHead>Situação</TableHead>
                      <TableHead>Fonte checada</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pendentesFiltrados.map((p) => (
                      <TableRow key={p.gid}>
                        <TableCell>
                          <a href={`https://app.asana.com/0/0/${p.gid}`} target="_blank" rel="noopener noreferrer" className="hover:underline">
                            {p.name}
                          </a>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{p.owner ?? "Sem responsável"}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">
                            {p.desfecho === "generico" ? "Motivo genérico" : "Sem classificação"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{MOTIVO_FONTE_LABEL[p.motivoFonte]}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </section>
            </>
          )}
        </div>
      </div>

      <footer className="border-t border-border bg-card/50 py-4 mt-4">
        <div className="container text-center text-sm text-muted-foreground">
          <a href="https://wolffescripes.com.br" target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors">
            Wolff e Scripes Advogados
          </a>{" "}
          &bull; Funil de Prospecção
        </div>
      </footer>
    </div>
  );
}

function StatCard({
  icon: Icon,
  tone,
  label,
  value,
  hint,
  onClick,
}: {
  icon: any;
  tone: "neutral" | "success" | "warning" | "danger";
  label: string;
  value: string;
  hint?: string;
  onClick?: () => void;
}) {
  const toneClasses = {
    neutral: { bg: "bg-muted/50", icon: "text-muted-foreground", border: "" },
    success: { bg: "bg-success/10", icon: "text-success-foreground", border: "" },
    warning: { bg: "bg-warning/10", icon: "text-warning-foreground", border: "" },
    danger: { bg: "bg-destructive/10", icon: "text-destructive", border: "border-destructive/20" },
  }[tone];

  return (
    <div
      className={`bg-card rounded-xl border ${toneClasses.border || "border-border"} p-3.5 shadow-sm ${onClick ? "cursor-pointer hover:border-destructive/40 transition-colors" : ""}`}
      onClick={onClick}
    >
      <div className="flex items-center gap-2 mb-2">
        <div className={`p-1.5 rounded-md ${toneClasses.bg}`}>
          <Icon className={`w-3.5 h-3.5 ${toneClasses.icon}`} />
        </div>
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
      <p className="text-xl font-bold text-foreground">{value}</p>
      {hint && <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>}
    </div>
  );
}
