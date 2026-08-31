/* ═══════════════════════════════════════════════════════════════════
   MEMBER AUTHENTICATION — the logic, with nothing platform-specific
   ═══════════════════════════════════════════════════════════════════

   POST .../google    { id_token }                      → session
   POST .../signup    { email, password, full_name }    → session
   POST .../login     { identifier, password }          → session
   POST .../session   { session_token }                 → who it is

   The action may also travel in the body as { action: "login", ... }
   so the whole thing is reachable at a single URL.

   This file exists because the four functions the member page used to
   call — lunaraGoogleAuth, lunaraLogin, lunaraSignup and
   lunaraVerifySession — every one of them answered 404, not deployed.
   The sign-in form had been posting into nothing since the day it went
   up. Nobody could register and nobody could sign in.

   It is plain JavaScript over the Web Crypto API and fetch, both of
   which Deno and Node have, so the same code that serves the site is
   the code the tests exercise. Storage is injected rather than
   imported: the deployed function hands it Postgres, the test suite
   hands it a Map, and neither one is a different program.

   A store must provide:
     getByEmail(email)      → member | null
     getById(lunaraId)      → member | null   (for signing in by id)
     create(member)         → member
     update(email, patch)   → member

   And, only if avatar uploads are wanted:
     putAvatar(path, bytes, contentType) → public URL

   ═══════════════════════════════════════════════════════════════════ */

export const GOOGLE_CLIENT_ID =
  '744926178467-645eltr29q4o3lo8msnlnuqsa782feca.apps.googleusercontent.com';
export const GOOGLE_JWKS = 'https://www.googleapis.com/oauth2/v3/certs';

/* Twenty-four hours. A month-long session on an account that will
   eventually carry a certification decision is a month in which a
   borrowed laptop is a signed-in member. The cost is that people sign
   in daily; Google One Tap makes that one click, and the page warns
   before it happens rather than dropping them mid-form. */
const SESSION_HOURS = 24;
const PBKDF2_ITERATIONS = 210000;
const MIN_PASSWORD = 10;

const enc = new TextEncoder();
const dec = new TextDecoder();

const b64url = (buf) => {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const unb64url = (str) => {
  const pad = String(str).replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(pad + '='.repeat((4 - pad.length % 4) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' }
  });

/* Compares in time proportional to length rather than to how many
   characters matched, so a caller cannot learn a secret one character
   at a time by measuring how long we take to say no. */
function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/* ── CORS ───────────────────────────────────────────────────────────
   The member page is served from lunarasociety.com and this function
   answers on supabase.co, so every call is cross-origin. Without these
   headers the browser throws away a perfectly good 200 and the page
   reports a connection error — indistinguishable, to the person
   trying to sign in, from the backend being down. */

export const ALLOWED_ORIGINS = [
  'https://lunarasociety.com',
  'https://www.lunarasociety.com'
];

export async function withCors(request, handler) {
  const origin = request.headers.get('origin') || '';
  const allow = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  const headers = {
    'access-control-allow-origin': allow,
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-allow-headers': 'content-type, authorization, apikey, x-client-info',
    'access-control-max-age': '86400',
    'vary': 'origin'
  };
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  let res;
  try {
    res = await handler();
  } catch (err) {
    // Never let an unexpected throw become a CORS failure on top of an
    // error — the page would report the wrong problem.
    console.error('auth threw: ' + (err && err.stack || err));
    res = json({ success: false, error: 'Something went wrong on our side.' }, 500);
  }
  const out = new Response(res.body, res);
  for (const [k, v] of Object.entries(headers)) out.headers.set(k, v);
  return out;
}

/* ── the router ─────────────────────────────────────────────────── */

export async function handleAuth(request, url, cfg) {
  if (request.method !== 'POST') {
    return json({ success: false, error: 'POST only' }, 405);
  }
  if (!cfg || !cfg.store) {
    console.error('no member store configured — auth cannot answer');
    return json({ success: false, error: 'Member storage is not configured.' }, 500);
  }
  if (!cfg.sessionSecret) {
    console.error('no session secret — refusing to issue unsigned sessions');
    return json({ success: false, error: 'Sessions are not configured.' }, 500);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ success: false, error: 'Expected JSON.' }, 400);
  }
  if (!body || typeof body !== 'object') {
    return json({ success: false, error: 'Expected JSON.' }, 400);
  }

  /* Two ways in, because the function is mounted under a path this
     code does not control (/functions/v1/lunara-auth/...). The last
     segment decides when it names an action; otherwise the body may
     say so, which keeps the whole thing reachable at one URL. */
  const ACTIONS = ['google', 'signup', 'login', 'session', 'profile', 'avatar'];
  const last = url.pathname.split('/').filter(Boolean).pop() || '';
  const action = ACTIONS.includes(last) ? last
    : ACTIONS.includes(body.action) ? body.action
    : null;

  switch (action) {
    case 'google':  return authGoogle(body, cfg);
    case 'signup':  return authSignup(body, cfg);
    case 'login':   return authLogin(body, cfg);
    case 'session': return authSession(body, cfg);
    case 'profile': return authProfile(body, cfg);
    case 'avatar':  return authAvatar(body, cfg);
    default:        return json({ success: false, error: 'Unknown route.' }, 404);
  }
}

