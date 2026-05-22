import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X, Download, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ContratoViewerProps {
  filename: string;
  signedUrl: string;
  notas: string | null;
  onClose: () => void;
}

export function ContratoViewer({ filename, signedUrl, notas, onClose }: ContratoViewerProps) {
  const isPdf = filename.toLowerCase().endsWith(".pdf");
  const [isVisible, setIsVisible] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

  const handleClose = () => {
    setIsClosing(true);
  };

  // Dispara a animação de entrada no próximo frame
  useEffect(() => {
    const timer = requestAnimationFrame(() => setIsVisible(true));
    return () => cancelAnimationFrame(timer);
  }, []);

  // Quando isClosing disparar, espera a animação terminar e desmonta
  useEffect(() => {
    if (!isClosing) return;
    const timer = setTimeout(onClose, 220);
    return () => clearTimeout(timer);
  }, [isClosing, onClose]);

  // Fecha também com Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") handleClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const modal = (
    <div
      className={[
        "fixed inset-0 z-[9999] isolate flex flex-col",
        "transition-[opacity,backdrop-filter] duration-200 ease-in-out",
        isClosing || !isVisible
          ? "opacity-0 backdrop-blur-none"
          : "opacity-100 backdrop-blur-sm",
        "bg-background/95",
      ].join(" ")}
      onClick={handleClose}
    >
      <div
        className={[
          "flex flex-col h-full",
          "transition-transform duration-200 ease-in-out",
          isClosing ? "-translate-y-3" : isVisible ? "translate-y-0" : "translate-y-3",
        ].join(" ")}
        style={{ willChange: "transform" }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-3 border-b border-border bg-card shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
            <span className="text-sm font-medium text-foreground truncate">{filename}</span>
            {notas && (
              <span className="text-xs text-muted-foreground truncate hidden sm:block">
                · {notas}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <a href={signedUrl} download={filename} target="_blank" rel="noopener noreferrer">
              <Button variant="outline" size="sm" className="gap-1.5">
                <Download className="w-3.5 h-3.5" />
                Baixar
              </Button>
            </a>
            <Button variant="ghost" size="icon" onClick={handleClose}>
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Conteúdo */}
        <div className="flex-1 overflow-hidden">
          {isPdf ? (
            <iframe
              src={signedUrl}
              className="w-full h-full border-0"
              title={filename}
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-full gap-4 text-center px-6">
              <div className="w-16 h-16 rounded-2xl bg-muted/50 flex items-center justify-center">
                <FileText className="w-8 h-8 text-muted-foreground/50" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium text-foreground">
                  Pré-visualização não disponível para Word
                </p>
                <p className="text-xs text-muted-foreground">
                  Baixe o arquivo para abrir no Word ou Google Docs.
                </p>
              </div>
              <a href={signedUrl} download={filename} target="_blank" rel="noopener noreferrer">
                <Button className="gap-2">
                  <Download className="w-4 h-4" />
                  Baixar {filename}
                </Button>
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return typeof document !== "undefined"
    ? createPortal(modal, document.body)
    : null;
}
