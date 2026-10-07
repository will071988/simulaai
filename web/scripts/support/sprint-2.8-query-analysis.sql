begin read only;
set local statement_timeout = '15s';
set local lock_timeout = '2s';

select json_build_object(
  'concursos', (select count(*) from concursos),
  'simulados', (select count(*) from simulados),
  'evidence', (select count(*) from concurso_field_evidence),
  'aliases', (select count(*) from concurso_identity_aliases),
  'documents', (select count(*) from concurso_documents),
  'changes', (select count(*) from concurso_changes),
  'sourceCandidates', (select count(*) from source_candidates),
  'failedDocuments', (select count(*) from collector_documents where status = 'FAILED'),
  'conflictedContests', (select count(*) from concursos where quality_status = 'CONFLICTED'),
  'possibleDuplicates', (select count(*) from concurso_duplicate_candidates where status = 'POSSIBLE_DUPLICATE')
) as sprint_2_8_cardinality;

explain (analyze, buffers, settings, summary, format json)
select c.id, c.titulo, s.slug
from concursos c
left join lateral (
  select slug from simulados
  where concurso_id = c.id and slug is not null
  order by created_at
  limit 1
) s on true
where c.id = (
  select id from concursos where is_publishable order by updated_at desc limit 1
);

explain (analyze, buffers, settings, summary, format json)
select field_name, value_json, source_url, source_name, source_tier, evidence_text, confidence, observed_at
from concurso_field_evidence
where concurso_id = (select id from concursos where is_publishable order by updated_at desc limit 1)
  and invalidation_reason is null
order by observed_at desc
limit 100;

explain (analyze, buffers, settings, summary, format json)
select alias_type, alias_value, source_name, source_url, confidence, valid_from, valid_until, is_current
from concurso_identity_aliases
where concurso_id = (select id from concursos where is_publishable order by updated_at desc limit 1)
order by created_at desc
limit 100;

explain (analyze, buffers, settings, summary, format json)
select document_type, relationship_type, source_url, source_name, published_at, observed_at, is_current
from concurso_documents
where concurso_id = (select id from concursos where is_publishable order by updated_at desc limit 1)
order by observed_at desc
limit 100;

explain (analyze, buffers, settings, summary, format json)
select id, title, source_url, status, ai_retry_count, ai_last_error_code, collected_at
from collector_documents
where status = 'FAILED'
order by collected_at desc
limit 50;

explain (analyze, buffers, settings, summary, format json)
select id, url, domain, status, created_at
from source_candidates
where status = 'CANDIDATE'
order by created_at desc, id desc
limit 50;

explain (analyze, buffers, settings, summary, format json)
select get_user_progress((
  select user_id from simulado_attempts
  where status = 'COMPLETED' and user_id is not null
  group by user_id order by count(*) desc limit 1
));

rollback;
