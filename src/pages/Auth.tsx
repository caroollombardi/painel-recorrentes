import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, AlertCircle, Eye, EyeOff, CheckCircle2 } from 'lucide-react';
import wsaLogo from '@/assets/wsa-logo.png';
import { z } from 'zod';

const loginSchema = z.object({
  email: z.string().trim().email({ message: 'Email inválido' }),
  password: z.string().min(6, { message: 'Senha deve ter pelo menos 6 caracteres' }),
});

type Mode = 'login' | 'forgot' | 'reset';

export function Auth() {
  const navigate = useNavigate();
  const { signIn } = useAuth();

  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setMode('reset');
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const result = loginSchema.safeParse({ email, password });
    if (!result.success) {
      setError(result.error.errors[0].message);
      return;
    }

    setIsLoading(true);
    const { error: authError } = await signIn(email, password);
    setIsLoading(false);

    if (authError) {
      if (authError.message.includes('Invalid login credentials')) {
        setError('Email ou senha incorretos.');
      } else if (authError.message.includes('Email not confirmed')) {
        setError('Por favor, confirme seu email antes de entrar.');
      } else {
        setError(authError.message);
      }
      return;
    }

    navigate('/');
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email || !z.string().email().safeParse(email).success) {
      setError('Informe um email válido.');
      return;
    }

    setIsLoading(true);
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth`,
    });
    setIsLoading(false);

    if (resetError) {
      setError('Não foi possível enviar o email. Tente novamente.');
      return;
    }

    setSuccess('Link enviado! Verifique sua caixa de entrada.');
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (newPassword.length < 6) {
      setError('A senha deve ter pelo menos 6 caracteres.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('As senhas não coincidem.');
      return;
    }

    setIsLoading(true);
    const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
    setIsLoading(false);

    if (updateError) {
      setError('Não foi possível atualizar a senha. Tente novamente.');
      return;
    }

    setSuccess('Senha atualizada com sucesso! Redirecionando...');
    setTimeout(() => navigate('/'), 2000);
  };

  const resetState = () => {
    setError(null);
    setSuccess(null);
    setPassword('');
    setNewPassword('');
    setConfirmPassword('');
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b border-border bg-card/50 backdrop-blur-sm">
        <div className="container py-4">
          <img src={wsaLogo} alt="Wolff e Scripes Advogados" className="h-10 object-contain" />
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">

          {/* LOGIN */}
          {mode === 'login' && (
            <>
              <CardHeader className="text-center">
                <CardTitle className="text-2xl font-display">
                  Acesso ao <span style={{ color: '#FB7435' }}>Dashboard</span>
                </CardTitle>
                <CardDescription>Entre com suas credenciais para acessar o sistema</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleLogin} className="space-y-4">
                  {error && (
                    <Alert variant="destructive">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>{error}</AlertDescription>
                    </Alert>
                  )}
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
                    <div className="relative">
                      <Input
                        id="password"
                        type={showPassword ? 'text' : 'password'}
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        disabled={isLoading}
                        autoComplete="current-password"
                        className="pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        tabIndex={-1}
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                  <div className="text-right">
                    <button
                      type="button"
                      onClick={() => { resetState(); setMode('forgot'); }}
                      className="text-sm text-muted-foreground hover:underline"
                      style={{ color: '#FB7435' }}
                    >
                      Esqueci minha senha
                    </button>
                  </div>
                  <Button
                    type="submit"
                    className="w-full"
                    disabled={isLoading}
                    style={{ backgroundColor: '#FB7435' }}
                  >
                    {isLoading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Entrando...</> : 'Entrar'}
                  </Button>
                </form>
                <p className="text-center text-sm text-muted-foreground mt-6">
                  Não possui acesso? Entre em contato com o administrador.
                </p>
              </CardContent>
            </>
          )}

          {/* ESQUECI MINHA SENHA */}
          {mode === 'forgot' && (
            <>
              <CardHeader className="text-center">
                <CardTitle className="text-2xl font-display">
                  Redefinir <span style={{ color: '#FB7435' }}>Senha</span>
                </CardTitle>
                <CardDescription>Informe seu email e enviaremos um link para criar uma nova senha</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleForgotPassword} className="space-y-4">
                  {error && (
                    <Alert variant="destructive">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>{error}</AlertDescription>
                    </Alert>
                  )}
                  {success && (
                    <Alert className="border-green-500 text-green-700 bg-green-50">
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                      <AlertDescription>{success}</AlertDescription>
                    </Alert>
                  )}
                  {!success && (
                    <>
                      <div className="space-y-2">
                        <Label htmlFor="reset-email">Email</Label>
                        <Input
                          id="reset-email"
                          type="email"
                          placeholder="seu@email.com"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          disabled={isLoading}
                          autoComplete="email"
                        />
                      </div>
                      <Button
                        type="submit"
                        className="w-full"
                        disabled={isLoading}
                        style={{ backgroundColor: '#FB7435' }}
                      >
                        {isLoading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Enviando...</> : 'Enviar link'}
                      </Button>
                    </>
                  )}
                </form>
                <div className="text-center mt-4">
                  <button
                    type="button"
                    onClick={() => { resetState(); setMode('login'); }}
                    className="text-sm text-muted-foreground hover:underline"
                  >
                    Voltar para o login
                  </button>
                </div>
              </CardContent>
            </>
          )}

          {/* REDEFINIR SENHA (após clicar no link do email) */}
          {mode === 'reset' && (
            <>
              <CardHeader className="text-center">
                <CardTitle className="text-2xl font-display">
                  Nova <span style={{ color: '#FB7435' }}>Senha</span>
                </CardTitle>
                <CardDescription>Escolha uma nova senha para sua conta</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleResetPassword} className="space-y-4">
                  {error && (
                    <Alert variant="destructive">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>{error}</AlertDescription>
                    </Alert>
                  )}
                  {success && (
                    <Alert className="border-green-500 text-green-700 bg-green-50">
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                      <AlertDescription>{success}</AlertDescription>
                    </Alert>
                  )}
                  {!success && (
                    <>
                      <div className="space-y-2">
                        <Label htmlFor="new-password">Nova senha</Label>
                        <div className="relative">
                          <Input
                            id="new-password"
                            type={showNewPassword ? 'text' : 'password'}
                            placeholder="••••••••"
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            disabled={isLoading}
                            className="pr-10"
                          />
                          <button
                            type="button"
                            onClick={() => setShowNewPassword(!showNewPassword)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                            tabIndex={-1}
                          >
                            {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="confirm-password">Confirmar nova senha</Label>
                        <Input
                          id="confirm-password"
                          type="password"
                          placeholder="••••••••"
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          disabled={isLoading}
                        />
                      </div>
                      <Button
                        type="submit"
                        className="w-full"
                        disabled={isLoading}
                        style={{ backgroundColor: '#FB7435' }}
                      >
                        {isLoading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Salvando...</> : 'Salvar nova senha'}
                      </Button>
                    </>
                  )}
                </form>
              </CardContent>
            </>
          )}

        </Card>
      </main>

      <footer className="border-t border-border bg-card/50 py-4">
        <div className="container text-center text-sm text-muted-foreground">
          Wolff e Scripes Advogados • Sistema de Gestão
        </div>
      </footer>
    </div>
  );
}

export default Auth;
