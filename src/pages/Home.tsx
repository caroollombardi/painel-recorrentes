import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { BarChart3, Database, ArrowLeft, UsersRound, LogOut, Calendar, CheckCircle2, Loader2 } from "lucide-react";
import { FileUpload } from "@/components/dashboard/FileUpload";
import { parseXLSXData } from "@/lib/xlsx-parser";
import { importTimeEntriesFromXLSX } from "@/lib/unified-import";
import { DashboardData } from "@/lib/data-parser";
import { useAuth } from "@/contexts/AuthContext";
import { useMonthlySnapshots } from "@/hooks/use-monthly-snapshots";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import wsaLogo from "@/assets/wsa-logo.png";

interface HomeProps {
  onDataUpdate: (data: DashboardData, fileName?: string) => void;
  hasData: boolean;
}

const MONTH_SHORT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

export function Home({ onDataUpdate, hasData }: HomeProps) {
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const { availableMonths } = useMonthlySnapshots();
  const { toast } = useToast();
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [importResult, setImportResult] = useState<{ clients: boolean; hours: boolean; hoursCount: number } | null>(null);

  const handleFileSelect = useCallback(async (file: File) => {
    setIsProcessing(true);
    setImportResult(null);

    try {
      const buffer = await file.arrayBuffer();

      // 1. Parse for recurring clients dashboard
      const dashboardData = parseXLSXData(buffer);
      onDataUpdate(dashboardData, file.name);

      // 2. Also extract time entries for hours dashboard (current month)
      const now = new Date();
      const hoursResult = await importTimeEntriesFromXLSX(buffer, now.getMonth(), now.getFullYear());

      setLastUpdate(new Date());
      setImportResult({
        clients: true,
        hours: hoursResult.success,
        hoursCount: hoursResult.count,
      });

      toast({
        title: "Importação concluída",
        description: `Clientes recorrentes atualizados. ${hoursResult.success ? `${hoursResult.count} registros de horas importados.` : 'Nenhum registro de horas encontrado.'}`,
      });

      setTimeout(() => setIsProcessing(false), 500);
    } catch (error) {
      console.error('Error processing file:', error);
      setIsProcessing(false);
      toast({
        title: "Erro na importação",
        description: "Falha ao processar o arquivo. Verifique o formato.",
        variant: "destructive",
      });
    }
  }, [onDataUpdate, toast]);

  const handleLogout = async () => {
    await signOut();
    navigate('/auth');
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/50 backdrop-blur-sm">
        <div className="container py-4">
          <div className="flex items-center justify-between">
            <img src={wsaLogo} alt="Wolff e Scripes Advogados" className="h-10 object-contain" />
            <div className="flex items-center gap-2">
              {hasData && (
                <Button variant="ghost" size="sm" onClick={() => navigate('/')} className="text-muted-foreground hover:text-foreground">
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Dashboard
                </Button>
              )}
              <Button variant="ghost" size="sm" onClick={() => navigate('/users')} className="text-muted-foreground hover:text-foreground">
                <UsersRound className="w-4 h-4 mr-2" />
                Usuários
              </Button>
              <Button variant="ghost" size="sm" onClick={handleLogout} className="text-muted-foreground hover:text-foreground">
                <LogOut className="w-4 h-4 mr-2" />
                Sair
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="container py-12">
        <div className="max-w-2xl mx-auto space-y-8">
          <div className="text-center space-y-3">
            <h1 className="text-3xl md:text-4xl font-display font-bold tracking-tight">
              Atualizar <span className="text-primary">Dados</span>
            </h1>
            <p className="text-muted-foreground text-lg">
              Importe a planilha do Asana para atualizar todos os dashboards de uma vez
            </p>
          </div>

          {/* Single Upload Card */}
          <div className="bg-card rounded-xl border border-border p-8 shadow-sm">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 rounded-lg bg-primary/10">
                <Database className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-foreground">
                  Importar Planilha
                </h2>
                <p className="text-sm text-muted-foreground">
                  Um único arquivo atualiza Clientes Recorrentes e Lançamento de Horas
                </p>
              </div>
            </div>

            <FileUpload onFileSelect={handleFileSelect} isProcessing={isProcessing} />

            {/* Import result feedback */}
            {importResult && (
              <div className="mt-6 space-y-2 p-4 rounded-lg bg-muted/50 border border-border">
                <div className="flex items-center gap-2 text-sm">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  <span className="text-foreground font-medium">Clientes Recorrentes</span>
                  <span className="text-muted-foreground">— atualizado</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <CheckCircle2 className={`w-4 h-4 ${importResult.hours ? 'text-emerald-500' : 'text-muted-foreground'}`} />
                  <span className="text-foreground font-medium">Lançamento de Horas</span>
                  <span className="text-muted-foreground">
                    — {importResult.hours ? `${importResult.hoursCount} registros` : 'sem registros'}
                  </span>
                </div>
              </div>
            )}

            {lastUpdate && (
              <p className="text-xs text-muted-foreground text-center mt-4">
                Última atualização: {lastUpdate.toLocaleString('pt-BR')}
              </p>
            )}
          </div>

          {/* Historical Data */}
          {availableMonths.length > 0 && (
            <div className="bg-card rounded-lg border border-border p-5">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-muted">
                  <Calendar className="w-4 h-4 text-muted-foreground" />
                </div>
                <div>
                  <h3 className="font-medium text-foreground">Dados Históricos Disponíveis</h3>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {availableMonths
                      .sort((a, b) => a.year === b.year ? a.month - b.month : a.year - b.year)
                      .map(({ month, year }) => (
                        <span key={`${month}-${year}`} className="text-xs px-2 py-1 rounded-full bg-primary/10 text-primary font-medium">
                          {MONTH_SHORT[month - 1]}/{year}
                        </span>
                      ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {hasData && (
            <div className="text-center">
              <button
                onClick={() => navigate('/')}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-lg text-white font-medium transition-transform hover:scale-105 bg-primary"
              >
                <BarChart3 className="w-5 h-5" />
                ← Voltar ao Dashboard
              </button>
            </div>
          )}
        </div>
      </main>

      <footer className="border-t border-border bg-card/50 py-6 mt-auto">
        <div className="container text-center text-sm text-muted-foreground">
          Wolff e Scripes Advogados • Dashboard de Clientes Recorrentes
        </div>
      </footer>
    </div>
  );
}

export default Home;
