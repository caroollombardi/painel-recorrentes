-- Tabela de configurações de alertas
CREATE TABLE public.alert_settings (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    threshold_attention INTEGER NOT NULL DEFAULT 60,  -- Nível 1: Atenção
    threshold_risk INTEGER NOT NULL DEFAULT 80,       -- Nível 2: Risco
    threshold_overflow INTEGER NOT NULL DEFAULT 100,  -- Nível 3: Estouro
    email_notifications_enabled BOOLEAN NOT NULL DEFAULT true,
    whatsapp_notifications_enabled BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Tabela de destinatários de notificação
CREATE TABLE public.notification_recipients (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    type TEXT NOT NULL CHECK (type IN ('email', 'whatsapp')),
    value TEXT NOT NULL,  -- email ou número de telefone
    name TEXT,            -- nome do destinatário
    is_active BOOLEAN NOT NULL DEFAULT true,
    alert_levels TEXT[] NOT NULL DEFAULT ARRAY['attention', 'risk', 'overflow'],
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Tabela de configurações por cliente (ativar/desativar notificações)
CREATE TABLE public.client_notification_settings (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    client_name TEXT NOT NULL UNIQUE,
    notifications_enabled BOOLEAN NOT NULL DEFAULT true,
    custom_threshold_attention INTEGER,
    custom_threshold_risk INTEGER,
    custom_threshold_overflow INTEGER,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Tabela de histórico de notificações enviadas
CREATE TABLE public.notification_history (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    client_name TEXT NOT NULL,
    alert_level TEXT NOT NULL CHECK (alert_level IN ('attention', 'risk', 'overflow')),
    notification_type TEXT NOT NULL CHECK (notification_type IN ('email', 'whatsapp')),
    recipient TEXT NOT NULL,
    message TEXT NOT NULL,
    percent_consumed NUMERIC(5,2) NOT NULL,
    percent_month_elapsed NUMERIC(5,2) NOT NULL,
    hours_consumed NUMERIC(10,2),
    value_consumed NUMERIC(12,2),
    sent_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    success BOOLEAN NOT NULL DEFAULT true,
    error_message TEXT
);

-- Enable RLS
ALTER TABLE public.alert_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_notification_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_history ENABLE ROW LEVEL SECURITY;

-- Policies: Somente admins podem gerenciar configurações
CREATE POLICY "Admins can manage alert settings" ON public.alert_settings
    FOR ALL USING (is_admin(auth.uid()));

CREATE POLICY "Admins can manage notification recipients" ON public.notification_recipients
    FOR ALL USING (is_admin(auth.uid()));

CREATE POLICY "Admins can manage client notification settings" ON public.client_notification_settings
    FOR ALL USING (is_admin(auth.uid()));

CREATE POLICY "Admins can view notification history" ON public.notification_history
    FOR SELECT USING (is_admin(auth.uid()));

CREATE POLICY "Service role can insert notification history" ON public.notification_history
    FOR INSERT WITH CHECK (true);

-- Inserir configurações padrão
INSERT INTO public.alert_settings (threshold_attention, threshold_risk, threshold_overflow)
VALUES (60, 80, 100);

-- Triggers para updated_at
CREATE TRIGGER update_alert_settings_updated_at
    BEFORE UPDATE ON public.alert_settings
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER update_notification_recipients_updated_at
    BEFORE UPDATE ON public.notification_recipients
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER update_client_notification_settings_updated_at
    BEFORE UPDATE ON public.client_notification_settings
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();