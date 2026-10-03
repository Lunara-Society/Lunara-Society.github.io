/* ═══════════════════════════════════════════════════════════════════
   LUNARA CHECKOUT — Stripe
   ═══════════════════════════════════════════════════════════════════

   A buy button asks for a Stripe Checkout Session for one product and
   the buyer pays on Stripe's page: card, Apple Pay, Google Pay, from
   any country. Stripe emails the receipt.

   What the buyer gets is decided here, from catalog.mjs, which is
   generated from lunara-pricing.js:

   · The amount is the catalogue's. Nothing the browser sends can change
     it, and an order is only ever called paid when Stripe's session
     shows that exact amount, in dollars, for that product.
   · How the product is delivered is shown on Stripe's page before the
     buyer pays, and again on paid.html afterwards, in the same words.
   · Every session carries an order reference minted here and recorded
     before the buyer reaches Stripe. paid.html and the delivery pages
     (the kit, the report) open with that reference and ask this
     function, which asks Stripe. A guessed or edited address opens
     nothing.

   All of the logic is plain JavaScript over fetch and Web Crypto, so
   the tests run the code the edge function serves.
   ═══════════════════════════════════════════════════════════════════ */

import { CATALOG } from './catalog.mjs';

/* ── The owner's private package ──────────────────────────────────────
   Everything Lunara Society does, for one business, at $1: the owner's
   live payment test, and how the owner's own businesses are certified.
   It is not in lunara-pricing.js, so no page lists it and the public
   catalogue cannot sell it. /checkout sells it only to a request that
   carries a lunara-auth session whose email is an owner's (checked by
   lunara-auth, which verifies the session's signature), and Stripe's
   page is locked to that email. Anyone else is told the product does
   not exist, in the same words as any unknown product. */
export const OWNER_ONLY = {
  owner_complete: {
    name: 'Lunara Society Complete (owner)',
    cents: 100,
    terms: 'Owner only. Every Lunara Society service, for one business.',
    delivery: [
      'The Compliance Kit and the Compliance Intelligence Report open at once: use the buttons on the confirmation page.',
      'Shield Verification and AI Entity Verification: within 24 hours, your verification reference and the DNS record that proves you control the domain; register entries go live when review passes.',
      'Vendor Certification for up to three systems, the Article 50 Evidence Pack and Disclosure Pack, and a governance session: scheduled within one working day.',
      'Regulatory Watch for twelve months: we write whenever something that binds the business changes, and only then.',
      'Nothing renews or is charged automatically.'
    ],
    access: [
      ['kit-access.html', 'Open the Compliance Kit'],
      ['compliance-report-access.html', 'Open the Compliance Intelligence Report']
    ],
    ask: ['website', 'legal', 'system'],
    defaults: { website: 'https://yavaya.lat' }
  }
};

/* The catalogue entry for a product: the public one, or the owner's. */
export const productFor = (id) =>
  Object.prototype.hasOwnProperty.call(CATALOG, id) ? CATALOG[id]
    : Object.prototype.hasOwnProperty.call(OWNER_ONLY, id) ? OWNER_ONLY[id] : null;

export function isOwner(email, env) {
  const list = String((env && env.LUNARA_OWNER_EMAILS) || 'lunarasociety@gmail.com')
    .toLowerCase().split(/[,\s]+/).filter(Boolean);
  return !!email && list.includes(String(email).toLowerCase());
}

/* Pages a paid order opens, as [{ href, label }]. */
function accessLinks(p, ref) {
  if (!p.access) return [];
  const list = Array.isArray(p.access) ? p.access : [[p.access, 'Open it now']];
  return list.map(([page, label]) => ({ href: `${page}?order=${ref}`, label }));
}

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

const ORDER_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export const ORDER_RE = /^LO-[0-9A-HJKMNP-TV-Z]{16}$/;

/* About 80 bits: unguessable, and still short enough to read out over
   the phone. Crockford's alphabet, as Lunara IDs are. */