/* ── Google ID tokens ───────────────────────────────────────────────
   Verified against Google's published keys, not merely decoded. A
   decoded JWT proves nothing at all: anyone can mint one with any
   email address in it. The signature is the only part of it that
   makes it a credential. */

let jwksCache = { at: 0, keys: null };

export function _resetJwksCache() { jwksCache = { at: 0, keys: null }; }

async function googleKeys(cfg) {
  if (jwksCache.keys && Date.now() - jwksCache.at < 3600000) return jwksCache.keys;
  const res = await fetch(cfg.jwksUrl || GOOGLE_JWKS);
  if (!res.ok) throw new Error('JWKS HTTP ' + res.status);
  const { keys } = await res.json();
  if (!Array.isArray(keys) || !keys.length) throw new Error('JWKS empty');
  jwksCache = { at: Date.now(), keys };
  return keys;
}

export async function verifyGoogleIdToken(idToken, cfg) {
  const parts = String(idToken || '').split('.');
  if (parts.length !== 3) throw new Error('malformed token');

  let header, claims;
  try {
    header = JSON.parse(dec.decode(unb64url(parts[0])));
    claims = JSON.parse(dec.decode(unb64url(parts[1])));
  } catch {
    throw new Error('malformed token');
  }
  if (header.alg !== 'RS256') throw new Error('unexpected algorithm ' + header.alg);

  const jwk = (await googleKeys(cfg)).find((k) => k.kid === header.kid);
  if (!jwk) throw new Error('signing key not found');

  const key = await crypto.subtle.importKey(
    'jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']
  );
  const ok = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5', key, unb64url(parts[2]), enc.encode(parts[0] + '.' + parts[1])
  );
  if (!ok) throw new Error('signature invalid');

  const clientId = cfg.googleClientId || GOOGLE_CLIENT_ID;
  if (claims.aud !== clientId) throw new Error('wrong audience');
  if (!['accounts.google.com', 'https://accounts.google.com'].includes(claims.iss)) {
    throw new Error('wrong issuer');
  }
  if (typeof claims.exp !== 'number' || claims.exp * 1000 < Date.now()) {
    throw new Error('token expired');
  }
  if (!claims.email) throw new Error('no email in token');
  if (claims.email_verified === false) throw new Error('email not verified by Google');

  return claims;
}

/* ── sessions ───────────────────────────────────────────────────────
   An HMAC over the claims. Nothing has to be looked up to check one
   and nothing has to be swept up when one expires. */

async function hmac(secret, data) {
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  return crypto.subtle.sign('HMAC', key, enc.encode(data));
}

export async function signSession(claims, secret) {
  const payload = b64url(enc.encode(JSON.stringify(claims)));
  return payload + '.' + b64url(await hmac(secret, payload));
}

export async function readSession(token, secret) {
  const [payload, sig] = String(token || '').split('.');
  if (!payload || !sig) return null;
  if (!timingSafeEqual(sig, b64url(await hmac(secret, payload)))) return null;
  let claims;
  try {
    claims = JSON.parse(dec.decode(unb64url(payload)));
  } catch { return null; }
  if (!claims || typeof claims.exp !== 'number' || claims.exp < Date.now()) return null;
  return claims;
}

/* ── passwords ──────────────────────────────────────────────────── */

const hex = (b) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');

export async function hashPassword(password, saltHex) {
  const salt = saltHex
    ? Uint8Array.from(saltHex.match(/../g).map((h) => parseInt(h, 16)))
    : crypto.getRandomValues(new Uint8Array(16));
  const base = await crypto.subtle.importKey(
    'raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' }, base, 256
  );
  return { salt: hex(salt), hash: hex(bits) };
}

/* ── members ────────────────────────────────────────────────────── */

const normalise = (email) => String(email || '').trim().toLowerCase();

