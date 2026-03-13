import { useState, useRef } from "react";
import { Upload, X, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface HoursCSVImportProps {
  onImport: (csvText: string) => Promise<void>;
  onClose: () => void;
  selectedMonth: number;
  selectedYear: number;
  embedded?: boolean;
}

const MONTH_NAMES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

export function HoursCSVImport({ onImport, onClose, selectedMonth, selectedYear, embedded = false }: HoursCSVImportProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    if (!file.name.endsWith(".csv")) {
      return;
    }
    setFileName(file.name);
    setIsImporting(true);
    const text = await file.text();
    await onImport(text);
    setIsImporting(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  return (
    <div className="bg-card rounded-lg border border-border p-6 shadow-sm animate-fade-in">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <FileText className="w-5 h-5 text-primary" />
          <h3 className="text-lg font-display font-semibold text-foreground">
            Importar CSV — {MONTH_NAMES[selectedMonth]} {selectedYear}
          </h3>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="w-4 h-4" />
        </Button>
      </div>

      <p className="text-sm text-muted-foreground mb-4">
        Arraste um CSV exportado do Asana com as colunas: Nome da Tarefa, Responsável, Projeto, Data de Conclusão, Horas Lançadas, Cliente, Tipo de Atividade.
      </p>

      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => fileRef.current?.click()}
        className={cn(
          "border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors",
          isDragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-muted/30"
        )}
      >
        <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={e => { if (e.target.files?.[0]) handleFile(e.target.files[0]); }} />
        {isImporting ? (
          <div className="flex items-center justify-center gap-2">
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary" />
            <span className="text-sm text-muted-foreground">Importando {fileName}...</span>
          </div>
        ) : (
          <>
            <Upload className="w-8 h-8 mx-auto text-muted-foreground/50 mb-2" />
            <p className="text-sm text-muted-foreground">Arraste ou clique para selecionar um arquivo CSV</p>
          </>
        )}
      </div>
    </div>
  );
}
