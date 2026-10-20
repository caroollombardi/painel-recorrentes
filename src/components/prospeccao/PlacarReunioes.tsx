import { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { InfoDica } from "@/components/prospeccao/InfoDica";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, LabelList,
} from "recharts";
import type { PlacarReunioes as PlacarData } from "@/hooks/use-prospeccao-data";

// Sócios aparecem sempre no placar, mesmo zerados. Qualquer outra pessoa que
// concluir a tarefa entra no ranking com os próprios pontos.
export const SEMPRE_NO_PLACAR = ["Pedro Wolff", "Lorenzo Bachiega Scripes"];

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

function formatarPrazo(data: string) {
  return new Date(`${data}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

// Prazo da "Reunião Comercial": pode vir só com dia (2026-10-02) ou com dia e hora
export function formatarReuniao(valor: string) {
  if (valor.length <= 10) return formatarPrazo(valor);
  return new Date(valor).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

const hojeISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

type Lista = "periodo" | "proximas" | "aguardando";

const REGRA_PLACAR =
  'Um ponto por reunião: "Agendar reunião comercial" concluída e data preenchida na "Reunião Comercial". ' +
  'Nos projetos que só têm "Reunião Comercial", vale quem colocou a data. Sem data, não pontua. ' +
  "Entram todos os projetos, menos os concluídos há mais de 30 dias.";

export function PlacarReunioes({ placar }: { placar: PlacarData }) {
  const [periodo, setPeriodo] = useState<Periodo>("30dias");
  const [lista, setLista] = useState<Lista | null>(null);
  const futuras = placar.reunioesFuturas ?? [];

  const noPeriodo = useMemo(() => {
    const desde = inicioDoPeriodo(periodo);
    return placar.reunioesAgendadas.filter((r) => new Date(r.agendadaEm).getTime() >= desde);
  }, [placar, periodo]);

  const ranking = useMemo(() => {
    const pontos: Record<string, number> = {};
    for (const nome of SEMPRE_NO_PLACAR) pontos[nome] = 0;
    for (const r of noPeriodo) pontos[r.agendadaPor] = (pontos[r.agendadaPor] ?? 0) + 1;
    const l = Object.entries(pontos)
      .map(([nome, total]) => ({ nome, curto: primeiroNome(nome), total }))
      .sort((a, b) => b.total - a.total || a.nome.localeCompare(b.nome));
    const max = l[0]?.total ?? 0;
    const empateNoTopo = l.filter((x) => x.total === max).length > 1;
    return l.map((x) => ({ ...x, lider: max > 0 && !empateNoTopo && x.total === max }));
  }, [noPeriodo]);

  const hoje = hojeISO();
  const atrasadas = placar.reunioesPendentes.filter((p) => p.prazo && p.prazo < hoje).length;

  const abas: { k: Lista; rotulo: string; n: number; alerta?: string }[] = [
    { k: "periodo", rotulo: "Agendadas no período", n: noPeriodo.length },
    { k: "proximas", rotulo: "Próximas reuniões", n: futuras.length },
    {
      k: "aguardando",
      rotulo: "Aguardando agendamento",
      n: placar.reunioesPendentes.length,
      alerta: atrasadas > 0 ? `${atrasadas} vencida${atrasadas > 1 ? "s" : ""}` : undefined,
    },
  ];

  return (
    <section className="bg-card rounded-xl border border-border p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h3 className="text-sm font-display font-semibold text-foreground flex items-center gap-1.5">
          Placar de reuniões agendadas <InfoDica texto={REGRA_PLACAR} />
        </h3>
        <Select value={periodo} onValueChange={(v) => setPeriodo(v as Periodo)}>
          <SelectTrigger className="w-[170px] h-8 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            {(Object.keys(PERIODO_LABEL) as Periodo[]).map((p) => (
              <SelectItem key={p} value={p}>{PERIODO_LABEL[p]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div style={{ height: Math.max(ranking.length * 38, 90) }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={ranking} layout="vertical" margin={{ left: 0, right: 36 }} barCategoryGap={10}>
            <XAxis type="number" allowDecimals={false} hide domain={[0, (max: number) => Math.max(max, 1)]} />
            <YAxis type="category" dataKey="curto" width={72} tickLine={false} axisLine={false} tick={{ fontSize: 13, fill: "hsl(var(--foreground))" }} />
            <Tooltip cursor={{ fill: "hsl(var(--muted))" }} formatter={(v: number) => [v, "Reuniões agendadas"]} labelFormatter={(_, p) => p?.[0]?.payload?.nome ?? ""} />
            <Bar dataKey="total" radius={[0, 4, 4, 0]} maxBarSize={18} minPointSize={2}>
              {ranking.map((r) => (
                <Cell key={r.nome} fill={r.lider ? "#FB7435" : "hsl(var(--muted-foreground) / 0.45)"} />
              ))}
              <LabelList dataKey="total" position="right" style={{ fontSize: 13, fontWeight: 600, fill: "hsl(var(--foreground))" }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-4 pt-3 border-t border-border flex flex-wrap gap-2">
        {abas.map((a) => (
          <button
            key={a.k}
            type="button"
            onClick={() => setLista((atual) => (atual === a.k ? null : a.k))}
            aria-expanded={lista === a.k}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors ${
              lista === a.k ? "border-foreground/30 bg-muted text-foreground" : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {a.rotulo}
            <span className="font-semibold text-foreground">{a.n}</span>
            {a.alerta && <span className="text-destructive">· {a.alerta}</span>}
            <ChevronDown className={`w-3 h-3 transition-transform ${lista === a.k ? "rotate-180" : ""}`} />
          </button>
        ))}
      </div>

      {lista && (
        <div className="mt-3 max-h-[320px] overflow-y-auto">
          {lista === "periodo" && (
            noPeriodo.length === 0 ? <Vazio texto="Nenhuma reunião agendada no período." /> : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Projeto</TableHead>
                    <TableHead>Agendou</TableHead>
                    <TableHead className="text-right">Reunião</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {noPeriodo.map((r) => (
                    <TableRow key={r.taskGid}>
                      <TableCell>
                        <LinkAsana projeto={r.projetoGid} tarefa={r.taskGid} nome={r.projeto} />
                        {r.reuniaoDataPor !== r.agendadaPor && r.reuniaoDataPor !== "Não identificado" && (
                          <span className="block text-xs text-muted-foreground">Data colocada por {primeiroNome(r.reuniaoDataPor)}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{primeiroNome(r.agendadaPor)}</TableCell>
                      <TableCell className="text-right whitespace-nowrap text-muted-foreground">{formatarReuniao(r.reuniaoData)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )
          )}

          {lista === "proximas" && (
            futuras.length === 0 ? <Vazio texto="Nenhuma reunião com data de hoje em diante." /> : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Reunião</TableHead>
                    <TableHead>Projeto</TableHead>
                    <TableHead className="text-right">Agendou</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {futuras.map((r) => (
                    <TableRow key={r.taskGid}>
                      <TableCell className="whitespace-nowrap font-medium text-foreground">{formatarReuniao(r.reuniaoData)}</TableCell>
                      <TableCell><LinkAsana projeto={r.projetoGid} tarefa={r.taskGid} nome={r.projeto} /></TableCell>
                      <TableCell className="text-right text-muted-foreground">{primeiroNome(r.agendadaPor)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )
          )}

          {lista === "aguardando" && (
            placar.reunioesPendentes.length === 0 ? <Vazio texto="Nenhuma reunião esperando para ser agendada." /> : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Projeto</TableHead>
                    <TableHead>Responsável</TableHead>
                    <TableHead className="text-right">Prazo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {placar.reunioesPendentes.map((p) => {
                    const vencida = !!p.prazo && p.prazo < hoje;
                    return (
                      <TableRow key={p.taskGid}>
                        <TableCell><LinkAsana projeto={p.projetoGid} tarefa={p.taskGid} nome={p.projeto} /></TableCell>
                        <TableCell className="text-muted-foreground">{p.responsavel ? primeiroNome(p.responsavel) : "Sem responsável"}</TableCell>
                        <TableCell className="text-right">
                          {p.prazo ? (
                            <Badge variant="outline" className={vencida ? "bg-destructive/10 text-destructive border-destructive/20" : "text-muted-foreground"}>
                              {vencida ? "Vencido " : ""}{formatarPrazo(p.prazo)}
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
            )
          )}
        </div>
      )}
    </section>
  );
}

function Vazio({ texto }: { texto: string }) {
  return <p className="text-xs text-muted-foreground py-3">{texto}</p>;
}

function LinkAsana({ projeto, tarefa, nome }: { projeto: string; tarefa: string; nome: string }) {
  return (
    <a href={`https://app.asana.com/0/${projeto}/${tarefa}`} target="_blank" rel="noopener noreferrer" className="hover:underline text-foreground">
      {nome}
    </a>
  );
}
