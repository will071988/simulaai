-- Evaluated Sprint 1.6 discovery sources remain inactive until a reviewed adapter/source candidate exists.
insert into collector_sources (
  name, base_url, type, tier, enabled, robots_allowed, adapter, source_type,
  health_status, disabled_reason, disabled_at, disabled_by
) values
  ('QConcursos', 'https://www.qconcursos.com', 'portal', 2, false, true, null, 'AGREGADOR',
   'DISABLED', 'EVALUATED_NO_REVIEWED_ADAPTER', now(), 'sprint-1.6'),
  ('Folha Dirigida', 'https://folha.qconcursos.com', 'portal', 2, false, true, null, 'AGREGADOR',
   'DISABLED', 'EVALUATED_NO_REVIEWED_ADAPTER', now(), 'sprint-1.6')
on conflict (name) do update set
  source_type = excluded.source_type,
  disabled_reason = case when not collector_sources.enabled then excluded.disabled_reason else collector_sources.disabled_reason end,
  disabled_at = case when not collector_sources.enabled then coalesce(collector_sources.disabled_at, excluded.disabled_at) else collector_sources.disabled_at end,
  disabled_by = case when not collector_sources.enabled then coalesce(collector_sources.disabled_by, excluded.disabled_by) else collector_sources.disabled_by end;
