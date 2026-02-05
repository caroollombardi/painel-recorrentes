import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, AlertCircle, Shield, Check } from 'lucide-react';
import wsaLogo from '@/assets/wsa-logo.png';
import { z } from 'zod';

const setupSchema = z.object({
  name: z.string().trim().min(2, { message: 'Nome deve ter pelo menos 2 caracteres' }),
  email: z.string().trim().email({ message: 'Email inválido' }),
  password: z.string().min(6, { message: 'Senha deve ter pelo menos 6 caracteres' }),
});

export function Setup() {
  const navigate = useNavigate();
  const { signUp, user, signIn } = useAuth();
  
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isCheckingAdmins, setIsCheckingAdmins] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [hasAdmins, setHasAdmins] = useState(false);

  // Check if there are any admins
  useEffect(() => {
    const checkAdmins = async () => {
      try {
        // We can't directly query user_roles without auth, so we'll use a different approach
        // For now, allow setup page to be accessed, but the RLS will prevent non-first-user from becoming admin
        setHasAdmins(false);
      } catch (e) {
        console.error('Error checking admins:', e);
      } finally {
        setIsCheckingAdmins(false);
      }
    };
    
    checkAdmins();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validate input
    const result = setupSchema.safeParse({ name, email, password });
    if (!result.success) {
      setError(result.error.errors[0].message);
      return;
    }

    setIsLoading(true);

    try {
      // First, create the user account
      const { error: signUpError } = await signUp(email, password, name);
      
      if (signUpError) {
        if (signUpError.message.includes('already registered')) {
          // If user exists, try to sign in
          const { error: signInError } = await signIn(email, password);
          if (signInError) {
            setError('Este email já está cadastrado. Faça login ou use outro email.');
            setIsLoading(false);
            return;
          }
        } else {
          setError(signUpError.message);
          setIsLoading(false);
          return;
        }
      }

      // Wait a moment for the trigger to create the profile
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Sign in to get the user session
      const { error: loginError } = await signIn(email, password);
      if (loginError) {
        setError('Conta criada! Por favor, confirme seu email e depois faça login.');
        setIsLoading(false);
        return;
      }

      // Get the current user
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      
      if (!currentUser) {
        setError('Erro ao obter usuário. Tente fazer login.');
        setIsLoading(false);
        return;
      }

      // Assign admin role to the first user
      const { error: roleError } = await supabase
        .from('user_roles')
        .insert({
          user_id: currentUser.id,
          role: 'admin',
        });

      if (roleError) {
        console.error('Error assigning role:', roleError);
        // If it fails, it might be because another admin already exists
        setError('Não foi possível definir como administrador. Já existe um admin no sistema.');
        setIsLoading(false);
        return;
      }

      setSuccess(true);
      
      // Redirect to dashboard after short delay
      setTimeout(() => {
        navigate('/');
      }, 2000);
      
    } catch (e) {
      setError('Erro ao criar administrador. Tente novamente.');
      setIsLoading(false);
    }
  };

  if (isCheckingAdmins) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (hasAdmins) {
    navigate('/auth');
    return null;
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm">
        <div className="container py-4">
          <img 
            src={wsaLogo} 
            alt="Wolff e Scripes Advogados" 
            className="h-10 object-contain"
          />
        </div>
      </header>

      {/* Setup Form */}
      <main className="flex-1 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 p-3 rounded-full bg-primary/10 w-fit">
              <Shield className="w-8 h-8 text-primary" />
            </div>
            <CardTitle className="text-2xl font-display">
              Configuração <span style={{ color: '#FB7435' }}>Inicial</span>
            </CardTitle>
            <CardDescription>
              Crie o primeiro administrador do sistema
            </CardDescription>
          </CardHeader>
          <CardContent>
            {success ? (
              <div className="text-center space-y-4">
                <div className="mx-auto p-3 rounded-full bg-green-100 w-fit">
                  <Check className="w-8 h-8 text-green-600" />
                </div>
                <p className="text-lg font-medium text-green-600">
                  Administrador criado com sucesso!
                </p>
                <p className="text-sm text-muted-foreground">
                  Redirecionando para o dashboard...
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}

                <div className="space-y-2">
                  <Label htmlFor="name">Nome</Label>
                  <Input
                    id="name"
                    type="text"
                    placeholder="Seu nome completo"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    disabled={isLoading}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="seu@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={isLoading}
                    autoComplete="email"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password">Senha</Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="Mínimo 6 caracteres"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={isLoading}
                    autoComplete="new-password"
                  />
                </div>

                <Button 
                  type="submit" 
                  className="w-full"
                  disabled={isLoading}
                  style={{ backgroundColor: '#FB7435' }}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Criando...
                    </>
                  ) : (
                    <>
                      <Shield className="mr-2 h-4 w-4" />
                      Criar Administrador
                    </>
                  )}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </main>

      {/* Footer */}
      <footer className="border-t border-border bg-card/50 py-4">
        <div className="container text-center text-sm text-muted-foreground">
          Wolff e Scripes Advogados • Sistema de Gestão
        </div>
      </footer>
    </div>
  );
}

export default Setup;
