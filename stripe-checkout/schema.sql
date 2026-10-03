-- Tables for lunara-checkout. Row level security on, no policies: only the
-- edge function, with the service role key, can read or write them.

create table if not exists public.stripe_payments (
  session_id      text primary key,
  product         text,
  amount_total    integer,
  currency        text,
  email           text,
  name            text,
  country         text,
  payment_status  text,
  payment_intent  text,
  refunded_amount integer,
  livemode        boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists stripe_payments_pi on public.stripe_payments (payment_intent);

-- One row per Stripe event id: Stripe retries, and a retry must not act twice.
create table if not exists public.stripe_events (
  id          text primary key,
  type        text not null,
  received_at timestamptz not null default now()
);

alter table public.stripe_payments enable row level security;
alter table public.stripe_events   enable row level security;
