/* ═══════════════════════════════════════════════════════════════════
   LUNARA REGISTRY — Supabase Edge Function `lunara-registry`
   ═══════════════════════════════════════════════════════════════════

   The logic is in registry-core.mjs, which the tests run under Node.
   This file supplies the tables, mail, DNS and the chat model.

   verify_jwt is off: the registry is public by design (badge.js runs on
   other businesses' sites), and the owner's routes check a lunara-auth
   session themselves. Every table is behind row level security with no
   policies; only this function, holding the service role key, reads them.

   Secrets (Supabase → Edge Functions → Secrets):
     RESEND_API_KEY       emails (applications, decisions, score reports).
                          Without it nothing is emailed; everything else works.
     MAIL_FROM            optional; default "Lunara Society <hello@lunarasociety.com>"
                          (the domain must be verified in Resend)
     ANTHROPIC_API_KEY    the public chat (shared with lunara-lens)
     LUNARA_OWNER_EMAILS  optional; default lunarasociety@gmail.com
     LUNARA_OPS_KEY       optional; 24+ characters. Lets the owner's own reporting
                          agents read opsStats (figures only, no names or emails)
                          with the header x-lunara-ops-key.
   ═══════════════════════════════════════════════════════════════════ */

// @ts-nocheck — registry-core.mjs is deliberately plain JS, shared with Node.
import { handleRegistry, withCors, json } from './registry-core.mjs';
import { isPrivateAddress } from './passport.mjs';

const env = Deno.env.toObject();
const REST = `${env.SUPABASE_URL}/rest/v1`;
const H = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, 'content-type': 'application/json' };