/* ── The Lunara ID ──────────────────────────────────────────────────
   LUNA-7K2M-94RT

   It used to be LUN-BUS-2026-00001284, and that was wrong three ways.

   BUS was meant to read "business". It reads "bus". It also encodes a
   category into a permanent identifier, which breaks the first time a
   person registers rather than a company — which is exactly what the
   Google button does. An identifier that has to change when the thing
   it names is reclassified is not a permanent identifier.

   And 00001284 is a counter. A sequential number tells every holder,
   and anyone they show the card to, precisely how many registrations
   came before them. This institution has already had to publish one
   correction about overstating its size; a number that understates it
   in public, permanently, on every member's credential, is the same
   mistake pointing the other way.

   So: opaque, non-sequential, and it says nothing at all except which
   record it names.

   The alphabet is Crockford's base 32 — the digits and the letters
   with I, L, O and U removed. I and L cannot be misread as 1, O
   cannot be misread as 0, and dropping U means the groups cannot
   spell anything anyone would be embarrassed to read out. Each group
   is additionally required to carry at least one digit, which rules
   out the remaining four-letter words without meaningfully shrinking
   the space: about 6.6 × 10^11 identifiers, against a registry that
   will not see a millionth of that. */

const ID_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/* Accepted at sign-in: the current form, and every form that was
   advertised before it — LUN-XXXX-XXXX, LUN-BUS-… and LUN-MEM-….
   Nothing was ever issued under any of them; the table was empty each
   time the format changed. They are accepted so that anyone who wrote
   one down off an old screen meets a sign-in failure rather than a
   validation error, which is a different and more confusing thing.

   The branches cannot collide: LUNA-7K2M-94RT has a letter where the
   LUN- branch requires its first separator. */
const LUNARA_ID =
  /^(?:LUNA-[0-9A-Z]{4}-[0-9A-Z]{4}|LUN-(?:[0-9A-Z]{4}-[0-9A-Z]{4}|(?:BUS|MEM)-[0-9-]{4,16}))$/i;

function idGroup() {
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  let out = '';
  for (const b of bytes) out += ID_ALPHABET[b % 32];
  return out;
}

function mintId() {
  let a = idGroup(), b = idGroup();
  // Rejection rather than substitution: forcing a digit into a fixed
  // position would make that position predictable and every id would
  // wear the same shape.
  while (!/\d/.test(a)) a = idGroup();
  while (!/\d/.test(b)) b = idGroup();
  return 'LUNA-' + a + '-' + b;
}

/* Minting without looking would eventually hand two members the same
   id, and the collision would surface as one of them signing in as
   the other. At this size that is vanishingly unlikely, which is
   exactly why it would never be found by testing. One read at
   registration, nothing afterwards. */
async function newLunaraId(store) {
  for (let i = 0; i < 8; i++) {
    const id = mintId();
    if (!(await store.getById(id))) return id;
  }
  throw new Error('could not mint an unused Lunara id in 8 attempts');
}

/* The sign-in form asks for "Lunara ID or email", so a member who
   memorised their id and never their address has to get in with it. */
async function findMember(identifier, store) {
  const raw = String(identifier || '').trim();
  if (!raw) return null;
  return LUNARA_ID.test(raw) ? store.getById(raw.toUpperCase()) : store.getByEmail(normalise(raw));
}

/* The session carries the tier as it stood at sign-in. A page that
   trusted that forever would show a lapsed member as current, so the
   record stays the truth and the session is only a claim of identity. */
export function publicProfile(member) {
  return {
    full_name: member.full_name || '',
    business_name: member.business_name || '',
    business_domain: member.business_domain || '',
    business_country: member.business_country || '',
    business_role: member.business_role || '',
    bio: member.bio || '',
    avatar_url: member.avatar_url || ''
  };
}

async function sessionFor(member, cfg, isNew = false) {
  const exp = Date.now() + SESSION_HOURS * 3600000;
  const token = await signSession({ email: member.email, exp }, cfg.sessionSecret);
  return {
    success: true,
    session_token: token,
    /* The page needs this to know when to warn and when to eject.
       Sending it beats having the page guess a duration that the
       server could change underneath it. */
    expires_at: exp,
    lunara_id: member.lunara_id,
    tier: member.tier || 'member',
    email: member.email,
    member_since: member.created_at || null,
    ...publicProfile(member),
    // The page shows a record being created or a record being
    // recognised, and those are different things to watch. It decides
    // from this rather than from guessing at the absence of a cookie.
    is_new: !!isNew
  };
}

/* ── the four routes ────────────────────────────────────────────── */

