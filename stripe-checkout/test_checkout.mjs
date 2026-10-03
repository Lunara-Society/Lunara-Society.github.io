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
  const calls = [];
  const fetchImpl = async (url, init) => {
    const u = new URL(url);
    const params = init.body ? new URLSearchParams(init.body) : u.searchParams;
    calls.push({ method: init.method, path: u.pathname, params, headers: init.headers });
    if (u.pathname === '/v1/checkout/sessions') {
      return new Response(JSON.stringify({ id: 'cs_test_abc', url: 'https://checkout.stripe.com/c/pay/cs_test_abc' }));
    }
    if (u.pathname === '/v1/checkout/sessions/cs_test_abc') {
      return new Response(JSON.stringify({ id: 'cs_test_abc', payment_status: 'paid', metadata: { lunara_product: 'shield' } }));
    }
    return new Response(JSON.stringify({ error: { message: 'No such checkout session' } }), { status: 404 });
  };
  return { stripe: stripeClient('sk_test_x', fetchImpl), calls };
}
function memoryDb() {
  const payments = new Map(), events = new Set();
  return {
    payments,
    async upsertPayment(row) { payments.set(row.session_id, { ...payments.get(row.session_id), ...row }); },
    async markRefunded(pi, amount) { for (const p of payments.values()) if (p.payment_intent === pi) p.refunded_amount = amount; },
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

await test('a buy creates a session at the catalogue price', async () => {
  const { stripe, calls } = fakeStripe();
  const r = await buy({ stripe }, { product: 'shield', return_to: 'https://lunarasociety.com/certify.html' });
  eq(r.status, 200);
  eq(r.body.url, 'https://checkout.stripe.com/c/pay/cs_test_abc');
  const p = calls[0].params;
  eq(p.get('mode'), 'payment');
  eq(p.get('line_items[0][price_data][unit_amount]'), '7500');
  eq(p.get('line_items[0][price_data][currency]'), 'usd');
  eq(p.get('metadata[lunara_product]'), 'shield');
  eq(p.get('cancel_url'), 'https://lunarasociety.com/certify.html');
  eq(p.get('success_url'), 'https://lunarasociety.com/certify.html?paid=shield&session_id={CHECKOUT_SESSION_ID}');
});

await test('an amount sent by the browser is ignored', async () => {
  const { stripe, calls } = fakeStripe();
  await buy({ stripe }, { product: 'vendor', amount: 1, unit_amount: 1, price: 1 });
  eq(calls[0].params.get('line_items[0][price_data][unit_amount]'), '740000');
});

await test('unknown, invitational and Lens products are refused before Stripe', async () => {
  const { stripe, calls } = fakeStripe();
  for (const product of ['member6', 'lens_pro', 'nothing', '__proto__', 'constructor', '', 42]) {
    eq((await buy({ stripe }, { product })).status, 400, String(product));
  }
  eq((await call({ stripe }, '/checkout', { method: 'POST', body: '{bad' })).status, 400);
  eq(calls.length, 0);
});

await test('return addresses off this site go home instead', async () => {
  eq(returnUrl('https://evil.example/phish'), 'https://lunarasociety.com/');
  eq(returnUrl('https://lunarasociety.com.evil.example/'), 'https://lunarasociety.com/');
  eq(returnUrl('javascript:alert(1)'), 'https://lunarasociety.com/');
  eq(returnUrl(undefined), 'https://lunarasociety.com/');
  eq(returnUrl('https://www.lunarasociety.com/join.html?x=1#top'), 'https://www.lunarasociety.com/join.html?x=1');
  eq(returnUrl('https://lunarasociety.com/a.html?paid=kit&session_id=cs_1'), 'https://lunarasociety.com/a.html');
});

await test('without a key the routes say so', async () => {
  eq((await buy({ stripe: null }, { product: 'shield' })).status, 503);
  const h = await call({ stripe: null }, '/health');
  eq(h.body.configured, false);
});

await test('health reports the mode and never the key', async () => {
  const { stripe } = fakeStripe();
  const r = await handleCheckout(new Request('https://p/functions/v1/lunara-checkout/health'), { stripe });
  const text = await r.text();
  ok(!text.includes('sk_test'));
  eq(JSON.parse(text).mode, 'test');
  ok(stripeClient('rk_live_x').livemode && stripeClient('sk_live_x').livemode && !stripeClient('sk_test_x').livemode);
});

await test('the return check reports paid and nothing personal', async () => {
  const { stripe } = fakeStripe();
  const r = await call({ stripe }, '/session?id=cs_test_abc');
  eq(r.body.paid, true); eq(r.body.product, 'Shield Verification');
  eq(Object.keys(r.body).sort().join(), 'paid,product,status');
  eq((await call({ stripe }, '/session?id=../../v1/charges')).status, 404);
  eq((await call({ stripe }, '/session?id=cs_test_missing')).status, 404);
});

const secret = 'whsec_t';
const sign = (raw, s = secret, t = Math.floor(Date.now() / 1000)) =>
  `t=${t},v1=${createHmac('sha256', s).update(`${t}.${raw}`).digest('hex')}`;
const completed = (id = 'evt_1') => JSON.stringify({ id, type: 'checkout.session.completed', livemode: false, data: { object: {
  id: 'cs_test_abc', amount_total: 7500, currency: 'usd', payment_status: 'paid', payment_intent: 'pi_1', livemode: false,
  metadata: { lunara_product: 'shield' }, customer_details: { email: 'b@example.com', name: 'B AB', address: { country: 'SE' } } } } });
const hook = (deps, raw, sig) => call(deps, '/webhook', { method: 'POST', body: raw, headers: sig ? { 'stripe-signature': sig } : {} });

await test('a signed completed checkout is recorded', async () => {
  const db = memoryDb();
  const raw = completed();
  eq((await hook({ db, webhookSecret: secret }, raw, sign(raw))).status, 200);
  const row = db.payments.get('cs_test_abc');
  eq(row.product, 'shield'); eq(row.payment_status, 'paid'); eq(row.email, 'b@example.com'); eq(row.country, 'SE');
});

await test('a delivered-twice event is handled once', async () => {
  const db = memoryDb();
  const raw = completed('evt_dup');
  await hook({ db, webhookSecret: secret }, raw, sign(raw));
  ok((await hook({ db, webhookSecret: secret }, raw, sign(raw))).body.duplicate);
});

await test('forged, stale, tampered and unsigned webhooks are rejected', async () => {
  const db = memoryDb(), deps = { db, webhookSecret: secret };
  const raw = completed();
  eq((await hook(deps, raw, sign(raw, 'whsec_wrong'))).status, 400);
  eq((await hook(deps, raw, sign(raw, secret, Math.floor(Date.now() / 1000) - 3600))).status, 400);
  eq((await hook(deps, raw.replace('7500', '1'), sign(raw))).status, 400);
  eq((await hook(deps, raw)).status, 400);
  eq((await hook({ db, webhookSecret: '' }, raw, sign(raw))).status, 503);
  eq(db.payments.size, 0);
});

await test('a refund is recorded against its payment', async () => {
  const db = memoryDb(), deps = { db, webhookSecret: secret };
  let raw = completed();
  await hook(deps, raw, sign(raw));
  raw = JSON.stringify({ id: 'evt_r', type: 'charge.refunded', data: { object: { payment_intent: 'pi_1', amount_refunded: 7500 } } });
  await hook(deps, raw, sign(raw));
  eq(db.payments.get('cs_test_abc').refunded_amount, 7500);
});

await test('form encoding uses Stripe brackets', async () => {
  eq(formEncode({ a: { b: 1 }, c: [{ d: 2 }], z: undefined }).toString(), 'a%5Bb%5D=1&c%5B0%5D%5Bd%5D=2');
});

console.log(`${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
