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

-- Passport control: the latest scan of each domain. prev_* is the score
-- before the last scheduled rescan, which is what "this week" compares.
create table if not exists public.passport_scans (
  domain text primary key,
  score integer not null, grade text not null, visa text not null,
  checks jsonb not null, scanned_at timestamptz not null,
  prev_score integer, prev_grade text, prev_scanned_at timestamptz,
  first_scanned_at timestamptz not null default now()
);
create index if not exists passport_scans_score on public.passport_scans (score desc);

-- Score watch: an owner asks to be told when a domain's passport gets worse.
create table if not exists public.passport_watch (
  token text primary key,
  domain text not null, email text not null,
  confirmed_at timestamptz, unsubscribed_at timestamptz,
  last_score integer, last_alert_at timestamptz,
  created_at timestamptz not null default now(),
  unique (domain, email)
);
alter table public.passport_scans enable row level security;
alter table public.passport_watch enable row level security;

-- Agent passports: the Ed25519 key that signs them, made by the function
-- on first use. Only the service role reads this table; the public half
-- is served by lunara-registry/agentPassportKeys.
create table if not exists public.registry_keys (
  kid text primary key, public_jwk jsonb not null, private_pkcs8 text not null,
  active boolean not null default true, created_at timestamptz not null default now()
);
alter table public.registry_keys enable row level security;

-- The audit chain (os.mjs). One row per privileged decision: who, what,
-- on which record, the outcome, the reason and a correlation id. Each row
-- carries the hash of the row before it and its own hash, so an edit,
-- a removal or an insertion in the middle breaks the chain. Append-only:
-- UPDATE, DELETE and TRUNCATE raise. prev_hash is unique, so two writers
-- cannot fork the chain. The database owner can still drop the trigger;
-- the chain makes that evident, it does not make it impossible.
create table if not exists public.admin_audit (
  seq bigserial primary key,
  at timestamptz not null,
  actor text not null,
  action text not null,
  target text,
  outcome text not null,
  reason text,
  correlation_id text not null,
  detail jsonb,
  prev_hash text not null unique,
  hash text not null unique
);
alter table public.admin_audit enable row level security;
revoke all on public.admin_audit from anon, authenticated;
create or replace function public.admin_audit_append_only() returns trigger
  language plpgsql set search_path = '' as $$
begin
  raise exception 'admin_audit is append-only';
end $$;
drop trigger if exists admin_audit_no_change on public.admin_audit;
create trigger admin_audit_no_change before update or delete on public.admin_audit
  for each row execute function public.admin_audit_append_only();
drop trigger if exists admin_audit_no_truncate on public.admin_audit;
create trigger admin_audit_no_truncate before truncate on public.admin_audit
  for each statement execute function public.admin_audit_append_only();

-- Agent Network: points buy trial sittings (applied 2026-10-19 as migration
-- network_points_redeem). Rank counts points earned; points_spent only
-- lowers the balance. The balance check and the spend are one statement,
-- so two requests at once cannot spend the same points.
alter table public.network_agents add column if not exists points_spent integer not null default 0;
create or replace function public.network_redeem(p_agent text, p_cost integer, p_sittings integer, p_referral_points integer)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $$
declare n integer;
begin
  if p_cost is null or p_cost <= 0 or p_sittings is null or p_sittings < 1 or p_sittings > 10 then
    return false;
  end if;
  update public.network_agents
     set points_spent = points_spent + p_cost * p_sittings,
         trial_credits = trial_credits + p_sittings,
         updated_at = now()
   where agent_id = p_agent
     and status = 'active'
     and points + greatest(0, coalesce(p_referral_points, 0)) - points_spent >= p_cost * p_sittings;
  get diagnostics n = row_count;
  return n = 1;
end $$;
revoke all on function public.network_redeem(text, integer, integer, integer) from public, anon, authenticated;