async function authGoogle(body, cfg) {
  let claims;
  try {
    claims = await verifyGoogleIdToken(body.id_token, cfg);
  } catch (err) {
    // The reason goes to the log and never to the caller. "Wrong
    // audience" tells an attacker exactly which knob to turn next.
    console.warn('Google token rejected: ' + err.message);
    return json({ success: false, error: 'Google sign-in could not be verified.' }, 401);
  }

  const email = normalise(claims.email);
  let member = await cfg.store.getByEmail(email);

  if (!member) {
    member = await cfg.store.create({
      email,
      full_name: claims.name || '',
      lunara_id: await newLunaraId(cfg.store),
      tier: 'member',
      google_sub: claims.sub,
      /* Google hands us a profile picture in the id_token. Taking it
         means most members have an avatar without ever uploading one,
         and an uploaded photo overwrites it. It is a picture, never
         evidence of who anybody is. */
      avatar_url: claims.picture || null,
      auth_method: 'google'
    });
    console.log('New member via Google: ' + member.lunara_id);
    return json(await sessionFor(member, cfg, true));
  } else if (!member.google_sub) {
    // The same person arriving by a second route. Link it, rather than
    // creating a duplicate they can never sign back into.
    const patch = { google_sub: claims.sub };
    if (!member.full_name && claims.name) patch.full_name = claims.name;
    if (!member.avatar_url && claims.picture) patch.avatar_url = claims.picture;
    member = await cfg.store.update(email, patch);
  }

  return json(await sessionFor(member, cfg));
}

async function authSignup(body, cfg) {
  const email = normalise(body.email);
  const password = String(body.password || '');
  const fullName = String(body.full_name || '').trim().slice(0, 120);

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return json({ success: false, error: 'That does not look like an email address.' }, 400);
  }
  if (password.length < MIN_PASSWORD) {
    return json({ success: false, error: 'Use at least ' + MIN_PASSWORD + ' characters.' }, 400);
  }
  if (await cfg.store.getByEmail(email)) {
    // Deliberately the same shape as a wrong password on login. This
    // endpoint must not confirm who already has an account here.
    return json({ success: false, error: 'That address cannot be registered. Try signing in.' }, 409);
  }

  /* The form asks for a PayPal transaction id. Nothing here checks it
     against PayPal, so it is recorded as a claim and flagged
     unverified rather than treated as proof of payment. A field that
     looks validated and is not is worse than one that openly is not:
     reconcile these by hand before granting a paid tier. */
  const paypalTxn = String(body.paypal_txn || '').trim().slice(0, 64) || null;

  const { salt, hash } = await hashPassword(password);
  const member = await cfg.store.create({
    email,
    full_name: fullName,
    lunara_id: await newLunaraId(cfg.store),
    tier: 'member',
    salt,
    hash,
    paypal_txn: paypalTxn,
    payment_verified: false,
    auth_method: 'password'
  });

  console.log('New member via password: ' + member.lunara_id);
  return json(await sessionFor(member, cfg, true));
}

async function authLogin(body, cfg) {
  const identifier = String(body.identifier || body.email || '').trim();
  const password = String(body.password || '');
  const member = await findMember(identifier, cfg.store);

  // One answer for "no such account" and for "wrong password", so the
  // endpoint cannot be used to find out who is a member.
  const no = () => json({ success: false, error: 'Those details did not match.' }, 401);

  if (!member || !member.hash || !member.salt) return no();
  const { hash } = await hashPassword(password, member.salt);
  if (!timingSafeEqual(hash, member.hash)) return no();

  return json(await sessionFor(member, cfg));
}

async function authSession(body, cfg) {
  const claims = await readSession(body.session_token, cfg.sessionSecret);
  const expired = () => json({ success: false, error: 'Session expired.' }, 401);
  if (!claims) return expired();
  const member = await cfg.store.getByEmail(normalise(claims.email));
  if (!member) return expired();
  return json(await sessionFor(member, cfg));
}

/* ── the profile ──────────────────────────────────────────────────
   Everything a member states about themselves. Stated, not verified:
   typing a domain here proves nothing about controlling it, which is
   what Shield certification is for, and the field carries no
   certification claim. Saying so in the store comment and on the form
   keeps the two from being confused by anybody, us included. */

const FIELDS = {
  full_name:        { max: 120 },
  business_name:    { max: 160 },
  business_domain:  { max: 253, domain: true },
  business_country: { max: 60 },
  business_role:    { max: 100 },
  bio:              { max: 600 }
};

/* A domain, not a URL and not an email. Accepting "https://x.com/about"
   and storing it whole would mean a registry lookup on it silently
   never matches. */
