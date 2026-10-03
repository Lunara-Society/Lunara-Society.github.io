/* node stripe-checkout/test_checkout.mjs — runs in CI, needs no network. */

import { createHmac } from 'node:crypto';
import { handleCheckout, stripeClient, returnUrl, formEncode } from './checkout-core.mjs';
import { CATALOG } from './catalog.mjs';
import { loadPricing, catalogFrom, sellable } from './build-catalog.mjs';

let failed = 0, passed = 0;
async function test(name, fn) {
  try { await fn(); passed++; } catch (e) { failed++; console.error('FAIL', name, '\n    ', e.message); }
}
function eq(a, b, msg) { if (a !== b) throw new Error(`${msg || ''} expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); }
function ok(c, msg) { if (!c) throw new Error(msg || 'not ok'); }

function fakeStripe() {
  const calls = [], sessions = {};
  let n = 0;
  const fetchImpl = async (url, init) => {
    const u = new URL(url);
    const params = init.body ? new URLSearchParams(init.body) : u.searchParams;
    calls.push({ method: init.method, path: u.pathname, params, headers: init.headers });
    if (u.pathname === '/v1/checkout/sessions' && init.method === 'POST') {
      const id = 'cs_test_' + (++n);
      sessions[id] = {
        id, url: 'https://checkout.stripe.com/c/pay/' + id, livemode: false, status: 'open', payment_status: 'unpaid',
        amount_total: Number(params.get('line_items[0][price_data][unit_amount]')), currency: params.get('line_items[0][price_data][currency]'),
        metadata: { order: params.get('metadata[order]'), lunara_product: params.get('metadata[lunara_product]') }
      };
      return new Response(JSON.stringify(sessions[id]));
    }
    const m = u.pathname.match(/^\/v1\/checkout\/sessions\/(cs_test_\d+)$/);
    if (m && sessions[m[1]]) return new Response(JSON.stringify(sessions[m[1]]));
    return new Response(JSON.stringify({ error: { message: 'No such checkout session' } }), { status: 404 });
  };
  // What Stripe does when the buyer completes the page.
  const pay = (id, extra = {}) => Object.assign(sessions[id], {
    status: 'complete', payment_status: 'paid', payment_intent: 'pi_' + id,
    customer_details: { email: 'buyer@example.com', name: 'B AB', address: { country: 'SE' } },
    custom_fields: [{ key: 'website', text: { value: 'https://example.com' } }]
  }, extra);
  return { stripe: stripeClient('sk_test_x', fetchImpl), calls, sessions, pay };
}
function memoryDb() {
  const orders = new Map(), events = new Set();
  return {
    orders,
    async createOrder(row) { if (orders.has(row.order_ref)) throw new Error('dup'); orders.set(row.order_ref, { ...row }); },
    async openOrders() { return [...orders.values()].filter((o) => o.status === 'open').map((o) => ({ ...o })); },
    async getOrder(ref) { const o = orders.get(ref); return o ? { ...o } : null; },
    async updateOrder(ref, patch) { Object.assign(orders.get(ref), patch); },
    async markRefunded(pi, amount) { for (const o of orders.values()) if (o.payment_intent === pi) o.refunded_amount = amount; },
    async claimEvent(id) { if (events.has(id)) return false; events.add(id); return true; }
  };
}
const call = (deps, path, init = {}) =>
  handleCheckout(new Request('https://p.supabase.co/functions/v1/lunara-checkout' + path, init), deps)
    .then(async (r) => ({ status: r.status, body: await r.json() }));
const buy = (deps, body) => call(deps, '/checkout', { method: 'POST', body: JSON.stringify(body) });

await test('the catalogue matches lunara-pricing.js (run build-catalog.mjs if not)', async () => {
  eq(JSON.stringify(CATALOG), JSON.stringify(catalogFrom(loadPricing())));
});

await test('only public products are sellable', async () => {
  const ids = Object.keys(CATALOG);
  ok(ids.includes('shield') && ids.includes('vendor'));
  ok(!ids.includes('member6') && !ids.includes('member12'), 'invitational product sellable');
  ok(!ids.some((id) => id.startsWith('lens')), 'Lens plan sellable');
  ok(loadPricing().filter((p) => !sellable(p)).length >= 2);
});

function setup() { const f = fakeStripe(); const db = memoryDb(); return { ...f, db, deps: { stripe: f.stripe, db } }; }
const order = (deps, ref) => call(deps, '/order?ref=' + ref);

await test('a buy records an order and opens Stripe at the catalogue price', async () => {
  const { deps, calls, db } = setup();
  const r = await buy(deps, { product: 'shield', return_to: 'https://lunarasociety.com/certify.html' });
  eq(r.status, 200);
  ok(/^LO-[0-9A-Z]{16}$/.test(r.body.order), 'order ref');
  ok(r.body.url.startsWith('https://checkout.stripe.com/'));
  const p = calls[0].params;
  eq(p.get('mode'), 'payment');
  eq(p.get('line_items[0][price_data][unit_amount]'), '7500');
  eq(p.get('line_items[0][price_data][currency]'), 'usd');
  eq(p.get('metadata[order]'), r.body.order);
  eq(p.get('client_reference_id'), r.body.order);
  eq(p.get('success_url'), 'https://lunarasociety.com/paid.html?order=' + r.body.order);
  eq(p.get('cancel_url'), 'https://lunarasociety.com/certify.html');
  ok(p.get('custom_text[submit][message]').startsWith('How you receive it: '), 'delivery shown before paying');
  eq(p.get('custom_fields[0][key]'), 'website');
  const row = db.orders.get(r.body.order);
  eq(row.status, 'open'); eq(row.product, 'shield'); eq(row.amount_total, 7500); eq(row.session_id, 'cs_test_1');
});

await test('an amount sent by the browser is ignored', async () => {
  const { deps, calls } = setup();
  await buy(deps, { product: 'vendor', amount: 1, unit_amount: 1, price: 1 });
  eq(calls[0].params.get('line_items[0][price_data][unit_amount]'), '740000');
});

await test('every sellable product says how it is delivered', async () => {
  for (const [id, p] of Object.entries(CATALOG)) ok(p.delivery.length >= 2, id + ' has no delivery steps');
});

await test('no checkout is opened if the order cannot be recorded', async () => {
  const { deps } = setup();
  deps.db.createOrder = async () => { throw new Error('db down'); };
  let threw = false;
  try { await buy(deps, { product: 'kit' }); } catch { threw = true; }
  ok(threw, 'must not return a checkout url');
});

await test('unknown, invitational and Lens products are refused before Stripe', async () => {
  const { deps, calls } = setup();
  for (const product of ['member6', 'lens_pro', 'nothing', '__proto__', 'constructor', '', 42]) {
    eq((await buy(deps, { product })).status, 400, String(product));
  }
  eq((await call(deps, '/checkout', { method: 'POST', body: '{bad' })).status, 400);
  eq(calls.length, 0);
});

await test('an unpaid order is not paid and opens nothing', async () => {
  const { deps } = setup();
  const r = await buy(deps, { product: 'kit' });
  const o = await order(deps, r.body.order);
  eq(o.body.paid, false); eq(o.body.status, 'unpaid'); eq(o.body.access, null); eq(o.body.email, null);
  ok(o.body.delivery.length > 0, 'still says what would be delivered');
});

await test('a paid order is recorded once and opens its delivery', async () => {
  const { deps, pay, db } = setup();
  const r = await buy(deps, { product: 'kit' });
  pay('cs_test_1');
  const o = await order(deps, r.body.order);
  eq(o.body.paid, true); eq(o.body.name, 'Compliance Kit'); eq(o.body.amount, 95);
  eq(o.body.access, 'kit-access.html?order=' + r.body.order);
  eq(o.body.email, 'b***r@example.com');
  const row = db.orders.get(r.body.order);
  eq(row.status, 'paid'); eq(row.email, 'buyer@example.com'); eq(row.details.website, 'https://example.com'); ok(row.paid_at);
  const first = row.paid_at;
  await order(deps, r.body.order);
  eq(db.orders.get(r.body.order).paid_at, first, 'not re-recorded');
});

await test('a payment of the wrong amount is never called paid', async () => {
  const { deps, pay, db } = setup();
  const r = await buy(deps, { product: 'vendor' });
  pay('cs_test_1', { amount_total: 100 });
  const o = await order(deps, r.body.order);
  eq(o.body.paid, false); eq(o.body.status, 'mismatch'); eq(o.body.access, null);
  eq(db.orders.get(r.body.order).status, 'mismatch');
});

await test('a session for another product or order is never called paid', async () => {
  const { deps, pay, sessions } = setup();
  const r = await buy(deps, { product: 'kit' });
  pay('cs_test_1');
  sessions.cs_test_1.metadata.lunara_product = 'vendor';
  eq((await order(deps, r.body.order)).body.status, 'mismatch');
  sessions.cs_test_1.metadata = { lunara_product: 'kit', order: 'LO-0000000000000000' };
  eq((await order(deps, r.body.order)).body.status, 'mismatch');
});

await test('the hourly sweep settles a paid order whose buyer never came back', async () => {
  const { deps, pay, db } = setup();
  const a = await buy(deps, { product: 'shield' });
  const b = await buy(deps, { product: 'kit' });
  pay('cs_test_1');
  let t = 1e12; deps.now = () => t;
  let r = await call(deps, '/settle');
  eq(r.body.checked, 2); eq(r.body.paid, 1);
  eq(db.orders.get(a.body.order).status, 'paid'); eq(db.orders.get(b.body.order).status, 'open');
  r = await call(deps, '/settle');
  ok(r.body.skipped, 'a second sweep within 30 seconds does nothing');
  t += 31e3;
  eq((await call(deps, '/settle')).body.checked, 1);
});

await test('unknown and malformed order references are not found', async () => {
  const { deps } = setup();
  eq((await order(deps, 'LO-ABCDEFGHJKMNPQRS')).status, 404);
  eq((await order(deps, '../v1/charges')).status, 404);
  eq((await order(deps, 'cs_test_1')).status, 404);
});

await test('return addresses off this site go home instead', async () => {
  eq(returnUrl('https://evil.example/phish'), 'https://lunarasociety.com/');
  eq(returnUrl('https://lunarasociety.com.evil.example/'), 'https://lunarasociety.com/');
  eq(returnUrl('javascript:alert(1)'), 'https://lunarasociety.com/');
  eq(returnUrl(undefined), 'https://lunarasociety.com/');
  eq(returnUrl('https://www.lunarasociety.com/join.html?x=1#top'), 'https://www.lunarasociety.com/join.html?x=1');
});

await test('without a key the routes say so', async () => {
  eq((await buy({ stripe: null }, { product: 'shield' })).status, 503);
  eq((await call({ stripe: null }, '/health')).body.configured, false);
});

await test('health reports the mode and never the key', async () => {
  const { stripe } = fakeStripe();
  const r = await handleCheckout(new Request('https://p/functions/v1/lunara-checkout/health'), { stripe });
  const text = await r.text();
  ok(!text.includes('sk_test'));
  eq(JSON.parse(text).mode, 'test');
  ok(stripeClient('rk_live_x').livemode && stripeClient('sk_live_x').livemode && !stripeClient('sk_test_x').livemode);
});

const secret = 'whsec_t';
const sign = (raw, s = secret, t = Math.floor(Date.now() / 1000)) =>
  `t=${t},v1=${createHmac('sha256', s).update(`${t}.${raw}`).digest('hex')}`;
const hook = (deps, raw, sig) => call(deps, '/webhook', { method: 'POST', body: raw, headers: sig ? { 'stripe-signature': sig } : {} });
const completed = (sess, id = 'evt_1') => JSON.stringify({ id, type: 'checkout.session.completed', livemode: false, data: { object: sess } });

await test('a signed completed checkout settles its order', async () => {
  const { deps, pay, sessions, db } = setup();
  const r = await buy(deps, { product: 'shield' });
  pay('cs_test_1');
  const raw = completed(sessions.cs_test_1);
  eq((await hook({ ...deps, webhookSecret: secret }, raw, sign(raw))).status, 200);
  eq(db.orders.get(r.body.order).status, 'paid');
});

await test('a delivered-twice event is handled once', async () => {
  const { deps, pay, sessions } = setup();
  await buy(deps, { product: 'shield' });
  pay('cs_test_1');
  const raw = completed(sessions.cs_test_1, 'evt_dup');
  const d = { ...deps, webhookSecret: secret };
  await hook(d, raw, sign(raw));
  ok((await hook(d, raw, sign(raw))).body.duplicate);
});

await test('forged, stale, tampered and unsigned webhooks are rejected', async () => {
  const { deps, pay, sessions, db } = setup();
  const r = await buy(deps, { product: 'shield' });
  pay('cs_test_1');
  const d = { ...deps, webhookSecret: secret };
  const raw = completed(sessions.cs_test_1);
  eq((await hook(d, raw, sign(raw, 'whsec_wrong'))).status, 400);
  eq((await hook(d, raw, sign(raw, secret, Math.floor(Date.now() / 1000) - 3600))).status, 400);
  eq((await hook(d, raw.replace('7500', '1'), sign(raw))).status, 400);
  eq((await hook(d, raw)).status, 400);
  eq((await hook({ ...deps, webhookSecret: '' }, raw, sign(raw))).status, 503);
  eq(db.orders.get(r.body.order).status, 'open');
});

await test('a refund is recorded against its order', async () => {
  const { deps, pay, db } = setup();
  const r = await buy(deps, { product: 'shield' });
  pay('cs_test_1');
  await order(deps, r.body.order);
  const raw = JSON.stringify({ id: 'evt_r', type: 'charge.refunded', data: { object: { payment_intent: 'pi_cs_test_1', amount_refunded: 7500 } } });
  await hook({ ...deps, webhookSecret: secret }, raw, sign(raw));
  eq(db.orders.get(r.body.order).refunded_amount, 7500);
});

await test('form encoding uses Stripe brackets', async () => {
  eq(formEncode({ a: { b: 1 }, c: [{ d: 2 }], z: undefined }).toString(), 'a%5Bb%5D=1&c%5B0%5D%5Bd%5D=2');
});

console.log(`${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
