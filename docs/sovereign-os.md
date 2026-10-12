# Sovereign Intelligence OS: engineering note

Written before any code changed. It records what the platform is, which sources are authoritative, and how the OS sits on top of them without becoming a second application.

## What exists (as inspected, 12 October 2026)

| Layer | What it is | Where |
|---|---|---|
| Site | Static HTML on GitHub Pages, no build step, no framework, no package manager. Shared chrome is injected at runtime by `lunara-shell.js`/`.css`. WebGL sky and shutter come from `lunara-engine.js`; page-to-page locks from `lunara-locks.js`; the homepage intro from `lunara-intro.js`. | repo root |
| Viewport | A fixed 1120px desktop layout on every device, a standing owner decision enforced by `tools/verify-viewport.mjs`. The OS keeps it, which means the directive's 320px and mobile-first requirements are deliberately not adopted. | all pages |
| Backends | Supabase edge functions in project `luiqtimzcsoqnizybifs`: `lunara-registry` (register, passports, partners, A2A, Agent Network, ops), `lunara-checkout` (Stripe, server-side prices), `lunara-lens`, `lunara-auth` (members, HMAC sessions), `lunara-mcp`, `maze` (public-source monitor, 5-minute sweep), `lunara-invoice`, `lunara-probe`. | `registry-backend/`, `stripe-checkout/`, `lens-backend/`, `member-auth/`, `maze/` |
| Database | Postgres with RLS enabled on every table; the functions use the service role. | Supabase |
| Auth | `lunara-auth` issues a signed session token kept in `localStorage.lunara_session_token`. Owner rights are decided on the server (`isOwner(email)`) on every privileged route. `opsStats` also accepts `LUNARA_OPS_KEY`. | `member-auth/`, `registry-core.mjs` |
| Agents | The A2A agent at `lunara-registry/a2a` (v0.3 JSON-RPC, v1.0 `SendMessage`, HTTP+JSON), the agent card at `/.well-known/agent-card.json`, and the Agent Network (trials, missions, tiers, Trust Index). | `a2a.mjs`, `network.mjs`, `trials.mjs` |
| Payments | Stripe Checkout created on the server from `catalog.mjs` (built from `lunara-pricing.js`). Fulfilment happens only after the server has asked Stripe (hourly `/settle` sweep); the webhook secret is not configured. | `stripe-checkout/` |
| Evidence | Detached Ed25519 assertions over RFC 8785 canonical JSON for published documents (`/.well-known/assertions.json`, `keys.json`). The one key is marked `status: development`. Register entries are a named human review plus a DNS TXT proof; they are not yet signed (the signing key is not installed). | `tools/lunara-assertions.mjs`, `signing.html` |
| Regulation | `corpus/obligations.json` (10 obligations, each with article, source and a verified date), `corpus/applicability.json` (marked interpretation), `intelligence.html` (kept in step with the corpus by `verify-intelligence.mjs`). | `corpus/` |
| Tests | Node suites: auth 133, lens 22, checkout 35, registry 41, maze 8. Twelve verifiers run in CI. All green at baseline. | `.github/workflows/pages.yml` |

## Authoritative sources (no second source of truth)

- Register entries: `registry_entries` through `shieldRegistryList` and `shieldRegistryLookup`. Base44 is retired; nothing reads from it.
- Agents: `network_agents`, public only through `networkDirectory` and `networkProfile`. Only Associate tier and above are listed, and the OS keeps that disclosure rule.
- Missions: `mission_submissions` (pending → approved | rejected, the owner decides, the server enforces it).
- Passports: `passport_scans` through `passportBadge` and `passportLeague`.
- Orders: `stripe_orders`, owner-only.
- Background worker: `maze/health` (last sweep, per-source state).
- Documents: the signed corpus and assertions served from this repository.

## What the OS adds

1. **One shell** (`lunara-os.css`, `lunara-os.js`): design tokens, a navigation rail, a header, the command palette (Ctrl/⌘K plus a visible button), the context inspector, a status vocabulary (Operational, Degraded, Unavailable, Unknown, Not configured), freshness stamps, and optional synthesized sound that is off by default.
2. **Central structure** (`lunara-os-core.js`): Canvas 2D, no new dependency. Its states (idle, connecting, processing, active, attention, degraded, offline) are driven only by real health checks and real requests. It pauses offscreen and when the tab is hidden, and draws one still frame under reduced motion.
3. **Workspaces**, root-level pages so the viewport, SEO and sitemap gates apply to them:
   - `command.html`: real health, activity and priority queue.
   - `investigate.html`: search over real records, with AI answers labelled.
   - `agent-atlas.html`: graph plus list, the trust inspector and the A2A inspector.
   - `missions.html`: the catalogue and the lifecycle actually implemented.
   - `evidence-registry.html`: in-browser Ed25519 and SHA-256 verification with explicit states.
   - `regulation.html`: the corpus with computed dates.
   - `simulate.html`: a passport what-if. It never writes.
   - `audit.html`: the public activity stream and the owner's hash-linked audit log.
   - `status.html`: system status.
4. **Backend** (`registry-backend/os.mjs`):
   - `systemStatus`: a real database round-trip, plus configured or not-configured flags. No secrets and no hostnames.
   - `activityFeed`: public events from the real tables.
   - `opsActivity` and `auditLog`: owner only, refused with 403 otherwise.
   - An append-only, hash-linked `admin_audit` table, written by every privileged decision route.
   - One additive migration. No existing column changes.
5. **Transitions**: the locks stay, with honest labels. "Opening", not "Access granted". They are skippable with Esc or a click, and a cooldown keeps every click from costing two seconds. The intro does not replay for returning visitors.

## What it does not do

- It does not change prices, products, tiers, renewals or payment conditions.
- It does not label an agent verified for registering.
- It does not call an application timestamp a trusted timestamp, or the database immutable.
- It does not show simulated numbers as observed ones.
- It does not autoplay sound.

## Rollback

Every change ships as one PR. The static site rolls back by reverting the merge commit (Pages redeploys). The registry function rolls back by redeploying the previous version's files from git. The migration only adds a table and its functions, so a rollback leaves it unused and harmless.
