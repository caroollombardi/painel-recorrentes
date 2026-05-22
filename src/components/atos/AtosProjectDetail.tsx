import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  X,
  Pencil,
  Trash2,
  TrendingUp,
  TrendingDown,
  Minus,
  AlertTriangle,
  UserPlus,
  Save,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  calcularProjeto,
  updateProjetoValorCombinado,
  updateProjetoIncluirNaoBillable,
  deleteProjeto,
  type AtoLancamentoDB,
  type AtoProjetoDB,
} from "@/lib/atos-parser";
import { toast } from "@/hooks/use-toast";
import { CustomLawyersManager } from "./CustomLawyersManager";

interface AtosProjectDetailProps {
  projeto: AtoProjetoDB;
  lancamentos: AtoLancamentoDB[];
  onClose: () => void;
  onChanged: () => void;
}

function brl(value: number) {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  });
}

function fmtHoras(min: number) {
  const h = min / 60;
  return `${h.toFixed(2)}h`;
}

export function AtosProjectDetail({
  projeto,
  lancamentos,
  onClose,
  onChanged,
}: AtosProjectDetailProps) {
  const [editingValor, setEditingValor] = useState(false);
  const [valorDraft, setValorDraft] = useState(
    String(projeto.valor_combinado || "")
  );
  const [saving, setSaving] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  // Recalcula sempre que projeto ou lancamentos mudarem
  const calc = useMemo(
    () => calcularProjeto(projeto, lancamentos),
    [projeto, lancamentos]
  );

  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, []);

  const handleSaveValor = async () => {
    const num = parseFloat(valorDraft.replace(",", "."));
    if (isNaN(num) || num < 0) {
      toast({ title: "Valor inválido", variant: "destructive" });
      return;
    }
    setSaving(true);
    const r = await updateProjetoValorCombinado(projeto.id, num);
    setSaving(false);
    if (r.success) {
      setEditingValor(false);
      onChanged();
      toast({ title: "Valor combinado atualizado" });
    } else {
      toast({
        title: "Erro ao salvar",
        description: r.error,
        variant: "destructive",
      });
    }
  };

  const handleToggleNaoBillable = async (checked: boolean) => {
    const r = await updateProjetoIncluirNaoBillable(projeto.id, checked);
    if (r.success) {
      onChanged();
    } else {
      toast({
        title: "Erro ao salvar",
        description: r.error,
        variant: "destructive",
      });
    }
  };

  const handleDelete = async () => {
    const r = await deleteProjeto(projeto.id);
    if (r.success) {
      toast({ title: "Projeto removido" });
      onChanged();
      onClose();
    } else {
      toast({
        title: "Erro ao remover",
        description: r.error,
        variant: "destructive",
      });
    }
  };

  // Cor do resultado
  const resultadoCor =
    calc.resultado > 0
      ? "text-success-foreground"
      : calc.resultado < 0
        ? "text-destructive"
        : "text-muted-foreground";
  const ResultadoIcon =
    calc.resultado > 0 ? TrendingUp : calc.resultado < 0 ? TrendingDown : Minus;

  // Top tarefas (por tempo gasto)
  const topTarefas = useMemo(() => {
    const map = new Map<
      string,
      { minutos: number; colaboradores: Set<string>; valor: number }
    >();
    for (const l of lancamentos) {
      if (!projeto.incluir_nao_billable && !l.billable) continue;
      const k = l.tarefa_nome || "Sem tarefa";
      if (!map.has(k))
        map.set(k, { minutos: 0, colaboradores: new Set(), valor: 0 });
      const t = map.get(k)!;
      t.minutos += l.duracao_minutos;
      t.colaboradores.add(l.colaborador_nome);
      const cb = calc.porColaborador.find(c => c.nome === l.colaborador_nome);
      const rate = cb?.custoHora ?? 0;
      t.valor += (l.duracao_minutos / 60) * rate;
    }
    return Array.from(map.entries())
      .map(([nome, d]) => ({ ...d, nome, colaboradores: Array.from(d.colaboradores) }))
      .sort((a, b) => b.minutos - a.minutos);
  }, [lancamentos, projeto.incluir_nao_billable, calc.porColaborador]);

  const modal = (
    <div
      className="fixed inset-0 z-[9998] isolate flex items-center justify-center bg-background/80 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="relative z-10 mx-4 flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between p-6 border-b border-border gap-3">
          <div className="min-w-0">
            <h2 className="text-xl font-display font-semibold text-foreground truncate">
              {projeto.nome_projeto}
            </h2>
            <p className="text-xs text-muted-foreground mt-1 font-mono">
              Asana ID: {projeto.asana_project_id}
            </p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Hero: resultado */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="p-4 bg-muted/30 border border-border rounded-lg">
              <p className="text-xs text-muted-foreground mb-1">
                Valor combinado (contrato)
              </p>
              {editingValor ? (
                <div className="flex gap-2 items-center mt-1">
                  <span className="text-sm text-foreground">R$</span>
                  <Input
                    type="number"
                    step="0.01"
                    value={valorDraft}
                    onChange={e => setValorDraft(e.target.value)}
                    className="h-8 text-sm"
                    autoFocus
                  />
                  <Button
                    size="sm"
                    className="h-8 px-2"
                    onClick={handleSaveValor}
                    disabled={saving}
                  >
                    <Save className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 px-2"
                    onClick={() => {
                      setEditingValor(false);
                      setValorDraft(String(projeto.valor_combinado || ""));
                    }}
                  >
                    <X className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <p className="text-lg font-bold text-foreground">
                    {brl(calc.valorCombinado)}
                  </p>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    onClick={() => setEditingValor(true)}
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                </div>
              )}
              {calc.valorCombinado === 0 && !editingValor && (
                <p className="text-xs text-warning-foreground mt-1">
                  ⚠ defina o valor pra ver o resultado
                </p>
              )}
            </div>

            <div className="p-4 bg-muted/30 border border-border rounded-lg">
              <p className="text-xs text-muted-foreground mb-1">
                Valor por horas trabalhadas
              </p>
              <p className="text-lg font-bold text-foreground">
                {brl(calc.valorHoras)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {fmtHoras(calc.totalMinutos)} ·{" "}
                {calc.porColaborador.length} pessoa
                {calc.porColaborador.length > 1 ? "s" : ""}
              </p>
            </div>

            <div
              className={cn(
                "p-4 border rounded-lg",
                calc.resultado > 0 && "bg-success/5 border-success/30",
                calc.resultado < 0 && "bg-destructive/5 border-destructive/30",
                calc.resultado === 0 && "bg-muted/30 border-border"
              )}
            >
              <p className="text-xs text-muted-foreground mb-1">
                Resultado vs horas
              </p>
              <div className="flex items-center gap-2">
                <ResultadoIcon className={cn("w-5 h-5", resultadoCor)} />
                <p className={cn("text-lg font-bold", resultadoCor)}>
                  {calc.resultado > 0 ? "+" : ""}
                  {brl(calc.resultado)}
                </p>
              </div>
              {calc.valorCombinado > 0 && (
                <p className={cn("text-xs mt-1", resultadoCor)}>
                  {calc.resultadoPercent > 0 ? "+" : ""}
                  {calc.resultadoPercent.toFixed(1)}% sobre o combinado
                </p>
              )}
            </div>
          </div>

          {/* Alerta colaboradores sem custo */}
          {calc.colaboradoresSemCusto.length > 0 && (
            <div className="p-3 bg-warning/10 border border-warning/30 rounded-lg flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-foreground">
                  <AlertTriangle className="w-3.5 h-3.5 text-warning-foreground" />
                  <span className="text-xs font-semibold">
                    {calc.colaboradoresSemCusto.length} colaborador(es) sem
                    valor/hora — horas contam como R$ 0,00
                  </span>
                </div>
                <div className="flex flex-wrap gap-1 mt-2">
                  {calc.colaboradoresSemCusto.map(n => (
                    <Badge
                      key={n}
                      variant="outline"
                      className="text-xs border-warning/40"
                    >
                      {n}
                    </Badge>
                  ))}
                </div>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 shrink-0"
                onClick={() => setCustomOpen(true)}
              >
                <UserPlus className="w-3.5 h-3.5" />
                Cadastrar
              </Button>
            </div>
          )}

          {/* Toggle não-billable */}
          <div className="flex items-center justify-between p-3 bg-muted/20 border border-border rounded-lg">
            <div>
              <Label
                htmlFor="toggle-nb"
                className="text-sm font-medium text-foreground cursor-pointer"
              >
                Incluir horas não-billable no cálculo
              </Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                Quando ligado: horas marcadas como{" "}
                <code className="text-foreground">nonBillable</code> entram no
                valor. Útil pra contabilizar alinhamentos internos como custo do
                ato.
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Billable: {fmtHoras(calc.totalMinutosBillable)} · Não-billable:{" "}
                {fmtHoras(calc.totalMinutosNaoBillable)}
              </p>
            </div>
            <Switch
              id="toggle-nb"
              checked={projeto.incluir_nao_billable}
              onCheckedChange={handleToggleNaoBillable}
            />
          </div>

          {/* Breakdown por colaborador */}
          <section>
            <h3 className="text-sm font-semibold text-foreground mb-2">
              Custo por colaborador
            </h3>
            <p className="text-xs text-muted-foreground mb-3">
              Útil pra entender se o projeto está caro porque um sênior pegou
              tarefas que poderiam ter sido de júnior.
            </p>
            <div className="border border-border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground text-xs">
                      Colaborador
                    </th>
                    <th className="text-right px-3 py-2 font-medium text-muted-foreground text-xs">
                      Horas
                    </th>
                    <th className="text-right px-3 py-2 font-medium text-muted-foreground text-xs">
                      R$/h
                    </th>
                    <th className="text-right px-3 py-2 font-medium text-muted-foreground text-xs">
                      Valor
                    </th>
                    <th className="text-right px-3 py-2 font-medium text-muted-foreground text-xs">
                      % do total
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {calc.porColaborador.map(c => (
                    <tr key={c.nome} className="hover:bg-muted/20">
                      <td className="px-3 py-2">
                        <span className="text-foreground">{c.nome}</span>
                        {!c.temCusto && (
                          <Badge
                            variant="outline"
                            className="ml-2 text-[10px] border-warning/40"
                          >
                            sem valor/hora
                          </Badge>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-foreground">
                        {fmtHoras(c.totalMinutos)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-muted-foreground">
                        {c.custoHora > 0 ? `R$ ${c.custoHora}` : "—"}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-foreground">
                        {brl(c.valorTotal)}
                      </td>
                      <td className="px-3 py-2 text-right text-muted-foreground text-xs">
                        {calc.valorHoras > 0
                          ? ((c.valorTotal / calc.valorHoras) * 100).toFixed(1)
                          : "0"}
                        %
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-muted/30">
                  <tr>
                    <td className="px-3 py-2 text-xs font-semibold text-foreground">
                      Total
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs font-semibold text-foreground">
                      {fmtHoras(calc.totalMinutos)}
                    </td>
                    <td className="px-3 py-2"></td>
                    <td className="px-3 py-2 text-right font-mono text-xs font-semibold text-foreground">
                      {brl(calc.valorHoras)}
                    </td>
                    <td className="px-3 py-2 text-right text-xs text-muted-foreground">
                      100%
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>

          {/* Top tarefas */}
          {topTarefas.length > 0 && (
            <section>
              <h3 className="text-sm font-semibold text-foreground mb-2">
                Tarefas ordenadas por tempo gasto
              </h3>
              <div className="border border-border rounded-lg overflow-hidden max-h-80 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50 sticky top-0">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground">
                        Tarefa
                      </th>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground">
                        Quem
                      </th>
                      <th className="text-right px-3 py-2 font-medium text-muted-foreground">
                        Horas
                      </th>
                      <th className="text-right px-3 py-2 font-medium text-muted-foreground">
                        Valor
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {topTarefas.map((t, i) => (
                      <tr key={i} className="hover:bg-muted/20">
                        <td
                          className="px-3 py-2 text-foreground max-w-xs truncate"
                          title={t.nome}
                        >
                          {t.nome}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {t.colaboradores.join(", ")}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-foreground">
                          {fmtHoras(t.minutos)}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-foreground">
                          {brl(t.valor)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </div>

        {/* Footer */}
        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-border bg-card p-4">
          {confirmingDelete ? (
            <div className="flex items-center gap-2">
              <p className="text-xs text-destructive">
                Confirma remover o projeto e todos os lançamentos?
              </p>
              <Button
                size="sm"
                variant="destructive"
                onClick={handleDelete}
                className="gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Sim, remover
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setConfirmingDelete(false)}
              >
                Cancelar
              </Button>
            </div>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setConfirmingDelete(true)}
              className="text-destructive hover:bg-destructive/10 hover:text-destructive gap-1.5"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Remover projeto
            </Button>
          )}
          <Button variant="outline" onClick={onClose}>
            Fechar
          </Button>
        </div>
      </div>

      <CustomLawyersManager
        open={customOpen}
        onClose={() => setCustomOpen(false)}
        onChanged={onChanged}
        suggestedNames={calc.colaboradoresSemCusto}
      />
    </div>
  );

  return typeof document !== "undefined"
    ? createPortal(modal, document.body)
    : null;
}
