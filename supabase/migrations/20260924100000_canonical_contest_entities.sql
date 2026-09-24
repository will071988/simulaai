alter table concursos add column if not exists merged_into_id uuid references concursos(id);
alter table concursos add column if not exists merged_at timestamptz;
alter table concursos add column if not exists merge_reason text;
alter table concurso_duplicate_candidates add column if not exists resolved_at timestamptz;
create index if not exists concursos_merged_into_idx on concursos(merged_into_id) where merged_into_id is not null;
