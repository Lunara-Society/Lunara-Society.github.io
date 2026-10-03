/* ═══════════════════════════════════════════════════════════════════
   LUNARA LENS — backend core
   ═══════════════════════════════════════════════════════════════════

   Plain JavaScript so the test suite can run it under Node; index.ts
   only supplies the database, the model call and the secrets.

   Routes (POST unless marked):
     GET  /health                              which secrets are present
     /me        { session_token }              plan, credits, what things cost
     /redeem    { session_token, code }        activation code → plan or credits
     /purchase/play { session_token, product_id, purchase_token }  Google Play
     /pay/create  { session_token, product }   Stripe Checkout for a plan or pack (web)
     /pay/confirm { session_token, session_id } add what was paid for, once
     /pay/sync    { session_token }            find this account's paid sessions
     /history   { session_token }              the last credit movements
     /ai        { session_token, task, lang, … }   the AI features
     /speak     { session_token, text, lang }  Caty's voice (Pro and Luna Max)
     /mark      { session_token, sha256, owner_name, title } → mark id
     GET  /mark/<id>                           public ownership record
     /account/delete { session_token, confirm: "DELETE" }
     /report    { session_token, task, answer, reason }  flag an AI answer
     /apikey    { session_token, label }       API key, shown once
     /admin/…   the owner's desk
     /v1/detect   Authorization: Bearer lk_…   the paid detection API

   ON MONEY
   The app is free to download. Every signed-in account has a wallet of
   credits: 50 welcome credits that never expire, 20 more each month on
   the free plan, or a paid plan's monthly credits (Starter 800, Pro
   2,500, Luna Max 7,000). Bought packs never expire; a plan's monthly
   credits do not roll over. Each AI action costs a fixed number of
   credits (CREDITS below), taken before the model is called and given
   back if the call fails, so members always know the price in advance.

   The fixed prices are set from what the calls really cost, which is
   still priced from token counts and written to lens_usage. The
   cheapest credit Lunara sells is a Luna Max credit ($49.99 / 7,000 ≈
   $0.0071, ≈ $0.0061 after Google's 15%); every action is priced so
   its typical cost stays under half of what its credits bring in.

   Accounts that bought the earlier $25 month, or were given a
   complimentary year, keep that licence and its dollar allowance until
   it ends; the owner is never metered.

   Everything that can run on the phone does: speech in and out,
   magnifier, text recognition, metadata and watermark forensics,
   Lunara Marks, files, reminders, lists, memory. Those cost nothing.
   ═══════════════════════════════════════════════════════════════════ */

export const PLANS = {
  app_month: { days: 31,  budget: 10.0,  price: 25,  label: 'Lunara Lens, 1 month' },
  app_year:  { days: 365, budget: 4.0,   price: 79,  label: 'Lunara Lens, 12 months' }, // earlier buyers keep it
  api_month: { days: 31,  budget: 120.0, price: 199, label: 'Lunara Detection API, 1 month' },
  comp:      { days: 365, budget: 4.0,   price: 0,   label: 'Lunara Lens, complimentary' },
  // Never metered (spend() skips it); the figure only has to fit numeric(10,4).
  owner:     { days: 36500, budget: 100000, price: 0, label: 'Owner · no limits' }
};

/* The credit plans. Play subscription ids map onto them; on the web a
   plan bought through Stripe is one month that does not renew. */
export const TIERS = {
  free:    { monthly: 20,   price: 0,     voice: false, deep: false, label: 'Free' },
  starter: { monthly: 800,  price: 7.99,  voice: false, deep: false, label: 'Starter' },
  pro:     { monthly: 2500, price: 19.99, voice: true,  deep: false, label: 'Pro' },
  max:     { monthly: 7000, price: 49.99, voice: true,  deep: true,  label: 'Luna Max' }
};
export const WELCOME = 50;
export const PACKS = {
  credits_500:  { credits: 500,  price: 6.99,  label: '500 credits' },
  credits_1500: { credits: 1500, price: 17.99, label: '1,500 credits' },
  credits_5000: { credits: 5000, price: 49.99, label: '5,000 credits' }
};
export const PLAY_SUBS = { luna_starter: 'starter', luna_pro: 'pro', luna_max: 'max' };
export const PLAY_PACKAGE = 'com.lunarasociety.lens';

/* What each action costs, in credits. Detection runs on the deep model;
   a video check sends six frames, so it costs more. */
export const CREDITS = {
  rosario: 4, intent: 3, translate: 5, replies: 5, describe: 8, read: 12,
  summarize: 15, write: 10, coach: 8, plan_day: 6,
  detect_image: 25, detect_text: 25, detect_audio: 20, scam: 20, detect_frames: 60
};
/* Caty's live voice: one credit per 10 characters, so a typical spoken
   answer (about 120 characters) is 12. ElevenLabs bills about $0.00011 a
   character; the recorded lines and the phone's own voice are free.
   Every price here brings in at least five times what the call costs
   (test_lens.mjs checks it against the cheapest credit sold). */
export const SPEAK_CHARS_PER_CREDIT = 10;
export const speakCredits = (chars) => Math.max(1, Math.ceil(chars / SPEAK_CHARS_PER_CREDIT));

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

