-- Authorized hardening of the shared backend-only webhook ledger.
-- Preserve rows, schema, keys and server access; no business records are modified.
begin;
do $$
declare
  ledger_sequence text;
begin
  if to_regclass('public.billing_webhook_events') is not null then
    alter table public.billing_webhook_events enable row level security;
    revoke all on table public.billing_webhook_events from public, anon, authenticated;
    grant select, insert, update, delete on table public.billing_webhook_events to service_role;
    if not exists (select 1 from pg_policy where polrelid = 'public.billing_webhook_events'::regclass and polname = 'billing_webhook_events_service_only') then
      create policy billing_webhook_events_service_only on public.billing_webhook_events
        for all to service_role using (true) with check (true);
    end if;
    ledger_sequence := pg_get_serial_sequence('public.billing_webhook_events', 'id');
    if ledger_sequence is not null then
      execute format('revoke all on sequence %s from public, anon, authenticated', ledger_sequence);
      execute format('grant usage, select on sequence %s to service_role', ledger_sequence);
    end if;
  end if;
end;
$$;
commit;
