import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import type { ProspeccaoItem, StatusGeral } from "@/hooks/use-prospeccao-data";

const STATUS_LABEL: Record<StatusGeral, string> = {
  em_dia: "Em dia",
  em_espera: "Em espera",
  concluido: "Concluído",
  sem_status: "Sem status",
};

const STATUS_CLASS: Record<StatusGeral, string> = {
  em_dia: "bg-success/10 text-success-foreground border-success/20",
  em_espera: "bg-[#378ADD]/10 text-[#378ADD] border-[#378ADD]/20",
  concluido: "bg-muted text-muted-foreground border-border",
  sem_status: "bg-warning/10 text-warning-foreground border-warning/20",
};

function dataCurta(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

function diasDesde(iso: string | null | undefined) {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

/**
 * Lista as oportunidades de uma barra clicada num gráfico do funil.
 * `mostrarMotivo` troca a coluna de última movimentação pelo motivo registrado (encerramentos).
 */
export function ListaOportunidades({
  titulo,
  cor,
  itens,
  mostrarMotivo = false,
  onFechar,
}: {
  titulo: string;
  cor: string;
  itens: ProspeccaoItem[];
  mostrarMotivo?: boolean;
  onFechar: () => void;
}) {
  const ordenados = [...itens].sort((a, b) => {
    const dono = (a.owner ?? "").localeCompare(b.owner ?? "");
    return dono !== 0 ? dono : new Date(a.modifiedAt).getTime() - new Date(b.modifiedAt).getTime();
  });

  return (
    <div className="mt-4 border-t border-border pt-3">
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: cor }} />
          <h4 className="text-sm font-semibold text-foreground">
            {titulo} <span className="text-muted-foreground font-normal">({itens.length})</span>
          </h4>
        </div>
        <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={onFechar}>
          <X className="w-3.5 h-3.5" /> Fechar
        </Button>
      </div>

      {itens.length === 0 ? (
        <p className="text-xs text-muted-foreground py-3">Nenhuma oportunidade nesta categoria.</p>
      ) : (
        <div className="max-h-[360px] overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Projeto</TableHead>
                <TableHead>Responsável</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Criado em</TableHead>
                {mostrarMotivo ? <TableHead>Motivo</TableHead> : <TableHead>Última movimentação</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {ordenados.map((i) => {
                const parado = diasDesde(i.modifiedAt);
                return (
                  <TableRow key={i.gid}>
                    <TableCell className="font-medium">
                      <a
                        href={`https://app.asana.com/0/${i.gid}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:underline text-foreground"
                      >
                        {i.name}
                      </a>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{i.owner ?? "Sem responsável"}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`text-xs ${STATUS_CLASS[i.statusGeral]}`}>
                        {STATUS_LABEL[i.statusGeral]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs whitespace-nowrap">{dataCurta(i.createdAt)}</TableCell>
                    {mostrarMotivo ? (
                      <TableCell className="text-xs text-muted-foreground max-w-[320px]">
                        <span className="line-clamp-2" title={i.motivo || undefined}>{i.motivo || "—"}</span>
                      </TableCell>
                    ) : (
                      <TableCell className="text-xs whitespace-nowrap">
                        <span className={parado !== null && parado > 14 ? "text-destructive font-medium" : "text-muted-foreground"}>
                          {dataCurta(i.modifiedAt)}
                          {parado !== null && ` (${parado}d)`}
                        </span>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
