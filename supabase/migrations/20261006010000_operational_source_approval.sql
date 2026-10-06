-- Approval registers a durable source. Activation is explicit and restricted
-- to adapters compiled in this deployment; unknown hosts remain disabled.
alter table public.source_candidates add column operational_source_id uuid references public.collector_sources(id);
create index source_candidates_operational_source_idx on public.source_candidates(operational_source_id);

create function public.ops_known_source_adapter(p_hostname text)
returns table(name text, base_url text, type text, tier int, source_type text, adapter text)
language sql immutable set search_path = public, pg_temp as $$
  select v.name, v.base_url, v.type, v.tier, v.source_type, v.name
  from (values
    ('Cebraspe','https://www.cebraspe.org.br','banca',1,'BANCA'),
    ('FGV','https://conhecimento.fgv.br','banca',1,'BANCA'),
    ('FCC','https://www.concursosfcc.com.br','banca',1,'BANCA'),
    ('Cesgranrio','https://www.cesgranrio.org.br','banca',1,'BANCA'),
    ('Instituto AOCP','https://www.institutoaocp.org.br','banca',1,'BANCA'),
    ('DOU','https://www.in.gov.br','oficial',1,'DIARIO_OFICIAL'),
    ('PCI Concursos','https://www.pciconcursos.com.br','portal',2,'AGREGADOR'),
    ('JC Concursos','https://jcconcursos.com.br','portal',2,'AGREGADOR')
  ) as v(name,base_url,type,tier,source_type)
  where substring(v.base_url from '^https://([^/]+)') = p_hostname;
$$;
revoke all on function public.ops_known_source_adapter(text) from public, anon, authenticated;
grant execute on function public.ops_known_source_adapter(text) to service_role;

create function public.ops_approve_source(
  p_actor uuid, p_target uuid, p_note text, p_official_url text,
  p_activate_known_adapter boolean default false
)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_note text := nullif(trim(p_note), '');
  v_hostname text;
  v_candidate public.source_candidates%rowtype;
  v_source public.collector_sources%rowtype;
  v_known record;
  v_supported boolean;
  v_previous_enabled boolean;
  v_result text;
  v_details jsonb;
begin
  if not exists (select 1 from public.ops_admin_members where user_id=p_actor and role='ADMIN') then
    raise exception 'OPS_FORBIDDEN';
  end if;
  if v_note is null or length(v_note) not between 5 and 2000 then raise exception 'OPS_REVIEW_NOTE_REQUIRED'; end if;
  if p_official_url is null or length(p_official_url)>2048
     or p_official_url !~ '^https://[a-z0-9]([a-z0-9.-]*[a-z0-9])?(/[^[:space:]#]*)?$' then
    raise exception 'OPS_INVALID_OFFICIAL_URL';
  end if;
  v_hostname := substring(p_official_url from '^https://([^/]+)');
  if position('.' in v_hostname)=0 or v_hostname ~ '^[0-9.]+$'
     or v_hostname ~ '(^|\.)(internal|local|localhost)$' then raise exception 'OPS_INVALID_OFFICIAL_URL'; end if;
  select * into v_candidate from public.source_candidates where id=p_target for update;
  if not found or v_candidate.status='REJECTED'
     or (v_candidate.status='APPROVED' and v_candidate.official_url is distinct from p_official_url) then
    raise exception 'OPS_TARGET_NOT_ACTIONABLE';
  end if;
  select * into v_known from public.ops_known_source_adapter(v_hostname);
  v_supported := found;
  if coalesce(p_activate_known_adapter,false) and not v_supported then raise exception 'OPS_ADAPTER_NOT_SUPPORTED'; end if;

  -- Preserve the initial review on subsequent explicit activation/registration.
  if v_candidate.status='CANDIDATE' or v_candidate.reviewed_at is null or nullif(v_candidate.reviewed_by,'') is null then
    update public.source_candidates set status='APPROVED', official_url=p_official_url,
      reviewed_at=now(), reviewed_by=p_actor::text, review_notes=v_note where id=p_target;
  end if;
  if v_supported and exists(select 1 from public.collector_sources where name=v_known.name and hostname<>v_hostname) then
    raise exception 'OPS_SOURCE_IDENTITY_MISMATCH';
  end if;
  insert into public.collector_sources(name,base_url,type,tier,source_type,adapter,enabled,
    health_status,disabled_reason,disabled_at,disabled_by,approved_candidate_id)
  values(case when v_supported then v_known.name else 'Approved: '||v_hostname end,
    case when v_supported then v_known.base_url else 'https://'||v_hostname end,
    case when v_supported then v_known.type else 'portal' end,
    case when v_supported then v_known.tier else 3 end,
    case when v_supported then v_known.source_type else 'DISCOVERY_AUXILIAR' end,
    case when v_supported then v_known.adapter else null end,
    false,'DISABLED',case when v_supported then 'APPROVED_PENDING_ACTIVATION' else 'APPROVED_PENDING_ADAPTER' end,
    now(),p_actor::text,p_target)
  on conflict(hostname) do nothing;
  select * into v_source from public.collector_sources where hostname=v_hostname for update;
  v_previous_enabled := v_source.enabled;
  if coalesce(p_activate_known_adapter,false) and (
    v_source.name is distinct from v_known.name or v_source.adapter is distinct from v_known.adapter
    or substring(v_source.base_url from '^https://[^/]+') is distinct from v_known.base_url
    or v_source.tier is distinct from v_known.tier or v_source.source_type is distinct from v_known.source_type
  ) then raise exception 'OPS_SOURCE_IDENTITY_MISMATCH'; end if;
  update public.collector_sources set approved_candidate_id=p_target,
    enabled=case when coalesce(p_activate_known_adapter,false) then true else enabled end,
    disabled_reason=case when coalesce(p_activate_known_adapter,false) then null else disabled_reason end,
    disabled_at=case when coalesce(p_activate_known_adapter,false) then null else disabled_at end,
    disabled_by=case when coalesce(p_activate_known_adapter,false) then null else disabled_by end
  where id=v_source.id returning * into v_source;
  update public.source_candidates set operational_source_id=v_source.id where id=p_target;
  v_result := case when v_previous_enabled then 'ALREADY_ACTIVE'
    when v_source.enabled then 'ACTIVATED_KNOWN' else 'REGISTERED_DISABLED' end;
  v_details := jsonb_build_object('official_url',p_official_url,'source_id',v_source.id,
    'source_name',v_source.name,'enabled',v_source.enabled,'adapter',v_source.adapter,
    'previous_enabled',v_previous_enabled,'result',v_result);
  insert into public.ops_action_log(actor_user_id,action,target_id,note,details)
  values(p_actor,'APPROVE_SOURCE',p_target,v_note,v_details);
  return jsonb_build_object('ok',true,'action','APPROVE_SOURCE','target_id',p_target,'source',v_details);
