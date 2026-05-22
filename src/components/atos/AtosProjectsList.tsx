import { useMemo, useState } from "react";
import {
  ArrowUpDown,
  ChevronRight,
  Search,
  TrendingUp,
  TrendingDown,
  Minus,
  AlertTriangle,
  Paperclip,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  calcularProjeto,
  type AtoLancamentoDB,
  type AtoProjetoDB,
} from "@/lib/atos-parser";

interface AtosProjectsListProps {
  projetos: { projeto: AtoProjetoDB; lancamentos: AtoLancamentoDB[] }[];
  onSelect: (projetoId: string) => void;
}

type SortKey =
  | "nome"
  | "valor_combinado"
  | "valor_horas"
  | "resultado"
  | "horas"
  | "updated";

function brl(value: number) {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  });
}

export function AtosProjectsList({ projetos, onSelect }: AtosProjectsListProps) {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("updated");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const enriched = useMemo(() => {
    return projetos.map(p => ({
      projeto: p.projeto,
      lancamentos: p.lancamentos,
      calc: calcularProjeto(p.projeto, p.lancamentos),
    }));
  }, [projetos]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    let list = q
      ? enriched.filter(
          e =>
            e.projeto.nome_projeto.toLowerCase().includes(q) ||
            e.projeto.asana_project_id.includes(q)
        )
      : enriched.slice();

    list.sort((a, b) => {
      let av = 0;
      let bv = 0;
      let asv = "";
      let bsv = "";
      switch (sortKey) {
        case "nome":
          asv = a.projeto.nome_projeto.toLowerCase();
          bsv = b.projeto.nome_projeto.toLowerCase();
          return sortDir === "asc" ? asv.localeCompare(bsv) : bsv.localeCompare(asv);
        case "valor_combinado":
          av = a.calc.valorCombinado;
          bv = b.calc.valorCombinado;
          break;
        case "valor_horas":
          av = a.calc.valorHoras;
          bv = b.calc.valorHoras;
          break;
        case "resultado":
          av = a.calc.valorCombinado > 0 ? a.calc.resultado : -Infinity;
          bv = b.calc.valorCombinado > 0 ? b.calc.resultado : -Infinity;
          break;
        case "horas":
          av = a.calc.totalMinutos;
          bv = b.calc.totalMinutos;
          break;
        case "updated":
          asv = a.projeto.updated_at;
          bsv = b.projeto.updated_at;
          return sortDir === "asc"
            ? asv.localeCompare(bsv)
            : bsv.localeCompare(asv);
      }
      return sortDir === "asc" ? av - bv : bv - av;
    });

    return list;
  }, [enriched, search, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const SortHeader = ({
    label,
    skey,
    align = "left",
  }: {
    label: string;
    skey: SortKey;
    align?: "left" | "right";
  }) => (
    <button
      onClick={() => toggleSort(skey)}
      className={cn(
        "inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors",
        align === "right" && "flex-row-reverse"
      )}
    >
      {label}
      <ArrowUpDown
        className={cn(
          "w-3 h-3",
          sortKey === skey ? "text-primary" : "opacity-40"
        )}
      />
    </button>
  );

  if (projetos.length === 0) return null;

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por nome ou Project ID do Asana..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Tabela */}
      <div className="border border-border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40">
            <tr>
              <th className="text-left px-3 py-2.5">
                <SortHeader label="Projeto" skey="nome" />
              </th>
              <th className="text-right px-3 py-2.5">
                <SortHeader label="Horas" skey="horas" align="right" />
              </th>
              <th className="text-right px-3 py-2.5">
                <SortHeader
                  label="Valor combinado"
                  skey="valor_combinado"
                  align="right"
                />
              </th>
              <th className="text-right px-3 py-2.5">
                <SortHeader label="Valor horas" skey="valor_horas" align="right" />
              </th>
              <th className="text-right px-3 py-2.5">
                <SortHeader label="Resultado" skey="resultado" align="right" />
              </th>
              <th className="w-8"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="text-center py-8 text-sm text-muted-foreground"
                >
                  Nenhum projeto encontrado para "{search}"
                </td>
              </tr>
            ) : (
              filtered.map(({ projeto, calc }) => {
                const Icon =
                  calc.resultado > 0
                    ? TrendingUp
                    : calc.resultado < 0
                      ? TrendingDown
                      : Minus;
                const cor =
                  calc.resultado > 0
                    ? "text-success-foreground"
                    : calc.resultado < 0
                      ? "text-destructive"
                      : "text-muted-foreground";
                const semValor = calc.valorCombinado === 0;
                return (
                  <tr
                    key={projeto.id}
                    onClick={() => onSelect(projeto.id)}
                    className="hover:bg-muted/30 cursor-pointer"
                  >
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-foreground">
                          {projeto.nome_projeto}
                        </p>
                        {projeto.contrato_url && (
                          <Paperclip className="w-3 h-3 text-muted-foreground shrink-0" title="Contrato vinculado" />
                        )}
                        {calc.colaboradoresSemCusto.length > 0 && (
                          <Badge
                            variant="outline"
                            className="text-[10px] border-warning/40 gap-1"
                          >
                            <AlertTriangle className="w-2.5 h-2.5 text-warning-foreground" />
                            {calc.colaboradoresSemCusto.length} sem valor/h
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {calc.porColaborador.length} pessoa
                        {calc.porColaborador.length > 1 ? "s" : ""} ·{" "}
                        {projeto.incluir_nao_billable
                          ? "billable + não-billable"
                          : "só billable"}
                      </p>
                    </td>
                    <td className="px-3 py-3 text-right font-mono text-foreground">
                      {(calc.totalMinutos / 60).toFixed(2)}h
                    </td>
                    <td className="px-3 py-3 text-right font-mono">
                      {semValor ? (
                        <span className="text-warning-foreground text-xs">
                          definir →
                        </span>
                      ) : (
                        <span className="text-foreground">
                          {brl(calc.valorCombinado)}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-right font-mono text-foreground">
                      {brl(calc.valorHoras)}
                    </td>
                    <td className="px-3 py-3 text-right">
                      {semValor ? (
                        <span className="text-muted-foreground text-xs">—</span>
                      ) : (
                        <div className="inline-flex items-center gap-1.5">
                          <Icon className={cn("w-3.5 h-3.5", cor)} />
                          <div className={cn("font-mono text-sm", cor)}>
                            {calc.resultado > 0 ? "+" : ""}
                            {brl(calc.resultado)}
                          </div>
                          <div
                            className={cn(
                              "text-[10px] font-medium ml-1",
                              cor
                            )}
                          >
                            ({calc.resultadoPercent > 0 ? "+" : ""}
                            {calc.resultadoPercent.toFixed(1)}%)
                          </div>
                        </div>
                      )}
                    </td>
                    <td className="px-2 text-muted-foreground">
                      <ChevronRight className="w-4 h-4" />
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-muted-foreground text-center">
        {filtered.length} de {projetos.length} projeto
        {projetos.length > 1 ? "s" : ""}
      </p>
    </div>
  );
}
