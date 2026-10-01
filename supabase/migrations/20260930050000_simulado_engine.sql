-- Sprint 1.8: deterministic simulado generation and server-authoritative attempts.
alter table questoes add column if not exists nivel text;
alter table questoes alter column nivel set default 'SUPERIOR';

alter table simulados add column if not exists mode text;
alter table simulados add column if not exists cargo text;
alter table simulados add column if not exists disciplina text;
alter table simulados add column if not exists assunto text;
alter table simulados add column if not exists dificuldade text;
alter table simulados add column if not exists quantidade integer;
alter table simulados add column if not exists seed text;
alter table simulados add column if not exists config jsonb not null default '{}'::jsonb;
alter table simulados add column if not exists status text;

update simulados set
  mode = coalesce(mode, 'COMPLETO'),
  quantidade = coalesce(quantidade, 0),
  seed = coalesce(seed, id::text),
  status = coalesce(status, 'READY');

alter table simulados alter column mode set not null;
alter table simulados alter column quantidade set not null;
alter table simulados alter column seed set not null;
alter table simulados alter column status set not null;
alter table simulados add constraint simulados_mode_check check (mode in ('RAPIDO','COMPLETO','POR_MATERIA','POR_ASSUNTO','PROVA_SIMULADA'));
alter table simulados add constraint simulados_quantidade_check check (quantidade between 0 and 100);
alter table simulados add constraint simulados_status_check check (status in ('READY','ARCHIVED'));

create table if not exists simulado_questions (
  simulado_id uuid not null references simulados(id) on delete cascade,
  questao_id uuid not null references questoes(id),
  position integer not null check (position > 0),
  primary key (simulado_id, questao_id),
  unique (simulado_id, position)
);

create table if not exists simulado_attempts (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null,
  user_id uuid,
  simulado_id uuid not null references simulados(id),
  session_token_hash text not null,
  started_at timestamptz not null default clock_timestamp(),
  completed_at timestamptz,
  answers jsonb not null default '{}'::jsonb,
  score numeric(5,2),
  correct_count integer,
  duration_seconds integer,
  status text not null default 'IN_PROGRESS',
  constraint simulado_attempts_token_hash_check check (session_token_hash ~ '^[a-f0-9]{64}$'),
  constraint simulado_attempts_answers_object check (jsonb_typeof(answers) = 'object'),
  constraint simulado_attempts_score_check check (score is null or score between 0 and 100),
  constraint simulado_attempts_status_check check (status in ('IN_PROGRESS','COMPLETED','ABANDONED'))
);

create index if not exists simulado_attempts_session_recent on simulado_attempts(session_id, started_at desc);
create index if not exists simulado_questions_question_idx on simulado_questions(questao_id);

alter table simulado_questions enable row level security;
alter table simulado_attempts enable row level security;
revoke all on simulado_questions, simulado_attempts from anon, authenticated;
revoke insert, update, delete on simulados from anon, authenticated;
drop policy if exists "public insert tentativas" on tentativas;
drop policy if exists "public read tentativas" on tentativas;
revoke all on tentativas from anon, authenticated;

