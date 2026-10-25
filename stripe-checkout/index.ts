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
     STRIPE_WEBHOOK_SECRET  optional; whsec_… of …/lunara-checkout/webhook.
                            Events: those in EVENTS (checkout-core.mjs);
                            the subscription ones are optional, as the
                            hourly sweep reads subscriptions itself
     RESEND_API_KEY         optional; sends each buyer a short email of what
                            to do next. MAIL_FROM optional, default
                            "Lunara Society <hello@lunarasociety.com>"
     CHECKOUT_RECOVERY      optional; "on" asks Stripe for abandoned-cart
                            recovery links and promotional consent. Only
                            a US Stripe account may collect that consent
                            (Lunara's is refused), so it is off by default
     LUNARA_OWNER_EMAILS    optional; who may buy the owner's private
                            package. Default lunarasociety@gmail.com
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
  // Only the request that moves the row from open to paid gets true.
  markPaid: (ref: string, patch: Record<string, unknown>) =>
    rest(`/stripe_orders?order_ref=eq.${q(ref)}&status=eq.open`, {
      method: 'PATCH',
      headers: { prefer: 'return=representation' },
      body: JSON.stringify({ ...present(patch), updated_at: new Date().toISOString() })
    }).then((r) => Array.isArray(r) && r.length === 1),
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
  // Subscriptions the hourly sweep should read from Stripe again.
  subscriptionsDue: (before: string) =>
    rest(`/stripe_orders?status=eq.paid&subscription_id=not.is.null&or=(sub_checked_at.is.null,sub_checked_at.lt.${q(before)})&order=sub_checked_at.asc.nullsfirst&limit=40`),
  orderBySubscription: (id: string) =>
    rest(`/stripe_orders?subscription_id=eq.${q(id)}&limit=1`).then(one),
  // Only the first caller records the recovery email as sent.
  claimRecovery: (ref: string, patch: Record<string, unknown>) =>
    rest(`/stripe_orders?order_ref=eq.${q(ref)}&recovery_sent_at=is.null`, {
      method: 'PATCH',
      headers: { prefer: 'return=representation' },
      body: JSON.stringify({ ...present(patch), recovery_sent_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    }).then((r) => Array.isArray(r) && r.length === 1),
  // A renewal moves the register entry the order paid for to the new end,
  // never backwards.
  extendRegistry: (ref: string, until: string) =>
    rest(`/registry_entries?order_ref=eq.${q(ref)}&status=eq.approved&expires_at=lt.${q(until)}`, {
      method: 'PATCH', body: JSON.stringify({ expires_at: until, updated_at: new Date().toISOString() })
    }),
  // Passport Monitor: a confirmed watch of the domain under the buyer's
  // email, tied to the order, which lunara-registry rescans daily.
  monitorWatch: async (w: { domain: string; email: string; order_ref: string }) => {
    const at = new Date().toISOString();
    const found = one(await rest(`/passport_watch?domain=eq.${q(w.domain)}&email=eq.${q(w.email)}&limit=1`));
    if (found) {
      return rest(`/passport_watch?token=eq.${q(found.token)}`, { method: 'PATCH', body: JSON.stringify({ order_ref: w.order_ref, confirmed_at: found.confirmed_at || at, unsubscribed_at: null }) });
    }
    const token = Array.from(crypto.getRandomValues(new Uint8Array(24)), (x) => 'abcdefghijklmnopqrstuvwxyz0123456789'[x % 36]).join('');
    return rest('/passport_watch', { method: 'POST', body: JSON.stringify({ token, domain: w.domain, email: w.email, order_ref: w.order_ref, confirmed_at: at, created_at: at }) });
  },
  endMonitorWatch: (ref: string) =>
    rest(`/passport_watch?order_ref=eq.${q(ref)}&unsubscribed_at=is.null`, {
      method: 'PATCH', body: JSON.stringify({ unsubscribed_at: new Date().toISOString() })
    }),
  // The Agent Network: what a paid order gives the agent it was bought for.
  networkAddCredits: (agent: string, n: number) =>
    rest('/rpc/network_add', { method: 'POST', body: JSON.stringify({ p_agent: agent, p_credits: n, p_points: 0 }) }),
  networkSetTier: (agent: string, tier: string, ref: string) =>
    rest(`/network_agents?agent_id=eq.${q(agent)}`, { method: 'PATCH', body: JSON.stringify({ tier, tier_order_ref: ref, updated_at: new Date().toISOString() }) }),
  networkEndTier: (ref: string) =>
    rest(`/network_agents?tier_order_ref=eq.${q(ref)}`, { method: 'PATCH', body: JSON.stringify({ tier: 'member', tier_order_ref: null, updated_at: new Date().toISOString() }) }),
  // True only for the first delivery of an event id.
  claimEvent: (id: string, type: string) =>
    rest('/stripe_events?on_conflict=id', {
      method: 'POST',
      headers: { prefer: 'resolution=ignore-duplicates,return=representation' },
      body: JSON.stringify({ id, type })
    }).then((r) => Array.isArray(r) && r.length === 1)
};

const stripe = KEY ? stripeClient(KEY) : null;

/* The order email, through Resend. Without RESEND_API_KEY nothing is
   emailed and nothing fails: paid.html says the same things. */
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

/* Who a member-area session belongs to, as lunara-auth says after
   checking its signature. Used only to sell the owner's private package. */
async function whoIs(token: unknown) {
  if (typeof token !== 'string' || token.length < 20 || token.length > 4096) return null;
  const res = await fetch(`${env.SUPABASE_URL}/functions/v1/lunara-auth/session`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ session_token: token })
  });
  if (!res.ok) return null;
  const s = await res.json().catch(() => null);
  return s && s.email ? s : null;
}

/* Asks lunara-registry whether an agent may buy a network product. */
async function networkEligibility(agent: string, product: string) {
  const r = await fetch(`${env.SUPABASE_URL}/functions/v1/lunara-registry/networkEligibility`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ agent_id: agent, product }),
    signal: AbortSignal.timeout(10000)
  });
  return r.json().catch(() => null);
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('origin');
  if (req.method === 'OPTIONS') return withCors(new Response(null, { status: 204 }), origin);
  try {
    const res = await handleCheckout(req, { stripe, db, whoIs, env, mail, networkEligibility, now: () => Date.now(), webhookSecret: env.STRIPE_WEBHOOK_SECRET || '' });
    return withCors(res, origin);
  } catch (e) {
    console.error('lunara-checkout', e?.message || e);
    return withCors(json({ error: 'Card payment is unavailable right now.' }, 502), origin);
  }
});