/* Cached instructions: writing the cache costs 1.25× input, reading it 0.1×. */
export function costOf(model, inTok, outTok, cacheWrite = 0, cacheRead = 0) {
  const p = PRICES[model] || PRICES['claude-opus-5'];
  return (inTok * p[0] + cacheWrite * p[0] * 1.25 + cacheRead * p[0] * 0.1 + outTok * p[1]) / 1e6;
}
// Claude via Anthropic directly, or via Google Cloud Vertex AI.
const aiOn = (deps) => !!(deps.env.ANTHROPIC_API_KEY || deps.env.LENS_AI_PROVIDER);
const callCost = (model, out) => costOf(model, out.input_tokens, out.output_tokens, out.cache_write_tokens || 0, out.cache_read_tokens || 0);

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
        action: { type: 'string', enum: ['answer', 'describe', 'read', 'detect_image', 'detect_text', 'detect_audio', 'detect_video', 'scan', 'scam', 'link', 'qr', 'translate', 'converse', 'replies', 'magnify', 'color', 'mark', 'verify_mark', 'files', 'organize', 'remind', 'note', 'notes', 'briefing', 'emergency', 'safe_word', 'calm', 'card', 'summarize', 'settings', 'account', 'help', 'stop',
          'remember_fact', 'forget_fact', 'memory', 'list_add', 'list_read', 'lists', 'write', 'coach', 'plan_day', 'talk', 'mode', 'shop'] },
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

The app's actions: describe (what is in front of me), read (read text aloud), detect_image / detect_text / detect_audio / detect_video (is this real or AI), scan (check a screen or print with the camera), scam (is this message a scam), link (is this link safe, arg_text = the link), qr (scan a QR code), translate (arg_text = what, arg_language = target language), converse (live two-way translation), replies (help me answer, arg_text = what they said), magnify, color (what colour is this), mark (put an invisible Lunara Mark on my photo), verify_mark (who owns this image), files (open my files), organize (arg_number latest images into arg_folder), remind (arg_minutes from now, arg_text = what; work out the minutes from the local time in CONTEXT, e.g. "tomorrow at 9" from 20:00 is 780), note (take a note, arg_text = the note), notes (read my notes), briefing (my day: time, weather, reminders, lists), emergency (I need help), safe_word (family safe word against voice-clone scams), calm (I am stressed), card (my medical card), summarize (explain a letter, bill or document), settings, account, help, stop.

