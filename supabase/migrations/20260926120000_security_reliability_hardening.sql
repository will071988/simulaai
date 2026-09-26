create table if not exists api_rate_limits (
  key_hash text not null,
  route text not null,
  window_start timestamptz not null,
  request_count int not null default 0,
  primary key (key_hash, route, window_start)
);
alter table api_rate_limits enable row level security;

create or replace function consume_api_rate_limit(p_key_hash text, p_route text, p_window_start timestamptz, p_limit int)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare current_count int;
begin
  insert into api_rate_limits(key_hash, route, window_start, request_count)
  values (p_key_hash, p_route, p_window_start, 1)
  on conflict (key_hash, route, window_start)
  do update set request_count = api_rate_limits.request_count + 1
  returning request_count into current_count;
  return current_count;
end;
$$;
revoke all on function consume_api_rate_limit(text, text, timestamptz, int) from public;
grant execute on function consume_api_rate_limit(text, text, timestamptz, int) to service_role;

create table if not exists ai_daily_budget (
  budget_day date primary key,
  reserved_count int not null default 0,
  updated_at timestamptz not null default now()
);
alter table ai_daily_budget enable row level security;

create or replace function reserve_ai_daily_budget(p_limit int)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare reserved int;
begin
  if p_limit <= 0 then return true; end if;
  insert into ai_daily_budget(budget_day, reserved_count)
  values ((now() at time zone 'utc')::date, 1)
  on conflict (budget_day)
  do update set reserved_count = ai_daily_budget.reserved_count + 1, updated_at = now()
  where ai_daily_budget.reserved_count < p_limit
  returning reserved_count into reserved;
  return reserved is not null and reserved <= p_limit;
end;
$$;
revoke all on function reserve_ai_daily_budget(int) from public;
grant execute on function reserve_ai_daily_budget(int) to service_role;
