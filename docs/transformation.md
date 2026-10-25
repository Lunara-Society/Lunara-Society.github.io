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
- The moon and the desktop viewport stay. The intro and the locks stayed in the first pass; they were remade in the second (below).

## Second pass: the intro and the passage between pages

The owner asked for the intro, the locks and every page change to be remade, more futuristic and epic, and different from before. The old versions forged the seal from sparks and opened biometric scanners, card readers and a genome lock between pages, with a "granted" chime. That told a visitor they were being checked when nothing was checked, and the sparks were exactly the decoration the directive rules out. The remake keeps the scale and the ceremony and makes every part true.

**The Aperture (`lunara-intro.js`, `lunara-intro.css`).** A state machine (grid, signal, landed, ring, read, iris, mark, open, done) on one clock. A precision grid rises, a gold signal runs the horizon and climbs into an instrument ring, and four readings come off the ring. Each reading is filled only when the check behind it has finished: tonight's moon phase, the Ed25519 signature on the obligations corpus verified in the browser, the register's live count, and the next binding date from the corpus. A nine-blade iris opens on the official seal. Then the ring lifts off the instrument and lands on the homepage moon. About 3.7 seconds, at most once every twelve hours. Skip and Escape leave at once, Enter goes straight to the opening, and reduced motion gets the composed instrument, still. No particles anywhere.

**The Transit (`lunara-locks.js`).** Leaving a page closes the same nine-blade iris over it, stopping at a porthole. Inside, the destination's own mechanism runs:

- home: a lunar phase dial stopping on tonight's phase
- passport: a passport page read by a scan bar and stamped
- registry: a ledger drum
- intelligence: an orrery aligning on the present
- certification: a seal press
- pricing: a meter settling on what checking costs
- for AI systems: signals running a circuit into the protocol
- lens: lens elements coming into focus
- every other page: a blast door opening on a corridor

The destination is named beside the porthole with one true sentence taken from that page, and the panel says in words that it is a scene between pages, not a security check. A full scene plays at most once a minute, about 1.8 seconds; otherwise the iris closes briefly on the destination's name. Esc, Enter, a click or Skip goes at once. Sound stays off until the visitor turns it on.

**The arrival (`lunara-shell.css`).** Every page opens the way the last one closed: the nine blades, drawn in CSS as nine half-planes, turn back and the opening widens from the centre. It is painted from the first frame and needs no script.

**The Command Center entrance** wears the same instrument ring. Its readout was already honest: it reports how many of its real checks are degraded.

## Rollback

The work ships as one pull request. Reverting its merge commit restores the previous site, and Pages redeploys. No backend or database change is involved.
