import { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

export type AppRole = 'admin' | 'viewer' | 'socio' | 'gestao' | 'operacional' | 'indicadores';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  role: AppRole | null;
  roles: AppRole[];
  isAdmin: boolean;
  isLoading: boolean;
  /** true quando já sabemos os perfis do usuário logado (evita mostrar tela antes da hora). */
  rolesCarregados: boolean;
  /** true para quem tem só o perfil "indicadores": vê apenas a tela de Indicadores por área. */
  somenteIndicadores: boolean;
  hasRole: (role: AppRole) => boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, name: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [rolesCarregados, setRolesCarregados] = useState(false);
  // Usuário cujos perfis já foram buscados; renovação de token não dispara nova busca.
  const usuarioDosPerfis = useRef<string | null>(null);

  const fetchUserRoles = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId);

      if (error) {
        console.error('Error fetching roles:', error);
        return [];
      }

      return (data?.map(d => d.role as AppRole) || []);
    } catch (e) {
      console.error('Error in fetchUserRoles:', e);
      return [];
    }
  };

  const carregarPerfis = async (userId: string) => {
    if (usuarioDosPerfis.current === userId) return;
    usuarioDosPerfis.current = userId;
    setRolesCarregados(false);
    const fetched = await fetchUserRoles(userId);
    if (usuarioDosPerfis.current !== userId) return; // trocou de usuário no meio
    setRoles(fetched);
    setRolesCarregados(true);
  };

  const limparPerfis = () => {
    usuarioDosPerfis.current = null;
    setRoles([]);
    setRolesCarregados(true);
  };

  useEffect(() => {
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, newSession) => {
        setSession(newSession);
        setUser(newSession?.user ?? null);

        // Defer role fetching to avoid deadlock
        if (newSession?.user) {
          const id = newSession.user.id;
          setTimeout(() => { carregarPerfis(id); }, 0);
        } else {
          limparPerfis();
        }
      }
    );

    // THEN check for existing session
    supabase.auth.getSession().then(async ({ data: { session: existingSession } }) => {
      setSession(existingSession);
      setUser(existingSession?.user ?? null);

      if (existingSession?.user) {
        await carregarPerfis(existingSession.user.id);
      } else {
        limparPerfis();
      }
      setIsLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        return { error: new Error(error.message) };
      }

      return { error: null };
    } catch (e) {
      return { error: e as Error };
    }
  };

  const signUp = async (email: string, password: string, name: string) => {
    try {
      const redirectUrl = `${window.location.origin}/`;

      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: redirectUrl,
          data: {
            name,
          },
        },
      });

      if (error) {
        return { error: new Error(error.message) };
      }

      return { error: null };
    } catch (e) {
      return { error: e as Error };
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    limparPerfis();
  };

  const hasRole = (r: AppRole) => roles.includes(r);

  const value = {
    user,
    session,
    role: roles[0] || null,
    roles,
    isAdmin: roles.includes('admin'),
    isLoading,
    rolesCarregados,
    somenteIndicadores: roles.length > 0 && roles.every(r => r === 'indicadores'),
    hasRole,
    signIn,
    signUp,
    signOut,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
