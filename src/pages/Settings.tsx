import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Bell, Mail, Phone, Save, Trash2, Plus, Settings as SettingsIcon, Target, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import wsaLogo from "@/assets/wsa-logo.png";

interface AlertSettings {
  id: string;
  threshold_attention: number;
  threshold_risk: number;
  threshold_overflow: number;
  email_notifications_enabled: boolean;
  whatsapp_notifications_enabled: boolean;
}

interface NotificationRecipient {
  id: string;
  type: string;
  value: string;
  name: string | null;
  is_active: boolean;
  alert_levels: string[];
}

export default function Settings() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { isAdmin, hasRole } = useAuth();
  const canAccessMetas = hasRole('socio') || hasRole('gestao');
  
  const [settings, setSettings] = useState<AlertSettings | null>(null);
  const [recipients, setRecipients] = useState<NotificationRecipient[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  // Form states for new recipient
  const [newRecipientType, setNewRecipientType] = useState<'email' | 'whatsapp'>('email');
  const [newRecipientValue, setNewRecipientValue] = useState('');
  const [newRecipientName, setNewRecipientName] = useState('');
  
  useEffect(() => {
    if (!isAdmin && !canAccessMetas) {
      navigate('/');
      return;
    }
    if (isAdmin) {
      loadSettings();
    } else {
      setLoading(false);
    }
  }, [isAdmin, canAccessMetas, navigate]);
  
  async function loadSettings() {
    try {
      // Load alert settings
      const { data: settingsData, error: settingsError } = await supabase
        .from('alert_settings')
        .select('*')
        .limit(1)
        .maybeSingle();
      
      if (settingsError) throw settingsError;
      
      if (settingsData) {
        setSettings(settingsData);
      }
      
      // Load recipients
      const { data: recipientsData, error: recipientsError } = await supabase
        .from('notification_recipients')
        .select('*')
        .order('created_at', { ascending: true });
      
      if (recipientsError) throw recipientsError;
      
      setRecipients(recipientsData || []);
    } catch (error) {
      console.error('Error loading settings:', error);
      toast({
        title: "Erro",
        description: "Não foi possível carregar as configurações.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }
  
  async function saveSettings() {
    if (!settings) return;
    
    setSaving(true);
    try {
      const { error } = await supabase
        .from('alert_settings')
        .update({
          threshold_attention: settings.threshold_attention,
          threshold_risk: settings.threshold_risk,
          threshold_overflow: settings.threshold_overflow,
          email_notifications_enabled: settings.email_notifications_enabled,
          whatsapp_notifications_enabled: settings.whatsapp_notifications_enabled,
        })
        .eq('id', settings.id);
      
      if (error) throw error;
      
      toast({
        title: "Sucesso ✓",
        description: "Configurações salvas com sucesso.",
      });
    } catch (error) {
      console.error('Error saving settings:', error);
      toast({
        title: "Erro",
        description: "Não foi possível salvar as configurações.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }
  
  async function addRecipient() {
    if (!newRecipientValue) return;
    
    try {
      const { data, error } = await supabase
        .from('notification_recipients')
        .insert({
          type: newRecipientType,
          value: newRecipientValue,
          name: newRecipientName || null,
          is_active: true,
          alert_levels: ['attention', 'risk', 'overflow'],
        })
        .select()
        .single();
      
      if (error) throw error;
      
      setRecipients([...recipients, data]);
      setNewRecipientValue('');
      setNewRecipientName('');
      
      toast({
        title: "Sucesso",
        description: "Destinatário adicionado.",
      });
    } catch (error) {
      console.error('Error adding recipient:', error);
      toast({
        title: "Erro",
        description: "Não foi possível adicionar o destinatário.",
        variant: "destructive",
      });
    }
  }
  
  async function toggleRecipient(id: string, is_active: boolean) {
    try {
      const { error } = await supabase
        .from('notification_recipients')
        .update({ is_active })
        .eq('id', id);
      
      if (error) throw error;
      
      setRecipients(recipients.map(r => r.id === id ? { ...r, is_active } : r));
    } catch (error) {
      console.error('Error toggling recipient:', error);
    }
  }
  
  async function deleteRecipient(id: string) {
    try {
      const { error } = await supabase
        .from('notification_recipients')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
      
      setRecipients(recipients.filter(r => r.id !== id));
      
      toast({
        title: "Sucesso",
        description: "Destinatário removido.",
      });
    } catch (error) {
      console.error('Error deleting recipient:', error);
      toast({
        title: "Erro",
        description: "Não foi possível remover o destinatário.",
        variant: "destructive",
      });
    }
  }
  
  async function updateRecipientLevels(id: string, levels: string[]) {
    try {
      const { error } = await supabase
        .from('notification_recipients')
        .update({ alert_levels: levels })
        .eq('id', id);
      
      if (error) throw error;
      
      setRecipients(recipients.map(r => r.id === id ? { ...r, alert_levels: levels } : r));
    } catch (error) {
      console.error('Error updating recipient levels:', error);
    }
  }
  
  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Carregando configurações...</div>
      </div>
    );
  }
  
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="icon" onClick={() => navigate('/', { replace: true })}>
                <ArrowLeft className="w-5 h-5" />
              </Button>
              <img src={wsaLogo} alt="WSA" className="h-8 object-contain" />
              <div>
                <h1 className="text-xl font-display font-bold">Configurações de Alertas</h1>
                <p className="text-sm text-muted-foreground">Gerenciar notificações e destinatários</p>
              </div>
            </div>
          </div>
        </div>
      </header>
      
      <main className="container py-8 max-w-4xl space-y-8">
        {/* Configurações Estratégicas - only for socio and gestao */}
        {canAccessMetas && (
          <Card className="border-primary/20 bg-primary/5">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <Target className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-lg flex items-center gap-2">
                    Configurações Estratégicas
                    <Shield className="w-4 h-4 text-muted-foreground" />
                  </CardTitle>
                  <CardDescription>
                    Módulos de acesso restrito para sócios e gestão
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Button
                variant="outline"
                className="border-primary/30 hover:bg-primary/10"
                onClick={() => navigate('/metas-2026')}
              >
                <Target className="w-4 h-4 mr-2 text-primary" />
                Metas 2026 — Receita Recorrente
              </Button>
            </CardContent>
          </Card>
        )}

        {isAdmin && <Tabs defaultValue="thresholds" className="space-y-6">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="thresholds">
              <SettingsIcon className="w-4 h-4 mr-2" />
              Limites
            </TabsTrigger>
            <TabsTrigger value="recipients">
              <Mail className="w-4 h-4 mr-2" />
              Destinatários
            </TabsTrigger>
            <TabsTrigger value="channels">
              <Bell className="w-4 h-4 mr-2" />
              Canais
            </TabsTrigger>
          </TabsList>
          
          {/* Thresholds Tab */}
          <TabsContent value="thresholds">
            <Card>
              <CardHeader>
                <CardTitle>Limites de Alerta</CardTitle>
                <CardDescription>
                  Configure os percentuais que disparam cada nível de alerta
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/20">
                        🔔 Atenção
                      </Badge>
                    </Label>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min={1}
                        max={100}
                        value={settings?.threshold_attention || 60}
                        onChange={(e) => setSettings(s => s ? { ...s, threshold_attention: parseInt(e.target.value) || 60 } : s)}
                        className="w-24"
                      />
                      <span className="text-muted-foreground">%</span>
                    </div>
                    <p className="text-xs text-muted-foreground">Alerta interno para sócios</p>
                  </div>
                  
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <Badge variant="outline" className="bg-orange-500/10 text-orange-600 border-orange-500/20">
                        ⚠️ Risco
                      </Badge>
                    </Label>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min={1}
                        max={100}
                        value={settings?.threshold_risk || 80}
                        onChange={(e) => setSettings(s => s ? { ...s, threshold_risk: parseInt(e.target.value) || 80 } : s)}
                        className="w-24"
                      />
                      <span className="text-muted-foreground">%</span>
                    </div>
                    <p className="text-xs text-muted-foreground">Risco de estouro iminente</p>
                  </div>
                  
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/20">
                        🚨 Estouro
                      </Badge>
                    </Label>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min={1}
                        max={200}
                        value={settings?.threshold_overflow || 100}
                        onChange={(e) => setSettings(s => s ? { ...s, threshold_overflow: parseInt(e.target.value) || 100 } : s)}
                        className="w-24"
                      />
                      <span className="text-muted-foreground">%</span>
                    </div>
                    <p className="text-xs text-muted-foreground">Faturamento adicional obrigatório</p>
                  </div>
                </div>
                
                <Button onClick={saveSettings} disabled={saving}>
                  <Save className="w-4 h-4 mr-2" />
                  {saving ? 'Salvando...' : 'Salvar Limites'}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
          
          {/* Recipients Tab */}
          <TabsContent value="recipients">
            <Card>
              <CardHeader>
                <CardTitle>Destinatários de Notificação</CardTitle>
                <CardDescription>
                  E-mails e números de WhatsApp que receberão os alertas
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Add new recipient */}
                <div className="flex flex-col md:flex-row gap-3 p-4 border border-dashed border-border rounded-lg">
                  <div className="flex gap-2">
                    <Button
                      variant={newRecipientType === 'email' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setNewRecipientType('email')}
                    >
                      <Mail className="w-4 h-4 mr-1" />
                      E-mail
                    </Button>
                    <Button
                      variant={newRecipientType === 'whatsapp' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setNewRecipientType('whatsapp')}
                    >
                      <Phone className="w-4 h-4 mr-1" />
                      WhatsApp
                    </Button>
                  </div>
                  <Input
                    placeholder={newRecipientType === 'email' ? 'email@exemplo.com' : '+55 11 99999-9999'}
                    value={newRecipientValue}
                    onChange={(e) => setNewRecipientValue(e.target.value)}
                    className="flex-1"
                  />
                  <Input
                    placeholder="Nome (opcional)"
                    value={newRecipientName}
                    onChange={(e) => setNewRecipientName(e.target.value)}
                    className="w-40"
                  />
                  <Button onClick={addRecipient} disabled={!newRecipientValue}>
                    <Plus className="w-4 h-4 mr-2" />
                    Adicionar
                  </Button>
                </div>
                
                {/* Recipients list */}
                <div className="space-y-3">
                  {recipients.length === 0 ? (
                    <p className="text-center text-muted-foreground py-8">
                      Nenhum destinatário cadastrado ainda.
                    </p>
                  ) : (
                    recipients.map((recipient) => (
                      <div
                        key={recipient.id}
                        className="flex items-center justify-between p-3 border border-border rounded-lg"
                      >
                        <div className="flex items-center gap-3">
                          <Switch
                            checked={recipient.is_active}
                            onCheckedChange={(checked) => toggleRecipient(recipient.id, checked)}
                          />
                          <div className="flex items-center gap-2">
                            {recipient.type === 'email' ? (
                              <Mail className="w-4 h-4 text-muted-foreground" />
                            ) : (
                              <Phone className="w-4 h-4 text-muted-foreground" />
                            )}
                            <span className={recipient.is_active ? '' : 'text-muted-foreground line-through'}>
                              {recipient.value}
                            </span>
                            {recipient.name && (
                              <span className="text-sm text-muted-foreground">({recipient.name})</span>
                            )}
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-4">
                          <div className="flex items-center gap-2">
                            {['attention', 'risk', 'overflow'].map((level) => (
                              <label key={level} className="flex items-center gap-1 text-xs">
                                <Checkbox
                                  checked={recipient.alert_levels.includes(level)}
                                  onCheckedChange={(checked) => {
                                    const newLevels = checked
                                      ? [...recipient.alert_levels, level]
                                      : recipient.alert_levels.filter(l => l !== level);
                                    updateRecipientLevels(recipient.id, newLevels);
                                  }}
                                />
                                <span className={
                                  level === 'attention' ? 'text-amber-600' :
                                  level === 'risk' ? 'text-orange-600' :
                                  'text-destructive'
                                }>
                                  {level === 'attention' ? '🔔' : level === 'risk' ? '⚠️' : '🚨'}
                                </span>
                              </label>
                            ))}
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => deleteRecipient(recipient.id)}
                          >
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          
          {/* Channels Tab */}
          <TabsContent value="channels">
            <Card>
              <CardHeader>
                <CardTitle>Canais de Notificação</CardTitle>
                <CardDescription>
                  Ativar ou desativar canais de envio
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 border border-border rounded-lg">
                    <div className="flex items-center gap-3">
                      <Mail className="w-5 h-5 text-primary" />
                      <div>
                        <p className="font-medium">E-mail</p>
                        <p className="text-sm text-muted-foreground">
                          Enviar alertas por e-mail
                        </p>
                      </div>
                    </div>
                    <Switch
                      checked={settings?.email_notifications_enabled}
                      onCheckedChange={(checked) => setSettings(s => s ? { ...s, email_notifications_enabled: checked } : s)}
                    />
                  </div>
                  
                  <div className="flex items-center justify-between p-4 border border-border rounded-lg">
                    <div className="flex items-center gap-3">
                      <Phone className="w-5 h-5 text-primary" />
                      <div>
                        <p className="font-medium">WhatsApp</p>
                        <p className="text-sm text-muted-foreground">
                          Enviar alertas por WhatsApp (requer configuração de API)
                        </p>
                      </div>
                    </div>
                    <Switch
                      checked={settings?.whatsapp_notifications_enabled}
                      onCheckedChange={(checked) => setSettings(s => s ? { ...s, whatsapp_notifications_enabled: checked } : s)}
                    />
                  </div>
                </div>
                
                <Button onClick={saveSettings} disabled={saving}>
                  <Save className="w-4 h-4 mr-2" />
                  {saving ? 'Salvando...' : 'Salvar Canais'}
                </Button>
                
                <div className="p-4 bg-muted/50 rounded-lg">
                  <p className="text-sm text-muted-foreground">
                    <strong>Nota:</strong> Para habilitar notificações por e-mail, é necessário configurar a API do Resend.
                    Para WhatsApp, configure a API do Twilio ou Z-API.
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>}
      </main>
    </div>
  );
}