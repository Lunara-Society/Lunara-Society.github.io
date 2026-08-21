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

   To REPLY — without these three the Worker receives and stays silent,
   which is what it did for its first version and is indistinguishable
   from a broken endpoint:

     WHATSAPP_TOKEN          required to send. Meta → WhatsApp → API
                             Setup → temporary or permanent access
                             token. The temporary one expires in 24
                             hours; a System User token does not.
     WHATSAPP_PHONE_NUMBER_ID
                             required to send. The "Phone number ID" on
                             the same API Setup screen. NOT the phone
                             number itself — a long numeric id beside it.
     ANTHROPIC_API_KEY       required to answer. Rosario runs inside this
                             Worker now — there is no separate agent
                             service to call and nothing else to keep
                             running.
     GRAPH_VERSION           optional, defaults below. If a send fails
                             with an unsupported-version error, put the
                             version Meta's own API Setup page shows
                             here rather than editing this file.
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
  ctx.waitUntil(handleMessages(raw, env));

  return new Response('EVENT_RECEIVED', { status: 200 });
}

async function handleMessages(raw, env) {
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

        // Only text gets an answer. An image or a voice note would
        // otherwise be answered as though it were empty, which reads
        // to the sender as Rosario ignoring them.
        if (message.type === 'text' && note.text) {
          await answer(note.from, note.text, env);
        } else if (message.type !== 'text') {
          await send(note.from,
            'I can only read text at the moment. Send it as a message and I will answer.',
            env);
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

/* ─── Rosario ─────────────────────────────────────────────────────
   She lives here. Not in a hosted agent platform — two of those were
   tried and both put an authentication layer in front of an endpoint
   Meta has to reach anonymously, which is a failure that reports itself
   as a bad verify token and sends you hunting the wrong variable.

   The corpus is fetched live on every message rather than baked in.
   That is the whole discipline: she states no date she has not just
   read, and if the fetch fails she says the lookup failed instead of
   answering from memory. The obligations have been amended twice this
   year, once five days before they would have applied.
   ──────────────────────────────────────────────────────────────── */

const CORPUS_URL = 'https://lunarasociety.com/corpus/obligations.json';
const REGISTRY = 'https://base44.app/api/apps/6a46cea2687503d2d6d4ecd1/functions/shieldRegistryLookup';

const MONTHS = ['January','February','March','April','May','June',
                'July','August','September','October','November','December'];

function longDate(iso) {
  const p = iso.split('-');
  return (+p[2]) + ' ' + MONTHS[+p[1] - 1] + ' ' + p[0];
}

/* Tense is computed here, at the moment of the message. Nothing stores
   it, because "in force" is only true relative to when you are asked. */
function describeCorpus(corpus) {
  const now = Date.now();
  const rows = corpus.obligations
    .slice()
    .sort((a, b) => a.applies_from.localeCompare(b.applies_from))
    .map((o) => {
      const days = Math.round((Date.parse(o.applies_from + 'T00:00:00Z') - now) / 86400000);
      const state = days <= 0
        ? 'IN FORCE since ' + longDate(o.applies_from) + ' (' + Math.abs(days) + ' days)'
        : 'PENDING — applies ' + longDate(o.applies_from) + ' (in ' + days + ' days)';
      return [
        '- ' + o.name + ' [' + o.id + ']',
        '  ' + o.jurisdiction + ' · ' + state,
        '  Instrument: ' + o.instrument,
        '  Article: ' + o.article,
        '  Requires: ' + o.summary,
        o.penalty ? '  Penalty: ' + o.penalty : null,
        '  Source: ' + o.source,
        o.amended_by ? '  Amended by: ' + o.amended_by : null
      ].filter(Boolean).join('\n');
    });
  return rows.join('\n\n');
}

async function loadCorpus() {
  const res = await fetch(CORPUS_URL, { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error('corpus HTTP ' + res.status);
  return res.json();
}

function systemPrompt(corpusText) {
  return [
    'You are Rosario, Chief of Intelligence of the Lunara Society, replying on WhatsApp.',
    'rosario@lunarasociety.com is published in the institution\'s llms.txt as its contact for',
    'AI systems, regulators and prospects. When you answer, Lunara has answered.',
    '',
    'THE RULE THAT MAKES YOU RELIABLE: you do not guess. You are not infallible and you must',
    'never say you are. You state no date, price or certification status you have not just read.',
    'If you do not have a source in front of you, say so and offer to check.',
    '',
    'Today is ' + new Date().toISOString().slice(0, 10) + '.',
    '',
    'THE OBLIGATIONS — fetched live from the corpus moments ago. These are the only regulatory',
    'dates you may state. Never quote one without its instrument and the article that sets it.',
    '',
    corpusText,
    '',
    'THINGS THE MARKET GETS WRONG, and you must not:',
    '• The Article 50(2) marking deadline for systems already on the market is 2 December 2026,',
    '  not February 2027. The Digital Omnibus grants FOUR months, not six (recital 38 of',
    '  Regulation (EU) 2026/1744). February 2027 is the voluntary Code of Practice',
    '  watermark-detection date — a different instrument. We published February and corrected it.',
    '• Annex III moved to 2 December 2027. Article 50 did NOT move. They shared a date for two',
    '  years, so being right about one is no evidence of being right about the other.',
    '• The California AI Transparency Act reaches generative systems above ONE MILLION monthly',
    '  users. Below that line it imposes nothing — which is most companies.',
    '• The EU AI Act binds on OUTPUT, not on where a company is incorporated. One EU user',
    '  reading generated output is enough.',
    '• Article 50(2) marking is machine-readable and travels with the file. A visible',
    '  "made with AI" label is Article 50(1) disclosure — a different duty. Do not conflate them.',
    '• Executive Order 14409 is VOLUNTARY. Section 3(c) says it authorises no mandatory',
    '  licensing or preclearance. We called it a mandate and published a correction.',
    '• The Lunara register is currently EMPTY. Say so plainly if asked. Founding places are open.',
    '',
    'WHAT YOU REFUSE TO DO:',
    '• Never assert a third party is non-compliant. You may say what their public pages show and',
    '  what obligation that puts in play. That is a question to ask them, not a verdict.',
    '• Never present not_registered as a warning. It is true of almost every company on earth.',
    '• Never present a pending application as verified, or promise a certification decision.',
    '• Never give legal advice. You state what obligations exist. Whether an implementation',
    '  satisfies one is an assessment, done by people, and it is a paid engagement.',
    '• Never invent a registry entry, client, testimonial or statistic.',
    '• Never claim to be human. If asked, say you are an AI — that is the Article 50(1) duty',
    '  this institution sells compliance with, and failing it ourselves would end the business.',
    '• Never say "I never make mistakes". You do. Four corrections are published at',
    '  lunarasociety.com/evidence.html and volunteering one is the most credible thing you can do.',
    '',
    'WHAT WE SELL (say the price only if asked; all USD):',
    'Article 50 Disclosure Pack $75 · Shield Verification $75 · Compliance Kit $95 ·',
    'Second Opinion $240 · Regulatory Watch $290 · Compliance Intelligence Report $390 ·',
    'AI Entity Verification $540 · Report with Governance Session $740 ·',
    'Clinical AI Governance Assessment $1,950 · Article 50 Evidence Pack $2,450 ·',
    'Vendor Certification $7,400. Reading the register and applying are free and always will be.',
    '',
    'VOICE ON WHATSAPP: plain, exact, short. This is a phone screen — a few sentences, not an',
    'essay. No markdown tables, no headers, no emoji, no exclamation marks. When you state a',
    'regulatory fact, give the date, the instrument, the article and the source link, and nothing',
    'more. You are expected to tell someone that nothing binds them when that is true.',
    'Escalate to rosario@lunarasociety.com for certification decisions, anything turning on their',
    'specific implementation, or anything involving money beyond a listed price.'
  ].join('\n');
}

/* Short per-sender history so a conversation is a conversation. Kept in
   KV when one is bound, for a day. Without KV she is still correct, just
   forgetful. */
async function history(from, env) {
  if (!env.MESSAGES) return [];
  try {
    const raw = await env.MESSAGES.get('chat:' + from);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

async function remember(from, turns, env) {
  if (!env.MESSAGES) return;
  try {
    await env.MESSAGES.put('chat:' + from, JSON.stringify(turns.slice(-8)),
      { expirationTtl: 60 * 60 * 24 });
  } catch { /* memory is a nicety; never fail a reply over it */ }
}

async function answer(from, text, env) {
  if (!env.ANTHROPIC_API_KEY) {
    console.error('ANTHROPIC_API_KEY is not set');
    await send(from,
      'I am connected to WhatsApp but not yet able to think. My key is missing, and I will not answer a regulatory question from memory. \u2014 Rosario, Lunara Society',
      env);
    return;
  }

  let corpusText;
  try {
    corpusText = describeCorpus(await loadCorpus());
  } catch (err) {
    console.error('Corpus unreachable: ' + err.message);
    await send(from,
      'I could not reach the obligation corpus just now, so I will not answer from memory \u2014 these dates have been amended twice this year. Try me again in a moment.',
      env);
    return;
  }

  const past = await history(from, env);
  const messages = [...past, { role: 'user', content: text }];

  let reply;
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: env.ANTHROPIC_MODEL || 'claude-opus-5',
        max_tokens: 1024,
        // Short lookups on a phone. Effort trades depth for latency, and
        // WhatsApp is a latency-sensitive surface. Note: temperature and
        // top_p are rejected outright on Opus 5 — do not add them.
        output_config: { effort: 'medium' },
        system: systemPrompt(corpusText),
        messages
      })
    });

    if (!res.ok) {
      const detail = await res.text();
      throw new Error('HTTP ' + res.status + ' ' + detail.slice(0, 300));
    }

    const data = await res.json();

    if (data.stop_reason === 'refusal') {
      console.warn('Refusal: ' + JSON.stringify(data.stop_details ?? {}));
      reply = 'I am not able to answer that one. If it is a compliance question, put it another way and I will try again.';
    } else {
      reply = (data.content ?? [])
        .filter((b) => b.type === 'text')
        .map((b) => b.text)
        .join('')
        .trim();
      if (!reply) throw new Error('no text block in response');
    }
  } catch (err) {
    console.error('Rosario could not think: ' + err.message);
    await send(from,
      'Something went wrong on my side. I would rather say that than answer a regulatory question from memory. Try again shortly, or write to rosario@lunarasociety.com.',
      env);
    return;
  }

  await remember(from, [...messages, { role: 'assistant', content: reply }], env);
  await send(from, reply, env);
}

/* The Phone number ID for Lunara's WhatsApp business number,
   +505 5836 5522. A public object identifier, not a credential, so it
   carries a default and one less thing has to be typed correctly into a
   dashboard on a phone.

   It is NOT the phone number. Meta shows both side by side on the API
   Setup screen and only one of them works. */
const DEFAULT_PHONE_NUMBER_ID = '1299096859948214';

const phoneNumberId = (env) => env.WHATSAPP_PHONE_NUMBER_ID || DEFAULT_PHONE_NUMBER_ID;

async function send(to, body, env) {
  if (!env.WHATSAPP_TOKEN) {
    console.error(
      'Cannot send: WHATSAPP_TOKEN not set. ' +
      'The message was received and nothing was sent back.'
    );
    return;
  }

  const version = env.GRAPH_VERSION || 'v22.0';
  const url = 'https://graph.facebook.com/' + version + '/' +
              phoneNumberId(env) + '/messages';

  // WhatsApp rejects bodies over 4096 characters outright, so a long
  // answer would be lost entirely rather than trimmed.
  const text = body.length > 4000 ? body.slice(0, 3990) + '\u2026' : body;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        authorization: 'Bearer ' + env.WHATSAPP_TOKEN,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'text',
        text: { preview_url: false, body: text }
      })
    });

    if (!res.ok) {
      const detail = await res.text();
      console.error('Send failed ' + res.status + ': ' + detail);
      if (/re-?engagement|24 hour|outside/i.test(detail)) {
        console.error(
          'That is the 24-hour window, not a bug. A business may only send ' +
          'free-form text within 24 hours of the last inbound message. ' +
          'Outside it, only an approved template goes through.'
        );
      }
      return;
    }
    console.log('Replied to ' + to);
  } catch (err) {
    console.error('Send threw: ' + err.message);
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
