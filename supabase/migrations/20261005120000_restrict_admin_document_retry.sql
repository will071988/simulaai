-- Sprint 2.6: retries are allowed only for transient/format failures.
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
           ai_claimed_hash = null,
           ai_last_error_code = null
     where id = p_target
       and status = 'FAILED'
       and nullif(trim(raw_text), '') is not null
       and ai_last_error_code = any(array[
         '429', 'AI_PENDING', 'BUDGET_EXCEEDED', 'CONCURRENCY_RETRY', 'INVALID_JSON',
         'INVALID_SCHEMA', 'MAX_RETRIES', 'PAID_MODEL_BLOCKED', 'PROVIDER_DOWN', 'RATE_LIMIT', 'TIMEOUT'
       ])
       and coalesce(metadata->>'sync_error', '') <> 'INSUFFICIENT_IDENTITY';
  elsif p_action = 'APPROVE_SOURCE' then
    if v_note is null or length(v_note) < 5 or length(v_note) > 2000 then
      raise exception 'OPS_REVIEW_NOTE_REQUIRED';
    end if;
    if p_official_url is null or p_official_url !~ '^https://[^/?#@[:space:]]+(/[^[:space:]]*)?$' then
      raise exception 'OPS_INVALID_OFFICIAL_URL';
    end if;
    update public.source_candidates
       set status = 'APPROVED', official_url = p_official_url, reviewed_at = now(),
           reviewed_by = p_actor::text, review_notes = v_note
     where id = p_target and status = 'CANDIDATE';
  elsif p_action = 'REJECT_SOURCE_CANDIDATE' then
    if v_note is null or length(v_note) < 5 then
      raise exception 'OPS_REVIEW_NOTE_REQUIRED';
    end if;
    update public.source_candidates
       set status = 'REJECTED', reviewed_at = now(), reviewed_by = p_actor::text, review_notes = v_note
     where id = p_target and status = 'CANDIDATE';
  elsif p_action = 'REVIEW_CONFLICT' then
    if v_note is null or length(v_note) < 5 or length(v_note) > 2000 then
      raise exception 'OPS_REVIEW_NOTE_REQUIRED';
    end if;
    insert into public.ops_conflict_reviews(concurso_id, review_note, reviewed_by)
    select id, v_note, p_actor from public.concursos
     where id = p_target and quality_status = 'CONFLICTED'
    on conflict (concurso_id) do update
      set review_note = excluded.review_note, reviewed_by = excluded.reviewed_by, reviewed_at = now();
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
    case when p_action = 'APPROVE_SOURCE' then jsonb_build_object('official_url', p_official_url) else '{}'::jsonb end);

  return jsonb_build_object('ok', true, 'action', p_action, 'target_id', p_target);
end;
$$;
revoke all on function public.ops_apply_action(uuid, text, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.ops_apply_action(uuid, text, uuid, text, text)
  to service_role;

update public.collector_documents
   set status = 'FAILED',
       ai_next_attempt_at = null,
       ai_claimed_at = null,
       ai_claim_token = null,
       ai_claimed_hash = null,
       ai_last_error_code = 'INSUFFICIENT_IDENTITY',
       metadata = metadata || jsonb_build_object('ai_error', 'INSUFFICIENT_IDENTITY')
 where status = 'AI_PENDING'
   and ai_last_error_code = 'SYNC_FAILED'
   and metadata->>'sync_error' = 'INSUFFICIENT_IDENTITY';
