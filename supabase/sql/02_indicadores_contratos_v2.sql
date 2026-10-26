-- =====================================================================
-- Painel WSA · Indicadores por área · Contratos · v2
-- Rodar no SQL Editor do Supabase DEPOIS do 01_supabase_indicadores_contratos.sql
-- (idempotente: pode rodar de novo).
--
-- O que muda
-- C2 passa a medir RETRABALHO por demanda de ELABORAÇÃO:
--    · 1 ajuste é esperado; a partir do 2º ajuste é retrabalho.
--    · Demandas de ANÁLISE ficam fora (vai e volta faz parte do trabalho).
-- C4 novo: tempo médio em que o projeto fica aberto
--    · da abertura (1ª tarefa criada no projeto) até a conclusão da
--      última Entrega Externa; só projetos sem entrega em aberto.
--
-- Tipo da demanda: campo "Tipo de demanda" (Elaboração / Análise) no Asana.
-- Sem o campo, vale o nome da tarefa ("… - Análise" sem "Elaboração" = análise).
-- Sem nenhum dos dois, a demanda conta como elaboração.
-- =====================================================================

-- 1. Coluna nova, preenchida pela sincronização --------------------------
alter table contratos_tarefas
  add column if not exists tipo_demanda text
  check (tipo_demanda in ('elaboracao', 'analise'));

-- 2. Uma linha por projeto (demanda) -------------------------------------
drop view if exists vw_indicadores_contratos_mensal;
drop view if exists vw_contratos_projetos;

create view vw_contratos_projetos
with (security_invoker = true) as
with tarefas as (
  select * from contratos_tarefas where not cancelada
),
tipo as (
  select
    projeto_gid,
    case
      when bool_or(tipo_demanda = 'analise')    then 'analise'
      when bool_or(tipo_demanda = 'elaboracao') then 'elaboracao'
      when bool_or(tipo = 'outra' and nome ~* 'an[aá]lise' and nome !~* 'elabora') then 'analise'
      when bool_or(tipo = 'outra' and nome ~* 'elabora' and nome !~* 'an[aá]lise') then 'elaboracao'
      else 'elaboracao'
    end as tipo_demanda,
    case
      when bool_or(tipo_demanda is not null) then 'campo'
      when bool_or(tipo = 'outra' and (
             (nome ~* 'an[aá]lise' and nome !~* 'elabora') or
             (nome ~* 'elabora' and nome !~* 'an[aá]lise'))) then 'nome'
      else 'padrao'
    end as tipo_origem,
    min(criada_em)                                         as aberto_em,
    max(url) filter (where tipo = 'entrega')               as url
  from tarefas
  group by projeto_gid
),
entregas as (
  select
    projeto_gid,
    max(projeto_nome)                                      as projeto_nome,
    count(*)                                               as entregas,
    count(*) filter (where not concluida)                  as entregas_abertas,
    sum(devolucoes)                                        as ajustes,
    min(entregue_em)                                       as primeira_entrega_em,
    max(entregue_em)                                       as ultima_entrega_em
  from vw_contratos_demandas
  group by projeto_gid
)
select
  e.projeto_gid,
  e.projeto_nome,
  t.tipo_demanda,
  t.tipo_origem,
  t.aberto_em,
  e.primeira_entrega_em,
  e.ultima_entrega_em,
  e.entregas,
  e.ajustes,
  greatest(e.ajustes - 1, 0)                               as retrabalhos,
  e.entregas_abertas = 0                                   as encerrado,
  case when e.entregas_abertas = 0
       then dias_uteis_entre(t.aberto_em, e.ultima_entrega_em) end as dias_uteis_aberto,
  case when e.entregas_abertas = 0
       then e.ultima_entrega_em - t.aberto_em end          as dias_corridos_aberto,
  case when e.entregas_abertas > 0
       then dias_uteis_entre(t.aberto_em, current_date) end as dias_uteis_em_aberto,
  t.url
from entregas e
join tipo t using (projeto_gid);

