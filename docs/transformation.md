# The transformation: diagnosis and direction

Written before the code changed, from the live site (25 October 2026), the repository and the database. It records what was found, what was decided and why, so the next change can argue with a reason rather than a taste.

## What Lunara Society is, commercially

An institution of record for AI trust, founded in 2026 and still pre-revenue: one paid order (the owner's test), no verified register entries (one application pending) and small traffic. Most visits arrive from outreach letters, which open `passport.html?d=<the prospect's domain>`, and from Google, which lands on `shield.html` and `registry.html`.

The commercial ladder runs from free to paid:

1. **Free hooks.** Passport scan, the AI Passport League, "Does the law reach your AI?", the register lookup, the regulatory record and the seal you can break.
2. **Low-friction subscriptions.** Passport Monitor ($19 a month) and Shield Verification ($75 every six months).
3. **Deadline products.** The Article 50 Disclosure Pack ($75), the Compliance Kit ($95), the Compliance Intelligence Report ($390) and the Evidence Pack ($2,450).
4. **Higher tiers.** AI Entity Verification ($540) and Vendor Certification ($7,400).
5. **Agents and the consumer app.** The Agent Network tiers and Lunara Lens.

Every price comes from `lunara-pricing.js`, and none of them changes here.

## What stays, because it is the identity

The brand world is distinctive and the owner chose it piece by piece. These parts stay:

- the obsidian ground, the champagne gold and the single moonlight key;
- the real moon, lit by tonight's phase;
- the official emblem;
- the intro, once every twelve hours;
- the page-to-page locks, which the owner asked for and then asked to be "more epic";
- the desktop layout on phones (`width=1120`), a standing owner decision;
- no stars, embers or background particles.

The instruments built on real data are the best thing on the site: the passport scan, the horizon of obligations, the seal you can break and the register city. The owner's own words were that the passport effect is "what I want more of… similar effects in more places".

## What is wrong, measured

1. **Three visual generations.** The commercial core is in the oldest one:
   - 40 pages use the 4,000-line `lunara-refined.css`: Shield, certify, join, registry, institution, contact and others.
   - 18 use `lunara-page.css`.
   - 9 use the OS shell.
   - The oldest generation sets body text in 50% white (5.4:1), 14px gold body copy on `certify.html` (4.7:1), and dozens of labels under 12px. On a phone, the 1120px layout is scaled to about 35%, so an 11px label renders at under 4pt.
2. **Walls of text.** `certify.html` is 11,849px tall. The owner's complaint ("long long long massive text and will totally get users so bored") still holds on every legacy page.
3. **Effects that work against reading:**
   - Headings arrive word by word through a 6px blur, taking up to 1.8 seconds, and screenshots catch them still blurred.
   - A full-screen WebGL smoke shader runs at about 33 frames a second on every page, for ever.
   - The same giant coin ("the letterbox") sits above every legacy footer.
   - On the homepage, the main thread has 22 long tasks in two seconds of idle.
4. **A broken footer.** On the legacy pages the shell swaps the footer into the page's own narrow container, so its six columns are crushed into about 880px, and on `certify.html` into about 450px.
5. **Scattered certification.** The same offer appears on `shield.html`, `certify.html` and `join.html`, under different words and layouts. There is no page that shows every service and its price. The homepage's "every service and price" link points at `certify.html`.
6. **A hostile landing for prospects.** A prospect who follows our letter lands on their own domain stamped NOT REGISTERED in red. The paid offer then comes before the free fixes the letter promised.

## The direction: instruments of record

The site is an observatory at night that keeps a record. Every page should open on a working instrument or a drawing made from real data, then say the least it needs to, and keep the rest a click away.

**Principles:**

1. **Legible first.**
   - Body text is at least 17px, at 9:1 or better.
   - Meta text is at 7:1 or better.
   - Nothing a reader must read is under 12px.
   - Weight 300 is only for display type.
2. **Show, then tell.** An instrument, a diagram or a real record comes before the paragraph about it. Long passages collapse into expandable details, kept in the HTML for crawlers and screen readers.
3. **One light, one gold.**
   - Gold is for authority and action, under 5% of a screen.
   - Crystal green is a check that passed.
   - Amber is "not yet".
   - Red is kept for a real failure or a revocation, never for a stranger who simply has not applied.
4. **Motion that means something.** Scan, land, stamp and settle. Text is never blurred in, and nothing hides content until a script runs. Any loop that runs continuously must stop when nothing is happening.
5. **One system.** Every page draws from `lunara-materials.css` and `lunara-system.css`.

## What changes

| Area | Change | Why |
|---|---|---|
| Tokens | A type scale and text-contrast tokens in `lunara-materials.css` | One scale instead of one per page |
| `lunara-system.css` | Shared typography, buttons, forms, cards, details, and a bridge that re-sets the legacy pages | 40 pages move to one look without rewriting their logic |
| Navigation | Passport, Registry, Intelligence, Certification, Pricing, For AI Systems, Lens app. The emblem is the way home. | Leads with the free hook and gives prices a place |
| Footer | Moved to the end of the page, regrouped, every existing link kept | Fixes the crushed footer; no page loses its inbound link |
| `pricing.html` | New. Every public product, grouped by what the buyer needs to prove, read from the pricing table | One honest answer to "what does it cost" |
| Headings | A quick rise without blur | Readable the moment they are on screen |
| Smoke shader | Draws while something moves, then rests | Same look, no permanent GPU loop |
| Letterbox coin | Retired | The same coin on 30 pages is filler |
| `passport.html` | The free fixes come before the offer. Not registered is stamped in amber. | Keeps the letter's promise and drops the accusation |
| `shield.html` | The process as an instrument, and a clearer application form | The page Google sends people to |
| Homepage | Clearer hero line, no colliding labels on the horizon, the instrument panels tightened, prices linked to the pricing page | First impression |
| Registry, institution, contact, join, certify | Restyled on the system, long passages folded | Commercial pages that read |

## What does not change

- No price, product, renewal, membership privilege or availability changes.
- No checkout, registry, auth or payment logic changes.
- No invented numbers, customers or activity. Where a count is zero, it says zero.
- The locks, the intro, the moon and the desktop viewport stay.

## Rollback

The work ships as one pull request. Reverting its merge commit restores the previous site, and Pages redeploys. No backend or database change is involved.
