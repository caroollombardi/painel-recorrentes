import { useState, useRef, useMemo, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  Upload,
  FileSpreadsheet,
  X,
  CheckCircle,
  AlertTriangle,
  Info,
  UserPlus,
  FolderKanban,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  parseAtosCSV,
  importAtosProjetos,
  type AtosCSVValidationResult,
} from "@/lib/atos-parser";
import { toast } from "@/hooks/use-toast";
import { CustomLawyersManager } from "./CustomLawyersManager";

interface AtosImportProps {
  onImportComplete: () => void;
}

type ImportStep = "upload" | "preview" | "importing" | "done";

const EXPECTED_COLUMNS = [
  { name: "Time logged by name", desc: "Colaborador que lançou a hora" },
  { name: "Duration in minutes", desc: "Duração em minutos" },
  { name: "Billable status", desc: "billable / nonBillable" },
  { name: "Entered On", desc: "Data do lançamento (YYYY-MM-DD)" },
  { name: "Task ID", desc: "ID da tarefa" },
  { name: "Task Name", desc: "Nome da tarefa" },
  { name: "Project ID", desc: "ID do projeto (chave de re-importação)" },
  { name: "Project Name", desc: "Nome do projeto" },
];

export function AtosImport({ onImportComplete }: AtosImportProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [step, setStep] = useState<ImportStep>("upload");
  const [parsedResult, setParsedResult] = useState<AtosCSVValidationResult | null>(
    null
  );
  const [isDragging, setIsDragging] = useState(false);
  const [showColumns, setShowColumns] = useState(false);
  const [importResult, setImportResult] = useState<{
    projetos: number;
    substituidos: number;
    lancamentos: number;
  } | null>(null);
  const [customLawyersOpen, setCustomLawyersOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setStep("upload");
    setParsedResult(null);
    setIsDragging(false);
    setShowColumns(false);
    setImportResult(null);
  };

  const handleClose = () => {
    setIsOpen(false);
    reset();
  };

  const handleFile = async (file: File) => {
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (!["csv", "xlsx", "xls"].includes(ext || "")) {
      toast({
        title: "Formato inválido",
        description: "Selecione um arquivo CSV ou Excel.",
        variant: "destructive",
      });
      return;
    }

    let text: string;
    if (ext === "csv") {
      text = await file.text();
      if (text.includes("\uFFFD")) {
        const buffer = await file.arrayBuffer();
        text = new TextDecoder("latin1").decode(buffer);
      }
    } else {
      const XLSX = await import("xlsx");
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      text = XLSX.utils.sheet_to_csv(sheet); // padrão é vírgula, igual ao Asana
    }

    const result = parseAtosCSV(text);
    setParsedResult(result);

    if (result.valid) {
      setStep("preview");
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const handleConfirm = async () => {
    if (!parsedResult) return;
    setStep("importing");

    const result = await importAtosProjetos(parsedResult.projetos);

    if (result.success) {
      setImportResult({
        projetos: result.projetosImportados,
        substituidos: result.projetosSubstituidos,
        lancamentos: result.lancamentosImportados,
      });
      setStep("done");
      toast({
        title: "Importação concluída",
        description: `${result.projetosImportados + result.projetosSubstituidos} projeto(s), ${result.lancamentosImportados} lançamentos.`,
      });
      onImportComplete();
    } else {
      toast({
        title: "Erro na importação",
        description: result.error || "Falha ao salvar dados.",
        variant: "destructive",
      });
      setStep("preview");
    }
  };

  // Recalcula preview ao trocar advogados custom
  const handleCustomLawyersChanged = () => {
    if (parsedResult?.valid) {
      // Re-parsing seria mais correto, mas como já temos o texto perdido,
      // refazemos só a checagem de "sem custo"
      // Pra simplificar, o usuário pode re-uplodar se quiser ver atualizado.
    }
  };

  const previewSummary = useMemo(() => {
    if (!parsedResult?.projetos.length) return null;
    return {
      totalProjetos: parsedResult.projetos.length,
      totalLancamentos: parsedResult.totalLancamentos,
      totalHoras: parsedResult.totalMinutos / 60,
      colaboradoresSemCusto: parsedResult.colaboradoresSemCusto,
    };
  }, [parsedResult]);

  useEffect(() => {
    if (!isOpen) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [isOpen]);

  const modalContent = (
    <div
      className="fixed inset-0 z-[9998] isolate flex items-center justify-center bg-background/80 backdrop-blur-sm animate-fade-in"
      onClick={handleClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="relative z-10 mx-4 flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <FolderKanban className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-display font-semibold text-foreground">
                Importar projetos do Asana
              </h2>
              <p className="text-xs text-muted-foreground">
                CSV de Time Tracking — múltiplos projetos por vez. Projetos já
                existentes são substituídos.
              </p>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={handleClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Step 1: Upload */}
          {step === "upload" && (
            <div className="space-y-4">
              <div
                className={cn(
                  "border-2 border-dashed rounded-xl p-10 text-center transition-colors cursor-pointer",
                  isDragging
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/50 hover:bg-muted/30"
                )}
                onClick={() => fileRef.current?.click()}
                onDragOver={e => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
              >
                <Upload className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                <p className="text-sm font-medium text-foreground mb-1">
                  Arraste o CSV aqui ou clique para selecionar
                </p>
                <p className="text-xs text-muted-foreground">
                  Aceita .csv, .xlsx, .xls
                </p>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  className="hidden"
                  onChange={e => {
                    const f = e.target.files?.[0];
                    if (f) handleFile(f);
                  }}
                />
              </div>

              <button
                type="button"
                onClick={() => setShowColumns(s => !s)}
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
              >
                <Info className="w-3 h-3" />
                {showColumns ? "Ocultar" : "Ver"} colunas esperadas
              </button>
              {showColumns && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  {EXPECTED_COLUMNS.map(c => (
                    <div
                      key={c.name}
                      className="px-3 py-2 bg-muted/30 border border-border rounded"
                    >
                      <code className="font-mono text-foreground">{c.name}</code>
                      <p className="text-muted-foreground mt-0.5">{c.desc}</p>
                    </div>
                  ))}
                </div>
              )}

              {parsedResult && !parsedResult.valid && (
                <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-lg space-y-1">
                  <div className="flex items-center gap-2 text-destructive">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span className="text-xs font-semibold">
                      Não foi possível ler o arquivo
                    </span>
                  </div>
                  {parsedResult.errors.map((err, i) => (
                    <p key={i} className="text-xs text-muted-foreground">
                      {err}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Step 2: Preview */}
          {step === "preview" && parsedResult && previewSummary && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-foreground mb-1">
                    Pré-visualização
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Confira os dados antes de importar
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setStep("upload");
                    setParsedResult(null);
                  }}
                >
                  ← Voltar
                </Button>
              </div>

              {/* Cards de resumo */}
              <div className="grid grid-cols-3 gap-3">
                <div className="p-3 bg-primary/5 border border-primary/20 rounded-lg text-center">
                  <p className="text-lg font-bold text-primary">
                    {previewSummary.totalProjetos}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Projeto{previewSummary.totalProjetos > 1 ? "s" : ""}
                  </p>
                </div>
                <div className="p-3 bg-primary/5 border border-primary/20 rounded-lg text-center">
                  <p className="text-lg font-bold text-primary">
                    {previewSummary.totalLancamentos}
                  </p>
                  <p className="text-xs text-muted-foreground">Lançamentos</p>
                </div>
                <div className="p-3 bg-primary/5 border border-primary/20 rounded-lg text-center">
                  <p className="text-lg font-bold text-primary">
                    {previewSummary.totalHoras.toFixed(1)}h
                  </p>
                  <p className="text-xs text-muted-foreground">Total de horas</p>
                </div>
              </div>

              {/* Alerta de colaboradores sem custo */}
              {previewSummary.colaboradoresSemCusto.length > 0 && (
                <div className="p-3 bg-warning/10 border border-warning/30 rounded-lg space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2 text-foreground">
                        <AlertTriangle className="w-3.5 h-3.5 text-warning-foreground" />
                        <span className="text-xs font-semibold">
                          {previewSummary.colaboradoresSemCusto.length}{" "}
                          colaborador(es) sem valor/hora cadastrado
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        As horas dessas pessoas vão entrar no projeto, mas
                        contam como R$ 0,00. Cadastre antes de importar pra ter
                        o cálculo correto.
                      </p>
                      <div className="flex flex-wrap gap-1 mt-2">
                        {previewSummary.colaboradoresSemCusto.map(n => (
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
                      onClick={() => setCustomLawyersOpen(true)}
                    >
                      <UserPlus className="w-3.5 h-3.5" />
                      Cadastrar
                    </Button>
                  </div>
                </div>
              )}

              {/* Lista de projetos */}
              <div className="border border-border rounded-lg overflow-hidden max-h-72 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50 sticky top-0">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground">
                        Projeto
                      </th>
                      <th className="text-right px-3 py-2 font-medium text-muted-foreground">
                        Lançamentos
                      </th>
                      <th className="text-right px-3 py-2 font-medium text-muted-foreground">
                        Horas
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {parsedResult.projetos.map(p => {
                      const min = p.lancamentos.reduce(
                        (s, l) => s + l.duracao_minutos,
                        0
                      );
                      return (
                        <tr key={p.asana_project_id} className="hover:bg-muted/20">
                          <td className="px-3 py-2 text-foreground">
                            <p className="font-medium">{p.nome_projeto}</p>
                            <p className="text-muted-foreground text-[10px] font-mono">
                              {p.asana_project_id}
                            </p>
                          </td>
                          <td className="px-3 py-2 text-right text-foreground">
                            {p.lancamentos.length}
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-foreground">
                            {(min / 60).toFixed(2)}h
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Avisos */}
              {parsedResult.warnings.length > 0 && (
                <div className="p-3 bg-warning/10 border border-warning/30 rounded-lg">
                  <div className="flex items-center gap-2 text-foreground mb-1">
                    <AlertTriangle className="w-3.5 h-3.5 text-warning-foreground" />
                    <span className="text-xs font-semibold">
                      {parsedResult.warnings.length} aviso(s)
                    </span>
                  </div>
                  <div className="max-h-20 overflow-y-auto">
                    {parsedResult.warnings.slice(0, 10).map((w, i) => (
                      <p key={i} className="text-xs text-muted-foreground">
                        {w}
                      </p>
                    ))}
                  </div>
                </div>
              )}

              {/* Aviso de substituição */}
              <div className="p-3 bg-muted/30 border border-border rounded-lg flex items-start gap-2">
                <Info className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                <p className="text-xs text-muted-foreground">
                  Projetos com o mesmo <strong>Project ID</strong> já cadastrados
                  serão atualizados — todos os lançamentos antigos são removidos
                  e substituídos pelos do arquivo. O{" "}
                  <strong>valor combinado</strong> e o toggle de não-billable são
                  preservados.
                </p>
              </div>
            </div>
          )}

          {/* Step 3: Importing */}
          {step === "importing" && (
            <div className="py-12 text-center space-y-4">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary mx-auto" />
              <p className="text-sm text-muted-foreground">
                Importando projetos e lançamentos...
              </p>
            </div>
          )}

          {/* Step 4: Done */}
          {step === "done" && importResult && (
            <div className="py-8 text-center space-y-4">
              <div className="mx-auto w-16 h-16 rounded-full bg-success/10 flex items-center justify-center">
                <CheckCircle className="w-8 h-8 text-success" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-foreground">
                  Importação concluída!
                </h3>
                <p className="text-sm text-muted-foreground mt-1">
                  {importResult.projetos > 0 && (
                    <>
                      <strong>{importResult.projetos}</strong> novo
                      {importResult.projetos > 1 ? "s" : ""} projeto
                      {importResult.projetos > 1 ? "s" : ""}
                    </>
                  )}
                  {importResult.projetos > 0 && importResult.substituidos > 0 && " · "}
                  {importResult.substituidos > 0 && (
                    <>
                      <strong>{importResult.substituidos}</strong> atualizado
                      {importResult.substituidos > 1 ? "s" : ""}
                    </>
                  )}
                  {" · "}
                  <strong>{importResult.lancamentos}</strong> lançamentos.
                </p>
              </div>
              <Button onClick={handleClose}>Fechar</Button>
            </div>
          )}
        </div>

        {/* Footer ações preview */}
        {step === "preview" && parsedResult && previewSummary && (
          <div className="relative z-20 flex shrink-0 justify-end gap-3 border-t border-border bg-card p-4">
            <Button variant="outline" onClick={handleClose}>
              Cancelar
            </Button>
            <Button onClick={handleConfirm} className="gap-2">
              <CheckCircle className="w-4 h-4" />
              Confirmar importação ({previewSummary.totalProjetos} projeto
              {previewSummary.totalProjetos > 1 ? "s" : ""})
            </Button>
          </div>
        )}
      </div>

      {/* Modal aninhado pra cadastro de custom lawyers */}
      <CustomLawyersManager
        open={customLawyersOpen}
        onClose={() => setCustomLawyersOpen(false)}
        onChanged={handleCustomLawyersChanged}
        suggestedNames={parsedResult?.colaboradoresSemCusto ?? []}
      />
    </div>
  );

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setIsOpen(true)}
        className="gap-2 border-primary/30 hover:border-primary hover:bg-primary/5"
      >
        <FileSpreadsheet className="w-4 h-4" />
        Importar Atos
      </Button>

      {isOpen && typeof document !== "undefined"
        ? createPortal(modalContent, document.body)
        : null}
    </>
  );
}
