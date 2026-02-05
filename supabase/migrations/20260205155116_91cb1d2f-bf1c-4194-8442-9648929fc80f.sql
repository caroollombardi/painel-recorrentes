-- Remover política permissiva e criar uma mais restrita
DROP POLICY IF EXISTS "Service role can insert notification history" ON public.notification_history;

-- Edge functions usam service role que bypassa RLS, então não precisamos de política INSERT
-- Apenas admins podem ver o histórico (já configurado)