end;
$$;
revoke all on function public.ops_approve_source(uuid,uuid,text,text,boolean) from public, anon, authenticated;
grant execute on function public.ops_approve_source(uuid,uuid,text,text,boolean) to service_role;

-- Keep the original RPC contract; legacy approval also uses the complete flow.
create or replace function public.ops_apply_action(
  p_actor uuid, p_action text, p_target uuid, p_note text default null, p_official_url text default null
)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_count int;
  v_note text := nullif(trim(p_note),'');
begin
  if not exists(select 1 from public.ops_admin_members where user_id=p_actor and role='ADMIN') then raise exception 'OPS_FORBIDDEN'; end if;
  if p_action='APPROVE_SOURCE' then return public.ops_approve_source(p_actor,p_target,p_note,p_official_url,false); end if;
  if p_action='RETRY_DOCUMENT' then
    update public.collector_documents set status='AI_PENDING',ai_retry_count=0,ai_next_attempt_at=now(),
      ai_claimed_at=null,ai_claim_token=null,ai_claimed_hash=null,ai_last_error_code=null
    where id=p_target and status='FAILED' and nullif(trim(raw_text),'') is not null
      and ai_last_error_code = any(array[
        '429','AI_PENDING','BUDGET_EXCEEDED','CONCURRENCY_RETRY','INVALID_JSON','INVALID_SCHEMA',
        'MAX_RETRIES','PAID_MODEL_BLOCKED','PROVIDER_DOWN','RATE_LIMIT','TIMEOUT'
      ]) and coalesce(metadata->>'sync_error','')<>'INSUFFICIENT_IDENTITY';
  elsif p_action='REJECT_SOURCE_CANDIDATE' then
    if v_note is null or length(v_note) not between 5 and 2000 then raise exception 'OPS_REVIEW_NOTE_REQUIRED'; end if;
    update public.source_candidates set status='REJECTED',reviewed_at=now(),reviewed_by=p_actor::text,review_notes=v_note
    where id=p_target and status='CANDIDATE';
  elsif p_action='REVIEW_CONFLICT' then
    if v_note is null or length(v_note) not between 5 and 2000 then raise exception 'OPS_REVIEW_NOTE_REQUIRED'; end if;
    insert into public.ops_conflict_reviews(concurso_id,review_note,reviewed_by)
    select id,v_note,p_actor from public.concursos where id=p_target and quality_status='CONFLICTED'
    on conflict(concurso_id) do update set review_note=excluded.review_note,reviewed_by=excluded.reviewed_by,reviewed_at=now();
  else raise exception 'OPS_UNKNOWN_ACTION'; end if;
  get diagnostics v_count=row_count;
  if v_count<>1 then raise exception 'OPS_TARGET_NOT_ACTIONABLE'; end if;
  insert into public.ops_action_log(actor_user_id,action,target_id,note) values(p_actor,p_action,p_target,v_note);
  return jsonb_build_object('ok',true,'action',p_action,'target_id',p_target);
end;
$$;
revoke all on function public.ops_apply_action(uuid,text,uuid,text,text) from public, anon, authenticated;
grant execute on function public.ops_apply_action(uuid,text,uuid,text,text) to service_role;
