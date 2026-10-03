/* ═══════════════════════════════════════════════════════════════════
   LUNARA CHECKOUT — Stripe
   ═══════════════════════════════════════════════════════════════════

   A buy button asks for a Stripe Checkout Session for one product and
   the buyer is sent to Stripe's payment page: card, Apple Pay, Google
   Pay, from any country. Stripe sends the receipt.

   All of the logic is here, as plain JavaScript over fetch and Web
   Crypto, so the tests run the code the edge function serves.

   The amount is never taken from the browser. The page names a product
   and the price comes from catalog.mjs, which is generated from
   lunara-pricing.js. Prices are sent inline (price_data), so nothing
   has to be set up in the Stripe dashboard for a product to be sold,
   and the key only needs permission to write Checkout Sessions.
   ═══════════════════════════════════════════════════════════════════ */

import { CATALOG } from './catalog.mjs';

export const STRIPE_API = 'https://api.stripe.com';
export const STRIPE_VERSION = '2026-08-26.dahlia';
const SITE = 'https://lunarasociety.com/';

export function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { 'content-type': 'application/json; charset=utf-8' }
  });
}

const OUR_ORIGIN = /^https:\/\/(www\.)?lunarasociety\.com$/;
const DEV_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

export function withCors(res, origin) {
  const ok = !origin || OUR_ORIGIN.test(origin) || DEV_ORIGIN.test(origin);
  const h = new Headers(res.headers);
  h.set('access-control-allow-origin', ok && origin ? origin : 'https://lunarasociety.com');
  h.set('access-control-allow-headers', 'content-type');
  h.set('access-control-allow-methods', 'GET, POST, OPTIONS');
  h.set('vary', 'origin');
  return new Response(res.body, { status: res.status, headers: h });
}

/* ── Stripe client ───────────────────────────────────────────────── */

/* Stripe's bracket syntax: { a: { b: 1 }, c: [x] } → a[b]=1&c[0]=x. */
export function formEncode(obj, prefix = '', out = new URLSearchParams()) {
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (Array.isArray(v)) v.forEach((x, i) =>
      typeof x === 'object' ? formEncode(x, `${key}[${i}]`, out) : out.append(`${key}[${i}]`, String(x)));
    else if (typeof v === 'object') formEncode(v, key, out);
    else out.append(key, String(v));
  }
  return out;
}

export class StripeError extends Error {
  constructor(status, body) {
    super(`stripe ${status}: ${body?.error?.message || 'error'}`);
    this.status = status; this.body = body;
  }
}

export function stripeClient(secretKey, fetchImpl = fetch) {
  async function call(method, path, params) {
    const headers = { authorization: `Bearer ${secretKey}`, 'stripe-version': STRIPE_VERSION };
    let url = STRIPE_API + path, body;
    if (params && method === 'GET') url += '?' + formEncode(params).toString();
    else if (params) {
      body = formEncode(params).toString();
      headers['content-type'] = 'application/x-www-form-urlencoded';
    }
    const res = await fetchImpl(url, { method, headers, body });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new StripeError(res.status, data);
    return data;
  }
  return {
    livemode: /^(sk|rk)_live_/.test(secretKey),
    get: (path, params) => call('GET', path, params),
    post: (path, params) => call('POST', path, params)
  };
}

/* ── Checkout ────────────────────────────────────────────────────── */

/* Where Stripe sends the buyer afterwards: back to the page they came
   from, if it is one of ours, otherwise the home page. An open redirect
   on a payment flow is how phishing pages borrow a real domain. */
export function returnUrl(raw) {
  try {
    const u = new URL(raw);
    if (OUR_ORIGIN.test(u.origin) || DEV_ORIGIN.test(u.origin)) {
      u.hash = '';
      for (const k of ['paid', 'session_id']) u.searchParams.delete(k);
      return u.toString();
    }
  } catch { /* fall through */ }
  return SITE;
}

export async function createSession(stripe, productId, returnTo) {
  const p = CATALOG[productId];
  if (!p) return null;
  const back = returnUrl(returnTo);
  // {CHECKOUT_SESSION_ID} is filled in by Stripe and must not be encoded.
  const success = back + (back.includes('?') ? '&' : '?') +
    `paid=${encodeURIComponent(productId)}&session_id={CHECKOUT_SESSION_ID}`;
  return stripe.post('/v1/checkout/sessions', {
    mode: 'payment',
    line_items: [{
      quantity: 1,
      price_data: {
        currency: 'usd',
        unit_amount: p.cents,
        product_data: { name: p.name, description: p.terms, metadata: { lunara_product: productId } }
      }
    }],
    success_url: success,
    cancel_url: back,
    billing_address_collection: 'auto',
    tax_id_collection: { enabled: 'true' },
    metadata: { lunara_product: productId },
    payment_intent_data: { metadata: { lunara_product: productId } }
  });
}

/* ── Webhook signatures ──────────────────────────────────────────── */

