-- Sprint 1.9: reusable, quality-gated explanations disclosed only after completion.
create table if not exists explanation_cache (
  id uuid primary key default gen_random_uuid(),
  cache_key text not null unique,
  correct_answer text not null,
  explanation text not null,
  wrong_alternatives jsonb not null,
  conceptual_reference text not null,
  explanation_quality numeric(4,3) not null,
  confidence numeric(4,3) not null,
  quality_status text not null default 'DRAFT',
  source text not null,
  model text,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint explanation_cache_key_check check (cache_key ~ '^[a-f0-9]{32,64}$'),
  constraint explanation_cache_wrong_object check (jsonb_typeof(wrong_alternatives) = 'object'),
  constraint explanation_cache_quality_check check (explanation_quality between 0 and 1),
  constraint explanation_cache_confidence_check check (confidence between 0 and 1),
  constraint explanation_cache_status_check check (quality_status in ('DRAFT','VALIDATED','REJECTED')),
  constraint explanation_cache_source_check check (source in ('AUTHORIAL','AI_ASSISTED')),
  constraint explanation_cache_token_check check (input_tokens between 0 and 12000 and output_tokens between 0 and 800),
  constraint explanation_cache_validated_gate check (
    quality_status <> 'VALIDATED' or (confidence >= 0.800 and explanation_quality >= 0.800)
  )
);

create table if not exists question_explanations (
  questao_id uuid primary key references questoes(id) on delete cascade,
  explanation_id uuid not null references explanation_cache(id),
  linked_at timestamptz not null default now()
);

alter table explanation_cache enable row level security;
alter table question_explanations enable row level security;
revoke all on explanation_cache, question_explanations from anon, authenticated;
create index if not exists question_explanations_cache_idx on question_explanations(explanation_id);

-- Reuse the already validated authorial explanations from the professional question bank.
insert into explanation_cache(cache_key, correct_answer, explanation, wrong_alternatives,
  conceptual_reference, explanation_quality, confidence, quality_status, source)
select
  md5('question:' || q.question_fingerprint || ':explanation:v1'),
  q.resposta_correta,
  q.explicacao,
  case q.enunciado
    when 'Se todo candidato aprovado estudou com constância, qual alternativa representa corretamente a contrapositiva dessa afirmação?' then
      '{"B":"A alternativa B apresenta a conversa da proposição original, que não é logicamente equivalente à implicação dada.","C":"A alternativa C faz uma afirmação genérica sobre não aprovados e não preserva a relação condicional original."}'::jsonb
    when 'Um material de estudo custa 80 reais e recebe acréscimo de 25%. Qual passa a ser o preço final desse material?' then
      '{"A":"Noventa reais representam acréscimo de apenas doze vírgula cinco por cento sobre oitenta reais.","C":"Cento e cinco reais representam acréscimo de trinta e um vírgula vinte e cinco por cento, superior ao informado.","D":"Cento e vinte reais representam acréscimo de cinquenta por cento, o dobro do percentual solicitado."}'::jsonb
    when 'Em relação ao Regime Geral de Previdência Social, qual situação caracteriza corretamente a filiação de um segurado obrigatório?' then
      '{"B":"O segurado obrigatório não depende de requerimento prévio; a filiação nasce com o exercício da atividade abrangida.","C":"A filiação antecede eventual benefício e não surge somente quando ele é concedido.","D":"Para o empregado abrangido pelo regime, a filiação é obrigatória, e não facultativa."}'::jsonb
    when 'Ao interpretar um texto argumentativo, qual procedimento permite identificar uma inferência sem confundi-la com informação expressa?' then
      '{"B":"Copiar uma frase recupera informação expressa e, por si só, não realiza uma inferência.","C":"Ignorar conectivos elimina pistas essenciais sobre as relações lógicas construídas pelo autor.","D":"O tamanho da afirmação não é critério de validade para uma inferência textual."}'::jsonb
    when 'Em uma turma, vinte pessoas estudam Direito e quinze estudam Matemática; cinco estudam ambas. Quantas estudam ao menos uma dessas matérias?' then
      '{"B":"Trinta e cinco soma os dois grupos sem descontar as cinco pessoas contadas em ambos.","C":"Vinte e cinco desconta a interseção duas vezes, retirando pessoas que pertencem à união.","D":"Quarenta acrescenta a interseção em vez de descontar a duplicidade da contagem."}'::jsonb
    when 'Qual prática aumenta de forma mais direta a proteção de uma conta institucional contra o uso de uma senha que tenha vazado?' then
      '{"B":"Reutilizar a senha amplia o impacto do vazamento para outros serviços em vez de proteger a conta.","C":"Desativar alertas reduz a capacidade de detectar acessos suspeitos e não cria fator adicional de autenticação.","D":"Compartilhar credenciais elimina a responsabilização individual e aumenta a superfície de risco."}'::jsonb
    when 'Considerando a aplicabilidade dos direitos fundamentais, qual afirmação traduz adequadamente a orientação constitucional brasileira?' then
      '{"B":"A Constituição prevê aplicação imediata, embora certos direitos possam exigir concretização legislativa; não há dependência absoluta de lei.","C":"Direitos fundamentais vinculam o poder público e também podem produzir efeitos nas relações entre particulares.","D":"Direitos fundamentais não são absolutos e podem entrar em ponderação com outros direitos constitucionalmente protegidos."}'::jsonb
    when 'Quando a Administração identifica ilegalidade em um de seus próprios atos, qual providência corresponde ao exercício da autotutela?' then
      '{"B":"Revogação decorre de conveniência e oportunidade; ilegalidade exige anulação.","C":"Manter conscientemente um ato ilegal contraria o dever de autotutela e de legalidade.","D":"A autotutela permite revisão pela própria Administração, sem transferência obrigatória ao Legislativo."}'::jsonb
    when 'Dois eventos independentes têm probabilidades de cinquenta por cento e quarenta por cento. Qual é a probabilidade de ambos ocorrerem?' then
      '{"B":"Quarenta e cinco por cento é a média dos percentuais, operação que não calcula a interseção de eventos independentes.","C":"Noventa por cento resulta da soma simples e ainda pode contar cenários incompatíveis com a ocorrência conjunta.","D":"Dez por cento não corresponde ao produto de zero vírgula cinco por zero vírgula quatro."}'::jsonb
    when 'Em um período argumentativo, qual conectivo introduz de maneira inequívoca uma ideia de oposição ao argumento apresentado antes?' then
      '{"B":"Portanto introduz conclusão ou consequência, e não oposição.","C":"Além disso acrescenta informação na mesma direção argumentativa, sem contraste.","D":"Por exemplo introduz exemplificação, e não uma relação adversativa."}'::jsonb
    else '{}'::jsonb
  end,
  q.disciplina || ' — ' || q.assunto || coalesce(' — ' || nullif(q.subassunto, ''), ''),
  case when q.validated_by in ('sprint-1.7-seed','sprint-1.8-seed') then 0.900 else 0.500 end,
  case when q.validated_by in ('sprint-1.7-seed','sprint-1.8-seed') then 0.950 else 0.500 end,
  case when q.validated_by in ('sprint-1.7-seed','sprint-1.8-seed') then 'VALIDATED' else 'DRAFT' end,
  'AUTHORIAL'
