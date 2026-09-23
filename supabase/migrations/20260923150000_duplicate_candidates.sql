create table concurso_duplicate_candidates (
  id uuid primary key default gen_random_uuid(), concurso_a_id uuid not null references concursos(id) on delete cascade,
  concurso_b_id uuid not null references concursos(id) on delete cascade,
  score int not null, reason text, status text not null default 'POSSIBLE_DUPLICATE', created_at timestamptz not null default now(),
  unique(concurso_a_id, concurso_b_id)
);
alter table concurso_duplicate_candidates enable row level security;
