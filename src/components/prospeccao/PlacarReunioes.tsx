import { useMemo, useState } from "react";
import { CalendarCheck, CalendarClock } from "lucide-react";
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
import type { PlacarReunioes as PlacarData } from "@/hooks/use-prospeccao-data";

// Sócios aparecem sempre no placar, mesmo zerados. Qualquer outra pessoa que
// concluir a tarefa entra no ranking com os próprios pontos.
const SEMPRE_NO_PLACAR = ["Pedro Wolff", "Lorenzo Bachiega Scripes"];

type Periodo = "30dias" | "mes" | "semana";

const PERIODO_LABEL: Record<Periodo, string> = {
  "30dias": "Últimos 30 dias",
  mes: "Este mês",
  semana: "Esta semana",
};

function inicioDoPeriodo(periodo: Periodo): number {
  const agora = new Date();
  if (periodo === "semana") {
    const d = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // semana começa na segunda
    return d.getTime();
  }
  if (periodo === "mes") return new Date(agora.getFullYear(), agora.getMonth(), 1).getTime();
  return agora.getTime() - 30 * 86400000;
}

const primeiroNome = (nome: string) => nome.split(" ")[0];

function formatarDataHora(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function formatarPrazo(data: string) {
  return new Date(`${data}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

// Prazo da "Reunião Comercial": pode vir só com dia (2026-10-02) ou com dia e hora
function formatarReuniao(valor: string) {
  if (valor.length <= 10) return formatarPrazo(valor);
  return new Date(valor).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

const hojeISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

function contarPorPessoa(lista: { agendadaPor: string }[]): string {
  const pontos: Record<string, number> = {};
  for (const nome of SEMPRE_NO_PLACAR) pontos[nome] = 0;
  for (const r of lista) pontos[r.agendadaPor] = (pontos[r.agendadaPor] ?? 0) + 1;
  return Object.entries(pontos)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([nome, total]) => `${primeiroNome(nome)} ${total}`)
    .join(" · ");
}

export function PlacarReunioes({ placar }: { placar: PlacarData }) {
  const [periodo, setPeriodo] = useState<Periodo>("30dias");
  const futuras = placar.reunioesFuturas ?? [];
  const ultimos30 = useMemo(() => {
    const desde = Date.now() - 30 * 86400000;
    return placar.reunioesAgendadas.filter((r) => new Date(r.agendadaEm).getTime() >= desde);
  }, [placar]);

  const noPeriodo = useMemo(() => {
    const desde = inicioDoPeriodo(periodo);
    return placar.reunioesAgendadas.filter((r) => new Date(r.agendadaEm).getTime() >= desde);
  }, [placar, periodo]);

  const ranking = useMemo(() => {
    const pontos: Record<string, number> = {};
    for (const nome of SEMPRE_NO_PLACAR) pontos[nome] = 0;
    for (const r of noPeriodo) pontos[r.agendadaPor] = (pontos[r.agendadaPor] ?? 0) + 1;
    const lista = Object.entries(pontos)
      .map(([nome, total]) => ({ nome, curto: primeiroNome(nome), total }))
      .sort((a, b) => b.total - a.total || a.nome.localeCompare(b.nome));
    const max = lista[0]?.total ?? 0;
    const empateNoTopo = lista.filter((l) => l.total === max).length > 1;
    return lista.map((l) => ({ ...l, lider: max > 0 && !empateNoTopo && l.total === max }));
  }, [noPeriodo]);

  const hoje = hojeISO();
  const atrasadas = placar.reunioesPendentes.filter((p) => p.prazo && p.prazo < hoje).length;

  return (
    <section className="bg-card rounded-xl border border-border p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
        <div>
          <h3 className="text-sm font-display font-semibold text-foreground mb-1">Placar de reuniões agendadas</h3>
          <p className="text-xs text-muted-foreground">
            Um ponto por reunião: "Agendar reunião comercial" concluída e data preenchida na "Reunião Comercial".
            Nos projetos que só têm "Reunião Comercial", vale quem colocou a data. Sem data, não pontua.
            Entram todos os projetos, menos os concluídos há mais de 30 dias.
          </p>
        </div>
        <Select value={periodo} onValueChange={(v) => setPeriodo(v as Periodo)}>
          <SelectTrigger className="w-[160px] h-8 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            {(Object.keys(PERIODO_LABEL) as Periodo[]).map((p) => (
              <SelectItem key={p} value={p}>{PERIODO_LABEL[p]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Indicadores */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
        <Indicador
          icon={CalendarClock}
          label="Reuniões agendadas para o futuro"
          valor={futuras.length}
          detalhe={contarPorPessoa(futuras)}
        />
        <Indicador
          icon={CalendarCheck}
          label="Agendadas nos últimos 30 dias"
          valor={ultimos30.length}
          detalhe={contarPorPessoa(ultimos30)}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Ranking */}
        <div className="lg:col-span-2">
          <p className="text-xs text-muted-foreground mb-2">
            {noPeriodo.length} reunião(ões) agendada(s) · {PERIODO_LABEL[periodo].toLowerCase()}
          </p>
          <div style={{ height: Math.max(ranking.length * 40, 100) }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={ranking} layout="vertical" margin={{ left: 8, right: 30 }} barCategoryGap={10}>
                <CartesianGrid horizontal={false} stroke="hsl(var(--border))" />
                <XAxis type="number" allowDecimals={false} hide domain={[0, (max: number) => Math.max(max, 1)]} />
                <YAxis type="category" dataKey="curto" width={80} tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "hsl(var(--foreground))" }} />
                <Tooltip cursor={{ fill: "hsl(var(--muted))" }} formatter={(v: number) => [v, "Reuniões agendadas"]} labelFormatter={(_, p) => p?.[0]?.payload?.nome ?? ""} />
                <Bar dataKey="total" radius={[0, 4, 4, 0]} maxBarSize={20} minPointSize={2}>
                  {ranking.map((r) => (
                    <Cell key={r.nome} fill={r.lider ? "#FB7435" : "hsl(var(--muted-foreground))"} />
                  ))}
                  <LabelList dataKey="total" position="right" style={{ fontSize: 12, fontWeight: 500, fill: "hsl(var(--foreground))" }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Reuniões agendadas no período */}
        <div className="lg:col-span-3">
          {noPeriodo.length === 0 ? (
            <div className="h-full flex items-center justify-center rounded-lg border border-dashed border-border p-6">
              <p className="text-xs text-muted-foreground text-center">
                Nenhuma reunião agendada {periodo === "semana" ? "nesta semana" : periodo === "mes" ? "neste mês" : "nos últimos 30 dias"}.
                Quando a tarefa for concluída no Asana, ela aparece aqui na próxima atualização.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto max-h-[320px] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Agendada em</TableHead>
                    <TableHead>Concluiu</TableHead>
                    <TableHead>Colocou a data</TableHead>
                    <TableHead>Projeto</TableHead>
                    <TableHead className="text-right">Reunião</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {noPeriodo.map((r) => (
                    <TableRow key={r.taskGid}>
                      <TableCell className="text-muted-foreground whitespace-nowrap">{formatarDataHora(r.agendadaEm)}</TableCell>
                      <TableCell className="font-medium text-foreground">{primeiroNome(r.agendadaPor)}</TableCell>
                      <TableCell className={r.reuniaoDataPor !== r.agendadaPor ? "text-warning-foreground" : "text-muted-foreground"}>
                        {r.reuniaoDataPor === "Não identificado" ? "Não identificado" : primeiroNome(r.reuniaoDataPor)}
                      </TableCell>
                      <TableCell>
                        <a href={`https://app.asana.com/0/${r.projetoGid}/${r.taskGid}`} target="_blank" rel="noopener noreferrer" className="hover:underline">
                          {r.projeto}
                        </a>
                        {r.origem === "reuniao" && (
                          <Badge variant="outline" className="ml-2 text-xs font-normal text-muted-foreground" title="Projeto sem a tarefa &quot;Agendar reunião comercial&quot;: o ponto vem da data colocada na &quot;Reunião Comercial&quot;">
                            Só Reunião Comercial
                          </Badge>
                        )}
                        {r.concluidaNoCadastro && (
                          <Badge variant="outline" className="ml-2 text-xs font-normal text-muted-foreground" title="Concluída junto com a criação do projeto: a data é a do cadastro, não a do agendamento">
                            Marcada no cadastro
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap text-muted-foreground">{formatarReuniao(r.reuniaoData)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </div>

      {/* Próximas reuniões */}
      <div className="mt-4 pt-4 border-t border-border">
        <p className="text-sm font-medium text-foreground">Próximas reuniões ({futuras.length})</p>
        {futuras.length === 0 ? (
          <p className="text-xs text-muted-foreground mt-1">Nenhuma reunião com data de hoje em diante.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Reunião</TableHead>
                <TableHead>Projeto</TableHead>
                <TableHead className="text-right">Agendada por</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {futuras.map((r) => (
                <TableRow key={r.taskGid}>
                  <TableCell className="whitespace-nowrap font-medium text-foreground">{formatarReuniao(r.reuniaoData)}</TableCell>
                  <TableCell>
                    <a href={`https://app.asana.com/0/${r.projetoGid}/${r.taskGid}`} target="_blank" rel="noopener noreferrer" className="hover:underline">
                      {r.projeto}
                    </a>
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">{primeiroNome(r.agendadaPor)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Aguardando agendamento */}
      <div className="mt-4 pt-4 border-t border-border">
        <p className="text-sm font-medium text-foreground">
          Aguardando agendamento ({placar.reunioesPendentes.length})
          {atrasadas > 0 && <span className="text-xs font-normal text-destructive"> · {atrasadas} com prazo vencido</span>}
        </p>
        {placar.reunioesPendentes.length === 0 ? (
          <p className="text-xs text-muted-foreground mt-1">Nenhuma reunião esperando para ser agendada.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Projeto</TableHead>
                <TableHead>Responsável pela tarefa</TableHead>
                <TableHead className="text-right">Prazo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {placar.reunioesPendentes.map((p) => {
                const vencida = !!p.prazo && p.prazo < hoje;
                return (
                  <TableRow key={p.taskGid}>
                    <TableCell>
                      <a href={`https://app.asana.com/0/${p.projetoGid}/${p.taskGid}`} target="_blank" rel="noopener noreferrer" className="hover:underline">
                        {p.projeto}
                      </a>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{p.responsavel ?? "Sem responsável"}</TableCell>
                    <TableCell className="text-right">
                      {p.prazo ? (
                        <Badge variant="outline" className={vencida ? "bg-destructive/10 text-destructive border-destructive/20" : "text-muted-foreground"}>
                          {vencida ? "Vencido · " : ""}{formatarPrazo(p.prazo)}
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">Sem prazo</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
        {(placar.agendadasSemData?.length ?? 0) > 0 && (
          <div className="mt-4 p-3 rounded-lg bg-warning/10 border border-warning/20">
            <p className="text-sm font-medium text-foreground">
              Agendadas sem data da reunião ({placar.agendadasSemData!.length})
            </p>
            <p className="text-xs text-muted-foreground mb-2">
              Não pontuam: falta a data na tarefa "Reunião Comercial".
            </p>
            <ul className="space-y-1">
              {placar.agendadasSemData!.map((a) => (
                <li key={a.projetoGid} className="text-sm flex flex-wrap items-center justify-between gap-2">
                  <a href={`https://app.asana.com/0/${a.projetoGid}/${a.taskGid}`} target="_blank" rel="noopener noreferrer" className="hover:underline">
                    {a.projeto}
                  </a>
                  <span className="text-xs text-muted-foreground">
                    {primeiroNome(a.agendadaPor)}
                    {!a.temTarefaReuniao && " · projeto sem a tarefa \"Reunião Comercial\""}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {placar.semTarefaAgendamento.length > 0 && (
          <details className="mt-3 text-xs text-muted-foreground">
            <summary className="cursor-pointer hover:text-foreground">
              {placar.semTarefaAgendamento.length} projeto(s) do placar sem "Agendar reunião comercial" e sem "Reunião Comercial"
            </summary>
            <ul className="mt-2 grid sm:grid-cols-2 gap-x-4 gap-y-1">
              {placar.semTarefaAgendamento.map((s) => (
                <li key={s.projetoGid} className="truncate">
                  <a href={`https://app.asana.com/0/0/${s.projetoGid}`} target="_blank" rel="noopener noreferrer" className="hover:underline">
                    {s.projeto}
                  </a>
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </section>
  );
}

function Indicador({
  icon: Icon, label, valor, detalhe,
}: { icon: React.ElementType; label: string; valor: number; detalhe: string }) {
  return (
    <div className="rounded-xl border border-border p-3.5">
      <div className="flex items-center gap-2 mb-2">
        <div className="p-1.5 rounded-md bg-muted/50">
          <Icon className="w-3.5 h-3.5 text-muted-foreground" />
        </div>
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
      <p className="text-xl font-bold text-foreground">{valor}</p>
      <p className="text-xs text-muted-foreground mt-0.5">{detalhe}</p>
    </div>
  );
}
