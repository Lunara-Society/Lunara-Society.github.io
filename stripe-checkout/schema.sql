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
