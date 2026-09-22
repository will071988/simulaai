-- source health fields
alter table collector_sources add column if not exists last_status text;
alter table collector_sources add column if not exists last_documents_count int default 0;
alter table collector_sources add column if not exists last_document_found_at timestamptz;
alter table collector_sources add column if not exists last_error_code text;
alter table collector_sources add column if not exists consecutive_empty_runs int default 0;

-- document versioning
create table if not exists collector_document_versions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid references collector_documents(id) on delete cascade,
  content_hash text not null,
  raw_text text,
  metadata jsonb,
  collected_at timestamptz default now()
);
create index if not exists idx_doc_versions_doc on collector_document_versions(document_id);

-- retry count
alter table collector_documents add column if not exists ai_retry_count int default 0;

-- provider state for circuit breaker persistence
create table if not exists ai_provider_state (
  provider text primary key,
  failure_count int default 0,
  blocked_until timestamptz,
  last_success_at timestamptz,
  last_error text
);
