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

  const handleClose = () => setIsClosing(true);

  // Dois frames para garantir que o estado inicial (invisible) seja pintado antes de animar
  useEffect(() => {
    const r1 = requestAnimationFrame(() => {
      requestAnimationFrame(() => setIsVisible(true));
    });
    return () => cancelAnimationFrame(r1);
  }, []);

  // Espera animação de saída terminar antes de desmontar
  useEffect(() => {
    if (!isClosing) return;
    const t = setTimeout(onClose, 220);
    return () => clearTimeout(t);
  }, [isClosing, onClose]);

  // Fecha com Esc
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") handleClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const active = isVisible && !isClosing;

  const modal = (
    <div
      style={{
        opacity: active ? 1 : 0,
        transition: "opacity 200ms ease-in-out",
      }}
      className="fixed inset-0 z-[9999] isolate flex flex-col bg-background/95 backdrop-blur-sm"
      onClick={handleClose}
    >
      <div
        style={{
          transform: active ? "translateY(0)" : isClosing ? "translateY(-10px)" : "translateY(10px)",
          transition: "transform 200ms ease-in-out",
        }}
        className="flex flex-col h-full"
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
