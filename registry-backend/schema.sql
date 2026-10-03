-- Tables for lunara-registry. Row level security on, no policies: only the
-- edge function, with the service role key, can read or write them.

create table if not exists public.registry_entries (
  public_id                 text primary key,          -- SHIELD-2026-NNNN
  kind                      text not null default 'business', -- business, ai_agent, vendor, inquiry
  business_name             text not null,
  domain                    text not null,
  website_url               text,
  contact_email             text not null,
  legal_registration_number text,
  registration_country      text,
  agent_name                text,
  agent_operator            text,
  track                     text,
  tier                      text,
  notes                     text,
  signer_type               text,
  signer_name               text,
  signer_role               text,
  attested                  boolean default false,
  status                    text not null default 'pending', -- pending, returned, approved, rejected, revoked
  dns_token                 text,
  domain_verified_at        timestamptz,
  identity_verified_at      timestamptz,
  reviewer_name             text,
  decision_note             text,
  decided_at                timestamptz,
  verified_at               timestamptz,
  expires_at                timestamptz,
  revoked_at                timestamptz,
  revocation_reason         text,
  order_ref                 text,
  ip_hash                   text,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);
create index if not exists registry_entries_domain on public.registry_entries (domain, status);
create index if not exists registry_entries_email on public.registry_entries (contact_email);

create table if not exists public.registry_hits (
  id bigserial primary key, kind text not null, ip_hash text, created_at timestamptz not null default now()
);
create index if not exists registry_hits_kind on public.registry_hits (kind, ip_hash, created_at);

create table if not exists public.registry_partners (
  id bigserial primary key, partner_name text not null, website_url text, contact_email text not null,
  partner_type text, embed_domain text, created_at timestamptz not null default now()
);

create table if not exists public.newsletter_subscribers (
  email text primary key, source_page text, created_at timestamptz not null default now()
);

-- Which page and which site sent the visitor. No IP, no user agent.
create table if not exists public.site_visits (
  id bigserial primary key, page text not null, referrer_host text, created_at timestamptz not null default now()
);

create table if not exists public.score_leads (
  id bigserial primary key, organization text, system text, score integer, grade text, gaps jsonb,
  email text, order_ref text, product text, contacted boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.chat_turns (
  id bigserial primary key, conversation_id text not null, persona text, message text, reply text,
  created_at timestamptz not null default now()
);
create index if not exists chat_turns_cid on public.chat_turns (conversation_id, created_at);

alter table public.registry_entries       enable row level security;
alter table public.registry_hits          enable row level security;
alter table public.registry_partners      enable row level security;
alter table public.newsletter_subscribers enable row level security;
alter table public.site_visits            enable row level security;
alter table public.score_leads            enable row level security;
alter table public.chat_turns             enable row level security;

-- lunara-checkout: when the order email was sent.
alter table public.stripe_orders add column if not exists emailed_at timestamptz;
