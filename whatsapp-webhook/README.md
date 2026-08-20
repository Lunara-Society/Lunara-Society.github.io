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
