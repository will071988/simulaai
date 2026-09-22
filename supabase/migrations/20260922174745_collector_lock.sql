-- atomic lock for collector
create table if not exists collector_lock (
  id int primary key check (id = 1),
  locked_at timestamptz,
  locked_until timestamptz,
  run_id uuid
);
insert into collector_lock (id) values (1) on conflict (id) do nothing;

create or replace function acquire_collector_lock(p_run_id uuid, p_ttl_seconds int default 600)
returns boolean
language plpgsql
as $$
declare
  v_locked_until timestamptz;
begin
  select locked_until into v_locked_until from collector_lock where id = 1 for update;
  if v_locked_until is not null and v_locked_until > now() then
    return false;
  end if;
  update collector_lock set locked_at = now(), locked_until = now() + (p_ttl_seconds || ' seconds')::interval, run_id = p_run_id where id = 1;
  return true;
end;
$$;

create or replace function release_collector_lock(p_run_id uuid)
returns void
language plpgsql
as $$
begin
  update collector_lock set locked_at = null, locked_until = null, run_id = null where id = 1 and run_id = p_run_id;
end;
$$;