export function newOrderRef() {
  const b = crypto.getRandomValues(new Uint8Array(16));
  return 'LO-' + Array.from(b, (x) => ORDER_ALPHABET[x % 32]).join('');
}

/* What checkout asks for, so the work can start without a round of
   email. Labels are Stripe's 50-character maximum or less. */
const ASK = {
  website: { key: 'website', label: 'Company website', optional: false },
  legal:   { key: 'legalname', label: 'Registered business name', optional: false },
  system:  { key: 'aisystem', label: 'AI system or product name', optional: true }
};

export async function createSession(stripe, productId, returnTo, order, lockEmail) {
  const p = productFor(productId);
  if (!p) return null;
  const how = p.delivery.join(' ');
  return stripe.post('/v1/checkout/sessions', {
    mode: 'payment',
    client_reference_id: order,
    customer_email: lockEmail || undefined,
    line_items: [{
      quantity: 1,
      price_data: {
        currency: 'usd',
        unit_amount: p.cents,
        product_data: { name: p.name, description: p.terms, metadata: { lunara_product: productId } }
      }
    }],
    success_url: `${SITE}paid.html?order=${order}`,
    cancel_url: returnUrl(returnTo),
    billing_address_collection: 'auto',
    tax_id_collection: { enabled: 'true' },
    custom_fields: p.ask.length ? p.ask.map((k) => ({
      key: ASK[k].key,
      label: { type: 'custom', custom: ASK[k].label },
      type: 'text',
      text: p.defaults && p.defaults[k] ? { default_value: p.defaults[k] } : undefined,
      optional: ASK[k].optional ? 'true' : 'false'
    })) : undefined,
    custom_text: { submit: { message: ('How you receive it: ' + how).slice(0, 1200) } },
    metadata: { lunara_product: productId, order },
    payment_intent_data: {
      description: `${p.name} (order ${order})`,
      metadata: { lunara_product: productId, order }
    }
  });
}

/* Is this session a completed payment of exactly this product, at
   exactly the catalogue price? Anything else is not paid. */
export function verdict(session, order) {
  const p = productFor(order.product);
  if (!p || !session) return 'unknown';
  if (session.metadata?.order !== order.order_ref || session.metadata?.lunara_product !== order.product) return 'mismatch';
  if (session.payment_status !== 'paid') return session.status === 'expired' ? 'expired' : 'unpaid';
  if (session.amount_total !== p.cents || session.currency !== 'usd') return 'mismatch';
  return 'paid';
}

function mask(email) {
  if (!email || !email.includes('@')) return null;
  const [u, d] = email.split('@');
  return (u.length <= 2 ? u[0] + '*' : u[0] + '***' + u[u.length - 1]) + '@' + d;
}

