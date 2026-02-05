import { useState, useCallback } from "react";
import { Upload, FileSpreadsheet, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface FileUploadProps {
  onFileSelect: (file: File) => void;
  isProcessing: boolean;
}

export function FileUpload({ onFileSelect, isProcessing }: FileUploadProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      const file = files[0];
      if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls') || file.name.endsWith('.csv')) {
        setSelectedFile(file);
      }
    }
  }, []);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      setSelectedFile(files[0]);
    }
  }, []);

  const handleUpload = useCallback(() => {
    if (selectedFile) {
      onFileSelect(selectedFile);
    }
  }, [selectedFile, onFileSelect]);

  return (
    <div className="space-y-6">
      {/* Drop zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={cn(
          "relative border-2 border-dashed rounded-xl p-12 transition-all duration-200 cursor-pointer",
          isDragOver
            ? "border-primary bg-primary/5 scale-[1.02]"
            : "border-border hover:border-primary/50 hover:bg-muted/30",
          selectedFile && "border-emerald-500 bg-emerald-500/5"
        )}
      >
        <input
          type="file"
          accept=".xlsx,.xls,.csv"
          onChange={handleFileInput}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        />
        
        <div className="flex flex-col items-center justify-center text-center space-y-4">
          {selectedFile ? (
            <>
              <div className="p-4 rounded-full bg-emerald-500/10">
                <FileSpreadsheet className="w-10 h-10 text-emerald-600" />
              </div>
              <div>
                <p className="text-lg font-medium text-foreground">
                  {selectedFile.name}
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  {(selectedFile.size / 1024).toFixed(1)} KB • Pronto para processar
                </p>
              </div>
            </>
          ) : (
            <>
              <div className="p-4 rounded-full bg-muted">
                <Upload className="w-10 h-10 text-muted-foreground" />
              </div>
              <div>
                <p className="text-lg font-medium text-foreground">
                  Arraste sua planilha aqui
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  ou clique para selecionar • Formatos: XLSX, XLS, CSV
                </p>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Action button */}
      {selectedFile && (
        <Button
          onClick={handleUpload}
          disabled={isProcessing}
          size="lg"
          className="w-full h-12 text-base font-medium"
          style={{ backgroundColor: '#FB7435' }}
        >
          {isProcessing ? (
            <>
              <Loader2 className="w-5 h-5 mr-2 animate-spin" />
              Processando dados...
            </>
          ) : (
            <>
              <Check className="w-5 h-5 mr-2" />
              Atualizar Dashboard
            </>
          )}
        </Button>
      )}
    </div>
  );
}
