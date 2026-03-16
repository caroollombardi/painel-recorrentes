import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Upload, UsersRound, Settings, Eye, EyeOff, Monitor, MoreVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { UserProfileDropdown } from "@/components/dashboard/UserProfileDropdown";
import { ThemeToggle } from "@/components/dashboard/ThemeToggle";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/hooks/use-theme";
import { cn } from "@/lib/utils";
import wsaLogo from "@/assets/wsa-logo.png";

interface DashboardHeaderProps {
  activeTab: "recorrentes" | "horas";
  showValues?: boolean;
  onShowValuesChange?: (v: boolean) => void;
  onPresentationToggle?: () => void;
}

const tabs = [
  { id: "recorrentes" as const, label: "Clientes Recorrentes", shortLabel: "Recorrentes", path: "/" },
  { id: "horas" as const, label: "Lançamento de Horas", shortLabel: "Horas", path: "/horas" },
];

export function DashboardHeader({ activeTab, showValues, onShowValuesChange, onPresentationToggle }: DashboardHeaderProps) {
  const navigate = useNavigate();
  const { isAdmin, signOut, user, hasRole } = useAuth();
  const { isDark, toggle: toggleTheme } = useTheme();
  const canAccessMetas = hasRole("socio") || hasRole("gestao");
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 40);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const handleLogout = async () => { await signOut(); navigate("/auth"); };

  const adminActions = [];
  if (isAdmin) {
    adminActions.push({ label: "Atualizar Dados", icon: Upload, action: () => navigate("/admin") });
    adminActions.push({ label: "Usuários", icon: UsersRound, action: () => navigate("/users") });
    adminActions.push({ label: "Configurações", icon: Settings, action: () => navigate("/settings") });
  } else if (canAccessMetas) {
    adminActions.push({ label: "Configurações", icon: Settings, action: () => navigate("/settings") });
  }

  return (
    <header className={cn(
      "border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10 transition-all duration-300",
    )}>
      <div className="container py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 sm:gap-6 min-w-0 flex-shrink-0">
            <img
              src={wsaLogo}
              alt="Wolff e Scripes Advogados"
              className={cn("object-contain transition-all duration-300 shrink-0", isScrolled ? "h-7" : "h-8 sm:h-10")}
            />
            {/* Tabs */}
            <nav className="flex items-center gap-0.5 sm:gap-1 min-w-0">
              {tabs.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => navigate(tab.path)}
                  className={cn(
                    "relative px-2 sm:px-3 py-2 text-xs sm:text-sm font-medium transition-colors rounded-md whitespace-nowrap",
                    activeTab === tab.id
                      ? "text-primary"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  )}
                >
                  <span className="hidden md:inline">{tab.label}</span>
                  <span className="md:hidden">{tab.shortLabel}</span>
                  {activeTab === tab.id && (
                    <span className="absolute bottom-0 left-2 right-2 h-0.5 bg-primary rounded-full" />
                  )}
                </button>
              ))}
            </nav>
          </div>

          <div className="flex items-center gap-1 sm:gap-2">
            {/* Full buttons for wide screens */}
            {isAdmin && (
              <div className="hidden xl:flex items-center gap-1">
                <Button variant="ghost" size="sm" onClick={() => navigate("/admin")} className="text-muted-foreground hover:text-foreground">
                  <Upload className="w-4 h-4 mr-2" />
                  Atualizar Dados
                </Button>
                <Button variant="ghost" size="sm" onClick={() => navigate("/users")} className="text-muted-foreground hover:text-foreground">
                  <UsersRound className="w-4 h-4 mr-2" />
                  Usuários
                </Button>
                <Button variant="ghost" size="sm" onClick={() => navigate("/settings")} className="text-muted-foreground hover:text-foreground">
                  <Settings className="w-4 h-4 mr-2" />
                  Configurações
                </Button>
              </div>
            )}
            {!isAdmin && canAccessMetas && (
              <div className="hidden xl:flex items-center gap-1">
                <Button variant="ghost" size="sm" onClick={() => navigate("/settings")} className="text-muted-foreground hover:text-foreground">
                  <Settings className="w-4 h-4 mr-2" />
                  Configurações
                </Button>
              </div>
            )}

            {/* Collapsed dropdown for narrow screens */}
            {adminActions.length > 0 && (
              <div className="xl:hidden">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
                      <MoreVertical className="w-4 h-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {adminActions.map((item) => (
                      <DropdownMenuItem key={item.label} onClick={item.action}>
                        <item.icon className="w-4 h-4 mr-2" />
                        {item.label}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            )}

            {onShowValuesChange && (
              <div className="flex items-center gap-2 bg-muted/50 px-2 sm:px-3 py-1.5 rounded-lg">
                {showValues ? <Eye className="w-4 h-4 text-muted-foreground" /> : <EyeOff className="w-4 h-4 text-muted-foreground" />}
                <Label htmlFor="show-values" className="text-sm text-muted-foreground cursor-pointer hidden lg:inline">
                  Exibir valores (R$)
                </Label>
                <Switch id="show-values" checked={showValues} onCheckedChange={onShowValuesChange} />
              </div>
            )}

            {onPresentationToggle && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="sm" onClick={onPresentationToggle} className="text-muted-foreground hover:text-foreground">
                      <Monitor className="w-4 h-4 sm:mr-2" />
                      <span className="hidden md:inline">Modo TV</span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Atalho: tecla <kbd className="px-1 py-0.5 bg-muted rounded text-xs font-mono">F</kbd></p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}

            <ThemeToggle isDark={isDark} onToggle={toggleTheme} />

            <UserProfileDropdown email={user?.email || ""} onLogout={handleLogout} />
          </div>
        </div>

        <div className={cn(
          "overflow-hidden transition-all duration-300",
          isScrolled ? "max-h-0 opacity-0 mt-0" : "max-h-24 opacity-100 mt-3"
        )}>
          <h1 className="text-xl sm:text-2xl md:text-3xl font-display font-bold tracking-tight">
            {activeTab === "recorrentes" ? (
              <>Análise <span className="text-primary">Clientes Recorrentes</span></>
            ) : (
              <>Lançamento de <span className="text-primary">Horas</span></>
            )}
          </h1>
          <p className="text-muted-foreground mt-1 text-sm sm:text-base">
            {activeTab === "recorrentes"
              ? "Análise de horas e valores por advogado"
              : "Acompanhamento de horas lançadas pelo time"}
          </p>
        </div>
      </div>
    </header>
  );
}