function fieldsOf(session) {
  const out = {};
  for (const f of session.custom_fields || []) out[f.key] = f.text?.value || null;
  return out;
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

function paidPatch(s) {
  return {
    status: 'paid',
    email: s.customer_details?.email || null,
    name: s.customer_details?.name || null,
    country: s.customer_details?.address?.country || null,
    details: fieldsOf(s),
    payment_intent: typeof s.payment_intent === 'string' ? s.payment_intent : s.payment_intent?.id || null,
    paid_at: new Date().toISOString()
  };
}

/* Records a verified payment once. The row was written before the buyer
   left for Stripe, so this only ever fills it in. */
async function settle(order, session, db) {
  const v = verdict(session, order);
  if (v === 'paid' && order.status !== 'paid') await db.updateOrder(order.order_ref, paidPatch(session));
  else if (v !== 'paid' && v !== order.status && v !== 'unpaid') await db.updateOrder(order.order_ref, { status: v });
  return v;
}

async function handleEvent(event, deps) {
  const o = event.data?.object || {};
  if (event.type.startsWith('checkout.session.')) {
    const order = o.metadata?.order && await deps.db.getOrder(o.metadata.order);
    if (order) await settle(order, o, deps.db);
  } else if (event.type === 'charge.refunded') {
    const pi = typeof o.payment_intent === 'string' ? o.payment_intent : o.payment_intent?.id;
    if (pi) await deps.db.markRefunded(pi, o.amount_refunded);
  }
}

/* ── HTTP ────────────────────────────────────────────────────────── */

let lastSweep = 0;

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

  /* paid.html and the delivery pages ask about an order here. The answer
     comes from Stripe, not from the address bar. It names the product,
     the amount, how it is delivered and a masked email so the buyer
     knows where to look, and nothing else about who paid. */
  if (req.method === 'GET' && path === '/order') {
    const ref = (url.searchParams.get('ref') || '').toUpperCase();
    if (!deps.stripe || !ORDER_RE.test(ref)) return json({ error: 'Not found.' }, 404);
    const order = await deps.db.getOrder(ref);
    if (!order) return json({ error: 'Not found.' }, 404);
    const session = await deps.stripe.get(`/v1/checkout/sessions/${order.session_id}`);
    const status = await settle(order, session, deps.db);
    const p = productFor(order.product);
    const paid = status === 'paid';
    const links = paid ? accessLinks(p, ref) : [];
    return json({
      ref,
      status,
      paid,
      product: order.product,
      name: p.name,
      amount: p.cents / 100,
      currency: 'usd',
      terms: p.terms,
      delivery: p.delivery,
      access: links.length ? links[0].href : null,
      links,
      email: paid ? mask(session.customer_details?.email) : null
    });
  }

  /* A buyer who pays and closes the tab never reaches paid.html, so
     their order would sit at "open" though Stripe holds the money. This
     sweep asks Stripe about recent open orders and settles them. It is
     run every hour by .github/workflows/settle-orders.yml; it only reads
     from Stripe and only ever records what Stripe confirms, so anyone
     calling it can do no more than make it check sooner. */
  if (req.method === 'GET' && path === '/settle') {
    if (!deps.stripe) return json({ error: 'Not configured.' }, 503);
    const now = deps.now ? deps.now() : Date.now();
    if (now - lastSweep < 30e3) return json({ ok: true, skipped: true });
    lastSweep = now;
    const since = new Date(now - 3 * 86400e3).toISOString();
    const open = (await deps.db.openOrders(since)) || [];
    let paid = 0;
    for (const order of open) {
      const session = await deps.stripe.get(`/v1/checkout/sessions/${order.session_id}`);
      if ((await settle(order, session, deps.db)) === 'paid') paid++;
    }
    return json({ ok: true, checked: open.length, paid });
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
    await handleEvent(event, deps);
    return json({ received: true });
  }

  if (path === '/checkout' || path === '/') {
    if (!deps.stripe) return json({ error: 'Card payments are not switched on yet.' }, 503);
    let body;
    try { body = await req.json(); } catch { return json({ error: 'Send JSON.' }, 400); }
    const product = typeof body.product === 'string' ? body.product : '';
    const refuse = () => json({ error: 'That product cannot be bought here.' }, 400);
    let lockEmail = null;
    if (Object.prototype.hasOwnProperty.call(OWNER_ONLY, product)) {
      const who = deps.whoIs ? await deps.whoIs(body.session_token) : null;
      if (!who || !isOwner(who.email, deps.env)) return refuse();
      lockEmail = String(who.email).toLowerCase();
    } else if (!Object.prototype.hasOwnProperty.call(CATALOG, product)) {
      return refuse();
    }
    const order = newOrderRef();
    const session = await createSession(deps.stripe, product, body.return_to, order, lockEmail);
    // Recorded before the buyer leaves, so a payment can never arrive for
    // an order this side has not heard of. If this fails, no checkout.
    await deps.db.createOrder({
      order_ref: order,
      session_id: session.id,
      product,
      amount_total: productFor(product).cents,
      currency: 'usd',
      status: 'open',
      livemode: !!session.livemode
    });
    return json({ url: session.url, order });
  }

  return json({ error: 'Not found.' }, 404);
}
