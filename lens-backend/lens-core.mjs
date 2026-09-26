/* ═══════════════════════════════════════════════════════════════════
   LUNARA LENS — backend core
   ═══════════════════════════════════════════════════════════════════

   Plain JavaScript so the test suite can run it under Node; index.ts
   only supplies the database, the model call and the secrets.

   Routes (POST unless marked):
     GET  /health                              which secrets are present
     /me        { session_token }              licence, allowance left
     /redeem    { session_token, code }        activation code → licence
     /claim     { session_token, paypal_txn }  PayPal capture → licence
     /ai        { session_token, task, lang, … }   the AI features
     /mark      { session_token, sha256, owner_name, title } → mark id
     GET  /mark/<id>                           public ownership record
     /apikey    { session_token, label }       API key, shown once
     /admin/codes { session_token, plan, count, days }
     /v1/detect   Authorization: Bearer lk_…   the paid detection API

   ON MONEY
   A licence carries a monthly AI allowance in dollars, and every model
   call is priced from the token counts the API reports and written to
   lens_usage. A call is refused before it is made if the worst case it
   could cost (its input estimate plus max_tokens of output) would take
   the month past the allowance. So no user can ever cost more than
   their allowance, and the allowance is set well under what they paid:

     App, $25 a month: $10.00 a month of AI and voice.
       After PayPal's fee ($25 − 3.49% − $0.49 ≈ $23.64) Lunara keeps
       at least $13.64 from even the heaviest user.
     API, $199 a month: $120 a month of AI.
       After the fee (≈ $191.56) Lunara keeps at least $71.56.

   Everything that can run on the phone does: speech in and out,
   magnifier, text recognition, metadata and watermark forensics,
   Lunara Marks, files. Those cost nothing and need no licence. Only
   the calls to the model spend the allowance.
   ═══════════════════════════════════════════════════════════════════ */

export const PLANS = {
  app_month: { days: 31,  budget: 10.0,  price: 25,  label: 'Lunara Lens, 1 month' },
  app_year:  { days: 365, budget: 4.0,   price: 79,  label: 'Lunara Lens, 12 months' }, // earlier buyers keep it
  api_month: { days: 31,  budget: 120.0, price: 199, label: 'Lunara Detection API, 1 month' },
  comp:      { days: 365, budget: 4.0,   price: 0,   label: 'Lunara Lens, complimentary' },
  // Never metered (spend() skips it); the figure only has to fit numeric(10,4).
  owner:     { days: 36500, budget: 100000, price: 0, label: 'Owner · no limits' }
};

/* The owner is never metered and never asked to pay. Everyone else is.
   Set LENS_OWNER_EMAILS to change who that is. */
export function isOwner(email, env) {
  const list = String((env && env.LENS_OWNER_EMAILS) || 'lunarasociety@gmail.com').toLowerCase().split(/[,\s]+/).filter(Boolean);
  return list.includes(String(email || '').toLowerCase());
}

/* ElevenLabs voices for Rosario: Caty in English (Italian accent) and
   the Venezuelan Caty in Spanish. Speech is metered per character at a
   deliberately high rate so the allowance can never be undershot. */
export const VOICES = { en: '5DTSWAtuA2BoWMSMFTRP', es: 'BKwzeEHPemNEGIPoJEI8' };
export const TTS_MODEL = 'eleven_flash_v2_5';
export const ttsCost = (chars, env) => chars * Number((env && env.LENS_TTS_USD_PER_CHAR) || 0.0002);

/* Dollars per million tokens, input and output. Output includes any
   thinking the model does, because the API bills it as output. */
export const PRICES = {
  'claude-opus-5':    [5, 25],
  'claude-opus-5-5':  [4, 20],
  'claude-sonnet-5':  [2, 10],
  'claude-haiku-4-5': [1, 5]
};

export function costOf(model, inTok, outTok) {
  const p = PRICES[model] || PRICES['claude-opus-5'];
  return (inTok * p[0] + outTok * p[1]) / 1e6;
}

export const period = (d = new Date()) => d.toISOString().slice(0, 7);

const LANGS = { en: 'English', es: 'Spanish' };

/* ── the tasks ──────────────────────────────────────────────────────
   Each task names its model tier, its effort, its output cap and a
   JSON schema. The schema is what the app reads and what it speaks:
   every task returns a `speech` field written to be heard, not read. */

const VERDICT = { type: 'string', enum: ['likely_ai', 'likely_human', 'uncertain', 'ai_edited'] };
const SIGNALS = {
  type: 'array',
  items: {
    type: 'object',
    additionalProperties: false,
    required: ['label', 'strength', 'points_to'],
    properties: {
      label: { type: 'string' },
      strength: { type: 'string', enum: ['strong', 'moderate', 'weak'] },
      points_to: { type: 'string', enum: ['ai', 'human', 'neither'] }
    }
  }
};
const DETECTION = {
  type: 'object',
  additionalProperties: false,
  required: ['verdict', 'confidence', 'speech', 'signals', 'advice'],
  properties: {
    verdict: VERDICT,
    confidence: { type: 'integer' },
    speech: { type: 'string' },
    signals: SIGNALS,
    advice: { type: 'string' }
  }
};