You are also the user's personal assistant, at work and at home:
- remember_fact (arg_text = the fact, written in the third person, short: "Her daughter is called Ana", "Parks on level 3") when they ask you to remember something about them or their life. forget_fact (arg_text = what to forget). memory (show what you remember).
- list_add (arg_folder = the list name, e.g. "Shopping", "To do", "Ideas"; arg_text = the items, comma separated). list_read (arg_folder = which list). lists (open all lists).
- write (arg_text = what to write and to whom: a reply, email, complaint, message or letter).
- coach (arg_text = the situation) when someone is pressuring them right now: a call from "the bank", a relative asking for money, tech support, a delivery fee. Coach gives them words to say.
- plan_day (plan my day, what should I do first).
- talk (let's just talk, conversation mode, keep listening).
- mode (arg_text = "work" or "home") to switch between their work and home lists.
- shop (credits, plans, buy, how many credits do I have).

MEMORY in the input is what the user asked you to remember. Use it naturally when it helps ("your daughter Ana"), never recite it unasked, and never claim to remember anything that is not there. MODE says whether they are in work or home mode; LISTS gives their lists.

Unused arguments are "" or 0.`
  },
  summarize: {
    tier: 'fast', effort: 'low', max_tokens: 1800,
    schema: {
      type: 'object', additionalProperties: false,
      required: ['speech', 'summary', 'actions', 'deadlines', 'reminders', 'amount_due'],
      properties: {
        speech: { type: 'string' },
        summary: { type: 'string' },
        actions: { type: 'array', items: { type: 'string' } },
        deadlines: { type: 'array', items: { type: 'string' } },
        reminders: {
          type: 'array',
          items: {
            type: 'object', additionalProperties: false,
            required: ['text', 'date'],
            properties: { text: { type: 'string' }, date: { type: 'string' } }
          }
        },
        amount_due: { type: 'string' }
      }
    },
    system: `You are Rosario, reading a letter, bill, form, appointment or document for the user (the image or text). speech: two to four spoken sentences: who it is from, what it is about, and what, if anything, the user must do and by when. summary: a clear written summary in plain words. actions: things the user needs to do. deadlines: dates that matter, with what they are for. reminders: one entry per deadline or appointment the user should be reminded of; text is the reminder in a few words ("Pay the water bill, 42.10 €"), date is YYYY-MM-DD (use the local date in CONTEXT to resolve the year), or "" when there is no clear date. amount_due: the amount to pay with its currency, or "". If it looks like a scam or a threat to pay urgently, say so plainly and do not create payment reminders for it.`
  },
  write: {
    tier: 'fast', effort: 'low', max_tokens: 1800,
    schema: {
      type: 'object', additionalProperties: false,
      required: ['subject', 'text', 'speech'],
      properties: { subject: { type: 'string' }, text: { type: 'string' }, speech: { type: 'string' } }
    },
    system: `You are Rosario, writing for the user. KIND says what to write (reply, email, complaint, message or letter), TONE how it should sound, and the INPUT what it is about and to whom; if they pasted a message they received, answer it. Write it ready to send, in the WRITE language, in the user's own voice, plainly and without clichés. Use MEMORY only for facts the text needs (their name, a detail they gave you). Never invent facts, reference numbers or promises: leave [brackets] where the user must fill something in. For a complaint: what happened, what they want, by when. subject: an email subject line, or "" for a message. speech: one sentence, in the user's language, saying what you wrote.`
  },
  coach: {
    tier: 'fast', effort: 'low', max_tokens: 1500,
    schema: {
      type: 'object', additionalProperties: false,
      required: ['risk', 'speech', 'say_this', 'do_not', 'check'],
      properties: {
        risk: { type: 'string', enum: ['low', 'medium', 'high'] },
        speech: { type: 'string' },
        say_this: { type: 'array', items: { type: 'string' } },
        do_not: { type: 'array', items: { type: 'string' } },
        check: { type: 'array', items: { type: 'string' } }
      }
    },
    system: `You are Rosario coaching someone through a call, message or visit that may be a scam, while it is happening. Be calm and brief. The golden rules: a real bank, police force, tax office or company never asks for codes, passwords, gift cards, crypto or a transfer to a "safe account"; urgency and secrecy are the signs; hanging up and calling back on a number you already trust is always allowed. A relative asking for money by voice or message can be a voice clone: ask for the family safe word or call them back. speech: two short spoken sentences, the most important instruction first. say_this: 2-3 exact short sentences the user can say right now. do_not: 2-3 things not to do. check: 1-3 safe ways to verify. Never tell them it is certainly safe.`
  },
  plan_day: {
    tier: 'fast', effort: 'low', max_tokens: 1200,
    schema: {
      type: 'object', additionalProperties: false,
      required: ['speech', 'priorities'],
      properties: { speech: { type: 'string' }, priorities: { type: 'array', items: { type: 'string' } } }
    },
    system: `You are Rosario helping the user plan their day. The INPUT holds the time, the weather, their reminders, their lists and MODE (work or home). priorities: the three to five things to do, in a sensible order, each short and concrete, drawn only from what they gave you (plus obvious timing from the weather, like taking an umbrella). speech: two or three warm spoken sentences with the plan. Do not invent tasks or appointments.`
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
      own = await deps.db.createLicense({ email, plan: 'owner', source: 'admin', expires_at: '2099-12-31T00:00:00Z', budget_usd_month: PLANS.owner.budget });
    }
    return own;
  }
  return activeLicense(await deps.db.licensesFor(email));
}

/* The owner's licence, or an earlier paid or complimentary licence
   that is still running. Everyone else is on credits. */
const legacyLicence = licenceFor;

function activeLicense(list, now = Date.now()) {
  return (list || [])
    .filter((l) => new Date(l.expires_at).getTime() > now)
    .sort((a, b) => new Date(b.expires_at) - new Date(a.expires_at))[0] || null;
}

/* Rough input size before the call, to refuse calls the allowance
   cannot cover. Images are sent at most 1024 px on the long edge by
   the app, about 1,400 tokens each; we reserve 1,600. */
export function estimateInput(task, body) {
  const text = JSON.stringify(body.text || '') + JSON.stringify(body.evidence || '') +
    String(body.memory || '') + String(body.lists || '') + JSON.stringify(body.history || '');
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
      ai: aiOn(deps), ai_provider: deps.env.LENS_AI_PROVIDER || (deps.env.ANTHROPIC_API_KEY ? 'anthropic' : null),
      voice: !!deps.env.ELEVENLABS_API_KEY,
      paused: await paused(deps),
      stripe: !!deps.stripe,
      play: !!deps.play,
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
    case '/purchase/play': return purchasePlay(email, body, deps);
    case '/pay/create': return payCreate(email, body, deps);
    case '/pay/confirm': return payConfirm(email, body, deps);
    case '/pay/sync': return paySync(email, deps);
    case '/history': return history(email, deps);
    case '/ai': return ai(email, body, deps);
    case '/mark': return mark(email, who, body, deps);
    case '/apikey': return apikey(email, body, deps);
    case '/account/delete': return deleteAccount(email, body, deps);
    case '/report': return report(email, body, deps);
    case '/admin/report': return adminReport(email, body, deps);
    case '/admin/codes': return adminCodes(email, body, deps);
    case '/admin/overview': return adminOverview(email, deps);
    case '/admin/grant': return adminGrant(email, body, deps);
    case '/admin/credits': return adminCredits(email, body, deps);
    case '/admin/pause': return adminPause(email, body, deps);
    case '/speak': return speak(email, body, deps);
    case '/download': return download(email, deps);
    default: return json({ error: 'No such route.' }, 404);
  }
}

/* The price list the app shows, straight from the constants above. */
function catalogue() {
  return {
    tiers: Object.fromEntries(Object.entries(TIERS).map(([k, v]) => [k, { monthly: v.monthly, price: v.price, voice: v.voice, deep: v.deep, label: v.label }])),
    packs: PACKS, credits: CREDITS, welcome: WELCOME, speak_chars_per_credit: SPEAK_CHARS_PER_CREDIT,
    play: { subs: PLAY_SUBS, packs: Object.keys(PACKS) }
  };
}

async function me(email, deps) {
  const lic = await legacyLicence(email, deps);
  if (lic && lic.plan === 'owner') {
    return json({ licensed: true, owner: true, unlimited: true, email, plan: 'owner', tier: 'owner', label: PLANS.owner.label, voice: true, expires_at: lic.expires_at, allowance_left_pct: 100, resets: nextMonthStart(), catalogue: catalogue() });
  }
  const w = await wallet(email, deps);
  const out = {
    licensed: true, email, tier: w.tier, label: TIERS[w.tier].label,
    credits: w.sub_credits + w.pack_credits, sub_credits: w.sub_credits, pack_credits: w.pack_credits,
    monthly: TIERS[w.tier].monthly, voice: TIERS[w.tier].voice, deep: TIERS[w.tier].deep,
    source: w.tier_source || null,
    renews: w.tier === 'free' ? nextMonthStart() : w.tier_expires_at,
    catalogue: catalogue(),
    card: !!deps.stripe
  };
  if (lic) {
    // An earlier licence still running: its allowance is used first.
    const spent = await deps.db.spent(lic.id, period());
    const budget = Number(lic.budget_usd_month);
    Object.assign(out, {
      plan: lic.plan, legacy: { label: PLANS[lic.plan].label, expires_at: lic.expires_at },
      voice: true, allowance_left_pct: Math.max(0, Math.round((1 - spent / budget) * 100))
    });
  }
  return json(out);
}

/* ── the wallet ─────────────────────────────────────────────────── */

async function wallet(email, deps) {
  let w = await deps.db.getWallet(email);
  if (!w) {
    const made = await deps.db.createWallet({ email, tier: 'free', sub_credits: TIERS.free.monthly, pack_credits: WELCOME, granted_period: period() });
    if (made) {
      await deps.db.addLedger({ email, delta: WELCOME, bucket: 'pack', kind: 'welcome', ref: null });
      await deps.db.addLedger({ email, delta: TIERS.free.monthly, bucket: 'sub', kind: 'monthly', ref: period() });
      return made;
    }
    w = await deps.db.getWallet(email); // another request made it first
  }
  return settle(w, deps);
}

/* Bring a wallet up to date: a paid plan that has run out is renewed
   (Google Play) or falls back to Free; Free gets its monthly credits
   once each calendar month. Monthly credits never roll over. */
async function settle(w, deps) {
  if (w.tier !== 'free' && (!w.tier_expires_at || new Date(w.tier_expires_at).getTime() <= Date.now())) {
    if (w.tier_source === 'play' && w.play_token && deps.play) {
      const r = await syncPlaySub(w.email, w.play_product, w.play_token, deps).catch(() => null);
      if (r && r.active) return deps.db.getWallet(w.email);
    }
    const patch = { tier: 'free', tier_source: null, tier_expires_at: null, sub_credits: TIERS.free.monthly, granted_period: period() };
    await deps.db.updateWallet(w.email, patch);
    await deps.db.addLedger({ email: w.email, delta: TIERS.free.monthly - w.sub_credits, bucket: 'sub', kind: 'plan_ended', ref: w.tier });
    return { ...w, ...patch };
  }
  if (w.tier === 'free' && w.granted_period !== period()) {
    const patch = { sub_credits: TIERS.free.monthly, granted_period: period() };
    await deps.db.updateWallet(w.email, patch);
    await deps.db.addLedger({ email: w.email, delta: TIERS.free.monthly - w.sub_credits, bucket: 'sub', kind: 'monthly', ref: period() });
    return { ...w, ...patch };
  }
  return w;
}

async function setTier(email, tier, source, expiresAt, deps, extra = {}) {
  // Read, not settle: settling could itself be what called us.
  const w = (await deps.db.getWallet(email)) || await wallet(email, deps);
  const patch = { tier, tier_source: source, tier_expires_at: expiresAt, sub_credits: TIERS[tier].monthly, granted_period: period(), ...extra };
  await deps.db.updateWallet(email, patch);
  await deps.db.addLedger({ email, delta: TIERS[tier].monthly - w.sub_credits, bucket: 'sub', kind: 'plan', ref: tier + ':' + source });
}

async function addPack(email, product, kind, ref, deps) {
  await wallet(email, deps);
  return deps.db.addCredits(email, 'pack', PACKS[product].credits, kind, ref);
}

const outOfCredits = (need, w) => json({
  error: `This needs ${need} credits and you have ${w.sub + w.pack}. Get more credits or a plan to carry on. Everything that runs on your phone still works.`,
  code: 'credits', need, credits: w.sub + w.pack
}, 402);

async function history(email, deps) {
  const rows = await deps.db.ledgerFor(email);
  return json({ rows: (rows || []).map((r) => ({ delta: r.delta, kind: r.kind, ref: r.ref, at: r.created_at })) });
}

/* ── Google Play ────────────────────────────────────────────────────
   The Android app sells plans and packs through Google Play Billing
   (Digital Goods API). The app sends the purchase token; Google is
   asked whether it is real and paid, the credits are granted once per
   order, and the purchase is acknowledged (plans) or consumed (packs)
   so Google does not refund it after three days. The first account to
   present a token owns it. */
async function purchasePlay(email, body, deps) {
  if (!deps.play) return json({ error: 'Google Play purchases are not switched on yet.', code: 'offline' }, 503);
  const product = String(body.product_id || '');
  const token = String(body.purchase_token || '');
  if (!token || token.length > 4096) return json({ error: 'Missing purchase token.' }, 400);
  if (!PLAY_SUBS[product] && !PACKS[product]) return json({ error: 'Unknown product.' }, 400);
  const bindRef = 'playtoken:' + await sha256hex(token);
  const bound = await deps.db.getPurchase(bindRef);
  if (bound && bound.email !== email) return json({ error: 'That purchase belongs to another account.' }, 409);
  if (!bound) await deps.db.recordPurchase({ ref: bindRef, email, product, source: 'play' });
  if (PLAY_SUBS[product]) {
    const r = await syncPlaySub(email, product, token, deps);
    if (!r.active) return json({ error: 'Google Play does not show that plan as active.', code: 'play' }, 402);
  } else {
    const p = await deps.play.getProduct(product, token);
    if (!p || p.purchaseState !== 0) return json({ error: 'Google Play does not show that purchase as paid yet.', code: 'play' }, 402);
    const ref = 'play:' + (p.orderId || bindRef);
    if (await deps.db.recordPurchase({ ref, email, product, source: 'play' })) await addPack(email, product, 'pack', ref, deps);
    if (p.consumptionState === 0) await deps.play.consume(product, token);
  }
  return me(email, deps);
}

/* ── Stripe Checkout on the web ─────────────────────────────────────
   The server creates the session at the product's own price, locked to
   the account's email and tagged with the product and a fingerprint of
   the account, so the page cannot change what is charged or who gets it.
   When Stripe shows the session paid — that product, that exact amount
   in dollars, that account — the credits are added once, to the account
   that started it. The app confirms on return; /pay/sync finds any
   payment whose return was missed (a closed tab, another device). */
const SELLABLE = (p) => (TIERS[p] && p !== 'free') || PACKS[p] || p === 'api_month';
const orderTag = async (product, email) => product + '|' + (await sha256hex('order:' + email)).slice(0, 32);
const APP = 'https://lunarasociety.com/lens/app.html';
function productLabel(p) {
  if (TIERS[p]) return `Rosario ${TIERS[p].label}, 1 month`;
  if (PACKS[p]) return `Rosario, ${PACKS[p].label}`;
  return PLANS[p].label;
}
function deliveryText(p, email) {
  const what = TIERS[p] ? `${TIERS[p].monthly.toLocaleString('en-US')} credits a month for one month, starting now`
    : PACKS[p] ? `${PACKS[p].credits.toLocaleString('en-US')} credits that never expire`
    : 'one month of the Detection API; create your keys in the app';
  return `Added to the Lunara Lens account ${email} as soon as the payment completes: ${what}. One payment; nothing renews by itself.`;
}
const cents = (p) => Math.round(PRODUCT_PRICE(p) * 100);

async function payCreate(email, body, deps) {
  if (!deps.stripe) return json({ error: 'Card payments are not switched on yet.', code: 'offline' }, 503);
  const product = String(body.product || '');
  if (!SELLABLE(product)) return json({ error: 'Choose a plan or a pack.' }, 400);
  const tag = await orderTag(product, email);
  const s = await deps.stripe.createSession({
    mode: 'payment',
    customer_email: email,
    client_reference_id: tag.split('|')[1],
    line_items: [{ quantity: 1, price_data: { currency: 'usd', unit_amount: cents(product), product_data: { name: productLabel(product) } } }],
    success_url: `${APP}?paid={CHECKOUT_SESSION_ID}#shop`,
    cancel_url: `${APP}#shop`,
    custom_text: { submit: { message: deliveryText(product, email) } },
    metadata: { kind: 'lens', lens_product: product, account: tag },
    payment_intent_data: { description: productLabel(product), metadata: { kind: 'lens', lens_product: product } }
  });
  return json({ url: s.url, session_id: s.id });
}

