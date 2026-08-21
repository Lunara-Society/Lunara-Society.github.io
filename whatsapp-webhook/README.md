# WhatsApp webhook

The endpoint Meta's dashboard asks for in **Step 2, Production setup →
Configure Webhooks**.

## Why it is not on lunarasociety.com

Meta verifies a webhook by sending `GET ?hub.mode=subscribe&hub.verify_token=…&hub.challenge=…`
and requiring the value of `hub.challenge` back as plain text. GitHub
Pages serves files; it cannot read a query string or compose a reply, so
no path on our own domain can pass that handshake. `worker.js` runs on
Cloudflare Workers instead, and the callback URL is a `workers.dev`
address.

If we ever want it on our own domain, add a route in Cloudflare for
`lunarasociety.com/whatsapp/*` pointing at the same Worker. That needs
the domain's DNS on Cloudflare, which it currently is not, and it
changes nothing about how the Worker behaves.

## Deploying it

No CLI needed. In the Cloudflare dashboard:

1. **Compute (Workers) → Create → Start with Hello World → Deploy.**
   Name it `lunara-whatsapp`. Cloudflare gives you a URL ending in
   `.workers.dev` — that is the Callback URL.
2. **Edit code.** Delete what is there, paste all of `worker.js`,
   **Deploy**.
3. **Settings → Variables and Secrets.** Add:

   | Name | Type | Value |
   |---|---|---|
   | `WHATSAPP_VERIFY_TOKEN` | Secret | the long random string, same one you type into Meta |
   | `WHATSAPP_APP_SECRET` | Secret | Meta → App settings → Basic → App secret |

   Deploy again after adding them. Variables only reach the running code
   on the next deploy.
4. In Meta's dashboard put the `.workers.dev` URL in **Callback URL**
   and the same random string in **Verify token**, then **Verify and
   save**.
5. Still in Meta, **Webhook fields → subscribe to `messages`**. Without
   this the endpoint verifies and then receives nothing, which looks
   identical to a broken endpoint.

## Making it actually reply

The first version of this Worker received messages and never sent one. It
verified, it logged, and to anyone holding a phone it was indistinguishable
from a broken endpoint. Three more variables close that gap — all from
**Meta → WhatsApp → API Setup**:

| Name | Type | Where it comes from |
|---|---|---|
| `WHATSAPP_TOKEN` | Secret | Access token on that page. The temporary one dies in 24h; a System User token does not. |
| `WHATSAPP_PHONE_NUMBER_ID` | Secret | **Phone number ID** — the long number beside the phone number, not the phone number. |
| `ROSARIO_ENDPOINT` | Secret | Rosario's Base44 webhook. Takes `{sender, text}`, returns `{reply}`. |
| `GRAPH_VERSION` | Variable | Optional. Only set it if a send fails with an unsupported-version error. |

Without the first two the Worker logs `Cannot send:` and stays quiet. Without
the third it answers, but the answer is that it cannot reach its sources —
deliberately, because a silent bot lets the sender assume the last thing they
were told still stands.

## The phone numbers, which is where this usually breaks

There are **two** numbers and confusing them wastes an evening.

**The sender** is Meta's free test number, shown on the API Setup page. You do
not supply it and you should not try to use your own — a number registered to
the Cloud API can never be used in the WhatsApp app again, and Meta refuses a
number that already has a WhatsApp account on it.

**The recipient** is your own phone, added under *To → Manage phone number
list*. Format is country code + number, digits only: **no `+`, no spaces, no
dashes, no leading zero.** `+505 7765 9187` goes in as `50577659187`. Get this
wrong and Meta reports the number as not a WhatsApp user, which is the single
most misleading error in the whole product.

Up to five test recipients. Everyone else is silently rejected.

## Who has to message first

A business may send free-form text only **within 24 hours of the last inbound
message**. Outside that window only a pre-approved template goes through.

So "the user scans a QR and messages Rosario" is the *easy* direction, and
"Rosario messages the user first" is the hard one — the opposite of what most
people assume. Generate the QR with:

```
python3 tools/wa-qr.py <sender number, digits only> --text "Hello Rosario"
```

It decodes its own output before writing the file and refuses to emit a QR it
could not read back.

## The two things that will go wrong

**"The callback URL or verify token couldn't be validated."** Almost
always one of: the token in Cloudflare does not match the token typed
into Meta, or the variables were added without redeploying. Open the
Worker's **Logs** tab and press Verify again — a mismatch logs
`Verification rejected`, an unset variable logs
`WHATSAPP_VERIFY_TOKEN is not set`.

**Verified, but no messages arrive.** Either `messages` was never
subscribed in step 5, or the app is still unpublished. Meta only
delivers production events to published apps; before that you get test
events from the dashboard button and nothing else.

## Security

`WHATSAPP_APP_SECRET` is what stops anyone who learns the URL from
posting fabricated messages. The Worker enforces the
`X-Hub-Signature-256` HMAC whenever the secret is set, and logs a
warning on every request while it is not. Set it.

Neither value belongs in this file. Both are read from the Worker's
environment, because everything in this directory is published with the
site and is world readable.

## Testing without Meta

```bash
# handshake — prints the challenge back
curl "https://<your-worker>.workers.dev/?hub.mode=subscribe&hub.verify_token=<token>&hub.challenge=1158201444"

# wrong token — prints Forbidden
curl "https://<your-worker>.workers.dev/?hub.mode=subscribe&hub.verify_token=nope&hub.challenge=1158201444"
```

`test_worker.mjs` in this directory covers the handshake, signature
verification, tampered bodies and malformed payloads. Run it with
`node test_worker.mjs` from a copy of `worker.js` named `worker.mjs`.
