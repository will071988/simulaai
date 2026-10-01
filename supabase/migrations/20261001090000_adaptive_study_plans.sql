-- Sprint 2.2: user-owned deterministic adaptive study plans.
create table study_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  concurso_id uuid not null references concursos(id) on delete cascade,
  cargo text not null check (char_length(trim(cargo)) between 2 and 160),
  exam_date date not null,
  daily_minutes integer not null check (daily_minutes between 15 and 720),
  disciplines text[] not null check (cardinality(disciplines) between 1 and 20),
  discipline_weights jsonb not null default '{}'::jsonb,
  performance_fingerprint text not null,
  allocation jsonb not null default '[]'::jsonb,
  schedule jsonb not null default '[]'::jsonb,
  days_remaining integer not null,
  generated_for date not null default current_date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, concurso_id, cargo)
);

alter table study_plans enable row level security;
revoke all on table study_plans from public, anon;
grant all on table study_plans to service_role;
grant select, insert, update, delete on table study_plans to authenticated;
create policy "users read own study plans" on study_plans for select to authenticated using (auth.uid() = user_id);
create policy "users create own study plans" on study_plans for insert to authenticated with check (auth.uid() = user_id);
create policy "users update own study plans" on study_plans for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "users delete own study plans" on study_plans for delete to authenticated using (auth.uid() = user_id);
create index study_plans_user_updated on study_plans(user_id, updated_at desc);
