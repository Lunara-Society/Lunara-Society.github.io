# Rosario — handover

## What she is

An institutional agent, not a chatbot. She is the address published in
`llms.txt`, so what she says is what Lunara said.

- **Base44 app:** `6a8862a8ee770cf4f21221c9`
  — https://app.base44.com/apps/6a8862a8ee770cf4f21221c9/editor/preview
- **Knowledge base (Drive):** `LUNARA BRAIN / 22 - ROSARIO CANON`
  — folder id `1BQl__A_jXU_tA-Bdk-RJxIEgeRQCPjmn`
- **Generator:** `tools/build-rosario-brain.mjs`
- **CI gate:** `tools/verify-rosario-brain.mjs` — fails the deploy if her brain
  drifts from the corpus, or if the doctrine's refusal rules are removed

## Connecting Google Drive

In the Base44 editor, connect the **Google Drive** connector. Read access to
the canon folder is all she needs — she reads it, she does not write to it.

## Connecting WhatsApp

The app now exposes a webhook that takes `{ sender, text }` and returns her
reply as plain text. Point your WhatsApp Business webhook at it. There is
already a Cloudflare Worker in this repo at `whatsapp-webhook/` that Meta's
dashboard was pointed at — reuse or replace it.

Her WhatsApp replies drop the markdown tables and long citation blocks, but
still carry the effective date, instrument, article and source link on any
regulatory claim.

## Regenerating her brain

```
node tools/build-rosario-brain.mjs
node tools/verify-rosario-brain.mjs
```

Then re-upload the changed files to the Drive folder. **Never edit them in
Drive** — that creates a second answer, and the one a prospect hears is
whichever is stale.

## The thing not to undo

She is built to refuse, not to be confident. She states no date, price or
certification status she has not just read, and says the lookup failed when a
source is unreachable.

"Never makes mistakes" was the original brief and it is the one property that
would break her. An agent that claims infallibility has already committed the
error this institution has published four corrections about — overstating what
is settled — and she is the address a prospect writes to. Near-zero error comes
from the refusal.

Her answering guide lists sentences she must never say. The first is
"I never make mistakes."

## Still open

- Google Drive connector is not yet connected (needs your browser consent).
- The Brain Master Index needs one line adding for `22 - ROSARIO CANON`, per
  its own maintenance rule. Not edited automatically — it is hand-maintained.
