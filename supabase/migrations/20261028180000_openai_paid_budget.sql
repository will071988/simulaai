create table if not exists public.openai_paid_budget (
  budget_day date primary key,
  reserved_calls integer not null default 0,
  reserved_spend_usd numeric(12,6) not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.openai_paid_job_attempts (
  budget_day date not null,
  job_key text not null,
  attempts integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (budget_day, job_key)
);

alter table public.ai_usage_logs add column if not exists paid_fallback boolean not null default false;
alter table public.ai_usage_logs add column if not exists key_index integer;
alter table public.ai_usage_logs add column if not exists input_tokens integer;
alter table public.ai_usage_logs add column if not exists output_tokens integer;
alter table public.ai_usage_logs add column if not exists estimated_cost_usd numeric(12,6);
alter table public.ai_usage_logs add column if not exists fallback_reason text;

alter table public.openai_paid_budget enable row level security;
alter table public.openai_paid_job_attempts enable row level security;

create or replace function public.reserve_openai_paid_budget(
  p_job_key text,
  p_estimated_cost_usd numeric,
  p_max_calls integer,
  p_max_spend_usd numeric,
  p_max_attempts_per_job integer
) returns boolean language plpgsql security definer set search_path = public as $$
declare
  today date := (now() at time zone 'utc')::date;
  current_calls integer;
  current_spend numeric;
  current_attempts integer;
begin
  if p_job_key is null or p_job_key = '' or p_estimated_cost_usd is null or p_estimated_cost_usd < 0
     or p_max_calls <= 0 or p_max_spend_usd <= 0 or p_max_attempts_per_job <= 0 then return false; end if;
  insert into openai_paid_budget(budget_day) values (today) on conflict (budget_day) do nothing;
  select reserved_calls, reserved_spend_usd into current_calls, current_spend from openai_paid_budget where budget_day = today for update;
  insert into openai_paid_job_attempts(budget_day, job_key) values (today, p_job_key) on conflict do nothing;
  select attempts into current_attempts from openai_paid_job_attempts where budget_day = today and job_key = p_job_key for update;
  if current_calls >= p_max_calls or current_spend + p_estimated_cost_usd > p_max_spend_usd or current_attempts >= p_max_attempts_per_job then return false; end if;
  update openai_paid_budget set reserved_calls = reserved_calls + 1, reserved_spend_usd = reserved_spend_usd + p_estimated_cost_usd, updated_at = now() where budget_day = today;
  update openai_paid_job_attempts set attempts = attempts + 1, updated_at = now() where budget_day = today and job_key = p_job_key;
  return true;
end;
$$;
revoke all on function public.reserve_openai_paid_budget(text,numeric,integer,numeric,integer) from public, anon, authenticated;
grant execute on function public.reserve_openai_paid_budget(text,numeric,integer,numeric,integer) to service_role;
