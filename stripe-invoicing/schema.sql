-- Tables for lunara-invoice. Row level security on, no policies: only the
-- edge function, with the service role key, can read or write them.

create table if not exists public.stripe_invoices (
  invoice_id   text primary key,
  customer_id  text,
  email        text,
  product      text,
  number       text,
  amount_due   integer,
  amount_paid  integer,
  currency     text,
  status       text,
  hosted_url   text,
  livemode     boolean not null default false,
  ip_hash      text,               -- set only for website requests; rate limiting
  last_failure text,
  paid_at      timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists stripe_invoices_email_product on public.stripe_invoices (email, product, status);
create index if not exists stripe_invoices_ip_recent on public.stripe_invoices (ip_hash, created_at);

-- One row per Stripe event id: Stripe retries, and a retry must not act twice.
create table if not exists public.stripe_events (
  id          text primary key,
  type        text not null,
  received_at timestamptz not null default now()
);

-- Refunds and credit notes, so a paid invoice is not read as money in hand.
create table if not exists public.stripe_adjustments (
  id             bigserial primary key,
  event_id       text,
  kind           text not null,
  invoice_id     text,
  payment_intent text,
  amount         integer,
  currency       text,
  livemode       boolean not null default false,
  created_at     timestamptz not null default now()
);

alter table public.stripe_invoices    enable row level security;
alter table public.stripe_events      enable row level security;
alter table public.stripe_adjustments enable row level security;