async function rest(path: string, init: RequestInit = {}) {
  const res = await fetch(REST + path, { ...init, headers: { ...H, ...(init.headers || {}) } });
  if (!res.ok) throw new Error(`${init.method || 'GET'} ${path.split('?')[0]} ${res.status}: ${await res.text()}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}
const q = encodeURIComponent;
const one = (r: unknown) => (Array.isArray(r) && r.length ? r[0] : null);
const post = (table: string, row: unknown, prefer = 'return=representation') =>
  rest(`/${table}`, { method: 'POST', headers: { prefer }, body: JSON.stringify(row) });
const countOf = async (path: string) => {
  const res = await fetch(REST + path, { headers: { ...H, prefer: 'count=exact', range: '0-0' } });
  const range = res.headers.get('content-range') || '*/0';
  return Number(range.split('/')[1]) || 0;
};

const db = {
  getApplication: (id: string) => rest(`/registry_entries?public_id=eq.${q(id)}&limit=1`).then(one),
  getPublishedByDomain: (d: string) => rest(`/registry_entries?domain=eq.${q(d)}&status=in.(approved,revoked)&order=decided_at.desc.nullslast&limit=1`).then(one),
  listPublished: () => rest('/registry_entries?status=eq.approved&order=verified_at.asc&limit=1000'),
  countApproved: (kind: string) => countOf(`/registry_entries?status=eq.approved&kind=eq.${q(kind)}&select=public_id`),
  findOpenApplication: (d: string, e: string) => rest(`/registry_entries?domain=eq.${q(d)}&contact_email=eq.${q(e)}&status=in.(pending,returned)&limit=1`).then(one),
  createApplication: (a: Record<string, unknown>) => post('registry_entries', a).then(one),
  updateApplication: (id: string, patch: Record<string, unknown>) =>
    rest(`/registry_entries?public_id=eq.${q(id)}`, { method: 'PATCH', body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }) }),
  listApplications: () => rest('/registry_entries?order=created_at.desc&limit=500'),
  applicationsByEmail: (e: string) => rest(`/registry_entries?contact_email=eq.${q(e)}&order=created_at.desc&limit=20`),
  countHits: (kind: string, ip: string | null, since: string) =>
    countOf(`/registry_hits?kind=eq.${q(kind)}${ip ? `&ip_hash=eq.${q(ip)}` : ''}&created_at=gte.${q(since)}&select=id`),
  hit: (kind: string, ip: string, at: string) => post('registry_hits', { kind, ip_hash: ip, created_at: at }, 'return=minimal'),
  listOrders: () => rest('/stripe_orders?select=order_ref,product,amount_total,currency,status,email,name,country,refunded_amount,delivered_at,livemode,paid_at,created_at,subscription_id,sub_status,cancel_at_period_end,renewals,period_end,partner_ref&order=created_at.desc&limit=500'),
  countPassports: () => countOf('/passport_scans?select=domain'),
  countWatchers: () => countOf('/passport_watch?confirmed_at=not.is.null&unsubscribed_at=is.null&select=token'),
  countSubscribers: () => countOf('/newsletter_subscribers?select=email'),
  getActiveKey: () => rest('/registry_keys?active=eq.true&order=created_at.asc&limit=1').then(one),
  listKeys: () => rest('/registry_keys?select=kid,public_jwk,created_at&order=created_at.asc'),
  saveKey: (k: Record<string, unknown>) => post('registry_keys', k, 'return=minimal'),
  getPassport: (d: string) => rest(`/passport_scans?domain=eq.${q(d)}&limit=1`).then(one),
  getPassports: async (ds: string[]) => {
    const out: unknown[] = [];
    for (let i = 0; i < ds.length; i += 100) {
      const part = ds.slice(i, i + 100);
      if (part.length) out.push(...(await rest(`/passport_scans?domain=in.(${part.map((d) => q(d)).join(',')})&limit=1000`)));
    }
    return out;
  },
  savePassport: (r: Record<string, unknown>) => rest('/passport_scans?on_conflict=domain', {
    method: 'POST', headers: { prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(r) }),
  watchedDomains: async () => [...new Set(((await rest('/passport_watch?confirmed_at=not.is.null&unsubscribed_at=is.null&select=domain&limit=5000')) || []).map((w: { domain: string }) => w.domain))],
  // Passport Monitor: watches tied to a paid order that has not lapsed.
  monitoredDomains: async () => [...new Set(((await rest('/passport_watch?order_ref=not.is.null&unsubscribed_at=is.null&select=domain&limit=5000')) || []).map((w: { domain: string }) => w.domain))],
  monitorFor: (d: string) => rest(`/passport_watch?domain=eq.${q(d)}&order_ref=not.is.null&unsubscribed_at=is.null&select=token&limit=1`).then(one),
  watchersFor: (d: string) => rest(`/passport_watch?domain=eq.${q(d)}&confirmed_at=not.is.null&unsubscribed_at=is.null&limit=100`),
  findWatch: (d: string, e: string) => rest(`/passport_watch?domain=eq.${q(d)}&email=eq.${q(e)}&limit=1`).then(one),
  getWatch: (t: string) => rest(`/passport_watch?token=eq.${q(t)}&limit=1`).then(one),
  createWatch: (r: Record<string, unknown>) => post('passport_watch', r, 'return=minimal'),
  updateWatch: (t: string, patch: Record<string, unknown>) => rest(`/passport_watch?token=eq.${q(t)}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  createPartner: (r: unknown) => post('registry_partners', r, 'return=minimal'),
  findPartnerByCode: (c: string) => rest(`/registry_partners?code=eq.${q(c)}&limit=1`).then(one),
  findPartnerByEmail: (e: string) => rest(`/registry_partners?contact_email=eq.${q(e)}&code=not.is.null&order=created_at.asc&limit=1`).then(one),
  listPartners: () => rest('/registry_partners?order=created_at.desc&limit=200'),
  // The Agent Network (network.mjs).
  netGetAgent: (id: string) => rest(`/network_agents?agent_id=eq.${q(id)}&limit=1`).then(one),
  netFindAgent: (email: string, name: string) => rest(`/network_agents?operator_email=eq.${q(email)}&name=ilike.${q(name.replace(/[%_*\\]/g, ''))}&limit=1`).then(one),
  netCreateAgent: (r: Record<string, unknown>) => post('network_agents', r, 'return=minimal'),
  netUpdateAgent: (id: string, patch: Record<string, unknown>) => rest(`/network_agents?agent_id=eq.${q(id)}`, { method: 'PATCH', body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }) }),
  netListAgents: (tiers: string[]) => rest(`/network_agents?tier=in.(${tiers.map(q).join(',')})&order=created_at.asc&limit=500`),
  netCounts: async () => ({ total: await countOf('/network_agents?select=agent_id'), listed: await countOf('/network_agents?tier=neq.member&select=agent_id') }),
  netAdd: (id: string, credits: number, points: number) => rest('/rpc/network_add', { method: 'POST', body: JSON.stringify({ p_agent: id, p_credits: credits, p_points: points }) }),
  netSpendCredit: (id: string) => rest('/rpc/network_spend_credit', { method: 'POST', body: JSON.stringify({ p_agent: id }) }).then((r) => r === true),
  sitCreate: (r: Record<string, unknown>) => post('trial_sittings', r, 'return=minimal'),
  sitGet: (id: string) => rest(`/trial_sittings?sitting_id=eq.${q(id)}&limit=1`).then(one),
  sitUpdate: (id: string, patch: Record<string, unknown>) => rest(`/trial_sittings?sitting_id=eq.${q(id)}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  sitOpen: (agent: string, trial: string, nowIso: string) => rest(`/trial_sittings?agent_id=eq.${q(agent)}&trial=eq.${q(trial)}&submitted_at=is.null&expires_at=gt.${q(nowIso)}&select=sitting_id,tasks,expires_at&limit=1`).then(one),
  sitIncludedSince: (agent: string, since: string) => countOf(`/trial_sittings?agent_id=eq.${q(agent)}&paid_with=eq.included&started_at=gte.${q(since)}&select=sitting_id`),
  misCreate: (r: Record<string, unknown>) => post('mission_submissions', r).then(one),
  misGet: (id: number) => rest(`/mission_submissions?id=eq.${id}&limit=1`).then(one),
  misUpdate: (id: number, patch: Record<string, unknown>) => rest(`/mission_submissions?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  misList: () => rest('/mission_submissions?order=created_at.desc&limit=200'),
  misExists: async (mission: string, key: string) => !!one(await rest(`/mission_submissions?mission=eq.${q(mission)}&payload->>dedupe=eq.${q(key)}&status=neq.rejected&select=id&limit=1`)),
  verifiedAgentEntry: (email: string, nowIso: string) => rest(`/registry_entries?contact_email=ilike.${q(email)}&kind=eq.ai_agent&status=eq.approved&expires_at=gt.${q(nowIso)}&select=public_id&limit=1`).then(one),
  updatePartner: (c: string, patch: Record<string, unknown>) => rest(`/registry_partners?code=eq.${q(c)}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  ordersByPartner: (c: string) => rest(`/stripe_orders?partner_ref=eq.${q(c)}&select=order_ref,product,amount_total,status,livemode,sub_status,cancel_at_period_end,renewals,paid_at,created_at&limit=1000`),
  subscribe: async (email: string, source: string) => {
    const r = await rest('/newsletter_subscribers?on_conflict=email', { method: 'POST', headers: { prefer: 'resolution=ignore-duplicates,return=representation' }, body: JSON.stringify({ email, source_page: source || null }) });
    return Array.isArray(r) && r.length === 1;
  },
  logVisit: (r: unknown) => post('site_visits', r, 'return=minimal'),
  createLead: (r: unknown) => post('score_leads', r, 'return=minimal'),
  listLeads: () => rest('/score_leads?order=created_at.desc&limit=500').then((rows) =>
    (rows || []).map((r) => ({ ...r, created_date: r.created_at }))),
  chatHistory: async (cid: string) => {
    const rows = await rest(`/chat_turns?conversation_id=eq.${q(cid)}&order=created_at.asc&limit=20`);
    return (rows || []).flatMap((r) => [{ role: 'user', content: r.message }, { role: 'assistant', content: r.reply }]);
  },
  saveChat: (cid: string, persona: string, message: string, reply: string) =>
    post('chat_turns', { conversation_id: cid, persona, message, reply }, 'return=minimal'),
  getOrder: (ref: string) => rest(`/stripe_orders?order_ref=eq.${q(ref)}&select=order_ref,status,product&limit=1`).then(one)
};

/* Mail through Resend. Absent key: nothing is sent, nothing fails. */
const mail = env.RESEND_API_KEY ? {
  send: async (m: { to: string; subject: string; text: string; html?: string }) => {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        from: env.MAIL_FROM || 'Lunara Society <hello@lunarasociety.com>',
        to: [m.to], reply_to: 'lunarasociety@gmail.com', subject: m.subject, text: m.text, html: m.html
      })
    });
    if (!r.ok) throw new Error('resend ' + r.status + ' ' + (await r.text()).slice(0, 200));
  }
} : null;

/* TXT records over DNS-over-HTTPS: Cloudflare, then Google. */
async function dns(name: string) {
  for (const base of ['https://cloudflare-dns.com/dns-query', 'https://dns.google/resolve']) {
    try {
      const r = await fetch(`${base}?name=${q(name)}&type=TXT`, { headers: { accept: 'application/dns-json' } });
      if (!r.ok) continue;
      const j = await r.json();
      return (j.Answer || []).filter((a: { type: number }) => a.type === 16).map((a: { data: string }) => a.data);
    } catch { /* next resolver */ }
  }
  return [];
}

/* Passport scans: DNS answers with the resolver's DNSSEC verdict, and
   pages fetched only from public addresses. Every hop of a redirect is
   resolved and checked again, and bodies are cut at 64 KB. */
const TYPES: Record<string, number> = { A: 1, AAAA: 28, TXT: 16, CAA: 257, SOA: 6 };
async function resolve(name: string, type: string) {
  for (const base of ['https://cloudflare-dns.com/dns-query', 'https://dns.google/resolve']) {
    try {
      const r = await fetch(`${base}?name=${q(name)}&type=${type}&do=1`, { headers: { accept: 'application/dns-json' }, signal: AbortSignal.timeout(5000) });
      if (!r.ok) continue;
      const j = await r.json();
      return { ad: !!j.AD, answers: (j.Answer || []).filter((a: { type: number }) => a.type === TYPES[type]).map((a: { data: string }) => a.data) };
    } catch { /* next resolver */ }
  }
  throw new Error('dns unreachable');
}
async function publicHost(host: string) {
  if (/^[\d.]+$/.test(host) || host.includes(':') || !host.includes('.')) return false;
  const [a, aaaa] = await Promise.all([resolve(host, 'A').catch(() => null), resolve(host, 'AAAA').catch(() => null)]);
  const ips = [...(a?.answers || []), ...(aaaa?.answers || [])].filter((x) => /^[\d.]+$|:/.test(x));
  return ips.length > 0 && !ips.some(isPrivateAddress);
}
async function fetchPage(url: string) {
  for (let hop = 0; hop < 4; hop++) {
    const u = new URL(url);
    if (u.protocol !== 'https:' || u.port || !(await publicHost(u.hostname))) throw new Error('refused');
    const r = await fetch(u, { redirect: 'manual', headers: { 'user-agent': 'LunaraPassport/1.0 (+https://lunarasociety.com/passport.html)' }, signal: AbortSignal.timeout(7000) });
    if (r.status >= 300 && r.status < 400 && r.headers.get('location')) { url = new URL(r.headers.get('location')!, u).href; await r.body?.cancel(); continue; }
    const headers: Record<string, string> = {};
    r.headers.forEach((v, k) => { headers[k.toLowerCase()] = v; });
    let text = '';
    if (r.body) {
      const reader = r.body.getReader(); const dec = new TextDecoder(); let n = 0;
      while (n < 65536) { const { done, value } = await reader.read(); if (done) break; n += value.length; text += dec.decode(value, { stream: true }); }
      await reader.cancel().catch(() => {});
    }
    return { status: r.status, headers, text: text.slice(0, 65536) };
  }
  throw new Error('too many redirects');
}

/* The league is the list published at /league/domains.json, so adding a
   company is a commit to the site, reviewed like any other page. */
let league: { at: number; list: unknown[] } | null = null;
async function leagueList() {
  if (league && Date.now() - league.at < 600e3) return league.list;
  const r = await fetch('https://lunarasociety.com/league/domains.json', { signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error('league ' + r.status);
  const j = await r.json();
  const list = (Array.isArray(j.domains) ? j.domains : []).filter((e: { domain?: unknown }) => typeof e?.domain === 'string');
  league = { at: Date.now(), list };
  return list;
}

/* Lunara's signed corpus of obligations, which the Compliance Clerk
   trial is set from: the published file, read at most hourly. */
let corpusCache: { at: number; list: unknown[] } | null = null;
async function corpus() {
  if (corpusCache && Date.now() - corpusCache.at < 3600e3) return corpusCache.list;
  const r = await fetch('https://lunarasociety.com/corpus/obligations.json', { signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error('corpus ' + r.status);
  const j = await r.json();
  corpusCache = { at: Date.now(), list: Array.isArray(j.obligations) ? j.obligations : [] };
  return corpusCache.list;
}

async function whoIs(token: unknown) {
  if (typeof token !== 'string' || token.length < 20 || token.length > 4096) return null;
  const res = await fetch(`${env.SUPABASE_URL}/functions/v1/lunara-auth/session`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ session_token: token })
  });
  if (!res.ok) return null;
  const s = await res.json().catch(() => null);
  return s && s.email ? s : null;
}

const ai = env.ANTHROPIC_API_KEY ? async (system: string, messages: unknown[]) => {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: env.REGISTRY_CHAT_MODEL || 'claude-sonnet-5', max_tokens: 600, system, messages })
  });
  if (!r.ok) throw new Error('model ' + r.status);
  const j = await r.json();
  return (j.content || []).filter((c: { type: string }) => c.type === 'text').map((c: { text: string }) => c.text).join('\n');
} : null;

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return withCors(new Response(null, { status: 204 }));
  try {
    const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim();
    return withCors(await handleRegistry(req, { db, mail, dns, resolve, fetchPage, leagueList, corpus, whoIs, ai, env, ip, now: () => Date.now() }));
  } catch (e) {
    console.error('lunara-registry', e?.message || e);
    return withCors(json({ success: false, error: 'Something went wrong on our side. Try again.' }, 500));
  }
});
