-- Tables for lunara-checkout. Row level security on, no policies: only the
-- edge function, with the service role key, can read or write them.

-- One row per checkout, written before the buyer leaves for Stripe and
-- filled in once Stripe shows the exact amount paid for that product.
create table if not exists public.stripe_orders (
  order_ref       text primary key,          -- LO-XXXXXXXXXXXXXXXX, shown to the buyer
  session_id      text not null unique,
  product         text not null,
  amount_total    integer not null,          -- cents, from the catalogue
  currency        text not null default 'usd',
  status          text not null default 'open',  -- open, paid, expired, mismatch
  email           text,
  name            text,
  country         text,
  details         jsonb,                      -- what checkout asked: website, system...
  payment_intent  text,
  refunded_amount integer,
  delivered_at    timestamptz,                -- set by hand when the work is sent
  livemode        boolean not null default false,
  paid_at         timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists stripe_orders_pi on public.stripe_orders (payment_intent);
create index if not exists stripe_orders_status on public.stripe_orders (status, paid_at);

-- One row per Stripe event id: Stripe retries, and a retry must not act twice.
create table if not exists public.stripe_events (
  id          text primary key,
  type        text not null,
  received_at timestamptz not null default now()
);

alter table public.stripe_orders enable row level security;
alter table public.stripe_events enable row level security;

-- Subscriptions and abandoned checkouts (applied 2026-10-11 as migration
-- subscriptions_and_passport_monitor). The hourly sweep fills these from
-- Stripe; renewals counts terms paid after the first.
alter table public.stripe_orders
  add column if not exists subscription_id text,
  add column if not exists customer_id text,
  add column if not exists sub_status text,
  add column if not exists period_end timestamptz,
  add column if not exists cancel_at_period_end boolean,
  add column if not exists sub_checked_at timestamptz,
  add column if not exists renewals integer not null default 0,
  add column if not exists recovery_url text,
  add column if not exists recovery_sent_at timestamptz;
create index if not exists stripe_orders_subscription_idx on public.stripe_orders (subscription_id) where subscription_id is not null;

-- Passport Monitor: a watch tied to a paid order (lunara-registry's table).
alter table public.passport_watch
  add column if not exists order_ref text,
  add column if not exists last_summary_at timestamptz;
create index if not exists passport_watch_order_idx on public.passport_watch (order_ref) where order_ref is not null;

-- The Agent Partner Program (applied 2026-10-11 as agent_partner_program).
-- A referred checkout carries the partner's code; registry_partners is
-- lunara-registry's table of partners and their codes.
alter table public.stripe_orders
  add column if not exists partner_ref text;
create index if not exists stripe_orders_partner_idx on public.stripe_orders (partner_ref) where partner_ref is not null;
alter table public.registry_partners
  add column if not exists code text,
  add column if not exists status text not null default 'pending',
  add column if not exists notes text,
  add column if not exists approved_at timestamptz;
create unique index if not exists registry_partners_code_idx on public.registry_partners (code) where code is not null;
