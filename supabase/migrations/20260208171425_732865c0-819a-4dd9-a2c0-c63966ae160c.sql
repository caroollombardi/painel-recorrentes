
-- Create metas_2026 table
CREATE TABLE public.metas_2026 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  socio TEXT NOT NULL,
  meta_clientes INTEGER NOT NULL DEFAULT 0,
  ticket_medio_meta NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  observacoes TEXT,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_by TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT metas_2026_socio_unique UNIQUE (socio)
);

-- Create novos_clientes_2026 table
CREATE TABLE public.novos_clientes_2026 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  socio_responsavel TEXT NOT NULL,
  cliente TEXT NOT NULL,
  data_entrada DATE NOT NULL DEFAULT CURRENT_DATE,
  valor_anual_estimado NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on both tables
ALTER TABLE public.metas_2026 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.novos_clientes_2026 ENABLE ROW LEVEL SECURITY;

-- RLS policies for metas_2026 (only socio and gestao can view)
CREATE POLICY "Socio and Gestao can view metas"
ON public.metas_2026
FOR SELECT
USING (has_role(auth.uid(), 'socio') OR has_role(auth.uid(), 'gestao'));

CREATE POLICY "Gestao can insert metas"
ON public.metas_2026
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'gestao'));

CREATE POLICY "Gestao can update metas"
ON public.metas_2026
FOR UPDATE
USING (has_role(auth.uid(), 'gestao'));

-- RLS policies for novos_clientes_2026
CREATE POLICY "Socio and Gestao can view novos clientes"
ON public.novos_clientes_2026
FOR SELECT
USING (has_role(auth.uid(), 'socio') OR has_role(auth.uid(), 'gestao'));

CREATE POLICY "Gestao can insert novos clientes"
ON public.novos_clientes_2026
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'gestao'));

CREATE POLICY "Gestao can update novos clientes"
ON public.novos_clientes_2026
FOR UPDATE
USING (has_role(auth.uid(), 'gestao'));

CREATE POLICY "Gestao can delete novos clientes"
ON public.novos_clientes_2026
FOR DELETE
USING (has_role(auth.uid(), 'gestao'));

-- Triggers for auto-updating updated_at
CREATE TRIGGER update_metas_2026_updated_at
BEFORE UPDATE ON public.metas_2026
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER update_novos_clientes_2026_updated_at
BEFORE UPDATE ON public.novos_clientes_2026
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at();
