import { useMemo, useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Users, Clock4, Gauge, Filter as FunnelIcon, MessageCircle,
  CircleCheck, AlertTriangle, Upload, X, Send, ChevronRight,
} from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { AppShell } from "@/components/layout/AppShell";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { useProspeccaoData } from "@/hooks/use-prospeccao-data";
import { useMonthlySnapshots } from "@/hooks/use-monthly-snapshots";
import { DashboardData } from "@/lib/data-parser";
import { responderPergunta } from "@/lib/assistant-rules";

interface SistemaHomeProps {
  dashboardData: DashboardData | null;
  lastUpdated: Date | null;
}

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

function Kpi({
  icone: Icone, rotulo, valor, apoio, alerta, barra,
}: {
  icone: typeof Users; rotulo: string; valor: string;
  apoio?: string; alerta?: boolean; barra?: number;
}) {
  return (
    <div className="bg-card p-4">
      <div className="flex items-center gap-1.5 mb-2">
        <Icone className="w-3.5 h-3.5 text-muted-foreground" />
        <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{rotulo}</p>
      </div>
      <p className={cn(
        "text-[30px] font-display font-semibold tabular-nums leading-none tracking-tight",
        alerta ? "text-destructive" : "text-foreground",
      )}>
        {valor}
      </p>
      {apoio && <p className="text-[13px] text-muted-foreground mt-1.5">{apoio}</p>}
      {barra !== undefined && (
        <div className="mt-2.5 h-1.5 rounded-full bg-muted overflow-hidden">
          <div
            className={cn("h-full rounded-full", barra >= 100 ? "bg-destructive" : "bg-primary")}
            style={{ width: `${Math.min(barra, 100)}%` }}
          />
        </div>
      )}
    </div>
  );
}

