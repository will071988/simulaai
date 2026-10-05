-- Sprint 2.7: bounded operational metrics, job history and deduplicated alerts.
create table public.ops_api_metric_buckets (
  bucket_start timestamptz not null,
  route text not null check (route ~ '^/api/[a-z0-9_./\[\]-]+$' and length(route) <= 160),
  method text not null check (method in ('GET', 'HEAD', 'OPTIONS', 'POST', 'PATCH', 'DELETE', 'PUT')),
  status_class smallint not null check (status_class between 1 and 5),
  request_count bigint not null default 0 check (request_count >= 0),
  error_count bigint not null default 0 check (error_count >= 0),
  latency_sum_ms bigint not null default 0 check (latency_sum_ms >= 0),
  latency_max_ms int not null default 0 check (latency_max_ms >= 0),
  latency_le_100 bigint not null default 0 check (latency_le_100 >= 0),
  latency_le_500 bigint not null default 0 check (latency_le_500 >= latency_le_100),
  latency_le_1000 bigint not null default 0 check (latency_le_1000 >= latency_le_500),
  latency_le_3000 bigint not null default 0 check (latency_le_3000 >= latency_le_1000),
  latency_gt_3000 bigint not null default 0 check (latency_gt_3000 >= 0),
  check (error_count <= request_count),
  check (latency_le_3000 + latency_gt_3000 = request_count),
  primary key (bucket_start, route, method, status_class)
);
create index ops_api_metric_buckets_recent_idx on public.ops_api_metric_buckets(bucket_start desc);
alter table public.ops_api_metric_buckets enable row level security;
revoke all on public.ops_api_metric_buckets from public, anon, authenticated, service_role;
grant select on public.ops_api_metric_buckets to service_role;

create table public.ops_runtime_events (
  id bigint generated always as identity primary key,
  event_kind text not null check (event_kind in ('API_ERROR', 'DB_ERROR', 'REQUEST_ERROR')),
  component text not null check (length(component) between 1 and 160),
  error_code text not null check (error_code ~ '^[A-Z0-9_]{1,80}$'),
  created_at timestamptz not null default now()
);
create index ops_runtime_events_kind_created_idx on public.ops_runtime_events(event_kind, created_at desc);
create index ops_runtime_events_created_idx on public.ops_runtime_events(created_at);
alter table public.ops_runtime_events enable row level security;
revoke all on public.ops_runtime_events from public, anon, authenticated, service_role;
grant select, insert on public.ops_runtime_events to service_role;