function cleanDomain(raw) {
  const d = String(raw).trim().toLowerCase()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//, '')
    .replace(/^www\./, '')
    .replace(/[/?#].*$/, '')
    .replace(/\.$/, '');
  if (!d) return '';
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(d)) return null;
  return d;
}

async function memberFromSession(body, cfg) {
  const claims = await readSession(body.session_token, cfg.sessionSecret);
  if (!claims) return null;
  return cfg.store.getByEmail(normalise(claims.email));
}

async function authProfile(body, cfg) {
  const member = await memberFromSession(body, cfg);
  if (!member) return json({ success: false, error: 'Session expired.' }, 401);

  // No patch means "tell me what you have".
  if (!body.profile || typeof body.profile !== 'object') {
    return json({ success: true, lunara_id: member.lunara_id, ...publicProfile(member) });
  }

  const patch = {};
  for (const [key, rule] of Object.entries(FIELDS)) {
    if (!(key in body.profile)) continue;
    let v = body.profile[key];
    if (v === null) { patch[key] = null; continue; }
    if (typeof v !== 'string') {
      return json({ success: false, error: `${key} must be text.` }, 400);
    }
    v = v.trim().replace(/\s+/g, ' ');
    if (v.length > rule.max) {
      return json({ success: false, error: `${key} is longer than ${rule.max} characters.` }, 400);
    }
    if (rule.domain && v) {
      const d = cleanDomain(v);
      if (d === null) return json({ success: false, error: 'That does not look like a domain.' }, 400);
      v = d;
    }
    patch[key] = v || null;
  }

  if (!Object.keys(patch).length) {
    return json({ success: false, error: 'Nothing to update.' }, 400);
  }
  patch.profile_updated_at = new Date().toISOString();

  const saved = await cfg.store.update(member.email, patch);
  return json({ success: true, lunara_id: saved.lunara_id, ...publicProfile(saved) });
}

/* ── the avatar ───────────────────────────────────────────────────
   Sent as a data URL because the client has already drawn the image
   onto a 256px canvas — which downsizes it, strips EXIF, and re-encodes
   whatever was handed over as a known format. A profile photo should
   not carry the GPS coordinates of where it was taken, and a file this
   code never parses cannot carry a decoder exploit either.

   The type is taken from the re-encode, not from the filename, and it
   is checked against the same allowlist the bucket enforces. Two walls
   rather than one. */

const AVATAR_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const AVATAR_MAX = 262144;   // 256 KB, the bucket's own ceiling

export function decodeDataUrl(dataUrl) {
  const m = /^data:([a-z]+\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/i.exec(String(dataUrl || ''));
  if (!m) return { error: 'Expected a base64 data URL.' };
  const type = m[1].toLowerCase();
  if (!AVATAR_TYPES[type]) return { error: 'Only JPEG, PNG or WebP.' };
  let bin;
  try { bin = atob(m[2]); } catch { return { error: 'That image did not decode.' }; }
  if (bin.length > AVATAR_MAX) return { error: 'That image is over 256 KB after resizing.' };
  if (bin.length < 64) return { error: 'That image is empty.' };
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { type, ext: AVATAR_TYPES[type], bytes };
}

async function authAvatar(body, cfg) {
  const member = await memberFromSession(body, cfg);
  if (!member) return json({ success: false, error: 'Session expired.' }, 401);

  // Removing a photo is a thing people want to do.
  if (body.remove === true) {
    const saved = await cfg.store.update(member.email, {
      avatar_url: null, profile_updated_at: new Date().toISOString()
    });
    return json({ success: true, avatar_url: '', lunara_id: saved.lunara_id });
  }

  if (!cfg.store.putAvatar) {
    return json({ success: false, error: 'Avatar storage is not configured.' }, 501);
  }

  const img = decodeDataUrl(body.image);
  if (img.error) return json({ success: false, error: img.error }, 400);

  /* Keyed on the Lunara id, not the email — an object path is visible
     in a public URL and a member's address is not ours to publish.
     The timestamp busts every cache that held the old one. */
  const path = `${member.lunara_id}/${Date.now()}.${img.ext}`;
  let url;
  try {
    url = await cfg.store.putAvatar(path, img.bytes, img.type);
  } catch (err) {
    console.error('avatar upload failed: ' + (err && err.message || err));
    return json({ success: false, error: 'That image could not be stored.' }, 502);
  }

  const saved = await cfg.store.update(member.email, {
    avatar_url: url, profile_updated_at: new Date().toISOString()
  });
  return json({ success: true, avatar_url: url, lunara_id: saved.lunara_id });
}