/* Settles one Stripe session for this account. Returns null when it is
   paid and has been (or already was) added; otherwise why not. */
async function settleSession(email, s, deps) {
  const product = s && s.metadata && s.metadata.lens_product;
  if (!s || !s.metadata || s.metadata.kind !== 'lens' || !SELLABLE(product)) return 'unknown';
  if (s.metadata.account !== (await orderTag(product, email))) return 'other_account';
  if (s.payment_status !== 'paid') return 'unpaid';
  if (s.amount_total !== cents(product) || s.currency !== 'usd') return 'mismatch';
  const ref = 'stripe:' + s.id;
  if (await deps.db.recordPurchase({ ref, email, product, source: 'stripe' })) await fulfil(email, product, 'stripe', ref, deps);
  return null;
}

async function payConfirm(email, body, deps) {
  if (!deps.stripe) return json({ error: 'Card payments are not switched on yet.', code: 'offline' }, 503);
  const id = String(body.session_id || '');
  if (!/^cs_(test|live)_[A-Za-z0-9]{10,200}$/.test(id)) return json({ error: 'Missing payment.' }, 400);
  const s = await deps.stripe.getSession(id);
  const why = await settleSession(email, s, deps);
  if (why === 'other_account') return json({ error: 'That payment belongs to another account.' }, 409);
  if (why === 'unpaid') return json({ error: 'Stripe has not confirmed this payment yet. Nothing is added until it does; try again in a minute.', code: 'pending' }, 402);
  if (why) return json({ error: 'That payment does not match what was bought. Write to lunarasociety@gmail.com.' }, 400);
  return me(email, deps);
}

