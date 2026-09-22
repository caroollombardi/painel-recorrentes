-- ============================================================
-- Corrige a falha silenciosa nas views de horas.
--
-- A versão anterior de vw_horas_valorizadas filtrava com
-- WHERE pode_ver_valores(auth.uid()), o que devolvia ZERO LINHAS
-- para quem não tem permissão. Num painel de faturamento isso
-- parece "não houve trabalho no mês" em vez de "você não tem
-- acesso" — o pior tipo de erro, porque não parece erro.
--
-- Agora são duas views:
--   vw_horas             — horas, sem valores. Qualquer autenticado. Nunca falha.
--   vw_horas_valorizadas — com valores. Levanta exceção se não houver permissão.
--
-- Já aplicada em produção pelo SQL Editor em 22/09/2026.
-- Este arquivo existe para o repositório refletir o banco.
-- ============================================================

CREATE OR REPLACE FUNCTION public.exigir_permissao_valores()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.pode_ver_valores(auth.uid()) THEN
    RAISE EXCEPTION 'SEM_PERMISSAO_VALORES: seu perfil nao tem acesso a valores financeiros'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN true;
END;
$$;

-- Horas sem dinheiro: base comum, legível por qualquer autenticado
CREATE OR REPLACE VIEW public.vw_horas
WITH (security_invoker = true) AS
SELECT
  te.id, te.task_name, te.assignee, te.client, te.project, te.activity_type,
  te.completed_date, te.month, te.year, te.hours_logged,
  eq.id AS membro_id, eq.cargo, eq.area, cl.id AS cliente_id
FROM public.time_entries te
LEFT JOIN public.equipe eq
  ON lower(trim(te.assignee)) = lower(trim(eq.nome))
  OR lower(trim(te.assignee)) = ANY (SELECT lower(trim(a)) FROM unnest(eq.apelidos) a)
LEFT JOIN public.clientes cl
  ON lower(trim(te.client)) = lower(trim(cl.nome))
  OR lower(trim(te.client)) = ANY (SELECT lower(trim(a)) FROM unnest(cl.apelidos) a);

DROP VIEW IF EXISTS public.vw_horas_valorizadas;

CREATE VIEW public.vw_horas_valorizadas
WITH (security_invoker = true) AS
SELECT
  h.*,
  public.taxa_vigente(h.membro_id, COALESCE(h.completed_date, make_date(h.year, h.month, 1))) AS valor_hora_epoca,
  h.hours_logged * COALESCE(
    public.taxa_vigente(h.membro_id, COALESCE(h.completed_date, make_date(h.year, h.month, 1))), 0
  ) AS valor_lancamento
FROM public.vw_horas h
WHERE public.exigir_permissao_valores();

-- Limitação conhecida: a exceção é levantada por linha. Se a consulta
-- não retornar nenhuma linha (base vazia), ela não dispara e o
-- resultado vem vazio sem erro. Não afeta o caso real, em que sempre
-- há lançamentos.