const DETECT_RULES = `You are the analysis engine of Lunara Lens, an AI-detection app published by Lunara Society, an institution whose whole standard is that claims must be checkable.

Rules you never break:
- No detector can prove something was or was not made by AI. Say what the evidence shows and how strong it is. Never state certainty you do not have.
- confidence is 0-100 and means how strongly the evidence supports your verdict. Use "uncertain" whenever the evidence is thin or mixed; that is an honest and common answer.
- The device has already run forensic checks and passes them as EVIDENCE. Metadata and provenance signals (C2PA content credentials, IPTC digitalSourceType "trainedAlgorithmicMedia", generator tags such as Stable Diffusion parameters, DALL-E, Midjourney, Firefly, a Lunara Mark) are the strongest evidence there is. Their absence proves nothing, because most platforms strip metadata.
- signals: 2-6 short, concrete observations a person could check themselves.
- speech: two or three short sentences, spoken aloud to the user by the phone. Plain words, no jargon, no markdown. Start with the verdict.
- advice: one practical next step (for example: ask the sender for the original file, look for the same image with a reverse image search, verify the voice by calling back on a known number).`;

export const TASKS = {
  detect_image: {
    tier: 'deep', effort: 'medium', max_tokens: 2500, schema: DETECTION,
    system: DETECT_RULES + `

You are looking at an image (or a frame of a screen or video). Look for: anatomy and hands, text and lettering, reflections and shadows that disagree, repeated or melted textures, impossible geometry, over-smooth skin, background objects that dissolve, lighting from inconsistent directions, and signs it is a photo of a screen.`
  },
  detect_frames: {
    tier: 'deep', effort: 'medium', max_tokens: 2500, schema: DETECTION,
    system: DETECT_RULES + `

You are looking at several frames sampled in order from one video. Besides per-frame artifacts, compare frames: faces or objects that change identity, lip and jaw shapes that do not follow speech, backgrounds that warp, lighting that jumps, and text that changes between frames.`
  },
  detect_text: {
    tier: 'deep', effort: 'medium', max_tokens: 2500, schema: DETECTION,
    system: DETECT_RULES + `

You are reading a piece of text. Be especially careful: text detection is the least reliable kind, and people are harmed when their own writing is called AI. Only say likely_ai when several strong signals agree. Look for: generic structure, hedged filler, no concrete personal detail, uniform sentence rhythm, and stock phrases. Say uncertain for short texts (under about 80 words).`
  },
  detect_audio: {
    tier: 'deep', effort: 'medium', max_tokens: 2000, schema: DETECTION,
    system: DETECT_RULES + `

You cannot hear the audio. You receive the device's acoustic measurements (bandwidth, noise floor, pitch variation, pauses, breaths) and, when available, a transcript. Reason only from those. Synthetic voices tend to have a hard frequency ceiling, an unnaturally clean or constant noise floor, very steady pitch, missing breaths, and even pauses. Phone calls and compressed audio produce some of the same signs, so stay measured. If the transcript contains urgency, money, secrecy or a request to act now, point that out: that is the pattern of voice-clone scams.`
  },
  scam: {
    tier: 'deep', effort: 'medium', max_tokens: 2000,
    schema: {
      type: 'object', additionalProperties: false,
      required: ['risk', 'speech', 'reasons', 'advice'],
      properties: {
        risk: { type: 'string', enum: ['low', 'medium', 'high'] },
        speech: { type: 'string' },
        reasons: { type: 'array', items: { type: 'string' } },
        advice: { type: 'string' }
      }
    },
    system: `You are Lunara Lens checking a message, screenshot, email or call transcript for scams and manipulation, including AI-generated impersonation. Judge the risk from concrete signs: urgency, secrecy, payment by gift card, crypto or wire, a link whose domain does not match the sender, requests for codes or passwords, a familiar voice or face asking for money. speech: two or three short spoken sentences, verdict first. advice: one safe next step. Never tell the user a message is safe with certainty.`
  },
  describe: {
    tier: 'fast', effort: 'low', max_tokens: 1500,
    schema: {
      type: 'object', additionalProperties: false,
      required: ['speech', 'text_found', 'hazards'],
      properties: {
        speech: { type: 'string' },
        text_found: { type: 'string' },
        hazards: { type: 'array', items: { type: 'string' } }
      }
    },
    system: `You are the eyes of Lunara Lens for a person who may have low vision or be blind. The phone speaks what you write. speech: describe the scene the way a calm, attentive friend would, most important thing first, in two to four short sentences. Mention people (without guessing identity), obstacles, steps, traffic, and anything the person seems to be pointing at. If there is readable text that matters (a sign, a label, a price, a medicine name, a bus number), say it. text_found: all readable text, verbatim, or "". hazards: things that could hurt or mislead them (a step, a wet floor, a car, an expiry date passed), or [].`
  },
  read: {
    tier: 'fast', effort: 'low', max_tokens: 3000,
    schema: {
      type: 'object', additionalProperties: false,
      required: ['speech', 'text_found'],
      properties: { speech: { type: 'string' }, text_found: { type: 'string' } }
    },
    system: `You read text aloud for Lunara Lens. text_found: every readable word in the image, verbatim, in reading order. speech: the text as it should be read aloud, with layout noise removed; for a long document, read the heading, then the content. For a medicine label, lead with the name, dose and warnings.`
  },
  translate: {
    tier: 'fast', effort: 'low', max_tokens: 1500,
    schema: {
      type: 'object', additionalProperties: false,
      required: ['source_language', 'translation', 'speech'],
      properties: {
        source_language: { type: 'string' },
        translation: { type: 'string' },
        speech: { type: 'string' }
      }
    },
    system: `You translate for Lunara Lens. Translate the input (text, or the text in the image) into the TARGET language, keeping meaning and tone, plainly and naturally. source_language: the language name in English. speech: exactly the translation, ready to be spoken.`
  },
  replies: {
    tier: 'fast', effort: 'low', max_tokens: 1500,
    schema: {
      type: 'object', additionalProperties: false,
      required: ['options'],
      properties: {
        options: {
          type: 'array',
          items: {
            type: 'object', additionalProperties: false,
            required: ['reply', 'meaning'],
            properties: { reply: { type: 'string' }, meaning: { type: 'string' } }
          }
        }
      }
    },
    system: `You help a person answer someone in a conversation, for Lunara Lens. Given what was said to them, write up to 3 short, natural replies in the REPLY language: one agreeable, one that asks a question or buys time, one that declines politely (when that makes sense). meaning: the same reply in the user's language so they know what they are saying.`
  },
  rosario: {
    tier: 'fast', effort: 'low', max_tokens: 900,
    schema: {
      type: 'object', additionalProperties: false,
      required: ['action', 'speech', 'arg_text', 'arg_number', 'arg_folder', 'arg_language', 'arg_minutes'],
      properties: {
        action: { type: 'string', enum: ['answer', 'describe', 'read', 'detect_image', 'detect_text', 'detect_audio', 'detect_video', 'scan', 'scam', 'link', 'qr', 'translate', 'converse', 'replies', 'magnify', 'color', 'mark', 'verify_mark', 'files', 'organize', 'remind', 'note', 'notes', 'briefing', 'emergency', 'safe_word', 'calm', 'card', 'summarize', 'settings', 'account', 'help', 'stop'] },
        speech: { type: 'string' },
        arg_text: { type: 'string' },
        arg_number: { type: 'integer' },
        arg_folder: { type: 'string' },
        arg_language: { type: 'string' },
        arg_minutes: { type: 'integer' }
      }
    },
    system: `You are Rosario, the voice assistant inside Lunara Lens, an app by Lunara Society. You speak to the user out loud, so every reply is short, warm and plain: one to three sentences, no lists, no markdown, no emoji. You are calm, capable and a little witty, never gushing.

Lunara Society's standard is that claims must be checkable. So you never pretend to know what you do not: if you are not sure, say so briefly. You cannot browse the web or see live data unless the CONTEXT gives it to you. Never invent facts about the user.

Every turn, choose exactly one action. If the user wants something the app does, pick that action and put a one-sentence spoken confirmation in speech. If they are just talking or asking a question you can answer, use "answer" and answer in speech.

The app's actions: describe (what is in front of me), read (read text aloud), detect_image / detect_text / detect_audio / detect_video (is this real or AI), scan (check a screen or print with the camera), scam (is this message a scam), link (is this link safe, arg_text = the link), qr (scan a QR code), translate (arg_text = what, arg_language = target language), converse (live two-way translation), replies (help me answer, arg_text = what they said), magnify, color (what colour is this), mark (put an invisible Lunara Mark on my photo), verify_mark (who owns this image), files (open my files), organize (arg_number latest images into arg_folder), remind (arg_minutes from now, arg_text = what), note (take a note, arg_text = the note), notes (read my notes), briefing (my day: time, weather, reminders), emergency (I need help), safe_word (family safe word against voice-clone scams), calm (I am stressed), card (my medical card), summarize (summarize a letter or document), settings, account, help, stop.

Unused arguments are "" or 0.`
  },
  summarize: {
    tier: 'fast', effort: 'low', max_tokens: 1800,
    schema: {
      type: 'object', additionalProperties: false,
      required: ['speech', 'summary', 'actions', 'deadlines'],
      properties: {
        speech: { type: 'string' },
        summary: { type: 'string' },
        actions: { type: 'array', items: { type: 'string' } },
        deadlines: { type: 'array', items: { type: 'string' } }
      }
    },
    system: `You are Rosario, reading a letter, bill, form or document for the user (the image or text). speech: two to four spoken sentences: who it is from, what it is about, and what, if anything, the user must do and by when. summary: a clear written summary. actions: things the user needs to do. deadlines: dates that matter, with what they are for. If it looks like a scam or a threat to pay urgently, say so plainly.`
  },
  intent: {
    tier: 'fast', effort: 'low', max_tokens: 600,
    schema: {
      type: 'object', additionalProperties: false,
      required: ['action', 'speech', 'arg_text', 'arg_number', 'arg_folder', 'arg_language'],
      properties: {
        action: { type: 'string', enum: ['describe', 'read', 'detect_image', 'detect_text', 'detect_audio', 'detect_video', 'scam', 'translate', 'converse', 'replies', 'magnify', 'mark', 'verify_mark', 'files', 'organize', 'calm', 'help', 'settings', 'repeat', 'stop', 'answer'] },
        speech: { type: 'string' },
        arg_text: { type: 'string' },
        arg_number: { type: 'integer' },
        arg_folder: { type: 'string' },
        arg_language: { type: 'string' }
      }
    },
    system: `You turn a spoken request to the Lunara Lens app into one action. Actions: describe (what's in front of me), read (read text aloud), detect_image / detect_text / detect_audio / detect_video (is this AI), scam (is this a scam), translate (arg_text = what to translate, arg_language = target), converse (live conversation translation), replies (help me answer), magnify, mark (watermark my photo), verify_mark, files, organize (arg_number = how many latest images, arg_folder = folder name), calm (breathing / I'm stressed), help, settings, repeat, stop. If it is a general question the app can simply answer, use action "answer" and put a short spoken answer in speech. Otherwise speech is a short spoken confirmation of what you are about to do. Unused args: "" or 0.`
  }
};

