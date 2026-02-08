import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { 
  ArrowLeft, 
  Users as UsersIcon, 
  UserPlus, 
  Shield, 
  Eye, 
  Loader2, 
  AlertCircle,
  Check
} from 'lucide-react';
import wsaLogo from '@/assets/wsa-logo.png';
import { z } from 'zod';

type AppRoleType = 'admin' | 'viewer' | 'socio' | 'gestao' | 'operacional';

const newUserSchema = z.object({
  name: z.string().trim().min(2, { message: 'Nome deve ter pelo menos 2 caracteres' }),
  email: z.string().trim().email({ message: 'Email inválido' }),
  password: z.string().min(6, { message: 'Senha deve ter pelo menos 6 caracteres' }),
  role: z.enum(['admin', 'viewer', 'socio', 'gestao', 'operacional'], { required_error: 'Selecione um perfil' }),
});

interface UserProfile {
  id: string;
  user_id: string;
  name: string;
  email: string;
  is_active: boolean;
  created_at: string;
  role?: AppRoleType | null;
}

export function Users() {
  const navigate = useNavigate();
  const { user, isAdmin, signUp } = useAuth();
  
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  
  // Form state
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<AppRoleType>('viewer');

  const fetchUsers = async () => {
    try {
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (profilesError) throw profilesError;

      // Fetch roles for each user
      const { data: roles, error: rolesError } = await supabase
        .from('user_roles')
        .select('user_id, role');

      if (rolesError) throw rolesError;

      // Merge profiles with roles
      const usersWithRoles = profiles?.map(profile => ({
        ...profile,
        role: roles?.find(r => r.user_id === profile.user_id)?.role || null
      })) || [];

      setUsers(usersWithRoles);
    } catch (e) {
      console.error('Error fetching users:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!isAdmin) {
      navigate('/');
      return;
    }
    fetchUsers();
  }, [isAdmin, navigate]);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    // Validate input
    const result = newUserSchema.safeParse({
      name: newName,
      email: newEmail,
      password: newPassword,
      role: newRole,
    });

    if (!result.success) {
      setError(result.error.errors[0].message);
      return;
    }

    setIsSubmitting(true);

    try {
      // Create user via signup
      const { error: signUpError } = await signUp(newEmail, newPassword, newName);
      
      if (signUpError) {
        if (signUpError.message.includes('already registered')) {
          setError('Este email já está cadastrado.');
        } else {
          setError(signUpError.message);
        }
        setIsSubmitting(false);
        return;
      }

      // Note: The role will need to be assigned by the admin after the user confirms their email
      // For now, show success message
      setSuccess(`Usuário ${newName} criado! Após confirmar o email, o admin deverá atribuir a role.`);
      setNewName('');
      setNewEmail('');
      setNewPassword('');
      setNewRole('viewer');
      
      // Refresh users list
      setTimeout(() => {
        fetchUsers();
        setIsDialogOpen(false);
        setSuccess(null);
      }, 2000);
      
    } catch (e) {
      setError('Erro ao criar usuário. Tente novamente.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleUserStatus = async (userId: string, currentStatus: boolean) => {
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ is_active: !currentStatus })
        .eq('user_id', userId);

      if (error) throw error;
      
      fetchUsers();
    } catch (e) {
      console.error('Error toggling user status:', e);
    }
  };

  const assignRole = async (userId: string, role: AppRoleType) => {
    try {
      // First, check if user already has a role
      const { data: existingRole } = await supabase
        .from('user_roles')
        .select('id')
        .eq('user_id', userId)
        .maybeSingle();

      if (existingRole) {
        // Update existing role
        const { error } = await supabase
          .from('user_roles')
          .update({ role })
          .eq('user_id', userId);

        if (error) throw error;
      } else {
        // Insert new role
        const { error } = await supabase
          .from('user_roles')
          .insert({ 
            user_id: userId, 
            role,
            assigned_by: user?.id 
          });

        if (error) throw error;
      }
      
      fetchUsers();
    } catch (e) {
      console.error('Error assigning role:', e);
    }
  };

  const getRoleBadge = (role: string | null | undefined) => {
    switch (role) {
      case 'admin':
        return (
          <Badge variant="default" className="bg-primary/10 text-primary border-primary/20">
            <Shield className="w-3 h-3 mr-1" />
            Admin
          </Badge>
        );
      case 'gestao':
        return (
          <Badge variant="default" className="bg-primary/10 text-primary border-primary/20">
            <Shield className="w-3 h-3 mr-1" />
            Gestão
          </Badge>
        );
      case 'socio':
        return (
          <Badge variant="default" className="bg-accent/10 text-accent-foreground border-accent/20">
            <Shield className="w-3 h-3 mr-1" />
            Sócio
          </Badge>
        );
      case 'operacional':
        return (
          <Badge variant="secondary">
            <Eye className="w-3 h-3 mr-1" />
            Operacional
          </Badge>
        );
      case 'viewer':
        return (
          <Badge variant="secondary">
            <Eye className="w-3 h-3 mr-1" />
            Visualizador
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className="text-muted-foreground">
            Sem perfil
          </Badge>
        );
    }
  };

  if (!isAdmin) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-6">
              <img 
                src={wsaLogo} 
                alt="Wolff e Scripes Advogados" 
                className="h-10 object-contain"
              />
              <div className="h-6 w-px bg-border" />
              <h1 className="text-xl font-display font-semibold">
                Gestão de <span style={{ color: '#FB7435' }}>Usuários</span>
              </h1>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate('/')}
              className="text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Voltar ao Dashboard
            </Button>
          </div>
        </div>
      </header>

      <main className="container py-8 space-y-6">
        {/* Actions Bar */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <UsersIcon className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="font-semibold text-foreground">Usuários do Sistema</h2>
              <p className="text-sm text-muted-foreground">
                {users.length} usuário{users.length !== 1 ? 's' : ''} cadastrado{users.length !== 1 ? 's' : ''}
              </p>
            </div>
          </div>

          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button style={{ backgroundColor: '#FB7435' }}>
                <UserPlus className="w-4 h-4 mr-2" />
                Novo Usuário
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Cadastrar Novo Usuário</DialogTitle>
                <DialogDescription>
                  Preencha os dados para criar um novo usuário no sistema.
                </DialogDescription>
              </DialogHeader>

              <form onSubmit={handleCreateUser} className="space-y-4">
                {error && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}

                {success && (
                  <Alert className="border-green-200 bg-green-50 text-green-800">
                    <Check className="h-4 w-4" />
                    <AlertDescription>{success}</AlertDescription>
                  </Alert>
                )}

                <div className="space-y-2">
                  <Label htmlFor="new-name">Nome</Label>
                  <Input
                    id="new-name"
                    placeholder="Nome completo"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    disabled={isSubmitting}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="new-email">Email</Label>
                  <Input
                    id="new-email"
                    type="email"
                    placeholder="email@exemplo.com"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    disabled={isSubmitting}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="new-password">Senha Inicial</Label>
                  <Input
                    id="new-password"
                    type="password"
                    placeholder="Mínimo 6 caracteres"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    disabled={isSubmitting}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="new-role">Perfil de Acesso</Label>
                  <Select 
                    value={newRole} 
                    onValueChange={(v: AppRoleType) => setNewRole(v)}
                    disabled={isSubmitting}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o perfil" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">
                        <div className="flex items-center gap-2">
                          <Shield className="w-4 h-4" />
                          Administrador
                        </div>
                      </SelectItem>
                      <SelectItem value="gestao">
                        <div className="flex items-center gap-2">
                          <Shield className="w-4 h-4" />
                          Gestão
                        </div>
                      </SelectItem>
                      <SelectItem value="socio">
                        <div className="flex items-center gap-2">
                          <Shield className="w-4 h-4" />
                          Sócio
                        </div>
                      </SelectItem>
                      <SelectItem value="operacional">
                        <div className="flex items-center gap-2">
                          <Eye className="w-4 h-4" />
                          Operacional
                        </div>
                      </SelectItem>
                      <SelectItem value="viewer">
                        <div className="flex items-center gap-2">
                          <Eye className="w-4 h-4" />
                          Visualizador
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Admin: técnico • Gestão: metas e operações • Sócio: estratégico • Operacional/Visualizador: consulta
                  </p>
                </div>

                <div className="flex gap-3 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsDialogOpen(false)}
                    className="flex-1"
                    disabled={isSubmitting}
                  >
                    Cancelar
                  </Button>
                  <Button 
                    type="submit" 
                    className="flex-1"
                    disabled={isSubmitting}
                    style={{ backgroundColor: '#FB7435' }}
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Criando...
                      </>
                    ) : (
                      'Criar Usuário'
                    )}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Users Table */}
        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : users.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                Nenhum usuário cadastrado.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Perfil</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Criado em</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((u) => (
                    <TableRow key={u.id}>
                      <TableCell className="font-medium">{u.name}</TableCell>
                      <TableCell>{u.email}</TableCell>
                      <TableCell>
                        <Select
                          value={u.role || 'none'}
                          onValueChange={(v) => {
                            if (v !== 'none') {
                              assignRole(u.user_id, v as AppRoleType);
                            }
                          }}
                          disabled={u.user_id === user?.id}
                        >
                          <SelectTrigger className="w-40">
                            <SelectValue>
                              {getRoleBadge(u.role)}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="admin">
                              <div className="flex items-center gap-2">
                                <Shield className="w-4 h-4" />
                                Admin
                              </div>
                            </SelectItem>
                            <SelectItem value="gestao">
                              <div className="flex items-center gap-2">
                                <Shield className="w-4 h-4" />
                                Gestão
                              </div>
                            </SelectItem>
                            <SelectItem value="socio">
                              <div className="flex items-center gap-2">
                                <Shield className="w-4 h-4" />
                                Sócio
                              </div>
                            </SelectItem>
                            <SelectItem value="operacional">
                              <div className="flex items-center gap-2">
                                <Eye className="w-4 h-4" />
                                Operacional
                              </div>
                            </SelectItem>
                            <SelectItem value="viewer">
                              <div className="flex items-center gap-2">
                                <Eye className="w-4 h-4" />
                                Visualizador
                              </div>
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={u.is_active}
                            onCheckedChange={() => toggleUserStatus(u.user_id, u.is_active)}
                            disabled={u.user_id === user?.id}
                          />
                          <span className={u.is_active ? 'text-green-600' : 'text-muted-foreground'}>
                            {u.is_active ? 'Ativo' : 'Inativo'}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {new Date(u.created_at).toLocaleDateString('pt-BR')}
                      </TableCell>
                      <TableCell className="text-right">
                        {u.user_id === user?.id && (
                          <Badge variant="outline" className="text-xs">
                            Você
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Permission Info */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Perfis de Permissão</CardTitle>
            <CardDescription>
              Entenda as diferenças entre os níveis de acesso
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="p-4 rounded-lg border border-primary/20 bg-primary/5">
                <div className="flex items-center gap-2 mb-2">
                  <Shield className="w-5 h-5 text-primary" />
                  <h3 className="font-semibold">Administrador</h3>
                </div>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>• Acesso técnico ao sistema</li>
                  <li>• Cadastrar e gerenciar usuários</li>
                  <li>• Atualizar dados e integrações</li>
                </ul>
              </div>
              <div className="p-4 rounded-lg border border-primary/20 bg-primary/5">
                <div className="flex items-center gap-2 mb-2">
                  <Shield className="w-5 h-5 text-primary" />
                  <h3 className="font-semibold">Gestão</h3>
                </div>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>• Visualizar e editar metas</li>
                  <li>• Acompanhar progresso</li>
                  <li>• Apresentar resultados</li>
                </ul>
              </div>
              <div className="p-4 rounded-lg border border-border bg-muted/30">
                <div className="flex items-center gap-2 mb-2">
                  <Shield className="w-5 h-5 text-muted-foreground" />
                  <h3 className="font-semibold">Sócio</h3>
                </div>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>• Visualizar metas e progresso</li>
                  <li>• Acompanhar alertas</li>
                  <li>• Acesso ao dashboard</li>
                </ul>
              </div>
              <div className="p-4 rounded-lg border border-border bg-muted/30">
                <div className="flex items-center gap-2 mb-2">
                  <Eye className="w-5 h-5 text-muted-foreground" />
                  <h3 className="font-semibold">Operacional</h3>
                </div>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>• Dados operacionais</li>
                  <li>• Sem acesso a metas</li>
                </ul>
              </div>
              <div className="p-4 rounded-lg border border-border bg-muted/30">
                <div className="flex items-center gap-2 mb-2">
                  <Eye className="w-5 h-5 text-muted-foreground" />
                  <h3 className="font-semibold">Visualizador</h3>
                </div>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>• Acesso apenas ao dashboard</li>
                  <li>• Não pode alterar dados</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      </main>

      {/* Footer */}
      <footer className="border-t border-border bg-card/50 py-6">
        <div className="container text-center text-sm text-muted-foreground">
          Wolff e Scripes Advogados • Sistema de Gestão
        </div>
      </footer>
    </div>
  );
}

export default Users;
