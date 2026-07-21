import { useMemo, useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Search, Users, Clock4, Calculator, Filter as FunnelIcon, MessageCircle,
  CircleCheck, AlertTriangle, Upload, X, Send,
} from "lucide-react";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { useAuth } from "@/contexts/AuthContext";
import { useAtosData } from "@/hooks/use-atos-data";
import { useHoursData } from "@/hooks/use-hours-data";
import { useProspeccaoData } from "@/hooks/use-prospeccao-data";
import { calcularProjeto } from "@/lib/atos-parser";
import { DashboardData } from "@/lib/data-parser";
import { responderPergunta } from "@/lib/assistant-rules";

interface SistemaHomeProps {
  dashboardData: DashboardData | null;
  lastUpdated: Date | null;
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
  const [query, setQuery] = useState("");
  const [chatOpen, setChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [messages, setMessages] = useState<{ role: "user" | "assistant"; text: string }[]>([
    { role: "assistant", text: "Oi! Pergunte sobre contratos, horas, atos ou prospecção. Digite \"ajuda\" pra ver exemplos." },
  ]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { projetos: atosProjetos } = useAtosData();
  const now = new Date();
  const { dashboardData: horasDashboardData } = useHoursData(now.getMonth(), now.getFullYear());
  const horasEntries = horasDashboardData?.entries ?? [];
  const horasFillRate = horasDashboardData?.fillRate ?? 0;
  const { data: prospeccaoData } = useProspeccaoData();

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

  const atos = useMemo(() => {
    const total = atosProjetos.length;
    const emDeficit = atosProjetos.filter((p) => calcularProjeto(p.projeto, p.lancamentos).resultado < 0);
    return { total, deficit: emDeficit.length, projetosDeficit: emDeficit.map((p) => p.projeto.nome_projeto) };
  }, [atosProjetos]);

  const horas = useMemo(() => {
    const datas = horasEntries.map((e) => e.completed_date).filter(Boolean) as string[];
    const ultimaData = datas.sort().at(-1) ?? null;
    const horasUltimoDia = ultimaData
      ? horasEntries.filter((e) => e.completed_date === ultimaData).reduce((s, e) => s + e.hours_logged, 0)
      : 0;
    return { fillRate: Math.round(horasFillRate || 0), ultimaData, horasUltimoDia: Math.round(horasUltimoDia * 10) / 10 };
  }, [horasEntries, horasFillRate]);

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

    const lastAtosUpdate = atosProjetos
      .map((p) => new Date(p.projeto.updated_at).getTime())
      .sort((a, b) => b - a)[0];
    if (lastAtosUpdate) {
      items.push({
        key: "atos",
        icon: "neutral",
        text: "Calculadora de atos teve projetos atualizados",
        timestamp: lastAtosUpdate,
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
  }, [lastUpdated, horas, horasEntries, atosProjetos, prospeccaoData]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const q = query.trim().toLowerCase();
    if (!q) return;
    if (q.includes("hora")) navigate("/horas");
    else if (q.includes("ato")) navigate("/atos");
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
      atos,
      horas,
      prospeccao: { total: prospeccao.total, semMotivo: prospeccao.semMotivo, porResponsavel: prospeccaoData?.porResponsavel ?? {} },
    });
    setMessages((m) => [...m, { role: "user", text: pergunta }, { role: "assistant", text: resposta }]);
    setChatInput("");
  };

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader activeTab={"recorrentes" as never} hideModuleSelector />

      <div className="container py-6">
        <div className="mb-5">
          <h1 className="text-xl font-display font-semibold text-foreground">
            {greetingWord}{greetingName ? `, ${greetingName}` : ""}
          </h1>
        </div>

        <form onSubmit={handleSearch} className="relative mb-6">
          <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar um módulo (ex: horas, atos, prospecção)"
            className="w-full pl-9 pr-3 h-10 rounded-lg border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </form>

        <p className="text-xs text-muted-foreground mb-2">Módulos</p>
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
            icon={Clock4}
            title="Lançamento de horas"
            onClick={() => navigate("/horas")}
            stats={[
              { value: `${horas.horasUltimoDia}h`, label: "último dia lançado" },
              { value: `${horas.fillRate}%`, label: "dias úteis preenchidos" },
            ]}
          />
          <ModuleCard
            icon={Calculator}
            title="Calculadora de atos"
            onClick={() => navigate("/atos")}
            stats={[
              { value: atos.total, label: "projetos importados" },
              { value: atos.deficit, label: "em déficit", danger: atos.deficit > 0 },
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

        <p className="text-xs text-muted-foreground mb-2">Atividade recente</p>
        <div className="bg-card rounded-xl border border-border">
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
      </div>

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
    </div>
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