/* ── helpers ────────────────────────────────────────────────────── */

export const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

export function withCors(res, origin) {
  const ok = !origin || /^https:\/\/(www\.)?lunarasociety\.com$/.test(origin) ||
    /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  const h = new Headers(res.headers);
  h.set('access-control-allow-origin', ok && origin ? origin : 'https://lunarasociety.com');
  h.set('access-control-allow-headers', 'content-type, authorization');
  h.set('access-control-allow-methods', 'GET, POST, OPTIONS');
  h.set('vary', 'origin');
  return new Response(res.body, { status: res.status, headers: h });
}

const MARK_ALPHA = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // Crockford, as Lunara IDs
export function randomId(n, alpha = MARK_ALPHA) {
  const b = crypto.getRandomValues(new Uint8Array(n));
  return Array.from(b, (x) => alpha[x % alpha.length]).join('');
}

export async function sha256hex(s) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(d), (x) => x.toString(16).padStart(2, '0')).join('');
}

async function licenceFor(email, deps) {
  if (isOwner(email, deps.env)) {
    const list = await deps.db.licensesFor(email);
    let own = (list || []).find((l) => l.plan === 'owner');
    if (!own) {
      own = await deps.db.createLicense({ email, plan: 'owner', source: 'admin', paypal_txn: null, expires_at: '2099-12-31T00:00:00Z', budget_usd_month: PLANS.owner.budget });
    }
    return own;
  }
  return activeLicense(await deps.db.licensesFor(email));
}

