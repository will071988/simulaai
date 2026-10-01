-- Sprint 1.6: mature source registry, controlled activation/disable and evidenced lifecycle status.
alter table collector_sources add column if not exists hostname text;
alter table collector_sources add column if not exists adapter text;
alter table collector_sources add column if not exists source_type text;
alter table collector_sources add column if not exists last_checked_at timestamptz;
alter table collector_sources add column if not exists health_status text;
alter table collector_sources add column if not exists disabled_reason text;
alter table collector_sources add column if not exists disabled_at timestamptz;
alter table collector_sources add column if not exists disabled_by text;

update collector_sources
set hostname = lower(regexp_replace(base_url, '^https?://([^/]+).*$', '\1')),
    adapter = coalesce(adapter, name),
    source_type = case
      when lower(type) = 'banca' then 'BANCA'
      when lower(type) = 'oficial' then 'DIARIO_OFICIAL'
      when tier = 2 then 'AGREGADOR'
      else 'DISCOVERY_AUXILIAR'
    end,
    health_status = case
      when not enabled then 'DISABLED'
      when last_status = 'FAILED' and coalesce(failure_count, 0) = 0 then 'FAILED'
      when last_status in ('FAILED', 'DEGRADED', 'EMPTY') or coalesce(failure_count, 0) >= 3 then 'DEGRADED'
      else 'HEALTHY'
    end,
    disabled_reason = case when not enabled then coalesce(disabled_reason, 'LEGACY_CONTROLLED_DISABLE') else disabled_reason end,
    disabled_at = case when not enabled then coalesce(disabled_at, updated_at, now()) else disabled_at end,
    disabled_by = case when not enabled then coalesce(disabled_by, 'migration') else disabled_by end;

alter table collector_sources alter column hostname set not null;
alter table collector_sources alter column source_type set not null;
alter table collector_sources alter column health_status set not null;
alter table collector_sources add constraint collector_sources_hostname_unique unique(hostname);
alter table collector_sources add constraint collector_sources_type_check check (source_type in ('ORGAO_OFICIAL','BANCA','DIARIO_OFICIAL','AGREGADOR','DISCOVERY_AUXILIAR'));
alter table collector_sources add constraint collector_sources_health_check check (health_status in ('HEALTHY','DEGRADED','FAILED','DISABLED'));

alter table source_candidates add column if not exists official_url text;
alter table source_candidates add column if not exists reviewed_at timestamptz;
alter table source_candidates add column if not exists reviewed_by text;
alter table source_candidates add column if not exists review_notes text;
alter table collector_sources add column if not exists approved_candidate_id uuid references source_candidates(id);

create or replace function enforce_source_governance()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  new.hostname := lower(regexp_replace(new.base_url, '^https?://([^/]+).*$', '\1'));
  if tg_op = 'INSERT' and new.enabled and not exists (
    select 1 from source_candidates c where c.id = new.approved_candidate_id
      and c.status = 'APPROVED' and c.reviewed_at is not null and nullif(c.reviewed_by, '') is not null
      and c.official_url like 'https://%'
  ) then raise exception 'SOURCE_APPROVAL_REQUIRED'; end if;
  if tg_op = 'UPDATE' and not old.enabled and new.enabled and not exists (
    select 1 from source_candidates c where c.id = new.approved_candidate_id
      and c.status = 'APPROVED' and c.reviewed_at is not null and nullif(c.reviewed_by, '') is not null
      and c.official_url like 'https://%'
  ) then raise exception 'SOURCE_APPROVAL_REQUIRED'; end if;
  if tg_op = 'UPDATE' and old.enabled and not new.enabled
     and (nullif(new.disabled_reason, '') is null or nullif(new.disabled_by, '') is null or new.disabled_at is null)
  then raise exception 'CONTROLLED_DISABLE_METADATA_REQUIRED'; end if;
  if not new.enabled then new.health_status := 'DISABLED';
  elsif new.adapter is null then new.health_status := 'FAILED';
  elsif coalesce(new.failure_count, 0) >= 3 or new.last_status in ('FAILED','DEGRADED','EMPTY') then new.health_status := 'DEGRADED';
  else new.health_status := 'HEALTHY'; end if;
  return new;
end;
$$;
drop trigger if exists collector_sources_governance on collector_sources;
create trigger collector_sources_governance before insert or update on collector_sources
for each row execute function enforce_source_governance();

alter table concursos add column if not exists lifecycle_status text;
alter table concursos add constraint concursos_lifecycle_status_check check (lifecycle_status is null or lifecycle_status in (
  'PREVISTO','AUTORIZADO','COMISSAO_FORMADA','BANCA_DEFINIDA','EDITAL_IMEINENTE','EDITAL_ABERTO',
  'INSCRICOES_ABERTAS','INSCRICOES_ENCERRADAS','PROVA_AGENDADA','EM_ANDAMENTO','RESULTADO','ENCERRADO'
));

create or replace function mirror_evidenced_lifecycle_status()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if new.status in ('PREVISTO','AUTORIZADO','COMISSAO_FORMADA','BANCA_DEFINIDA','EDITAL_IMEINENTE','EDITAL_ABERTO',
    'INSCRICOES_ABERTAS','INSCRICOES_ENCERRADAS','PROVA_AGENDADA','EM_ANDAMENTO','RESULTADO','ENCERRADO')
  then new.lifecycle_status := new.status; end if;
  return new;
end;
$$;
drop trigger if exists concursos_lifecycle_status on concursos;
create trigger concursos_lifecycle_status before insert or update of status on concursos
for each row execute function mirror_evidenced_lifecycle_status();

alter table concurso_changes add column if not exists source_name text;
alter table concurso_changes add column if not exists source_tier int;
alter table concurso_changes add column if not exists evidence_text text;
alter table concurso_changes add column if not exists observed_at timestamptz;
alter table concurso_changes add constraint concurso_changes_source_tier_check check (source_tier is null or source_tier between 1 and 3);

create or replace function require_change_evidence()
returns trigger language plpgsql set search_path = public, pg_temp as $$
declare v_evidence concurso_field_evidence%rowtype;
begin
  select * into v_evidence from concurso_field_evidence e
  where e.concurso_id = new.concurso_id and e.field_name = new.field_name
    and e.source_url = new.source_url and e.value_json = new.new_value
  order by e.observed_at desc limit 1;
  if not found then raise exception 'CHANGE_EVIDENCE_REQUIRED'; end if;
  new.source_name := coalesce(new.source_name, v_evidence.source_name);
  new.source_tier := coalesce(new.source_tier, v_evidence.source_tier);
  new.evidence_text := coalesce(new.evidence_text, v_evidence.evidence_text);
  new.observed_at := coalesce(new.observed_at, v_evidence.observed_at);
  if nullif(trim(new.evidence_text), '') is null or new.source_tier is null or new.observed_at is null
  then raise exception 'CHANGE_EVIDENCE_REQUIRED'; end if;
  return new;
end;
$$;
drop trigger if exists concurso_changes_evidence on concurso_changes;
create trigger concurso_changes_evidence before insert or update on concurso_changes
for each row execute function require_change_evidence();

revoke all on function enforce_source_governance() from public, anon, authenticated;
revoke all on function mirror_evidenced_lifecycle_status() from public, anon, authenticated;
revoke all on function require_change_evidence() from public, anon, authenticated;
