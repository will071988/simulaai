-- Make the Sprint 1.6 change-audit guarantee apply to historical rows as well.
with matched as (
  select distinct on (c.id) c.id, e.source_name, e.source_tier, e.evidence_text, e.observed_at
  from concurso_changes c
  join concurso_field_evidence e on e.concurso_id = c.concurso_id and e.field_name = c.field_name
    and e.source_url = c.source_url and e.value_json = c.new_value
  where c.source_tier is null or c.evidence_text is null or c.observed_at is null
  order by c.id, e.observed_at desc
)
update concurso_changes c
set source_name = coalesce(c.source_name, e.source_name, 'OFFICIAL_SOURCE'),
    source_tier = coalesce(c.source_tier, e.source_tier),
    evidence_text = coalesce(c.evidence_text, e.evidence_text),
    observed_at = coalesce(c.observed_at, e.observed_at)
from matched e
where c.id = e.id;

-- Older audit rows may predate field evidence. Preserve them without granting
-- factual authority: Tier 3 is explicitly discovery/audit-only.
alter table concurso_changes disable trigger concurso_changes_evidence;
update concurso_changes
set source_name = coalesce(source_name, 'LEGACY_UNVERIFIED'),
    source_tier = coalesce(source_tier, 3),
    evidence_text = coalesce(evidence_text, 'Historical change without recoverable exact evidence; excluded from factual authority'),
    observed_at = coalesce(observed_at, detected_at)
where source_tier is null or nullif(trim(evidence_text), '') is null or observed_at is null;
alter table concurso_changes enable trigger concurso_changes_evidence;

alter table concurso_changes alter column source_name set not null;
alter table concurso_changes alter column source_tier set not null;
alter table concurso_changes alter column evidence_text set not null;
alter table concurso_changes alter column observed_at set not null;
