import { useMemo, useState } from "react";
import {
  RefreshCw, FileCheck2, Clock, AlertTriangle, CalendarClock, Hourglass, Target,
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
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Legend, LabelList,
} from "recharts";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { useRegistrosData, type Registro } from "@/hooks/use-registros-data";

// Baseline fixado no diagnóstico da Fundação de IA (registros iniciados de mai a out/2026)
const BASELINE_INICIO = "2026-05-01";
const BASELINE_FIM = "2026-11-01";
const META_REDUCAO = 0.3;

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

function mediana(valores: number[]): number | null {
  if (!valores.length) return null;
  const v = [...valores].sort((a, b) => a - b);
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

function fmtHoras(min: number | null): string {
  if (min === null) return "-";
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, "0")}`;
}

function mesDe(iso: string): string {
  return iso.slice(0, 7);
}

function rotuloMes(ym: string): string {
  const [y, m] = ym.split("-");
  return `${MESES[Number(m) - 1]}/${y.slice(2)}`;
}

function concluidosComHora(regs: Registro[]): Registro[] {
  return regs.filter((r) => !r.aberto && r.minutos > 0);
}

export default function RegistrosDashboard() {
  const { data, isLoading, error, reload } = useRegistrosData();
  const [periodo, setPeriodo] = useState<string>("6");
  const [documento, setDocumento] = useState<string>("todos");

  const documentos = useMemo(() => {
    if (!data) return [];
    const tipos = new Set(data.registros.map((r) => (r.documento.includes("ACS") ? "ACS" : r.documento)));
    return [...tipos].sort();
  }, [data]);

  const filtraDocumento = (r: Registro) =>
    documento === "todos" || (documento === "ACS" ? r.documento.includes("ACS") : r.documento === documento);

  const noPeriodo = useMemo(() => {
    if (!data) return [];
    const corte = new Date();
    corte.setMonth(corte.getMonth() - Number(periodo));
    return data.registros.filter((r) => new Date(r.inicio) >= corte && filtraDocumento(r));
  }, [data, periodo, documento]);

  const baseline = useMemo(() => {
    if (!data) return null;
    const base = data.registros.filter(
      (r) => r.inicio >= BASELINE_INICIO && r.inicio < BASELINE_FIM && filtraDocumento(r),
    );
    return mediana(concluidosComHora(base).map((r) => r.minutos));
  }, [data, documento]);
  const meta = baseline !== null ? baseline * (1 - META_REDUCAO) : null;

  const ind = useMemo(() => {
    const concluidos = noPeriodo.filter((r) => !r.aberto);
    const comHora = concluidosComHora(noPeriodo);
    const minutosTotais = noPeriodo.reduce((s, r) => s + r.minutos, 0);
    const comExigencia = concluidos.filter((r) => r.exigencias > 0).length;
    const tarefas = noPeriodo.reduce((s, r) => s + r.tarefas, 0);
    const semHora = noPeriodo.reduce((s, r) => s + r.tarefasSemHora, 0);
    return {
      total: noPeriodo.length,
      concluidos: concluidos.length,
      abertos: noPeriodo.length - concluidos.length,
      minutosTotais,
      minutosPorMes: minutosTotais / Number(periodo),
      medianaMin: mediana(comHora.map((r) => r.minutos)),
      medianaDias: mediana(concluidos.map((r) => r.diasCiclo)),
      pctExigencia: concluidos.length ? Math.round((comExigencia / concluidos.length) * 100) : 0,
      exigencias: noPeriodo.reduce((s, r) => s + r.exigencias, 0),
      maisDeUmProtocolo: noPeriodo.filter((r) => r.protocolos > 1).length,
      pctSemHora: tarefas ? Math.round((semHora / tarefas) * 100) : 0,
    };
  }, [noPeriodo, periodo]);

  const porMes = useMemo(() => {
    const mapa = new Map<string, { mes: string; horas: number; comExigencia: number; semExigencia: number; medianaMin: number[] }>();
    for (const r of noPeriodo) {
      const k = mesDe(r.inicio);
      if (!mapa.has(k)) mapa.set(k, { mes: k, horas: 0, comExigencia: 0, semExigencia: 0, medianaMin: [] });
      const m = mapa.get(k)!;
      m.horas += r.minutos / 60;
      if (r.exigencias > 0) m.comExigencia += 1;
      else m.semExigencia += 1;
      if (!r.aberto && r.minutos > 0) m.medianaMin.push(r.minutos);
    }
    return [...mapa.values()]
      .sort((a, b) => a.mes.localeCompare(b.mes))
      .map((m) => ({
        mes: rotuloMes(m.mes),
        horas: Math.round(m.horas * 10) / 10,
        comExigencia: m.comExigencia,
        semExigencia: m.semExigencia,
        medianaHoras: m.medianaMin.length ? Math.round(((mediana(m.medianaMin) ?? 0) / 60) * 10) / 10 : null,
      }));
  }, [noPeriodo]);

  const porResponsavel = useMemo(() => {
    const mapa: Record<string, { minutos: number; registros: number }> = {};
    for (const r of noPeriodo) {
      for (const [nome, min] of Object.entries(r.minutosPorResponsavel)) {
        if (!mapa[nome]) mapa[nome] = { minutos: 0, registros: 0 };
        mapa[nome].minutos += min;
        mapa[nome].registros += 1;
      }
    }
    return Object.entries(mapa)
      .map(([nome, v]) => ({ nome, ...v }))
      .filter((r) => r.minutos > 0)
      .sort((a, b) => b.minutos - a.minutos);
  }, [noPeriodo]);

  const filaAberta = useMemo(() => {
    if (!data) return [];
    return data.registros
      .filter((r) => r.aberto && filtraDocumento(r))
      .sort((a, b) => b.diasCiclo - a.diasCiclo);
  }, [data, documento]);

  const maisCustosos = useMemo(
    () => [...noPeriodo].sort((a, b) => b.minutos - a.minutos).slice(0, 10),
    [noPeriodo],
  );

  const metaAtingida = meta !== null && ind.medianaMin !== null && ind.medianaMin <= meta;

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader activeTab="registros" />

      <div className="container py-5">
        <div className="space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-xl font-display font-semibold text-foreground">Registros na Junta</h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                Tempo, exigências e fila dos registros de atos societários
              </p>
              {data && (
                <p className="text-xs text-muted-foreground/70 mt-1">
                  Atualizado hoje às {new Date(data.generatedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                  {" · "}Fonte: Asana{" · "}{data.tarefasLidas} tarefas de registro lidas
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
              <p className="text-xs text-muted-foreground ml-3">Buscando as tarefas de registro no Asana, mês a mês. Pode levar até um minuto...</p>
            </div>
          ) : error ? (
            <div className="p-4 bg-destructive/10 border border-destructive/30 rounded-lg">
              <p className="text-sm text-destructive">Erro: {error}</p>
            </div>
          ) : !data ? null : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <Select value={periodo} onValueChange={setPeriodo}>
                  <SelectTrigger className="w-[170px] h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="3">Últimos 3 meses</SelectItem>
                    <SelectItem value="6">Últimos 6 meses</SelectItem>
                    <SelectItem value="12">Últimos 12 meses</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={documento} onValueChange={setDocumento}>
                  <SelectTrigger className="w-[190px] h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos os documentos</SelectItem>
                    {documentos.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
                <StatCard icon={FileCheck2} tone="neutral" label="Registros no período"
                  value={String(ind.total)} hint={`${ind.concluidos} concluídos · ${ind.abertos} em aberto`} />
                <StatCard icon={Clock} tone="neutral" label="Horas de registro"
                  value={fmtHoras(ind.minutosTotais)} hint={`cerca de ${fmtHoras(ind.minutosPorMes)} por mês`} />
                <StatCard icon={Target} tone={metaAtingida ? "success" : "warning"} label="Horas por registro (mediana)"
                  value={fmtHoras(ind.medianaMin)}
                  hint={meta !== null ? `meta ${fmtHoras(meta)} · base ${fmtHoras(baseline)}` : undefined} />
                <StatCard icon={AlertTriangle} tone={ind.pctExigencia > 30 ? "danger" : "warning"} label="Com exigência"
                  value={`${ind.pctExigencia}%`} hint={`${ind.exigencias} tarefas de exigência · ${ind.maisDeUmProtocolo} com mais de 1 protocolo`} />
                <StatCard icon={CalendarClock} tone="neutral" label="Dias até concluir (mediana)"
                  value={ind.medianaDias !== null ? `${ind.medianaDias}` : "-"} hint="da 1ª tarefa de registro à última concluída" />
                <StatCard icon={Hourglass} tone={filaAberta.length > 0 ? "warning" : "success"} label="Em aberto agora"
                  value={String(filaAberta.length)} hint={`${filaAberta.filter((r) => r.diasCiclo > 30).length} há mais de 30 dias`} />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                <section className="bg-card rounded-xl border border-border p-4 shadow-sm">
                  <h3 className="text-sm font-display font-semibold text-foreground mb-1">Horas de registro por mês</h3>
                  <p className="text-xs text-muted-foreground mb-3">Pelo mês em que o registro começou</p>
                  <div className="h-[220px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={porMes} margin={{ left: -10, right: 10, top: 16 }}>
                        <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
                        <XAxis dataKey="mes" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
                        <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11 }} unit="h" />
                        <Tooltip formatter={(v: number) => [`${v}h`, "Horas"]} />
                        <Bar dataKey="horas" fill="#FB7435" radius={[4, 4, 0, 0]} maxBarSize={36}>
                          <LabelList dataKey="horas" position="top" style={{ fontSize: 11, fill: "hsl(var(--foreground))" }} />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </section>

                <section className="bg-card rounded-xl border border-border p-4 shadow-sm">
                  <h3 className="text-sm font-display font-semibold text-foreground mb-1">Registros com e sem exigência</h3>
                  <p className="text-xs text-muted-foreground mb-3">Quantos registros precisaram responder exigência da junta</p>
                  <div className="h-[220px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={porMes} margin={{ left: -10, right: 10, top: 16 }}>
                        <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
                        <XAxis dataKey="mes" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
                        <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
                        <Tooltip />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        <Bar dataKey="semExigencia" name="Sem exigência" stackId="a" fill="hsl(var(--muted-foreground))" maxBarSize={36} />
                        <Bar dataKey="comExigencia" name="Com exigência" stackId="a" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} maxBarSize={36} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </section>
              </div>

              <section className="bg-card rounded-xl border border-border p-4 shadow-sm">
                <h3 className="text-sm font-display font-semibold text-foreground mb-1">Horas por registro concluído, mês a mês</h3>
                <p className="text-xs text-muted-foreground mb-3">
                  Mediana por mês contra a meta do projeto Fundação de IA ({Math.round(META_REDUCAO * 100)}% abaixo da base de mai a out/2026)
                </p>
                <div className="h-[200px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={porMes} margin={{ left: -10, right: 10, top: 16 }}>
                      <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
                      <XAxis dataKey="mes" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
                      <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11 }} unit="h" />
                      <Tooltip formatter={(v: number) => [`${v}h`, "Mediana"]} />
                      {meta !== null && (
                        <ReferenceLine y={Math.round((meta / 60) * 10) / 10} stroke="hsl(var(--success))" strokeDasharray="4 4"
                          label={{ value: `meta ${fmtHoras(meta)}`, position: "insideTopRight", fontSize: 11 }} />
                      )}
                      <Bar dataKey="medianaHoras" fill="#2E6DB4" radius={[4, 4, 0, 0]} maxBarSize={36}>
                        <LabelList dataKey="medianaHoras" position="top" style={{ fontSize: 11, fill: "hsl(var(--foreground))" }} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </section>

              <section className="bg-card rounded-xl border border-border p-4 shadow-sm">
                <h3 className="text-sm font-display font-semibold text-foreground mb-1">Fila de registros em aberto</h3>
                <p className="text-xs text-muted-foreground mb-3">Do mais antigo para o mais recente</p>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Projeto</TableHead>
                      <TableHead>Documento</TableHead>
                      <TableHead>Responsáveis</TableHead>
                      <TableHead className="text-right">Dias</TableHead>
                      <TableHead className="text-right">Horas até agora</TableHead>
                      <TableHead className="text-right">Exigências</TableHead>
                      <TableHead>Próxima tarefa</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filaAberta.map((r) => (
                      <TableRow key={r.key}>
                        <TableCell>
                          <a href={`https://app.asana.com/0/${r.projectGid}`} target="_blank" rel="noopener noreferrer" className="hover:underline">
                            {r.projectName}
                          </a>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{r.documento}</TableCell>
                        <TableCell className="text-muted-foreground text-xs">{r.responsaveis.join(", ") || "Sem responsável"}</TableCell>
                        <TableCell className="text-right">
                          <Badge variant="outline" className={r.diasCiclo > 30 ? "bg-destructive/10 text-destructive border-destructive/20" : ""}>
                            {r.diasCiclo}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">{fmtHoras(r.minutos)}</TableCell>
                        <TableCell className="text-right">{r.exigencias}</TableCell>
                        <TableCell className="text-xs">
                          {r.tarefasAbertas[0] && (
                            <a href={`https://app.asana.com/0/0/${r.tarefasAbertas[0].gid}`} target="_blank" rel="noopener noreferrer" className="hover:underline">
                              {r.tarefasAbertas[0].name}
                            </a>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </section>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                <section className="bg-card rounded-xl border border-border p-4 shadow-sm lg:col-span-2">
                  <h3 className="text-sm font-display font-semibold text-foreground mb-1">Registros que mais consumiram horas</h3>
                  <p className="text-xs text-muted-foreground mb-3">Os 10 maiores do período: bons casos para alimentar o checklist de pré-protocolo</p>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Projeto</TableHead>
                        <TableHead>Documento</TableHead>
                        <TableHead className="text-right">Horas</TableHead>
                        <TableHead className="text-right">Exigências</TableHead>
                        <TableHead className="text-right">Protocolos</TableHead>
                        <TableHead className="text-right">Dias</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {maisCustosos.map((r) => (
                        <TableRow key={r.key}>
                          <TableCell>
                            <a href={`https://app.asana.com/0/${r.projectGid}`} target="_blank" rel="noopener noreferrer" className="hover:underline">
                              {r.projectName}
                            </a>
                          </TableCell>
                          <TableCell className="text-muted-foreground">{r.documento}</TableCell>
                          <TableCell className="text-right font-medium">{fmtHoras(r.minutos)}</TableCell>
                          <TableCell className="text-right">{r.exigencias}</TableCell>
                          <TableCell className="text-right">{r.protocolos}</TableCell>
                          <TableCell className="text-right">{r.diasCiclo}{r.aberto ? "+" : ""}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </section>

                <section className="bg-card rounded-xl border border-border p-4 shadow-sm">
                  <h3 className="text-sm font-display font-semibold text-foreground mb-1">Horas por responsável</h3>
                  <p className="text-xs text-muted-foreground mb-3">Quem está executando os registros</p>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Responsável</TableHead>
                        <TableHead className="text-right">Horas</TableHead>
                        <TableHead className="text-right">Registros</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {porResponsavel.map((r) => (
                        <TableRow key={r.nome}>
                          <TableCell className="font-medium text-foreground">{r.nome}</TableCell>
                          <TableCell className="text-right">{fmtHoras(r.minutos)}</TableCell>
                          <TableCell className="text-right text-muted-foreground">{r.registros}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </section>
              </div>

              <p className="text-xs text-muted-foreground">
                Como é calculado: tarefas do Asana com "registro", "protocolo", "exigência", "junta", "JUCEPAR" ou "rerratificação" no nome,
                agrupadas por projeto e documento (ex.: "5ª ACS"). {ind.pctSemHora}% das tarefas do período estão concluídas sem hora lançada.
                Quanto mais padronizado o nome das tarefas de registro, mais preciso fica o painel.
              </p>
            </>
          )}
        </div>
      </div>

      <footer className="border-t border-border bg-card/50 py-4 mt-4">
        <div className="container text-center text-sm text-muted-foreground">
          <a href="https://wolffescripes.com.br" target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors">
            Wolff e Scripes Advogados
          </a>{" "}
          &bull; Registros na Junta
        </div>
      </footer>
    </div>
  );
}

function StatCard({
  icon: Icon, tone, label, value, hint,
}: {
  icon: any;
  tone: "neutral" | "success" | "warning" | "danger";
  label: string;
  value: string;
  hint?: string;
}) {
  const toneClasses = {
    neutral: { bg: "bg-muted/50", icon: "text-muted-foreground" },
    success: { bg: "bg-success/10", icon: "text-success-foreground" },
    warning: { bg: "bg-warning/10", icon: "text-warning-foreground" },
    danger: { bg: "bg-destructive/10", icon: "text-destructive" },
  }[tone];

  return (
    <div className="bg-card rounded-xl border border-border p-3.5 shadow-sm">
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