async function paySync(email, deps) {
  if (!deps.stripe) return me(email, deps);
  const sessions = await deps.stripe.paidSessionsFor(email);
  for (const s of sessions || []) {
    if (s.metadata && s.metadata.kind === 'lens') await settleSession(email, s, deps);
  }
  return me(email, deps);
}

/* Ask Google for a plan's state; grant a new month once per order id
   (each renewal is a new order), keep the expiry current. */
async function syncPlaySub(email, product, token, deps) {
  const s = await deps.play.getSub(token);
  const ok = s && ['SUBSCRIPTION_STATE_ACTIVE', 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD'].includes(s.subscriptionState);
  if (!ok) return { active: false };
  const line = (s.lineItems || []).find((l) => PLAY_SUBS[l.productId]) || null;
  if (!line) return { active: false };
  const tier = PLAY_SUBS[line.productId];
  const orderRef = 'play:' + (s.latestOrderId || line.latestSuccessfulOrderId || token.slice(0, 40));
  if (await deps.db.recordPurchase({ ref: orderRef, email, product: line.productId, source: 'play' })) {
    await setTier(email, tier, 'play', line.expiryTime, deps, { play_token: token, play_product: line.productId });
  } else {
    await deps.db.updateWallet(email, { tier, tier_source: 'play', tier_expires_at: line.expiryTime, play_token: token, play_product: line.productId });
  }
  if (s.acknowledgementState === 'ACKNOWLEDGEMENT_STATE_PENDING') await deps.play.ackSub(line.productId, token).catch(() => null);
  return { active: true, tier };
}

function nextMonthStart(d = new Date()) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)).toISOString();
}

