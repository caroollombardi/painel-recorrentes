import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Upload, UsersRound, Settings, Eye, EyeOff, Monitor, MoreVertical, ChevronDown, LayoutGrid, Check } from "lucide-react";
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
  activeTab: "recorrentes" | "horas" | "atos" | "prospeccao";
  showValues?: boolean;
  onShowValuesChange?: (v: boolean) => void;
  onPresentationToggle?: () => void;
}

const tabs = [
  { id: "recorrentes" as const, label: "Clientes Recorrentes", shortLabel: "Recorrentes", path: "/" },
  { id: "horas" as const, label: "Lançamento de Horas", shortLabel: "Horas", path: "/horas" },
  { id: "atos" as const, label: "Calculadora de Atos", shortLabel: "Atos", path: "/atos" },
  { id: "prospeccao" as const, label: "Funil de Prospecção", shortLabel: "Prospecção", path: "/prospeccao" },
];

export function DashboardHeader({ activeTab, showValues, onShowValuesChange, onPresentationToggle }: DashboardHeaderProps) {
  const navigate = useNavigate();
  const { isAdmin, signOut, user, hasRole } = useAuth();
  const { isDark, toggle: toggleTheme } = useTheme();
  const canAccessMetas = hasRole("socio") || hasRole("gestao");
  const handleLogout = async () => { await signOut(); navigate("/auth"); };

  const adminActions = [];
  if (isAdmin) {
    adminActions.push({ label: "Atualizar Dados", icon: Upload, action: () => navigate("/admin") });
    adminActions.push({ label: "Usuários", icon: UsersRound, action: () => navigate("/users") });
    adminActions.push({ label: "Configurações", icon: Settings, action: () => navigate("/settings") });
  } else if (canAccessMetas) {
    adminActions.push({ label: "Configurações", icon: Settings, action: () => navigate("/settings") });
  }

  const currentTab = tabs.find((t) => t.id === activeTab) ?? tabs[0];

  return (
    <header className={cn(
      "bg-card/50 backdrop-blur-sm sticky top-0 z-10 transition-all duration-300",
    )}>
      {/* Linha de identidade WSA */}
      <div className="h-0.5 w-full" style={{ backgroundColor: "#FB7435" }} />
      <div className="border-b border-border">
      <div className="container py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 sm:gap-6 min-w-0 flex-shrink-0">
            <div className="flex items-center gap-3 shrink-0">
              <img
                src={wsaLogo}
                alt="Wolff e Scripes Advogados"
                className="object-contain h-8 sm:h-10"
              />
            </div>
            {/* Seletor de módulos */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2 font-medium">
                  <LayoutGrid className="w-4 h-4 text-muted-foreground" />
                  <span className="hidden md:inline">{currentTab.label}</span>
                  <span className="md:hidden">{currentTab.shortLabel}</span>
                  <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                {tabs.map((tab) => (
                  <DropdownMenuItem
                    key={tab.id}
                    onClick={() => navigate(tab.path)}
                    className="justify-between"
                  >
                    {tab.label}
                    {activeTab === tab.id && <Check className="w-4 h-4 text-primary" />}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="flex items-center gap-1 sm:gap-2">
            {/* Full buttons for wide screens */}
            {isAdmin && (
              <div className="hidden 2xl:flex items-center gap-1">
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
              <div className="hidden 2xl:flex items-center gap-1">
                <Button variant="ghost" size="sm" onClick={() => navigate("/settings")} className="text-muted-foreground hover:text-foreground">
                  <Settings className="w-4 h-4 mr-2" />
                  Configurações
                </Button>
              </div>
            )}

            {/* Collapsed dropdown for narrow screens */}
            {adminActions.length > 0 && (
              <div className="2xl:hidden">
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

      </div>
      </div>
    </header>
  );
}
