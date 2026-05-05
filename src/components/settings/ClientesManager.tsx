import { useState, useEffect } from "react";
import { Plus, Pencil, Trash2, Save, Building2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { getContractValues, saveContractValues, ContractValue } from "@/lib/contract-values";

const CONFIG_FILE_NAME = "__contract_values_config__";

const fmt = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

interface FormState {
  cliente: string;
  valorMensalPago: string;
  valorMensalCredito: string;
}

const emptyForm: FormState = { cliente: "", valorMensalPago: "", valorMensalCredito: "" };

export default function ClientesManager() {
  const { toast } = useToast();
  const [clientes, setClientes] = useState<ContractValue[]>(() => getContractValues());
  const [recordId, setRecordId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);

  // Carrega do Supabase ao montar
  useEffect(() => {
    async function loadFromSupabase() {
      try {
        const { data, error } = await supabase
          .from("dashboard_data")
          .select("id, data")
          .eq("file_name", CONFIG_FILE_NAME)
          .maybeSingle();

        if (error) throw error;

        if (data) {
          const values = data.data as ContractValue[];
          saveContractValues(values); // atualiza localStorage como cache
          setClientes(values);
          setRecordId(data.id);
        }
      } catch (err) {
        console.error("Erro ao carregar clientes do Supabase:", err);
      } finally {
        setLoading(false);
      }
    }
    loadFromSupabase();
  }, []);

  async function persistir(updated: ContractValue[]) {
    setSaving(true);
    saveContractValues(updated); // salva no localStorage imediatamente
    setClientes(updated);
    try {
      if (recordId) {
        await supabase
          .from("dashboard_data")
          .update({ data: updated as any, updated_at: new Date().toISOString() })
          .eq("id", recordId);
      } else {
        const { data, error } = await supabase
          .from("dashboard_data")
          .insert({ file_name: CONFIG_FILE_NAME, data: updated as any })
          .select("id")
          .single();
        if (error) throw error;
        setRecordId(data.id);
      }
    } catch (err) {
      console.error("Erro ao salvar no Supabase:", err);
      toast({ title: "Aviso", description: "Salvo localmente, mas não foi possível sincronizar com o servidor.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  const openAdd = () => {
    setEditingIndex(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (idx: number) => {
    const c = clientes[idx];
    setEditingIndex(idx);
    setForm({
      cliente: c.cliente,
      valorMensalPago: String(c.valorMensalPago),
      valorMensalCredito: String(c.valorMensalCredito),
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    const nome = form.cliente.trim().toUpperCase();
    const pago = parseFloat(form.valorMensalPago.replace(",", "."));
    const credito = parseFloat(form.valorMensalCredito.replace(",", "."));

    if (!nome) return toast({ title: "Campo obrigatório", description: "Informe o nome do cliente.", variant: "destructive" });
    if (isNaN(pago) || pago <= 0) return toast({ title: "Valor inválido", description: "Informe um valor mensal válido.", variant: "destructive" });
    if (isNaN(credito) || credito <= 0) return toast({ title: "Valor inválido", description: "Informe um crédito disponível válido.", variant: "destructive" });

    const novoCliente: ContractValue = { cliente: nome, valorMensalPago: pago, valorMensalCredito: credito };
    let updated: ContractValue[];

    if (editingIndex !== null) {
      updated = clientes.map((c, i) => (i === editingIndex ? novoCliente : c));
    } else {
      const existe = clientes.some(c => c.cliente.toLowerCase() === nome.toLowerCase());
      if (existe) return toast({ title: "Cliente já existe", description: "Já existe um cliente com esse nome.", variant: "destructive" });
      updated = [...clientes, novoCliente];
    }

    await persistir(updated);
    setDialogOpen(false);
    toast({ title: editingIndex !== null ? "Cliente atualizado" : "Cliente adicionado", description: `${nome} salvo com sucesso.` });
  };

  const handleDelete = async (idx: number) => {
    const updated = clientes.filter((_, i) => i !== idx);
    await persistir(updated);
    setDeleteConfirm(null);
    toast({ title: "Cliente removido", description: "O cliente foi excluído da lista." });
  };

  const autoFillCredito = () => {
    const pago = parseFloat(form.valorMensalPago.replace(",", "."));
    if (!isNaN(pago) && pago > 0) {
      setForm(f => ({ ...f, valorMensalCredito: String(pago * 2) }));
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="w-5 h-5" />
            Clientes Recorrentes
          </CardTitle>
          <CardDescription>
            Gerencie os contratos, valores mensais e créditos disponíveis de cada cliente.
          </CardDescription>
        </div>
        <Button onClick={openAdd} style={{ backgroundColor: "#FB7435" }} className="shrink-0" disabled={loading}>
          <Plus className="w-4 h-4 mr-2" />
          Novo Cliente
        </Button>
      </CardHeader>

      <CardContent>
        {loading && (
          <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin" />
            Carregando clientes...
          </div>
        )}
        {!loading && <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Cliente</th>
                <th className="text-right px-4 py-3 font-medium">Valor Mensal</th>
                <th className="text-right px-4 py-3 font-medium">Crédito Disponível</th>
                <th className="px-4 py-3 w-20"></th>
              </tr>
            </thead>
            <tbody>
              {clientes.map((c, idx) => (
                <tr key={idx} className="border-t border-border hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 font-medium">{c.cliente}</td>
                  <td className="px-4 py-3 text-right text-muted-foreground">{fmt(c.valorMensalPago)}</td>
                  <td className="px-4 py-3 text-right text-muted-foreground">{fmt(c.valorMensalCredito)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 justify-end">
                      {deleteConfirm === idx ? (
                        <div className="flex items-center gap-1">
                          <Button
                            variant="destructive"
                            size="sm"
                            className="h-7 text-xs px-2"
                            onClick={() => handleDelete(idx)}
                          >
                            Excluir
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs px-2"
                            onClick={() => setDeleteConfirm(null)}
                          >
                            Cancelar
                          </Button>
                        </div>
                      ) : (
                        <>
                          <Button variant="ghost" size="icon" onClick={() => openEdit(idx)}>
                            <Pencil className="w-4 h-4 text-muted-foreground" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => setDeleteConfirm(idx)}>
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {clientes.length === 0 && (
            <p className="text-center text-muted-foreground py-8">Nenhum cliente cadastrado.</p>
          )}
          {clientes.length > 0 && (
            <tfoot>
              <tr className="border-t-2 border-border bg-muted/50 font-semibold">
                <td className="px-4 py-3">Total ({clientes.length} clientes)</td>
                <td className="px-4 py-3 text-right" style={{ color: "#FB7435" }}>
                  {fmt(clientes.reduce((s, c) => s + c.valorMensalPago, 0))}
                </td>
                <td className="px-4 py-3 text-right" style={{ color: "#FB7435" }}>
                  {fmt(clientes.reduce((s, c) => s + c.valorMensalCredito, 0))}
                </td>
                <td></td>
              </tr>
            </tfoot>
          )}
        </div>}

        <p className="text-xs text-muted-foreground mt-3">
          {clientes.length} cliente{clientes.length !== 1 ? "s" : ""} cadastrado{clientes.length !== 1 ? "s" : ""}
        </p>
      </CardContent>

      {/* Dialog de adicionar/editar */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingIndex !== null ? "Editar Cliente" : "Novo Cliente"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Nome do cliente</Label>
              <Input
                placeholder="Ex: NOME DA EMPRESA"
                value={form.cliente}
                onChange={e => setForm(f => ({ ...f, cliente: e.target.value }))}
                disabled={editingIndex !== null}
              />
              {editingIndex !== null && (
                <p className="text-xs text-muted-foreground">O nome não pode ser alterado para não perder o histórico.</p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Valor mensal pago (R$)</Label>
              <Input
                placeholder="Ex: 4500.00"
                value={form.valorMensalPago}
                onChange={e => setForm(f => ({ ...f, valorMensalPago: e.target.value }))}
                onBlur={autoFillCredito}
                type="number"
                min="0"
                step="0.01"
              />
              <p className="text-xs text-muted-foreground">O que o cliente paga por mês.</p>
            </div>
            <div className="space-y-2">
              <Label>Crédito disponível (R$)</Label>
              <Input
                placeholder="Ex: 9000.00"
                value={form.valorMensalCredito}
                onChange={e => setForm(f => ({ ...f, valorMensalCredito: e.target.value }))}
                type="number"
                min="0"
                step="0.01"
              />
              <p className="text-xs text-muted-foreground">
                Limite de horas faturáveis (padrão: 2x o valor pago). Ao sair do campo "Valor mensal" o sistema preenche automaticamente.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} style={{ backgroundColor: "#FB7435" }} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
              {saving ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
