import { useMemo, useState } from "react";
import { RefreshCw, TrendingUp, TrendingDown, HelpCircle, Clock, FolderKanban } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { useProspeccaoData } from "@/hooks/use-prospeccao-data";

const DESFECHO_LABEL: Record<string, string> = {
  ganho: "Ganho",
  perdido: "Perdido",
  generico: "Motivo genérico",
  vazio: "Sem motivo",
};

const DESFECHO_COLOR: Record<string, string> = {
  ganho: "hsl(var(--success, 142 71% 45%))",
  perdido: "hsl(var(--destructive))",
  generico: "#eda100",
  vazio: "hsl(var(--muted-foreground))",
};

export default function ProspeccaoDashboard() {
  const { data, isLoading, error, reload } = useProspeccaoData();
  const [ownerFilter, setOwnerFilter] = useState<string | null>(null);

  const desfechoChartData = useMemo(() => {
    if (!data) return [];
    const { ganho, perdido, generico, vazio } = data.resumo;
    return [
      { key: "ganho", label: "Ganho", value: ganho },
      { key: "perdido", label: "Perdido", value: perdido },
      { key: "generico", label: "Motivo genérico", value: generico },
      { key: "vazio", label: "Sem motivo", value: vazio },
    ];
  }, [data]);

  const responsavelChartData = useMemo(() => {
    if (!data) return [];
    return Object.entries(data.porResponsavel)
      .map(([owner, v]) => ({ owner, semMotivo: v.semMotivo, concluidos: v.concluidos }))
      .sort((a, b) => b.semMotivo - a.semMotivo);
  }, [data]);

  const pendentesFiltrados = useMemo(() => {
    if (!data) return [];
    if (!ownerFilter) return data.pendentes;
    return data.pendentes.filter((p) => (p.owner ?? "Sem responsável") === ownerFilter);
  }, [data, ownerFilter]);

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader activeTab={"prospeccao" as never} />

      <div className="container py-6">
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-display font-semibold text-foreground">
                Funil de prospecção
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Dados ao vivo do portfólio WSA - PROSPECÇÃO no Asana
                {data && (
                  <span className="ml-2 text-muted-foreground/60">
                    · atualizado {new Date(data.generatedAt).toLocaleTimeString("pt-BR")}
                  </span>
                )}
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={reload} className="gap-2">
              <RefreshCw className="w-4 h-4" />
              Atualizar
            </Button>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
          ) : error ? (
            <div className="p-4 bg-destructive/10 border border-destructive/30 rounded-lg">
              <p className="text-sm text-destructive">Erro: {error}</p>
            </div>
          ) : !data ? null : (
            <>
              {/* Stat cards */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <StatCard icon={FolderKanban} label="Total no portfólio" value={String(data.resumo.total)} />
                <StatCard icon={TrendingUp} label="Em dia" value={String(data.resumo.emDia)} />
                <StatCard icon={Clock} label="Em espera" value={String(data.resumo.emEspera)} />
                <StatCard
                  icon={HelpCircle}
                  label="Concluídos sem motivo"
                  value={`${data.resumo.taxaSemMotivo}%`}
                  valueClass={data.resumo.taxaSemMotivo > 50 ? "text-destructive" : ""}
                  hint={`${data.resumo.vazio + data.resumo.generico} de ${data.resumo.concluidos} concluídos`}
                />
              </div>

              {/* Desfecho chart */}
              <section className="bg-card rounded-xl border border-border p-6 shadow-sm">
                <h3 className="text-base font-display font-semibold text-foreground mb-1">
                  Desfecho dos concluídos
                </h3>
                <p className="text-xs text-muted-foreground mb-4">
                  {data.resumo.concluidos} projetos marcados como concluídos no total
                </p>
                <div className="h-[220px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={desfechoChartData} layout="vertical" margin={{ left: 24 }}>
                      <CartesianGrid horizontal={false} stroke="hsl(var(--border))" />
                      <XAxis type="number" allowDecimals={false} />
                      <YAxis type="category" dataKey="label" width={110} />
                      <Tooltip />
                      <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                        {desfechoChartData.map((d) => (
                          <Cell key={d.key} fill={DESFECHO_COLOR[d.key]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </section>

              {/* Por responsável */}
              <section className="bg-card rounded-xl border border-border p-6 shadow-sm">
                <h3 className="text-base font-display font-semibold text-foreground mb-1">
                  Quem não preenche o motivo de fechamento
                </h3>
                <p className="text-xs text-muted-foreground mb-4">
                  Concluídos sem "resumo" preenchido, por responsável — clique numa barra pra filtrar a lista abaixo
                </p>
                <div className="h-[180px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={responsavelChartData} layout="vertical" margin={{ left: 24 }}>
                      <CartesianGrid horizontal={false} stroke="hsl(var(--border))" />
                      <XAxis type="number" allowDecimals={false} />
                      <YAxis type="category" dataKey="owner" width={110} />
                      <Tooltip />
                      <Bar
                        dataKey="semMotivo"
                        radius={[0, 4, 4, 0]}
                        fill="hsl(var(--destructive))"
                        cursor="pointer"
                        onClick={(entry: { owner: string }) =>
                          setOwnerFilter((cur) => (cur === entry.owner ? null : entry.owner))
                        }
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </section>

              {/* Lista nomeada de pendentes */}
              <section className="bg-card rounded-xl border border-border p-6 shadow-sm">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-base font-display font-semibold text-foreground">
                    Projetos pendentes de preenchimento
                  </h3>
                  {ownerFilter && (
                    <Button variant="ghost" size="sm" onClick={() => setOwnerFilter(null)}>
                      Limpar filtro ({ownerFilter})
                    </Button>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mb-4">
                  {pendentesFiltrados.length} projeto(s) concluído(s) sem motivo claro de ganho ou perda
                </p>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Projeto</TableHead>
                      <TableHead>Responsável</TableHead>
                      <TableHead>Situação</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pendentesFiltrados.map((p) => (
                      <TableRow key={p.gid}>
                        <TableCell>
                          <a
                            href={`https://app.asana.com/0/0/${p.gid}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:underline"
                          >
                            {p.name}
                          </a>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {p.owner ?? "Sem responsável"}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">
                            {p.desfecho === "generico" ? "Motivo genérico" : "Sem motivo"}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </section>
            </>
          )}
        </div>
      </div>

      <footer className="border-t border-border bg-card/50 py-6 mt-6">
        <div className="container text-center text-sm text-muted-foreground">
          <a
            href="https://wolffescripes.com.br"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-foreground transition-colors"
          >
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
  label,
  value,
  hint,
  valueClass,
}: {
  icon: any;
  label: string;
  value: string;
  hint?: string;
  valueClass?: string;
}) {
  return (
    <div className="bg-card rounded-xl border border-border p-4 shadow-sm">
      <div className="flex items-center gap-2 mb-2">
        <div className="p-1.5 rounded-md bg-primary/10">
          <Icon className="w-3.5 h-3.5 text-primary" />
        </div>
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
      <p className={`text-lg font-bold text-foreground ${valueClass || ""}`.trim()}>{value}</p>
      {hint && <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>}
    </div>
  );
}
