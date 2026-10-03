/* ═══════════════════════════════════════════════════════════════════
   LUNARA CHECKOUT — Supabase Edge Function `lunara-checkout`
   ═══════════════════════════════════════════════════════════════════

   The logic lives in checkout-core.mjs, which the tests run under Node.
   This file supplies what cannot run off the platform: the table and
   the secrets.

   verify_jwt is off, as on lunara-auth and lunara-lens: buyers have no
   Supabase session, and Stripe signs its webhooks with its own secret,
   which checkout-core checks. stripe_orders has row level security on
   and no policies, so only this function can read it.

   Secrets (Supabase → Edge Functions → Secrets):
     STRIPE_SECRET_KEY      a restricted key with Checkout Sessions: Write
                            (LUNA-SECRET-KEY is read too, the name it was
                            first saved under)
     STRIPE_WEBHOOK_SECRET  optional; whsec_… of …/lunara-checkout/webhook
   ═══════════════════════════════════════════════════════════════════ */

// @ts-nocheck — checkout-core.mjs is deliberately plain JS, shared with Node.
import { handleCheckout, stripeClient, withCors, json } from './checkout-core.mjs';

const env = Deno.env.toObject();
const KEY = env.STRIPE_SECRET_KEY || env['LUNA-SECRET-KEY'] || env.LUNA_SECRET_KEY || '';
const REST = `${env.SUPABASE_URL}/rest/v1`;
const H = {
  apikey: env.SUPABASE_SERVICE_ROLE_KEY,
  authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
  'content-type': 'application/json'
};

async function rest(path: string, init: RequestInit = {}) {
  const res = await fetch(REST + path, { ...init, headers: { ...H, ...(init.headers || {}) } });
  if (!res.ok) throw new Error(`${init.method || 'GET'} ${path.split('?')[0]} ${res.status}: ${await res.text()}`);
  const text = await res.text(); // a POST without return=representation answers 201 with no body
  return text ? JSON.parse(text) : null;
}
const present = (row: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(row).filter(([, v]) => v !== null && v !== undefined));

const q = encodeURIComponent;
const one = (r: unknown) => (Array.isArray(r) && r.length ? r[0] : null);

const db = {
  createOrder: (row: Record<string, unknown>) =>
    rest('/stripe_orders', { method: 'POST', body: JSON.stringify(row) }),
  openOrders: (since: string) =>
    rest(`/stripe_orders?status=eq.open&created_at=gte.${q(since)}&order=created_at.asc&limit=50`),
  getOrder: (ref: string) =>
    rest(`/stripe_orders?order_ref=eq.${q(ref)}&limit=1`).then(one),
  updateOrder: (ref: string, patch: Record<string, unknown>) =>
    rest(`/stripe_orders?order_ref=eq.${q(ref)}`, {
      method: 'PATCH',
      body: JSON.stringify({ ...present(patch), updated_at: new Date().toISOString() })
    }),
  markRefunded: (paymentIntent: string, amount: number) =>
    rest(`/stripe_orders?payment_intent=eq.${q(paymentIntent)}`, {
      method: 'PATCH',
      body: JSON.stringify({ refunded_amount: amount, updated_at: new Date().toISOString() })
    }),
  // True only for the first delivery of an event id.
  claimEvent: (id: string, type: string) =>
    rest('/stripe_events?on_conflict=id', {
      method: 'POST',
      headers: { prefer: 'resolution=ignore-duplicates,return=representation' },
      body: JSON.stringify({ id, type })
    }).then((r) => Array.isArray(r) && r.length === 1)
};

const stripe = KEY ? stripeClient(KEY) : null;

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('origin');
  if (req.method === 'OPTIONS') return withCors(new Response(null, { status: 204 }), origin);
  try {
    const res = await handleCheckout(req, { stripe, db, webhookSecret: env.STRIPE_WEBHOOK_SECRET || '' });
    return withCors(res, origin);
  } catch (e) {
    console.error('lunara-checkout', e?.message || e);
    return withCors(json({ error: 'Card payment is unavailable right now.' }, 502), origin);
  }
});