function activeLicense(list, now = Date.now()) {
  return (list || [])
    .filter((l) => new Date(l.expires_at).getTime() > now)
    .sort((a, b) => new Date(b.expires_at) - new Date(a.expires_at))[0] || null;
}

/* Rough input size before the call, to refuse calls the allowance
   cannot cover. Images are sent at most 1024 px on the long edge by
   the app, about 1,400 tokens each; we reserve 1,600. */
export function estimateInput(task, body) {
  const text = JSON.stringify(body.text || '') + JSON.stringify(body.evidence || '');
  const images = Array.isArray(body.images) ? body.images.length : 0;
  return 900 + Math.ceil(text.length / 3) + images * 1600;
}

/* ── the handler ────────────────────────────────────────────────── */

export async function handleLens(req, deps) {
  const url = new URL(req.url);
  const path = url.pathname.replace(/^.*\/lunara-lens/, '') || '/';

  if (req.method === 'GET' && path === '/health') {
    return json({
      ok: true,
      ai: !!deps.env.ANTHROPIC_API_KEY,
      voice: !!deps.env.ELEVENLABS_API_KEY,
      paused: await paused(deps),
      paypal: !!(deps.env.PAYPAL_CLIENT_ID && deps.env.PAYPAL_CLIENT_SECRET),
      models: { deep: deps.model('deep'), fast: deps.model('fast') }
    });
  }

  if (req.method === 'GET' && path.startsWith('/mark/')) {
    const id = path.slice(6).toUpperCase().replace(/[^0-9A-Z]/g, '');
    const m = await deps.db.getMark(id);
    if (!m) return json({ found: false, id }, 404);
    return json({
      found: true, id: m.id, owner_name: m.owner_name, title: m.title || '',
      sha256: m.sha256, registered_at: m.created_at, revoked: !!m.revoked_at
    });
  }

  if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405);

  if (path === '/v1/detect') return apiDetect(req, deps);

  let body;
  try { body = await req.json(); } catch { return json({ error: 'The request body must be JSON.' }, 400); }

  const who = await deps.whoIs(body.session_token);
  if (!who) return json({ error: 'Sign in again. Your session has ended.', code: 'signin' }, 401);
  const email = who.email.toLowerCase();

  switch (path) {
    case '/me': return me(email, deps);
    case '/redeem': return redeem(email, body, deps);
    case '/claim': return claim(email, body, deps);
    case '/ai': return ai(email, body, deps);
    case '/mark': return mark(email, who, body, deps);
    case '/apikey': return apikey(email, body, deps);
    case '/admin/codes': return adminCodes(email, body, deps);
    case '/admin/overview': return adminOverview(email, deps);
    case '/admin/claim': return adminClaim(email, body, deps);
    case '/admin/grant': return adminGrant(email, body, deps);
    case '/admin/pause': return adminPause(email, body, deps);
    case '/speak': return speak(email, body, deps);
    case '/download': return download(email, deps);
    default: return json({ error: 'No such route.' }, 404);
  }
}

