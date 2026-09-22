import { useMemo, useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Search, Users, Clock4, Filter as FunnelIcon, MessageCircle,
  CircleCheck, AlertTriangle, Upload, X, Send, ChevronRight,
} from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { AppShell } from "@/components/layout/AppShell";
import { useAuth } from "@/contexts/AuthContext";
import { useHoursData } from "@/hooks/use-hours-data";
import { useProspeccaoData } from "@/hooks/use-prospeccao-data";
import { useMonthlySnapshots } from "@/hooks/use-monthly-snapshots";
import { DashboardData } from "@/lib/data-parser";
import { responderPergunta } from "@/lib/assistant-rules";

interface SistemaHomeProps {
  dashboardData: DashboardData | null;
  lastUpdated: Date | null;
}

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

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
  const [query, setQuery] = useState("");
  const [chatOpen, setChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [messages, setMessages] = useState<{ role: "user" | "assistant"; text: string }[]>([
    { role: "assistant", text: "Oi! Pergunte sobre contratos, horas ou prospecção. Digite \"ajuda\" pra ver exemplos." },
  ]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const now = new Date();
  const { dashboardData: horasDashboardData } = useHoursData(now.getMonth(), now.getFullYear());
  const horasEntries = horasDashboardData?.entries ?? [];
  const horasFillRate = horasDashboardData?.fillRate ?? 0;
  const { data: prospeccaoData } = useProspeccaoData();
  const { snapshots } = useMonthlySnapshots();
  const [serie, setSerie] = useState<"horas" | "valor">("valor");

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

  const horas = useMemo(() => {
    const datas = horasEntries.map((e) => e.completed_date).filter(Boolean) as string[];
    const ultimaData = datas.sort().at(-1) ?? null;
    const horasUltimoDia = ultimaData
      ? horasEntries.filter((e) => e.completed_date === ultimaData).reduce((s, e) => s + e.hours_logged, 0)
      : 0;
    return { fillRate: Math.round(horasFillRate || 0), ultimaData, horasUltimoDia: Math.round(horasUltimoDia * 10) / 10 };
  }, [horasEntries, horasFillRate]);

  const historico = useMemo(() => {
    return [...snapshots]
      .sort((a, b) => (a.year - b.year) || (a.month - b.month))
      .slice(-6)
      .map((s) => ({
        mes: `${MESES[s.month - 1]}/${String(s.year).slice(2)}`,
        horas: Math.round(s.total_horas),
        valor: Math.round(s.total_valor),
      }));
  }, [snapshots]);

  const variacao = useMemo(() => {
    if (historico.length < 2) return null;
    const campo = serie === "horas" ? "horas" : "valor";
    const atual = historico.at(-1)![campo];
    const anterior = historico.at(-2)![campo];
    if (!anterior) return null;
    return Math.round(((atual - anterior) / anterior) * 1000) / 10;
  }, [historico, serie]);

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

    if (horas.ultimaData) {
      const porMembro = new Map<string, number>();
      horasEntries.filter((e) => e.completed_date === horas.ultimaData).forEach((e) => {
        porMembro.set(e.assignee, (porMembro.get(e.assignee) ?? 0) + e.hours_logged);
      });
      const top = [...porMembro.entries()].sort((a, b) => b[1] - a[1])[0];
      if (top) {
        items.push({
          key: "horas",
          icon: "neutral",
          text: `${top[0]} lançou ${Math.round(top[1] * 10) / 10}h em ${new Date(horas.ultimaData + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}`,
          timestamp: new Date(horas.ultimaData).getTime(),
        });
      }
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
  }, [lastUpdated, horas, horasEntries, prospeccaoData]);

  // Pendências: só entra o que exige ação e leva a algum lugar.
  const pendencias = useMemo(() => {
    const itens: { key: string; texto: string; contagem: number; grave: boolean; destino: string }[] = [];
    if (recorrentes.emAlerta > 0) {
      itens.push({
        key: "alerta",
        texto: `cliente${recorrentes.emAlerta !== 1 ? "s" : ""} com contrato em alerta`,
        contagem: recorrentes.emAlerta,
        grave: true,
        destino: "/recorrentes",
      });
    }
    if (horas.fillRate < 100) {
      itens.push({
        key: "horas",
        texto: `dos dias úteis do mês sem lançamento completo`,
        contagem: 100 - horas.fillRate,
        grave: horas.fillRate < 50,
        destino: "/horas",
      });
    }
    if (prospeccao.semMotivo > 0) {
      itens.push({
        key: "prospeccao",
        texto: `oportunidade${prospeccao.semMotivo !== 1 ? "s" : ""} sem motivo registrado`,
        contagem: prospeccao.semMotivo,
        grave: false,
        destino: "/prospeccao",
      });
    }
    return itens;
  }, [recorrentes.emAlerta, horas.fillRate, prospeccao.semMotivo]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const q = query.trim().toLowerCase();
    if (!q) return;
    if (q.includes("hora")) navigate("/horas");
    else if (q.includes("prospec") || q.includes("funil")) navigate("/prospeccao");
    else navigate("/recorrentes");
  };

  useEffect(() => {
    if (chatOpen) messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, chatOpen]);

  const handleAsk = (e: React.FormEvent) => {
    e.preventDefault();
    const pergunta = chatInput.trim();
    if (!pergunta) return;
    const resposta = responderPergunta(pergunta, {
      recorrentes,
      horas,
      prospeccao: { total: prospeccao.total, semMotivo: prospeccao.semMotivo, porResponsavel: prospeccaoData?.porResponsavel ?? {} },
    });
    setMessages((m) => [...m, { role: "user", text: pergunta }, { role: "assistant", text: resposta }]);
    setChatInput("");
  };

  return (
    <AppShell>
      <>
        {/* Cabeçalho: saudação + o dado que responde "está atualizado?" */}
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-display font-semibold text-foreground">
              {greetingWord}{greetingName ? `, ${greetingName}` : ""}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {lastUpdated
                ? `Dados de clientes recorrentes atualizados ${timeAgo(lastUpdated).toLowerCase()}.`
                : "Nenhuma importação de clientes recorrentes ainda."}
            </p>
          </div>
          <form onSubmit={handleSearch} className="relative w-full sm:w-72">
            <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ir para um módulo"
              className="w-full pl-9 pr-3 h-9 rounded-lg border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </form>
        </div>

        {/* Pendências primeiro: é o que muda o que você faz hoje */}
        {pendencias.length > 0 && (
          <div className="bg-card rounded-xl border border-border mb-6 overflow-hidden">
            <div className="px-4 py-3 border-b border-border">
              <p className="text-sm font-medium text-foreground">Precisa da sua atenção</p>
            </div>
            {pendencias.map((p, i) => (
              <button
                key={p.key}
                onClick={() => navigate(p.destino)}
                className={`w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/40 transition-colors ${
                  i < pendencias.length - 1 ? "border-b border-border" : ""
                }`}
              >
                <span className={`text-lg font-semibold tabular-nums ${p.grave ? "text-destructive" : "text-foreground"}`}>
                  {p.key === "horas" ? `${p.contagem}%` : p.contagem}
                </span>
                <span className="text-sm text-foreground flex-1">{p.texto}</span>
                <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
              </button>
            ))}
          </div>
        )}

        {/* Evolução: o histórico que já existe nos fechamentos mensais */}
        <div className="bg-card rounded-xl border border-border p-5 mb-6">
          <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
            <div>
              <p className="text-sm font-medium text-foreground">Evolução mensal</p>
              {variacao !== null && (
                <p className="text-sm text-muted-foreground mt-0.5">
                  <span className={variacao >= 0 ? "text-success-foreground" : "text-destructive"}>
                    {variacao >= 0 ? "+" : ""}{variacao}%
                  </span>{" "}
                  em relação ao mês anterior
                </p>
              )}
            </div>
            <div className="flex rounded-lg border border-border overflow-hidden">
              {(["valor", "horas"] as const).map((k) => (
                <button
                  key={k}
                  onClick={() => setSerie(k)}
                  className={`px-3 h-8 text-xs transition-colors ${
                    serie === k ? "bg-muted text-foreground font-medium" : "text-muted-foreground hover:bg-muted/50"
                  }`}
                >
                  {k === "valor" ? "Valor consumido" : "Horas"}
                </button>
              ))}
            </div>
          </div>

          {historico.length < 2 ? (
            <p className="text-sm text-muted-foreground py-10 text-center">
              A curva aparece a partir de dois meses fechados.
            </p>
          ) : (
            <div style={{ height: 220 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={historico} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#FB7435" stopOpacity={0.25} />
                      <stop offset="100%" stopColor="#FB7435" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="mes" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    width={54}
                    tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
                    tickFormatter={(v: number) => serie === "valor" ? `${Math.round(v / 1000)}k` : `${v}h`}
                  />
                  <Tooltip
                    formatter={(v: number) => serie === "valor"
                      ? v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })
                      : `${v}h`}
                    labelFormatter={(l: string) => `Fechamento de ${l}`}
                    contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid hsl(var(--border))", background: "hsl(var(--card))" }}
                  />
                  <Area type="monotone" dataKey={serie} stroke="#FB7435" strokeWidth={2} fill="url(#grad)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Módulos */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
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
            icon={Clock4}
            title="Lançamento de horas"
            onClick={() => navigate("/horas")}
            stats={[
              { value: `${horas.horasUltimoDia}h`, label: "último dia lançado" },
              { value: `${horas.fillRate}%`, label: "dias úteis preenchidos" },
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
