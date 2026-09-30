alter table concursos add column if not exists is_publishable boolean not null default false;
alter table concursos add column if not exists publication_reasons jsonb not null default '[]'::jsonb;
alter table concursos add column if not exists publication_evaluated_at timestamptz;
create index if not exists concursos_public_list_idx on concursos(created_at) where is_publishable and merged_into_id is null;
create index if not exists concursos_public_hot_idx on concursos(hot_score desc) where is_publishable and merged_into_id is null;

alter table collector_runs add column if not exists sources_success int not null default 0;
alter table collector_runs add column if not exists sources_failed int not null default 0;
alter table collector_runs add column if not exists documents_unchanged int not null default 0;
alter table collector_runs add column if not exists parsed_success int not null default 0;
alter table collector_runs add column if not exists parse_failed int not null default 0;
alter table collector_runs add column if not exists ai_requests int not null default 0;
alter table collector_runs add column if not exists ai_success int not null default 0;
alter table collector_runs add column if not exists ai_invalid_schema int not null default 0;
alter table collector_runs add column if not exists concursos_created int not null default 0;
alter table collector_runs add column if not exists concursos_updated int not null default 0;
alter table collector_runs add column if not exists concursos_conflicted int not null default 0;
alter table collector_runs add column if not exists concursos_publishable int not null default 0;
alter table collector_runs add column if not exists duplicate_candidates int not null default 0;
alter table collector_runs add column if not exists stage_results jsonb not null default '[]'::jsonb;

alter table collector_documents add column if not exists first_seen_run_id uuid references collector_runs(id) on delete set null;
alter table collector_documents add column if not exists last_seen_run_id uuid references collector_runs(id) on delete set null;
alter table collector_documents add column if not exists last_seen_at timestamptz;
alter table collector_documents add column if not exists ai_next_attempt_at timestamptz;
alter table collector_documents add column if not exists ai_last_attempt_at timestamptz;
alter table collector_documents add column if not exists ai_last_error_code text;
alter table collector_documents add column if not exists ai_claimed_at timestamptz;
alter table collector_documents add column if not exists ai_claim_token uuid;
alter table collector_documents add column if not exists ai_claimed_hash text;
create index if not exists collector_documents_pending_idx on collector_documents(ai_next_attempt_at, collected_at) where status = 'AI_PENDING';
create unique index if not exists collector_document_versions_hash_uidx on collector_document_versions(document_id, content_hash);
create index if not exists concurso_changes_idempotency_idx on concurso_changes(concurso_id, field_name, source_url);
create index if not exists concurso_field_evidence_document_idx on concurso_field_evidence(document_id);

alter table collector_document_versions enable row level security;
alter table ai_provider_state enable row level security;
alter table collector_lock enable row level security;

create or replace function claim_ai_pending_documents(p_limit int default 5)
returns setof collector_documents
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  return query
  update collector_documents d
  set ai_claimed_at = now(), ai_last_attempt_at = now(), ai_claim_token = gen_random_uuid(), ai_claimed_hash = d.content_hash
  where d.id in (
    select id from collector_documents
    where status = 'AI_PENDING'
      and (ai_next_attempt_at is null or ai_next_attempt_at <= now())
      and (ai_claimed_at is null or ai_claimed_at < now() - interval '20 minutes')
    order by coalesce(ai_next_attempt_at, collected_at), collected_at
    for update skip locked
    limit greatest(1, least(p_limit, 5))
  )
  returning d.*;
end;
$$;
revoke all on function claim_ai_pending_documents(int) from public;
revoke all on function claim_ai_pending_documents(int) from anon;
revoke all on function claim_ai_pending_documents(int) from authenticated;
grant execute on function claim_ai_pending_documents(int) to service_role;

alter function acquire_collector_lock(uuid, int) set search_path = public, pg_temp;
alter function release_collector_lock(uuid) set search_path = public, pg_temp;
revoke all on function acquire_collector_lock(uuid, int) from public;
revoke all on function release_collector_lock(uuid) from public;
revoke all on function acquire_collector_lock(uuid, int) from anon;
revoke all on function release_collector_lock(uuid) from anon;
revoke all on function acquire_collector_lock(uuid, int) from authenticated;
revoke all on function release_collector_lock(uuid) from authenticated;
grant execute on function acquire_collector_lock(uuid, int) to service_role;
grant execute on function release_collector_lock(uuid) to service_role;

update concursos c
set is_publishable = true,
    publication_reasons = '["PUBLISHABLE_BACKFILL"]'::jsonb,
    publication_evaluated_at = now()
where c.merged_into_id is null
  and c.quality_status in ('VERIFIED', 'PARTIAL')
  and nullif(trim(c.orgao), '') is not null
  and nullif(trim(c.titulo), '') is not null
  and nullif(trim(c.edital_url), '') is not null
  and (c.edital_number is not null or c.process_number is not null or c.official_slug is not null)
  and exists (select 1 from concurso_field_evidence e where e.concurso_id = c.id and e.source_tier = 1)
  and not exists (
    select 1 from concurso_duplicate_candidates d
    where d.status = 'POSSIBLE_DUPLICATE' and (d.concurso_a_id = c.id or d.concurso_b_id = c.id)
  );

alter policy "public read concursos" on concursos using (is_publishable and merged_into_id is null and quality_status in ('VERIFIED', 'PARTIAL'));
