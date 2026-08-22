# Sending mail as the institution

Two paths exist. Only one of them works today.

## The state of it

| | |
|---|---|
| Resend domain | `lunarasociety.com`, id `0311a467-8a90-4622-9892-8b4ebd3a7fe0`, region `eu-west-1` |
| Status | **`not_started`** — none of the three DNS records below exist |
| Sending | enabled in Resend, blocked in reality |
| Receiving | disabled |

`not_started` means mail sent through Resend right now fails SPF and
DKIM and lands in spam or is rejected outright. For a first approach
from an institution whose product is trustworthiness, arriving in a
spam folder is worse than not arriving.

Sending from Resend's shared `onboarding@resend.dev` would technically
work and is not an option: a letter about institutional trust cannot
come from someone else's domain.

## To unblock Resend — three DNS records

DNS for `lunarasociety.com` is at **Spaceship** (`launch1.spaceship.net`,
`launch2.spaceship.net`), not at GitHub, and not at Cloudflare. GitHub
Pages only serves the site.

| Type | Name | Value | Priority | TTL |
|---|---|---|---|---|
| TXT | `resend._domainkey` | `p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDZ+NZgMErLEejzbZqO4cUJccNnDK6EMOyhfM8QlsT+TqbluCXQ3txVbvmjHYpayo2RVTm8dSDZIPfrfRmsoN5/T+HpcQG9PN8rXGIJHHPlvRnGTvApqeCeY3nUwau1zDrj4iv4d4X2JqlaYev4mDG4UUg9Ob5p2vPBDJ7KQwKz0QIDAQAB` | — | Auto |
| MX | `send` | `feedback-smtp.eu-west-1.amazonses.com` | 10 | Auto |
| TXT | `send` | `v=spf1 include:amazonses.com ~all` | — | Auto |

These are new and additive. **Do not touch the existing apex or `www`
records** — the site is on GitHub Pages via a CNAME and changing those
takes lunarasociety.com down.

Then trigger verification in Resend. Propagation is usually minutes.

### A reply address has to receive

`rosario@lunarasociety.com` is the institutional contact named in
`llms.txt`, so it is the consistent `from`. Resend shows **Receiving:
disabled**, and enabling it needs its own MX record. Until that is
done, that mailbox does not exist in the direction that matters.

A letter whose entire ask is "reply and tell us when your generative
features shipped", sent from an address nobody can reply to, is worse
than no letter. So do not send from `rosario@` until receiving works
and someone is reading it.

## What works today

Gmail, `lunarasociety@gmail.com`. It sends, it has a reputation, and —
the part Resend does not have — someone reads the replies.

It is a weaker signature than `rosario@lunarasociety.com`. It is also
the only address here that can currently hold a conversation, and for a
first approach that asks a question, that decides it.

Plain text rather than the HTML template, deliberately. A cold HTML
email reads as a marketing send and is filtered like one; a plain
message from a person is both more deliverable and more likely to be
answered. The HTML render still exists in the renderer if a later,
different kind of mail wants it.

## The letters

They are **not in this repository, on purpose.** Everything committed
here is served — that is how `tmp/` came to be readable at
`lunarasociety.com/tmp/`. A letter assessing a named company's
compliance posture, published on the domain of the institution that
wrote it, is that mistake with a worse subject. `.gitignore` blocks
`outreach/letters/` so a `git add -A` cannot sweep them in.

They live in the working directory alongside `render.mjs`, and the ones
that have been prepared are sitting in Gmail drafts.

## `render.mjs`

Turns a letter's JSON into plain text and HTML from one source, so the
text part cannot drift into saying something the HTML does not.

```
node outreach/render.mjs <letters-dir> <name> [<name> …]
```

Two things it does that matter more than the formatting:

**The countdown is computed, never typed.** `{{DAYS}}` resolves at
render time against 2 December 2026. The drafts already carried "103
days" written by hand, and by the next morning it was 102. A letter
whose whole argument is that everyone else has the date wrong cannot
carry a stale number in its second paragraph.

It counts calendar days from today's date, not a rounded timestamp
difference — those disagree by one for half of every day, and "days
from today" means calendar days to the person reading it.

**The pull quote is HTML only.** A pull quote is a sentence lifted out
of the body and set in a border. Strip the border for the text part and
it is just the same sentence twice, which is exactly how it read.

## One prospect was skipped, and why

One company's contact address is obfuscated behind Cloudflare email
protection. That encoding is trivially reversible and exists
specifically to stop automated collection. Decoding it to send
unsolicited mail would be reading a "no" and proceeding anyway. Their
contact form is open to a person who wants to write to them.
