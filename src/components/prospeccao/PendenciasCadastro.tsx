import { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import type { PlacarReunioes, ProspeccaoItem } from "@/hooks/use-prospeccao-data";

type Aba = "semMotivo" | "semData" | "semTarefa" | "modeloAntigo";

interface Linha {
  gid: string;
  href: string;
  nome: string;
  responsavel: string | null;
  detalhe: string;
}

const primeiroNome = (n: string | null) => (n ? n.split(" ")[0] : "Sem responsável");

/**
 * Tudo que é "lição de casa" no Asana fica aqui, recolhido por padrão.
 * São cadastros incompletos que distorcem os números da tela, não indicadores de negócio.
 */
export function PendenciasCadastro({ items, placar }: { items: ProspeccaoItem[]; placar?: PlacarReunioes }) {
  const [aberto, setAberto] = useState(false);
  const [aba, setAba] = useState<Aba>("semMotivo");

  const grupos = useMemo(() => {
    const semMotivo: Linha[] = items
      .filter((i) => i.statusGeral === "concluido" && (i.desfecho === "vazio" || i.desfecho === "generico" || !i.desfecho))
      .map((i) => ({
        gid: i.gid,
        href: `https://app.asana.com/0/${i.gid}`,
        nome: i.name,
        responsavel: i.owner,
        detalhe: i.desfecho === "generico" ? "Motivo genérico" : "Sem ganho ou perda registrado",
      }));

    const semData: Linha[] = (placar?.agendadasSemData ?? []).map((a) => ({
      gid: a.taskGid,
      href: `https://app.asana.com/0/${a.projetoGid}/${a.taskGid}`,
      nome: a.projeto,
      responsavel: a.agendadaPor,
      detalhe: a.temTarefaReuniao ? 'Falta a data na "Reunião Comercial"' : 'Projeto sem a tarefa "Reunião Comercial"',
    }));

    const semTarefa: Linha[] = (placar?.semTarefaAgendamento ?? []).map((s) => ({
      gid: s.projetoGid,
      href: `https://app.asana.com/0/${s.projetoGid}`,
      nome: s.projeto,
      responsavel: s.dono,
      detalhe: 'Sem "Agendar reunião comercial" e sem "Reunião Comercial"',
    }));

    const modeloAntigo: Linha[] = items
      .filter((i) => i.etapaAtual === "Sem estrutura de funil" && i.statusGeral !== "concluido")
      .map((i) => ({
        gid: i.gid,
        href: `https://app.asana.com/0/${i.gid}`,
        nome: i.name,
        responsavel: i.owner,
        detalhe: "Aberto sem as tarefas do funil",
      }));

    const ordenar = (l: Linha[]) => l.sort((a, b) => (a.responsavel ?? "").localeCompare(b.responsavel ?? "") || a.nome.localeCompare(b.nome));
    return {
      semMotivo: ordenar(semMotivo),
      semData: ordenar(semData),
      semTarefa: ordenar(semTarefa),
      modeloAntigo: ordenar(modeloAntigo),
    };
  }, [items, placar]);

  const abas: { k: Aba; rotulo: string }[] = [
    { k: "semMotivo", rotulo: "Encerrados sem resultado" },
    { k: "semData", rotulo: "Reunião sem data" },
    { k: "semTarefa", rotulo: "Sem tarefa de reunião" },
    { k: "modeloAntigo", rotulo: "Abertos sem funil" },
  ];
  const total = abas.reduce((s, a) => s + grupos[a.k].length, 0);
  const lista = grupos[aba];

  if (total === 0) return null;

  return (
    <section className="bg-card rounded-xl border border-border shadow-sm">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-expanded={aberto}
        className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left"
      >
        <div>
          <h3 className="text-sm font-display font-semibold text-foreground">Pendências de cadastro no Asana</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {total} {total === 1 ? "item afeta" : "itens afetam"} a precisão dos números desta tela
          </p>
        </div>
        <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${aberto ? "rotate-180" : ""}`} />
      </button>

      {aberto && (
        <div className="px-5 pb-5 border-t border-border pt-4">
          <div className="flex flex-wrap gap-2 mb-3">
            {abas.filter((a) => grupos[a.k].length > 0).map((a) => (
              <button
                key={a.k}
                type="button"
                onClick={() => setAba(a.k)}
                className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                  aba === a.k ? "border-foreground/30 bg-muted text-foreground" : "border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                {a.rotulo} <span className="font-semibold text-foreground">{grupos[a.k].length}</span>
              </button>
            ))}
          </div>

          {lista.length === 0 ? (
            <p className="text-xs text-muted-foreground py-2">Nada pendente nesta categoria.</p>
          ) : (
            <div className="max-h-[320px] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Projeto</TableHead>
                    <TableHead>Responsável</TableHead>
                    <TableHead>O que falta</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lista.map((l) => (
                    <TableRow key={l.gid}>
                      <TableCell>
                        <a href={l.href} target="_blank" rel="noopener noreferrer" className="hover:underline text-foreground">
                          {l.nome}
                        </a>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{primeiroNome(l.responsavel)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{l.detalhe}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
