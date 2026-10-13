import { useMemo, useState } from "react";
import { Target, FileText, Handshake, XCircle, TrendingUp, PauseCircle, CheckCircle2 } from "lucide-react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LabelList,
} from "recharts";
import type { ProspeccaoItem } from "@/hooks/use-prospeccao-data";
import { calcularIndicadores, TEMPOS_DESDE, type TempoEtapa } from "@/lib/indicadores-prospeccao";

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const rotuloMes = (mes: string) => `${MESES[Number(mes.slice(5, 7)) - 1]}/${mes.slice(2, 4)}`;
const desdeBR = new Date(TEMPOS_DESDE).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });

function formatarDias(t: TempoEtapa) {
  if (t.mediana === null) return "—";
  return `${t.mediana.toLocaleString("pt-BR")} ${t.mediana === 1 ? "dia" : "dias"}`;
}

const baseTexto = (t: TempoEtapa) =>
  t.base === 0 ? `Sem casos desde ${desdeBR}` : `Mediana de ${t.base} ${t.base === 1 ? "lead" : "leads"} desde ${desdeBR}`;

function diasBadgeClass(d: number) {
  if (d <= 7) return "bg-success/10 text-success-foreground border-success/20";
  if (d <= 15) return "bg-warning/10 text-warning-foreground border-warning/20";
  return "bg-destructive/10 text-destructive border-destructive/20";
}