create or replace function create_simulado_attempt(
  p_config jsonb,
  p_question_ids uuid[],
  p_session_id uuid,
  p_token_hash text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_simulado_id uuid;
  v_attempt_id uuid;
  v_count integer;
  v_available integer;
  v_mode text := coalesce(nullif(p_config->>'mode', ''), 'RAPIDO');
begin
  if p_session_id is null or p_token_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'INVALID_ATTEMPT_IDENTITY';
  end if;
  v_count := coalesce(array_length(p_question_ids, 1), 0);
  if v_count < 1 or v_count > 100 or (select count(distinct id) from unnest(p_question_ids) id) <> v_count then
    raise exception 'INVALID_SIMULADO_QUESTION_SET';
  end if;
  if v_mode not in ('RAPIDO','COMPLETO','POR_MATERIA','POR_ASSUNTO','PROVA_SIMULADA') then
    raise exception 'INVALID_SIMULADO_MODE';
  end if;
  select count(*) into v_available from questoes
  where id = any(p_question_ids) and quality_status = 'PUBLISHED';
  if v_available <> v_count then raise exception 'UNPUBLISHED_SIMULADO_QUESTION'; end if;

  insert into simulados(concurso_id, titulo, banca_alvo, nivel, cargo, disciplina, assunto,
    dificuldade, mode, quantidade, seed, config, status, premium)
  values (
    nullif(p_config->>'concursoId', '')::uuid,
    left(coalesce(nullif(trim(p_config->>'title'), ''), 'Simulado personalizado'), 180),
    nullif(trim(p_config->>'banca'), ''), nullif(trim(p_config->>'nivel'), ''),
    nullif(trim(p_config->>'cargo'), ''), nullif(trim(p_config->>'disciplina'), ''),
    nullif(trim(p_config->>'assunto'), ''), nullif(trim(p_config->>'dificuldade'), ''),
    v_mode, v_count, left(p_config->>'seed', 160), p_config, 'READY', false
  ) returning id into v_simulado_id;

  insert into simulado_questions(simulado_id, questao_id, position)
  select v_simulado_id, id, ordinality::integer from unnest(p_question_ids) with ordinality as q(id, ordinality);

  insert into simulado_attempts(session_id, user_id, simulado_id, session_token_hash)
  values (p_session_id, null, v_simulado_id, p_token_hash)
  returning id into v_attempt_id;

  return jsonb_build_object('simuladoId', v_simulado_id, 'attemptId', v_attempt_id, 'questionCount', v_count);
end;
$$;

create or replace function complete_simulado_attempt(
  p_attempt_id uuid,
  p_token_hash text,
  p_answers jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_attempt simulado_attempts%rowtype;
  v_total integer;
  v_correct integer;
  v_score numeric(5,2);
  v_answers jsonb;
begin
  if jsonb_typeof(p_answers) <> 'object' or (select count(*) from jsonb_object_keys(p_answers)) > 100 then
    raise exception 'INVALID_ATTEMPT_ANSWERS';
  end if;
  select * into v_attempt from simulado_attempts where id = p_attempt_id for update;
  if not found or v_attempt.session_token_hash <> p_token_hash then raise exception 'ATTEMPT_NOT_FOUND'; end if;
  if v_attempt.status = 'COMPLETED' then
    return jsonb_build_object('attemptId', v_attempt.id, 'status', v_attempt.status, 'score', v_attempt.score,
      'correctCount', v_attempt.correct_count, 'total', (select count(*) from simulado_questions where simulado_id = v_attempt.simulado_id),
      'durationSeconds', v_attempt.duration_seconds);
  end if;
  if v_attempt.status <> 'IN_PROGRESS' then raise exception 'ATTEMPT_NOT_ACTIVE'; end if;

  select count(*), count(*) filter (
    where upper(trim(p_answers->>q.id::text)) = upper(trim(q.resposta_correta))
  ), coalesce(jsonb_object_agg(q.id::text, p_answers->q.id::text) filter (where p_answers ? q.id::text), '{}'::jsonb)
  into v_total, v_correct, v_answers
  from simulado_questions sq join questoes q on q.id = sq.questao_id
  where sq.simulado_id = v_attempt.simulado_id;
  if v_total = 0 then raise exception 'EMPTY_SIMULADO'; end if;
  v_score := round((v_correct::numeric * 100) / v_total, 2);

  update simulado_attempts set answers = v_answers, score = v_score, correct_count = v_correct,
    completed_at = clock_timestamp(), duration_seconds = greatest(0, extract(epoch from (clock_timestamp() - started_at))::integer),
    status = 'COMPLETED'
  where id = v_attempt.id
  returning duration_seconds into v_attempt.duration_seconds;

  return jsonb_build_object('attemptId', v_attempt.id, 'status', 'COMPLETED', 'score', v_score,
    'correctCount', v_correct, 'total', v_total, 'durationSeconds', v_attempt.duration_seconds);
end;
$$;

revoke all on function create_simulado_attempt(jsonb, uuid[], uuid, text) from public, anon, authenticated;
revoke all on function complete_simulado_attempt(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function create_simulado_attempt(jsonb, uuid[], uuid, text) to service_role;
grant execute on function complete_simulado_attempt(uuid, text, jsonb) to service_role;

-- Original questions to make the end-to-end generator useful without private-bank content.
insert into questoes(concurso_id, disciplina, assunto, subassunto, enunciado, alternativas, resposta_correta,
  explicacao, dificuldade, origem, ano, cargo, nivel, source_type, quality_status)
values
  ((select id from concursos where orgao = 'INSS' order by created_at limit 1), 'Direito Previdenciário', 'Segurado obrigatório', 'Filiação',
   'Em relação ao Regime Geral de Previdência Social, qual situação caracteriza corretamente a filiação de um segurado obrigatório?',
   '[{"key":"A","text":"Decorre automaticamente do exercício de atividade remunerada abrangida pelo regime","isCorrect":true},{"key":"B","text":"Depende sempre de requerimento prévio do trabalhador"},{"key":"C","text":"Somente existe depois do primeiro benefício"},{"key":"D","text":"É facultativa para todo empregado"}]',
   'A', 'A filiação do segurado obrigatório decorre automaticamente do exercício de atividade remunerada abrangida pelo regime.', 'MEDIO', 'QUESTAO_AUTORAL', 2026, 'Analista', 'SUPERIOR', 'OWN_CONTENT', 'DRAFT'),
  ((select id from concursos where orgao = 'INSS' order by created_at limit 1), 'Língua Portuguesa', 'Interpretação de textos', 'Inferência',
   'Ao interpretar um texto argumentativo, qual procedimento permite identificar uma inferência sem confundi-la com informação expressa?',
   '[{"key":"A","text":"Relacionar pistas textuais e concluir algo logicamente compatível","isCorrect":true},{"key":"B","text":"Copiar qualquer frase do primeiro parágrafo"},{"key":"C","text":"Ignorar os conectivos usados pelo autor"},{"key":"D","text":"Escolher a afirmação mais longa"}]',
   'A', 'Uma inferência válida nasce da relação entre pistas presentes no texto e uma conclusão logicamente compatível com elas.', 'FACIL', 'QUESTAO_AUTORAL', 2026, 'Analista', 'SUPERIOR', 'OWN_CONTENT', 'DRAFT'),
  ((select id from concursos where orgao = 'INSS' order by created_at limit 1), 'Raciocínio Lógico', 'Conjuntos', 'Interseção',
   'Em uma turma, vinte pessoas estudam Direito e quinze estudam Matemática; cinco estudam ambas. Quantas estudam ao menos uma dessas matérias?',
   '[{"key":"A","text":"30 pessoas","isCorrect":true},{"key":"B","text":"35 pessoas"},{"key":"C","text":"25 pessoas"},{"key":"D","text":"40 pessoas"}]',
   'A', 'Pelo princípio da inclusão e exclusão, somam-se vinte e quinze e subtraem-se as cinco pessoas contadas duas vezes.', 'MEDIO', 'QUESTAO_AUTORAL', 2026, 'Analista', 'SUPERIOR', 'OWN_CONTENT', 'DRAFT'),
  ((select id from concursos where orgao = 'INSS' order by created_at limit 1), 'Informática', 'Segurança da informação', 'Autenticação',
   'Qual prática aumenta de forma mais direta a proteção de uma conta institucional contra o uso de uma senha que tenha vazado?',
   '[{"key":"A","text":"Ativar autenticação por múltiplos fatores","isCorrect":true},{"key":"B","text":"Reutilizar a senha em outros serviços"},{"key":"C","text":"Desativar alertas de acesso"},{"key":"D","text":"Compartilhar a credencial com a equipe"}]',
   'A', 'A autenticação por múltiplos fatores exige uma evidência adicional e reduz o impacto do vazamento isolado da senha.', 'DIFICIL', 'QUESTAO_AUTORAL', 2026, 'Analista', 'SUPERIOR', 'OWN_CONTENT', 'DRAFT'),
  ((select id from concursos where orgao = 'PF' order by created_at limit 1), 'Direito Constitucional', 'Direitos fundamentais', 'Aplicabilidade',
   'Considerando a aplicabilidade dos direitos fundamentais, qual afirmação traduz adequadamente a orientação constitucional brasileira?',
   '[{"key":"A","text":"As normas definidoras de direitos fundamentais têm aplicação imediata","isCorrect":true},{"key":"B","text":"Nenhum direito fundamental produz efeito sem lei"},{"key":"C","text":"Direitos fundamentais vinculam apenas particulares"},{"key":"D","text":"Todos os direitos fundamentais são absolutos"}]',
   'A', 'A Constituição estabelece a aplicação imediata das normas definidoras de direitos e garantias fundamentais.', 'MEDIO', 'QUESTAO_AUTORAL', 2026, 'Agente', 'SUPERIOR', 'OWN_CONTENT', 'DRAFT'),
  ((select id from concursos where orgao = 'PF' order by created_at limit 1), 'Direito Administrativo', 'Atos administrativos', 'Anulação',
   'Quando a Administração identifica ilegalidade em um de seus próprios atos, qual providência corresponde ao exercício da autotutela?',
   '[{"key":"A","text":"Anular o ato ilegal, observadas as garantias aplicáveis","isCorrect":true},{"key":"B","text":"Revogar o ato exclusivamente por ilegalidade"},{"key":"C","text":"Manter o ato em qualquer circunstância"},{"key":"D","text":"Transferir obrigatoriamente a decisão ao Legislativo"}]',
   'A', 'A autotutela permite que a Administração anule seus atos ilegais, respeitando devido processo e situações juridicamente protegidas.', 'FACIL', 'QUESTAO_AUTORAL', 2026, 'Agente', 'SUPERIOR', 'OWN_CONTENT', 'DRAFT'),
  ((select id from concursos where orgao = 'PF' order by created_at limit 1), 'Raciocínio Lógico', 'Probabilidade', 'Eventos independentes',
   'Dois eventos independentes têm probabilidades de cinquenta por cento e quarenta por cento. Qual é a probabilidade de ambos ocorrerem?',
   '[{"key":"A","text":"20%","isCorrect":true},{"key":"B","text":"45%"},{"key":"C","text":"90%"},{"key":"D","text":"10%"}]',
   'A', 'Para eventos independentes, multiplica-se a probabilidade de cada evento: zero vírgula cinco vezes zero vírgula quatro resulta em vinte por cento.', 'MEDIO', 'QUESTAO_AUTORAL', 2026, 'Agente', 'SUPERIOR', 'OWN_CONTENT', 'DRAFT'),
  ((select id from concursos where orgao = 'PF' order by created_at limit 1), 'Língua Portuguesa', 'Coesão textual', 'Conectivos',
   'Em um período argumentativo, qual conectivo introduz de maneira inequívoca uma ideia de oposição ao argumento apresentado antes?',
   '[{"key":"A","text":"Entretanto","isCorrect":true},{"key":"B","text":"Portanto"},{"key":"C","text":"Além disso"},{"key":"D","text":"Por exemplo"}]',
   'A', 'O conectivo entretanto tem valor adversativo e introduz uma ideia que se opõe ao segmento anterior.', 'DIFICIL', 'QUESTAO_AUTORAL', 2026, 'Agente', 'SUPERIOR', 'OWN_CONTENT', 'DRAFT')
on conflict do nothing;

update questoes set quality_status = 'VALIDATED', validated_at = now(), validated_by = 'sprint-1.8-seed', validation_errors = '[]'::jsonb
where origem = 'QUESTAO_AUTORAL' and source_type = 'OWN_CONTENT' and ano = 2026 and quality_status = 'DRAFT'
  and validated_by is null and cargo in ('Analista','Agente');
update questoes set quality_status = 'PUBLISHED'
where validated_by = 'sprint-1.8-seed' and quality_status = 'VALIDATED';
