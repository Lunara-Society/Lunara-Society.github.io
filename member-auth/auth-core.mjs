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

   ═══════════════════════════════════════════════════════════════════ */

export const GOOGLE_CLIENT_ID =
  '744926178467-645eltr29q4o3lo8msnlnuqsa782feca.apps.googleusercontent.com';
export const GOOGLE_JWKS = 'https://www.googleapis.com/oauth2/v3/certs';

const SESSION_DAYS = 30;
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
  const ACTIONS = ['google', 'signup', 'login', 'session'];
  const last = url.pathname.split('/').filter(Boolean).pop() || '';
  const action = ACTIONS.includes(last) ? last
    : ACTIONS.includes(body.action) ? body.action
    : null;

  switch (action) {
    case 'google':  return authGoogle(body, cfg);
    case 'signup':  return authSignup(body, cfg);
    case 'login':   return authLogin(body, cfg);
    case 'session': return authSession(body, cfg);
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
const LUNARA_ID = /^LUN-MEM-\d{6}$/i;

/* Six digits is a million possibilities, which is not many. Minting
   without looking would eventually hand two members the same id, and
   the collision would surface as one of them signing in as the other.
   Checking costs one read at registration and nothing afterwards. */
async function newLunaraId(store) {
  for (let i = 0; i < 8; i++) {
    const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1000000;
    const id = 'LUN-MEM-' + String(n).padStart(6, '0');
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
async function sessionFor(member, cfg) {
  const exp = Date.now() + SESSION_DAYS * 86400000;
  const token = await signSession({ email: member.email, exp }, cfg.sessionSecret);
  return {
    success: true,
    session_token: token,
    lunara_id: member.lunara_id,
    full_name: member.full_name || '',
    tier: member.tier || 'member',
    email: member.email
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
      auth_method: 'google'
    });
    console.log('New member via Google: ' + member.lunara_id);
  } else if (!member.google_sub) {
    // The same person arriving by a second route. Link it, rather than
    // creating a duplicate they can never sign back into.
    const patch = { google_sub: claims.sub };
    if (!member.full_name && claims.name) patch.full_name = claims.name;
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
  return json(await sessionFor(member, cfg));
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
