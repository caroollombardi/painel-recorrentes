import { useState, useRef, useMemo, useEffect } from "react";
import { createPortal } from "react-dom";
import { Upload, FileSpreadsheet, X, CheckCircle, AlertTriangle, Info, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { parseEasyJurCSV, importEasyJurEntries, type ParsedEasyJurEntry } from "@/lib/easyjur-parser";
import { mergeEasyJurIntoDashboard } from "@/lib/merge-easyjur-dashboard";
import { toast } from "@/hooks/use-toast";

interface EasyJurImportProps {
  selectedMonth: number;
  selectedYear: number;
  onImportComplete: () => void;
}

const MONTH_NAMES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

const EASYJUR_PEOPLE = [
  { name: "Natalí Perera Batista", shortName: "Natalí", hourlyRate: 730 },
  { name: "Aline Morozinski", shortName: "Aline", hourlyRate: 450 },
];

const EXPECTED_COLUMNS = [
  { name: "ID", desc: "Identificador do lançamento" },
  { name: "Responsavel", desc: "Nome do profissional" },
  { name: "Cliente", desc: "Nome do cliente" },
  { name: "Descricao", desc: "Descrição da atividade realizada" },
  { name: "Data Timesheet", desc: "Data do lançamento (DD/MM/AAAA)" },
  { name: "Data Conclusao", desc: "Data de conclusão" },
  { name: "Timesheet", desc: "Tempo lançado (HH:MM:SS)" },
  { name: "Projeto", desc: "Nome do projeto" },
  { name: "Contrato", desc: "Nome do contrato" },
  { name: "Processo", desc: "Número do processo" },
];

type ImportStep = "select-person" | "upload" | "preview" | "importing" | "done";

export function EasyJurImport({ selectedMonth, selectedYear, onImportComplete }: EasyJurImportProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [step, setStep] = useState<ImportStep>("select-person");
  const [selectedPerson, setSelectedPerson] = useState<typeof EASYJUR_PEOPLE[0] | null>(null);
  const [parsedResult, setParsedResult] = useState<ReturnType<typeof parseEasyJurCSV> | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [showColumns, setShowColumns] = useState(false);
  const [importResult, setImportResult] = useState<{ count: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const resetState = () => {
    setStep("select-person");
    setSelectedPerson(null);
    setParsedResult(null);
    setIsDragging(false);
    setShowColumns(false);
    setImportResult(null);
  };

  const handleClose = () => {
    setIsOpen(false);
    resetState();
  };

  const handleFile = async (file: File) => {
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (!["csv", "xlsx", "xls"].includes(ext || "")) {
      toast({ title: "Formato inválido", description: "Selecione um arquivo CSV ou Excel (.csv, .xlsx, .xls)", variant: "destructive" });
      return;
    }

    let text: string;
    if (ext === "csv") {
      // Try reading as UTF-8 first, then Latin-1
      text = await file.text();
      // If garbled (common with EasyJur), try Latin-1
      if (text.includes("�")) {
        const buffer = await file.arrayBuffer();
        const decoder = new TextDecoder("latin1");
        text = decoder.decode(buffer);
      }
    } else {
      // XLSX - use xlsx library
      const XLSX = await import("xlsx");
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      // Convert to CSV with semicolon separator to maintain format
      text = XLSX.utils.sheet_to_csv(sheet, { FS: ";" });
    }

    const result = parseEasyJurCSV(text);
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

  const handleConfirmImport = async () => {
    if (!parsedResult || !selectedPerson) return;
    setStep("importing");

    const result = await importEasyJurEntries(
      parsedResult.entries,
      selectedPerson.name,
      selectedMonth,
      selectedYear
    );

    if (result.success) {
      setImportResult({ count: result.count });
      setStep("done");
      toast({
        title: "Importação concluída",
        description: `${result.count} lançamentos de ${selectedPerson.shortName} importados com sucesso.`,
      });
      onImportComplete();
    } else {
      toast({
        title: "Erro na importação",
        description: result.error || "Falha ao salvar dados no banco.",
        variant: "destructive",
      });
      setStep("preview");
    }
  };

  // Preview summary
  const previewSummary = useMemo(() => {
    if (!parsedResult?.entries.length) return null;
    const entries = parsedResult.entries;
    const totalHours = parsedResult.totalHours;
    const totalValue = selectedPerson ? totalHours * selectedPerson.hourlyRate : 0;
    const uniqueDates = new Set(entries.map(e => e.completed_date).filter(Boolean));
    const uniqueClients = new Set(entries.map(e => e.client).filter(Boolean));
    const activityTypes = new Map<string, number>();
    entries.forEach(e => {
      const type = e.activity_type || "Outros";
      activityTypes.set(type, (activityTypes.get(type) || 0) + e.hours_logged);
    });

    return {
      totalEntries: entries.length,
      totalHours,
      totalValue,
      uniqueDates: uniqueDates.size,
      uniqueClients: Array.from(uniqueClients),
      activityTypes: Array.from(activityTypes.entries()).sort((a, b) => b[1] - a[1]),
    };
  }, [parsedResult, selectedPerson]);

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
      className="fixed inset-0 z-[9999] isolate flex items-center justify-center bg-background/80 backdrop-blur-sm animate-fade-in"
      onClick={handleClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="relative z-10 mx-4 flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <FileSpreadsheet className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-display font-semibold text-foreground">
                Importar Lançamentos EasyJur
              </h2>
              <p className="text-sm text-muted-foreground">
                {MONTH_NAMES[selectedMonth]} {selectedYear}
              </p>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={handleClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>

        <div className="p-6 space-y-6 overflow-y-auto flex-1 min-h-0">
          {/* Step 1: Select Person */}
          {step === "select-person" && (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-foreground mb-1">1. Selecione o profissional</h3>
                <p className="text-xs text-muted-foreground">Escolha para quem são os lançamentos da planilha</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {EASYJUR_PEOPLE.map(person => (
                  <button
                    key={person.name}
                    onClick={() => { setSelectedPerson(person); setStep("upload"); }}
                    className={cn(
                      "flex items-center gap-3 p-4 rounded-lg border-2 transition-all text-left",
                      "hover:border-primary hover:bg-primary/5",
                      "border-border bg-background"
                    )}
                  >
                    <div className="p-2 rounded-full bg-muted">
                      <User className="w-5 h-5 text-foreground" />
                    </div>
                    <div>
                      <p className="font-semibold text-foreground">{person.shortName}</p>
                      <p className="text-xs text-muted-foreground">
                        R$ {person.hourlyRate.toLocaleString("pt-BR")}/hora • Meta: 6h/dia
                      </p>
                    </div>
                  </button>
                ))}
              </div>

              {/* Column info */}
              <div className="pt-2">
                <button
                  onClick={() => setShowColumns(!showColumns)}
                  className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Info className="w-3.5 h-3.5" />
                  {showColumns ? "Ocultar" : "Ver"} colunas esperadas da planilha
                </button>
                {showColumns && (
                  <div className="mt-2 p-3 bg-muted/30 rounded-lg border border-border">
                    <p className="text-xs font-medium text-foreground mb-2">Colunas aceitas (separadas por ponto e vírgula):</p>
                    <div className="grid grid-cols-2 gap-1">
                      {EXPECTED_COLUMNS.map(col => (
                        <div key={col.name} className="text-xs">
                          <span className="font-mono text-primary">{col.name}</span>
                          <span className="text-muted-foreground"> — {col.desc}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Step 2: Upload */}
          {step === "upload" && selectedPerson && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-foreground mb-1">2. Upload da planilha</h3>
                  <p className="text-xs text-muted-foreground">
                    Planilha EasyJur de <strong>{selectedPerson.shortName}</strong>
                  </p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => { setStep("select-person"); setSelectedPerson(null); }}>
                  ← Voltar
                </Button>
              </div>

              <div
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                onClick={() => fileRef.current?.click()}
                className={cn(
                  "border-2 border-dashed rounded-lg p-10 text-center cursor-pointer transition-all",
                  isDragging ? "border-primary bg-primary/5 scale-[1.01]" : "border-border hover:border-primary/50 hover:bg-muted/30"
                )}
              >
                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  className="hidden"
                  onChange={e => { if (e.target.files?.[0]) handleFile(e.target.files[0]); }}
                />
                <Upload className="w-10 h-10 mx-auto text-muted-foreground/40 mb-3" />
                <p className="text-sm text-muted-foreground">
                  Arraste ou clique para selecionar
                </p>
                <p className="text-xs text-muted-foreground/70 mt-1">
                  Formatos aceitos: .csv, .xlsx, .xls
                </p>
              </div>

              {/* Show errors if parsing failed */}
              {parsedResult && !parsedResult.valid && (
                <div className="p-4 bg-destructive/10 border border-destructive/30 rounded-lg space-y-2">
                  <div className="flex items-center gap-2 text-destructive">
                    <AlertTriangle className="w-4 h-4" />
                    <span className="text-sm font-semibold">Erro na leitura do arquivo</span>
                  </div>
                  {parsedResult.errors.map((err, i) => (
                    <p key={i} className="text-xs text-destructive/80">{err}</p>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Step 3: Preview */}
          {step === "preview" && parsedResult && selectedPerson && previewSummary && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-foreground mb-1">3. Pré-visualização</h3>
                  <p className="text-xs text-muted-foreground">
                    Confira os dados antes de importar
                  </p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => { setStep("upload"); setParsedResult(null); }}>
                  ← Voltar
                </Button>
              </div>

              {/* Person badge */}
              <div className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg border border-border">
                <User className="w-5 h-5 text-primary" />
                <div>
                  <p className="font-semibold text-sm text-foreground">{selectedPerson.name}</p>
                  <p className="text-xs text-muted-foreground">
                    R$ {selectedPerson.hourlyRate}/hora
                  </p>
                </div>
              </div>

              {/* Summary cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 bg-primary/5 border border-primary/20 rounded-lg text-center">
                  <p className="text-lg font-bold text-primary">{previewSummary.totalEntries}</p>
                  <p className="text-xs text-muted-foreground">Lançamentos</p>
                </div>
                <div className="p-3 bg-primary/5 border border-primary/20 rounded-lg text-center">
                  <p className="text-lg font-bold text-primary">{previewSummary.totalHours.toFixed(1)}h</p>
                  <p className="text-xs text-muted-foreground">Total de horas</p>
                </div>
                <div className="p-3 bg-primary/5 border border-primary/20 rounded-lg text-center">
                  <p className="text-lg font-bold text-primary">
                    R$ {previewSummary.totalValue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                  </p>
                  <p className="text-xs text-muted-foreground">Valor total</p>
                </div>
                <div className="p-3 bg-primary/5 border border-primary/20 rounded-lg text-center">
                  <p className="text-lg font-bold text-primary">{previewSummary.uniqueDates}</p>
                  <p className="text-xs text-muted-foreground">Dias com lançamento</p>
                </div>
              </div>

              {/* Date range */}
              {parsedResult.dateRange && (
                <p className="text-xs text-muted-foreground">
                  Período: {formatDateBR(parsedResult.dateRange.min)} a {formatDateBR(parsedResult.dateRange.max)}
                </p>
              )}

              {/* Activity breakdown */}
              {previewSummary.activityTypes.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-foreground mb-2">Tipos de atividade:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {previewSummary.activityTypes.map(([type, hours]) => (
                      <Badge key={type} variant="secondary" className="text-xs">
                        {type}: {hours.toFixed(1)}h
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Entries table */}
              <div className="border border-border rounded-lg overflow-hidden max-h-64 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50 sticky top-0">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground">Data</th>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground">Descrição</th>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground">Projeto</th>
                      <th className="text-right px-3 py-2 font-medium text-muted-foreground">Horas</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {parsedResult.entries.map((entry, i) => (
                      <tr key={i} className="hover:bg-muted/20">
                        <td className="px-3 py-2 whitespace-nowrap text-foreground">
                          {entry.completed_date ? formatDateBR(entry.completed_date) : "—"}
                        </td>
                        <td className="px-3 py-2 text-foreground max-w-[300px] truncate" title={entry.task_name}>
                          {entry.task_name}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">{entry.project}</td>
                        <td className="px-3 py-2 text-right font-mono text-foreground">{entry.hours_logged.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Warnings */}
              {parsedResult.warnings.length > 0 && (
                <div className="p-3 bg-warning/10 border border-warning/30 rounded-lg">
                  <div className="flex items-center gap-2 text-warning-foreground mb-1">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span className="text-xs font-semibold">{parsedResult.warnings.length} aviso(s)</span>
                  </div>
                  <div className="max-h-20 overflow-y-auto">
                    {parsedResult.warnings.map((w, i) => (
                      <p key={i} className="text-xs text-muted-foreground">{w}</p>
                    ))}
                  </div>
                </div>
              )}

              {/* Notice about replacement */}
              <div className="p-3 bg-muted/30 border border-border rounded-lg flex items-start gap-2">
                <Info className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                <p className="text-xs text-muted-foreground">
                  Ao confirmar, os lançamentos anteriores de <strong>{selectedPerson.shortName}</strong> em{" "}
                  <strong>{MONTH_NAMES[selectedMonth]}/{selectedYear}</strong> serão substituídos pelos novos dados.
                </p>
              </div>

            </div>
          )}

          {/* Step 4: Importing */}
          {step === "importing" && (
            <div className="py-12 text-center space-y-4">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary mx-auto" />
              <p className="text-sm text-muted-foreground">Importando lançamentos...</p>
            </div>
          )}

          {/* Step 5: Done */}
          {step === "done" && importResult && selectedPerson && (
            <div className="py-8 text-center space-y-4">
              <div className="mx-auto w-16 h-16 rounded-full bg-success/10 flex items-center justify-center">
                <CheckCircle className="w-8 h-8 text-success" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-foreground">Importação concluída!</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  {importResult.count} lançamentos de {selectedPerson.shortName} foram importados para{" "}
                  {MONTH_NAMES[selectedMonth]}/{selectedYear}.
                </p>
              </div>
              <Button onClick={handleClose}>Fechar</Button>
            </div>
          )}
        </div>

        {/* Sticky footer with action buttons for preview step */}
        {step === "preview" && parsedResult && selectedPerson && previewSummary && (
          <div className="relative z-20 flex shrink-0 justify-end gap-3 border-t border-border bg-card p-4 shadow-[0_-8px_24px_hsl(var(--background)/0.12)]">
            <Button variant="outline" onClick={handleClose}>
              Cancelar
            </Button>
            <Button onClick={handleConfirmImport} className="gap-2">
              <CheckCircle className="w-4 h-4" />
              Confirmar importação ({previewSummary.totalEntries} registros)
            </Button>
          </div>
        )}
      </div>
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
        Importar EasyJur
      </Button>

      {isOpen && typeof document !== "undefined" ? createPortal(modalContent, document.body) : null}
    </>
  );
}

function formatDateBR(isoDate: string): string {
  const [y, m, d] = isoDate.split("-");
  return `${d}/${m}/${y}`;
}
