/* node stripe-checkout/test_checkout.mjs — runs in CI, needs no network. */

import { createHmac } from 'node:crypto';
import { handleCheckout, stripeClient, returnUrl, formEncode, resetExtras, resetPortal, every, recoveryEmail } from './checkout-core.mjs';
import { CATALOG } from './catalog.mjs';
import { handleAgentPay, AGENT_PAYABLE } from './agent-pay.mjs';
import { loadPricing, catalogFrom, sellable } from './build-catalog.mjs';

let failed = 0, passed = 0;
async function test(name, fn) {
  try { await fn(); passed++; } catch (e) { failed++; console.error('FAIL', name, '\n    ', e.message); }
}
function eq(a, b, msg) { if (a !== b) throw new Error(`${msg || ''} expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); }
function ok(c, msg) { if (!c) throw new Error(msg || 'not ok'); }

function fakeStripe(opts = {}) {
  const calls = [], sessions = {}, subs = {}, configs = [];
  let n = 0;
  const fetchImpl = async (url, init) => {
    const u = new URL(url);
    const params = init.body ? new URLSearchParams(init.body) : u.searchParams;
    calls.push({ method: init.method, path: u.pathname, params, headers: init.headers });
    if (u.pathname === '/v1/checkout/sessions' && init.method === 'POST' && opts.refuseExtras && params.has('consent_collection[promotions]')) {
      return new Response(JSON.stringify({ error: { message: 'consent_collection is not available for your account' } }), { status: 400 });
    }
    const sm = u.pathname.match(/^\/v1\/subscriptions\/(sub_\w+)$/);
    if (sm) return subs[sm[1]] ? new Response(JSON.stringify(subs[sm[1]])) : new Response('{"error":{}}', { status: 404 });
    if (u.pathname === '/v1/billing_portal/configurations') {
      if (init.method === 'GET') return new Response(JSON.stringify({ data: configs }));
      const c = { id: 'bpc_' + (configs.length + 1), metadata: { lunara: params.get('metadata[lunara]') }, cancel: params.get('features[subscription_cancel][enabled]') };
      configs.push(c); return new Response(JSON.stringify(c));
    }
    if (u.pathname === '/v1/billing_portal/sessions') return new Response(JSON.stringify({ url: 'https://billing.stripe.com/p/session/test_' + params.get('customer') }));
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
  return { stripe: stripeClient('sk_test_x', fetchImpl), calls, sessions, subs, configs, pay };
}
function memoryDb() {
  const orders = new Map(), events = new Set();
  return {
    orders,
    async createOrder(row) { if (orders.has(row.order_ref)) throw new Error('dup'); orders.set(row.order_ref, { ...row }); },
    async openOrders() { return [...orders.values()].filter((o) => o.status === 'open').map((o) => ({ ...o })); },
    async getOrder(ref) { const o = orders.get(ref); return o ? { ...o } : null; },
    async updateOrder(ref, patch) { Object.assign(orders.get(ref), patch); },
    async markPaid(ref, patch) { const o = orders.get(ref); if (o.status !== 'open') return false; Object.assign(o, patch); return true; },
    async markRefunded(pi, amount) { for (const o of orders.values()) if (o.payment_intent === pi) o.refunded_amount = amount; },
    async claimEvent(id) { if (events.has(id)) return false; events.add(id); return true; },
    watches: [], extended: [],
    async monitorWatch(w) { this.watches.push({ ...w, active: true }); },
    async endMonitorWatch(ref) { for (const w of this.watches) if (w.order_ref === ref) w.active = false; },
    async claimRecovery(ref, patch) { const o = orders.get(ref); if (o.recovery_sent_at) return false; Object.assign(o, patch, { recovery_sent_at: 'now' }); return true; },
    async subscriptionsDue() { return [...orders.values()].filter((o) => o.subscription_id && o.status === 'paid').map((o) => ({ ...o })); },
    async orderBySubscription(id) { const o = [...orders.values()].find((x) => x.subscription_id === id); return o ? { ...o } : null; },
    async extendRegistry(ref, until) { this.extended.push([ref, until]); }
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

// Each setup lives an hour after the last, so the sweep's once-per-30s
// guard never skips a test's knock.
let clock = Date.now();
function setup(opts) { resetExtras(); resetPortal(); const f = fakeStripe(opts); const db = memoryDb(); const at = (clock += 3600e3); return { ...f, db, deps: { stripe: f.stripe, db, now: () => at } }; }
const order = (deps, ref) => call(deps, '/order?ref=' + ref);

await test('a buy records an order and opens Stripe at the catalogue price', async () => {
  const { deps, calls, db } = setup();
  const r = await buy(deps, { product: 'kit', return_to: 'https://lunarasociety.com/certify.html' });
  eq(r.status, 200);
  ok(/^LO-[0-9A-Z]{16}$/.test(r.body.order), 'order ref');
  ok(r.body.url.startsWith('https://checkout.stripe.com/'));
  const p = calls[0].params;
  eq(p.get('mode'), 'payment');
  eq(p.get('line_items[0][price_data][unit_amount]'), '9500');
  ok(!p.has('line_items[0][price_data][recurring][interval]'), 'a single charge does not recur');
  ok(!p.has('consent_collection[promotions]') && !p.has('after_expiration[recovery][enabled]'), 'recovery options only where switched on');
  eq(p.get('line_items[0][price_data][currency]'), 'usd');
  eq(p.get('metadata[order]'), r.body.order);
  eq(p.get('client_reference_id'), r.body.order);
  eq(p.get('success_url'), 'https://lunarasociety.com/paid.html?order=' + r.body.order);
  eq(p.get('cancel_url'), 'https://lunarasociety.com/certify.html');
  ok(p.get('custom_text[submit][message]').startsWith('How you receive it: '), 'delivery shown before paying');
  const row = db.orders.get(r.body.order);
  eq(row.status, 'open'); eq(row.product, 'kit'); eq(row.amount_total, 9500); eq(row.session_id, 'cs_test_1');
});

await test('a renewing product opens Stripe as a subscription that says it renews', async () => {
  const { deps, calls } = setup();
  const r = await buy(deps, { product: 'shield', website: 'https://www.acme.example/about' });
  eq(r.status, 200);
  const p = calls[0].params;
  eq(p.get('mode'), 'subscription');
  eq(p.get('line_items[0][price_data][unit_amount]'), '7500');
  eq(p.get('line_items[0][price_data][recurring][interval]'), 'month');
  eq(p.get('line_items[0][price_data][recurring][interval_count]'), '6');
  ok(!p.has('payment_intent_data[description]'), 'no payment intent data in subscription mode');
  eq(p.get('subscription_data[metadata][order]'), r.body.order);
  ok(p.get('custom_text[submit][message]').includes('Renews automatically: $75 every six months until you cancel'));
  eq(p.get('custom_fields[0][key]'), 'website');
  eq(p.get('custom_fields[0][text][default_value]'), 'https://acme.example', 'website prefilled from the page, as a clean domain');
  const m = (await buy(deps, { product: 'monitor' }), calls[1].params);
  eq(m.get('line_items[0][price_data][recurring][interval]'), 'month'); eq(m.get('line_items[0][price_data][recurring][interval_count]'), '1');
  eq(m.get('line_items[0][price_data][unit_amount]'), '1900');
  const y = (await buy(deps, { product: 'monitor_year' }), calls[2].params);
  eq(y.get('line_items[0][price_data][recurring][interval]'), 'year'); eq(y.get('line_items[0][price_data][unit_amount]'), '19000');
  eq(every(CATALOG.monitor), 'a month'); eq(every(CATALOG.shield), 'every six months'); eq(every(CATALOG.kit), '');
});

await test('a partner code is written on the order and in Stripe; a malformed one is ignored', async () => {
  const { deps, calls, db } = setup();
  const r = await buy(deps, { product: 'monitor', ref: ' p-7k3m9q ' });
  eq(db.orders.get(r.body.order).partner_ref, 'P-7K3M9Q');
  eq(calls[0].params.get('metadata[partner]'), 'P-7K3M9Q');
  eq(calls[0].params.get('subscription_data[metadata][partner]'), 'P-7K3M9Q');
  const k = await buy(deps, { product: 'kit', ref: 'P-ILOU00' });
  eq(db.orders.get(k.body.order).partner_ref, undefined, 'I, L, O and U are not in a code');
  ok(!calls[1].params.has('metadata[partner]'));
});

await test('network products need an agent that has qualified, and are delivered to it', async () => {
  const { deps, pay, subs, db } = setup();
  const net = [];
  db.networkAddCredits = async (a, n) => net.push(['credits', a, n]);
  db.networkSetTier = async (a, t, ref) => net.push(['tier', a, t, ref]);
  db.networkEndTier = async (ref) => net.push(['end', ref]);
  const asked = [];
  const d = { ...deps, networkEligibility: async (a, p) => { asked.push([a, p]); return a === 'AGT-QWAMF1D7' ? { eligible: true, reasons: [] } : { eligible: false, reasons: ['Pass 1 trial with 80 or more (passed: 0).'] }; } };
  let r = await buy(d, { product: 'trial_pack' });
  eq(r.status, 400); ok(r.body.reasons[0].includes('agent id'));
  r = await buy(d, { product: 'net_associate', agent_id: 'AGT-NTREADY1' });
  eq(r.status, 403); ok(/Pass 1 trial/.test(r.body.reasons[0]), 'the registry says why');
  r = await buy(d, { product: 'trial_pack', agent_id: 'agt-qwamf1d7' });
  eq(r.status, 200); eq(db.orders.get(r.body.order).agent_id, 'AGT-QWAMF1D7');
  pay('cs_test_1', { amount_total: 5900 });
  await order(d, r.body.order);
  eq(JSON.stringify(net[0]), JSON.stringify(['credits', 'AGT-QWAMF1D7', 4]), 'four sittings land on the agent');
  r = await buy(d, { product: 'net_fellow', agent_id: 'AGT-QWAMF1D7' });
  pay('cs_test_2', { amount_total: 4900, subscription: 'sub_n', customer: 'cus_n' });
  await order(d, r.body.order);
  eq(net[1][0], 'tier'); eq(net[1][2], 'fellow');
  subs.sub_n = { id: 'sub_n', status: 'canceled', items: { data: [{ current_period_end: 1800000000 }] } };
  await call(d, '/settle');
  eq(JSON.stringify(net[2]), JSON.stringify(['end', r.body.order]), 'a lapsed membership drops the agent back to Member');
});

await test('a website hint that is not a domain is ignored', async () => {
  const { deps, calls } = setup();
  await buy(deps, { product: 'monitor', website: 'javascript:alert(1)' });
  ok(!calls[0].params.has('custom_fields[0][text][default_value]'));
});

await test('if Stripe refuses the recovery options, the sale goes ahead without them', async () => {
  const { deps: d0, calls } = setup({ refuseExtras: true });
  const deps = { ...d0, env: { CHECKOUT_RECOVERY: 'on' } };
  const r = await buy(deps, { product: 'kit' });
  eq(r.status, 200);
  eq(calls.length, 2);
  ok(!calls[1].params.has('consent_collection[promotions]'));
  await buy(deps, { product: 'kit' });
  eq(calls.length, 3, 'not asked again once refused');
});

await test('a paid Passport Monitor watches the domain; a lapse stops it', async () => {
  const { deps, pay, subs, db } = setup();
  const r = await buy(deps, { product: 'monitor' });
  pay('cs_test_1', { subscription: 'sub_1', customer: 'cus_1', amount_total: 1900, custom_fields: [{ key: 'website', text: { value: 'https://WWW.Shop.example/' } }] });
  const o = await order(deps, r.body.order);
  eq(o.body.paid, true);
  eq(o.body.subscription.every, 'a month');
  eq(o.body.subscription.manage, 'manage.html?order=' + r.body.order);
  const row = db.orders.get(r.body.order);
  eq(row.subscription_id, 'sub_1'); eq(row.customer_id, 'cus_1'); eq(row.sub_status, 'active');
  eq(db.watches.length, 1); eq(db.watches[0].domain, 'shop.example'); eq(db.watches[0].email, 'buyer@example.com'); eq(db.watches[0].order_ref, r.body.order);
  subs.sub_1 = { id: 'sub_1', status: 'canceled', items: { data: [{ current_period_end: 1800000000 }] } };
  const sw = await call(deps, '/settle');
  eq(sw.body.subscriptions, 1);
  eq(db.orders.get(r.body.order).sub_status, 'canceled');
  eq(db.watches[0].active, false);
});

await test('a renewal extends the register entry the order paid for', async () => {
  const { deps, pay, subs, db } = setup();
  const r = await buy(deps, { product: 'shield' });
  pay('cs_test_1', { subscription: 'sub_2', customer: 'cus_2' });
  await order(deps, r.body.order);
  subs.sub_2 = { id: 'sub_2', status: 'active', items: { data: [{ current_period_end: 1790000000 }] } };
  await call(deps, '/settle');
  eq(db.orders.get(r.body.order).renewals || 0, 0, 'the first read is not a renewal');
  eq(db.extended.length, 0);
  subs.sub_2.items.data[0].current_period_end = 1790000000 + 182 * 86400;
  const { syncSubscription } = await import('./checkout-core.mjs');
  await syncSubscription({ ...db.orders.get(r.body.order) }, deps);
  eq(db.orders.get(r.body.order).renewals, 1);
  eq(db.extended.length, 1); eq(db.extended[0][0], r.body.order);
});

await test('the portal opens for an order with a subscription, and only then', async () => {
  const { deps, pay, configs } = setup();
  const r = await buy(deps, { product: 'monitor' });
  const portal = (ref) => call(deps, '/portal', { method: 'POST', body: JSON.stringify({ order: ref }) });
  eq((await portal(r.body.order)).status, 404, 'unpaid: no customer yet');
  eq((await portal('nonsense')).status, 404);
  pay('cs_test_1', { subscription: 'sub_3', customer: 'cus_3', amount_total: 1900 });
  await order(deps, r.body.order);
  const p = await portal(r.body.order.toLowerCase());
  eq(p.status, 200);
  eq(p.body.url, 'https://billing.stripe.com/p/session/test_cus_3');
  eq(configs.length, 1); eq(configs[0].cancel, 'true', 'cancelling is switched on');
  await portal(r.body.order);
  eq(configs.length, 1, 'configuration made once');
});

await test('an abandoned checkout gets one recovery email, only with consent', async () => {
  const { deps, sessions, db, calls } = setup();
  const sent = [];
  const d = { ...deps, env: { CHECKOUT_RECOVERY: 'on' }, mail: { send: async (m) => { sent.push(m); } } };
  const a = await buy(d, { product: 'monitor' });
  const b = await buy(d, { product: 'kit' });
  eq(calls[0].params.get('after_expiration[recovery][enabled]'), 'true', 'switched on: Stripe is asked for a recovery link');
  Object.assign(sessions.cs_test_1, { status: 'expired', customer_details: { email: 'lead@example.com' }, consent: { promotions: 'opt_in' }, after_expiration: { recovery: { url: 'https://buy.stripe.com/r/live_x' } } });
  Object.assign(sessions.cs_test_2, { status: 'expired', customer_details: { email: 'no@example.com' }, consent: { promotions: 'opt_out' }, after_expiration: { recovery: { url: 'https://buy.stripe.com/r/live_y' } } });
  await call(d, '/settle');
  await order(d, a.body.order);
  eq(sent.length, 1);
  eq(sent[0].to, 'lead@example.com');
  ok(sent[0].text.includes('https://buy.stripe.com/r/live_x') && sent[0].text.includes('$19 a month'));
  eq(db.orders.get(a.body.order).status, 'expired');
  eq(db.orders.get(b.body.order).status, 'expired');
  ok(recoveryEmail({ product: 'kit', email: 'x@example.com' }, 'https://u').subject.includes('Compliance Kit'));
});

await test('the order email of a subscription says it renews and how to cancel', async () => {
  const { orderEmail } = await import('./checkout-core.mjs');
  const m = orderEmail({ order_ref: 'LO-0000000000000000', product: 'monitor', email: 'a@b.co', name: 'Ann', details: {} });
  ok(m.text.includes('$19 a month'));
  ok(m.text.includes('renews automatically a month until you cancel') || m.text.includes('renews automatically'));
  ok(m.text.includes('manage.html?order=LO-0000000000000000'));
  const k = orderEmail({ order_ref: 'LO-0000000000000001', product: 'kit', email: 'a@b.co', details: {} });
  ok(!k.text.includes('manage.html'), 'a single charge has nothing to cancel');
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

await test('the owner package is sold only to a signed-in owner, at $1, locked to their email', async () => {
  const { deps, calls, db, pay } = setup();
  deps.whoIs = async (t) => (t === 'owner-token-xxxxxxxxxxxx' ? { email: 'LunaraSociety@gmail.com' } : t === 'member-token-xxxxxxxxxxx' ? { email: 'someone@example.com' } : null);
  ok(!('owner_complete' in CATALOG), 'never in the public catalogue');
  for (const body of [{}, { session_token: 'member-token-xxxxxxxxxxx' }, { session_token: 'forged' }]) {
    const r = await buy(deps, { product: 'owner_complete', ...body });
    eq(r.status, 400); eq(r.body.error, 'That product cannot be bought here.', 'same answer as an unknown product');
  }
  eq(calls.length, 0, 'Stripe never asked');
  eq((await buy({ ...deps, whoIs: undefined }, { product: 'owner_complete', session_token: 'owner-token-xxxxxxxxxxxx' })).status, 400, 'no way to check: refuse');
  const r = await buy(deps, { product: 'owner_complete', session_token: 'owner-token-xxxxxxxxxxxx', amount: 0 });
  eq(r.status, 200);
  const p = calls[0].params;
  eq(p.get('line_items[0][price_data][unit_amount]'), '100');
  eq(p.get('customer_email'), 'lunarasociety@gmail.com');
  eq(p.get('custom_fields[0][text][default_value]'), 'https://yavaya.lat');
  pay('cs_test_1');
  const o = await order(deps, r.body.order);
  eq(o.body.paid, true); eq(o.body.links.length, 2);
  eq(o.body.links[0].href, 'kit-access.html?order=' + r.body.order);
  eq(o.body.links[1].href, 'compliance-report-access.html?order=' + r.body.order);
  eq(db.orders.get(r.body.order).amount_total, 100);
});

await test('a $1 payment for a public product is never called paid', async () => {
  const { deps, pay } = setup();
  const r = await buy(deps, { product: 'vendor' });
  pay('cs_test_1', { amount_total: 100 });
  eq((await order(deps, r.body.order)).body.status, 'mismatch');
});

await test('a paid order sends one short email with what to do', async () => {
  const { deps, pay } = setup();
  const sent = []; deps.mail = { send: async (m) => { sent.push(m); } };
  const r = await buy(deps, { product: 'shield' });
  pay('cs_test_1', { custom_fields: [{ key: 'website', text: { value: 'https://www.yavaya.lat' } }, { key: 'legalname', text: { value: 'Yavaya' } }] });
  await order(deps, r.body.order); await order(deps, r.body.order);
  deps.now = () => 5e11; await call(deps, '/settle');
  eq(sent.length, 1, 'exactly once');
  const m = sent[0];
  eq(m.to, 'buyer@example.com'); ok(m.subject.includes(r.body.order));
  ok(m.text.includes('WHAT YOU NEED TO DO') && m.text.includes(CATALOG.shield.todo));
  ok(m.text.includes('shield.html?') && m.text.includes('domain=yavaya.lat') && m.text.includes('order=' + r.body.order), 'registry application link prefilled');
  ok(m.text.includes('paid.html?order=' + r.body.order));
  ok(m.html.includes('What you need to do') && !m.html.includes('<script'));
});

await test('a mail failure never undoes a payment', async () => {
  const { deps, pay, db } = setup();
  deps.mail = { send: async () => { throw new Error('down'); } };
  const r = await buy(deps, { product: 'kit' });
  pay('cs_test_1');
  eq((await order(deps, r.body.order)).body.paid, true);
  eq(db.orders.get(r.body.order).status, 'paid');
});

await test('the hourly sweep settles a paid order whose buyer never came back', async () => {
  const { deps, pay, db } = setup();
  const a = await buy(deps, { product: 'shield' });
  const b = await buy(deps, { product: 'kit' });
  pay('cs_test_1');
  let t = (clock += 3600e3); deps.now = () => t;
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

/* Agents paying over MPP. The protocol library is mppx in production; here
   a fake stands in for it, so these test Lunara's rules around it: what is
   sold, to whom, what is recorded and what is delivered. The round trip
   with the real library, against a fake Stripe, is test_mpp_roundtrip.mjs. */
function agentPayDeps({ paid = false, pi = 'pi_mpp_1', eligible = true } = {}) {
  const orders = [], credits = [], mails = [];
  const mpp = async () => ({
    livemode: false,
    receiptOf: () => ({ method: 'stripe', reference: pi }),
    charge: (o) => async () => paid
      ? { status: 200, withReceipt: (res) => { res.headers.set('payment-receipt', 'r'); res.charged = o; return res; } }
      : { status: 402, challenge: new Response(JSON.stringify({ title: 'Payment Required', amount: o.amount, currency: o.currency }), { status: 402, headers: { 'www-authenticate': 'Payment method="stripe"' } }) }
  });
  const deps = {
    mpp, env: {}, now: () => Date.parse('2026-10-19T08:00:00Z'),
    networkEligibility: async () => (eligible ? { success: true, eligible: true, reasons: [] } : { success: false, eligible: false, reasons: ['No agent with that id: join the network first.'] }),
    db: { createOrder: async (r) => orders.push(r), orderByPaymentIntent: async (x) => orders.find((o) => o.payment_intent === x) || null, networkAddCredits: async (a, n) => credits.push([a, n]) },
    mail: { send: async (m) => mails.push(m) }
  };
  return { deps, orders, credits, mails };
}
const PAY = 'https://x.supabase.co/functions/v1/lunara-checkout/agent-pay';

await test('agents pay over MPP: only sittings, only for a real agent, browsers go to the checkout', async () => {
  eq(AGENT_PAYABLE.join(','), 'trial_pass,trial_pack');
  const { deps, orders } = agentPayDeps();
  eq((await handleAgentPay(new Request(`${PAY}?product=shield&agent=AGT-ABCDEFGH`), deps)).status, 400, 'nothing else is sold this way');
  eq((await handleAgentPay(new Request(`${PAY}?product=trial_pass&agent=nobody`), deps)).status, 400);
  eq((await handleAgentPay(new Request(`${PAY}?product=trial_pass&agent=AGT-ABCDEFGH`), agentPayDeps({ eligible: false }).deps)).status, 404, 'no challenge for an agent that cannot receive it');
  const h = await handleAgentPay(new Request(`${PAY}?product=trial_pass&agent=AGT-ABCDEFGH`, { headers: { accept: 'text/html' } }), deps);
  eq(h.status, 303); ok(/agent-network\.html\?agent=AGT-ABCDEFGH#trials$/.test(h.headers.get('location')));
  const c = await handleAgentPay(new Request(`${PAY}?product=trial_pack&agent=AGT-ABCDEFGH`, { method: 'POST' }), deps);
  eq(c.status, 402); eq((await c.json()).amount, '59.00', 'the catalogue price, in dollars');
  eq(orders.length, 0, 'nothing is recorded before payment');
  eq((await handleAgentPay(new Request(`${PAY}?product=trial_pass&agent=AGT-ABCDEFGH`), { ...deps, mpp: async () => { throw new Error('no Stripe profile (404)'); } })).status, 503);
});

await test('a paid MPP request is recorded once and delivers its sittings once', async () => {
  const { deps, orders, credits, mails } = agentPayDeps({ paid: true });
  const r = await handleAgentPay(new Request(`${PAY}?product=trial_pack&agent=agt-abcdefgh`, { method: 'POST' }), deps);
  eq(r.status, 200); ok(r.headers.get('payment-receipt'));
  const b = await r.json();
  eq(b.sittings_added, 4); eq(b.agent_id, 'AGT-ABCDEFGH');
  eq(orders.length, 1); eq(orders[0].status, 'paid'); eq(orders[0].session_id, 'mpp:pi_mpp_1'); eq(orders[0].amount_total, 5900); eq(orders[0].product, 'trial_pack');
  eq(credits[0][0], 'AGT-ABCDEFGH'); eq(credits[0][1], 4); eq(mails.length, 1);
  const again = await handleAgentPay(new Request(`${PAY}?product=trial_pack&agent=AGT-ABCDEFGH`, { method: 'POST' }), deps);
  eq(again.status, 409, 'a payment already on an order is not delivered again'); eq(credits.length, 1); eq(orders.length, 1);
});

await test('an MPP order reads back from the database, not from a Checkout Session', async () => {
  const { deps, db } = setup();
  db.orders.set('LO-AAAAAAAAAAAAAAAA', { order_ref: 'LO-AAAAAAAAAAAAAAAA', session_id: 'mpp:pi_mpp_9', product: 'trial_pass', status: 'paid', amount_total: 1900 });
  const r = await handleCheckout(new Request('https://x.supabase.co/functions/v1/lunara-checkout/order?ref=LO-AAAAAAAAAAAAAAAA'), deps);
  const b = await r.json();
  eq(b.paid, true); eq(b.channel, 'mpp'); eq(b.product, 'trial_pass');
});

await test('form encoding uses Stripe brackets', async () => {
  eq(formEncode({ a: { b: 1 }, c: [{ d: 2 }], z: undefined }).toString(), 'a%5Bb%5D=1&c%5B0%5D%5Bd%5D=2');
});

console.log(`${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
