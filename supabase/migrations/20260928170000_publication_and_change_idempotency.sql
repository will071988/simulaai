alter policy "public read concursos" on concursos
using (merged_into_id is null and quality_status in ('VERIFIED', 'PARTIAL'));
alter table concurso_changes add column if not exists change_key text;
create unique index if not exists concurso_changes_change_key_unique
  on concurso_changes(change_key)
  where change_key is not null;
