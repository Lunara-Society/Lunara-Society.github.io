# Stripe Invoicing

Buyers who can't use the PayPal link (or who just want an invoice) can now
get a Stripe invoice and pay it by card or wallet from any country.

```
https://luiqtimzcsoqnizybifs.supabase.co/functions/v1/lunara-invoice
```

| Route            | Body                                              | Answers                         |
|------------------|---------------------------------------------------|---------------------------------|
| `GET /health`    |                                                   | `{ configured, mode, webhook }` |
| `POST /request`  | `{ product, email, name, country, tax_id? }`      | `{ url, number }`: Stripe's hosted invoice page |
| `POST /webhook`  | a Stripe event, signed                            | `{ received }`                  |

## How it works

This follows Stripe's implementation plan for invoicing that our own code
triggers:

1. **Catalogue.** `sync-catalog.mjs` writes every product in
   `lunara-pricing.js` to Stripe. Each one becomes Product `lunara_<id>`, and
   its price goes under the lookup key `lunara_<id>_usd`. The pricing table is
   still the only place a price is written. Run the script again after
   changing a price.
2. **Request.** The "Pay by invoice instead" link under each buy button opens
   a form. The function looks up the price in Stripe (the browser never sends
   an amount), finds or creates the customer, creates the invoice, adds the
   item, finalizes it and returns `hosted_invoice_url`. The buyer goes straight
   to that page.
3. **Payment.** Stripe's Hosted Invoice Page handles cards, wallets and 3DS.
4. **Records.** The webhook verifies Stripe's signature and records
   `invoice.paid`, `invoice.payment_failed`, `voided`, `uncollectible`,
   refunds and credit notes in `stripe_invoices`, `stripe_events` and
   `stripe_adjustments`. These tables have RLS on and no policies.

**Website invoices are not emailed by Stripe.** If they were, anyone could
type any address into the form and make Stripe send a Lunara invoice to it.
For a company that sells protection from spam, that is a spam relay.
Renewals go to customers we already know, so `renew.mjs` does send its
invoices, and Stripe sends reminders.

Other protections:

- Invitational products and Lens plans can't be invoiced from the website.
  The `invoiceable` metadata on the Stripe product enforces this.
- If the same person asks again for the same product, they get the same open
  invoice.
- Requests are limited to 3 per email address per hour and 6 per IP address
  per hour. IP addresses are stored only as hashes.
- The form has a honeypot field.
- Every Stripe write carries an idempotency key, and the Stripe API version
  is pinned.

## Files

| | |
|---|---|
| `invoice-core.mjs` | All of the logic: Stripe client, invoice creation, webhook signature check, routes. |
| `index.ts` | The Deno entry point: Postgres storage and secrets. |
| `schema.sql` | The three tables (already applied). |
| `sync-catalog.mjs` | Writes `lunara-pricing.js` into Stripe. |
| `renew.mjs` | Raises and **emails** an invoice (renewals, invitations). |
| `sandbox-check.mjs` | End-to-end check against a real Stripe sandbox: creates an invoice, pays it with a test card and checks the webhook records it. |
| `test_invoice.mjs` | 22 offline tests. Runs in CI. |

## Switching on: sandbox

1. Supabase → Edge Functions → Secrets, add:
   - `STRIPE_SECRET_KEY`: the `sk_test_…` key
   - `STRIPE_WEBHOOK_SECRET`: the signing secret of the test-mode endpoint
     `we_1UMUDVCzJFx2Hv2t1D851jFz` (Stripe → Developers → Webhooks)
2. Run `curl …/lunara-invoice/health` and check that it shows `"configured":true,"mode":"test","webhook":true`.
3. On the site, click "Pay by invoice instead" and pay with `4242 4242 4242 4242`.
   Then check the result in Supabase:
   `select number, product, status, paid_at from stripe_invoices order by created_at desc;`

## Switching on: live

1. Activate the Stripe account (business details and bank account).
2. Under Settings → Branding, add the logo and colours. Under Settings → Invoices,
   set the invoice number prefix (for example `LUNA`) and the footer.
3. `STRIPE_SECRET_KEY=sk_live_… node stripe-invoicing/sync-catalog.mjs --live`
4. In live mode, create a webhook endpoint for the same URL with the same
   events: `invoice.finalized`, `invoice.paid`, `invoice.payment_failed`,
   `invoice.voided`, `invoice.marked_uncollectible`, `charge.refunded`,
   `credit_note.created`.
5. Replace both Supabase secrets with the live values. Nothing needs to be
   redeployed, because the function reads the mode from the key.

Never commit a Stripe key. Everything in this repository is served publicly.
