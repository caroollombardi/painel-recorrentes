-- ============================================================
-- Consolida as regras por cliente numa tabela só.
--
-- client_notification_settings foi criada na fase Lovable com
-- custom_threshold_attention/risk/overflow e notifications_enabled
-- por cliente, ligando por client_name em texto. Nunca foi usada:
-- zero linhas e nenhuma referência no código.
--
-- cliente_alertas cobre o mesmo, ligando por cliente_id e com
-- meta de horas e meta de margem além dos limites.
--
-- Aqui a antiga é RENOMEADA, não apagada. Se algum código
-- esquecido depender dela, o erro aparece na hora em vez de
-- passar batido, e dá para voltar atrás.
--
-- Para remover de vez, depois de algumas semanas sem ninguém
-- sentir falta:
--   DROP TABLE public.zz_client_notification_settings_obsoleta;
-- ============================================================

ALTER TABLE IF EXISTS public.client_notification_settings
  RENAME TO zz_client_notification_settings_obsoleta;

COMMENT ON TABLE public.zz_client_notification_settings_obsoleta IS
  'OBSOLETA desde 22/09/2026. Substituida por cliente_alertas. Estava vazia e sem uso. Remover apos periodo de carencia.';

-- O campo de observações da tabela antiga não tinha equivalente.
-- Como havia intenção de anotar contexto por cliente, fica em cliente_alertas.
ALTER TABLE public.cliente_alertas
  ADD COLUMN IF NOT EXISTS notas text;
