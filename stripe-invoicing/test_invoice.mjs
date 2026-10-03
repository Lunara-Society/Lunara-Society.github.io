/* node stripe-invoicing/test_invoice.mjs — runs in CI, needs no network.
   Stripe is replaced by a fake that answers the handful of endpoints the
   invoicing code calls; sandbox-check.mjs exercises the real one. */

import { createHmac } from 'node:crypto';
import { handleInvoicing, stripeClient, verifySignature, formEncode, lookupKey } from './invoice-core.mjs';
import { memoryDb } from './memory-db.mjs';
import { loadCatalog, invoiceable } from './sync-catalog.mjs';

let failed = 0, passed = 0;
async function test(name, fn) {
  try { await fn(); passed++; } catch (e) { failed++; console.error('FAIL', name, '\n    ', e.message); }
}
function eq(a, b, msg) { if (a !== b) throw new Error(`${msg || ''} expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); }
function ok(c, msg) { if (!c) throw new Error(msg || 'not ok'); }

/* ── A fake Stripe ───────────────────────────────────────────────── */
function fakeStripe() {
  const calls = [];
  const products = {
    lunara_shield: { id: 'lunara_shield', active: true, metadata: { invoiceable: 'true', terms: 'Six months.' } },
    lunara_member6: { id: 'lunara_member6', active: true, metadata: { invoiceable: 'false' } }
  };
  const prices = {
    [lookupKey('shield')]: { id: 'price_shield', unit_amount: 7500, currency: 'usd', product: 'lunara_shield' },
    [lookupKey('member6')]: { id: 'price_m6', unit_amount: 15000, currency: 'usd', product: 'lunara_member6' }
  };
  const customers = [], invoices = {};
  const idem = new Map();
  let n = 0;
  const fetchImpl = async (url, init) => {
    const u = new URL(url);
    const params = init.body ? new URLSearchParams(init.body) : u.searchParams;
    calls.push({ method: init.method, path: u.pathname, params, headers: init.headers });
    const key = init.headers['idempotency-key'];
    if (key && idem.has(key)) return new Response(idem.get(key));
    const reply = (obj, status = 200) => {
      const body = JSON.stringify(obj);
      if (key && status === 200) idem.set(key, body);
      return new Response(body, { status });
    };
    const p = u.pathname;
    if (p === '/v1/prices') {
      const pr = prices[params.get('lookup_keys[0]')];
      return reply({ data: pr ? [{ ...pr, product: products[pr.product] }] : [] });
    }
    if (p === '/v1/customers' && init.method === 'GET') return reply({ data: customers.filter((c) => c.email === params.get('email')) });
    if (p === '/v1/customers') {
      const c = { id: 'cus_' + (++n), email: params.get('email'), name: params.get('name') };
      customers.push(c); return reply(c);
    }
    if (p === '/v1/invoices') {
      const inv = { id: 'in_' + (++n), customer: params.get('customer'), customer_email: null, status: 'draft', currency: params.get('currency'),
        amount_due: 0, amount_paid: 0, livemode: false, metadata: { lunara_product: params.get('metadata[lunara_product]') }, params };
      invoices[inv.id] = inv; return reply(inv);
    }
    if (p === '/v1/invoiceitems') {
      const inv = invoices[params.get('invoice')];
      const pr = Object.values(prices).find((x) => x.id === params.get('pricing[price]'));
      inv.amount_due += pr.unit_amount; return reply({ id: 'ii_' + (++n) });
    }
    const fin = p.match(/^\/v1\/invoices\/(in_\d+)\/(finalize|send)$/);
    if (fin) {
      const inv = invoices[fin[1]];
      Object.assign(inv, { status: 'open', number: 'LUNA-' + inv.id, hosted_invoice_url: 'https://invoice.stripe.com/i/' + inv.id });
      if (fin[2] === 'send') inv.sent = true;
      return reply(inv);
    }
    return reply({ error: { message: 'no route ' + p } }, 404);
  };
  return { fetchImpl, calls, invoices, customers };
}

function setup(over = {}) {
  const fake = fakeStripe();
  const deps = { stripe: stripeClient('sk_test_x', fake.fetchImpl), db: memoryDb(), webhookSecret: 'whsec_t', ip: '198.51.100.1', ...over };
  return { fake, deps };
}
const post = (deps, path, body, headers = {}) =>
  handleInvoicing(new Request('https://p.supabase.co/functions/v1/lunara-invoice' + path, {
    method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body), headers
  }), deps).then(async (r) => ({ status: r.status, body: await r.json() }));
const order = { product: 'shield', email: 'Buyer@Example.com', name: 'Example AB', country: 'se' };

/* ── Requests ────────────────────────────────────────────────────── */

await test('a request creates a finalized invoice at the catalogue price', async () => {
  const { fake, deps } = setup();
  const r = await post(deps, '/request', order);
  eq(r.status, 200);
  ok(r.body.url.startsWith('https://invoice.stripe.com/'), 'hosted url');
  const inv = Object.values(fake.invoices)[0];
  eq(inv.amount_due, 7500, 'amount');
  eq(inv.status, 'open');
  eq(inv.params.get('collection_method'), 'send_invoice');
  eq(inv.params.get('auto_advance'), 'false', 'website invoices are not auto-advanced');
  eq(fake.customers[0].email, 'buyer@example.com', 'email lower-cased');
});

await test('a website invoice is never emailed by Stripe', async () => {
  const { fake, deps } = setup();
  await post(deps, '/request', order);
  ok(!fake.calls.some((c) => c.path.endsWith('/send')), 'no /send call');
  ok(!Object.values(fake.invoices)[0].sent);
});

await test('an amount sent by the browser is ignored', async () => {
  const { fake, deps } = setup();
  await post(deps, '/request', { ...order, amount: 1, price: 'price_cheap', unit_amount: 1 });
  eq(Object.values(fake.invoices)[0].amount_due, 7500);
});

await test('asking twice returns the same open invoice', async () => {
  const { fake, deps } = setup();
  const a = await post(deps, '/request', order);
  const b = await post(deps, '/request', order);
  eq(b.body.url, a.body.url); ok(b.body.reused);
  eq(Object.keys(fake.invoices).length, 1);
});

await test('every Stripe write carries an idempotency key', async () => {
  const { fake, deps } = setup();
  await post(deps, '/request', order);
  const writes = fake.calls.filter((c) => c.method === 'POST');
  ok(writes.length >= 4);
  ok(writes.every((c) => c.headers['idempotency-key']), 'missing key');
  ok(writes.every((c) => c.headers['stripe-version']), 'missing version');
});

await test('an invitational product is refused', async () => {
  const { fake, deps } = setup();
  const r = await post(deps, '/request', { ...order, product: 'member6' });
  eq(r.status, 400); eq(Object.keys(fake.invoices).length, 0);
});

await test('an unknown product is refused', async () => {
  const { deps } = setup();
  eq((await post(deps, '/request', { ...order, product: 'nothing' })).status, 400);
  eq((await post(deps, '/request', { ...order, product: '../v1/charges' })).status, 400);
});

await test('bad input is refused before Stripe is called', async () => {
  const { fake, deps } = setup();
  for (const bad of [{ email: 'nope' }, { name: '' }, { country: 'Sweden' }, { country: '' }]) {
    eq((await post(deps, '/request', { ...order, ...bad })).status, 400, JSON.stringify(bad));
  }
  eq((await post(deps, '/request', '{not json')).status, 400);
  eq(fake.calls.length, 0);
});

await test('the honeypot field refuses the request', async () => {
  const { fake, deps } = setup();
  eq((await post(deps, '/request', { ...order, website: 'http://spam' })).status, 400);
  eq(fake.calls.length, 0);
});

await test('a VAT number is printed on the invoice', async () => {
  const { fake, deps } = setup();
  await post(deps, '/request', { ...order, tax_id: 'SE556677889901' });
  eq(Object.values(fake.invoices)[0].params.get('custom_fields[0][value]'), 'SE556677889901');
});

await test('requests from one address are limited', async () => {
  const { deps } = setup();
  const codes = [];
  for (let i = 0; i < 8; i++) {
    const r = await post(deps, '/request', { ...order, email: `b${i}@example.com` });
    codes.push(r.status);
  }
  eq(codes.filter((c) => c === 200).length, 6);
  eq(codes[7], 429);
});

await test('without a key every route says so', async () => {
  const { deps } = setup({ stripe: null });
  eq((await post(deps, '/request', order)).status, 503);
  const h = await handleInvoicing(new Request('https://p/functions/v1/lunara-invoice/health'), deps).then((r) => r.json());
  eq(h.configured, false);
});

await test('health reports test mode without revealing the key', async () => {
  const { deps } = setup();
  const r = await handleInvoicing(new Request('https://p/functions/v1/lunara-invoice/health'), deps);
  const text = await r.text();
  ok(!text.includes('sk_test'), 'key leaked');
  eq(JSON.parse(text).mode, 'test');
});

/* ── Webhooks ────────────────────────────────────────────────────── */

const sign = (raw, secret = 'whsec_t', t = Math.floor(Date.now() / 1000)) =>
  `t=${t},v1=${createHmac('sha256', secret).update(`${t}.${raw}`).digest('hex')}`;
const paidEvent = (id = 'evt_1') => JSON.stringify({ id, type: 'invoice.paid', created: 1790000000, livemode: false, data: { object: {
  id: 'in_9', customer: 'cus_9', customer_email: 'b@example.com', status: 'paid', amount_due: 7500, amount_paid: 7500,
  currency: 'usd', number: 'LUNA-1', metadata: { lunara_product: 'shield' }, status_transitions: { paid_at: 1790000100 }, livemode: false } } });

await test('a signed invoice.paid is recorded', async () => {
  const { deps } = setup();
  const raw = paidEvent();
  const r = await post(deps, '/webhook', raw, { 'stripe-signature': sign(raw) });
  eq(r.status, 200);
  const row = deps.db.invoices.get('in_9');
  eq(row.status, 'paid'); eq(row.product, 'shield'); ok(row.paid_at);
});

await test('a delivered-twice event is handled once', async () => {
  const { deps } = setup();
  const raw = paidEvent('evt_dup');
  await post(deps, '/webhook', raw, { 'stripe-signature': sign(raw) });
  const r = await post(deps, '/webhook', raw, { 'stripe-signature': sign(raw) });
  ok(r.body.duplicate);
});

await test('forged, stale and unsigned webhooks are rejected', async () => {
  const { deps } = setup();
  const raw = paidEvent();
  eq((await post(deps, '/webhook', raw, { 'stripe-signature': sign(raw, 'whsec_wrong') })).status, 400);
  eq((await post(deps, '/webhook', raw, { 'stripe-signature': sign(raw, 'whsec_t', Math.floor(Date.now() / 1000) - 3600) })).status, 400);
  eq((await post(deps, '/webhook', raw)).status, 400);
  eq((await post(deps, '/webhook', raw.replace('7500', '1'), { 'stripe-signature': sign(raw) })).status, 400, 'tampered body');
  eq(deps.db.invoices.size, 0);
});

await test('any one of several v1 signatures may match', async () => {
  const raw = '{"a":1}', t = Math.floor(Date.now() / 1000);
  const good = sign(raw, 's', t).split('v1=')[1];
  ok(await verifySignature(raw, `t=${t},v1=${'f'.repeat(64)},v1=${good}`, 's'));
});

await test('a credit note is recorded against its invoice', async () => {
  const { deps } = setup();
  const raw = JSON.stringify({ id: 'evt_cn', type: 'credit_note.created', livemode: false, data: { object: { invoice: 'in_9', total: 2500, currency: 'usd' } } });
  await post(deps, '/webhook', raw, { 'stripe-signature': sign(raw) });
  eq(deps.db.adjustments[0].invoice_id, 'in_9'); eq(deps.db.adjustments[0].amount, 2500);
});

await test('without a webhook secret the webhook route refuses', async () => {
  const { deps } = setup({ webhookSecret: '' });
  const raw = paidEvent();
  eq((await post(deps, '/webhook', raw, { 'stripe-signature': sign(raw) })).status, 503);
});

/* ── Plumbing ────────────────────────────────────────────────────── */

await test('form encoding uses Stripe brackets', async () => {
  eq(formEncode({ a: { b: 1 }, c: ['x', 'y'], d: [{ e: 2 }], z: undefined }).toString(),
    'a%5Bb%5D=1&c%5B0%5D=x&c%5B1%5D=y&d%5B0%5D%5Be%5D=2');
});

await test('the catalogue loads and only public products are invoiceable', async () => {
  const cat = loadCatalog();
  ok(cat.length > 10);
  const pub = cat.filter(invoiceable).map((p) => p.id);
  ok(pub.includes('shield') && pub.includes('vendor'));
  ok(!pub.includes('member6') && !pub.includes('member12'), 'invitational leaked');
  ok(!pub.some((id) => id.startsWith('lens')), 'lens plan leaked');
});

await test('a live key is recognised as live', async () => {
  ok(stripeClient('sk_live_x').livemode); ok(!stripeClient('sk_test_x').livemode);
});

console.log(`${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
