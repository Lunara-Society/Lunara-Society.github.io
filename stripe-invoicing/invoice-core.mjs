/* ═══════════════════════════════════════════════════════════════════
   LUNARA INVOICING — Stripe
   ═══════════════════════════════════════════════════════════════════

   All of the logic, as plain JavaScript over fetch and Web Crypto, so
   the test suite runs the same code the edge function serves. Storage
   and the Stripe key are injected.

   The shape follows Stripe's invoicing plan for a business that bills
   on an event of its own: the buyer asks, our code creates the invoice,
   Stripe's hosted invoice page takes the payment (cards, wallets, 3DS),
   and webhooks tell us what happened. Webhooks never create invoices.

   Amounts are never taken from the browser. The page names a product;
   the price is the Stripe Price under that product's lookup key, which
   sync-catalog.mjs writes from lunara-pricing.js. A product without
   metadata.invoiceable = "true" cannot be invoiced from the website,
   which is how invitational memberships and the Lens plans (paid
   through their own backend) are kept out.

   Invoices from the website are finalized but not emailed by Stripe.
   The buyer is sent straight to the hosted page instead. An endpoint
   that made Stripe email an invoice to any address typed into a form
   would be a way to send mail from this institution to anyone, and an
   institution that sells protection from AI spam cannot run one.
   Renewals, which go to known customers, are sent with send: true.
   ═══════════════════════════════════════════════════════════════════ */

export const STRIPE_API = 'https://api.stripe.com';
export const STRIPE_VERSION = '2026-08-26.dahlia';
export const DAYS_UNTIL_DUE = 14;
export const lookupKey = (id) => `lunara_${id}_usd`;

const LIMITS = { perEmailHour: 3, perIpHour: 6 };
const EMAIL = /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[a-z]{2,}$/i;
const COUNTRY = /^[A-Z]{2}$/;

export function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { 'content-type': 'application/json; charset=utf-8' }
  });
}

export function withCors(res, origin) {
  const ok = !origin || /^https:\/\/(www\.)?lunarasociety\.com$/.test(origin) ||
    /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  const h = new Headers(res.headers);
  h.set('access-control-allow-origin', ok && origin ? origin : 'https://lunarasociety.com');
  h.set('access-control-allow-headers', 'content-type');
  h.set('access-control-allow-methods', 'GET, POST, OPTIONS');
  h.set('vary', 'origin');
  return new Response(res.body, { status: res.status, headers: h });
}

export async function sha256hex(s) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(d), (x) => x.toString(16).padStart(2, '0')).join('');
}

/* ── Stripe client ───────────────────────────────────────────────── */

/* Form encoding with Stripe's bracket syntax: { a: { b: 1 }, c: [x] }
   becomes a[b]=1&c[0]=x. */
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
  async function call(method, path, params, idempotencyKey) {
    const headers = {
      authorization: `Bearer ${secretKey}`,
      'stripe-version': STRIPE_VERSION
    };
    let url = STRIPE_API + path, body;
    if (params && method === 'GET') url += '?' + formEncode(params).toString();
    else if (params) {
      body = formEncode(params).toString();
      headers['content-type'] = 'application/x-www-form-urlencoded';
    }
    if (idempotencyKey) headers['idempotency-key'] = idempotencyKey;
    const res = await fetchImpl(url, { method, headers, body });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new StripeError(res.status, data);
    return data;
  }
  return {
    livemode: secretKey.startsWith('sk_live_') || secretKey.startsWith('rk_live_'),
    get: (path, params) => call('GET', path, params),
    post: (path, params, key) => call('POST', path, params, key)
  };
}

/* ── Invoices ────────────────────────────────────────────────────── */

export async function priceFor(stripe, productId) {
  const list = await stripe.get('/v1/prices', {
    lookup_keys: [lookupKey(productId)], active: 'true', expand: ['data.product']
  });
  const price = list.data && list.data[0];
  if (!price || !price.product || price.product.active === false) return null;
  return price;
}

async function customerFor(stripe, { email, name, country, lunaraId }, idem) {
  const found = await stripe.get('/v1/customers', { email, limit: 1 });
  if (found.data && found.data[0]) return found.data[0];
  return stripe.post('/v1/customers', {
    email, name,
    address: country ? { country } : undefined,
    preferred_locales: ['en'],
    metadata: { source: 'lunarasociety.com', lunara_id: lunaraId }
  }, idem && `${idem}:customer`);
}

