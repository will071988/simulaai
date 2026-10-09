-- Sprint 3.4 — Stripe billing persistence
-- Service-role only. Public/authenticated clients receive no direct table grants.

create table if not exists public.simulaai_billing_customers (
  user_id uuid primary key references auth.users(id) on delete cascade,
  stripe_customer_id text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.simulaai_billing_subscriptions (
  stripe_subscription_id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  stripe_customer_id text not null,
  price_id text,
  status text not null,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists simulaai_billing_subscriptions_user_id_idx
  on public.simulaai_billing_subscriptions(user_id);

create table if not exists public.simulaai_billing_purchases (
  stripe_checkout_session_id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  stripe_customer_id text,
  stripe_payment_intent_id text,
  price_id text,
  status text not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists simulaai_billing_purchases_user_id_idx
  on public.simulaai_billing_purchases(user_id);

create table if not exists public.simulaai_billing_webhook_events (
  stripe_event_id text primary key,
  event_type text not null,
  processed_at timestamptz not null default now()
);

alter table public.simulaai_billing_customers enable row level security;
alter table public.simulaai_billing_subscriptions enable row level security;
alter table public.simulaai_billing_purchases enable row level security;
alter table public.simulaai_billing_webhook_events enable row level security;

revoke all on table public.simulaai_billing_customers from anon, authenticated;
revoke all on table public.simulaai_billing_subscriptions from anon, authenticated;
revoke all on table public.simulaai_billing_purchases from anon, authenticated;
revoke all on table public.simulaai_billing_webhook_events from anon, authenticated;

grant select, insert, update, delete on table public.simulaai_billing_customers to service_role;
grant select, insert, update, delete on table public.simulaai_billing_subscriptions to service_role;
grant select, insert, update, delete on table public.simulaai_billing_purchases to service_role;
grant select, insert, update, delete on table public.simulaai_billing_webhook_events to service_role;