async function me(email, deps) {
  const lic = await licenceFor(email, deps);
  if (!lic) {
    const pending = deps.db.pendingClaimFor ? await deps.db.pendingClaimFor(email) : null;
    return json({ licensed: false, email, pending: !!pending });
  }
  if (lic.plan === 'owner') {
    return json({ licensed: true, owner: true, unlimited: true, email, plan: 'owner', label: PLANS.owner.label, expires_at: lic.expires_at, allowance_left_pct: 100, resets: nextMonthStart() });
  }
  const spent = await deps.db.spent(lic.id, period());
  const budget = Number(lic.budget_usd_month);
  return json({
    licensed: true, email, plan: lic.plan, label: PLANS[lic.plan].label,
    expires_at: lic.expires_at,
    allowance_left_pct: Math.max(0, Math.round((1 - spent / budget) * 100)),
    resets: nextMonthStart()
  });
}

function nextMonthStart(d = new Date()) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)).toISOString();
}

async function grant(email, plan, source, paypalTxn, deps, days) {
  const p = PLANS[plan];
  const existing = activeLicense(await deps.db.licensesFor(email));
  // Buying again extends from the end of what is left, never overlaps.
  const from = existing && existing.plan === plan ? new Date(existing.expires_at) : new Date();
  const expires = new Date(from.getTime() + (days || p.days) * 86400e3);
  return deps.db.createLicense({
    email, plan, source, paypal_txn: paypalTxn || null,
    expires_at: expires.toISOString(), budget_usd_month: p.budget
  });
}

async function redeem(email, body, deps) {
  const code = String(body.code || '').toUpperCase().replace(/[^0-9A-Z-]/g, '');
  const row = code && await deps.db.getCode(code);
  if (!row || row.redeemed_at) return json({ error: 'That code is not valid or has already been used.' }, 400);
  const ok = await deps.db.markCodeRedeemed(code, email);
  if (!ok) return json({ error: 'That code has already been used.' }, 409);
  await grant(email, row.plan, 'code', null, deps, row.days);
  return me(email, deps);
}

/* A PayPal capture id is the "Transaction ID" on the buyer's receipt.
   PayPal is asked directly whether it is a completed payment of the
   right amount; the id can be claimed once, ever. */
