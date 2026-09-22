import { ReactNode, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  Home, Users, Clock4, Filter as FunnelIcon, Target, Settings as SettingsIcon,
  UsersRound, Upload, PanelLeftClose, PanelLeft, Menu, X,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/hooks/use-theme";
import { ThemeToggle } from "@/components/dashboard/ThemeToggle";
import { UserProfileDropdown } from "@/components/dashboard/UserProfileDropdown";
import { cn } from "@/lib/utils";
import wsaLogoDark from "@/assets/wsa-logo-dark.png";

interface AppShellProps {
  children: ReactNode;
  /** Controles específicos da página, exibidos na barra superior. */
  actions?: ReactNode;
  /**
   * Telas que já têm painel lateral próprio (como Horas) pedem a
   * navegação recolhida, para não ficarem com duas barras.
   */
  defaultCollapsed?: boolean;
}

interface ItemNav {
  label: string;
  icon: typeof Home;
  path: string;
  restrito?: "admin" | "gestao";
}

const NAVEGACAO: ItemNav[] = [
  { label: "Início", icon: Home, path: "/" },
  { label: "Clientes recorrentes", icon: Users, path: "/recorrentes" },
  { label: "Lançamento de horas", icon: Clock4, path: "/horas" },
  { label: "Funil de prospecção", icon: FunnelIcon, path: "/prospeccao" },
];

const ADMINISTRACAO: ItemNav[] = [
  { label: "Metas 2026", icon: Target, path: "/metas", restrito: "gestao" },
  { label: "Atualizar dados", icon: Upload, path: "/admin", restrito: "admin" },
  { label: "Usuários", icon: UsersRound, path: "/users", restrito: "admin" },
  { label: "Configurações", icon: SettingsIcon, path: "/settings", restrito: "gestao" },
];

export function AppShell({ children, actions, defaultCollapsed = false }: AppShellProps) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { isAdmin, hasRole, user, signOut } = useAuth();
  const { isDark, toggle: alternarTema } = useTheme();
  const [recolhida, setRecolhida] = useState(defaultCollapsed);
  const [menuMobile, setMenuMobile] = useState(false);

  const podeVer = (item: ItemNav) => {
    if (!item.restrito) return true;
    if (item.restrito === "admin") return isAdmin;
    return isAdmin || hasRole("socio") || hasRole("gestao");
  };

  const administracao = ADMINISTRACAO.filter(podeVer);
  const ativo = (path: string) => path === "/" ? pathname === "/" : pathname.startsWith(path);

  const hoje = new Date().toLocaleDateString("pt-BR", {
    weekday: "short", day: "2-digit", month: "long", year: "numeric",
  });

  const Navegacao = ({ aoNavegar }: { aoNavegar?: () => void }) => (
    <nav className="flex-1 overflow-y-auto py-3">
      <ul className="space-y-0.5 px-2">
        {NAVEGACAO.map((item) => (
          <li key={item.path}>
            <BotaoNav item={item} ativo={ativo(item.path)} recolhida={recolhida}
              onClick={() => { navigate(item.path); aoNavegar?.(); }} />
          </li>
        ))}
      </ul>

      {administracao.length > 0 && (
        <>
          <div className={cn("mt-5 mb-2 px-4", recolhida && "px-2")}>
            {recolhida
              ? <div className="h-px bg-sidebar-border" />
              : <p className="text-[11px] font-medium uppercase tracking-wider text-sidebar-foreground/60">Administração</p>}
          </div>
          <ul className="space-y-0.5 px-2">
            {administracao.map((item) => (
              <li key={item.path}>
                <BotaoNav item={item} ativo={ativo(item.path)} recolhida={recolhida}
                  onClick={() => { navigate(item.path); aoNavegar?.(); }} />
              </li>
            ))}
          </ul>
        </>
      )}
    </nav>
  );

  return (
    <div className="min-h-screen bg-background">
      {/* Lateral fixa: o esqueleto que a tela não tinha */}
      <aside
        className={cn(
          "hidden lg:flex fixed inset-y-0 left-0 z-30 flex-col bg-sidebar transition-[width] duration-200",
          recolhida ? "w-[68px]" : "w-60",
        )}
      >
        <div className={cn(
          "flex items-center shrink-0 border-b border-sidebar-border",
          recolhida ? "justify-center h-16" : "px-5 h-[76px]",
        )}>
          <button
            onClick={() => navigate("/")}
            className="flex items-center min-w-0 w-full"
            aria-label="Ir para o início"
          >
            {recolhida ? (
              // A assinatura horizontal não cabe em 68px; fica só a marca.
              <span className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center shrink-0">
                <span className="text-primary-foreground font-display font-bold text-base">W</span>
              </span>
            ) : (
              <span className="min-w-0 w-full">
                <img
                  src={wsaLogoDark}
                  alt="Wolff e Scripes Advogados"
                  className="h-7 w-auto object-contain object-left"
                />
                <span className="block text-[10px] tracking-wide text-sidebar-foreground/55 leading-tight mt-1">
                  Operações jurídicas
                </span>
              </span>
            )}
          </button>
        </div>

        <Navegacao />

        <div className="p-2 shrink-0">
          <button
            onClick={() => setRecolhida((v) => !v)}
            className="w-full flex items-center gap-3 px-3 h-9 rounded-lg text-sidebar-foreground hover:text-sidebar-accent-foreground hover:bg-sidebar-accent transition-colors"
            aria-label={recolhida ? "Expandir navegação" : "Recolher navegação"}
          >
            {recolhida ? <PanelLeft className="w-4 h-4 shrink-0" /> : <PanelLeftClose className="w-4 h-4 shrink-0" />}
            {!recolhida && <span className="text-xs">Recolher</span>}
          </button>
        </div>
      </aside>

      {/* Menu mobile */}
      {menuMobile && (
        <div className="lg:hidden fixed inset-0 z-40 flex">
          <div className="absolute inset-0 bg-foreground/40" onClick={() => setMenuMobile(false)} />
          <aside className="relative w-64 bg-sidebar flex flex-col">
            <div className="flex items-center justify-between h-16 px-5 shrink-0">
              <span className="font-display font-semibold text-sidebar-accent-foreground text-sm">Wolff e Scripes</span>
              <button onClick={() => setMenuMobile(false)} aria-label="Fechar menu">
                <X className="w-5 h-5 text-sidebar-foreground" />
              </button>
            </div>
            <Navegacao aoNavegar={() => setMenuMobile(false)} />
          </aside>
        </div>
      )}

      <div className={cn("transition-[padding] duration-200", recolhida ? "lg:pl-[68px]" : "lg:pl-60")}>
        {/* Barra superior: contexto e ações, sem navegação duplicada */}
        <header className="sticky top-0 z-20 h-16 bg-background/85 backdrop-blur border-b border-border">
          <div className="h-full px-4 sm:px-6 flex items-center gap-3">
            <button
              onClick={() => setMenuMobile(true)}
              className="lg:hidden w-9 h-9 rounded-lg hover:bg-muted flex items-center justify-center"
              aria-label="Abrir menu"
            >
              <Menu className="w-5 h-5 text-foreground" />
            </button>

            <p className="hidden sm:block text-sm text-muted-foreground first-letter:uppercase">{hoje}</p>

            <div className="flex-1" />
            {actions}
            <ThemeToggle isDark={isDark} onToggle={alternarTema} />
            <UserProfileDropdown
              name={user?.user_metadata?.name || user?.email || ""}
              onLogout={async () => { await signOut(); navigate("/auth"); }}
            />
          </div>
        </header>

        <main className="px-4 sm:px-6 py-6 w-full max-w-[1400px] mx-auto overflow-x-hidden">{children}</main>
      </div>
    </div>
  );
}

function BotaoNav({
  item, ativo, recolhida, onClick,
}: { item: ItemNav; ativo: boolean; recolhida: boolean; onClick: () => void }) {
  const Icon = item.icon;
  return (
    <button
      onClick={onClick}
      title={recolhida ? item.label : undefined}
      aria-current={ativo ? "page" : undefined}
      className={cn(
        "relative w-full flex items-center gap-3 h-9 rounded-lg text-sm transition-colors",
        recolhida ? "justify-center px-0" : "px-3",
        ativo
          ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
          : "text-sidebar-foreground hover:text-sidebar-accent-foreground hover:bg-sidebar-accent/60",
      )}
    >
      {/* A marca sustentando a estrutura, não decorando */}
      {ativo && <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r bg-primary" />}
      <Icon className={cn("w-[18px] h-[18px] shrink-0", ativo && "text-primary")} />
      {!recolhida && <span className="truncate">{item.label}</span>}
    </button>
  );
}
