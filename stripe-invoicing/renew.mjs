#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   Raises and emails one invoice: a renewal, or an invitational product
   for someone who has been accepted.

     STRIPE_SECRET_KEY=sk_… node stripe-invoicing/renew.mjs \
       --email buyer@example.com --product shield [--name "Example AB"] [--country SE]

   Unlike the website, this one is sent: Stripe emails the invoice and
   its reminders, because the address belongs to a customer we know.
   Any product in the catalogue may be named here, invitational or not.
   ═══════════════════════════════════════════════════════════════════ */

import { stripeClient, createInvoice } from './invoice-core.mjs';

const arg = (k) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : undefined; };
const key = process.env.STRIPE_SECRET_KEY || '';
const email = (arg('email') || '').toLowerCase();
const productId = arg('product');
if (!/^(sk|rk)_(test|live)_/.test(key) || !email || !productId) {
  console.error('Usage: STRIPE_SECRET_KEY=… node stripe-invoicing/renew.mjs --email x@y.z --product <id> [--name N] [--country CC]');
  process.exit(1);
}

const stripe = stripeClient(key);
const made = await createInvoice(stripe, {
  productId, email, name: arg('name') || email, country: arg('country'),
  taxId: arg('tax-id'), send: true, source: 'renewal',
  idem: `renew:${email}:${productId}:${new Date().toISOString().slice(0, 10)}`
});
if (made.error) { console.error(made.error); process.exit(1); }
console.log(`${stripe.livemode ? 'LIVE' : 'test'} invoice ${made.invoice.number} sent to ${email}: ${made.invoice.hosted_invoice_url}`);
