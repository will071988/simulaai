-- Collector core tables
create table collector_sources (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  base_url text not null,
  type text not null,
  tier int not null check (tier in (1,2,3)),
  enabled boolean default true,
  robots_allowed boolean default true,
  last_success_at timestamptz,
  last_failure_at timestamptz,
  failure_count int default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table collector_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz default now(),
  finished_at timestamptz,
  status text default 'RUNNING' check (status in ('RUNNING','SUCCESS','FAILED','DEGRADED_NO_AI')),
  sources_checked int default 0,
  documents_found int default 0,
  documents_new int default 0,
  documents_updated int default 0,
  ai_processed int default 0,
  ai_pending int default 0,
  errors_count int default 0
);

create table collector_documents (
  id uuid primary key default gen_random_uuid(),
  source_id uuid references collector_sources(id),
  source_url text not null,
  canonical_url text not null unique,
  document_type text,
  title text,
  content_hash text not null,
  raw_text text,
  published_at timestamptz,
  collected_at timestamptz default now(),
  processed_at timestamptz,
  status text default 'DISCOVERED' check (status in ('DISCOVERED','FETCHED','PARSED','AI_PENDING','PROCESSED','FAILED')),
  metadata jsonb default '{}'::jsonb
);
create index idx_collector_documents_source on collector_documents(source_id);
create index idx_collector_documents_hash on collector_documents(content_hash);
create index idx_collector_documents_status on collector_documents(status);

create table ai_cache (
  id uuid primary key default gen_random_uuid(),
  input_hash text not null,
  prompt_version text not null,
  provider text,
  model text,
  result jsonb,
  created_at timestamptz default now(),
  unique(input_hash, prompt_version)
);

create table ai_usage_logs (
  id uuid primary key default gen_random_uuid(),
  provider text,
  model text,
  task_type text,
  success boolean,
  latency_ms int,
  input_size int,
  output_size int,
  error_code text,
  created_at timestamptz default now()
);
create index idx_ai_usage_logs_provider on ai_usage_logs(provider);
create index idx_ai_usage_logs_created on ai_usage_logs(created_at);

create table source_candidates (
  id uuid primary key default gen_random_uuid(),
  url text not null unique,
  domain text,
  reason text,
  found_by text,
  confidence numeric,
  status text default 'CANDIDATE' check (status in ('CANDIDATE','APPROVED','REJECTED')),
  created_at timestamptz default now()
);

-- RLS service_role only (no anon policies)
alter table collector_sources enable row level security;
alter table collector_runs enable row level security;
alter table collector_documents enable row level security;
alter table ai_cache enable row level security;
alter table ai_usage_logs enable row level security;
alter table source_candidates enable row level security;

-- seed sources TIER1/2
insert into collector_sources (name, base_url, type, tier) values
('Cebraspe','https://www.cebraspe.org.br','banca',1),
('FGV','https://conhecimento.fgv.br','banca',1),
('FCC','https://www.concursosfcc.com.br','banca',1),
('Instituto AOCP','https://www.institutoaocp.org.br','banca',1),
('Cesgranrio','https://www.cesgranrio.org.br','banca',1),
('DOU','https://www.in.gov.br/web/dou','oficial',1),
('PCI Concursos','https://www.pciconcursos.com.br','portal',2),
('JC Concursos','https://www.jcconcursos.com.br','portal',2)
on conflict (name) do nothing;
