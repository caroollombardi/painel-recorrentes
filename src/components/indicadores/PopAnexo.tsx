import { useEffect, useRef, useState } from "react";
import { FileText, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

// POP anexado ao indicador de uma área. Fica no bucket privado "pops",
// em "<area>/pop.pdf". Todos os usuários logados abrem; só admin, sócio
// e gestão anexam ou substituem.

const BUCKET = "pops";

export function PopAnexo({ area, titulo }: { area: string; titulo: string }) {
  const { isAdmin, hasRole } = useAuth();
  const { toast } = useToast();
  const podeAnexar = isAdmin || hasRole("socio") || hasRole("gestao");
  const caminho = `${area}/pop.pdf`;
  const [atualizadoEm, setAtualizadoEm] = useState<Date | null>(null);
  const [existe, setExiste] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const campo = useRef<HTMLInputElement>(null);

  const carregar = async () => {
    const { data } = await supabase.storage.from(BUCKET).list(area, { search: "pop.pdf" });
    const arq = data?.find((f) => f.name === "pop.pdf");
    setExiste(!!arq);
    setAtualizadoEm(arq?.updated_at ? new Date(arq.updated_at) : null);
  };

  useEffect(() => { carregar(); }, [area]);

  const abrir = async () => {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(caminho, 300);
    if (error || !data) {
      toast({ title: "Não foi possível abrir o POP", description: error?.message, variant: "destructive" });
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener");
  };

  const anexar = async (arquivo?: File) => {
    if (!arquivo) return;
    if (arquivo.type !== "application/pdf") {
      toast({ title: "Envie o POP em PDF", variant: "destructive" });
      return;
    }
    setEnviando(true);
    const { error } = await supabase.storage.from(BUCKET)
      .upload(caminho, arquivo, { upsert: true, contentType: "application/pdf" });
    setEnviando(false);
    if (campo.current) campo.current.value = "";
    if (error) {
      toast({ title: "Não foi possível anexar o POP", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: existe ? "POP substituído" : "POP anexado", description: titulo });
    carregar();
  };

  if (!existe && !podeAnexar) return null;

  return (
    <div className="flex items-center gap-2">
      {existe && (
        <Button variant="outline" size="sm" onClick={abrir}
          title={atualizadoEm ? `Atualizado em ${atualizadoEm.toLocaleDateString("pt-BR")}` : undefined}>
          <FileText className="w-4 h-4 mr-2" />Ver POP
        </Button>
      )}
      {podeAnexar && (
        <>
          <input ref={campo} type="file" accept="application/pdf" className="hidden"
            onChange={(e) => anexar(e.target.files?.[0])} />
          <Button variant="ghost" size="sm" disabled={enviando} onClick={() => campo.current?.click()}>
            <Upload className="w-4 h-4 mr-2" />
            {enviando ? "Enviando…" : existe ? "Substituir POP" : "Anexar POP"}
          </Button>
        </>
      )}
    </div>
  );
}