/* Creates, fills and finalizes one invoice for one catalogue product.
   Every POST carries an idempotency key derived from `idem`, so a retry
   after a dropped connection returns the same objects rather than a
   second invoice. */
export async function createInvoice(stripe, opts) {
  const { productId, email, name, country, taxId, send = false, source = 'website', idem } = opts;
  const price = await priceFor(stripe, productId);
  if (!price) return { error: 'unknown_product' };
  if (source === 'website' && price.product.metadata?.invoiceable !== 'true') {
    return { error: 'not_invoiceable' };
  }
  const customer = await customerFor(stripe, { email, name, country, lunaraId: opts.lunaraId }, idem);
  const terms = price.product.metadata?.terms;

  const custom_fields = [];
  if (taxId) custom_fields.push({ name: 'VAT / Company no.', value: taxId.slice(0, 140) });

  const invoice = await stripe.post('/v1/invoices', {
    customer: customer.id,
    currency: price.currency,
    collection_method: 'send_invoice',
    days_until_due: DAYS_UNTIL_DUE,
    auto_advance: send ? 'true' : 'false',
    pending_invoice_items_behavior: 'exclude',
    description: terms || undefined,
    custom_fields: custom_fields.length ? custom_fields : undefined,
    metadata: { lunara_product: productId, source }
  }, idem && `${idem}:invoice`);

  await stripe.post('/v1/invoiceitems', {
    customer: customer.id,
    invoice: invoice.id,
    pricing: { price: price.id },
    metadata: { lunara_product: productId }
  }, idem && `${idem}:item`);

  let final = await stripe.post(`/v1/invoices/${invoice.id}/finalize`,
    { auto_advance: send ? 'true' : 'false' }, idem && `${idem}:finalize`);
  if (send) final = await stripe.post(`/v1/invoices/${invoice.id}/send`, {}, idem && `${idem}:send`);

  return { invoice: final, customer, price };
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

/* Stripe-Signature: t=…,v1=…[,v1=…]. HMAC-SHA256 over `${t}.${raw}`
   with the endpoint secret; any v1 may match (secrets roll with an
   overlap). Five minutes of tolerance against replays. */
export async function verifySignature(raw, header, secret, nowSec = Math.floor(Date.now() / 1000), tolerance = 300) {
  if (!header || !secret) return false;
  const parts = header.split(',').map((p) => p.split('='));
  const t = Number((parts.find(([k]) => k === 't') || [])[1]);
  const sigs = parts.filter(([k]) => k === 'v1').map(([, v]) => v);
  if (!Number.isFinite(t) || !sigs.length || Math.abs(nowSec - t) > tolerance) return false;
  const expected = await hmacHex(secret, `${t}.${raw}`);
  return sigs.some((s) => timingSafeEqualHex(s, expected));
}

/* The events Stripe's plan names for webhook-driven records. */
export const EVENTS = [
  'invoice.finalized', 'invoice.paid', 'invoice.payment_failed',
  'invoice.voided', 'invoice.marked_uncollectible',
  'charge.refunded', 'credit_note.created'
];

function rowFromInvoice(inv) {
  return {
    invoice_id: inv.id,
    customer_id: typeof inv.customer === 'string' ? inv.customer : inv.customer?.id,
    email: inv.customer_email || null,
    product: inv.metadata?.lunara_product || null,
    number: inv.number || null,
    amount_due: inv.amount_due,
    amount_paid: inv.amount_paid,
    currency: inv.currency,
    status: inv.status,
    hosted_url: inv.hosted_invoice_url || null,
    livemode: !!inv.livemode
  };
}

async function handleEvent(event, deps) {
  const o = event.data?.object || {};
  switch (event.type) {
    case 'invoice.finalized':
    case 'invoice.voided':
    case 'invoice.marked_uncollectible':
      await deps.db.upsertInvoice(rowFromInvoice(o));
      break;
    case 'invoice.paid':
      await deps.db.upsertInvoice({ ...rowFromInvoice(o), paid_at: new Date((o.status_transitions?.paid_at || event.created) * 1000).toISOString() });
      break;
    case 'invoice.payment_failed':
      await deps.db.upsertInvoice({ ...rowFromInvoice(o), last_failure: `payment failed (attempt ${o.attempt_count || 1})` });
      break;
    case 'charge.refunded':
    case 'credit_note.created': {
      // A refund or credit note changes what was collected, so a paid row
      // must not be read as money in hand. Credit notes name their invoice;
      // a charge no longer does (since API 2025-03), so it is recorded by
      // its payment intent, which the invoice's payments list carries.
      const credit = event.type === 'credit_note.created';
      await deps.db.noteAdjustment({
        event_id: event.id,
        kind: event.type,
        invoice_id: credit ? o.invoice : null,
        payment_intent: credit ? null : (typeof o.payment_intent === 'string' ? o.payment_intent : o.payment_intent?.id) || null,
        amount: credit ? o.total : o.amount_refunded,
        currency: o.currency,
        livemode: !!event.livemode
      });
      break;
    }
  }
}

/* ── HTTP ────────────────────────────────────────────────────────── */

function clean(s, max) {
  return typeof s === 'string' ? s.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max) : '';
}

