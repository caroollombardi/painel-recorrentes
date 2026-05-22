ALTER TABLE public.atos_projetos
  ADD COLUMN IF NOT EXISTS contrato_url text,
  ADD COLUMN IF NOT EXISTS contrato_notas text;
