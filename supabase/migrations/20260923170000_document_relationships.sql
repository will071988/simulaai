create table concurso_identity_aliases (
  id uuid primary key default gen_random_uuid(),
  concurso_id uuid not null references concursos(id) on delete cascade,
  alias_type text not null check (alias_type in ('EDITAL','PROCESS','OFFICIAL_SLUG','OFFICIAL_URL','CARGO','CARGO_GROUP','EXTERNAL_ID')),
  alias_value text not null,
  source_name text not null default '',
  source_url text,
  confidence numeric not null check (confidence between 0 and 1),
  valid_from timestamptz not null default now(),
  valid_until timestamptz,
  is_current boolean not null default true,
  created_at timestamptz not null default now(),
  unique(concurso_id, alias_type, alias_value, source_name)
);
create index concurso_identity_aliases_lookup_idx on concurso_identity_aliases(alias_type, alias_value) where is_current;
alter table concurso_identity_aliases enable row level security;

create table concurso_documents (
  id uuid primary key default gen_random_uuid(),
  concurso_id uuid not null references concursos(id) on delete cascade,
  collector_document_id uuid not null references collector_documents(id) on delete cascade,
  document_type text,
  relationship_type text not null check (relationship_type in ('ORIGINAL','RETIFICATION','REPUBLICATION','REOPENING','COMMUNICATION','SAME_CONTEST_UPDATE','NEW_CONTEST','POSSIBLE_SAME_CONTEST','UNKNOWN')),
  source_url text not null,
  source_name text,
  published_at timestamptz,
  observed_at timestamptz not null default now(),
  is_current boolean not null default true,
  created_at timestamptz not null default now(),
  unique(collector_document_id)
);
create index concurso_documents_concurso_idx on concurso_documents(concurso_id, observed_at desc);
alter table concurso_documents enable row level security;

alter table concurso_changes add column if not exists relationship_type text;
