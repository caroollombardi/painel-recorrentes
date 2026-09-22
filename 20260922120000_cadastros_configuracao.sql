-- ============================================================
-- Cadastros de configuração com vigência temporal
--
-- Substitui os dados hardcoded em src/lib/lawyer-prices.ts e
-- src/lib/contract-values.ts por tabelas versionadas no banco.
--
-- Princípio: nada que tenha valor financeiro é sobrescrito.
-- Reajuste = nova linha de vigência. O histórico permanece
-- calculado com o valor que valia na data do lançamento.
-- ============================================================

-- Necessária para as constraints de não-sobreposição de vigência
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Atualização automática de updated_at
CREATE OR REPLACE FUNCTION public.tg_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Quem pode administrar cadastros
CREATE OR REPLACE FUNCTION public.pode_gerir_cadastros(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_admin(_user_id)
      OR public.has_role(_user_id, 'socio')
      OR public.has_role(_user_id, 'gestao');
$$;

-- Quem pode ver valores sensíveis (taxa horária individual)
CREATE OR REPLACE FUNCTION public.pode_ver_valores(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_admin(_user_id)
      OR public.has_role(_user_id, 'socio')
      OR public.has_role(_user_id, 'gestao');
$$;


-- ============================================================
-- 1. EQUIPE
-- ============================================================

CREATE TABLE public.equipe (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome          text NOT NULL,
  cargo         text NOT NULL,
  area          text,
  -- nomes alternativos usados no EasyJur/Asana, para casar com
  -- time_entries.assignee sem depender de grafia exata
  apelidos      text[] NOT NULL DEFAULT '{}',
  user_id       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ativo         boolean NOT NULL DEFAULT true,
  data_entrada  date,
  data_saida    date,
  observacao    text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT equipe_nome_unico UNIQUE (nome)
);

CREATE TRIGGER equipe_updated_at
  BEFORE UPDATE ON public.equipe
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Taxa horária com vigência. Reajuste cria linha nova.
CREATE TABLE public.equipe_taxas (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  membro_id        uuid NOT NULL REFERENCES public.equipe(id) ON DELETE CASCADE,
  valor_hora       numeric(10,2) NOT NULL CHECK (valor_hora >= 0),
  vigencia_inicio  date NOT NULL,
  vigencia_fim     date,
  motivo           text,
  criado_por       uuid REFERENCES auth.users(id),
  created_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT equipe_taxas_periodo_valido
    CHECK (vigencia_fim IS NULL OR vigencia_fim >= vigencia_inicio),
  -- impede duas taxas válidas para a mesma pessoa no mesmo dia
  CONSTRAINT equipe_taxas_sem_sobreposicao EXCLUDE USING gist (
    membro_id WITH =,
    daterange(vigencia_inicio, vigencia_fim, '[]') WITH &&
  )
);

CREATE INDEX idx_equipe_taxas_membro ON public.equipe_taxas (membro_id, vigencia_inicio DESC);


-- ============================================================
-- 2. CLIENTES
-- ============================================================

CREATE TABLE public.clientes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome            text NOT NULL,
  nome_exibicao   text,
  -- grafias alternativas para casar com time_entries.client
  apelidos        text[] NOT NULL DEFAULT '{}',
  responsavel_id  uuid REFERENCES public.equipe(id) ON DELETE SET NULL,
  ativo           boolean NOT NULL DEFAULT true,
  email_contato   text,
  observacao      text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT clientes_nome_unico UNIQUE (nome)
);

CREATE TRIGGER clientes_updated_at
  BEFORE UPDATE ON public.clientes
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Condições comerciais com vigência. Reajuste cria linha nova.
CREATE TABLE public.cliente_contratos (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id            uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  valor_mensal          numeric(12,2) NOT NULL CHECK (valor_mensal >= 0),
  -- crédito de horas = valor_mensal * multiplicador (era sempre 2,0)
  multiplicador_credito numeric(5,2) NOT NULL DEFAULT 2.00 CHECK (multiplicador_credito > 0),
  franquia_horas        numeric(8,2),
  tipo_contrato         text NOT NULL DEFAULT 'recorrente'
                          CHECK (tipo_contrato IN ('recorrente','projeto','avulso','cortesia')),
  mes_reajuste          smallint CHECK (mes_reajuste BETWEEN 1 AND 12),
  indice_reajuste       text,
  vigencia_inicio       date NOT NULL,
  vigencia_fim          date,
  motivo                text,
  criado_por            uuid REFERENCES auth.users(id),
  created_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cliente_contratos_periodo_valido
    CHECK (vigencia_fim IS NULL OR vigencia_fim >= vigencia_inicio),
  CONSTRAINT cliente_contratos_sem_sobreposicao EXCLUDE USING gist (
    cliente_id WITH =,
    daterange(vigencia_inicio, vigencia_fim, '[]') WITH &&
  )
);

CREATE INDEX idx_cliente_contratos_cliente ON public.cliente_contratos (cliente_id, vigencia_inicio DESC);

-- Valor de crédito continua disponível como coluna calculada
ALTER TABLE public.cliente_contratos
  ADD COLUMN valor_credito numeric(12,2)
  GENERATED ALWAYS AS (valor_mensal * multiplicador_credito) STORED;


-- ============================================================
-- 3. METAS E ALERTAS POR CLIENTE
-- ============================================================
-- Sobrescrevem os thresholds globais de alert_settings.
-- NULL = herda o valor global.

CREATE TABLE public.cliente_alertas (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id            uuid NOT NULL UNIQUE REFERENCES public.clientes(id) ON DELETE CASCADE,
  threshold_attention   numeric(5,2) CHECK (threshold_attention BETWEEN 0 AND 500),
  threshold_risk        numeric(5,2) CHECK (threshold_risk BETWEEN 0 AND 500),
  threshold_overflow    numeric(5,2) CHECK (threshold_overflow BETWEEN 0 AND 500),
  meta_margem           numeric(5,2),
  meta_horas_mes        numeric(8,2),
  alertas_ativos        boolean NOT NULL DEFAULT true,
  observacao            text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER cliente_alertas_updated_at
  BEFORE UPDATE ON public.cliente_alertas
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();


-- ============================================================
-- 4. CONSULTA PONTUAL NO TEMPO
-- ============================================================

-- Taxa horária que valia numa data específica
CREATE OR REPLACE FUNCTION public.taxa_vigente(_membro_id uuid, _data date)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT valor_hora
  FROM public.equipe_taxas
  WHERE membro_id = _membro_id
    AND vigencia_inicio <= _data
    AND (vigencia_fim IS NULL OR vigencia_fim >= _data)
  LIMIT 1;
$$;

-- Contrato que valia numa data específica
CREATE OR REPLACE FUNCTION public.contrato_vigente(_cliente_id uuid, _data date)
RETURNS public.cliente_contratos
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT *
  FROM public.cliente_contratos
  WHERE cliente_id = _cliente_id
    AND vigencia_inicio <= _data
    AND (vigencia_fim IS NULL OR vigencia_fim >= _data)
  LIMIT 1;
$$;

-- Fecha a vigência anterior e abre uma nova, numa transação só.
-- É o que a tela de configuração chama ao registrar um reajuste.
CREATE OR REPLACE FUNCTION public.registrar_taxa(
  _membro_id uuid,
  _valor_hora numeric,
  _vigencia_inicio date,
  _motivo text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _novo_id uuid;
BEGIN
  IF NOT public.pode_gerir_cadastros(auth.uid()) THEN
    RAISE EXCEPTION 'Sem permissão para alterar taxas';
  END IF;

  UPDATE public.equipe_taxas
     SET vigencia_fim = _vigencia_inicio - 1
   WHERE membro_id = _membro_id
     AND vigencia_fim IS NULL
     AND vigencia_inicio < _vigencia_inicio;

  INSERT INTO public.equipe_taxas (membro_id, valor_hora, vigencia_inicio, motivo, criado_por)
  VALUES (_membro_id, _valor_hora, _vigencia_inicio, _motivo, auth.uid())
  RETURNING id INTO _novo_id;

  RETURN _novo_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.registrar_contrato(
  _cliente_id uuid,
  _valor_mensal numeric,
  _vigencia_inicio date,
  _multiplicador numeric DEFAULT 2.00,
  _franquia_horas numeric DEFAULT NULL,
  _tipo_contrato text DEFAULT 'recorrente',
  _motivo text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _novo_id uuid;
BEGIN
  IF NOT public.pode_gerir_cadastros(auth.uid()) THEN
    RAISE EXCEPTION 'Sem permissão para alterar contratos';
  END IF;

  UPDATE public.cliente_contratos
     SET vigencia_fim = _vigencia_inicio - 1
   WHERE cliente_id = _cliente_id
     AND vigencia_fim IS NULL
     AND vigencia_inicio < _vigencia_inicio;

  INSERT INTO public.cliente_contratos (
    cliente_id, valor_mensal, multiplicador_credito, franquia_horas,
    tipo_contrato, vigencia_inicio, motivo, criado_por
  )
  VALUES (
    _cliente_id, _valor_mensal, _multiplicador, _franquia_horas,
    _tipo_contrato, _vigencia_inicio, _motivo, auth.uid()
  )
  RETURNING id INTO _novo_id;

  RETURN _novo_id;
END;
$$;


-- ============================================================
-- 5. HORAS VALORIZADAS PELA TAXA DA ÉPOCA
-- ============================================================
-- Cada lançamento é valorado pela taxa vigente na data em que
-- foi realizado, não pela taxa atual. Reajustar não reescreve
-- o passado.

CREATE OR REPLACE VIEW public.vw_horas_valorizadas
WITH (security_invoker = true) AS
SELECT
  te.id,
  te.task_name,
  te.assignee,
  te.client,
  te.project,
  te.activity_type,
  te.completed_date,
  te.month,
  te.year,
  te.hours_logged,
  eq.id                AS membro_id,
  eq.cargo,
  eq.area,
  cl.id                AS cliente_id,
  public.taxa_vigente(eq.id, COALESCE(te.completed_date, make_date(te.year, te.month, 1))) AS valor_hora_epoca,
  te.hours_logged * COALESCE(
    public.taxa_vigente(eq.id, COALESCE(te.completed_date, make_date(te.year, te.month, 1))), 0
  )                    AS valor_lancamento
FROM public.time_entries te
LEFT JOIN public.equipe eq
  ON lower(trim(te.assignee)) = lower(trim(eq.nome))
  OR lower(trim(te.assignee)) = ANY (SELECT lower(trim(a)) FROM unnest(eq.apelidos) a)
LEFT JOIN public.clientes cl
  ON lower(trim(te.client)) = lower(trim(cl.nome))
  OR lower(trim(te.client)) = ANY (SELECT lower(trim(a)) FROM unnest(cl.apelidos) a)
WHERE public.pode_ver_valores(auth.uid());

-- Diagnóstico: lançamentos que não casaram com nenhum cadastro.
-- Vale expor na tela de configuração.
CREATE OR REPLACE VIEW public.vw_cadastros_orfaos
WITH (security_invoker = true) AS
SELECT 'assignee' AS tipo, te.assignee AS valor, count(*) AS lancamentos
FROM public.time_entries te
LEFT JOIN public.equipe eq
  ON lower(trim(te.assignee)) = lower(trim(eq.nome))
  OR lower(trim(te.assignee)) = ANY (SELECT lower(trim(a)) FROM unnest(eq.apelidos) a)
WHERE eq.id IS NULL AND te.assignee IS NOT NULL
GROUP BY te.assignee
UNION ALL
SELECT 'client', te.client, count(*)
FROM public.time_entries te
LEFT JOIN public.clientes cl
  ON lower(trim(te.client)) = lower(trim(cl.nome))
  OR lower(trim(te.client)) = ANY (SELECT lower(trim(a)) FROM unnest(cl.apelidos) a)
WHERE cl.id IS NULL AND te.client IS NOT NULL
GROUP BY te.client;


-- ============================================================
-- 6. RLS
-- ============================================================

ALTER TABLE public.equipe            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.equipe_taxas      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clientes          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cliente_contratos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cliente_alertas   ENABLE ROW LEVEL SECURITY;

-- Equipe e clientes: todo usuário autenticado enxerga o cadastro
CREATE POLICY "equipe_select" ON public.equipe
  FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "equipe_manage" ON public.equipe
  FOR ALL TO authenticated USING (public.pode_gerir_cadastros(auth.uid()));

CREATE POLICY "clientes_select" ON public.clientes
  FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "clientes_manage" ON public.clientes
  FOR ALL TO authenticated USING (public.pode_gerir_cadastros(auth.uid()));

-- Valores: apenas admin, sócio e gestão.
-- Operacional vê horas, não vê dinheiro.
CREATE POLICY "equipe_taxas_select" ON public.equipe_taxas
  FOR SELECT TO authenticated USING (public.pode_ver_valores(auth.uid()));
CREATE POLICY "equipe_taxas_manage" ON public.equipe_taxas
  FOR ALL TO authenticated USING (public.pode_gerir_cadastros(auth.uid()));

CREATE POLICY "cliente_contratos_select" ON public.cliente_contratos
  FOR SELECT TO authenticated USING (public.pode_ver_valores(auth.uid()));
CREATE POLICY "cliente_contratos_manage" ON public.cliente_contratos
  FOR ALL TO authenticated USING (public.pode_gerir_cadastros(auth.uid()));

CREATE POLICY "cliente_alertas_select" ON public.cliente_alertas
  FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "cliente_alertas_manage" ON public.cliente_alertas
  FOR ALL TO authenticated USING (public.pode_gerir_cadastros(auth.uid()));
