/* ═══════════════════════════════════════════════════════════════════
   WHATSAPP WEBHOOK — Cloudflare Worker

   Meta's webhook needs something that can answer an HTTP request and
   echo part of it back. GitHub Pages cannot: it serves files, so it has
   no way to read hub.challenge off the query string and return it. That
   is the whole reason this file exists, and it is why the callback URL
   is a workers.dev address rather than lunarasociety.com.

   Two jobs, and they are quite different:

     GET   Meta's verification handshake, done once when you press
           "Verify and save", and again whenever you change the URL.
           It sends hub.mode, hub.verify_token and hub.challenge, and
           expects the challenge back as plain text with a 200. Any
           other response and the dashboard rejects the endpoint.

     POST  Every incoming message and status update thereafter. Meta
           wants a 200 quickly and will retry if it does not get one,
           so we acknowledge first and do the work afterwards.

   Configuration lives in the Worker's environment, never in this file,
   because this file is published with the site and is world readable:

     WHATSAPP_VERIFY_TOKEN   required. Any long random string. The same
                             value goes in the dashboard's Verify token
                             field. Nothing else uses it.
     WHATSAPP_APP_SECRET     optional but strongly wanted. Found under
                             App settings → Basic → App secret. Without
                             it, anyone who learns this URL can post
                             fabricated messages to it.
     MESSAGES                optional KV namespace. Bind one and recent
                             messages are kept for a week so you can
                             read them; leave it unbound and they are
                             only logged.
   ═══════════════════════════════════════════════════════════════════ */

const WEEK = 60 * 60 * 24 * 7;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === 'GET') {
      return handleVerification(url, env);
    }

    if (request.method === 'POST') {
      return handleEvent(request, env, ctx);
    }

    return new Response('Method not allowed', {
      status: 405,
      headers: { 'allow': 'GET, POST' }
    });
  }
};

/* ─── Meta's one-time handshake ─────────────────────────────────────
   Returns the challenge verbatim as text/plain. Returning JSON, or a
   200 with any other body, fails verification with a message that does
   not explain why, so the content type matters here. */
function handleVerification(url, env) {
  const mode = url.searchParams.get('hub.mode');
  const token = url.searchParams.get('hub.verify_token');
  const challenge = url.searchParams.get('hub.challenge');

  const expected = env.WHATSAPP_VERIFY_TOKEN;

  if (!expected) {
    // Misconfiguration on our side, not a rejection of Meta. Say so in
    // the log, because the dashboard error will not.
    console.error('WHATSAPP_VERIFY_TOKEN is not set on this Worker');
    return new Response('Endpoint not configured', { status: 500 });
  }

  if (mode === 'subscribe' && token && timingSafeEqual(token, expected)) {
    console.log('Webhook verified by Meta');
    return new Response(challenge ?? '', {
      status: 200,
      headers: { 'content-type': 'text/plain; charset=utf-8' }
    });
  }

  console.warn('Verification rejected: mode=' + mode + ' token matched=false');
  return new Response('Forbidden', { status: 403 });
}

/* ─── Incoming messages and status updates ──────────────────────────
   The signature is computed over the exact bytes Meta sent, so the raw
   body is read once as an ArrayBuffer and used for both the HMAC and
   the JSON parse. Reading it as text and re-encoding would usually
   agree, but "usually" is not what a signature check is for. */
async function handleEvent(request, env, ctx) {
  const raw = await request.arrayBuffer();

  if (env.WHATSAPP_APP_SECRET) {
    const ok = await signatureIsValid(
      env.WHATSAPP_APP_SECRET,
      raw,
      request.headers.get('x-hub-signature-256')
    );
    if (!ok) {
      console.warn('Rejected a POST with a bad or missing signature');
      return new Response('Forbidden', { status: 403 });
    }
  } else {
    // Loud on purpose. This is a working endpoint that anyone who
    // learns the URL can post to until the secret is set.
    console.warn('WHATSAPP_APP_SECRET is not set — accepting unsigned POSTs');
  }

  // Acknowledge before doing anything else. Meta retries on slow or
  // failed responses, and a retry storm is harder to debug than a
  // dropped log line.
  ctx.waitUntil(record(raw, env));

  return new Response('EVENT_RECEIVED', { status: 200 });
}

async function record(raw, env) {
  let payload;
  try {
    payload = JSON.parse(new TextDecoder().decode(raw));
  } catch (err) {
    console.error('POST body was not JSON: ' + err.message);
    return;
  }

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value ?? {};

      for (const message of value.messages ?? []) {
        const note = {
          at: new Date().toISOString(),
          from: message.from,
          type: message.type,
          text: message.text?.body ?? null,
          id: message.id
        };
        console.log('Message in: ' + JSON.stringify(note));
        if (env.MESSAGES) {
          await env.MESSAGES.put(
            'msg:' + message.id,
            JSON.stringify(note),
            { expirationTtl: WEEK }
          );
        }
      }

      for (const status of value.statuses ?? []) {
        console.log(
          'Status: ' + status.id + ' is ' + status.status +
          (status.errors ? ' — ' + JSON.stringify(status.errors) : '')
        );
      }
    }
  }
}

/* ─── Helpers ───────────────────────────────────────────────────────── */

async function signatureIsValid(secret, rawBody, header) {
  if (!header || !header.startsWith('sha256=')) return false;

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const mac = await crypto.subtle.sign('HMAC', key, rawBody);
  const hex = [...new Uint8Array(mac)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  return timingSafeEqual('sha256=' + hex, header);
}

/* Compares in time proportional to length rather than to how many
   characters matched, so that a caller cannot learn the token one
   character at a time by measuring how long we take to say no. */
function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
