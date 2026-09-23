alter table concursos add column if not exists inscricao_inicio date;
alter table concursos add column if not exists inscricao_fim date;
alter table concursos add column if not exists cadastro_reserva int;
alter table concursos add column if not exists cargos jsonb not null default '[]'::jsonb;
alter table concursos add column if not exists escolaridade text[] not null default '{}';
alter table concursos add column if not exists logical_key text;
alter table concursos add column if not exists quality_status text not null default 'PARTIAL' check (quality_status in ('VERIFIED','PARTIAL','CONFLICTED','UNVERIFIED'));
alter table concursos add column if not exists hot_reasons jsonb not null default '[]'::jsonb;
alter table concursos add column if not exists updated_at timestamptz not null default now();
create unique index if not exists concursos_logical_key_unique on concursos(logical_key) where logical_key is not null;

create table concurso_field_evidence (
  id uuid primary key default gen_random_uuid(), concurso_id uuid not null references concursos(id) on delete cascade,
  field_name text not null, value_json jsonb not null, value_hash text not null,
  source_url text not null, source_name text, source_tier int not null check (source_tier between 1 and 3),
  document_id uuid references collector_documents(id) on delete set null,
  evidence_text text not null, confidence numeric not null check (confidence between 0 and 1),
  observed_at timestamptz not null default now(), created_at timestamptz not null default now(),
  unique(concurso_id, field_name, source_url, value_hash)
);
create index concurso_field_evidence_concurso_idx on concurso_field_evidence(concurso_id, field_name);

create table concurso_changes (
  id uuid primary key default gen_random_uuid(), concurso_id uuid not null references concursos(id) on delete cascade,
  field_name text not null, old_value jsonb, new_value jsonb not null, source_url text not null,
  detected_at timestamptz not null default now()
);

create table geo_cache (
  key text primary key, scope text, state_code text, city text,
  latitude numeric, longitude numeric, source text not null, confidence numeric not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

alter table concurso_field_evidence enable row level security;
alter table concurso_changes enable row level security;
alter table geo_cache enable row level security;
