-- Keep all original evidence; extend only the generated invalidation metadata.
alter table public.concurso_field_evidence
  alter column invalidation_reason set expression as (
    case
      when field_name = 'escolaridade'
        and evidence_text ~* 'website coleta informações[\s\S]+cookies[\s\S]+funcionamento técnico'
      then 'NONFACTUAL_COOKIE_BANNER'::text
      when field_name = 'cargos'
        and value_json::text ~* '"(de )?(n[ií]vel|ensino|escolaridade|forma[cç][aã]o) +(fundamental|m[eé]dio|t[eé]cnico|superior|gradua[cç][aã]o)'
      then 'SCHOOLING_NOT_A_ROLE'::text
      else null::text
    end
  );

-- Preserve the exact previous canonical value before correcting it.
create table if not exists public.concurso_field_corrections (
  id uuid primary key default gen_random_uuid(),
  concurso_id uuid not null references public.concursos(id),
  field_name text not null,
  old_value jsonb not null,
  new_value jsonb not null,
  reason text not null,
  migration_version text not null,
  corrected_at timestamptz not null default now(),
  unique(concurso_id, field_name, migration_version)
);
alter table public.concurso_field_corrections enable row level security;
revoke all on public.concurso_field_corrections from public, anon, authenticated;
grant select, insert on public.concurso_field_corrections to service_role;

insert into public.concurso_field_corrections(concurso_id, field_name, old_value, new_value, reason, migration_version)
select c.id, 'cargos', c.cargos, '[]'::jsonb, 'SCHOOLING_NOT_A_ROLE', '20261004162956'
from public.concursos c
where c.cargos = '["Nível Superior"]'::jsonb
  and exists (select 1 from public.concurso_field_evidence e
    where e.concurso_id = c.id and e.field_name = 'cargos'
      and e.value_json = c.cargos and e.invalidation_reason = 'SCHOOLING_NOT_A_ROLE')
on conflict(concurso_id, field_name, migration_version) do nothing;

update public.concursos c
set cargos = correction.new_value, updated_at = now()
from public.concurso_field_corrections correction
where correction.concurso_id = c.id and correction.field_name = 'cargos'
  and correction.migration_version = '20261004162956'
  and c.cargos = correction.old_value;

analyze public.concurso_field_evidence;