-- 3. Indicadores mensais --------------------------------------------------
-- C1: entregas pelo mês da entrega (sem mudança).
-- C2: demandas de elaboração pelo mês da 1ª entrega; sem retrabalho = até 1 ajuste.
-- C3: horas × estimativa (sem mudança).
-- C4: projetos pelo mês da última entrega; média de dias úteis e corridos abertos.
create view vw_indicadores_contratos_mensal
with (security_invoker = true) as
with entregas as (
  select date_trunc('month', entregue_em)::date as mes,
         count(*)                               as entregas,
         count(*) filter (where no_prazo)       as no_prazo
  from vw_contratos_demandas
  where concluida
  group by 1
),
elaboracao as (
  select date_trunc('month', primeira_entrega_em)::date       as mes,
         count(*)                                             as demandas,
         count(*) filter (where ajustes = 0)                  as sem_ajuste,
         count(*) filter (where ajustes = 1)                  as com_1_ajuste,
         count(*) filter (where ajustes >= 2)                 as com_retrabalho,
         count(*) filter (where tipo_origem = 'padrao')       as sem_classificacao
  from vw_contratos_projetos
  where tipo_demanda = 'elaboracao' and primeira_entrega_em is not null
  group by 1
),
analise as (
  select date_trunc('month', primeira_entrega_em)::date as mes, count(*) as demandas
  from vw_contratos_projetos
  where tipo_demanda = 'analise' and primeira_entrega_em is not null
  group by 1
),
abertura as (
  select date_trunc('month', ultima_entrega_em)::date    as mes,
         count(*)                                        as projetos,
         avg(dias_uteis_aberto)                          as media_uteis,
         avg(dias_corridos_aberto)                       as media_corridos
  from vw_contratos_projetos
  where encerrado
  group by 1
),
horas as (
  select date_trunc('month', concluida_em)::date                       as mes,
         count(*)                                                      as encerradas,
         count(*) filter (where coalesce(horas_estimadas, 0) > 0)      as com_estimativa,
         sum(horas_lancadas)  filter (where coalesce(horas_estimadas, 0) > 0) as horas_lancadas,
         sum(horas_estimadas) filter (where coalesce(horas_estimadas, 0) > 0) as horas_estimadas
  from contratos_tarefas
  where concluida and tipo <> 'fup' and not cancelada
  group by 1
),
meses as (
  select mes from entregas union select mes from elaboracao union select mes from analise
  union select mes from abertura union select mes from horas
)
select
  m.mes,
  coalesce(e.entregas, 0)                                             as entregas,
  coalesce(e.no_prazo, 0)                                             as entregas_no_prazo,
  round(100.0 * e.no_prazo / nullif(e.entregas, 0), 1)                as c1_pct_no_prazo,
  coalesce(el.demandas, 0)                                            as elaboracoes,
  coalesce(el.sem_ajuste, 0)                                          as elaboracoes_sem_ajuste,
  coalesce(el.com_1_ajuste, 0)                                        as elaboracoes_com_1_ajuste,
  coalesce(el.com_retrabalho, 0)                                      as elaboracoes_com_retrabalho,
  coalesce(el.sem_classificacao, 0)                                   as elaboracoes_sem_classificacao,
  round(100.0 * (el.demandas - el.com_retrabalho) / nullif(el.demandas, 0), 1) as c2_pct_sem_retrabalho,
  coalesce(an.demandas, 0)                                            as analises,
  coalesce(h.encerradas, 0)                                           as encerradas,
  coalesce(h.com_estimativa, 0)                                       as encerradas_com_estimativa,
  round(h.horas_lancadas, 1)                                          as horas_lancadas,
  round(h.horas_estimadas, 1)                                         as horas_estimadas,
  round(h.horas_lancadas / nullif(h.horas_estimadas, 0), 2)           as c3_razao_horas,
  round(100.0 * h.com_estimativa / nullif(h.encerradas, 0), 1)        as cobertura_estimativa_pct,
  coalesce(ab.projetos, 0)                                            as projetos_encerrados,
  round(ab.media_uteis, 1)                                            as c4_media_dias_uteis_aberto,
  round(ab.media_corridos, 1)                                         as c4_media_dias_corridos_aberto
from meses m
left join entregas   e  on e.mes  = m.mes
left join elaboracao el on el.mes = m.mes
left join analise    an on an.mes = m.mes
left join abertura   ab on ab.mes = m.mes
left join horas      h  on h.mes  = m.mes
order by 1;
