-- Keep evidence bound to the registered source and tier. Cebraspe publishes
-- official contest PDFs on a distinct, explicitly allowlisted HTTPS CDN.
-- No data, claims, retries, permissions or publication thresholds are changed.
do $migration$
declare
  definition text;
  needle constant text := 'and lower(split_part(split_part(v_source.canonical_url, ''://'', 2), ''/'', 1)) = lower(split_part(split_part(s.base_url, ''://'', 2), ''/'', 1))';
  replacement constant text := $guard$and (
        lower(split_part(split_part(v_source.canonical_url, '://', 2), '/', 1)) = lower(split_part(split_part(s.base_url, '://', 2), '/', 1))
        or (
          -- CEBRASPE_OFFICIAL_CDN_V1: exact source/CDN pair, never a suffix match.
          s.tier = 1
          and lower(split_part(split_part(s.base_url, '://', 2), '/', 1)) in ('www.cebraspe.org.br', 'cebraspe.org.br')
          and s.base_url ~ '^https://(www\.)?cebraspe\.org\.br(/|$)'
          and v_source.canonical_url like 'https://cdn.cebraspe.org.br/concursos/%'
        )
      )$guard$;
begin
  select pg_get_functiondef('public.persist_contest_document(jsonb)'::regprocedure) into definition;
  if position('CEBRASPE_OFFICIAL_CDN_V1' in definition) > 0 then return; end if;
  if position(needle in definition) = 0 then
    raise exception 'UNEXPECTED_EVIDENCE_ORIGIN_GUARD: review remote function before migration';
  end if;
  execute replace(definition, needle, replacement);
end
$migration$;
