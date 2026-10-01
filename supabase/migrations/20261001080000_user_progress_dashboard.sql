-- Sprint 2.1: authenticated attempt ownership and data-derived progress.
alter table simulado_attempts
  add constraint simulado_attempts_user_fk foreign key (user_id) references auth.users(id) on delete set null;
create index if not exists simulado_attempts_user_completed on simulado_attempts(user_id, completed_at desc) where status = 'COMPLETED';

create or replace function create_simulado_attempt(
  p_config jsonb,
  p_question_ids uuid[],
  p_session_id uuid,
  p_token_hash text,
  p_user_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_result jsonb;
  v_attempt_id uuid;
begin
  if p_user_id is not null and not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'AUTH_USER_NOT_FOUND';
  end if;
  v_result := create_simulado_attempt(p_config, p_question_ids, p_session_id, p_token_hash);
  v_attempt_id := (v_result->>'attemptId')::uuid;
  update simulado_attempts set user_id = p_user_id where id = v_attempt_id;
  return v_result;
end;
$$;

create or replace function get_user_progress(p_user_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with completed as (
    select sa.*, s.titulo
    from simulado_attempts sa
    join simulados s on s.id = sa.simulado_id
    where sa.user_id = p_user_id and sa.status = 'COMPLETED'
  ), history as (
    select c.*,
      (select count(*) from simulado_questions sq where sq.simulado_id = c.simulado_id) as question_count,
      (select count(*) from jsonb_object_keys(c.answers)) as answered_count
    from completed c
  ), recent_twenty as (
    select * from history order by completed_at desc limit 20
  ), discipline_stats as (
    select q.disciplina,
      count(*) filter (where c.answers ? q.id::text)::integer as answered_count,
      count(*) filter (where upper(trim(c.answers->>q.id::text)) = upper(trim(q.resposta_correta)))::integer as correct_count
    from completed c
    join simulado_questions sq on sq.simulado_id = c.simulado_id
    join questoes q on q.id = sq.questao_id
    group by q.disciplina
    having count(*) filter (where c.answers ? q.id::text) > 0
  ), disciplines as (
    select disciplina, answered_count, correct_count,
      (answered_count - correct_count)::integer as error_count,
      round((correct_count::numeric * 100) / answered_count, 2) as accuracy
    from discipline_stats
  )
  select jsonb_build_object(
    'summary', jsonb_build_object(
      'attempts', (select count(*) from history),
      'averageScore', coalesce((select round(avg(score), 2) from history), 0),
      'averageTimeSeconds', coalesce((select round(avg(duration_seconds))::integer from history), 0),
      'questionsAnswered', coalesce((select sum(answered_count) from history), 0),
      'correctAnswers', coalesce((select sum(correct_count) from history), 0),
      'errors', coalesce((select sum(answered_count - correct_count) from history), 0),
      'accuracy', coalesce((select round((sum(correct_count)::numeric * 100) / nullif(sum(answered_count), 0), 2) from history), 0)
    ),
    'recentAttempts', coalesce((select jsonb_agg(jsonb_build_object(
      'attemptId', id, 'title', titulo, 'completedAt', completed_at, 'score', score,
      'durationSeconds', duration_seconds, 'questionCount', question_count,
      'answeredCount', answered_count, 'correctCount', correct_count,
      'errorCount', answered_count - correct_count
    ) order by completed_at desc) from recent_twenty), '[]'::jsonb),
    'evolution', coalesce((select jsonb_agg(jsonb_build_object(
      'attemptId', id, 'completedAt', completed_at, 'score', score
    ) order by completed_at asc) from recent_twenty), '[]'::jsonb),
    'disciplines', coalesce((select jsonb_agg(jsonb_build_object(
      'discipline', disciplina, 'answeredCount', answered_count, 'correctCount', correct_count,
      'errorCount', error_count, 'accuracy', accuracy
    ) order by accuracy desc, disciplina) from disciplines), '[]'::jsonb),
    'strongDisciplines', coalesce((select jsonb_agg(row_data) from (
      select jsonb_build_object('discipline', disciplina, 'accuracy', accuracy, 'answeredCount', answered_count) row_data
      from disciplines order by accuracy desc, answered_count desc, disciplina limit 3
    ) strong), '[]'::jsonb),
    'weakDisciplines', coalesce((select jsonb_agg(row_data) from (
      select jsonb_build_object('discipline', disciplina, 'accuracy', accuracy, 'answeredCount', answered_count) row_data
      from disciplines order by accuracy asc, answered_count desc, disciplina limit 3
    ) weak), '[]'::jsonb)
  );
$$;

revoke all on function create_simulado_attempt(jsonb, uuid[], uuid, text, uuid) from public, anon, authenticated;
revoke all on function get_user_progress(uuid) from public, anon, authenticated;
grant execute on function create_simulado_attempt(jsonb, uuid[], uuid, text, uuid) to service_role;
grant execute on function get_user_progress(uuid) to service_role;
