-- Sprint 2.4: indexes for server-side national search and pagination.
create index if not exists concursos_public_recent_idx on concursos(created_at desc) where is_publishable and merged_into_id is null;
create index if not exists concursos_public_closing_idx on concursos(inscricao_fim) where is_publishable and merged_into_id is null;
create index if not exists concursos_public_salary_idx on concursos(salario desc nulls last) where is_publishable and merged_into_id is null;
create index if not exists concursos_public_vacancies_idx on concursos(vagas desc nulls last) where is_publishable and merged_into_id is null;
create index if not exists concursos_public_hot_idx on concursos(hot_score desc nulls last) where is_publishable and merged_into_id is null;
create index if not exists concursos_public_state_scope_idx on concursos(state_code, scope) where is_publishable and merged_into_id is null;
create index if not exists concursos_public_orgao_idx on concursos(lower(orgao) text_pattern_ops) where is_publishable and merged_into_id is null;
create index if not exists concursos_public_banca_idx on concursos(lower(banca) text_pattern_ops) where is_publishable and merged_into_id is null;
create index if not exists concursos_public_city_idx on concursos(lower(city) text_pattern_ops) where is_publishable and merged_into_id is null;
