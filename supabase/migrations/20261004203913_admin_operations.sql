-- Sprint 2.6: private operations RBAC and auditable, allowlisted actions.
-- No administrator is provisioned by this migration: access is denied until
-- an existing Auth user is explicitly granted the ADMIN role.
create table public.ops_admin_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'ADMIN' check (role = 'ADMIN'),
  granted_at timestamptz not null default now(),
  granted_by uuid references auth.users(id) on delete set null
);
alter table public.ops_admin_members enable row level security;
revoke all on public.ops_admin_members from anon, authenticated;
grant select on public.ops_admin_members to service_role;

create table public.ops_action_log (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null check (action in (
    'RETRY_DOCUMENT', 'APPROVE_SOURCE', 'REJECT_SOURCE_CANDIDATE', 'REVIEW_CONFLICT'
  )),
  target_id uuid not null,
  note text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index ops_action_log_created_at_idx on public.ops_action_log(created_at desc);
alter table public.ops_action_log enable row level security;
revoke all on public.ops_action_log from anon, authenticated;
grant select, insert on public.ops_action_log to service_role;

create table public.ops_conflict_reviews (
  concurso_id uuid primary key references public.concursos(id),
  review_note text not null check (length(trim(review_note)) between 5 and 2000),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz not null default now()
);
alter table public.ops_conflict_reviews enable row level security;
revoke all on public.ops_conflict_reviews from anon, authenticated;
grant select, insert, update on public.ops_conflict_reviews to service_role;

create or replace function public.ops_apply_action(
  p_actor uuid,
  p_action text,
  p_target uuid,
  p_note text default null,
  p_official_url text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count int;
  v_note text := nullif(trim(p_note), '');
begin
  if not exists (
    select 1 from public.ops_admin_members
    where user_id = p_actor and role = 'ADMIN'
  ) then
    raise exception 'OPS_FORBIDDEN';
  end if;

  if p_action = 'RETRY_DOCUMENT' then
    update public.collector_documents
       set status = 'AI_PENDING',
           ai_retry_count = 0,
           ai_next_attempt_at = now(),
           ai_claimed_at = null,
           ai_claim_token = null,
           ai_last_error_code = null
     where id = p_target and status = 'FAILED'
       and nullif(trim(raw_text), '') is not null;
  elsif p_action = 'APPROVE_SOURCE' then
    if v_note is null or length(v_note) < 5 or length(v_note) > 2000 then
      raise exception 'OPS_REVIEW_NOTE_REQUIRED';
    end if;
    if p_official_url is null or p_official_url !~ '^https://[^/?#@[:space:]]+(/[^[:space:]]*)?$' then
      raise exception 'OPS_INVALID_OFFICIAL_URL';
    end if;
    update public.source_candidates
       set status = 'APPROVED',
           official_url = p_official_url,
           reviewed_at = now(),
           reviewed_by = p_actor::text,
           review_notes = v_note
     where id = p_target and status = 'CANDIDATE';
  elsif p_action = 'REJECT_SOURCE_CANDIDATE' then
    if v_note is null or length(v_note) < 5 then
      raise exception 'OPS_REVIEW_NOTE_REQUIRED';
    end if;
    update public.source_candidates
       set status = 'REJECTED',
           reviewed_at = now(),
           reviewed_by = p_actor::text,
           review_notes = v_note
     where id = p_target and status = 'CANDIDATE';
  elsif p_action = 'REVIEW_CONFLICT' then
    if v_note is null or length(v_note) < 5 or length(v_note) > 2000 then
      raise exception 'OPS_REVIEW_NOTE_REQUIRED';
    end if;
    insert into public.ops_conflict_reviews(concurso_id, review_note, reviewed_by)
    select id, v_note, p_actor from public.concursos
     where id = p_target and quality_status = 'CONFLICTED'
    on conflict (concurso_id) do update
      set review_note = excluded.review_note,
          reviewed_by = excluded.reviewed_by,
          reviewed_at = now();
    get diagnostics v_count = row_count;
    if v_count <> 1 then raise exception 'OPS_TARGET_NOT_ACTIONABLE'; end if;
  else
    raise exception 'OPS_UNKNOWN_ACTION';
  end if;

  if p_action <> 'REVIEW_CONFLICT' then
    get diagnostics v_count = row_count;
    if v_count <> 1 then raise exception 'OPS_TARGET_NOT_ACTIONABLE'; end if;
  end if;

  insert into public.ops_action_log(actor_user_id, action, target_id, note, details)
  values (p_actor, p_action, p_target, v_note,
    case when p_action = 'APPROVE_SOURCE'
      then jsonb_build_object('official_url', p_official_url)
      else '{}'::jsonb end);

  return jsonb_build_object('ok', true, 'action', p_action, 'target_id', p_target);
end;
$$;
revoke all on function public.ops_apply_action(uuid, text, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.ops_apply_action(uuid, text, uuid, text, text)
  to service_role;
