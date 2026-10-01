-- Sprint 1.7: professional, provenance-aware question bank with fail-closed publication.
alter table questoes add column if not exists concurso_id uuid references concursos(id) on delete set null;
alter table questoes add column if not exists disciplina text;
alter table questoes add column if not exists assunto text;
alter table questoes add column if not exists subassunto text;
alter table questoes add column if not exists resposta_correta text;
alter table questoes add column if not exists explicacao text;
alter table questoes add column if not exists dificuldade text;
alter table questoes add column if not exists origem text;
alter table questoes add column if not exists source_url text;
alter table questoes add column if not exists source_type text;
alter table questoes add column if not exists quality_status text;
alter table questoes add column if not exists validation_errors jsonb not null default '[]'::jsonb;
alter table questoes add column if not exists validated_at timestamptz;
alter table questoes add column if not exists validated_by text;
alter table questoes add column if not exists question_fingerprint text;
alter table questoes add column if not exists updated_at timestamptz not null default now();

update questoes set
  disciplina = coalesce(nullif(trim(disciplina), ''), nullif(trim(tema), ''), 'GERAL'),
  assunto = coalesce(nullif(trim(assunto), ''), nullif(trim(tema), ''), 'GERAL'),
  resposta_correta = coalesce(nullif(trim(resposta_correta), ''), nullif(trim(gabarito), '')),
  explicacao = coalesce(nullif(trim(explicacao), ''), 'Explicação pendente de validação editorial.'),
  dificuldade = coalesce(dificuldade, 'MEDIO'),
  origem = coalesce(origem, 'QUESTAO_AUTORAL'),
  source_url = coalesce(source_url, fonte_url),
  source_type = coalesce(source_type, case when fonte_url is null then 'OWN_CONTENT' else 'PUBLIC_PERMITTED' end),
  quality_status = coalesce(quality_status, 'DRAFT');

alter table questoes alter column disciplina set not null;
alter table questoes alter column assunto set not null;
alter table questoes alter column resposta_correta set not null;
alter table questoes alter column explicacao set not null;
alter table questoes alter column dificuldade set not null;
alter table questoes alter column dificuldade set default 'MEDIO';
alter table questoes alter column origem set not null;
alter table questoes alter column origem set default 'QUESTAO_AUTORAL';
alter table questoes alter column source_type set not null;
alter table questoes alter column source_type set default 'OWN_CONTENT';
alter table questoes alter column quality_status set not null;
alter table questoes alter column quality_status set default 'DRAFT';

alter table questoes add constraint questoes_dificuldade_check check (dificuldade in ('FACIL','MEDIO','DIFICIL'));
alter table questoes add constraint questoes_origem_check check (origem in ('QUESTAO_OFICIAL','QUESTAO_AUTORAL','QUESTAO_IA'));
alter table questoes add constraint questoes_source_type_check check (source_type in ('PUBLIC_OFFICIAL','PUBLIC_PERMITTED','OWN_CONTENT','AI_GENERATED'));
alter table questoes add constraint questoes_quality_status_check check (quality_status in ('DRAFT','VALIDATED','REJECTED','PUBLISHED'));
alter table questoes add constraint questoes_validation_errors_array check (jsonb_typeof(validation_errors) = 'array');

create or replace function enforce_question_quality_gate()
returns trigger language plpgsql set search_path = public, pg_temp as $$
declare
  v_alt_count int;
  v_distinct_keys int;
  v_distinct_texts int;
  v_answer_count int;
  v_marked_correct int;
  v_marked_key text;