async function grant(email, plan, source, deps, days) {
  const p = PLANS[plan];
  const existing = activeLicense(await deps.db.licensesFor(email));
  // Buying again extends from the end of what is left, never overlaps.
  const from = existing && existing.plan === plan ? new Date(existing.expires_at) : new Date();
  const expires = new Date(from.getTime() + (days || p.days) * 86400e3);
  return deps.db.createLicense({
    email, plan, source,
    expires_at: expires.toISOString(), budget_usd_month: p.budget
  });
}

async function redeem(email, body, deps) {
  const code = String(body.code || '').toUpperCase().replace(/[^0-9A-Z-]/g, '');
  const row = code && await deps.db.getCode(code);
  if (!row || row.redeemed_at) return json({ error: 'That code is not valid or has already been used.' }, 400);
  const ok = await deps.db.markCodeRedeemed(code, email);
  if (!ok) return json({ error: 'That code has already been used.' }, 409);
  await fulfil(email, row.plan, 'code', 'code:' + code, deps, row.days);
  return me(email, deps);
}

/* Deliver what was bought or given: a credit plan for a number of days,
   a pack of credits, or one of the earlier dollar-allowance licences. */
async function fulfil(email, product, source, ref, deps, days) {
  if (TIERS[product] && product !== 'free') {
    const w = await wallet(email, deps);
    // Buying the same plan again extends it from the end of what is left.
    const from = w.tier === product && w.tier_expires_at && new Date(w.tier_expires_at) > new Date() ? new Date(w.tier_expires_at) : new Date();
    const until = new Date(from.getTime() + (days || 31) * 86400e3).toISOString();
    if (w.tier === product && from > new Date()) {
      await deps.db.updateWallet(email, { tier_expires_at: until });
      return deps.db.addCredits(email, 'sub', TIERS[product].monthly, 'plan', ref);
    }
    return setTier(email, product, source, until, deps);
  }
  if (PACKS[product]) return addPack(email, product, source === 'code' ? 'gift' : 'pack', ref, deps);
  if (PLANS[product] && product !== 'owner') return grant(email, product, source, deps, days);
  throw new Error('unknown product ' + product);
}
const PRODUCT_PRICE = (p) => TIERS[p] ? TIERS[p].price : PACKS[p] ? PACKS[p].price : PLANS[p] ? PLANS[p].price : null;

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
  if (task === 'write') {
    lines.push(`WRITE language: ${LANGS[body.target] || lang}. The user's language: ${lang}.`);
    lines.push(`KIND: ${String(body.kind || 'message').slice(0, 30)}. TONE: ${String(body.tone || 'friendly').slice(0, 30)}.`);
  }
  // The member's own memory, lists and mode live on their phone; they
  // come with the request so Rosario can use them, and are not stored.
  if (body.memory) lines.push('MEMORY:\n' + String(body.memory).slice(0, 2500));
  if (body.lists) lines.push('LISTS:\n' + String(body.lists).slice(0, 2000));
  if (body.mode) lines.push('MODE: ' + (body.mode === 'work' ? 'work' : 'home'));
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
  const cost = callCost(model, out);
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
  if (!aiOn(deps)) return json({ error: 'The AI service is not switched on yet.', code: 'offline' }, 503);
  const lic = await legacyLicence(email, deps);
  if (lic) {
    // The earlier licence pays while its allowance lasts, then credits do.
    const res = await runTask(lic, task, body, task, deps);
    if (res.status !== 402 || lic.plan === 'owner') return res;
  }
  return runCredits(email, task, body, deps);
}

