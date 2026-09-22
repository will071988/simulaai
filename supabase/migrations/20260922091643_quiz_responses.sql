create table quiz_responses (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null,
  answers jsonb not null,
  primary_profile text,
  primary_concurso_slug text,
  primary_score numeric,
  secondary_concurso_slug text,
  secondary_score numeric,
  started_at timestamptz default now(),
  completed_at timestamptz,
  converted_to_simulado boolean default false,
  created_at timestamptz default now()
);
create index idx_quiz_responses_session on quiz_responses(session_id);
alter table quiz_responses enable row level security;
drop policy if exists "anon insert quiz" on quiz_responses;
create policy "anon insert quiz" on quiz_responses for insert with check (true);
drop policy if exists "anon select own quiz" on quiz_responses;
create policy "anon select own quiz" on quiz_responses for select using (true);
drop policy if exists "anon update own quiz" on quiz_responses;
create policy "anon update own quiz" on quiz_responses for update using (true) with check (true);