begin
  new.disciplina := trim(new.disciplina);
  new.assunto := trim(new.assunto);
  new.enunciado := trim(new.enunciado);
  new.resposta_correta := trim(new.resposta_correta);
  new.explicacao := trim(new.explicacao);
  new.gabarito := coalesce(nullif(trim(new.gabarito), ''), new.resposta_correta);
  new.tema := coalesce(nullif(trim(new.tema), ''), new.disciplina);
  new.fonte_url := coalesce(new.fonte_url, new.source_url);
  new.updated_at := clock_timestamp();
  new.question_fingerprint := md5(lower(regexp_replace(new.disciplina || '|' || new.assunto || '|' || new.enunciado, '\s+', ' ', 'g')));

  if length(new.enunciado) < 20 then raise exception 'QUESTION_STATEMENT_INVALID'; end if;
  if length(new.explicacao) < 20 then raise exception 'QUESTION_EXPLANATION_INVALID'; end if;
  if jsonb_typeof(new.alternativas) <> 'array' then raise exception 'QUESTION_ALTERNATIVES_INVALID'; end if;
  select count(*), count(distinct lower(trim(coalesce(a->>'key', a->>'letra')))),
    count(distinct lower(trim(coalesce(a->>'text', a->>'texto')))),
    count(*) filter(where lower(trim(coalesce(a->>'key', a->>'letra'))) = lower(new.resposta_correta)),
    count(*) filter(where coalesce((a->>'isCorrect')::boolean, false)),
    max(coalesce(a->>'key', a->>'letra')) filter(where coalesce((a->>'isCorrect')::boolean, false))
  into v_alt_count, v_distinct_keys, v_distinct_texts, v_answer_count, v_marked_correct, v_marked_key
  from jsonb_array_elements(new.alternativas) a;
  if v_alt_count < 2 or v_alt_count > 5 then raise exception 'QUESTION_ALTERNATIVE_COUNT_INVALID'; end if;
  if v_distinct_keys <> v_alt_count or v_distinct_texts <> v_alt_count then raise exception 'QUESTION_DUPLICATE_ALTERNATIVE'; end if;
  if v_answer_count <> 1 then raise exception 'QUESTION_CORRECT_ANSWER_MISSING'; end if;
  if v_marked_correct > 1 then raise exception 'QUESTION_MULTIPLE_CORRECT_ANSWERS'; end if;
  if v_marked_correct = 1 and lower(v_marked_key) <> lower(new.resposta_correta) then raise exception 'QUESTION_CORRECT_ANSWER_MISMATCH'; end if;

  if new.origem = 'QUESTAO_IA' and new.banca is not null then raise exception 'AI_QUESTION_CANNOT_CLAIM_OFFICIAL_BANK'; end if;
  if new.origem = 'QUESTAO_IA' and new.source_type <> 'AI_GENERATED' then raise exception 'AI_SOURCE_TYPE_REQUIRED'; end if;
  if new.origem = 'QUESTAO_OFICIAL' and (new.source_type <> 'PUBLIC_OFFICIAL' or new.source_url !~ '^https://') then
    raise exception 'OFFICIAL_PUBLIC_SOURCE_REQUIRED';
  end if;
  if new.source_url ~* 'https://([^/]+\.)?(qconcursos\.com|tecconcursos\.com\.br|estrategiaconcursos\.com\.br)(/|$)' then
    raise exception 'PRIVATE_PROTECTED_SOURCE_REJECTED';
  end if;

  if tg_op = 'INSERT' and new.quality_status <> 'DRAFT' then raise exception 'QUESTION_MUST_START_AS_DRAFT'; end if;
  if tg_op = 'UPDATE' and old.quality_status <> new.quality_status then
    if not (
      (old.quality_status = 'DRAFT' and new.quality_status in ('VALIDATED','REJECTED')) or
      (old.quality_status = 'VALIDATED' and new.quality_status in ('PUBLISHED','REJECTED')) or
      (old.quality_status = 'REJECTED' and new.quality_status = 'DRAFT') or
      (old.quality_status = 'PUBLISHED' and new.quality_status = 'REJECTED')
    ) then raise exception 'INVALID_QUESTION_QUALITY_TRANSITION'; end if;
  end if;
  if new.quality_status in ('VALIDATED','PUBLISHED') and (
    new.validated_at is null or nullif(trim(new.validated_by), '') is null or new.validation_errors <> '[]'::jsonb
  ) then raise exception 'QUESTION_VALIDATION_REQUIRED'; end if;
  return new;
end;
$$;

drop trigger if exists questoes_quality_gate on questoes;
create trigger questoes_quality_gate before insert or update on questoes
for each row execute function enforce_question_quality_gate();

update questoes set question_fingerprint = md5(lower(regexp_replace(disciplina || '|' || assunto || '|' || enunciado, '\s+', ' ', 'g')))
where question_fingerprint is null;
create unique index if not exists questoes_fingerprint_unique on questoes(question_fingerprint);
create index if not exists questoes_published_lookup on questoes(disciplina, assunto, dificuldade) where quality_status = 'PUBLISHED';
create index if not exists questoes_concurso_idx on questoes(concurso_id) where concurso_id is not null;

drop policy if exists "public read questoes" on questoes;
create policy "public read published questoes" on questoes for select using (quality_status = 'PUBLISHED');
grant select on questoes to anon, authenticated;
revoke insert, update, delete on questoes from anon, authenticated;

revoke all on function enforce_question_quality_gate() from public, anon, authenticated;

-- Small original seed proves the complete draft -> validated -> published flow.
insert into questoes(disciplina, assunto, subassunto, enunciado, alternativas, resposta_correta,
  explicacao, dificuldade, origem, banca, ano, cargo, source_type, quality_status)
values
  ('Raciocínio Lógico', 'Proposições', 'Contraposição',
   'Se todo candidato aprovado estudou com constância, qual alternativa representa corretamente a contrapositiva dessa afirmação?',
   '[{"key":"A","text":"Se não estudou com constância, então não foi aprovado","isCorrect":true},{"key":"B","text":"Se estudou com constância, então foi aprovado"},{"key":"C","text":"Todo candidato que não foi aprovado deixou de estudar"}]'::jsonb,
   'A', 'A alternativa A é a contrapositiva válida: negar a consequência implica negar a condição original.',
   'MEDIO', 'QUESTAO_AUTORAL', null, 2026, 'Geral', 'OWN_CONTENT', 'DRAFT'),
  ('Matemática', 'Porcentagem', 'Acréscimo percentual',
   'Um material de estudo custa 80 reais e recebe acréscimo de 25%. Qual passa a ser o preço final desse material?',
   '[{"key":"A","text":"90 reais"},{"key":"B","text":"100 reais","isCorrect":true},{"key":"C","text":"105 reais"},{"key":"D","text":"120 reais"}]'::jsonb,
   'B', 'A alternativa B é correta: vinte e cinco por cento de 80 são 20 reais, totalizando 100 reais.',
   'FACIL', 'QUESTAO_AUTORAL', null, 2026, 'Geral', 'OWN_CONTENT', 'DRAFT')
on conflict do nothing;

update questoes set quality_status = 'VALIDATED', validated_at = now(), validated_by = 'sprint-1.7-seed', validation_errors = '[]'::jsonb
where origem = 'QUESTAO_AUTORAL' and source_type = 'OWN_CONTENT' and ano = 2026 and quality_status = 'DRAFT'
  and disciplina in ('Raciocínio Lógico','Matemática');
update questoes set quality_status = 'PUBLISHED'
where validated_by = 'sprint-1.7-seed' and quality_status = 'VALIDATED';
