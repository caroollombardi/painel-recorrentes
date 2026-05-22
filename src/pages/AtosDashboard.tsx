import React, { useMemo, useState } from "react";
import { FolderKanban, UserCog, TrendingUp, TrendingDown, Minus, Wallet, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { AtosImport } from "@/components/atos/AtosImport";
import { AtosProjectsList } from "@/components/atos/AtosProjectsList";
import { AtosProjectDetail } from "@/components/atos/AtosProjectDetail";
import { CustomLawyersManager } from "@/components/atos/CustomLawyersManager";
import { useAtosData } from "@/hooks/use-atos-data";
import { calcularProjeto } from "@/lib/atos-parser";

function brl(value: number) {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  });
}

function fmtHoras(min: number): string {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export default function AtosDashboard() {
  const { projetos, isLoading, error, reload } = useAtosData();
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    null
  );
  const [customOpen, setCustomOpen] = useState(false);

  const selected = useMemo(
    () => projetos.find(p => p.projeto.id === selectedProjectId) ?? null,
    [projetos, selectedProjectId]
  );

  const lastImport = useMemo(() => {
    if (projetos.length === 0) return null;
    const latest = projetos.reduce((max, p) =>
      p.projeto.updated_at > max ? p.projeto.updated_at : max,
      projetos[0].projeto.updated_at
    );
    return new Date(latest).toLocaleDateString("pt-BR", {
      day: "2-digit", month: "2-digit", year: "numeric",
    });
  }, [projetos]);

  // Agregados globais
  const stats = useMemo(() => {
    let totalValorCombinado = 0;
    let totalValorHoras = 0;
    let totalMinutos = 0;
    let positivos = 0;
    let negativos = 0;
    let neutros = 0;
    let semValor = 0;

    for (const p of projetos) {
      const c = calcularProjeto(p.projeto, p.lancamentos);
      totalValorCombinado += c.valorCombinado;
      totalValorHoras += c.valorHoras;
      totalMinutos += c.totalMinutos;
      if (c.valorCombinado === 0) {
        semValor++;
      } else if (c.resultado > 0) positivos++;
      else if (c.resultado < 0) negativos++;
      else neutros++;
    }

    return {
      totalValorCombinado,
      totalValorHoras,
      totalMinutos,
      resultado: totalValorCombinado - totalValorHoras,
      positivos,
      negativos,
      neutros,
      semValor,
    };
  }, [projetos]);

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader activeTab={"atos" as never} />

      <div className="container py-6">
        <div className="space-y-6">
          {/* Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-display font-semibold text-foreground">
                Calculadora de Atos
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Compare valor fechado em contrato vs custo das horas trabalhadas
                {lastImport && (
                  <span className="ml-2 text-muted-foreground/60">· última importação: {lastImport}</span>
                )}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCustomOpen(true)}
                className="gap-2"
              >
                <UserCog className="w-4 h-4" />
                Colaboradores
              </Button>
              <AtosImport onImportComplete={reload} />
            </div>
          </div>

          {/* Loading / Error / Empty */}
          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
          ) : error ? (
            <div className="p-4 bg-destructive/10 border border-destructive/30 rounded-lg">
              <p className="text-sm text-destructive">Erro: {error}</p>
            </div>
          ) : projetos.length === 0 ? (
            <div className="text-center py-20 space-y-6">
              <div className="mx-auto w-24 h-24 rounded-2xl bg-muted/50 flex items-center justify-center">
                <FolderKanban className="w-12 h-12 text-muted-foreground/30" />
              </div>
              <div className="space-y-2">
                <h2 className="text-xl font-display font-bold text-foreground">
                  Nenhum ato importado ainda
                </h2>
                <p className="text-muted-foreground max-w-md mx-auto text-sm">
                  Exporte a planilha de Time Tracking do Asana e clique em
                  "Importar Atos" pra começar. Você pode importar vários
                  projetos de uma vez.
                </p>
              </div>
            </div>
          ) : (
            <>
              {/* Stats agregados */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <StatCard
                  icon={Wallet}
                  label="Valor combinado (soma)"
                  value={brl(stats.totalValorCombinado)}
                  hint={`${projetos.length - stats.semValor} de ${projetos.length} projeto(s) com valor`}
                />
                <StatCard
                  icon={Clock}
                  label="Valor das horas (soma)"
                  value={brl(stats.totalValorHoras)}
                  hint={`${fmtHoras(stats.totalMinutos)} totais`}
                />
                <StatCard
                  icon={stats.resultado >= 0 ? TrendingUp : TrendingDown}
                  label="Resultado vs horas (soma)"
                  value={`${stats.resultado >= 0 ? "+" : ""}${brl(stats.resultado)}`}
                  valueClass={
                    stats.resultado > 0
                      ? "text-success-foreground"
                      : stats.resultado < 0
                        ? "text-destructive"
                        : ""
                  }
                  hint={
                    stats.totalValorCombinado > 0
                      ? `${((stats.resultado / stats.totalValorCombinado) * 100).toFixed(1)}% do total combinado`
                      : "—"
                  }
                />
                <StatCard
                  icon={FolderKanban}
                  label="Distribuição de projetos"
                  value={
                    <div className="flex items-center gap-3 mt-0.5">
                      <div className="flex items-center gap-1 text-success-foreground">
                        <TrendingUp className="w-4 h-4" />
                        <span className="text-lg font-bold">{stats.positivos}</span>
                        <span className="text-xs font-normal">lucro</span>
                      </div>
                      <div className="flex items-center gap-1 text-destructive">
                        <TrendingDown className="w-4 h-4" />
                        <span className="text-lg font-bold">{stats.negativos}</span>
                        <span className="text-xs font-normal">déficit</span>
                      </div>
                      {stats.neutros > 0 && (
                        <div className="flex items-center gap-1 text-muted-foreground">
                          <Minus className="w-3.5 h-3.5" />
                          <span className="text-lg font-bold">{stats.neutros}</span>
                        </div>
                      )}
                    </div>
                  }
                  hint={
                    stats.semValor > 0
                      ? `${stats.semValor} sem valor combinado definido`
                      : `${projetos.length} projeto${projetos.length > 1 ? "s" : ""} no total`
                  }
                />
              </div>

              {/* Lista de projetos */}
              <section className="bg-card rounded-xl border border-border p-6 shadow-sm">
                <h3 className="text-base font-display font-semibold text-foreground mb-1">
                  Projetos importados
                </h3>
                <p className="text-xs text-muted-foreground mb-4">
                  Clique em um projeto pra ver o detalhamento por colaborador,
                  editar o valor combinado ou alterar configurações.
                </p>
                <AtosProjectsList
                  projetos={projetos}
                  onSelect={setSelectedProjectId}
                />
              </section>
            </>
          )}
        </div>
      </div>

      {/* Modal de detalhe */}
      {selected && (
        <AtosProjectDetail
          projeto={selected.projeto}
          lancamentos={selected.lancamentos}
          onClose={() => setSelectedProjectId(null)}
          onChanged={reload}
        />
      )}

      {/* Modal de colaboradores */}
      <CustomLawyersManager
        open={customOpen}
        onClose={() => setCustomOpen(false)}
        onChanged={reload}
      />

      <footer className="border-t border-border bg-card/50 py-6 mt-6">
        <div className="container text-center text-sm text-muted-foreground">
          <a
            href="https://wolffescripes.com.br"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-foreground transition-colors"
          >
            Wolff e Scripes Advogados
          </a>{" "}
          &bull; Calculadora de Atos
        </div>
      </footer>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  valueClass,
}: {
  icon: any;
  label: string;
  value: string | React.ReactNode;
  hint?: string;
  valueClass?: string;
}) {
  return (
    <div className="bg-card rounded-xl border border-border p-4 shadow-sm">
      <div className="flex items-center gap-2 mb-2">
        <div className="p-1.5 rounded-md bg-primary/10">
          <Icon className="w-3.5 h-3.5 text-primary" />
        </div>
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
      {typeof value === "string" ? (
        <p className={`text-lg font-bold text-foreground ${valueClass || ""}`.trim()}>
          {value}
        </p>
      ) : (
        value
      )}
      {hint && <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>}
    </div>
  );
}