async function claim(email, body, deps) {
  const txn = String(body.paypal_txn || '').trim().toUpperCase();
  if (!/^[0-9A-Z]{12,20}$/.test(txn)) {
    return json({ error: 'Enter the Transaction ID from your PayPal receipt. It is 17 letters and numbers.' }, 400);
  }
  if (await deps.db.licenseByTxn(txn)) return json({ error: 'That payment has already been used to activate a licence.' }, 409);
  const cap = await deps.paypalCapture(txn);
  if (!cap) {
    // PayPal cannot be asked automatically: queue it for the owner, who
    // approves it in the app. Nothing unlocks until they do.
    if (deps.db.createClaim) {
      const existing = deps.db.claimByTxn ? await deps.db.claimByTxn(txn) : null;
      if (existing && existing.status !== 'pending') return json({ error: 'That Transaction ID has already been reviewed.' }, 409);
      if (!existing) await deps.db.createClaim({ email, paypal_txn: txn, note: String(body.note || '').slice(0, 200) });
      return json({ licensed: false, pending: true, email, message: 'Thank you. Your payment is waiting for confirmation.' }, 202);
    }
    return json({ error: 'Payments cannot be checked automatically yet. Email lunarasociety@gmail.com with your Transaction ID.' }, 503);
  }
  if (cap.status !== 'COMPLETED') return json({ error: 'PayPal does not show that payment as completed yet. Try again in a few minutes.' }, 400);
  const paid = Number(cap.amount?.value || 0);
  const cur = cap.amount?.currency_code;
  const plan = cur === 'USD' && paid >= PLANS.api_month.price ? 'api_month'
    : cur === 'USD' && paid >= PLANS.app_month.price ? 'app_month' : null;
  if (!plan) return json({ error: `That payment was ${paid} ${cur}, which does not match a Lunara Lens plan.` }, 400);
  await grant(email, plan, 'paypal', txn, deps);
  return me(email, deps);
}

async function spend(lic, task, model, body, deps) {
  if (lic.plan === 'owner') return { budget: Infinity, spent: 0, owner: true };
  const t = TASKS[task];
  const budget = Number(lic.budget_usd_month);
  const spent = await deps.db.spent(lic.id, period());
  const worst = costOf(model, estimateInput(task, body), t.max_tokens);
  if (spent + worst > budget) return null;
  return { budget, spent };
}

function buildContent(task, body) {
  const lang = LANGS[body.lang] || 'English';
  const parts = [];
  for (const img of (Array.isArray(body.images) ? body.images.slice(0, 6) : [])) {
    const m = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(String(img));
    if (m) parts.push({ type: 'image', source: { type: 'base64', media_type: m[1], data: m[2] } });
  }
  const lines = [`Respond in ${lang}. Every text field, including speech, must be in ${lang}.`];
  if (task === 'translate') lines.push(`TARGET language: ${LANGS[body.target] || body.target || 'English'}.`);
  if (task === 'replies') lines.push(`REPLY language: ${LANGS[body.target] || body.target || lang}. The user's language: ${lang}.`);
  if (body.evidence) lines.push('EVIDENCE from the device:\n' + String(body.evidence).slice(0, 4000));
  if (body.text) lines.push('INPUT:\n' + String(body.text).slice(0, 12000));
  if (Array.isArray(body.history) && body.history.length) {
    lines.push('CONVERSATION SO FAR:\n' + body.history.slice(-8).map((h) => (h.role === 'rosario' ? 'Rosario: ' : 'User: ') + String(h.text || '').slice(0, 400)).join('\n'));
  }
  if (body.context) lines.push('CONTEXT: ' + String(body.context).slice(0, 800));
  parts.push({ type: 'text', text: lines.join('\n\n') });
  return parts;
}

/* The owner's stop. One switch, checked before every model or voice
   call, so every AI feature for every member halts at once and nothing
   already running can start another call. Everything on the phone
   keeps working. The owner is not exempt: a stop that exempts the
   person pressing it is not a stop. */
async function paused(deps) {
  return deps.db.getConfig ? (await deps.db.getConfig('ai_paused')) === 'true' : false;
}
const PAUSED = () => json({ error: 'Rosario\u2019s AI is paused by Lunara Society. Everything that runs on your phone still works.', code: 'paused' }, 503);

async function runTask(lic, task, body, route, deps) {
  if (await paused(deps)) return PAUSED();
  const t = TASKS[task];
  const model = deps.model(t.tier);
  const room = await spend(lic, task, model, body, deps);
  if (!room) {
    return json({
      error: 'This month’s AI allowance is used up. It renews on ' +
        nextMonthStart().slice(0, 10) + '. Everything that runs on your phone still works.',
      code: 'allowance'
    }, 402);
  }
  const out = await deps.callModel({
    model, system: t.system, max_tokens: t.max_tokens, effort: t.effort,
    schema: t.schema, content: buildContent(task, body)
  });
  const cost = costOf(model, out.input_tokens, out.output_tokens);
  await deps.db.logUsage({
    // Which action the model chose is logged beside what it cost, so an
    // oversight review can see what the assistant decided, not only spend.
    license_id: lic.id, period: period(),
    route: out.result && typeof out.result.action === 'string' ? `${route}:${out.result.action}`.slice(0, 60) : route, model,
    input_tokens: out.input_tokens, output_tokens: out.output_tokens, cost_usd: cost
  });
  if (out.refused) return json({ error: 'The model declined this request.', code: 'refused' }, 422);
  if (!out.result) return json({ error: 'The answer came back incomplete. Try again.' }, 502);
  const left = room.owner ? 100 : Math.max(0, Math.round((1 - (room.spent + cost) / room.budget) * 100));
  return json({ task, result: out.result, allowance_left_pct: left });
}

