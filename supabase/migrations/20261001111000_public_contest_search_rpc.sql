-- Sprint 2.4: parametrized, RLS-aware public contest discovery.
create or replace function public.search_public_contests(
  p_q text default null,
  p_orgao text default null,
  p_cargo text default null,
  p_banca text default null,
  p_cidade text default null,
  p_estado text default null,
  p_nivel text default null,
  p_status text default null,
  p_abrangencia text default null,
  p_salario_min numeric default null,
  p_salario_max numeric default null,
  p_inscricao text default null,
  p_sort text default 'RECENTES',
  p_page integer default 1,
  p_per_page integer default 24
) returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with filtered as (
    select c.id, c.orgao, c.titulo, c.banca, c.vagas, c.salario, c.status,
      c.edital_url, c.prova_data, c.created_at, c.inscricao_inicio, c.inscricao_fim,
      c.cadastro_reserva, c.cargos, c.escolaridade, c.scope, c.state_code, c.city,
      c.location_label, c.hot_score, c.hot_reasons, c.quality_status
    from public.concursos c
    where c.is_publishable = true
      and c.merged_into_id is null
      and (
        p_q is null
        or c.orgao ilike '%' || p_q || '%'
        or c.titulo ilike '%' || p_q || '%'
        or c.banca ilike '%' || p_q || '%'
        or c.city ilike '%' || p_q || '%'
        or exists (
          select 1 from jsonb_array_elements_text(coalesce(c.cargos, '[]'::jsonb)) as cargo(value)
          where cargo.value ilike '%' || p_q || '%'
        )
      )
      and (p_orgao is null or c.orgao ilike '%' || p_orgao || '%')
      and (p_banca is null or c.banca ilike '%' || p_banca || '%')
      and (p_cidade is null or c.city ilike '%' || p_cidade || '%')
      and (
        p_cargo is null
        or exists (
          select 1 from jsonb_array_elements_text(coalesce(c.cargos, '[]'::jsonb)) as cargo(value)
          where cargo.value ilike '%' || p_cargo || '%'
        )
      )
      and (p_estado is null or c.state_code = p_estado)
      and (p_nivel is null or p_nivel = any(c.escolaridade))
      and (p_status is null or c.status = p_status)
      and (
        p_abrangencia is null
        or (p_abrangencia <> 'FEDERAL' and c.scope = p_abrangencia)
        or (
          p_abrangencia = 'FEDERAL'
          and c.scope = 'NACIONAL'
          and concat_ws(' ', c.orgao, c.titulo) ~* '(federal|(^|[^A-Z])(PF|PRF|INSS|BACEN|IBAMA|ICMBIO|AGU|DPU|MPF)([^A-Z]|$)|(^|[^A-Z])(TRF|TRT|TRE)[ -]?[0-9]*)'
        )
      )
      and (p_salario_min is null or c.salario >= p_salario_min)
      and (p_salario_max is null or c.salario <= p_salario_max)
      and (
        p_inscricao is null
        or (p_inscricao = 'ABERTA' and c.inscricao_inicio <= current_date and c.inscricao_fim >= current_date)
        or (p_inscricao = 'ENCERRANDO' and c.inscricao_fim between current_date and current_date + 7)
        or (p_inscricao = 'FUTURA' and c.inscricao_inicio > current_date)
      )
  ), paged as (
    select *
    from filtered
    order by
      case when p_sort = 'RECENTES' then created_at end desc nulls last,
      case when p_sort = 'ENCERRANDO' then inscricao_fim end asc nulls last,
      case when p_sort = 'SALARIO' then salario end desc nulls last,
      case when p_sort = 'VAGAS' then vagas end desc nulls last,
      case when p_sort = 'HOT' then hot_score end desc nulls last,
      id asc
    limit least(greatest(p_per_page, 1), 50)
    offset (greatest(p_page, 1) - 1) * least(greatest(p_per_page, 1), 50)
  )
  select jsonb_build_object(
    'data', coalesce((select jsonb_agg(to_jsonb(paged)) from paged), '[]'::jsonb),
    'total', (select count(*) from filtered)
  );
$$;

revoke all on function public.search_public_contests(text,text,text,text,text,text,text,text,text,numeric,numeric,text,text,integer,integer) from public;
grant execute on function public.search_public_contests(text,text,text,text,text,text,text,text,text,numeric,numeric,text,text,integer,integer) to anon, authenticated;
