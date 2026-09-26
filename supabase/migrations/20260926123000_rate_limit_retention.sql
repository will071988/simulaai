create table if not exists api_rate_limit_windows (
  key_hash text not null,
  route text not null,
  window_start timestamptz not null,
  request_count int not null default 0,
  primary key (key_hash, route, window_start)
);
alter table api_rate_limit_windows enable row level security;
create index if not exists api_rate_limit_windows_window_idx on api_rate_limit_windows(window_start);

create or replace function consume_api_rate_limit(p_key_hash text, p_route text, p_window_start timestamptz, p_limit int)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare current_count int;
begin
  delete from api_rate_limit_windows where window_start < now() - interval '2 hours';
  insert into api_rate_limit_windows(key_hash, route, window_start, request_count)
  values (p_key_hash, p_route, p_window_start, 1)
  on conflict (key_hash, route, window_start)
  do update set request_count = api_rate_limit_windows.request_count + 1
  returning request_count into current_count;
  return current_count;
end;
$$;
revoke all on function consume_api_rate_limit(text, text, timestamptz, int) from public;
grant execute on function consume_api_rate_limit(text, text, timestamptz, int) to service_role;
