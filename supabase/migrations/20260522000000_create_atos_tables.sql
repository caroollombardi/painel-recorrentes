-- =====================================================================
-- Módulo Atos: análise de Resultado vs Horas por projeto fechado
-- =====================================================================
-- atos_projetos: 1 linha por projeto importado (chave única = asana_project_id)
-- atos_lancamentos: N linhas por projeto, cada uma representa um lançamento
--                   de hora vindo do export do Asana
-- =====================================================================

CREATE TABLE public.atos_projetos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asana_project_id text NOT NULL UNIQUE,
  nome_projeto text NOT NULL,
  valor_combinado numeric NOT NULL DEFAULT 0,
  incluir_nao_billable boolean NOT NULL DEFAULT true,
  uploaded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.atos_lancamentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  projeto_id uuid NOT NULL REFERENCES public.atos_projetos(id) ON DELETE CASCADE,
  colaborador_nome text NOT NULL,
  tarefa_nome text,
  asana_task_id text,
  duracao_minutos integer NOT NULL DEFAULT 0,
  billable boolean NOT NULL DEFAULT true,
  data_lancamento date,
  descricao text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Índices
CREATE INDEX idx_atos_lancamentos_projeto ON public.atos_lancamentos(projeto_id);
CREATE INDEX idx_atos_lancamentos_colaborador ON public.atos_lancamentos(colaborador_nome);
CREATE INDEX idx_atos_projetos_asana ON public.atos_projetos(asana_project_id);

-- RLS: mesmo padrão de time_entries
ALTER TABLE public.atos_projetos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.atos_lancamentos ENABLE ROW LEVEL SECURITY;

-- Todos autenticados podem ver (Carol pediu: "todos que tem acesso ao dashboard podem ver")
CREATE POLICY "Authenticated users can view atos projetos"
  ON public.atos_projetos FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can view atos lancamentos"
  ON public.atos_lancamentos FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);

-- Escrita: qualquer autenticado pode importar e editar (Carol e equipe usam)
-- Se quiser restringir só pra admin/socio/gestao depois, troca por is_admin(auth.uid())
CREATE POLICY "Authenticated users can manage atos projetos"
  ON public.atos_projetos FOR ALL
  TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can manage atos lancamentos"
  ON public.atos_lancamentos FOR ALL
  TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- Trigger pra updated_at em atos_projetos
CREATE OR REPLACE FUNCTION public.update_atos_projetos_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_atos_projetos_updated_at
  BEFORE UPDATE ON public.atos_projetos
  FOR EACH ROW
  EXECUTE FUNCTION public.update_atos_projetos_updated_at();
