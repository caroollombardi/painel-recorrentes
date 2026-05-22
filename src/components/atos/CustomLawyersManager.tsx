import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X, Plus, Trash2, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  getCustomLawyers,
  addCustomLawyer,
  removeCustomLawyer,
  type CustomLawyer,
} from "@/lib/custom-lawyers";
import { lawyerPrices } from "@/lib/lawyer-prices";
import { toast } from "@/hooks/use-toast";

interface CustomLawyersManagerProps {
  open: boolean;
  onClose: () => void;
  onChanged: () => void;
  /** Se preenchido, sugere esses nomes em destaque (vindos de colaboradores sem custo) */
  suggestedNames?: string[];
}

export function CustomLawyersManager({
  open,
  onClose,
  onChanged,
  suggestedNames = [],
}: CustomLawyersManagerProps) {
  const [list, setList] = useState<CustomLawyer[]>([]);
  const [name, setName] = useState("");
  const [rate, setRate] = useState("");

  useEffect(() => {
    if (open) {
      setList(getCustomLawyers());
      if (suggestedNames.length > 0) {
        setName(suggestedNames[0]);
      }
    }
  }, [open, suggestedNames]);

  useEffect(() => {
    if (!open) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [open]);

  if (!open) return null;

  const handleAdd = () => {
    const trimmed = name.trim();
    const rateNum = parseFloat(rate.replace(",", "."));
    if (!trimmed) {
      toast({ title: "Nome obrigatório", variant: "destructive" });
      return;
    }
    if (isNaN(rateNum) || rateNum < 0) {
      toast({ title: "Valor/hora inválido", variant: "destructive" });
      return;
    }
    addCustomLawyer(trimmed, rateNum);
    setList(getCustomLawyers());
    setName("");
    setRate("");
    onChanged();
    toast({
      title: "Colaborador cadastrado",
      description: `${trimmed} — R$ ${rateNum.toFixed(2)}/h`,
    });
  };

  const handleRemove = (lname: string) => {
    removeCustomLawyer(lname);
    setList(getCustomLawyers());
    onChanged();
    toast({ title: "Colaborador removido", description: lname });
  };

  const modal = (
    <div
      className="fixed inset-0 z-[9999] isolate flex items-center justify-center bg-background/80 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="relative z-10 mx-4 flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-6 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <UserPlus className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-display font-semibold text-foreground">
                Colaboradores adicionais
              </h2>
              <p className="text-xs text-muted-foreground">
                Cadastre colaboradores que não estão na tabela principal de
                valor/hora (estagiários novos, contratados recentes etc.)
              </p>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {suggestedNames.length > 0 && (
            <div className="p-3 bg-warning/10 border border-warning/30 rounded-lg">
              <p className="text-xs font-medium text-foreground mb-2">
                Detectados na importação (sem valor/hora cadastrado):
              </p>
              <div className="flex flex-wrap gap-1.5">
                {suggestedNames.map(n => (
                  <button
                    key={n}
                    onClick={() => setName(n)}
                    className="text-xs px-2 py-1 bg-card border border-border rounded hover:border-primary hover:text-primary transition-colors"
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Form de adição */}
          <div className="space-y-3 p-4 bg-muted/30 border border-border rounded-lg">
            <p className="text-sm font-medium text-foreground">
              Adicionar colaborador
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
              <div className="sm:col-span-3 space-y-1.5">
                <Label htmlFor="custom-name" className="text-xs">
                  Nome completo (como aparece no Asana)
                </Label>
                <Input
                  id="custom-name"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Ex.: João da Silva Santos"
                />
              </div>
              <div className="sm:col-span-2 space-y-1.5">
                <Label htmlFor="custom-rate" className="text-xs">
                  Valor/hora (R$)
                </Label>
                <Input
                  id="custom-rate"
                  type="number"
                  step="0.01"
                  value={rate}
                  onChange={e => setRate(e.target.value)}
                  placeholder="350.00"
                />
              </div>
            </div>
            <Button onClick={handleAdd} size="sm" className="gap-2">
              <Plus className="w-4 h-4" />
              Salvar
            </Button>
          </div>

          {/* Lista de custom */}
          <div>
            <p className="text-xs font-medium text-foreground mb-2">
              Cadastrados ({list.length})
            </p>
            {list.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">
                Nenhum colaborador adicional cadastrado.
              </p>
            ) : (
              <div className="border border-border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground text-xs">
                        Nome
                      </th>
                      <th className="text-right px-3 py-2 font-medium text-muted-foreground text-xs">
                        R$/hora
                      </th>
                      <th className="w-12"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {list.map(l => (
                      <tr key={l.name} className="hover:bg-muted/20">
                        <td className="px-3 py-2 text-foreground">{l.name}</td>
                        <td className="px-3 py-2 text-right font-mono text-foreground">
                          R$ {l.hourlyRate.toFixed(2)}
                        </td>
                        <td className="px-3 py-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:bg-destructive/10"
                            onClick={() => handleRemove(l.name)}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Lista de hardcoded só de referência */}
          <details className="text-xs">
            <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
              Ver tabela principal (referência — não editável aqui)
            </summary>
            <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {lawyerPrices.map(l => (
                <div
                  key={l.name}
                  className="flex items-center justify-between px-3 py-1.5 bg-muted/20 rounded text-xs"
                >
                  <span className="text-foreground truncate">{l.name}</span>
                  <span className="font-mono text-muted-foreground shrink-0 ml-2">
                    R$ {l.hourlyRate}/h
                  </span>
                </div>
              ))}
            </div>
          </details>
        </div>

        <div className="flex justify-end border-t border-border p-4">
          <Button variant="outline" onClick={onClose}>
            Fechar
          </Button>
        </div>
      </div>
    </div>
  );

  return typeof document !== "undefined"
    ? createPortal(modal, document.body)
    : null;
}