function timeAgo(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h}h`;
  const d = Math.floor(h / 24);
  return `há ${d}d`;
}

interface Activity {
  key: string;
  icon: "success" | "warning" | "neutral";
  text: string;
  timestamp: number;
}

export default function SistemaHome({ dashboardData, lastUpdated }: SistemaHomeProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [chatOpen, setChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [messages, setMessages] = useState<{ role: "user" | "assistant"; text: string }[]>([
    { role: "assistant", text: "Oi! Pergunte sobre contratos, horas ou prospecção. Digite \"ajuda\" pra ver exemplos." },
  ]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { data: prospeccaoData } = useProspeccaoData();
  const { snapshots } = useMonthlySnapshots();
  const [serie, setSerie] = useState<"valor" | "horas" | "clientes">("valor");
  const [periodo, setPeriodo] = useState<3 | 6 | 0>(6); // 0 = todo o histórico

  const fullName = user?.user_metadata?.name || (user?.email || "").split("@")[0].split(".")[0];
  const greetingName = fullName ? fullName.trim().split(/\s+/)[0].replace(/^\w/, (c: string) => c.toUpperCase()) : "";

  const greetingWord = (() => {
    const hour = new Date().getHours();
    if (hour < 12) return "Bom dia";
    if (hour < 18) return "Boa tarde";
    return "Boa noite";
  })();

  // --- Números reais por módulo ---
  const recorrentes = useMemo(() => {
    const contratos = dashboardData?.clients.length ?? 0;
    const emAlerta = (dashboardData?.clientsAtCritical ?? 0) + (dashboardData?.clientsAtOverflow ?? 0);
    const clientesAlerta = (dashboardData?.clients ?? [])
      .filter((c) => c.creditUsage?.isCritical)
      .map((c) => c.project);
    return { contratos, emAlerta, clientesAlerta };
  }, [dashboardData]);

  const historico = useMemo(() => {
    const ordenados = [...snapshots].sort((a, b) => (a.year - b.year) || (a.month - b.month));
    const recorte = periodo === 0 ? ordenados : ordenados.slice(-periodo);
    return recorte.map((s) => ({
      mes: `${MESES[s.month - 1]}/${String(s.year).slice(2)}`,
      horas: Math.round(s.total_horas),
      valor: Math.round(s.total_valor),
      clientes: (s.client_data ?? []).length,
    }));
  }, [snapshots, periodo]);

  // O último snapshot pode ser do mês corrente, que ainda não fechou.
  // Comparar mês pela metade com mês fechado sempre mostra queda.
  const mesCorrenteAberto = useMemo(() => {
    const ultimo = [...snapshots].sort((a, b) => (a.year - b.year) || (a.month - b.month)).at(-1);
    if (!ultimo) return false;
    const hoje = new Date();
    return ultimo.month === hoje.getMonth() + 1 && ultimo.year === hoje.getFullYear();
  }, [snapshots]);

  const variacao = useMemo(() => {
    const fechados = mesCorrenteAberto ? historico.slice(0, -1) : historico;
    if (fechados.length < 2) return null;
    const campo = serie;
    const atual = fechados.at(-1)![campo];
    const anterior = fechados.at(-2)![campo];
    if (!anterior) return null;
    return {
      pct: Math.round(((atual - anterior) / anterior) * 1000) / 10,
      mes: fechados.at(-1)!.mes,
    };
  }, [historico, serie, mesCorrenteAberto]);

  const prospeccao = useMemo(() => ({
    total: prospeccaoData?.resumo.total ?? 0,
    semMotivo: prospeccaoData?.resumo.semMotivo ?? 0,
  }), [prospeccaoData]);

  // --- Atividade recente real, combinada dos módulos ---
  const activities = useMemo(() => {
    const items: Activity[] = [];

    if (lastUpdated) {
      items.push({
        key: "recorrentes",
        icon: "neutral",
        text: "Painel de clientes recorrentes foi atualizado",
        timestamp: lastUpdated.getTime(),
      });
    }

    if (prospeccaoData) {
      const recentes = prospeccaoData.items
        .filter((i) => i.statusGeral === "concluido" && i.desfecho)
        .filter((i) => Date.now() - new Date(i.modifiedAt).getTime() < 3 * 86400000)
        .sort((a, b) => new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime())
        .slice(0, 2);
      for (const r of recentes) {
        items.push({
          key: `prospeccao-${r.gid}`,
          icon: r.desfecho === "ganho" ? "success" : r.desfecho === "perdido" ? "warning" : "neutral",
          text: `${r.name.trim()} foi marcado como ${r.desfecho} no funil de prospecção`,
          timestamp: new Date(r.modifiedAt).getTime(),
        });
      }
    }

    return items.sort((a, b) => b.timestamp - a.timestamp).slice(0, 5);
  }, [lastUpdated, prospeccaoData]);

  // Mês anterior fechado, para dar régua aos números do mês corrente.
  const mesAnterior = useMemo(() => {
    const ordenados = [...snapshots].sort((a, b) => (a.year - b.year) || (a.month - b.month));
    const fechados = mesCorrenteAberto ? ordenados.slice(0, -1) : ordenados;
    const ultimo = fechados.at(-1);
    if (!ultimo) return null;
    return {
      mes: `${MESES[ultimo.month - 1]}`,
      horas: Math.round(ultimo.total_horas),
      valor: Math.round(ultimo.total_valor),
    };
  }, [snapshots, mesCorrenteAberto]);

  // Carteira mensal: os três números que respondem "como estamos agora".
  // Vêm da mesma fonte do painel de recorrentes, para não divergir dele.
  const carteira = useMemo(() => {
    const comContrato = (dashboardData?.clients ?? []).filter((c) => c.creditUsage);
    const mensalidades = comContrato.reduce((soma, c) => soma + (c.creditUsage!.valorPago ?? 0), 0);
    const horasMes = comContrato.reduce((soma, c) => soma + (c.horasMensal ?? 0), 0);
    const creditoTotal = comContrato.reduce((soma, c) => soma + (c.creditUsage!.valorCredito ?? 0), 0);
    const consumido = comContrato.reduce((soma, c) => soma + (c.creditUsage!.valorConsumido ?? 0), 0);
    return {
      mensalidades,
      contratos: comContrato.length,
      horasMes,
      consumoPct: creditoTotal > 0 ? Math.round((consumido / creditoTotal) * 100) : 0,
    };
  }, [dashboardData]);

  // Quem está mais perto de estourar. É a resposta ao "19 em alerta":
  // o número sozinho não diz em quem mexer.
  const proximosDoLimite = useMemo(() => {
    return (dashboardData?.clients ?? [])
      .filter((c) => c.creditUsage)
      .map((c) => ({
        nome: c.project,
        pct: Math.round(c.creditUsage!.percentualUsado),
        horas: c.horasMensal,
      }))
      .sort((a, b) => b.pct - a.pct)
      .slice(0, 5);
  }, [dashboardData]);

  // Pendências: só entra o que exige ação e leva a algum lugar.
  const pendencias = useMemo(() => {
    const itens: {
      key: string; texto: string; contagem: number;
      prioridade: "critico" | "atencao"; destino: string;
    }[] = [];
    if (recorrentes.emAlerta > 0) {
      itens.push({
        key: "alerta",
        texto: `cliente${recorrentes.emAlerta !== 1 ? "s" : ""} com contrato em alerta`,
        contagem: recorrentes.emAlerta,
        prioridade: "critico",
        destino: "/recorrentes",
      });
    }
    if (prospeccao.semMotivo > 0) {
      itens.push({
        key: "prospeccao",
        texto: `oportunidade${prospeccao.semMotivo !== 1 ? "s" : ""} sem motivo registrado`,
        contagem: prospeccao.semMotivo,
        prioridade: "atencao",
        destino: "/prospeccao",
      });
    }
    return itens;
  }, [recorrentes.emAlerta, prospeccao.semMotivo]);

  useEffect(() => {
    if (chatOpen) messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, chatOpen]);

  const handleAsk = (e: React.FormEvent) => {
    e.preventDefault();
    const pergunta = chatInput.trim();
    if (!pergunta) return;
    const resposta = responderPergunta(pergunta, {
      recorrentes,
      prospeccao: { total: prospeccao.total, semMotivo: prospeccao.semMotivo, porResponsavel: prospeccaoData?.porResponsavel ?? {} },
    });
    setMessages((m) => [...m, { role: "user", text: pergunta }, { role: "assistant", text: resposta }]);
    setChatInput("");
  };

  return (
    <AppShell>
      <>
        <div className="mb-4">
          <h1 className="text-[22px] font-display font-semibold text-foreground leading-tight">
            {greetingWord}{greetingName ? `, ${greetingName}` : ""}
          </h1>
          <p className="text-[13px] text-muted-foreground mt-0.5">
            {lastUpdated
              ? `Dados atualizados ${timeAgo(lastUpdated).toLowerCase()}.`
              : "Nenhuma importação de clientes recorrentes ainda."}
          </p>
        </div>

        {/* Carteira mensal: quanto entra, quanto foi trabalhado, quanto do crédito foi usado */}
        {carteira.contratos > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-px bg-border rounded-xl overflow-hidden border border-border mb-4">
            <Kpi
              icone={Users}
              rotulo="Mensalidades contratadas"
              valor={carteira.mensalidades.toLocaleString("pt-BR", {
                style: "currency", currency: "BRL", maximumFractionDigits: 0,
              })}
              apoio={`${carteira.contratos} contrato${carteira.contratos !== 1 ? "s" : ""} mensal${carteira.contratos !== 1 ? "is" : ""} ativo${carteira.contratos !== 1 ? "s" : ""}`}
            />
            <Kpi
              icone={Clock4}
              rotulo="Horas trabalhadas no mês"
              valor={`${carteira.horasMes.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}h`}
              apoio={mesAnterior ? `${mesAnterior.mes} fechou em ${mesAnterior.horas}h` : "nos clientes mensais"}
            />
            <Kpi
              icone={Gauge}
              rotulo="Crédito consumido"
              valor={`${carteira.consumoPct}%`}
              alerta={carteira.consumoPct >= 100}
              barra={carteira.consumoPct}
            />
          </div>
        )}

        {/* Pendências: o que muda o que você faz hoje */}
        {pendencias.length > 0 && (
          <div className="bg-card rounded-xl border border-border mb-4 overflow-hidden">
            <div className="px-4 py-2.5 border-b border-border">
              <p className="text-[13px] font-medium text-foreground">Precisa da sua atenção</p>
            </div>
            {pendencias.map((p, i) => (
              <button
                key={p.key}
                onClick={() => navigate(p.destino)}
                className={cn(
                  "w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-muted/40 transition-colors",
                  i < pendencias.length - 1 && "border-b border-border",
                )}
              >
                <span
                  className={cn(
                    "w-1.5 h-1.5 rounded-full shrink-0",
                    p.prioridade === "critico" ? "bg-destructive" : "bg-warning",
                  )}
                  aria-hidden
                />
                <span className="text-lg font-display font-semibold tabular-nums text-foreground w-10">
                  {p.contagem}
                </span>
                <span className="text-sm text-foreground flex-1">{p.texto}</span>
                <span className={cn(
                  "text-[11px] font-medium shrink-0",
                  p.prioridade === "critico" ? "text-destructive" : "text-warning-foreground",
                )}>
                  {p.prioridade === "critico" ? "Crítico" : "Atenção"}
                </span>
                <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
              </button>
            ))}
          </div>
        )}

        {/* Visão geral: uma série por vez, período ajustável */}
        <div className="bg-card rounded-xl border border-border mb-4">
          <div className="p-5 pb-0">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-display font-semibold text-foreground">Visão geral</h2>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {variacao ? (
                    <>
                      <span className={variacao.pct >= 0 ? "text-success-foreground" : "text-destructive"}>
                        {variacao.pct >= 0 ? "+" : ""}{variacao.pct}%
                      </span>{" "}
                      em {variacao.mes} contra o mês anterior
                      {mesCorrenteAberto && " · mês atual em andamento"}
                    </>
                  ) : (
                    "Evolução da operação ao longo do tempo."
                  )}
                </p>
              </div>

              <select
                value={periodo}
                onChange={(e) => setPeriodo(Number(e.target.value) as 3 | 6 | 0)}
                className="h-9 rounded-lg border border-border bg-card px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                aria-label="Período exibido"
              >
                <option value={3}>Últimos 3 meses</option>
                <option value={6}>Últimos 6 meses</option>
                <option value={0}>Todo o histórico</option>
              </select>
            </div>

            {/* Abas sublinhadas, uma série por vez */}
            <div className="flex gap-6 mt-4 border-b border-border -mx-5 px-5">
              {([
                { id: "valor", rotulo: "Valor consumido" },
                { id: "horas", rotulo: "Horas lançadas" },
                { id: "clientes", rotulo: "Clientes atendidos" },
              ] as const).map((aba) => (
                <button
                  key={aba.id}
                  onClick={() => setSerie(aba.id)}
                  className={cn(
                    "relative pb-2.5 text-sm transition-colors",
                    serie === aba.id
                      ? "text-foreground font-medium"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {aba.rotulo}
                  {serie === aba.id && (
                    <span className="absolute left-0 right-0 -bottom-px h-0.5 rounded-full bg-primary" />
                  )}
                </button>
              ))}
            </div>
          </div>

          <div className="p-5 pt-4">
            {historico.length < 2 ? (
              <p className="text-sm text-muted-foreground py-12 text-center">
                A curva aparece a partir de dois meses fechados.
              </p>
            ) : (
              <div style={{ height: 204 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={historico} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.18} />
                        <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis
                      dataKey="mes"
                      tickLine={false}
                      axisLine={false}
                      tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
                    />
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      width={56}
                      domain={[(min: number) => Math.floor(min * 0.85), (max: number) => Math.ceil(max * 1.05)]}
                      tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
                      tickFormatter={(v: number) =>
                        serie === "valor" ? `${Math.round(v / 1000)}k` : serie === "horas" ? `${v}h` : `${v}`}
                    />
                    <Tooltip
                      formatter={(v: number) =>
                        serie === "valor"
                          ? v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })
                          : serie === "horas" ? `${v}h` : `${v} clientes`}
                      labelFormatter={(l: string) => `Fechamento de ${l}`}
                      contentStyle={{
                        fontSize: 12, borderRadius: 8,
                        border: "1px solid hsl(var(--border))", background: "hsl(var(--card))",
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey={serie}
                      stroke="hsl(var(--primary))"
                      strokeWidth={2.5}
                      fill="url(#grad)"
                      dot={{ r: 3, fill: "hsl(var(--primary))", strokeWidth: 0 }}
                      activeDot={{ r: 5 }}
                      isAnimationActive={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </div>

        {/* Onde agir: os cinco mais próximos do limite do crédito */}
        {proximosDoLimite.length > 0 && (
          <div className="bg-card rounded-xl border border-border mb-4 overflow-hidden">
            <div className="px-4 py-2.5 border-b border-border flex items-center justify-between">
              <p className="text-[13px] font-medium text-foreground">Clientes próximos do limite</p>
              <button
                onClick={() => navigate("/recorrentes")}
                className="text-[12px] text-muted-foreground hover:text-foreground transition-colors"
              >
                Ver todos
              </button>
            </div>
            {proximosDoLimite.map((c, i) => (
              <button
                key={c.nome}
                onClick={() => navigate("/recorrentes")}
                className={cn(
                  "w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-muted/40 transition-colors",
                  i < proximosDoLimite.length - 1 && "border-b border-border",
                )}
              >
                <span className="text-sm text-foreground flex-1 truncate">{c.nome}</span>
                <span className="text-[12px] text-muted-foreground tabular-nums shrink-0 w-16 text-right">
                  {c.horas.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}h
                </span>
                <span className="w-24 h-1.5 rounded-full bg-muted overflow-hidden shrink-0">
                  <span
                    className={cn(
                      "block h-full rounded-full",
                      c.pct >= 100 ? "bg-destructive" : c.pct >= 80 ? "bg-warning" : "bg-primary",
                    )}
                    style={{ width: `${Math.min(c.pct, 100)}%` }}
                  />
                </span>
                <span className={cn(
                  "text-sm font-medium tabular-nums shrink-0 w-12 text-right",
                  c.pct >= 100 ? "text-destructive" : "text-foreground",
                )}>
                  {c.pct}%
                </span>
              </button>
            ))}
          </div>
        )}

        {/* Módulos */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
          <ModuleCard
            icon={Users}
            title="Clientes recorrentes"
            onClick={() => navigate("/recorrentes")}
            stats={[
              { value: recorrentes.contratos, label: "contratos ativos" },
              { value: recorrentes.emAlerta, label: "em alerta", danger: recorrentes.emAlerta > 0 },
            ]}
          />
          <ModuleCard
            icon={FunnelIcon}
            title="Funil de prospecção"
            onClick={() => navigate("/prospeccao")}
            stats={[
              { value: prospeccao.total, label: "no pipeline" },
              { value: prospeccao.semMotivo, label: "sem motivo", danger: prospeccao.semMotivo > 0 },
            ]}
          />
        </div>

        {/* Atividade recente */}
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
            <p className="text-sm font-medium text-foreground">Atividade recente</p>
          </div>
          {activities.length === 0 ? (
            <p className="text-sm text-muted-foreground p-4">Nada recente por aqui ainda.</p>
          ) : (
            activities.map((a, i) => (
              <div
                key={a.key}
                className={`flex items-center gap-3 px-4 py-3 ${i < activities.length - 1 ? "border-b border-border" : ""}`}
              >
                {a.icon === "success" ? (
                  <CircleCheck className="w-4 h-4 text-success-foreground shrink-0" />
                ) : a.icon === "warning" ? (
                  <AlertTriangle className="w-4 h-4 text-warning-foreground shrink-0" />
                ) : (
                  <Upload className="w-4 h-4 text-muted-foreground shrink-0" />
                )}
                <p className="text-sm text-foreground flex-1">{a.text}</p>
                <p className="text-xs text-muted-foreground shrink-0">{timeAgo(new Date(a.timestamp))}</p>
              </div>
            ))
          )}
        </div>
      </>

      {chatOpen && (
        <div className="fixed bottom-24 right-6 w-80 sm:w-96 bg-card border border-border rounded-xl shadow-lg flex flex-col z-20" style={{ height: 420 }}>
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <p className="text-sm font-medium text-foreground">Assistente do painel</p>
            <button onClick={() => setChatOpen(false)} aria-label="Fechar">
              <X className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            {messages.map((m, i) => (
              <div key={i} className={`text-sm whitespace-pre-line ${m.role === "user" ? "text-right" : "text-left"}`}>
                <span
                  className={`inline-block px-3 py-2 rounded-lg max-w-[85%] ${
                    m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"
                  }`}
                >
                  {m.text}
                </span>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
          <form onSubmit={handleAsk} className="flex items-center gap-2 p-3 border-t border-border">
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder="Pergunte sobre os dados..."
              className="flex-1 h-9 px-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            <button type="submit" aria-label="Enviar" className="w-9 h-9 rounded-lg bg-[#FB7435] hover:bg-[#e2632b] flex items-center justify-center shrink-0">
              <Send className="w-4 h-4 text-white" />
            </button>
          </form>
        </div>
      )}

      <button
        onClick={() => setChatOpen((v) => !v)}
        className="fixed bottom-6 right-6 w-12 h-12 rounded-full bg-[#FB7435] hover:bg-[#e2632b] flex items-center justify-center shadow-lg transition-colors z-20"
        aria-label="Assistente do painel"
      >
        {chatOpen ? <X className="w-5 h-5 text-white" /> : <MessageCircle className="w-5 h-5 text-white" />}
      </button>
    </AppShell>
  );
}

function ModuleCard({
  icon: Icon,
  title,
  stats,
  onClick,
}: {
  icon: any;
  title: string;
  stats: { value: string | number; label: string; danger?: boolean }[];
  onClick: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className="bg-card rounded-xl border border-border p-4 shadow-sm cursor-pointer hover:border-border-strong transition-colors"
    >
      <div className="flex items-center gap-2 mb-3">
        <Icon className="w-[18px] h-[18px] text-primary" />
        <p className="text-sm font-medium text-foreground">{title}</p>
      </div>
      <div className="flex gap-6">
        {stats.map((s) => (
          <div key={s.label}>
            <p className={`text-xl font-bold ${s.danger ? "text-destructive" : "text-foreground"}`}>{s.value}</p>
            <p className="text-xs text-muted-foreground">{s.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