async function ai(email, body, deps) {
  const task = String(body.task || '');
  if (!TASKS[task]) return json({ error: 'Unknown task.' }, 400);
  const lic = await licenceFor(email, deps);
  if (!lic) return json({ error: 'This needs an active Lunara Lens plan.', code: 'license' }, 402);
  if (!deps.env.ANTHROPIC_API_KEY) return json({ error: 'The AI service is not switched on yet.', code: 'offline' }, 503);
  return runTask(lic, task, body, task, deps);
}

async function mark(email, who, body, deps) {
  const lic = await licenceFor(email, deps);
  if (!lic) return json({ error: 'Registering a Lunara Mark needs a licence.', code: 'license' }, 402);
  const sha = String(body.sha256 || '').toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(sha)) return json({ error: 'Missing file fingerprint.' }, 400);
  const owner = String(body.owner_name || who.full_name || '').trim().slice(0, 80);
  if (!owner) return json({ error: 'Enter the name the mark should show as owner.' }, 400);
  let id;
  for (let i = 0; i < 5; i++) {
    const c = randomId(8);
    if (!(await deps.db.getMark(c))) { id = c; break; }
  }
  if (!id) return json({ error: 'Try again.' }, 503);
  await deps.db.createMark({ id, owner_email: email, owner_name: owner, title: String(body.title || '').slice(0, 120), sha256: sha });
  return json({ id, owner_name: owner, verify_url: `https://lunarasociety.com/lens/verify.html#${id}` });
}

async function apikey(email, body, deps) {
  const lic = isOwner(email, deps.env) ? await licenceFor(email, deps)
    : activeLicense((await deps.db.licensesFor(email)).filter((l) => l.plan === 'api_month'));
  if (!lic) return json({ error: 'API keys come with the Detection API plan.', code: 'license' }, 402);
  const key = 'lk_' + randomId(32, 'abcdefghijkmnpqrstuvwxyz23456789');
  await deps.db.createKey({ key_hash: await sha256hex(key), license_id: lic.id, label: String(body.label || '').slice(0, 60), prefix: key.slice(0, 7) });
  return json({ key, note: 'Copy it now. Lunara keeps only a fingerprint and cannot show it again.' });
}

async function adminCodes(email, body, deps) {
  if (!isOwner(email, deps.env)) return json({ error: 'Not allowed.' }, 403);
  const plan = PLANS[body.plan] && body.plan !== 'owner' ? body.plan : 'app_month';
  const n = Math.min(50, Math.max(1, Number(body.count) || 1));
  const days = Math.min(400, Math.max(1, Number(body.days) || PLANS[plan].days));
  const codes = [];
  for (let i = 0; i < n; i++) {
    const code = `LENS-${randomId(4)}-${randomId(4)}`;
    await deps.db.createCode({ code, plan, days, note: String(body.note || '').slice(0, 120) });
    codes.push(code);
  }
  return json({ plan, days, codes });
}

async function apiDetect(req, deps) {
  const auth = req.headers.get('authorization') || '';
  const key = auth.replace(/^Bearer\s+/i, '').trim();
  if (!/^lk_[a-z0-9]{32}$/.test(key)) return json({ error: 'Send your API key as: Authorization: Bearer lk_…' }, 401);
  const row = await deps.db.getKey(await sha256hex(key));
  if (!row || row.revoked_at) return json({ error: 'Unknown or revoked API key.' }, 401);
  const lic = await deps.db.getLicense(row.license_id);
  if (!lic || new Date(lic.expires_at).getTime() < Date.now()) return json({ error: 'The plan behind this key has ended. Renew at lunarasociety.com/lens/.' }, 402);
  if (!deps.env.ANTHROPIC_API_KEY) return json({ error: 'The detection service is not switched on yet.' }, 503);
  let body;
  try { body = await req.json(); } catch { return json({ error: 'The request body must be JSON.' }, 400); }
  const kind = body.kind || (body.image ? 'image' : body.frames ? 'video' : 'text');
  const task = { image: 'detect_image', video: 'detect_frames', text: 'detect_text' }[kind];
  if (!task) return json({ error: 'kind must be image, video or text.' }, 400);
  const images = kind === 'image' ? [body.image] : kind === 'video' ? (body.frames || []).slice(0, 6) : [];
  if (kind !== 'text' && !images.every((s) => /^data:image\/(jpeg|png|webp);base64,/.test(String(s)))) {
    return json({ error: 'Images must be data URLs: data:image/jpeg;base64,…' }, 400);
  }
  return runTask(lic, task, { images, text: body.text, evidence: body.evidence, lang: body.lang || 'en' }, 'api:' + task, deps);
}

