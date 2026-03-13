import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { BarChart3, Clock, Database, ArrowLeft, UsersRound, LogOut, Calendar, FileText } from "lucide-react";
import { FileUpload } from "@/components/dashboard/FileUpload";
import { HoursCSVImport } from "@/components/hours/HoursCSVImport";
import { parseXLSXData } from "@/lib/xlsx-parser";
import { DashboardData } from "@/lib/data-parser";
import { useAuth } from "@/contexts/AuthContext";
import { useMonthlySnapshots } from "@/hooks/use-monthly-snapshots";
import { useHoursData } from "@/hooks/use-hours-data";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import wsaLogo from "@/assets/wsa-logo.png";

interface HomeProps {
  onDataUpdate: (data: DashboardData, fileName?: string) => void;
  hasData: boolean;
}

const MONTH_NAMES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

const MONTH_SHORT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

export function Home({ onDataUpdate, hasData }: HomeProps) {
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const { availableMonths } = useMonthlySnapshots();
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  // Hours import state
  const now = new Date();
  const [hoursMonth, setHoursMonth] = useState(now.getMonth());
  const [hoursYear, setHoursYear] = useState(now.getFullYear());
  const { importCSV } = useHoursData(hoursMonth, hoursYear);
  const [lastHoursUpdate, setLastHoursUpdate] = useState<Date | null>(null);

  const handleFileSelect = useCallback(async (file: File) => {
    setIsProcessing(true);
    try {
      const buffer = await file.arrayBuffer();
      const data = parseXLSXData(buffer);
      onDataUpdate(data, file.name);
      setLastUpdate(new Date());
      setTimeout(() => {
        setIsProcessing(false);
      }, 800);
    } catch (error) {
      console.error('Error processing file:', error);
      setIsProcessing(false);
    }
  }, [onDataUpdate]);

  const handleHoursImport = useCallback(async (csvText: string) => {
    const success = await importCSV(csvText, hoursMonth, hoursYear);
    if (success) {
      setLastHoursUpdate(new Date());
    }
  }, [importCSV, hoursMonth, hoursYear]);

  const handleLogout = async () => {
    await signOut();
    navigate('/auth');
  };

  // Generate year options
  const yearOptions = [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm">
        <div className="container py-4">
          <div className="flex items-center justify-between">
            <img 
              src={wsaLogo} 
              alt="Wolff e Scripes Advogados" 
              className="h-10 object-contain"
            />
            <div className="flex items-center gap-2">
              {hasData && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => navigate('/')}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Dashboard
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate('/users')}
                className="text-muted-foreground hover:text-foreground"
              >
                <UsersRound className="w-4 h-4 mr-2" />
                Usuários
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleLogout}
                className="text-muted-foreground hover:text-foreground"
              >
                <LogOut className="w-4 h-4 mr-2" />
                Sair
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="container py-12">
        <div className="max-w-3xl mx-auto space-y-8">
          {/* Title Section */}
          <div className="text-center space-y-3">
            <h1 className="text-3xl md:text-4xl font-display font-bold tracking-tight">
              Atualizar <span className="text-primary">Dados</span>
            </h1>
            <p className="text-muted-foreground text-lg">
              Importe as planilhas para manter os dashboards atualizados
            </p>
          </div>

          {/* Two upload sections side by side on larger screens */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Section 1: Recurring Clients */}
            <div className="bg-card rounded-xl border border-border p-6 shadow-sm">
              <div className="flex items-center gap-3 mb-5">
                <div className="p-2 rounded-lg bg-primary/10">
                  <Database className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-foreground">
                    Clientes Recorrentes
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    Planilha do Asana (XLSX/CSV)
                  </p>
                </div>
              </div>

              <FileUpload 
                onFileSelect={handleFileSelect}
                isProcessing={isProcessing}
              />

              {lastUpdate && (
                <p className="text-xs text-muted-foreground text-center mt-4">
                  Atualizado: {lastUpdate.toLocaleString('pt-BR')}
                </p>
              )}
            </div>

            {/* Section 2: Hours */}
            <div className="bg-card rounded-xl border border-border p-6 shadow-sm">
              <div className="flex items-center gap-3 mb-5">
                <div className="p-2 rounded-lg bg-primary/10">
                  <FileText className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-foreground">
                    Lançamento de Horas
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    CSV exportado do Asana
                  </p>
                </div>
              </div>

              {/* Month/Year selector */}
              <div className="flex items-center gap-2 mb-4">
                <Select value={String(hoursMonth)} onValueChange={(v) => setHoursMonth(Number(v))}>
                  <SelectTrigger className="flex-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MONTH_NAMES.map((name, i) => (
                      <SelectItem key={i} value={String(i)}>{name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={String(hoursYear)} onValueChange={(v) => setHoursYear(Number(v))}>
                  <SelectTrigger className="w-24">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {yearOptions.map(y => (
                      <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <HoursCSVImport
                onImport={handleHoursImport}
                onClose={() => {}}
                selectedMonth={hoursMonth}
                selectedYear={hoursYear}
                embedded
              />

              {lastHoursUpdate && (
                <p className="text-xs text-muted-foreground text-center mt-4">
                  Atualizado: {lastHoursUpdate.toLocaleString('pt-BR')}
                </p>
              )}
            </div>
          </div>

          {/* Available Historical Data */}
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

          {/* Quick Access */}
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

      {/* Footer */}
      <footer className="border-t border-border bg-card/50 py-6 mt-auto">
        <div className="container text-center text-sm text-muted-foreground">
          Wolff e Scripes Advogados • Dashboard de Clientes Recorrentes
        </div>
      </footer>
    </div>
  );
}

export default Home;
