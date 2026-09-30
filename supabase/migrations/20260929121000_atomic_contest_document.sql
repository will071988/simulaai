-- Backfill the remote change key and remove only exact equivalent audit rows,
-- keeping the earliest observation deterministically.
with ranked as (
  select id,
    row_number() over (
      partition by concurso_id, field_name, source_url, new_value
      order by detected_at, id
    ) as duplicate_rank
  from concurso_changes
)
delete from concurso_changes c
using ranked r
where c.id = r.id and r.duplicate_rank > 1;

update concurso_changes
set change_key = md5(concurso_id::text || '|' || field_name || '|' || source_url || '|' || new_value::text)
where change_key is null;

create unique index if not exists concurso_changes_equivalent_unique
  on concurso_changes ((md5(concurso_id::text || '|' || field_name || '|' || source_url || '|' || new_value::text)));

-- One document's resolved facts, evidence, identity and publication are one transaction.
-- Discovery/fetch/AI stay outside this boundary.
create or replace function persist_contest_document(p_plan jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid := nullif(p_plan->>'contest_id', '')::uuid;
  v_created boolean := v_id is null;
  v_doc uuid := (p_plan->'document'->>'collector_document_id')::uuid;
  v_current concursos%rowtype;
  v_incoming concursos%rowtype;
  v_source collector_documents%rowtype;
  v_item jsonb;
  v_field text;
  v_other uuid;
  v_publishable boolean;
  v_has_duplicate boolean;
  v_reasons jsonb;
begin
  select * into strict v_source from collector_documents where id = v_doc for update;
  if v_source.canonical_url is distinct from p_plan->'document'->>'source_url' then
    raise exception 'DOCUMENT_SOURCE_MISMATCH';
  end if;
  if v_source.source_id is null then raise exception 'DOCUMENT_SOURCE_REQUIRED'; end if;
  if nullif(p_plan->'document'->>'expected_content_hash', '') is not null
     and v_source.content_hash is distinct from p_plan->'document'->>'expected_content_hash' then
    raise exception 'DOCUMENT_VERSION_CHANGED';
  end if;
  if v_source.ai_claim_token is distinct from nullif(p_plan->'document'->>'claim_token', '')::uuid then
    raise exception 'DOCUMENT_CLAIM_CHANGED';
  end if;
  v_incoming := jsonb_populate_record(null::concursos, p_plan->'payload');
  perform pg_advisory_xact_lock(hashtextextended(coalesce(v_incoming.logical_key, v_source.canonical_url), 0));

  if v_created and v_incoming.logical_key is not null then
    select * into v_current from concursos
    where logical_key = v_incoming.logical_key and merged_into_id is null
    for update;
    if found then
      -- A logical key alone is not identity proof. Re-resolve against the new row.
      raise exception 'CONTEST_CHANGED_RETRY';
    end if;
  end if;

  if not v_created then
    select * into strict v_current from concursos where id = v_id for update;
    if v_current.merged_into_id is not null then raise exception 'CANONICAL_CHANGED_RETRY'; end if;
    if v_current.updated_at is distinct from (p_plan->>'expected_updated_at')::timestamptz then
      raise exception 'CONTEST_CHANGED_RETRY';
    end if;
  else
    v_id := gen_random_uuid();
  end if;

  -- Refuse any newly introduced critical value without evidence in this batch.
  foreach v_field in array array['orgao','titulo','banca','vagas','salario','inscricao_inicio','inscricao_fim','prova_data','cadastro_reserva'] loop
    if p_plan->'payload'->v_field is not null
       and p_plan->'payload'->v_field <> 'null'::jsonb
       and (v_created or p_plan->'payload'->v_field is distinct from to_jsonb(v_current)->v_field)
       and not exists (
         select 1 from jsonb_array_elements(p_plan->'evidence') e
         where e->>'field_name' = v_field and e->'value_json' = p_plan->'payload'->v_field
           and length(trim(e->>'evidence_text')) > 0
       ) then raise exception 'FIELD_EVIDENCE_REQUIRED: %', v_field;
    end if;
  end loop;

  if v_created then
    insert into concursos(id, orgao, titulo, banca, vagas, salario, status, edital_url,
      prova_data, inscricao_inicio, inscricao_fim, cadastro_reserva, cargos, escolaridade,
      scope, state_code, city, latitude, longitude, location_label, logical_key,
      edital_number, process_number, official_slug, official_source, cargo_key, cargo_group_key,
      quality_status, hot_score, hot_reasons, is_publishable)
    values(v_id, v_incoming.orgao, v_incoming.titulo, v_incoming.banca, v_incoming.vagas,
      v_incoming.salario, v_incoming.status, v_incoming.edital_url, v_incoming.prova_data,
      v_incoming.inscricao_inicio, v_incoming.inscricao_fim, v_incoming.cadastro_reserva,
      coalesce(v_incoming.cargos, '[]'::jsonb), coalesce(v_incoming.escolaridade, '{}'::text[]),
      v_incoming.scope, v_incoming.state_code, v_incoming.city, v_incoming.latitude,
      v_incoming.longitude, v_incoming.location_label, v_incoming.logical_key,
      v_incoming.edital_number, v_incoming.process_number, v_incoming.official_slug,
      v_incoming.official_source, v_incoming.cargo_key, v_incoming.cargo_group_key,
       v_incoming.quality_status, coalesce(v_incoming.hot_score, 0), coalesce(v_incoming.hot_reasons, '[]'::jsonb), false);
  else
    update concursos set orgao = v_incoming.orgao, titulo = v_incoming.titulo,
      banca = v_incoming.banca, vagas = v_incoming.vagas, salario = v_incoming.salario,
      status = v_incoming.status, prova_data = v_incoming.prova_data,
      inscricao_inicio = v_incoming.inscricao_inicio, inscricao_fim = v_incoming.inscricao_fim,
      cadastro_reserva = v_incoming.cadastro_reserva, cargos = v_incoming.cargos,
      escolaridade = v_incoming.escolaridade, scope = v_incoming.scope,
      state_code = v_incoming.state_code, city = v_incoming.city, latitude = v_incoming.latitude,
      longitude = v_incoming.longitude, location_label = v_incoming.location_label,
      edital_url = v_incoming.edital_url, logical_key = v_incoming.logical_key,
      edital_number = v_incoming.edital_number, process_number = v_incoming.process_number,
      official_slug = v_incoming.official_slug, official_source = v_incoming.official_source,
      cargo_key = v_incoming.cargo_key, cargo_group_key = v_incoming.cargo_group_key,
      quality_status = v_incoming.quality_status, hot_score = v_incoming.hot_score,
      hot_reasons = v_incoming.hot_reasons, updated_at = clock_timestamp()
    where id = v_id;
  end if;

  for v_item in select value from jsonb_array_elements(p_plan->'aliases') loop
    insert into concurso_identity_aliases(concurso_id, alias_type, alias_value, source_name, source_url, confidence)
    values(v_id, v_item->>'alias_type', v_item->>'alias_value', coalesce(v_item->>'source_name', ''), v_item->>'source_url', (v_item->>'confidence')::numeric)
    on conflict(concurso_id, alias_type, alias_value, source_name) do nothing;
  end loop;

  if exists(select 1 from concurso_documents where collector_document_id = v_doc and concurso_id <> v_id) then
    raise exception 'DOCUMENT_ALREADY_ASSIGNED';
  end if;
  insert into concurso_documents(concurso_id, collector_document_id, document_type, relationship_type, source_url, source_name, published_at)
  values(v_id, v_doc, p_plan->'document'->>'document_type', p_plan->'document'->>'relationship_type', v_source.canonical_url, p_plan->'document'->>'source_name', (p_plan->'document'->>'published_at')::timestamptz)
  on conflict(collector_document_id) do nothing;

  for v_item in select value from jsonb_array_elements(p_plan->'evidence') loop
    if (v_item->>'document_id')::uuid <> v_doc or v_item->>'source_url' <> v_source.canonical_url then
      raise exception 'EVIDENCE_SOURCE_MISMATCH';
    end if;
    if not exists(select 1 from collector_sources s where s.id = v_source.source_id
      and s.tier = (v_item->>'source_tier')::int
      and lower(split_part(split_part(v_source.canonical_url, '://', 2), '/', 1)) = lower(split_part(split_part(s.base_url, '://', 2), '/', 1))) then
      raise exception 'EVIDENCE_TIER_MISMATCH';
    end if;
    insert into concurso_field_evidence(concurso_id, field_name, value_json, value_hash, source_url, source_name, source_tier, document_id, evidence_text, confidence, observed_at)
    values(v_id, v_item->>'field_name', v_item->'value_json', v_item->>'value_hash', v_source.canonical_url,
      v_item->>'source_name', (v_item->>'source_tier')::int, v_doc, v_item->>'evidence_text',
      (v_item->>'confidence')::numeric, coalesce((v_item->>'observed_at')::timestamptz, v_source.collected_at, now()))
    on conflict(concurso_id, field_name, source_url, value_hash) do nothing;
  end loop;

  for v_item in select value from jsonb_array_elements(p_plan->'changes') loop
    if not exists(select 1 from concurso_changes where concurso_id = v_id
      and field_name = v_item->>'field_name' and source_url = v_item->>'source_url'
      and new_value = v_item->'new_value') then
      insert into concurso_changes(concurso_id, field_name, old_value, new_value, source_url, relationship_type, change_key)
      values(v_id, v_item->>'field_name', v_item->'old_value', v_item->'new_value', v_item->>'source_url', v_item->>'relationship_type',
        md5(v_id::text || '|' || (v_item->>'field_name') || '|' || (v_item->>'source_url') || '|' || (v_item->'new_value')::text))
      on conflict do nothing;
    end if;
  end loop;

  v_other := (p_plan->'duplicate'->>'id')::uuid;
  if v_other is not null and v_other <> v_id then
    insert into concurso_duplicate_candidates(concurso_a_id, concurso_b_id, score, reason, hard_conflicts, identity_signals, status)
    values(least(v_id, v_other), greatest(v_id, v_other), (p_plan->'duplicate'->>'score')::numeric,
      p_plan->'duplicate'->>'reason', p_plan->'duplicate'->'hardConflicts', p_plan->'duplicate'->'identity', 'POSSIBLE_DUPLICATE')
    on conflict(concurso_a_id, concurso_b_id) do nothing;
  end if;

  select exists(select 1 from concurso_duplicate_candidates d
    where d.status = 'POSSIBLE_DUPLICATE' and (d.concurso_a_id = v_id or d.concurso_b_id = v_id))
  into v_has_duplicate;
  select quality_status in ('VERIFIED','PARTIAL') and merged_into_id is null
    and nullif(trim(orgao), '') is not null and nullif(trim(titulo), '') is not null
    and nullif(trim(edital_url), '') is not null
    and (edital_number is not null or process_number is not null or official_slug is not null)
    and not v_has_duplicate
    and exists(select 1 from concurso_field_evidence e where e.concurso_id = v_id and e.source_tier = 1)
  into v_publishable from concursos where id = v_id;
  select case when v_publishable then '["PUBLISHABLE"]'::jsonb else coalesce(jsonb_agg(reason), '[]'::jsonb) end
  into v_reasons
  from (select unnest(array[
    case when v_incoming.quality_status = 'CONFLICTED' then 'CONFLICTED' end,
    case when v_incoming.quality_status not in ('VERIFIED','PARTIAL') then 'QUALITY_NOT_PUBLISHABLE' end,
    case when v_has_duplicate then 'POSSIBLE_DUPLICATE' end,
    case when not v_publishable and (nullif(trim(v_incoming.orgao), '') is null or nullif(trim(v_incoming.titulo), '') is null or nullif(trim(v_incoming.edital_url), '') is null) then 'MISSING_REQUIRED_FIELDS' end,
    case when not v_publishable and v_incoming.edital_number is null and v_incoming.process_number is null and v_incoming.official_slug is null then 'MISSING_IDENTITY' end,
    case when not exists(select 1 from concurso_field_evidence e where e.concurso_id = v_id and e.source_tier = 1) then 'MISSING_OFFICIAL_EVIDENCE' end
  ]) as reason) reasons where reason is not null;
  update concursos set is_publishable = v_publishable,
    publication_reasons = v_reasons,
    publication_evaluated_at = now(), hot_score = case when v_publishable then hot_score else 0 end
  where id = v_id;
  update collector_documents set status = 'PROCESSED', processed_at = now(), ai_claimed_at = null,
    ai_claim_token = null, ai_claimed_hash = null, ai_next_attempt_at = null, ai_last_error_code = null,
    metadata = case when p_plan->'document'->'metadata' is null or p_plan->'document'->'metadata' = 'null'::jsonb
      then metadata else coalesce(metadata, '{}'::jsonb) || p_plan->'document'->'metadata' end
  where id = v_doc;
  return jsonb_build_object('concursoId', v_id, 'created', v_created, 'updated', not v_created,
    'conflicted', v_incoming.quality_status = 'CONFLICTED', 'publishable', v_publishable,
    'duplicateCandidate', v_other is not null);
end;
$$;
revoke all on function persist_contest_document(jsonb) from public;
revoke all on function persist_contest_document(jsonb) from anon;
revoke all on function persist_contest_document(jsonb) from authenticated;
grant execute on function persist_contest_document(jsonb) to service_role;
