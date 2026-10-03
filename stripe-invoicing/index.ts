/* ═══════════════════════════════════════════════════════════════════
   LUNARA INVOICING — Supabase Edge Function `lunara-invoice`
   ═══════════════════════════════════════════════════════════════════

   Everything of consequence lives in invoice-core.mjs, which the tests
   run under Node. This file supplies the two things that cannot run
   off the platform: the tables and the secrets.

   Deployed with verify_jwt disabled, as lunara-auth and lunara-lens
   are: buyers have no Supabase session, and Stripe signs its webhooks
   with its own secret, which invoice-core checks. The tables are
   behind row level security with no policies; only this function,
   holding the service role key, can read them.

   Secrets (Supabase → Edge Functions → Secrets):
     STRIPE_SECRET_KEY      sk_test_… in the sandbox, sk_live_… in production
     STRIPE_WEBHOOK_SECRET  whsec_… of the endpoint …/lunara-invoice/webhook
   ═══════════════════════════════════════════════════════════════════ */

// @ts-nocheck — invoice-core.mjs is deliberately plain JS, shared with Node.
import { handleInvoicing, stripeClient, withCors, json } from './invoice-core.mjs';

const env = Deno.env.toObject();
const REST = `${env.SUPABASE_URL}/rest/v1`;
const H = {
  apikey: env.SUPABASE_SERVICE_ROLE_KEY,
  authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
  'content-type': 'application/json'
};

async function rest(path: string, init: RequestInit = {}) {
  const res = await fetch(REST + path, { ...init, headers: { ...H, ...(init.headers || {}) } });
  if (!res.ok) throw new Error(`${init.method || 'GET'} ${path.split('?')[0]} ${res.status}: ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}
const q = encodeURIComponent;
const one = (r: unknown) => (Array.isArray(r) && r.length ? r[0] : null);
// A webhook knows less than the request that made the invoice; nulls must not erase what was known.
const present = (row: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(row).filter(([, v]) => v !== null && v !== undefined));

const db = {
  openInvoice: (email: string, product: string, livemode: boolean) =>
    rest(`/stripe_invoices?email=eq.${q(email)}&product=eq.${q(product)}&status=eq.open&livemode=is.${livemode}&order=created_at.desc&limit=1`).then(one),

  recentRequests: async (email: string, ipHash: string, since: string) => {
    const s = `created_at=gte.${q(since)}&ip_hash=not.is.null&select=invoice_id&limit=20`;
    const [e, i] = await Promise.all([
      rest(`/stripe_invoices?email=eq.${q(email)}&${s}`),
      rest(`/stripe_invoices?ip_hash=eq.${q(ipHash)}&${s}`)
    ]);
    return { email: e.length, ip: i.length };
  },

  upsertInvoice: (row: Record<string, unknown>) =>
    rest('/stripe_invoices?on_conflict=invoice_id', {
      method: 'POST',
      headers: { prefer: 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify({ ...present(row), updated_at: new Date().toISOString() })
    }).then(one),

  // True only for the first delivery of an event id.
  claimEvent: (id: string, type: string) =>
    rest('/stripe_events?on_conflict=id', {
      method: 'POST',
      headers: { prefer: 'resolution=ignore-duplicates,return=representation' },
      body: JSON.stringify({ id, type })
    }).then((r) => Array.isArray(r) && r.length === 1),

  noteAdjustment: (row: Record<string, unknown>) =>
    rest('/stripe_adjustments', { method: 'POST', body: JSON.stringify(row) })
};

const stripe = env.STRIPE_SECRET_KEY ? stripeClient(env.STRIPE_SECRET_KEY) : null;

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('origin');
  if (req.method === 'OPTIONS') return withCors(new Response(null, { status: 204 }), origin);
  try {
    const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim();
    const res = await handleInvoicing(req, { stripe, db, webhookSecret: env.STRIPE_WEBHOOK_SECRET || '', ip });
    return withCors(res, origin);
  } catch (e) {
    console.error('lunara-invoice', e?.message || e);
    return withCors(json({ error: 'Something went wrong on our side. Try again, or write to lunarasociety@gmail.com.' }, 500), origin);
  }
});