/* ── the owner's desk ───────────────────────────────────────────── */

async function adminOverview(email, deps) {
  if (!isOwner(email, deps.env)) return json({ error: 'Not allowed.' }, 403);
  const [stats, claims, licences] = await Promise.all([
    deps.db.stats(period()), deps.db.pendingClaims(), deps.db.recentLicenses()
  ]);
  return json({ period: period(), paused: await paused(deps), stats, claims, licences: (licences || []).filter((l) => l.plan !== 'owner') });
}

async function adminClaim(email, body, deps) {
  if (!isOwner(email, deps.env)) return json({ error: 'Not allowed.' }, 403);
  const c = await deps.db.getClaim(String(body.claim_id || ''));
  if (!c || c.status !== 'pending') return json({ error: 'That claim is not pending.' }, 400);
  if (body.decision === 'reject') {
    await deps.db.updateClaim(c.id, { status: 'rejected', decided_at: new Date().toISOString() });
    return json({ ok: true, status: 'rejected' });
  }
  const plan = PLANS[body.plan] && body.plan !== 'owner' ? body.plan : 'app_month';
  if (await deps.db.licenseByTxn(c.paypal_txn)) return json({ error: 'That payment already activated a licence.' }, 409);
  await grant(c.email, plan, 'paypal', c.paypal_txn, deps);
  await deps.db.updateClaim(c.id, { status: 'approved', decided_at: new Date().toISOString() });
  return json({ ok: true, status: 'approved', email: c.email, plan });
}

async function adminPause(email, body, deps) {
  if (!isOwner(email, deps.env)) return json({ error: 'Not allowed.' }, 403);
  if (typeof body.paused !== 'boolean') return json({ error: 'Send paused: true or false.' }, 400);
  await deps.db.setConfig('ai_paused', String(body.paused));
  return json({ ok: true, paused: body.paused });
}

async function adminGrant(email, body, deps) {
  if (!isOwner(email, deps.env)) return json({ error: 'Not allowed.' }, 403);
  const to = String(body.email || '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) return json({ error: 'Enter a valid email address.' }, 400);
  const plan = PLANS[body.plan] && body.plan !== 'owner' ? body.plan : 'comp';
  const days = Math.min(400, Math.max(1, Number(body.days) || PLANS[plan].days));
  await grant(to, plan, 'admin', null, deps, days);
  return json({ ok: true, email: to, plan, days });
}

/* ── Rosario's voice ────────────────────────────────────────────── */

async function speak(email, body, deps) {
  const lic = await licenceFor(email, deps);
  if (!lic) return json({ error: 'This needs an active Lunara Lens plan.', code: 'license' }, 402);
  if (!deps.env.ELEVENLABS_API_KEY || !deps.tts) return json({ error: 'The natural voice is not switched on yet.', code: 'offline' }, 503);
  if (await paused(deps)) return PAUSED();
  const text = String(body.text || '').replace(/\s+/g, ' ').trim().slice(0, 700);
  if (!text) return json({ error: 'Nothing to say.' }, 400);
  const lang = body.lang === 'es' ? 'es' : 'en';
  const cost = ttsCost(text.length, deps.env);
  if (lic.plan !== 'owner') {
    const spent = await deps.db.spent(lic.id, period());
    if (spent + cost > Number(lic.budget_usd_month)) return json({ error: 'This month’s allowance is used up.', code: 'allowance' }, 402);
  }
  const audio = await deps.tts({ text, voice: VOICES[lang], model: TTS_MODEL });
  if (!audio) return json({ error: 'The voice service did not answer.', code: 'offline' }, 502);
  await deps.db.logUsage({ license_id: lic.id, period: period(), route: 'speak', model: TTS_MODEL, input_tokens: text.length, output_tokens: 0, cost_usd: cost });
  return new Response(audio, { status: 200, headers: { 'content-type': 'audio/mpeg', 'cache-control': 'no-store' } });
}

/* ── the Android download ───────────────────────────────────────────
   The APK published on the site is encrypted. Only a licensed account,
   or the owner, receives the key that opens it. */
async function download(email, deps) {
  const lic = await licenceFor(email, deps);
  if (!lic) return json({ error: 'The app is available after payment.', code: 'license' }, 402);
  const key = await deps.db.getConfig('apk_key');
  if (!key) return json({ error: 'The download is not ready yet.' }, 503);
  const meta = JSON.parse(key);
  return json({ key: meta.key, iv: meta.iv, url: meta.url, sha256: meta.sha256, name: meta.name || 'Lunara-Lens.apk' });
}