async function requestInvoice(req, deps) {
  let body;
  try { body = await req.json(); } catch { return json({ error: 'Send JSON.' }, 400); }
  // A field no person fills in. A form-filling bot usually does.
  if (body.website) return json({ error: 'That request could not be accepted.' }, 400);

  const productId = clean(body.product, 40);
  const email = clean(body.email, 254).toLowerCase();
  const name = clean(body.name, 200);
  const country = clean(body.country, 3).toUpperCase();
  const taxId = clean(body.tax_id, 140);
  if (!/^[a-z0-9_]+$/.test(productId)) return json({ error: 'Choose a product.' }, 400);
  if (!EMAIL.test(email)) return json({ error: 'Enter a valid email address.' }, 400);
  if (name.length < 2) return json({ error: 'Enter the name to put on the invoice.' }, 400);
  if (!COUNTRY.test(country)) return json({ error: 'Choose a country.' }, 400);

  const ipHash = await sha256hex('lunara-invoice:' + (deps.ip || ''));
  const livemode = deps.stripe.livemode;

  // The same person asking twice for the same thing gets the same invoice.
  const open = await deps.db.openInvoice(email, productId, livemode);
  if (open && open.hosted_url) {
    return json({ url: open.hosted_url, number: open.number, reused: true });
  }

  const recent = await deps.db.recentRequests(email, ipHash, new Date(Date.now() - 3600e3).toISOString());
  if (recent.email >= LIMITS.perEmailHour || recent.ip >= LIMITS.perIpHour) {
    return json({ error: 'Too many invoice requests. Try again in an hour, or write to lunarasociety@gmail.com.' }, 429);
  }

  const idem = 'web:' + (await sha256hex([email, productId, livemode, deps.nonce || crypto.randomUUID()].join('|'))).slice(0, 40);
  const made = await createInvoice(deps.stripe, { productId, email, name, country, taxId, idem, source: 'website' });
  if (made.error) return json({ error: 'That product cannot be invoiced from the website.' }, 400);

  await deps.db.upsertInvoice({ ...rowFromInvoice(made.invoice), email, ip_hash: ipHash });
  return json({ url: made.invoice.hosted_invoice_url, number: made.invoice.number });
}

async function webhook(req, deps) {
  const raw = await req.text();
  const ok = await verifySignature(raw, req.headers.get('stripe-signature'), deps.webhookSecret);
  if (!ok) return json({ error: 'bad signature' }, 400);
  const event = JSON.parse(raw);
  // Stripe retries and may deliver twice; the first delivery wins.
  if (!(await deps.db.claimEvent(event.id, event.type))) return json({ received: true, duplicate: true });
  await handleEvent(event, deps);
  return json({ received: true });
}

/* deps: { stripe, webhookSecret, db, ip, nonce } — stripe may be null
   when no key is configured, and every route then says so plainly. */
export async function handleInvoicing(req, deps) {
  const path = new URL(req.url).pathname.replace(/^.*\/lunara-invoice/, '') || '/';
  if (req.method === 'GET' && (path === '/' || path === '/health')) {
    return json({ ok: true, configured: !!deps.stripe, mode: deps.stripe ? (deps.stripe.livemode ? 'live' : 'test') : null, webhook: !!deps.webhookSecret });
  }
  if (req.method !== 'POST') return json({ error: 'Not found.' }, 404);
  if (path === '/webhook') {
    if (!deps.webhookSecret) return json({ error: 'webhook not configured' }, 503);
    return webhook(req, deps);
  }
  if (path === '/request' || path === '/') {
    if (!deps.stripe) return json({ error: 'Invoicing is not switched on yet. Write to lunarasociety@gmail.com.' }, 503);
    return requestInvoice(req, deps);
  }
  return json({ error: 'Not found.' }, 404);
}
