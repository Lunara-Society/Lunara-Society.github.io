#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   End-to-end check against a Stripe sandbox.

     STRIPE_SECRET_KEY=sk_test_… node stripe-invoicing/sandbox-check.mjs

   Runs handleInvoicing — the code the edge function serves — against
   the real Stripe test API with in-memory storage: asks for an invoice
   the way the website does, asks again and expects the same one back,
   pays it with Stripe's test card, and confirms Stripe calls it paid.
   Then signs an invoice.paid event the way Stripe does and feeds it to
   the webhook route. Refuses a live key: it pays what it creates.
   ═══════════════════════════════════════════════════════════════════ */

import { handleInvoicing, stripeClient } from './invoice-core.mjs';
import { memoryDb } from './memory-db.mjs';
import { createHmac } from 'node:crypto';

const key = process.env.STRIPE_SECRET_KEY || '';
if (!key.startsWith('sk_test_')) { console.error('Needs a test-mode STRIPE_SECRET_KEY (sk_test_…).'); process.exit(1); }

const stripe = stripeClient(key);
const db = memoryDb();
const webhookSecret = 'whsec_sandbox_check';
const deps = { stripe, db, webhookSecret, ip: '203.0.113.7' };
const email = `sandbox+${Date.now()}@lunarasociety.com`;
const ask = (body) => handleInvoicing(new Request('https://x/functions/v1/lunara-invoice/request', {
  method: 'POST', body: JSON.stringify(body)
}), deps).then(async (r) => ({ status: r.status, body: await r.json() }));

const check = (cond, msg) => { console.log((cond ? '  ok   ' : '  FAIL ') + msg); if (!cond) process.exitCode = 1; };

const order = { product: 'shield', email, name: 'Sandbox Check AB', country: 'SE', tax_id: 'SE556677889901' };
const first = await ask(order);
check(first.status === 200 && /^https:\/\/invoice\.stripe\.com\//.test(first.body.url), `invoice created ${first.body.number} → ${first.body.url}`);

const again = await ask(order);
check(again.body.url === first.body.url && again.body.reused, 'asking again returns the same invoice');

const refused = await ask({ ...order, product: 'member6' });
check(refused.status === 400, 'an invitational product is refused');

const [row] = db.invoices.values();
const inv = await stripe.get(`/v1/invoices/${row.invoice_id}`);
check(inv.amount_due === 7500 && inv.currency === 'usd', `amount from the catalogue: ${inv.amount_due / 100} ${inv.currency}`);
check(inv.custom_fields?.[0]?.value === order.tax_id, 'VAT number printed on the invoice');

// What the hosted page does when the buyer types 4242 4242 4242 4242.
const pm = await stripe.post('/v1/payment_methods/pm_card_visa/attach', { customer: inv.customer });
const paid = await stripe.post(`/v1/invoices/${inv.id}/pay`, { payment_method: pm.id });
check(paid.status === 'paid', `paid with the test card: status ${paid.status}`);

const event = { id: 'evt_sandbox_' + Date.now(), type: 'invoice.paid', created: Math.floor(Date.now() / 1000), livemode: false, data: { object: paid } };
const raw = JSON.stringify(event);
const t = Math.floor(Date.now() / 1000);
const sig = createHmac('sha256', webhookSecret).update(`${t}.${raw}`).digest('hex');
const hook = (s) => handleInvoicing(new Request('https://x/functions/v1/lunara-invoice/webhook', {
  method: 'POST', body: raw, headers: { 'stripe-signature': s }
}), deps);
check((await hook(`t=${t},v1=${sig}`)).status === 200, 'signed webhook accepted');
check(db.invoices.get(inv.id).status === 'paid' && !!db.invoices.get(inv.id).paid_at, 'invoice recorded as paid');
check((await hook(`t=${t},v1=${'0'.repeat(64)}`)).status === 400, 'forged webhook rejected');
