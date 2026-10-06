import { useEffect, useMemo, useState } from "react";
import { ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

// Indicadores da área de Contratos. Os números vêm das views
// vw_indicadores_contratos_mensal e vw_contratos_demandas (Supabase),
// alimentadas por /api/sync-contratos a partir do padrão do Asana.

const SLA_PADRAO = 5;
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

interface Mensal {
  mes: string;
  entregas?: number;
  entregas_no_prazo?: number;
  c1_pct_no_prazo?: number | null;
  entregas_sem_ajustes?: number;
  c2_pct_sem_ajustes?: number | null;
  encerradas?: number;
  encerradas_com_estimativa?: number;
  horas_lancadas?: number | null;
  horas_estimadas?: number | null;
  c3_razao_horas?: number | null;
  cobertura_estimativa_pct?: number | null;
}

interface Entrega {
  task_gid: string;
  nome: string;
  projeto_nome: string | null;
  recebido_em: string;
  entregue_em: string | null;
  concluida: boolean;
  sla_dias: number;
  dias_uteis_ate_entrega: number | null;
  no_prazo: boolean | null;
  no_prazo_agendado: boolean | null;
  prazo: string | null;
  dias_uteis_em_aberto: number | null;
  url: string | null;
}

const fmtMes = (iso: string) => { const [a, m] = iso.split("-"); return `${MESES[+m - 1]}/${a.slice(2)}`; };
const fmtData = (iso?: string | null) => (iso ? iso.split("-").reverse().slice(0, 2).join("/") : "—");
const pct = (v?: number | null) => (v == null ? "—" : `${Math.round(Number(v))}%`);
const razao = (v?: number | null) => (v == null ? "—" : `${Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}×`);
const num = (v?: number | null) => Number(v ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 });
const mesAtual = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`; };
const somaMes = (iso: string, n: number) => {
  const [a, m] = iso.split("-").map(Number);
  const d = new Date(a, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
};

function Tendencia({ serie, campo, mes, max, fmt }: {
  serie: Mensal[]; campo: keyof Mensal; mes: string; max?: number; fmt: (v: number) => string;
}) {
  const teto = max ?? Math.max(1, ...serie.map((s) => Number(s[campo] ?? 0)));
  return (
    <div className="flex items-end gap-1.5 h-20 mt-4" aria-hidden>
      {serie.map((s) => {
        const v = s[campo] as number | null | undefined;
        return (
          <div key={s.mes} className="flex-1 h-full flex flex-col justify-end items-center gap-1">
            <span className="text-[10px] tabular-nums text-muted-foreground">{v == null ? "" : fmt(v)}</span>
            <div
              className={cn("w-full rounded-t-sm", s.mes === mes ? "bg-primary" : "bg-muted")}
              style={{ height: `${v == null ? 0 : Math.max(4, (Number(v) / teto) * 100)}%` }}
            />
            <span className="text-[10px] text-muted-foreground">{fmtMes(s.mes).slice(0, 3)}</span>
          </div>
        );
      })}
    </div>
  );
}

function Indicador({ codigo, nome, valor, detalhe, nota, children }: {
  codigo: string; nome: string; valor: string; detalhe: string; nota?: string | null; children: React.ReactNode;
}) {
  return (
    <section className="bg-card p-5 flex flex-col">
      <div className="flex items-baseline gap-2">
        <span className="text-[11px] font-semibold text-primary">{codigo}</span>
        <h3 className="text-sm font-medium text-foreground">{nome}</h3>
      </div>
      <p className="text-[34px] font-display font-semibold tabular-nums leading-none tracking-tight mt-3">{valor}</p>
      <p className="text-[13px] text-muted-foreground mt-1.5">{detalhe}</p>
      {children}
      {nota && <p className="text-xs text-muted-foreground mt-3 leading-relaxed">{nota}</p>}
    </section>
  );
}

function ListaEntregas({ titulo, vazio, itens, detalhe }: {
  titulo: string; vazio: string; itens: Entrega[]; detalhe: (d: Entrega) => string;
}) {
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-medium text-foreground">{titulo}</h3>
      {itens.length === 0 ? (
        <p className="text-sm text-muted-foreground">{vazio}</p>
      ) : (
        <ul className="border-t border-border">
          {itens.map((d) => (
            <li key={d.task_gid} className="py-2.5 border-b border-border">
              {d.url ? (
                <a href={d.url} target="_blank" rel="noreferrer"
                  className="text-sm text-foreground hover:underline inline-flex items-center gap-1">
                  {d.nome}<ExternalLink className="w-3 h-3 text-muted-foreground" />
                </a>
              ) : <span className="text-sm text-foreground">{d.nome}</span>}
              <p className="text-xs text-muted-foreground mt-0.5">{detalhe(d)}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function IndicadoresContratos({ versao = 0 }: { versao?: number }) {
  const [mes, setMes] = useState(mesAtual());
  const [mensal, setMensal] = useState<Mensal[]>([]);
  const [entregas, setEntregas] = useState<Entrega[]>([]);
  const [estado, setEstado] = useState<"carregando" | "ok" | string>("carregando");

  useEffect(() => {
    let vivo = true;
    (async () => {
      setEstado("carregando");
      const inicio = somaMes(mesAtual(), -11);
      const db = supabase as any; // views novas ainda não estão nos tipos gerados
      const [m, d] = await Promise.all([
        db.from("vw_indicadores_contratos_mensal").select("*").gte("mes", inicio).order("mes"),
        db.from("vw_contratos_demandas")
          .select("task_gid,nome,projeto_nome,recebido_em,entregue_em,concluida,sla_dias,dias_uteis_ate_entrega,no_prazo,no_prazo_agendado,prazo,dias_uteis_em_aberto,url")
          .or(`entregue_em.gte.${inicio},concluida.eq.false`),
      ]);
      if (!vivo) return;
      if (m.error || d.error) { setEstado(`erro: ${(m.error || d.error).message}`); return; }
      setMensal(m.data ?? []);
      setEntregas(d.data ?? []);
      setEstado("ok");
    })();
    return () => { vivo = false; };
  }, [versao]);

  const serie = useMemo(() => {
    const porMes = Object.fromEntries(mensal.map((r) => [r.mes, r]));
    return Array.from({ length: 6 }, (_, i) => somaMes(mes, i - 5)).map((k) => porMes[k] ?? { mes: k });
  }, [mensal, mes]);

  const atual = serie[serie.length - 1];
  const opcoesMes = Array.from({ length: 12 }, (_, i) => somaMes(mesAtual(), -i));
  const provisorio = mes >= somaMes(mesAtual(), -1);

  const foraDoPrazo = entregas.filter((d) => d.entregue_em?.startsWith(mes.slice(0, 7)) && d.no_prazo === false);
  const abertasAtrasadas = entregas
    .filter((d) => !d.concluida && (d.dias_uteis_em_aberto ?? 0) > (d.sla_dias ?? SLA_PADRAO))
    .sort((a, b) => (b.dias_uteis_em_aberto ?? 0) - (a.dias_uteis_em_aberto ?? 0));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-display font-semibold text-foreground">Contratos</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Prazo de {SLA_PADRAO} dias úteis da abertura à conclusão da tarefa de entrega; due diligence da Makasí, 7
          </p>
        </div>
        <Select value={mes} onValueChange={setMes}>
          <SelectTrigger className="w-[120px]" aria-label="Mês"><SelectValue /></SelectTrigger>
          <SelectContent>
            {opcoesMes.map((o) => <SelectItem key={o} value={o}>{fmtMes(o)}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {estado === "carregando" && <p className="text-sm text-muted-foreground">Carregando indicadores…</p>}
      {estado.startsWith("erro") && (
        <p className="text-sm text-destructive">
          Não foi possível ler os indicadores ({estado.slice(6)}). Confira se o SQL foi aplicado no Supabase.
        </p>
      )}

      {estado === "ok" && (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-px bg-border border border-border rounded-lg overflow-hidden">
            <Indicador codigo="C1" nome="Entregas no prazo" valor={pct(atual.c1_pct_no_prazo)}
              detalhe={atual.entregas ? `${atual.entregas_no_prazo} de ${atual.entregas} entregas` : "Nenhuma entrega no mês"}>
              <Tendencia serie={serie} campo="c1_pct_no_prazo" mes={mes} max={100} fmt={pct} />
            </Indicador>

            <Indicador codigo="C2" nome="Entregas sem ajustes" valor={pct(atual.c2_pct_sem_ajustes)}
              detalhe={atual.entregas ? `${atual.entregas_sem_ajustes} de ${atual.entregas} entregas` : "Nenhuma entrega no mês"}
              nota={provisorio && atual.entregas ? "Provisório: o cliente ainda pode devolver entregas recentes." : null}>
              <Tendencia serie={serie} campo="c2_pct_sem_ajustes" mes={mes} max={100} fmt={pct} />
            </Indicador>

            <Indicador codigo="C3" nome="Horas × estimativa" valor={razao(atual.c3_razao_horas)}
              detalhe={atual.horas_estimadas
                ? `${num(atual.horas_lancadas)} h lançadas para ${num(atual.horas_estimadas)} h estimadas`
                : "Nenhuma tarefa concluída com estimativa"}
              nota={atual.encerradas
                ? `Base: ${atual.encerradas_com_estimativa} de ${atual.encerradas} tarefas concluídas tinham estimativa (${pct(atual.cobertura_estimativa_pct)}). Acima de 1,00× a área gastou mais do que estimou.`
                : null}>
              <Tendencia serie={serie} campo="c3_razao_horas" mes={mes} fmt={(v) => razao(v).replace("×", "")} />
            </Indicador>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <ListaEntregas
              titulo={`Entregues fora do prazo em ${fmtMes(mes)}`}
              vazio="Nenhuma entrega fora do prazo neste mês."
              itens={foraDoPrazo}
              detalhe={(d) => `${d.projeto_nome ?? ""} · entregue ${fmtData(d.entregue_em)} · ${d.dias_uteis_ate_entrega} de ${d.sla_dias} dias úteis`
                + (d.no_prazo_agendado ? ` · dentro do prazo agendado no Asana (${fmtData(d.prazo)})` : "")}
            />
            <ListaEntregas
              titulo="Abertas além do prazo hoje"
              vazio="Nenhuma entrega aberta passou do prazo."
              itens={abertasAtrasadas}
              detalhe={(d) => `${d.projeto_nome ?? ""} · aberta em ${fmtData(d.recebido_em)} · ${d.dias_uteis_em_aberto} de ${d.sla_dias} dias úteis`}
            />
          </div>
        </>
      )}
    </div>
  );
}
