#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   Writes the price table in lunara-pricing.js into Stripe.

     STRIPE_SECRET_KEY=sk_test_… node stripe-invoicing/sync-catalog.mjs
     STRIPE_SECRET_KEY=sk_live_… node stripe-invoicing/sync-catalog.mjs --live

   lunara-pricing.js stays the only place a price is written. Each
   product becomes a Stripe Product with the id lunara_<id>, and its
   price a Price under the lookup key lunara_<id>_usd. Stripe prices
   are immutable, so a changed figure creates a new Price, moves the
   lookup key onto it and archives the old one; invoices already sent
   keep the amount they were sent at.

   Safe to run any number of times. --dry-run prints what it would do.
   ═══════════════════════════════════════════════════════════════════ */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { stripeClient, lookupKey, StripeError } from './invoice-core.mjs';

/* Never invoiced from the website: invitational products are sent to
   people who have been accepted, and the Lens plans are paid through
   lens-backend, which credits the account that paid. They are still
   written to Stripe so a renewal can be raised by hand. */
export function invoiceable(p) {
  return !p.invitational && !p.id.startsWith('lens');
}

export function loadCatalog() {
  const src = readFileSync(fileURLToPath(new URL('../lunara-pricing.js', import.meta.url)), 'utf8');
  const window = {};
  const document = { readyState: 'complete', querySelectorAll: () => [] };
  vm.runInNewContext(src, { window, document });
  return window.LunaraPricing.products;
}

async function main() {
  const key = process.env.STRIPE_SECRET_KEY || '';
  const live = process.argv.includes('--live');
  const dry = process.argv.includes('--dry-run');
  if (!/^(sk|rk)_(test|live)_/.test(key)) throw new Error('Set STRIPE_SECRET_KEY.');
  if (key.includes('_live_') && !live) throw new Error('That is a live key. Pass --live to write the live catalogue.');

  const stripe = stripeClient(key);
  const products = loadCatalog();
  const log = (...a) => console.log(dry ? '[dry-run]' : '', ...a);

  for (const p of products) {
    const id = `lunara_${p.id}`;
    const fields = {
      name: p.name,
      description: p.lede,
      metadata: { lunara_id: p.id, terms: p.terms, invoiceable: String(invoiceable(p)), tier: p.tier }
    };

    let product = null;
    try { product = await stripe.get(`/v1/products/${id}`); }
    catch (e) { if (!(e instanceof StripeError && e.status === 404)) throw e; }

    if (!product) {
      log('create product', id);
      if (!dry) product = await stripe.post('/v1/products', { id, ...fields, tax_code: 'txcd_10000000' });
    } else {
      if (!dry) await stripe.post(`/v1/products/${id}`, { ...fields, active: 'true' });
    }

    const cents = Math.round(p.price * 100);
    const found = await stripe.get('/v1/prices', { lookup_keys: [lookupKey(p.id)], active: 'true' });
    const current = found.data[0];
    if (current && current.unit_amount === cents && current.currency === 'usd' && current.product === id) {
      log('ok      ', id, `$${p.price}`);
      continue;
    }
    log(current ? 'reprice ' : 'price   ', id, `$${p.price}`);
    if (dry) continue;
    await stripe.post('/v1/prices', {
      product: id, currency: 'usd', unit_amount: cents,
      lookup_key: lookupKey(p.id), transfer_lookup_key: 'true',
      tax_behavior: 'exclusive',
      metadata: { lunara_id: p.id }
    });
    if (current) await stripe.post(`/v1/prices/${current.id}`, { active: 'false' });
  }
  console.log(`${products.length} products in ${key.includes('_live_') ? 'LIVE' : 'test'} mode.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error(e.message); process.exit(1); });
}
