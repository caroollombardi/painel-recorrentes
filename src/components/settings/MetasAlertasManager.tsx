import { useState, useEffect, useCallback } from "react";
import { Target, Loader2, Save, Pencil, RotateCcw, BellOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

// Tabelas novas ainda fora do types.ts gerado. Apagar quando regerar os tipos.
const db = supabase as any;

const ACCENT = "#FB7435";

interface Regra {
  cliente_id: string;
  threshold_attention: number | null;
  threshold_risk: number | null;
  threshold_overflow: number | null;
  meta_margem: number | null;
  meta_horas_mes: number | null;
  alertas_ativos: boolean;
}

interface Cliente {
  id: string;
  nome: string;
  ativo: boolean;
  cliente_alertas: Regra[];
}

interface Padrao {
  threshold_attention: number;
  threshold_risk: number;
  threshold_overflow: number;
}

const PADRAO_FALLBACK: Padrao = {
  threshold_attention: 60, threshold_risk: 80, threshold_overflow: 100,
};

const regraDe = (c: Cliente): Regra | null => c.cliente_alertas?.[0] ?? null;

const temPersonalizacao = (r: Regra | null) =>
  !!r && (
    r.threshold_attention !== null || r.threshold_risk !== null ||
    r.threshold_overflow !== null || r.meta_margem !== null ||
    r.meta_horas_mes !== null || r.alertas_ativos === false
  );

const vazioParaNulo = (s: string) => {
  const t = s.trim();
  if (!t) return null;
  const n = parseFloat(t.replace(",", "."));
  return isNaN(n) ? null : n;
};

export default function MetasAlertasManager() {
  const { toast } = useToast();
  const { isAdmin, hasRole } = useAuth();
  const podeGerir = isAdmin || hasRole("socio") || hasRole("gestao");

  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [padrao, setPadrao] = useState<Padrao>(PADRAO_FALLBACK);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [aberto, setAberto] = useState(false);
  const [alvo, setAlvo] = useState<Cliente | null>(null);
  const [form, setForm] = useState({
    threshold_attention: "", threshold_risk: "", threshold_overflow: "",
    meta_horas_mes: "", meta_margem: "", alertas_ativos: true,
  });

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const { data: globais } = await supabase
        .from("alert_settings")
        .select("threshold_attention, threshold_risk, threshold_overflow")
        .maybeSingle();
      if (globais) setPadrao(globais as Padrao);

      const { data, error } = await db
        .from("clientes")
        .select("id, nome, ativo, cliente_alertas(cliente_id, threshold_attention, threshold_risk, threshold_overflow, meta_margem, meta_horas_mes, alertas_ativos)")
        .eq("ativo", true)
        .order("nome");
      if (error) throw error;
      setClientes((data ?? []) as Cliente[]);
    } catch (err: any) {
      console.error("Erro ao carregar metas:", err);
      toast({
        title: "Não foi possível carregar as metas",
        description: err?.message ?? "Verifique sua conexão e tente de novo.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { carregar(); }, [carregar]);

  const abrirEdicao = (c: Cliente) => {
    const r = regraDe(c);
    setAlvo(c);
    setForm({
      threshold_attention: r?.threshold_attention != null ? String(r.threshold_attention) : "",
      threshold_risk: r?.threshold_risk != null ? String(r.threshold_risk) : "",
      threshold_overflow: r?.threshold_overflow != null ? String(r.threshold_overflow) : "",
      meta_horas_mes: r?.meta_horas_mes != null ? String(r.meta_horas_mes) : "",
      meta_margem: r?.meta_margem != null ? String(r.meta_margem) : "",
      alertas_ativos: r?.alertas_ativos ?? true,
    });
    setAberto(true);
  };

  const salvar = async () => {
    if (!alvo) return;

    const atencao = vazioParaNulo(form.threshold_attention);
    const risco = vazioParaNulo(form.threshold_risk);
    const estouro = vazioParaNulo(form.threshold_overflow);

    // Vale o que foi preenchido; o resto herda o global.
    const efetivoAtencao = atencao ?? padrao.threshold_attention;
    const efetivoRisco = risco ?? padrao.threshold_risk;
    const efetivoEstouro = estouro ?? padrao.threshold_overflow;

    if (!(efetivoAtencao < efetivoRisco && efetivoRisco < efetivoEstouro)) {
      return toast({
        title: "Os limites estão fora de ordem",
        description: `Atenção (${efetivoAtencao}%) precisa ser menor que risco (${efetivoRisco}%), e risco menor que estouro (${efetivoEstouro}%). Considerando também os valores herdados do padrão.`,
        variant: "destructive",
      });
    }

    setSaving(true);
    try {
      const { error } = await db.from("cliente_alertas").upsert({
        cliente_id: alvo.id,
        threshold_attention: atencao,
        threshold_risk: risco,
        threshold_overflow: estouro,
        meta_horas_mes: vazioParaNulo(form.meta_horas_mes),
        meta_margem: vazioParaNulo(form.meta_margem),
        alertas_ativos: form.alertas_ativos,
      }, { onConflict: "cliente_id" });
      if (error) throw error;

      toast({ title: "Regras salvas", description: `${alvo.nome} atualizado.` });
      setAberto(false);
      await carregar();
    } catch (err: any) {
      toast({
        title: "Não foi possível salvar",
        description: err?.message ?? "Tente de novo.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const voltarAoPadrao = async (c: Cliente) => {
    setSaving(true);
    try {
      const { error } = await db.from("cliente_alertas").delete().eq("cliente_id", c.id);
      if (error) throw error;
      toast({
        title: "Voltou ao padrão",
        description: `${c.nome} passa a seguir os limites gerais de novo.`,
      });
      await carregar();
    } catch (err: any) {
      toast({
        title: "Não foi possível reverter",
        description: err?.message ?? "Tente de novo.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const personalizados = clientes.filter(c => temPersonalizacao(regraDe(c)));
  const silenciados = clientes.filter(c => regraDe(c)?.alertas_ativos === false);

  const celula = (proprio: number | null, herdado: number) =>
    proprio !== null
      ? <span className="font-medium">{proprio}%</span>
      : <span className="text-muted-foreground">{herdado}%</span>;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Como os limites funcionam</CardTitle>
          <CardDescription>
            Todo cliente segue os limites gerais da aba Limites — atenção em {padrao.threshold_attention}%,
            risco em {padrao.threshold_risk}% e estouro em {padrao.threshold_overflow}% do crédito consumido.
            Preencha um campo aqui só quando o cliente precisar de uma régua diferente; deixando em branco, ele herda o geral.
            Valores em cinza são herdados.
          </CardDescription>
        </CardHeader>
        {(personalizados.length > 0 || silenciados.length > 0) && (
          <CardContent className="pt-0 text-sm text-muted-foreground">
            {personalizados.length} de {clientes.length} clientes com regra própria
            {silenciados.length > 0 && `, ${silenciados.length} com alertas desligados`}.
          </CardContent>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="w-5 h-5" />
            Metas e alertas por cliente
          </CardTitle>
          <CardDescription>
            Limites de consumo, meta de horas e meta de margem de cada conta.
          </CardDescription>
        </CardHeader>

        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin" />
              Carregando...
            </div>
          ) : clientes.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              Nenhum cliente ativo. Cadastre na aba Clientes primeiro.
            </div>
          ) : (
            <div className="rounded-lg border border-border overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium">Cliente</th>
                    <th className="text-right px-4 py-3 font-medium">Atenção</th>
                    <th className="text-right px-4 py-3 font-medium">Risco</th>
                    <th className="text-right px-4 py-3 font-medium">Estouro</th>
                    <th className="text-right px-4 py-3 font-medium">Meta de horas</th>
                    <th className="text-right px-4 py-3 font-medium">Meta de margem</th>
                    <th className="px-4 py-3 w-28" />
                  </tr>
                </thead>
                <tbody>
                  {clientes.map(c => {
                    const r = regraDe(c);
                    const proprio = temPersonalizacao(r);
                    return (
                      <tr key={c.id} className="border-t border-border hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-3">
                          <span className="font-medium">{c.nome}</span>
                          {proprio && <Badge variant="outline" className="ml-2">regra própria</Badge>}
                          {r?.alertas_ativos === false && (
                            <Badge variant="secondary" className="ml-2">
                              <BellOff className="w-3 h-3 mr-1" />
                              alertas off
                            </Badge>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">{celula(r?.threshold_attention ?? null, padrao.threshold_attention)}</td>
                        <td className="px-4 py-3 text-right">{celula(r?.threshold_risk ?? null, padrao.threshold_risk)}</td>
                        <td className="px-4 py-3 text-right">{celula(r?.threshold_overflow ?? null, padrao.threshold_overflow)}</td>
                        <td className="px-4 py-3 text-right text-muted-foreground">
                          {r?.meta_horas_mes != null ? `${r.meta_horas_mes}h` : "—"}
                        </td>
                        <td className="px-4 py-3 text-right text-muted-foreground">
                          {r?.meta_margem != null ? `${r.meta_margem}%` : "—"}
                        </td>
                        <td className="px-4 py-3">
                          {podeGerir && (
                            <div className="flex items-center gap-1 justify-end">
                              <Button variant="ghost" size="icon" onClick={() => abrirEdicao(c)} aria-label={`Editar regras de ${c.nome}`}>
                                <Pencil className="w-4 h-4 text-muted-foreground" />
                              </Button>
                              {proprio && (
                                <Button
                                  variant="ghost" size="icon" disabled={saving}
                                  onClick={() => voltarAoPadrao(c)}
                                  aria-label={`Voltar ${c.nome} ao padrão`}
                                  title="Voltar ao padrão"
                                >
                                  <RotateCcw className="w-4 h-4 text-muted-foreground" />
                                </Button>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{alvo ? `Regras de ${alvo.nome}` : "Regras"}</DialogTitle>
            <DialogDescription>
              Campo em branco herda o limite geral. Preencha só o que precisa ser diferente.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label htmlFor="ma-at">Atenção (%)</Label>
                <Input
                  id="ma-at" type="number" min="0" max="500"
                  placeholder={String(padrao.threshold_attention)}
                  value={form.threshold_attention}
                  onChange={e => setForm(f => ({ ...f, threshold_attention: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ma-ri">Risco (%)</Label>
                <Input
                  id="ma-ri" type="number" min="0" max="500"
                  placeholder={String(padrao.threshold_risk)}
                  value={form.threshold_risk}
                  onChange={e => setForm(f => ({ ...f, threshold_risk: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ma-es">Estouro (%)</Label>
                <Input
                  id="ma-es" type="number" min="0" max="500"
                  placeholder={String(padrao.threshold_overflow)}
                  value={form.threshold_overflow}
                  onChange={e => setForm(f => ({ ...f, threshold_overflow: e.target.value }))}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="ma-horas">Meta de horas por mês</Label>
                <Input
                  id="ma-horas" type="number" min="0" step="0.5"
                  placeholder="sem meta"
                  value={form.meta_horas_mes}
                  onChange={e => setForm(f => ({ ...f, meta_horas_mes: e.target.value }))}
                />
                <p className="text-xs text-muted-foreground">Quanto se espera consumir por mês nessa conta.</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="ma-margem">Meta de margem (%)</Label>
                <Input
                  id="ma-margem" type="number" min="0" max="100" step="1"
                  placeholder="sem meta"
                  value={form.meta_margem}
                  onChange={e => setForm(f => ({ ...f, meta_margem: e.target.value }))}
                />
                <p className="text-xs text-muted-foreground">Margem alvo entre o que é pago e o custo das horas.</p>
              </div>
            </div>

            <div className="flex items-center justify-between rounded-md border border-border p-3">
              <div>
                <Label htmlFor="ma-ativos">Receber alertas deste cliente</Label>
                <p className="text-xs text-muted-foreground mt-1">
                  Desligar silencia as notificações sem apagar os limites.
                </p>
              </div>
              <Switch
                id="ma-ativos" checked={form.alertas_ativos}
                onCheckedChange={v => setForm(f => ({ ...f, alertas_ativos: v }))}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAberto(false)}>Cancelar</Button>
            <Button onClick={salvar} style={{ backgroundColor: ACCENT }} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
              {saving ? "Salvando..." : "Salvar regras"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
