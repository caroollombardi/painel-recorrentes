import { useState, useEffect, useCallback, Fragment } from "react";
import {
  Plus, Pencil, Save, Users, Loader2, TrendingUp, History,
  ChevronDown, ChevronRight, AlertTriangle, UserPlus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

// As tabelas de cadastro ainda não estão no types.ts gerado.
// Centralizado aqui para ser removido de uma vez quando os tipos forem regerados.
const db = supabase as any;

const ACCENT = "#FB7435";

const fmtMoeda = (v: number | null) =>
  v === null || v === undefined
    ? "—"
    : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const fmtData = (d: string | null) => {
  if (!d) return "—";
  const [a, m, dia] = d.split("-");
  return `${dia}/${m}/${a}`;
};

const hoje = () => new Date().toISOString().slice(0, 10);

interface Taxa {
  id: string;
  valor_hora: number;
  vigencia_inicio: string;
  vigencia_fim: string | null;
  motivo: string | null;
}

interface Membro {
  id: string;
  nome: string;
  cargo: string;
  area: string | null;
  apelidos: string[];
  ativo: boolean;
  data_entrada: string | null;
  equipe_taxas: Taxa[];
}

interface Orfao {
  valor: string;
  lancamentos: number;
}

const taxaVigente = (m: Membro): Taxa | null =>
  m.equipe_taxas?.find(t => t.vigencia_fim === null) ?? null;

const historico = (m: Membro): Taxa[] =>
  [...(m.equipe_taxas ?? [])].sort((a, b) =>
    b.vigencia_inicio.localeCompare(a.vigencia_inicio));

export default function EquipeManager() {
  const { toast } = useToast();
  const { isAdmin, hasRole } = useAuth();
  const podeGerir = isAdmin || hasRole("socio") || hasRole("gestao");

  const [membros, setMembros] = useState<Membro[]>([]);
  const [orfaos, setOrfaos] = useState<Orfao[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [expandido, setExpandido] = useState<string | null>(null);

  const [cadastroAberto, setCadastroAberto] = useState(false);
  const [editando, setEditando] = useState<Membro | null>(null);
  const [form, setForm] = useState({
    nome: "", cargo: "", area: "", apelidos: "",
    data_entrada: "", valor_hora: "", vigencia_inicio: hoje(), ativo: true,
  });

  const [reajusteAberto, setReajusteAberto] = useState(false);
  const [alvo, setAlvo] = useState<Membro | null>(null);
  const [reajuste, setReajuste] = useState({ valor_hora: "", vigencia_inicio: hoje(), motivo: "" });

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await db
        .from("equipe")
        .select("id, nome, cargo, area, apelidos, ativo, data_entrada, equipe_taxas(id, valor_hora, vigencia_inicio, vigencia_fim, motivo)")
        .order("nome");
      if (error) throw error;
      setMembros((data ?? []) as Membro[]);

      const { data: orf } = await db
        .from("vw_cadastros_orfaos")
        .select("valor, lancamentos")
        .eq("tipo", "assignee")
        .order("lancamentos", { ascending: false });
      setOrfaos((orf ?? []) as Orfao[]);
    } catch (err: any) {
      console.error("Erro ao carregar equipe:", err);
      toast({
        title: "Não foi possível carregar a equipe",
        description: err?.message ?? "Verifique sua conexão e tente de novo.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { carregar(); }, [carregar]);

  const abrirCadastro = (nomePreenchido?: string) => {
    setEditando(null);
    setForm({
      nome: nomePreenchido ?? "", cargo: "", area: "", apelidos: "",
      data_entrada: "", valor_hora: "", vigencia_inicio: hoje(), ativo: true,
    });
    setCadastroAberto(true);
  };

  const abrirEdicao = (m: Membro) => {
    setEditando(m);
    setForm({
      nome: m.nome, cargo: m.cargo, area: m.area ?? "",
      apelidos: (m.apelidos ?? []).join(", "),
      data_entrada: m.data_entrada ?? "",
      valor_hora: "", vigencia_inicio: hoje(), ativo: m.ativo,
    });
    setCadastroAberto(true);
  };

  const salvarCadastro = async () => {
    const nome = form.nome.trim();
    const cargo = form.cargo.trim();
    if (!nome) return toast({ title: "Informe o nome", description: "O nome precisa bater com o que vem do EasyJur.", variant: "destructive" });
    if (!cargo) return toast({ title: "Informe o cargo", description: "O cargo é usado nos relatórios por senioridade.", variant: "destructive" });

    const apelidos = form.apelidos.split(",").map(a => a.trim()).filter(Boolean);
    setSaving(true);
    try {
      if (editando) {
        const { error } = await db.from("equipe").update({
          cargo, area: form.area.trim() || null, apelidos,
          data_entrada: form.data_entrada || null, ativo: form.ativo,
        }).eq("id", editando.id);
        if (error) throw error;
        toast({ title: "Cadastro atualizado", description: `${nome} foi atualizado.` });
      } else {
        const valor = parseFloat(form.valor_hora.replace(",", "."));
        if (isNaN(valor) || valor < 0) {
          setSaving(false);
          return toast({ title: "Valor/hora inválido", description: "Informe um valor. Use 0 para quem não é faturável.", variant: "destructive" });
        }
        const { data: novo, error } = await db.from("equipe").insert({
          nome, cargo, area: form.area.trim() || null, apelidos,
          data_entrada: form.data_entrada || null, ativo: form.ativo,
        }).select("id").single();
        if (error) throw error;

        const { error: erroTaxa } = await db.from("equipe_taxas").insert({
          membro_id: novo.id, valor_hora: valor,
          vigencia_inicio: form.vigencia_inicio, motivo: "Cadastro inicial",
        });
        if (erroTaxa) throw erroTaxa;
        toast({ title: "Pessoa cadastrada", description: `${nome} entrou na equipe com ${fmtMoeda(valor)}/hora.` });
      }
      setCadastroAberto(false);
      await carregar();
    } catch (err: any) {
      const duplicado = err?.code === "23505";
      toast({
        title: duplicado ? "Esse nome já existe" : "Não foi possível salvar",
        description: duplicado
          ? "Já há alguém cadastrado com esse nome. Use o campo de apelidos para variações de grafia."
          : err?.message ?? "Tente de novo.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const abrirReajuste = (m: Membro) => {
    setAlvo(m);
    setReajuste({ valor_hora: "", vigencia_inicio: hoje(), motivo: "" });
    setReajusteAberto(true);
  };

  const salvarReajuste = async () => {
    if (!alvo) return;
    const valor = parseFloat(reajuste.valor_hora.replace(",", "."));
    if (isNaN(valor) || valor < 0) {
      return toast({ title: "Valor inválido", description: "Informe o novo valor por hora.", variant: "destructive" });
    }
    const atual = taxaVigente(alvo);
    if (atual && reajuste.vigencia_inicio <= atual.vigencia_inicio) {
      return toast({
        title: "Data anterior à vigência atual",
        description: `O valor atual vale desde ${fmtData(atual.vigencia_inicio)}. O reajuste precisa começar depois disso.`,
        variant: "destructive",
      });
    }

    setSaving(true);
    try {
      const { error } = await db.rpc("registrar_taxa", {
        _membro_id: alvo.id,
        _valor_hora: valor,
        _vigencia_inicio: reajuste.vigencia_inicio,
        _motivo: reajuste.motivo.trim() || null,
      });
      if (error) throw error;
      toast({
        title: "Reajuste registrado",
        description: `${alvo.nome} passa a ${fmtMoeda(valor)}/hora a partir de ${fmtData(reajuste.vigencia_inicio)}. Os lançamentos anteriores continuam com o valor antigo.`,
      });
      setReajusteAberto(false);
      await carregar();
    } catch (err: any) {
      toast({
        title: "Não foi possível registrar",
        description: err?.message ?? "Tente de novo.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const semTaxa = membros.filter(m => m.ativo && !taxaVigente(m));

  return (
    <div className="space-y-4">
      {/* Pendências: gente lançando horas sem cadastro */}
      {!loading && (orfaos.length > 0 || semTaxa.length > 0) && (
        <Card className="border-warning/40">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="w-4 h-4 text-warning" />
              Horas lançadas sem valor
            </CardTitle>
            <CardDescription>
              Esses lançamentos entram no painel valendo zero até o cadastro existir.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {orfaos.map(o => (
              <div key={o.valor} className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                <div>
                  <span className="font-medium">{o.valor}</span>
                  <span className="text-muted-foreground text-sm ml-2">
                    {o.lancamentos} lançamento{o.lancamentos !== 1 ? "s" : ""} sem cadastro
                  </span>
                </div>
                {podeGerir && (
                  <Button size="sm" variant="outline" onClick={() => abrirCadastro(o.valor)}>
                    <UserPlus className="w-4 h-4 mr-2" />
                    Cadastrar
                  </Button>
                )}
              </div>
            ))}
            {semTaxa.map(m => (
              <div key={m.id} className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                <div>
                  <span className="font-medium">{m.nome}</span>
                  <span className="text-muted-foreground text-sm ml-2">cadastrado, mas sem valor/hora vigente</span>
                </div>
                {podeGerir && (
                  <Button size="sm" variant="outline" onClick={() => abrirReajuste(m)}>
                    Definir valor
                  </Button>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-row items-start justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Users className="w-5 h-5" />
              Equipe
            </CardTitle>
            <CardDescription>
              Valores por hora com histórico. Um reajuste cria uma nova vigência e não altera o que já foi lançado.
            </CardDescription>
          </div>
          {podeGerir && (
            <Button onClick={() => abrirCadastro()} style={{ backgroundColor: ACCENT }} className="shrink-0" disabled={loading}>
              <Plus className="w-4 h-4 mr-2" />
              Nova pessoa
            </Button>
          )}
        </CardHeader>

        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin" />
              Carregando equipe...
            </div>
          ) : membros.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <p>Ninguém cadastrado ainda.</p>
              {podeGerir && (
                <Button variant="outline" className="mt-3" onClick={() => abrirCadastro()}>
                  Cadastrar a primeira pessoa
                </Button>
              )}
            </div>
          ) : (
            <div className="rounded-lg border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="w-8 px-2 py-3" />
                    <th className="text-left px-4 py-3 font-medium">Nome</th>
                    <th className="text-left px-4 py-3 font-medium">Cargo</th>
                    <th className="text-left px-4 py-3 font-medium">Área</th>
                    <th className="text-right px-4 py-3 font-medium">Valor/hora</th>
                    <th className="text-left px-4 py-3 font-medium">Desde</th>
                    <th className="px-4 py-3 w-28" />
                  </tr>
                </thead>
                <tbody>
                  {membros.map(m => {
                    const vigente = taxaVigente(m);
                    const aberto = expandido === m.id;
                    const hist = historico(m);
                    return (
                      <Fragment key={m.id}>
                        <tr className="border-t border-border hover:bg-muted/30 transition-colors">
                          <td className="px-2 py-3">
                            {hist.length > 1 && (
                              <button
                                onClick={() => setExpandido(aberto ? null : m.id)}
                                className="text-muted-foreground hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring rounded"
                                aria-label={aberto ? "Ocultar histórico" : "Ver histórico"}
                              >
                                {aberto ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                              </button>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <span className="font-medium">{m.nome}</span>
                            {!m.ativo && <Badge variant="secondary" className="ml-2">Inativo</Badge>}
                            {m.apelidos?.length > 0 && (
                              <p className="text-xs text-muted-foreground mt-0.5">
                                também importado como {m.apelidos.join(", ")}
                              </p>
                            )}
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">{m.cargo}</td>
                          <td className="px-4 py-3 text-muted-foreground">{m.area ?? "—"}</td>
                          <td className="px-4 py-3 text-right font-medium">
                            {vigente ? fmtMoeda(vigente.valor_hora) : <span className="text-warning">sem valor</span>}
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {vigente ? fmtData(vigente.vigencia_inicio) : "—"}
                            {hist.length > 1 && (
                              <span className="text-xs ml-2">
                                <History className="w-3 h-3 inline mr-1" />
                                {hist.length} vigências
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            {podeGerir && (
                              <div className="flex items-center gap-1 justify-end">
                                <Button variant="ghost" size="icon" onClick={() => abrirReajuste(m)} aria-label={`Registrar reajuste de ${m.nome}`}>
                                  <TrendingUp className="w-4 h-4 text-muted-foreground" />
                                </Button>
                                <Button variant="ghost" size="icon" onClick={() => abrirEdicao(m)} aria-label={`Editar ${m.nome}`}>
                                  <Pencil className="w-4 h-4 text-muted-foreground" />
                                </Button>
                              </div>
                            )}
                          </td>
                        </tr>
                        {aberto && (
                          <tr className="bg-muted/20 border-t border-border">
                            <td />
                            <td colSpan={6} className="px-4 py-3">
                              <p className="text-xs text-muted-foreground mb-2">Histórico de valores</p>
                              <div className="space-y-1">
                                {hist.map(t => (
                                  <div key={t.id} className="flex items-center gap-3 text-sm">
                                    <span className="font-medium w-28">{fmtMoeda(t.valor_hora)}</span>
                                    <span className="text-muted-foreground">
                                      {fmtData(t.vigencia_inicio)} a {t.vigencia_fim ? fmtData(t.vigencia_fim) : "hoje"}
                                    </span>
                                    {t.motivo && <span className="text-muted-foreground text-xs">· {t.motivo}</span>}
                                  </div>
                                ))}
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Cadastro / edição */}
      <Dialog open={cadastroAberto} onOpenChange={setCadastroAberto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editando ? `Editar ${editando.nome}` : "Nova pessoa"}</DialogTitle>
            {!editando && (
              <DialogDescription>
                O nome precisa ser igual ao que vem do EasyJur, senão as horas não encontram a pessoa.
              </DialogDescription>
            )}
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="eq-nome">Nome</Label>
              <Input
                id="eq-nome"
                value={form.nome}
                onChange={e => setForm(f => ({ ...f, nome: e.target.value }))}
                disabled={!!editando}
                placeholder="Ex: Maria Silva"
              />
              {editando && (
                <p className="text-xs text-muted-foreground">
                  O nome não muda, para não perder o vínculo com as horas já lançadas.
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="eq-cargo">Cargo</Label>
                <Input
                  id="eq-cargo"
                  value={form.cargo}
                  onChange={e => setForm(f => ({ ...f, cargo: e.target.value }))}
                  placeholder="Ex: Adv. Pleno 2"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="eq-area">Área</Label>
                <Input
                  id="eq-area"
                  value={form.area}
                  onChange={e => setForm(f => ({ ...f, area: e.target.value }))}
                  placeholder="Ex: Societário"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="eq-apelidos">Outras grafias</Label>
              <Input
                id="eq-apelidos"
                value={form.apelidos}
                onChange={e => setForm(f => ({ ...f, apelidos: e.target.value }))}
                placeholder="Separe por vírgula"
              />
              <p className="text-xs text-muted-foreground">
                Como o nome aparece no EasyJur ou no Asana quando está escrito diferente.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="eq-entrada">Entrou no time em</Label>
              <Input
                id="eq-entrada"
                type="date"
                value={form.data_entrada}
                onChange={e => setForm(f => ({ ...f, data_entrada: e.target.value }))}
              />
            </div>

            {!editando && (
              <div className="grid grid-cols-2 gap-3 rounded-md border border-border p-3">
                <div className="space-y-2">
                  <Label htmlFor="eq-valor">Valor por hora (R$)</Label>
                  <Input
                    id="eq-valor"
                    type="number" min="0" step="0.01"
                    value={form.valor_hora}
                    onChange={e => setForm(f => ({ ...f, valor_hora: e.target.value }))}
                    placeholder="Ex: 450.00"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="eq-vig">Valendo desde</Label>
                  <Input
                    id="eq-vig"
                    type="date"
                    value={form.vigencia_inicio}
                    onChange={e => setForm(f => ({ ...f, vigencia_inicio: e.target.value }))}
                  />
                </div>
                <p className="text-xs text-muted-foreground col-span-2">
                  Horas lançadas antes dessa data ficam valendo zero. Use a data do primeiro apontamento.
                </p>
              </div>
            )}

            {editando && (
              <div className="flex items-center justify-between rounded-md border border-border p-3">
                <div>
                  <Label htmlFor="eq-ativo">Ativo no time</Label>
                  <p className="text-xs text-muted-foreground mt-1">
                    Desativar mantém todo o histórico e tira a pessoa das pendências.
                  </p>
                </div>
                <Switch
                  id="eq-ativo"
                  checked={form.ativo}
                  onCheckedChange={v => setForm(f => ({ ...f, ativo: v }))}
                />
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCadastroAberto(false)}>Cancelar</Button>
            <Button onClick={salvarCadastro} style={{ backgroundColor: ACCENT }} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
              {saving ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reajuste */}
      <Dialog open={reajusteAberto} onOpenChange={setReajusteAberto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registrar reajuste</DialogTitle>
            <DialogDescription>
              {alvo && taxaVigente(alvo)
                ? `${alvo.nome} está em ${fmtMoeda(taxaVigente(alvo)!.valor_hora)}/hora desde ${fmtData(taxaVigente(alvo)!.vigencia_inicio)}.`
                : alvo
                  ? `${alvo.nome} ainda não tem valor por hora definido.`
                  : ""}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="rj-valor">Novo valor por hora (R$)</Label>
                <Input
                  id="rj-valor"
                  type="number" min="0" step="0.01"
                  value={reajuste.valor_hora}
                  onChange={e => setReajuste(r => ({ ...r, valor_hora: e.target.value }))}
                  placeholder="Ex: 530.00"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="rj-data">Valendo a partir de</Label>
                <Input
                  id="rj-data"
                  type="date"
                  value={reajuste.vigencia_inicio}
                  onChange={e => setReajuste(r => ({ ...r, vigencia_inicio: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="rj-motivo">Motivo</Label>
              <Input
                id="rj-motivo"
                value={reajuste.motivo}
                onChange={e => setReajuste(r => ({ ...r, motivo: e.target.value }))}
                placeholder="Ex: promoção, reajuste anual"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              O valor anterior continua valendo para tudo que foi lançado até a véspera dessa data.
              Relatórios já fechados não mudam.
            </p>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setReajusteAberto(false)}>Cancelar</Button>
            <Button onClick={salvarReajuste} style={{ backgroundColor: ACCENT }} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <TrendingUp className="w-4 h-4 mr-2" />}
              {saving ? "Registrando..." : "Registrar reajuste"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
