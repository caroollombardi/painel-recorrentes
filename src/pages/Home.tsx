import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { BarChart3, Clock, Database, ArrowLeft, UsersRound, LogOut } from "lucide-react";
import { FileUpload } from "@/components/dashboard/FileUpload";
import { parseXLSXData } from "@/lib/xlsx-parser";
import { DashboardData } from "@/lib/data-parser";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import wsaLogo from "@/assets/wsa-logo.png";

interface HomeProps {
  onDataUpdate: (data: DashboardData, fileName?: string) => void;
  hasData: boolean;
}

export function Home({ onDataUpdate, hasData }: HomeProps) {
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const handleFileSelect = useCallback(async (file: File) => {
    setIsProcessing(true);
    
    try {
      const buffer = await file.arrayBuffer();
      const data = parseXLSXData(buffer);
      
      onDataUpdate(data, file.name);
      setLastUpdate(new Date());
      
      // Small delay for UX feedback
      setTimeout(() => {
        setIsProcessing(false);
        navigate('/');
      }, 800);
    } catch (error) {
      console.error('Error processing file:', error);
      setIsProcessing(false);
    }
  }, [onDataUpdate, navigate]);

  const handleLogout = async () => {
    await signOut();
    navigate('/auth');
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header with WSA Logo - left aligned */}
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
        <div className="max-w-2xl mx-auto space-y-8">
          {/* Title Section */}
          <div className="text-center space-y-3">
            <h1 className="text-3xl md:text-4xl font-display font-bold tracking-tight">
              Análise <span style={{ color: '#FB7435' }}>Clientes Recorrentes</span>
            </h1>
            <p className="text-muted-foreground text-lg">
              Faça upload da planilha do Asana para atualizar o dashboard
            </p>
          </div>

          {/* Upload Card */}
          <div className="bg-card rounded-xl border border-border p-8 shadow-sm">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 rounded-lg bg-primary/10">
                <Database className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-foreground">
                  Atualizar Dados
                </h2>
                <p className="text-sm text-muted-foreground">
                  Importe a planilha exportada do Asana
                </p>
              </div>
            </div>

            <FileUpload 
              onFileSelect={handleFileSelect}
              isProcessing={isProcessing}
            />

            {lastUpdate && (
              <p className="text-xs text-muted-foreground text-center mt-4">
                Última atualização: {lastUpdate.toLocaleString('pt-BR')}
              </p>
            )}
          </div>

          {/* Info Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-card rounded-lg border border-border p-5">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-muted">
                  <BarChart3 className="w-4 h-4 text-muted-foreground" />
                </div>
                <div>
                  <h3 className="font-medium text-foreground">
                    Visualização Automática
                  </h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Após o upload, todos os gráficos e métricas são atualizados automaticamente.
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-card rounded-lg border border-border p-5">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-muted">
                  <Clock className="w-4 h-4 text-muted-foreground" />
                </div>
                <div>
                  <h3 className="font-medium text-foreground">
                    Atualização Diária
                  </h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Recomendamos atualizar a planilha diariamente para manter os dados precisos.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Quick Access */}
          {hasData && (
            <div className="text-center">
              <button
                onClick={() => navigate('/')}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-lg text-white font-medium transition-transform hover:scale-105"
                style={{ backgroundColor: '#FB7435' }}
              >
                <BarChart3 className="w-5 h-5" />
                Acessar Dashboard
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