create table public.ops_job_runs (
  id uuid primary key default gen_random_uuid(),
  job_name text not null check (job_name in ('COLLECTOR', 'AI_PENDING')),
  trigger_type text not null check (trigger_type in ('CRON', 'MANUAL')),
  status text not null default 'RUNNING' check (status in ('RUNNING', 'SUCCESS', 'DEGRADED', 'FAILED', 'SKIPPED')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  duration_ms int check (duration_ms is null or duration_ms >= 0),
  error_code text check (error_code is null or error_code ~ '^[A-Z0-9_]{1,80}$'),
  counters jsonb not null default '{}'::jsonb check (jsonb_typeof(counters) = 'object'),
  collector_run_id uuid references public.collector_runs(id) on delete set null,
  check (
    (status = 'RUNNING' and finished_at is null and duration_ms is null)
    or (status <> 'RUNNING' and finished_at is not null and finished_at >= started_at and duration_ms is not null)
  )
);
create index ops_job_runs_name_started_idx on public.ops_job_runs(job_name, started_at desc);
create unique index ops_job_runs_one_open_idx on public.ops_job_runs(job_name) where status = 'RUNNING';
create index ops_job_runs_terminal_started_idx on public.ops_job_runs(started_at) where status <> 'RUNNING';
alter table public.ops_job_runs enable row level security;
revoke all on public.ops_job_runs from public, anon, authenticated, service_role;
grant select, update on public.ops_job_runs to service_role;

create table public.ops_alert_state (
  fingerprint text primary key check (fingerprint ~ '^[A-Z0-9_]{1,100}$'),
  rule_name text not null check (rule_name ~ '^[A-Z0-9_]{1,100}$'),
  severity text not null check (severity in ('WARNING', 'HIGH', 'CRITICAL')),
  status text not null default 'OPEN' check (status in ('OPEN', 'RESOLVED')),
  opened_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  resolved_at timestamptz,
  occurrence_count bigint not null default 1 check (occurrence_count > 0),
  last_evaluated_at timestamptz not null default now(),
  check ((status = 'OPEN' and resolved_at is null) or (status = 'RESOLVED' and resolved_at is not null))
);
create index ops_alert_state_status_seen_idx on public.ops_alert_state(status, last_seen_at desc);
alter table public.ops_alert_state enable row level security;
revoke all on public.ops_alert_state from public, anon, authenticated, service_role;
grant select on public.ops_alert_state to service_role;

create table public.ops_alert_snapshot_state (
  singleton boolean primary key default true check (singleton),
  last_evaluated_at timestamptz not null default '-infinity'::timestamptz
);
insert into public.ops_alert_snapshot_state(singleton) values (true);
alter table public.ops_alert_snapshot_state enable row level security;
revoke all on public.ops_alert_snapshot_state from public, anon, authenticated, service_role;

create or replace function public.start_ops_job(p_job_name text, p_trigger_type text)
returns table(id uuid, started_at timestamptz, acquired boolean)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_now timestamptz := now();
  v_id uuid;
begin
  if p_job_name not in ('COLLECTOR', 'AI_PENDING') or p_trigger_type not in ('CRON', 'MANUAL') then raise exception 'OPS_INVALID_JOB'; end if;
  perform pg_advisory_xact_lock(773451928);
  update public.ops_job_runs job
     set status = 'FAILED', finished_at = v_now,
         duration_ms = least(2147483647, greatest(0, floor(extract(epoch from (v_now - job.started_at)) * 1000)))::int,
         error_code = 'STALE_JOB'
   where job.job_name = p_job_name and job.status = 'RUNNING' and job.started_at < v_now - interval '2 hours';
  if exists (select 1 from public.ops_job_runs job where job.job_name = p_job_name and job.status = 'RUNNING') then
    return query select null::uuid, null::timestamptz, false;
    return;
  end if;
  insert into public.ops_job_runs(job_name, trigger_type, started_at)
  values (p_job_name, p_trigger_type, v_now)
  returning ops_job_runs.id into v_id;
  return query select v_id, v_now, true;
end;
$$;
revoke all on function public.start_ops_job(text, text) from public, anon, authenticated, service_role;
grant execute on function public.start_ops_job(text, text) to service_role;

create or replace function public.record_ops_api_metric(
  p_route text,
  p_method text,
  p_status int,
  p_latency_ms int,
  p_error_code text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_now timestamptz := now();
  v_bucket timestamptz := date_bin(interval '5 minutes', v_now, timestamptz '2000-01-01 00:00:00+00');
  v_class smallint;
  v_latency int;
  v_code text := upper(coalesce(p_error_code, ''));
  v_kind text;
  v_requests bigint;
  v_errors bigint;
  v_db_errors bigint;
begin
  if p_route is null or p_method is null or p_status is null or p_status < 100 or p_status > 599
     or p_latency_ms is null or p_latency_ms < 0 then raise exception 'OPS_INVALID_METRIC'; end if;
  if p_route !~ '^/api/[a-z0-9_./\[\]-]+$' or length(p_route) > 160 then raise exception 'OPS_INVALID_ROUTE'; end if;
  if p_method not in ('GET', 'HEAD', 'OPTIONS', 'POST', 'PATCH', 'DELETE', 'PUT') then raise exception 'OPS_INVALID_METHOD'; end if;
  v_class := p_status / 100;
  v_latency := least(300000, p_latency_ms);
  insert into public.ops_api_metric_buckets(
    bucket_start, route, method, status_class, request_count, error_count,
    latency_sum_ms, latency_max_ms, latency_le_100, latency_le_500,
    latency_le_1000, latency_le_3000, latency_gt_3000
  ) values (
    v_bucket, p_route, p_method, v_class, 1, case when p_status >= 500 then 1 else 0 end,
    v_latency, v_latency, (v_latency <= 100)::int, (v_latency <= 500)::int,
    (v_latency <= 1000)::int, (v_latency <= 3000)::int, (v_latency > 3000)::int
  )
  on conflict (bucket_start, route, method, status_class) do update set
    request_count = ops_api_metric_buckets.request_count + 1,
    error_count = ops_api_metric_buckets.error_count + excluded.error_count,
    latency_sum_ms = ops_api_metric_buckets.latency_sum_ms + excluded.latency_sum_ms,
    latency_max_ms = greatest(ops_api_metric_buckets.latency_max_ms, excluded.latency_max_ms),
    latency_le_100 = ops_api_metric_buckets.latency_le_100 + excluded.latency_le_100,
    latency_le_500 = ops_api_metric_buckets.latency_le_500 + excluded.latency_le_500,
    latency_le_1000 = ops_api_metric_buckets.latency_le_1000 + excluded.latency_le_1000,
    latency_le_3000 = ops_api_metric_buckets.latency_le_3000 + excluded.latency_le_3000,
    latency_gt_3000 = ops_api_metric_buckets.latency_gt_3000 + excluded.latency_gt_3000;

  if p_status >= 500 and v_code ~ '^[A-Z0-9_]{1,80}$' then
    v_kind := case
      when v_code !~ '(EXPOSURE_GUARD|INTERNAL_ERROR|UNHANDLED|HTTP_5XX|UNAVAILABLE)'
       and v_code ~ '(QUERY|DATABASE|PERSIST|RPC|LOOKUP|SAVE|UPDATE|INSERT|DELETE|STORAGE|SUPABASE|SIMULADO|NOTIFICATIONS|ATTEMPT|PROFILE|ACCOUNT|FOLLOW|STUDY_PLAN|QUESTIONS|CONTEST|PENDING|QUIZ)'
      then 'DB_ERROR' else 'API_ERROR' end;
    insert into public.ops_runtime_events(event_kind, component, error_code) values (v_kind, p_route, v_code);
  end if;

  -- Error responses evaluate request-driven alerts immediately without slowing successful traffic.
  if p_status >= 500 then
    perform pg_advisory_xact_lock(773451927);
    select coalesce(sum(request_count), 0), coalesce(sum(error_count), 0)
      into v_requests, v_errors
      from public.ops_api_metric_buckets
     where bucket_start >= date_bin(interval '5 minutes', v_now - interval '1 hour', timestamptz '2000-01-01 00:00:00+00');
    if v_requests >= 20 and v_errors * 10 >= v_requests then
      insert into public.ops_alert_state(fingerprint, rule_name, severity, opened_at, last_seen_at, last_evaluated_at)
      values ('API_5XX_RATE', 'API_5XX_RATE', 'HIGH', v_now, v_now, v_now)
      on conflict (fingerprint) do update set
        severity = excluded.severity, status = 'OPEN',
        opened_at = case when ops_alert_state.status = 'RESOLVED' then excluded.opened_at else ops_alert_state.opened_at end,
        last_seen_at = excluded.last_seen_at, resolved_at = null, last_evaluated_at = excluded.last_evaluated_at,
        occurrence_count = ops_alert_state.occurrence_count + case when ops_alert_state.status = 'RESOLVED' then 1 else 0 end
      where ops_alert_state.last_evaluated_at < excluded.last_evaluated_at;
    end if;

    select count(*) into v_db_errors from public.ops_runtime_events
     where event_kind = 'DB_ERROR' and created_at >= v_now - interval '1 hour';
    if v_db_errors >= 3 then
      insert into public.ops_alert_state(fingerprint, rule_name, severity, opened_at, last_seen_at, last_evaluated_at)
      values ('DATABASE_ERRORS', 'DATABASE_ERRORS', 'HIGH', v_now, v_now, v_now)
      on conflict (fingerprint) do update set
        severity = excluded.severity, status = 'OPEN',
        opened_at = case when ops_alert_state.status = 'RESOLVED' then excluded.opened_at else ops_alert_state.opened_at end,
        last_seen_at = excluded.last_seen_at, resolved_at = null, last_evaluated_at = excluded.last_evaluated_at,
        occurrence_count = ops_alert_state.occurrence_count + case when ops_alert_state.status = 'RESOLVED' then 1 else 0 end
      where ops_alert_state.last_evaluated_at < excluded.last_evaluated_at;
    end if;
  end if;
end;
$$;
revoke all on function public.record_ops_api_metric(text, text, int, int, text) from public, anon, authenticated, service_role;
grant execute on function public.record_ops_api_metric(text, text, int, int, text) to service_role;

create or replace function public.sync_operational_alerts(p_alerts jsonb, p_evaluated_at timestamptz default now())
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_alert jsonb;
  v_now timestamptz := clock_timestamp();
  v_last_evaluated_at timestamptz;
begin
  if p_alerts is null or p_evaluated_at is null or p_evaluated_at > v_now + interval '5 minutes'
     or jsonb_typeof(p_alerts) <> 'array' or jsonb_array_length(p_alerts) > 20 then raise exception 'OPS_INVALID_ALERTS'; end if;
  if exists (select 1 from jsonb_array_elements(p_alerts) item group by item->>'fingerprint' having count(*) > 1) then raise exception 'OPS_DUPLICATE_ALERT'; end if;
  perform pg_advisory_xact_lock(773451927);
  select last_evaluated_at into v_last_evaluated_at from public.ops_alert_snapshot_state where singleton = true for update;
  if p_evaluated_at <= v_last_evaluated_at then return; end if;
  for v_alert in select value from jsonb_array_elements(p_alerts) order by value->>'fingerprint'
  loop
    if coalesce(v_alert->>'fingerprint', '') !~ '^[A-Z0-9_]{1,100}$'
       or coalesce(v_alert->>'rule_name', '') !~ '^[A-Z0-9_]{1,100}$'
       or coalesce(v_alert->>'severity', '') not in ('WARNING', 'HIGH', 'CRITICAL') then
      raise exception 'OPS_INVALID_ALERT';
    end if;
    insert into public.ops_alert_state(fingerprint, rule_name, severity, opened_at, last_seen_at, last_evaluated_at)
    values (v_alert->>'fingerprint', v_alert->>'rule_name', v_alert->>'severity', p_evaluated_at, p_evaluated_at, p_evaluated_at)
    on conflict (fingerprint) do update set
      rule_name = excluded.rule_name,
      severity = excluded.severity,
      status = 'OPEN',
      opened_at = case when ops_alert_state.status = 'RESOLVED' then excluded.opened_at else ops_alert_state.opened_at end,
      last_seen_at = excluded.last_seen_at,
      resolved_at = null,
      last_evaluated_at = excluded.last_evaluated_at,
      occurrence_count = ops_alert_state.occurrence_count + case when ops_alert_state.status = 'RESOLVED' then 1 else 0 end
    where ops_alert_state.last_evaluated_at < excluded.last_evaluated_at;
  end loop;
  update public.ops_alert_state alert
     set status = 'RESOLVED', resolved_at = p_evaluated_at, last_evaluated_at = p_evaluated_at
   where alert.status = 'OPEN'
     and alert.last_evaluated_at < p_evaluated_at
     and not exists (
       select 1 from jsonb_array_elements(p_alerts) item
       where item->>'fingerprint' = alert.fingerprint
      );

  update public.ops_alert_snapshot_state set last_evaluated_at = p_evaluated_at where singleton = true;
  delete from public.ops_api_metric_buckets where bucket_start < v_now - interval '31 days';
  delete from public.ops_runtime_events where created_at < v_now - interval '31 days';
  delete from public.ops_job_runs where status <> 'RUNNING' and started_at < v_now - interval '90 days';
end;
$$;
revoke all on function public.sync_operational_alerts(jsonb, timestamptz) from public, anon, authenticated, service_role;
grant execute on function public.sync_operational_alerts(jsonb, timestamptz) to service_role;

create index if not exists collector_runs_started_at_idx on public.collector_runs(started_at desc);
create index if not exists ai_usage_logs_failed_created_idx on public.ai_usage_logs(created_at desc) where success = false;