function timingSafeEqualHex(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

async function hmacHex(secret, payload) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(sig), (x) => x.toString(16).padStart(2, '0')).join('');
}

/* Stripe-Signature: t=…,v1=…[,v1=…]. HMAC-SHA256 over `${t}.${raw}`;
   any v1 may match, since secrets roll with an overlap. Five minutes of
   tolerance against replays. */
export async function verifySignature(raw, header, secret, nowSec = Math.floor(Date.now() / 1000), tolerance = 300) {
  if (!header || !secret) return false;
  const parts = header.split(',').map((p) => p.split('='));
  const t = Number((parts.find(([k]) => k === 't') || [])[1]);
  const sigs = parts.filter(([k]) => k === 'v1').map(([, v]) => v);
  if (!Number.isFinite(t) || !sigs.length || Math.abs(nowSec - t) > tolerance) return false;
  const expected = await hmacHex(secret, `${t}.${raw}`);
  return sigs.some((s) => timingSafeEqualHex(s, expected));
}

export const EVENTS = [
  'checkout.session.completed',
  'checkout.session.async_payment_succeeded',
  'checkout.session.async_payment_failed',
  'charge.refunded'
];

function rowFromSession(s) {
  return {
    session_id: s.id,
    product: s.metadata?.lunara_product || null,
    amount_total: s.amount_total,
    currency: s.currency,
    email: s.customer_details?.email || null,
    name: s.customer_details?.name || null,
    country: s.customer_details?.address?.country || null,
    payment_status: s.payment_status,
    payment_intent: typeof s.payment_intent === 'string' ? s.payment_intent : s.payment_intent?.id || null,
    livemode: !!s.livemode
  };
}

async function handleEvent(event, db) {
  const o = event.data?.object || {};
  if (event.type.startsWith('checkout.session.')) {
    await db.upsertPayment(rowFromSession(o));
  } else if (event.type === 'charge.refunded') {
    const pi = typeof o.payment_intent === 'string' ? o.payment_intent : o.payment_intent?.id;
    if (pi) await db.markRefunded(pi, o.amount_refunded);
  }
}

/* ── HTTP ────────────────────────────────────────────────────────── */

/* deps: { stripe, webhookSecret, db } — stripe is null until a key is
   set, and the routes say so rather than failing obscurely. */
export async function handleCheckout(req, deps) {
  const url = new URL(req.url);
  const path = url.pathname.replace(/^.*\/lunara-checkout/, '') || '/';

  if (req.method === 'GET' && (path === '/' || path === '/health')) {
    return json({
      ok: true,
      configured: !!deps.stripe,
      mode: deps.stripe ? (deps.stripe.livemode ? 'live' : 'test') : null,
      webhook: !!deps.webhookSecret,
      products: Object.keys(CATALOG).length
    });
  }

  // The thank-you note on return checks the session rather than trusting
  // ?paid= in the address bar. It reveals the product and whether it was
  // paid, nothing about who paid.
  if (req.method === 'GET' && path === '/session') {
    const id = url.searchParams.get('id') || '';
    if (!deps.stripe || !/^cs_(test|live)_[A-Za-z0-9]+$/.test(id)) return json({ error: 'Not found.' }, 404);
    try {
      const s = await deps.stripe.get(`/v1/checkout/sessions/${id}`);
      const p = CATALOG[s.metadata?.lunara_product];
      return json({ paid: s.payment_status === 'paid', status: s.payment_status, product: p ? p.name : null });
    } catch (e) {
      if (e instanceof StripeError && e.status === 404) return json({ error: 'Not found.' }, 404);
      throw e;
    }
  }

  if (req.method !== 'POST') return json({ error: 'Not found.' }, 404);

  if (path === '/webhook') {
    if (!deps.webhookSecret) return json({ error: 'webhook not configured' }, 503);
    const raw = await req.text();
    if (!(await verifySignature(raw, req.headers.get('stripe-signature'), deps.webhookSecret))) {
      return json({ error: 'bad signature' }, 400);
    }
    const event = JSON.parse(raw);
    // Stripe retries; the first delivery of an event id wins.
    if (!(await deps.db.claimEvent(event.id, event.type))) return json({ received: true, duplicate: true });
    await handleEvent(event, deps.db);
    return json({ received: true });
  }

  if (path === '/checkout' || path === '/') {
    if (!deps.stripe) return json({ error: 'Card payments are not switched on yet.' }, 503);
    let body;
    try { body = await req.json(); } catch { return json({ error: 'Send JSON.' }, 400); }
    const product = typeof body.product === 'string' ? body.product : '';
    if (!Object.prototype.hasOwnProperty.call(CATALOG, product)) {
      return json({ error: 'That product cannot be bought here.' }, 400);
    }
    const session = await createSession(deps.stripe, product, body.return_to);
    return json({ url: session.url });
  }

  return json({ error: 'Not found.' }, 404);
}