/* One AI action on credits: priced in advance, taken before the call,
   returned if the call does not produce an answer. */
async function runCredits(email, task, body, deps) {
  if (await paused(deps)) return PAUSED();
  const t = TASKS[task];
  const w = await wallet(email, deps);
  const deep = TIERS[w.tier].deep && t.tier === 'deep';
  const price = CREDITS[task] || 2;
  const ref = task + ':' + randomId(10);
  const paid = await deps.db.spendCredits(email, price, ref);
  if (!paid || !paid.ok) return outOfCredits(price, paid || { sub: 0, pack: 0 });
  const refund = () => deps.db.addCredits(email, 'pack', price, 'refund', ref).catch(() => null);
  const model = deps.model(t.tier);
  let out;
  try {
    out = await deps.callModel({
      model, system: t.system, schema: t.schema, content: buildContent(task, body),
      // Luna Max: the detection model thinks harder and may write more.
      max_tokens: deep ? Math.round(t.max_tokens * 1.6) : t.max_tokens, effort: deep ? 'high' : t.effort
    });
  } catch (e) { await refund(); throw e; }
  await deps.db.logUsage({
    license_id: null, email, period: period(),
    route: out.result && typeof out.result.action === 'string' ? `${task}:${out.result.action}`.slice(0, 60) : task, model,
    input_tokens: out.input_tokens + (out.cache_write_tokens || 0) + (out.cache_read_tokens || 0), output_tokens: out.output_tokens, cost_usd: callCost(model, out)
  });
  if (out.refused || !out.result) {
    await refund();
    return out.refused ? json({ error: 'The model declined this request. No credits were used.', code: 'refused' }, 422)
      : json({ error: 'The answer came back incomplete. No credits were used; try again.' }, 502);
  }
  return json({ task, result: out.result, credits: paid.sub + paid.pack, spent: price, deep });
}

async function mark(email, who, body, deps) {
  // Free for every account: it is a record, not a model call.
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
  const want = String(body.plan || 'pro');
  const plan = (TIERS[want] && want !== 'free') || PACKS[want] || (PLANS[want] && want !== 'owner') ? want : 'pro';
  const n = Math.min(50, Math.max(1, Number(body.count) || 1));
  const days = Math.min(400, Math.max(1, Number(body.days) || (PLANS[plan] ? PLANS[plan].days : 31)));
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
  if (!aiOn(deps)) return json({ error: 'The detection service is not switched on yet.' }, 503);
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
  const [stats, licences, wallets, reports] = await Promise.all([
    deps.db.stats(period()), deps.db.recentLicenses(), deps.db.recentWallets ? deps.db.recentWallets() : [],
    deps.db.openReports ? deps.db.openReports() : []
  ]);
  return json({ period: period(), paused: await paused(deps), stats, licences: (licences || []).filter((l) => l.plan !== 'owner'), wallets: wallets || [], reports: reports || [] });
}

async function adminPause(email, body, deps) {
  if (!isOwner(email, deps.env)) return json({ error: 'Not allowed.' }, 403);
  if (typeof body.paused !== 'boolean') return json({ error: 'Send paused: true or false.' }, 400);
  await deps.db.setConfig('ai_paused', String(body.paused));
  return json({ ok: true, paused: body.paused });
}

