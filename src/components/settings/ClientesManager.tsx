import { useState, useEffect, useCallback, Fragment } from "react";
import {
  Plus, Pencil, Save, Building2, Loader2, TrendingUp, History,
  ChevronDown, ChevronRight, AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { saveContractValues, ContractValue } from "@/lib/contract-values";

// Tabelas novas ainda fora do types.ts gerado. Apagar quando regerar os tipos.
const db = supabase as any;

const ACCENT = "#FB7435";
const CONFIG_FILE_NAME = "__contract_values_config__";

const fmtMoeda = (v: number | null | undefined) =>
  v === null || v === undefined
    ? "—"
    : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const fmtData = (d: string | null) => {
  if (!d) return "—";
  const [a, m, dia] = d.split("-");
  return `${dia}/${m}/${a}`;
};

const hoje = () => new Date().toISOString().slice(0, 10);

const TIPOS = [
  { valor: "recorrente", rotulo: "Recorrente" },
  { valor: "projeto", rotulo: "Projeto" },
  { valor: "avulso", rotulo: "Avulso" },
  { valor: "cortesia", rotulo: "Cortesia" },
];

interface Contrato {
  id: string;
  valor_mensal: number;
  multiplicador_credito: number;
  valor_credito: number;
  franquia_horas: number | null;
  tipo_contrato: string;
  vigencia_inicio: string;
  vigencia_fim: string | null;
  motivo: string | null;
}

interface Cliente {
  id: string;
  nome: string;
  apelidos: string[];
  ativo: boolean;
  email_contato: string | null;
  responsavel_id: string | null;
  cliente_contratos: Contrato[];
}

interface Pessoa { id: string; nome: string }
interface Orfao { valor: string; lancamentos: number }

const contratoVigente = (c: Cliente): Contrato | null =>
  c.cliente_contratos?.find(k => k.vigencia_fim === null) ?? null;

const historico = (c: Cliente): Contrato[] =>
  [...(c.cliente_contratos ?? [])].sort((a, b) =>
    b.vigencia_inicio.localeCompare(a.vigencia_inicio));

export default function ClientesManager() {
  const { toast } = useToast();
  const { isAdmin, hasRole } = useAuth();
  const podeGerir = isAdmin || hasRole("socio") || hasRole("gestao");

  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [equipe, setEquipe] = useState<Pessoa[]>([]);
  const [orfaos, setOrfaos] = useState<Orfao[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [expandido, setExpandido] = useState<string | null>(null);

  const [cadastroAberto, setCadastroAberto] = useState(false);
  const [editando, setEditando] = useState<Cliente | null>(null);
  const [form, setForm] = useState({
    nome: "", apelidos: "", email_contato: "", responsavel_id: "",
    ativo: true, valor_mensal: "", multiplicador: "2", franquia_horas: "",
    tipo_contrato: "recorrente", vigencia_inicio: hoje(),
  });

  const [reajusteAberto, setReajusteAberto] = useState(false);
  const [alvo, setAlvo] = useState<Cliente | null>(null);
  const [reajuste, setReajuste] = useState({
    valor_mensal: "", multiplicador: "2", franquia_horas: "",
    tipo_contrato: "recorrente", vigencia_inicio: hoje(), motivo: "",
  });

  // Ponte: o dashboard ainda lê o blob JSON. Enquanto isso, o banco
  // é a fonte de verdade e o blob é regerado a partir dele.
  const sincronizarBlob = useCallback(async (lista: Cliente[]) => {
    const valores: ContractValue[] = lista
      .filter(c => c.ativo)
      .map(c => {
        const v = contratoVigente(c);
        return v
          ? { cliente: c.nome, valorMensalPago: Number(v.valor_mensal), valorMensalCredito: Number(v.valor_credito) }
          : null;
      })
      .filter(Boolean) as ContractValue[];

    saveContractValues(valores);
    try {
      const { data: existente } = await supabase
        .from("dashboard_data").select("id").eq("file_name", CONFIG_FILE_NAME).maybeSingle();
      if (existente) {
        await supabase.from("dashboard_data")
          .update({ data: valores as any, updated_at: new Date().toISOString() })
          .eq("id", existente.id);
      } else {
        await supabase.from("dashboard_data")
          .insert({ file_name: CONFIG_FILE_NAME, data: valores as any });
      }
    } catch (err) {
      console.error("Erro ao sincronizar valores para o dashboard:", err);
      toast({
        title: "Salvo, mas o painel pode demorar a refletir",
        description: "O cadastro foi gravado. A cópia que o dashboard lê não atualizou.",
        variant: "destructive",
      });
    }
  }, [toast]);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await db
        .from("clientes")
        .select("id, nome, apelidos, ativo, email_contato, responsavel_id, cliente_contratos(id, valor_mensal, multiplicador_credito, valor_credito, franquia_horas, tipo_contrato, vigencia_inicio, vigencia_fim, motivo)")
        .order("nome");
      if (error) throw error;
      const lista = (data ?? []) as Cliente[];
      setClientes(lista);

      const { data: pessoas } = await db.from("equipe").select("id, nome").eq("ativo", true).order("nome");
      setEquipe((pessoas ?? []) as Pessoa[]);

      const { data: orf } = await db
        .from("vw_cadastros_orfaos").select("valor, lancamentos")
        .eq("tipo", "client").order("lancamentos", { ascending: false });
      setOrfaos((orf ?? []) as Orfao[]);

      await sincronizarBlob(lista);
    } catch (err: any) {
      console.error("Erro ao carregar clientes:", err);
      toast({
        title: "Não foi possível carregar os clientes",
        description: err?.message ?? "Verifique sua conexão e tente de novo.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast, sincronizarBlob]);

  useEffect(() => { carregar(); }, [carregar]);

  const abrirCadastro = (nomePreenchido?: string) => {
    setEditando(null);
    setForm({
      nome: nomePreenchido ?? "", apelidos: "", email_contato: "", responsavel_id: "",
      ativo: true, valor_mensal: "", multiplicador: "2", franquia_horas: "",
      tipo_contrato: "recorrente", vigencia_inicio: hoje(),
    });
    setCadastroAberto(true);
  };

  const abrirEdicao = (c: Cliente) => {
    setEditando(c);
    setForm({
      nome: c.nome, apelidos: (c.apelidos ?? []).join(", "),
      email_contato: c.email_contato ?? "", responsavel_id: c.responsavel_id ?? "",
      ativo: c.ativo, valor_mensal: "", multiplicador: "2", franquia_horas: "",
      tipo_contrato: "recorrente", vigencia_inicio: hoje(),
    });
    setCadastroAberto(true);
  };

  const salvarCadastro = async () => {
    const nome = form.nome.trim().toUpperCase();
    if (!nome) {
      return toast({ title: "Informe o nome", description: "Precisa bater com o nome que vem do EasyJur.", variant: "destructive" });
    }
    const apelidos = form.apelidos.split(",").map(a => a.trim()).filter(Boolean);
    setSaving(true);
    try {
      if (editando) {
        const { error } = await db.from("clientes").update({
          apelidos,
          email_contato: form.email_contato.trim() || null,
          responsavel_id: form.responsavel_id || null,
          ativo: form.ativo,
        }).eq("id", editando.id);
        if (error) throw error;
        toast({ title: "Cliente atualizado", description: `${nome} foi atualizado.` });
      } else {
        const valor = parseFloat(form.valor_mensal.replace(",", "."));
        const mult = parseFloat(form.multiplicador.replace(",", "."));
        if (isNaN(valor) || valor < 0) {
          setSaving(false);
          return toast({ title: "Valor inválido", description: "Informe o valor mensal do contrato.", variant: "destructive" });
        }
        if (isNaN(mult) || mult <= 0) {
          setSaving(false);
          return toast({ title: "Multiplicador inválido", description: "O padrão do escritório é 2.", variant: "destructive" });
        }
        const franquia = form.franquia_horas.trim()
          ? parseFloat(form.franquia_horas.replace(",", ".")) : null;

        const { data: novo, error } = await db.from("clientes").insert({
          nome, apelidos,
          email_contato: form.email_contato.trim() || null,
          responsavel_id: form.responsavel_id || null,
          ativo: form.ativo,
        }).select("id").single();
        if (error) throw error;

        const { error: erroContrato } = await db.from("cliente_contratos").insert({
          cliente_id: novo.id, valor_mensal: valor, multiplicador_credito: mult,
          franquia_horas: franquia, tipo_contrato: form.tipo_contrato,
          vigencia_inicio: form.vigencia_inicio, motivo: "Contrato inicial",
        });
        if (erroContrato) throw erroContrato;

        toast({
          title: "Cliente cadastrado",
          description: `${nome} entrou com ${fmtMoeda(valor)}/mês e crédito de ${fmtMoeda(valor * mult)}.`,
        });
      }
      setCadastroAberto(false);
      await carregar();
    } catch (err: any) {
      const duplicado = err?.code === "23505";
      toast({
        title: duplicado ? "Esse cliente já existe" : "Não foi possível salvar",
        description: duplicado
          ? "Já há um cliente com esse nome. Use o campo de outras grafias para variações."
          : err?.message ?? "Tente de novo.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const abrirReajuste = (c: Cliente) => {
    const v = contratoVigente(c);
    setAlvo(c);
    setReajuste({
      valor_mensal: "",
      multiplicador: v ? String(v.multiplicador_credito) : "2",
      franquia_horas: v?.franquia_horas != null ? String(v.franquia_horas) : "",
      tipo_contrato: v?.tipo_contrato ?? "recorrente",
      vigencia_inicio: hoje(), motivo: "",
    });
    setReajusteAberto(true);
  };

  const salvarReajuste = async () => {
    if (!alvo) return;
    const valor = parseFloat(reajuste.valor_mensal.replace(",", "."));
    const mult = parseFloat(reajuste.multiplicador.replace(",", "."));
    if (isNaN(valor) || valor < 0) {
      return toast({ title: "Valor inválido", description: "Informe o novo valor mensal.", variant: "destructive" });
    }
    if (isNaN(mult) || mult <= 0) {
      return toast({ title: "Multiplicador inválido", description: "Precisa ser maior que zero.", variant: "destructive" });
    }
    const atual = contratoVigente(alvo);
    if (atual && reajuste.vigencia_inicio <= atual.vigencia_inicio) {
      return toast({
        title: "Data anterior à vigência atual",
        description: `O contrato atual vale desde ${fmtData(atual.vigencia_inicio)}. O novo precisa começar depois.`,
        variant: "destructive",
      });
    }

    setSaving(true);
    try {
      const { error } = await db.rpc("registrar_contrato", {
        _cliente_id: alvo.id,
        _valor_mensal: valor,
        _vigencia_inicio: reajuste.vigencia_inicio,
        _multiplicador: mult,
        _franquia_horas: reajuste.franquia_horas.trim()
          ? parseFloat(reajuste.franquia_horas.replace(",", ".")) : null,
        _tipo_contrato: reajuste.tipo_contrato,
        _motivo: reajuste.motivo.trim() || null,
      });
      if (error) throw error;
      toast({
        title: "Novo contrato registrado",
        description: `${alvo.nome} passa a ${fmtMoeda(valor)}/mês a partir de ${fmtData(reajuste.vigencia_inicio)}. Os meses anteriores continuam com o valor antigo.`,
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

  const ativos = clientes.filter(c => c.ativo);
  const mrr = ativos.reduce((s, c) => s + Number(contratoVigente(c)?.valor_mensal ?? 0), 0);
  const credito = ativos.reduce((s, c) => s + Number(contratoVigente(c)?.valor_credito ?? 0), 0);
  const semContrato = ativos.filter(c => !contratoVigente(c));
  const nomeDe = (id: string | null) => equipe.find(p => p.id === id)?.nome ?? null;

  return (
    <div className="space-y-4">
      {!loading && (orfaos.length > 0 || semContrato.length > 0) && (
        <Card className="border-warning/40">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="w-4 h-4 text-warning" />
              Horas sem contrato
            </CardTitle>
            <CardDescription>
              Esses lançamentos não têm contrato para comparar consumo.
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
                    Cadastrar
                  </Button>
                )}
              </div>
            ))}
            {semContrato.map(c => (
              <div key={c.id} className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                <div>
                  <span className="font-medium">{c.nome}</span>
                  <span className="text-muted-foreground text-sm ml-2">cadastrado, mas sem contrato vigente</span>
                </div>
                {podeGerir && (
                  <Button size="sm" variant="outline" onClick={() => abrirReajuste(c)}>
                    Definir contrato
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
              <Building2 className="w-5 h-5" />
              Clientes recorrentes
            </CardTitle>
            <CardDescription>
              Contratos com histórico. Um reajuste cria uma nova vigência e não altera os meses já fechados.
            </CardDescription>
          </div>
          {podeGerir && (
            <Button onClick={() => abrirCadastro()} style={{ backgroundColor: ACCENT }} className="shrink-0" disabled={loading}>
              <Plus className="w-4 h-4 mr-2" />
              Novo cliente
            </Button>
          )}
        </CardHeader>

        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin" />
              Carregando clientes...
            </div>
          ) : clientes.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <p>Nenhum cliente cadastrado ainda.</p>
              {podeGerir && (
                <Button variant="outline" className="mt-3" onClick={() => abrirCadastro()}>
                  Cadastrar o primeiro cliente
                </Button>
              )}
            </div>
          ) : (
            <div className="rounded-lg border border-border overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="w-8 px-2 py-3" />
                    <th className="text-left px-4 py-3 font-medium">Cliente</th>
                    <th className="text-right px-4 py-3 font-medium">Valor mensal</th>
                    <th className="text-right px-4 py-3 font-medium">Crédito</th>
                    <th className="text-right px-4 py-3 font-medium">Franquia</th>
                    <th className="text-left px-4 py-3 font-medium">Responsável</th>
                    <th className="text-left px-4 py-3 font-medium">Desde</th>
                    <th className="px-4 py-3 w-28" />
                  </tr>
                </thead>
                <tbody>
                  {clientes.map(c => {
                    const v = contratoVigente(c);
                    const hist = historico(c);
                    const aberto = expandido === c.id;
                    return (
                      <Fragment key={c.id}>
                        <tr className="border-t border-border hover:bg-muted/30 transition-colors">
                          <td className="px-2 py-3">
                            {hist.length > 1 && (
                              <button
                                onClick={() => setExpandido(aberto ? null : c.id)}
                                className="text-muted-foreground hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring rounded"
                                aria-label={aberto ? "Ocultar histórico" : "Ver histórico"}
                              >
                                {aberto ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                              </button>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <span className="font-medium">{c.nome}</span>
                            {!c.ativo && <Badge variant="secondary" className="ml-2">Inativo</Badge>}
                            {v && v.tipo_contrato !== "recorrente" && (
                              <Badge variant="outline" className="ml-2">
                                {TIPOS.find(t => t.valor === v.tipo_contrato)?.rotulo ?? v.tipo_contrato}
                              </Badge>
                            )}
                            {c.apelidos?.length > 0 && (
                              <p className="text-xs text-muted-foreground mt-0.5">
                                também importado como {c.apelidos.join(", ")}
                              </p>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right font-medium">
                            {v ? fmtMoeda(Number(v.valor_mensal)) : <span className="text-warning">sem contrato</span>}
                          </td>
                          <td className="px-4 py-3 text-right text-muted-foreground">
                            {v ? fmtMoeda(Number(v.valor_credito)) : "—"}
                          </td>
                          <td className="px-4 py-3 text-right text-muted-foreground">
                            {v?.franquia_horas != null ? `${v.franquia_horas}h` : "—"}
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">{nomeDe(c.responsavel_id) ?? "—"}</td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {v ? fmtData(v.vigencia_inicio) : "—"}
                            {hist.length > 1 && (
                              <span className="text-xs ml-2">
                                <History className="w-3 h-3 inline mr-1" />
                                {hist.length}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            {podeGerir && (
                              <div className="flex items-center gap-1 justify-end">
                                <Button variant="ghost" size="icon" onClick={() => abrirReajuste(c)} aria-label={`Registrar reajuste de ${c.nome}`}>
                                  <TrendingUp className="w-4 h-4 text-muted-foreground" />
                                </Button>
                                <Button variant="ghost" size="icon" onClick={() => abrirEdicao(c)} aria-label={`Editar ${c.nome}`}>
                                  <Pencil className="w-4 h-4 text-muted-foreground" />
                                </Button>
                              </div>
                            )}
                          </td>
                        </tr>
                        {aberto && (
                          <tr className="bg-muted/20 border-t border-border">
                            <td />
                            <td colSpan={7} className="px-4 py-3">
                              <p className="text-xs text-muted-foreground mb-2">Histórico de contratos</p>
                              <div className="space-y-1">
                                {hist.map(k => (
                                  <div key={k.id} className="flex items-center gap-3 text-sm">
                                    <span className="font-medium w-32">{fmtMoeda(Number(k.valor_mensal))}</span>
                                    <span className="text-muted-foreground">
                                      {fmtData(k.vigencia_inicio)} a {k.vigencia_fim ? fmtData(k.vigencia_fim) : "hoje"}
                                    </span>
                                    {k.motivo && <span className="text-muted-foreground text-xs">· {k.motivo}</span>}
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
                <tfoot>
                  <tr className="border-t-2 border-border bg-muted/50 font-semibold">
                    <td />
                    <td className="px-4 py-3">Total ({ativos.length} ativos)</td>
                    <td className="px-4 py-3 text-right" style={{ color: ACCENT }}>{fmtMoeda(mrr)}</td>
                    <td className="px-4 py-3 text-right" style={{ color: ACCENT }}>{fmtMoeda(credito)}</td>
                    <td colSpan={4} />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Cadastro / edição */}
      <Dialog open={cadastroAberto} onOpenChange={setCadastroAberto}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editando ? `Editar ${editando.nome}` : "Novo cliente"}</DialogTitle>
            {!editando && (
              <DialogDescription>
                O nome precisa ser igual ao que vem do EasyJur, senão as horas não encontram o cliente.
              </DialogDescription>
            )}
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="cl-nome">Nome</Label>
              <Input
                id="cl-nome" value={form.nome}
                onChange={e => setForm(f => ({ ...f, nome: e.target.value }))}
                disabled={!!editando} placeholder="Ex: NOME DA EMPRESA"
              />
              {editando && (
                <p className="text-xs text-muted-foreground">
                  O nome não muda, para não perder o vínculo com as horas já lançadas.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="cl-apelidos">Outras grafias</Label>
              <Input
                id="cl-apelidos" value={form.apelidos}
                onChange={e => setForm(f => ({ ...f, apelidos: e.target.value }))}
                placeholder="Separe por vírgula"
              />
              <p className="text-xs text-muted-foreground">
                Como o nome aparece no EasyJur ou no Asana quando está escrito diferente.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="cl-email">E-mail de contato</Label>
                <Input
                  id="cl-email" type="email" value={form.email_contato}
                  onChange={e => setForm(f => ({ ...f, email_contato: e.target.value }))}
                  placeholder="contato@empresa.com.br"
                />
              </div>
              <div className="space-y-2">
                <Label>Responsável pela conta</Label>
                <Select
                  value={form.responsavel_id || "nenhum"}
                  onValueChange={v => setForm(f => ({ ...f, responsavel_id: v === "nenhum" ? "" : v }))}
                >
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="nenhum">Sem responsável</SelectItem>
                    {equipe.map(p => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {!editando && (
              <div className="space-y-3 rounded-md border border-border p-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="cl-valor">Valor mensal (R$)</Label>
                    <Input
                      id="cl-valor" type="number" min="0" step="0.01"
                      value={form.valor_mensal}
                      onChange={e => setForm(f => ({ ...f, valor_mensal: e.target.value }))}
                      placeholder="Ex: 4500.00"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="cl-mult">Multiplicador do crédito</Label>
                    <Input
                      id="cl-mult" type="number" min="0.1" step="0.1"
                      value={form.multiplicador}
                      onChange={e => setForm(f => ({ ...f, multiplicador: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="cl-franquia">Franquia de horas</Label>
                    <Input
                      id="cl-franquia" type="number" min="0" step="0.5"
                      value={form.franquia_horas}
                      onChange={e => setForm(f => ({ ...f, franquia_horas: e.target.value }))}
                      placeholder="opcional"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Tipo de contrato</Label>
                    <Select
                      value={form.tipo_contrato}
                      onValueChange={v => setForm(f => ({ ...f, tipo_contrato: v }))}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {TIPOS.map(t => <SelectItem key={t.valor} value={t.valor}>{t.rotulo}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cl-vig">Contrato valendo desde</Label>
                  <Input
                    id="cl-vig" type="date" value={form.vigencia_inicio}
                    onChange={e => setForm(f => ({ ...f, vigencia_inicio: e.target.value }))}
                  />
                  <p className="text-xs text-muted-foreground">
                    Use a data de início do contrato. Meses anteriores ficam sem valor de comparação.
                  </p>
                </div>
              </div>
            )}

            {editando && (
              <div className="flex items-center justify-between rounded-md border border-border p-3">
                <div>
                  <Label htmlFor="cl-ativo">Cliente ativo</Label>
                  <p className="text-xs text-muted-foreground mt-1">
                    Desativar mantém o histórico e tira o cliente dos totais.
                  </p>
                </div>
                <Switch
                  id="cl-ativo" checked={form.ativo}
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
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Registrar novo contrato</DialogTitle>
            <DialogDescription>
              {alvo && contratoVigente(alvo)
                ? `${alvo.nome} está em ${fmtMoeda(Number(contratoVigente(alvo)!.valor_mensal))}/mês desde ${fmtData(contratoVigente(alvo)!.vigencia_inicio)}.`
                : alvo ? `${alvo.nome} ainda não tem contrato vigente.` : ""}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="rc-valor">Novo valor mensal (R$)</Label>
                <Input
                  id="rc-valor" type="number" min="0" step="0.01"
                  value={reajuste.valor_mensal}
                  onChange={e => setReajuste(r => ({ ...r, valor_mensal: e.target.value }))}
                  placeholder="Ex: 5200.00"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="rc-vig">Valendo a partir de</Label>
                <Input
                  id="rc-vig" type="date" value={reajuste.vigencia_inicio}
                  onChange={e => setReajuste(r => ({ ...r, vigencia_inicio: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="rc-mult">Multiplicador do crédito</Label>
                <Input
                  id="rc-mult" type="number" min="0.1" step="0.1"
                  value={reajuste.multiplicador}
                  onChange={e => setReajuste(r => ({ ...r, multiplicador: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="rc-franquia">Franquia de horas</Label>
                <Input
                  id="rc-franquia" type="number" min="0" step="0.5"
                  value={reajuste.franquia_horas}
                  onChange={e => setReajuste(r => ({ ...r, franquia_horas: e.target.value }))}
                  placeholder="opcional"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Tipo de contrato</Label>
              <Select
                value={reajuste.tipo_contrato}
                onValueChange={v => setReajuste(r => ({ ...r, tipo_contrato: v }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TIPOS.map(t => <SelectItem key={t.valor} value={t.valor}>{t.rotulo}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="rc-motivo">Motivo</Label>
              <Input
                id="rc-motivo" value={reajuste.motivo}
                onChange={e => setReajuste(r => ({ ...r, motivo: e.target.value }))}
                placeholder="Ex: reajuste anual, ampliação de escopo"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              O contrato anterior continua valendo até a véspera dessa data. Relatórios já fechados não mudam.
            </p>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setReajusteAberto(false)}>Cancelar</Button>
            <Button onClick={salvarReajuste} style={{ backgroundColor: ACCENT }} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <TrendingUp className="w-4 h-4 mr-2" />}
              {saving ? "Registrando..." : "Registrar contrato"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
