# Stripe Checkout

Buy buttons send buyers to Stripe's payment page, where they can pay by card,
Apple Pay or Google Pay from any country. Stripe emails the receipt. PayPal
stays available as "Or pay with PayPal" under each button, and the button
falls back to PayPal if Stripe can't be reached.

```
https://luiqtimzcsoqnizybifs.supabase.co/functions/v1/lunara-checkout
```

| Route | Does |
|---|---|
| `GET /health` | `{ configured, mode, webhook, products }`. Never shows the key. |
| `POST /checkout` `{ product, return_to }` | `{ url }`: the Stripe Checkout page. |
| `GET /session?id=cs_…` | Whether that payment went through. Used for the thank-you note when the buyer comes back. |
| `POST /webhook` | Records payments and refunds in `stripe_payments`. Optional. |

## Safety

- **Prices.** The price comes from `catalog.mjs`, which is generated from
  `lunara-pricing.js`. Anything the browser sends as an amount is ignored.
- **Products.** Invitational products and Lens plans can't be bought here.
- **Return links.** Stripe only sends buyers back to pages on lunarasociety.com.
- **The key.** It lives only in Supabase secrets, and only this function can
  read it. The key only needs **Checkout Sessions: Write**.
- **Tables.** `stripe_payments` and `stripe_events` have RLS on and no
  policies, so only this function can read them.

## Changing a price

1. Edit `lunara-pricing.js`.
2. Run `node stripe-checkout/build-catalog.mjs`.
3. Redeploy `index.ts`, `checkout-core.mjs` and `catalog.mjs` to the
   `lunara-checkout` function with `verify_jwt` off.

CI fails if the catalogue doesn't match the pricing file.

## Optional: record payments in Supabase

Payments already show in the Stripe dashboard. To also keep them in Supabase:

1. Go to https://dashboard.stripe.com/webhooks and click **Add endpoint**.
2. Use the URL `https://luiqtimzcsoqnizybifs.supabase.co/functions/v1/lunara-checkout/webhook`.
3. Select these events: `checkout.session.completed`,
   `checkout.session.async_payment_succeeded`,
   `checkout.session.async_payment_failed` and `charge.refunded`.
4. Add the endpoint's signing secret to Supabase as `STRIPE_WEBHOOK_SECRET`.