/* A gift of credits, or a plan for some days, from the owner's desk. */
async function adminCredits(email, body, deps) {
  if (!isOwner(email, deps.env)) return json({ error: 'Not allowed.' }, 403);
  const to = String(body.email || '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) return json({ error: 'Enter a valid email address.' }, 400);
  if (body.tier) {
    if (!TIERS[body.tier] || body.tier === 'free') return json({ error: 'Choose Starter, Pro or Luna Max.' }, 400);
    const days = Math.min(400, Math.max(1, Number(body.days) || 31));
    await fulfil(to, body.tier, 'admin', 'admin:' + randomId(8), deps, days);
    return json({ ok: true, email: to, tier: body.tier, days });
  }
  const n = Math.round(Number(body.credits) || 0);
  if (n < 1 || n > 100000) return json({ error: 'Enter between 1 and 100,000 credits.' }, 400);
  await wallet(to, deps);
  await deps.db.addCredits(to, 'pack', n, 'gift', 'admin:' + email);
  return json({ ok: true, email: to, credits: n });
}

async function adminGrant(email, body, deps) {
  if (!isOwner(email, deps.env)) return json({ error: 'Not allowed.' }, 403);
  const to = String(body.email || '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) return json({ error: 'Enter a valid email address.' }, 400);
  const plan = PLANS[body.plan] && body.plan !== 'owner' ? body.plan : 'comp';
  const days = Math.min(400, Math.max(1, Number(body.days) || PLANS[plan].days));
  await grant(to, plan, 'admin', deps, days);
  return json({ ok: true, email: to, plan, days });
}

/* ── reporting an answer ────────────────────────────────────────────
   Google Play asks apps that generate content with AI to let people
   flag an answer that is offensive, harmful or wrong, from inside the
   app. The member sends the answer they saw; the owner reviews it. */
async function report(email, body, deps) {
  const answer = String(body.answer || '').trim().slice(0, 4000);
  if (!answer) return json({ error: 'Nothing to report.' }, 400);
  await deps.db.createReport({ email, task: String(body.task || 'unknown').slice(0, 40), answer, reason: String(body.reason || '').slice(0, 500) });
  return json({ ok: true });
}
async function adminReport(email, body, deps) {
  if (!isOwner(email, deps.env)) return json({ error: 'Not allowed.' }, 403);
  const id = Number(body.id);
  if (!Number.isInteger(id) || id < 1) return json({ error: 'Which report?' }, 400);
  await deps.db.reviewReport(id);
  return json({ ok: true });
}

/* ── deleting an account ────────────────────────────────────────────
   Google Play requires that an account made in the app can be deleted
   from the app and from the web. This removes the member and everything
   Lens holds about them. Two things stay, without the email address:
   the fact that a payment was used (so it cannot be claimed twice) and
   the public Lunara Mark records, which are revoked, because other
   people may rely on them to see that an image's mark is no longer
   vouched for. */
async function deleteAccount(email, body, deps) {
  if (body.confirm !== 'DELETE') return json({ error: 'Send confirm: "DELETE".' }, 400);
  if (isOwner(email, deps.env)) return json({ error: 'The owner account cannot be deleted from the app.' }, 403);
  await deps.db.deleteAccount(email, await sha256hex('deleted:' + email));
  return json({ ok: true, deleted: true });
}

/* ── Rosario's voice ────────────────────────────────────────────── */

async function speak(email, body, deps) {
  if (!deps.env.ELEVENLABS_API_KEY || !deps.tts) return json({ error: 'The natural voice is not switched on yet.', code: 'offline' }, 503);
  if (await paused(deps)) return PAUSED();
  const text = String(body.text || '').replace(/\s+/g, ' ').trim().slice(0, 700);
  if (!text) return json({ error: 'Nothing to say.' }, 400);
  const lang = body.lang === 'es' ? 'es' : 'en';
  const cost = ttsCost(text.length, deps.env);
  const lic = await legacyLicence(email, deps);
  let onLicence = false, ref = null, price = 0;
  if (lic && lic.plan === 'owner') onLicence = true;
  else if (lic && (await deps.db.spent(lic.id, period())) + cost <= Number(lic.budget_usd_month)) onLicence = true;
  if (!onLicence) {
    // Caty's live voice comes with Pro and Luna Max; everyone has her
    // recorded lines and the phone's own voice for free.
    const w = await wallet(email, deps);
    if (!TIERS[w.tier].voice) return json({ error: 'Rosario’s natural voice comes with Pro and Luna Max.', code: 'voice_plan' }, 402);
    price = speakCredits(text.length); ref = 'speak:' + randomId(10);
    const paid = await deps.db.spendCredits(email, price, ref);
    if (!paid || !paid.ok) return outOfCredits(price, paid || { sub: 0, pack: 0 });
  }
  const audio = await deps.tts({ text, voice: VOICES[lang], model: TTS_MODEL }).catch(() => null);
  if (!audio) {
    if (ref) await deps.db.addCredits(email, 'pack', price, 'refund', ref).catch(() => null);
    return json({ error: 'The voice service did not answer.', code: 'offline' }, 502);
  }
  await deps.db.logUsage({ license_id: onLicence ? lic.id : null, email, period: period(), route: 'speak', model: TTS_MODEL, input_tokens: text.length, output_tokens: 0, cost_usd: cost });
  return new Response(audio, { status: 200, headers: { 'content-type': 'audio/mpeg', 'cache-control': 'no-store' } });
}

/* ── the Android download ───────────────────────────────────────────
   The APK published on the site is encrypted, and the key that opens it
   is given to any signed-in account. (It was paid-only before the app
   went free with credits.) */
async function download(email, deps) {
  // The app is free; the key still only goes to a signed-in account.
  const key = await deps.db.getConfig('apk_key');
  if (!key) return json({ error: 'The download is not ready yet.' }, 503);
  const meta = JSON.parse(key);
  return json({ key: meta.key, iv: meta.iv, url: meta.url, sha256: meta.sha256, name: meta.name || 'Lunara-Lens.apk' });
}
