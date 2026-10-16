import { Navigate, useLocation } from 'react-router-dom';
import { useAuth, AppRole } from '@/contexts/AuthContext';
import { Loader2 } from 'lucide-react';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireAdmin?: boolean;
  allowedRoles?: AppRole[];
  /** Libera a rota para o perfil "indicadores". Sem isso, ele é mandado para /indicadores. */
  permitirIndicadores?: boolean;
}

export function ProtectedRoute({ children, requireAdmin = false, allowedRoles, permitirIndicadores = false }: ProtectedRouteProps) {
  const { user, isAdmin, isLoading, rolesCarregados, somenteIndicadores, hasRole } = useAuth();
  const location = useLocation();

  // Espera saber o perfil antes de mostrar qualquer tela.
  if (isLoading || (user && !rolesCarregados)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" state={{ from: location }} replace />;
  }

  // Perfil "indicadores": só a tela de Indicadores por área.
  if (somenteIndicadores) {
    return permitirIndicadores ? <>{children}</> : <Navigate to="/indicadores" replace />;
  }

  if (requireAdmin && !isAdmin) {
    return <Navigate to="/" replace />;
  }

  if (allowedRoles && allowedRoles.length > 0) {
    const hasAccess = allowedRoles.some(role => hasRole(role));
    if (!hasAccess) {
      return <Navigate to="/" replace />;
    }
  }

  return <>{children}</>;
}

export default ProtectedRoute;
