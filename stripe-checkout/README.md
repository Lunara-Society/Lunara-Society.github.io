# Stripe Checkout

Every purchase on lunarasociety.com goes through Stripe Checkout, where
buyers can pay by card, Apple Pay or Google Pay from any country. Stripe
emails the receipt. PayPal has been removed. The Lens app uses Stripe for
its web purchases too (see `lens-backend/`).

```
https://luiqtimzcsoqnizybifs.supabase.co/functions/v1/lunara-checkout
```

## How a sale works

1. **The buyer clicks Buy.** `lunara-pricing.js` asks the function for a
   checkout. The function creates an order reference such as
   `LO-7K2M94RTXQ3V8PNA` and saves the order in `stripe_orders` (status
   `open`) *before* sending the buyer to Stripe. If it can't save the
   order, no checkout opens.
2. **Stripe's page shows** the product, the exact price and a "How you
   receive it" note under the Pay button. For most products it also asks
   for the buyer's website and other details, so the work can start
   without extra email.
3. **After paying**, the buyer lands on `paid.html?order=LO-…`. That
   page asks the function about the order, and the function asks Stripe.
   The order is marked `paid` only when Stripe shows that product at
   exactly the catalogue price in USD. The page then shows the product,
   the amount, the email address the receipt went to, and the delivery
   steps. These are the same words the buyer saw on Stripe's page.
4. **Instant products open straight away.** The Compliance Kit and the
   report pages (`kit-access.html`, `compliance-report-access.html`)
   check the order reference the same way, so a guessed or edited link
   opens nothing.
5. **If the buyer closes the tab** before the confirmation page loads,
   an hourly job still finds the payment with Stripe and marks the order
   paid. The delivery list below is complete either way.

The amount is never taken from the browser. Prices and delivery steps
live in `lunara-pricing.js`, and `build-catalog.mjs` copies them into
`catalog.mjs`, which is the only thing the server charges from. CI fails
if the two disagree.

## What you need to do: deliver

Stripe emails you about every payment (turn this on under Stripe →
Settings → Notifications → Successful payments). Paid orders that you
haven't delivered yet are listed here:

```sql
select order_ref, product, amount_total/100.0 as usd, email, name,
       details, paid_at
from stripe_orders
where status = 'paid' and delivered_at is null
order by paid_at;
```

When you've sent the work, mark it delivered:

```sql
update stripe_orders set delivered_at = now() where order_ref = 'LO-…';
```

The customer has already been told exactly what follows for their
product:

### Article 50 Disclosure Pack — $75 (`disclose`)

Checkout asks for: website, system

1. Within 24 hours we email your Disclosure Pack to the address you paid with.
2. It holds disclosure wording drafted for your system, the machine-readable marking specification for its output, and a one page record of what you did and when.
3. Reply to that email if anything about your system has changed.

### Compliance Kit — $95 (`kit`)

Opens at once: `kit-access.html?order=…`

1. Your kit opens at once: use the button on the confirmation page.
2. Keep the link to that page. It opens your kit again whenever you need it.
3. Inside: the Article 50 and SB 942 obligation checklist, disclosure and synthetic-marking templates, and the evidence log an auditor would ask to see.

### Shield Verification — $75 (`shield`)

Checkout asks for: website, legal

1. Within 24 hours we email you your verification reference and a DNS record that proves you control your domain.
2. A person reviews your business identity and your domain.
3. When it passes, your entry goes live on the public register and we send your trust badge and machine-readable identity files.
4. Verification lasts six months. We remind you before it ends; nothing is charged automatically.

### Second Opinion — $240 (`second`)

Checkout asks for: website

1. Within 24 hours we email you asking for the advice you were given. Reply with it attached or pasted in.
2. Our written opinion comes back within 48 hours of receiving it: which parts still hold, every correction cited to the article that governs it.

### Compliance Intelligence Report — $390 (`cir`)

Opens at once: `compliance-report-access.html?order=…`

Checkout asks for: website, system

1. Start at once: describe your deployment on the report page and get your score straight away.
2. Your full written report follows by email within 24 hours: every finding cited to its article, with gap analysis and prioritised remediation.

### Regulatory Watch — $290 (`watch`)

Checkout asks for: website, system

1. Within 24 hours we email you to confirm the systems, sectors and jurisdictions we watch for you.
2. For six months we write to you whenever something that binds you changes, and only then.
3. We remind you before the six months end; nothing is charged automatically.

### Report with Governance Session — $740 (`cirplus`)

Opens at once: `compliance-report-access.html?order=…`

Checkout asks for: website, system

1. Start at once: describe your deployment on the report page and get your score straight away.
2. Your full written report follows by email within 24 hours.
3. Within 48 hours we email you to schedule your sixty minute governance session with the people who wrote it.

### AI Entity Verification — $540 (`agent`)

Checkout asks for: website, system

1. Within 24 hours we email you your verification reference and ask who operates the agent and which governance framework it runs under.
2. A person verifies the agent and its operator.
3. When it passes, its register entry with AI designation goes live, queryable by any system.
4. Verification lasts six months. We remind you before it ends; nothing is charged automatically.

### Clinical AI Governance Assessment — $1,950 (`clinical`)

Checkout asks for: website, system

1. Within one working day we email you to collect what we need about the deployment.
2. Your written assessment, mapping HIPAA, Article 50, SB 942 and Joint Commission together, is delivered within five working days of receiving it.

### Article 50 Evidence Pack — $2,450 (`evidence`)

Checkout asks for: website, system

1. Within one working day we email you to collect what we need about the system.
2. Your Evidence Pack, with the duties assessed, the accountable party named and the articles cited, is delivered within five working days of receiving it.

### Vendor Certification — $7,400 (`vendor`)

Checkout asks for: website, system

1. Within one working day we email you to schedule the assessment of up to three systems.
2. After review: certification against the seven constitutional pillars, a public register entry and your tender evidence dossier.
3. Certification lasts twelve months. We remind you before it ends; nothing is charged automatically.

Invitational memberships are not sold on the site. To charge someone
who has been accepted, create a Payment Link in the Stripe dashboard
and send it to them. Lens plans and credits are bought inside the app.

## Routes

| Route | Does |
|---|---|
| `GET /health` | Returns `{ configured, mode, webhook, products }`. Never shows the key. |
| `POST /checkout` `{ product, return_to }` | Returns `{ url, order }` and saves the order first. |
| `GET /order?ref=LO-…` | Checks the order with Stripe and returns the product, the amount, the delivery steps, the access link if there is one, and a masked email. |
| `GET /settle` | Checks recent open orders with Stripe and records the ones that were paid. Runs hourly from `.github/workflows/settle-orders.yml`. |
| `POST /webhook` | Optional. Settles orders and records refunds. |

## Safety

- **The key.** It lives only in Supabase secrets (`LUNA-SECRET-KEY` or
  `STRIPE_SECRET_KEY`). It needs **Checkout Sessions: Write**.
- **Tables.** `stripe_orders` and `stripe_events` have RLS on and no
  policies, so only this function can read them.
- **Return links.** Stripe only returns buyers to pages on
  lunarasociety.com.
- **Unpaid or mismatched orders.** An order that is unpaid, expired, or
  paid at the wrong amount or for a different product never opens
  anything.

## Changing a price or what a product delivers

1. Edit `lunara-pricing.js`.
2. Run `node stripe-checkout/build-catalog.mjs`.
3. Redeploy `index.ts`, `checkout-core.mjs` and `catalog.mjs` to the
   `lunara-checkout` function with `verify_jwt` off.