export function IndicadoresComerciais({ items }: { items: ProspeccaoItem[] }) {
  const [owner, setOwner] = useState("todos");
  const [lista, setLista] = useState<"em_dia" | "em_espera">("em_dia");

  const owners = useMemo(
    () => [...new Set(items.map((i) => i.owner).filter((o): o is string => !!o))].sort(),
    [items]
  );

  const ind = useMemo(
    () => calcularIndicadores(owner === "todos" ? items : items.filter((i) => i.owner === owner)),
    [items, owner]
  );

  const semMarcos = items.some((i) => !i.marcos);

  return (
    <section className="bg-card rounded-xl border border-border p-4 shadow-sm space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-display font-semibold text-foreground">Indicadores comerciais</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Tempo entre as etapas e quanto do que é decidido vira contrato
          </p>
        </div>
        <Select value={owner} onValueChange={setOwner}>
          <SelectTrigger className="w-[200px] h-8 text-sm"><SelectValue placeholder="Responsável" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os responsáveis</SelectItem>
            {owners.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {semMarcos && (
        <p className="text-xs text-warning-foreground bg-warning/10 border border-warning/20 rounded-md px-3 py-2">
          Os tempos aparecem depois da próxima atualização do Asana.
        </p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Indicador
          icon={TrendingUp}
          label="Em dia"
          value={String(ind.status.emDia)}
          hint={ind.status.semStatus > 0 ? `+${ind.status.semStatus} sem status no Asana` : "Em andamento no funil"}
          onClick={() => setLista("em_dia")}
          ativo={lista === "em_dia"}
        />
        <Indicador
          icon={PauseCircle}
          label="Em espera"
          value={String(ind.status.emEspera)}
          hint="Pausados, sem contagem de etapa"
          onClick={() => setLista("em_espera")}
          ativo={lista === "em_espera"}
        />
        <Indicador
          icon={CheckCircle2}
          label="Concluídos"
          value={String(ind.status.concluidos)}
          hint="Encerrados, ganhos ou perdidos"
        />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Indicador
          icon={Target}
          label="Índice de fechamento"
          value={ind.indiceFechamento === null ? "—" : `${ind.indiceFechamento}%`}
          hint={
            `${ind.ganhos} ganhos em ${ind.ganhos + ind.perdidos} decididos` +
            (ind.concluidosSemResultado > 0 ? `. ${ind.concluidosSemResultado} concluídos sem ganho ou perda registrado ficam fora` : "")
          }
        />
        <Indicador icon={FileText} label="Do lead à proposta" value={formatarDias(ind.ateProposta)} hint={baseTexto(ind.ateProposta)} />
        <Indicador icon={Handshake} label="Da proposta ao fechamento" value={formatarDias(ind.ateGanho)} hint={baseTexto(ind.ateGanho)} />
        <Indicador icon={XCircle} label="Da proposta à perda" value={formatarDias(ind.atePerda)} hint={baseTexto(ind.atePerda)} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <div className="lg:col-span-2">
          <h4 className="text-xs font-medium text-foreground mb-2">Leads criados por mês</h4>
          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={ind.leadsPorMes.map((d) => ({ ...d, rotulo: rotuloMes(d.mes) }))} margin={{ top: 18, left: 0, right: 8 }}>
                <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
                <XAxis dataKey="rotulo" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis allowDecimals={false} hide />
                <Tooltip cursor={{ fill: "hsl(var(--muted))" }} formatter={(v: number) => [v, "Leads"]} />
                <Bar dataKey="leads" fill="#7F77DD" radius={[4, 4, 0, 0]} maxBarSize={36}>
                  <LabelList dataKey="leads" position="top" style={{ fontSize: 12, fontWeight: 500, fill: "hsl(var(--foreground))" }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="lg:col-span-3">
          <div className="flex items-center justify-between gap-2 mb-2">
            <h4 className="text-xs font-medium text-foreground">
              {lista === "em_dia" ? "Leads em dia, há mais tempo na etapa primeiro" : "Leads em espera, há mais tempo pausados primeiro"}
            </h4>
            <div className="flex rounded-md border border-border p-0.5 text-xs">
              {(["em_dia", "em_espera"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setLista(k)}
                  className={`px-2 py-0.5 rounded ${lista === k ? "bg-muted text-foreground font-medium" : "text-muted-foreground hover:text-foreground"}`}
                >
                  {k === "em_dia" ? `Em dia (${ind.emDia.length})` : `Em espera (${ind.emEspera.length})`}
                </button>
              ))}
            </div>
          </div>
          <div className="max-h-[200px] overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Projeto</TableHead>
                  <TableHead>{lista === "em_dia" ? "Etapa" : "Situação"}</TableHead>
                  <TableHead className="text-right">{lista === "em_dia" ? "Dias na etapa" : "Dias desde o status"}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(lista === "em_dia" ? ind.emDia : ind.emEspera).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-xs text-muted-foreground">
                      {lista === "em_dia" ? "Nenhum lead em dia." : "Nenhum lead em espera."}
                    </TableCell>
                  </TableRow>
                ) : lista === "em_dia" ? (
                  ind.emDia.map((l) => (
                    <TableRow key={l.gid}>
                      <TableCell>
                        <LinkProjeto gid={l.gid} nome={l.nome} />
                        {owner === "todos" && l.owner && <span className="block text-xs text-muted-foreground">{l.owner}</span>}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {l.etapa}
                        {l.semStatus && <Badge variant="outline" className="ml-1.5 text-[10px]">Sem status</Badge>}
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge variant="outline" className={diasBadgeClass(l.dias)}>{l.dias}</Badge>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  ind.emEspera.map((l) => (
                    <TableRow key={l.gid}>
                      <TableCell>
                        <LinkProjeto gid={l.gid} nome={l.nome} />
                        {owner === "todos" && l.owner && <span className="block text-xs text-muted-foreground">{l.owner}</span>}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">Em espera</TableCell>
                      <TableCell className="text-right">
                        <Badge variant="outline" className="text-muted-foreground">{l.dias}</Badge>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>
    </section>
  );
}

function LinkProjeto({ gid, nome }: { gid: string; nome: string }) {
  return (
    <a href={`https://app.asana.com/0/${gid}`} target="_blank" rel="noopener noreferrer" className="hover:underline">
      {nome}
    </a>
  );
}

function Indicador({
  icon: Icon, label, value, hint, onClick, ativo,
}: { icon: any; label: string; value: string; hint: string; onClick?: () => void; ativo?: boolean }) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={`rounded-lg border p-3 text-left ${ativo ? "border-foreground/30 bg-muted/30" : "border-border"} ${onClick ? "hover:border-foreground/30 transition-colors" : ""}`}
    >
      <div className="flex items-center gap-2 mb-2">
        <div className="p-1.5 rounded-md bg-muted/50">
          <Icon className="w-3.5 h-3.5 text-muted-foreground" />
        </div>
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
      <p className="text-xl font-bold text-foreground">{value}</p>
      <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>
    </Tag>
  );
}
