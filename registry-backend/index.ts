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
   ═══════════════════════════════════════════════════════════════════ */

// @ts-nocheck — registry-core.mjs is deliberately plain JS, shared with Node.
import { handleRegistry, withCors, json } from './registry-core.mjs';

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
  createPartner: (r: unknown) => post('registry_partners', r, 'return=minimal'),
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
    return withCors(await handleRegistry(req, { db, mail, dns, whoIs, ai, env, ip, now: () => Date.now() }));
  } catch (e) {
    console.error('lunara-registry', e?.message || e);
    return withCors(json({ success: false, error: 'Something went wrong on our side. Try again.' }, 500));
  }
});