from questoes q
where q.quality_status = 'PUBLISHED'
on conflict (cache_key) do nothing;

insert into question_explanations(questao_id, explanation_id)
select q.id, e.id
from questoes q
join explanation_cache e on e.cache_key = md5('question:' || q.question_fingerprint || ':explanation:v1')
where q.quality_status = 'PUBLISHED'
on conflict (questao_id) do update set explanation_id = excluded.explanation_id, linked_at = now();

create or replace function build_attempt_corrections(p_attempt_id uuid, p_answers jsonb)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'questionId', q.id,
      'userAnswer', p_answers->>q.id::text,
      'correctAnswer', q.resposta_correta,
      'isCorrect', upper(trim(coalesce(p_answers->>q.id::text, ''))) = upper(trim(q.resposta_correta)),
      'explanation', case when e.quality_status = 'VALIDATED' and e.confidence >= 0.800 and e.explanation_quality >= 0.800
        then jsonb_build_object(
          'text', e.explanation,
          'wrongAlternatives', e.wrong_alternatives,
          'conceptualReference', e.conceptual_reference,
          'explanationQuality', e.explanation_quality,
          'confidence', e.confidence,
          'source', e.source
        ) else null end
    ) order by sq.position
  ), '[]'::jsonb)
  from simulado_attempts sa
  join simulado_questions sq on sq.simulado_id = sa.simulado_id
  join questoes q on q.id = sq.questao_id
  left join question_explanations qe on qe.questao_id = q.id
  left join explanation_cache e on e.id = qe.explanation_id
  where sa.id = p_attempt_id;
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
  v_corrections jsonb;
begin
  if jsonb_typeof(p_answers) <> 'object' or (select count(*) from jsonb_object_keys(p_answers)) > 100 then
    raise exception 'INVALID_ATTEMPT_ANSWERS';
  end if;
  select * into v_attempt from simulado_attempts where id = p_attempt_id for update;
  if not found or v_attempt.session_token_hash <> p_token_hash then raise exception 'ATTEMPT_NOT_FOUND'; end if;
  if v_attempt.status = 'COMPLETED' then
    v_corrections := build_attempt_corrections(v_attempt.id, v_attempt.answers);
    return jsonb_build_object('attemptId', v_attempt.id, 'status', v_attempt.status, 'score', v_attempt.score,
      'correctCount', v_attempt.correct_count, 'total', (select count(*) from simulado_questions where simulado_id = v_attempt.simulado_id),
      'durationSeconds', v_attempt.duration_seconds, 'corrections', v_corrections);
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
  v_corrections := build_attempt_corrections(v_attempt.id, v_answers);

  return jsonb_build_object('attemptId', v_attempt.id, 'status', 'COMPLETED', 'score', v_score,
    'correctCount', v_correct, 'total', v_total, 'durationSeconds', v_attempt.duration_seconds, 'corrections', v_corrections);
end;
$$;

revoke all on function build_attempt_corrections(uuid, jsonb) from public, anon, authenticated;
revoke all on function complete_simulado_attempt(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function complete_simulado_attempt(uuid, text, jsonb) to service_role;
