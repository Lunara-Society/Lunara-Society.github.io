/* Tests for the member auth core.
 *
 * Run: node member-auth/test_auth.mjs
 *
 * The Google path is exercised for real: a keypair is generated here,
 * a JWKS endpoint is mocked to serve its public half, and tokens are
 * genuinely signed. That matters more than anything else in this file.
 * A decoded JWT proves nothing — if the signature check were wrong,
 * anyone could sign in as anyone, and a test that stubbed out the
 * verification would pass happily while that was true.
 */

import { handleAuth, withCors, _resetJwksCache, signSession } from './auth-core.mjs';

let pass = 0, fail = 0;
const check = (name, cond, detail = '') => {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (detail ? '  ' + detail : '')); }
};

const te = new TextEncoder();
const b64u = (buf) => {
  let s = ''; for (const b of new Uint8Array(buf)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const CLIENT = 'test-client.apps.googleusercontent.com';
const SECRET = 'test_session_secret_0123456789abcdef';
const JWKS_URL = 'https://jwks.test.invalid/certs';

/* Mirrors the Postgres store in index.ts: unique on email, unique on
   lunara_id, and update() patches by email. */
function memStore() {
  const rows = new Map();
  const uploads = [];
  const clone = (m) => (m ? { ...m } : null);
  return {
    getByEmail: async (email) => clone(rows.get(email)),
    getById: async (id) => clone([...rows.values()].find((m) => m.lunara_id === id)),
    create: async (member) => {
      if (rows.has(member.email)) throw new Error('duplicate email');
      if ([...rows.values()].some((m) => m.lunara_id === member.lunara_id)) {
        throw new Error('duplicate lunara_id');
      }
      const row = { payment_verified: false, ...member, created_at: new Date().toISOString() };
      rows.set(member.email, row);
      return clone(row);
    },
    update: async (email, patch) => {
      const row = { ...rows.get(email), ...patch };
      rows.set(email, row);
      return clone(row);
    },
    putAvatar: async (path, bytes, type) => {
      uploads.push({ path, size: bytes.length, type });
      return 'https://cdn.test.invalid/member-avatars/' + path;
    },
    _rows: rows,
    _uploads: uploads
  };
}

const cfgFor = (store, over = {}) => ({
  store, sessionSecret: SECRET, googleClientId: CLIENT, jwksUrl: JWKS_URL, ...over
});

const req = (action, body, method = 'POST') => new Request(
  'https://x.test/functions/v1/lunara-auth' + (action ? '/' + action : ''),
  {
    method,
    body: body === undefined ? undefined
      : (typeof body === 'string' ? body : JSON.stringify(body)),
    headers: { 'content-type': 'application/json', origin: 'https://lunarasociety.com' }
  }
);

const call = (action, body, cfg, method = 'POST') => {
  const r = req(action, body, method);
  return withCors(r, () => handleAuth(r, new URL(r.url), cfg));
};

/* ── Google token machinery ─────────────────────────────────────── */

const rsa = { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' };
const keypair = () => crypto.subtle.generateKey(
  { ...rsa, modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]) },
  true, ['sign', 'verify']);

async function publicJwk(kp, kid) {
  const jwk = await crypto.subtle.exportKey('jwk', kp.publicKey);
  delete jwk.key_ops; delete jwk.ext;            // Google's JWKS carries neither
  return { ...jwk, kid, alg: 'RS256', use: 'sig' };
}

async function idToken(kp, kid, claims, alg = 'RS256') {
  const h = b64u(te.encode(JSON.stringify({ alg, kid, typ: 'JWT' })));
  const p = b64u(te.encode(JSON.stringify(claims)));
  const sig = await crypto.subtle.sign(rsa, kp.privateKey, te.encode(h + '.' + p));
  return h + '.' + p + '.' + b64u(sig);
}

const goodClaims = (over = {}) => ({
  iss: 'https://accounts.google.com',
  aud: CLIENT,
  sub: '1102938475610293847',
  email: 'founder@example.org',
  email_verified: true,
  name: 'A Founder',
  exp: Math.floor(Date.now() / 1000) + 3600,
  ...over
});

/* ═══════════════════════════════════════════════════════════════ */

console.log('\nRouting, CORS and configuration');
{
  const cfg = cfgFor(memStore());

  let r = await call('login', undefined, cfg, 'OPTIONS');
  check('preflight is 204', r.status === 204, 'status=' + r.status);
  check('preflight allows the site origin',
    r.headers.get('access-control-allow-origin') === 'https://lunarasociety.com',
    r.headers.get('access-control-allow-origin'));

  r = await call('login', undefined, cfg, 'GET');
  check('GET is 405', r.status === 405, 'status=' + r.status);

  r = await call('nonsense', {}, cfg);
  check('an unknown action is 404', r.status === 404, 'status=' + r.status);

  r = await call('', {}, cfg);
  check('no action at all is 404', r.status === 404, 'status=' + r.status);

  r = await call('login', 'not json at all', cfg);
  check('a non-JSON body is 400', r.status === 400, 'status=' + r.status);

  r = await call('login', '"a bare string"', cfg);
  check('a JSON non-object is 400', r.status === 400, 'status=' + r.status);

  r = await call('login', { email: 'a@b.co', password: 'x' }, { sessionSecret: SECRET });
  check('no store is 500, not a silent success', r.status === 500, 'status=' + r.status);

  r = await call('login', { email: 'a@b.co', password: 'x' }, { store: memStore() });
  check('no session secret is 500 rather than an unsigned session',
    r.status === 500, 'status=' + r.status);

  // The action may travel in the body, so one URL serves all four.
  r = await call('', { action: 'login', identifier: 'nobody@example.org', password: 'x' }, cfg);
  check('the action can come from the body instead of the path',
    r.status === 401, 'status=' + r.status);

  r = await call('signup', { email: 'cors@example.org', password: 'a long enough one' }, cfg);
  check('a real answer still carries the CORS header',
    r.headers.get('access-control-allow-origin') === 'https://lunarasociety.com');

  // A store that throws must not turn into a CORS failure, which is
  // what the browser would report instead of the actual problem.
  const broken = { getByEmail: async () => { throw new Error('database on fire'); } };
  r = await call('login', { identifier: 'a@b.co', password: 'x' }, cfgFor(broken));
  check('a store that throws is a 500 with CORS intact',
    r.status === 500 && r.headers.get('access-control-allow-origin') !== null,
    'status=' + r.status);
}

console.log('\nSignup and login with a passphrase');
{
  const store = memStore();
  const cfg = cfgFor(store);

  let r = await call('signup', { email: 'nope', password: 'a-long-password' }, cfg);
  check('signup rejects a malformed address', r.status === 400, 'status=' + r.status);

  r = await call('signup', { email: 'short@example.org', password: 'abc' }, cfg);
  check('signup rejects a short passphrase', r.status === 400, 'status=' + r.status);
  check('nothing was written for a rejected signup', store._rows.size === 0);

  r = await call('signup', {
    email: 'Mem@Example.org', password: 'correct horse battery',
    full_name: 'Mem Ber', paypal_txn: '7XY44821AB009911C'
  }, cfg);
  let out = await r.json();
  check('signup succeeds', r.status === 200 && out.success === true, JSON.stringify(out));
  check('signup returns a session token',
    typeof out.session_token === 'string' && out.session_token.includes('.'));
  check('signup mints a Lunara id', /^LUNA-[0-9A-Z]{4}-[0-9A-Z]{4}$/.test(out.lunara_id || ''),
    out.lunara_id);
  check('the address is folded to lower case', store._rows.has('mem@example.org'),
    [...store._rows.keys()].join(','));

  const row = store._rows.get('mem@example.org');
  check('the passphrase is not stored', JSON.stringify(row).indexOf('correct horse battery') === -1);
  check('a salt and a hash are stored instead',
    /^[0-9a-f]{32}$/.test(row.salt) && /^[0-9a-f]{64}$/.test(row.hash));
  check('the PayPal reference is kept', row.paypal_txn === '7XY44821AB009911C');
  check('the PayPal reference is flagged unverified', row.payment_verified === false);
  check('an unverified payment does not grant a paid tier', row.tier === 'member', row.tier);

  const first = out;

  r = await call('signup', { email: 'mem@example.org', password: 'another long password' }, cfg);
  const dup = await r.json();
  check('a second signup on the same address is refused', r.status === 409, 'status=' + r.status);
  check('the refusal does not confirm the address is taken',
    !/already|exists|taken|registered here/i.test(dup.error || ''), dup.error);
  check('the duplicate did not overwrite the first member',
    store._rows.get('mem@example.org').hash === row.hash);

  r = await call('login', { identifier: 'MEM@example.org', password: 'correct horse battery' }, cfg);
  out = await r.json();
  check('login succeeds, case-insensitively', r.status === 200 && out.success === true,
    JSON.stringify(out));
  check('login returns the same Lunara id as signup', out.lunara_id === first.lunara_id);

  r = await call('login', { identifier: 'mem@example.org', password: 'wrong entirely' }, cfg);
  const badPass = await r.json();
  check('a wrong passphrase is 401', r.status === 401, 'status=' + r.status);

  r = await call('login', { identifier: 'stranger@example.org', password: 'wrong entirely' }, cfg);
  const noSuch = await r.json();
  check('an unknown address is 401', r.status === 401, 'status=' + r.status);
  check('wrong passphrase and unknown address are indistinguishable',
    badPass.error === noSuch.error, badPass.error + ' / ' + noSuch.error);

  r = await call('login', { identifier: 'mem@example.org', password: '' }, cfg);
  check('an empty passphrase is 401', r.status === 401, 'status=' + r.status);

  r = await call('login', {}, cfg);
  check('no identifier at all is 401', r.status === 401, 'status=' + r.status);
}

console.log('\nSigning in with a Lunara ID');
{
  const store = memStore();
  const cfg = cfgFor(store);

  const reg = await (await call('signup',
    { email: 'byid@example.org', password: 'a long enough password' }, cfg)).json();

  let r = await call('login', { identifier: reg.lunara_id, password: 'a long enough password' }, cfg);
  let out = await r.json();
  check('a Lunara ID signs in', r.status === 200 && out.lunara_id === reg.lunara_id,
    'status=' + r.status);

  r = await call('login',
    { identifier: reg.lunara_id.toLowerCase(), password: 'a long enough password' }, cfg);
  check('a lower-case Lunara ID signs in too', r.status === 200, 'status=' + r.status);

  r = await call('login', { identifier: reg.lunara_id, password: 'the wrong one' }, cfg);
  check('a Lunara ID with the wrong passphrase is still 401', r.status === 401, 'status=' + r.status);

  r = await call('login', { identifier: 'LUNA-ZZZZ-9999', password: 'a long enough password' }, cfg);
  check('an unissued Lunara ID is 401', r.status === 401, 'status=' + r.status);

  /* Anyone who wrote down one of the shapes the site used to advertise
     should meet a sign-in failure, not a validation error. */
  for (const legacy of ['LUN-BUS-2026-00001284', 'LUN-MEM-000123', 'LUN-7K2M-94RT']) {
    r = await call('login', { identifier: legacy, password: 'x' }, cfg);
    check('a legacy id (' + legacy + ') is looked up, not refused as malformed',
      r.status === 401, 'status=' + r.status);
  }

  /* Minting must never hand two members the same id. Crowd the space
     so only one value is free and check that it finds it. */
  const crowded = memStore();
  let handed = 0;
  const free = 'LUNA-A1B2-C3D4';
  crowded.getById = async (id) => (id === free ? null : { lunara_id: id });
  const realRandom = crypto.getRandomValues.bind(crypto);
  const bytesFor = (g) => Uint8Array.from([...g].map((c) => '0123456789ABCDEFGHJKMNPQRSTVWXYZ'.indexOf(c)));
  const scripted = [
    bytesFor('QQQQ'), bytesFor('QQQQ'),          // first attempt, both groups
    bytesFor('A1B2'), bytesFor('C3D4')           // second attempt lands on the free one
  ];
  crypto.getRandomValues = (arr) => {
    if (arr.length === 4 && handed < scripted.length) { arr.set(scripted[handed++]); return arr; }
    return realRandom(arr);
  };
  r = await call('signup', { email: 'crowded@example.org', password: 'a long enough password' },
    cfgFor(crowded));
  out = await r.json();
  crypto.getRandomValues = realRandom;
  check('minting skips an id that is already taken', out.lunara_id === free, out.lunara_id);
}

console.log('\nThe shape of a Lunara ID');
{
  const store = memStore();
  const cfg = cfgFor(store);
  const ids = [];
  for (let i = 0; i < 40; i++) {
    ids.push((await (await call('signup',
      { email: 'shape' + i + '@example.org', password: 'a long enough password' }, cfg)).json()).lunara_id);
  }

  check('every id matches LUNA-XXXX-XXXX',
    ids.every((id) => /^LUNA-[0-9A-Z]{4}-[0-9A-Z]{4}$/.test(id)), ids[0]);

  /* I and L cannot be misread as 1, O cannot be misread as 0, and
     without U the groups cannot spell anything unfortunate. */
  check('no id contains I, L, O or U', !ids.some((id) => /[ILOU]/.test(id.slice(5))),
    ids.find((id) => /[ILOU]/.test(id.slice(5))));

  check('every group carries at least one digit',
    ids.every((id) => id.split('-').slice(1).every((g) => /\d/.test(g))),
    ids.find((id) => id.split('-').slice(1).some((g) => !/\d/.test(g))));

  /* The point of the change: an id must not tell its holder, or
     anyone they show it to, how many came before them. */
  check('ids are not sequential', new Set(ids).size === ids.length &&
    ids.slice(1).every((id, i) => id !== ids[i]), 'collision in 40');
  check('no id carries a category or a year',
    !ids.some((id) => /BUS|MEM|20\d\d/.test(id)), ids.find((id) => /BUS|MEM|20\d\d/.test(id)));
}

console.log('\nWhat the page is told about the moment');
{
  const store = memStore();
  const cfg = cfgFor(store);

  let out = await (await call('signup',
    { email: 'fresh@example.org', password: 'a long enough password' }, cfg)).json();
  check('a first registration is marked new', out.is_new === true, JSON.stringify(out.is_new));

  out = await (await call('login',
    { identifier: 'fresh@example.org', password: 'a long enough password' }, cfg)).json();
  check('signing in again is not marked new', out.is_new === false, JSON.stringify(out.is_new));

  out = await (await call('session', { session_token: out.session_token }, cfg)).json();
  check('restoring a session is not marked new', out.is_new === false, JSON.stringify(out.is_new));
  check('the session reports when the member joined',
    typeof out.member_since === 'string' && !isNaN(Date.parse(out.member_since)),
    String(out.member_since));

  /* Nothing beyond identity and standing may leave this endpoint —
     no hash, no salt, no PayPal reference, no Google subject. */
  const leaked = ['hash', 'salt', 'paypal_txn', 'google_sub', 'payment_verified', 'id']
    .filter((k) => k in out);
  check('no credential material is returned to the page', leaked.length === 0, leaked.join(','));
}

console.log('\nSessions');
{
  const store = memStore();
  const cfg = cfgFor(store);

  const reg = await (await call('signup',
    { email: 'sess@example.org', password: 'a sufficiently long one', full_name: 'Sess' },
    cfg)).json();
  const token = reg.session_token;

  let r = await call('session', { session_token: token }, cfg);
  let out = await r.json();
  check('a fresh session verifies', r.status === 200 && out.success === true, JSON.stringify(out));
  check('the session names the right member',
    out.email === 'sess@example.org' && out.lunara_id === reg.lunara_id);

  r = await call('session', { session_token: token.slice(0, -2) + 'AA' }, cfg);
  check('a tampered signature is rejected', r.status === 401, 'status=' + r.status);

  r = await call('session', { session_token: token },
    cfgFor(store, { sessionSecret: 'a different secret entirely' }));
  check('a session signed with another secret is rejected', r.status === 401, 'status=' + r.status);

  // Claims that say what an attacker wants, unsigned. This is the
  // attack the HMAC exists to stop.
  const forged = b64u(te.encode(JSON.stringify(
    { email: 'sess@example.org', exp: Date.now() + 86400000 }))) + '.nonsense';
  r = await call('session', { session_token: forged }, cfg);
  check('a self-minted payload is rejected', r.status === 401, 'status=' + r.status);

  r = await call('session', { session_token: '' }, cfg);
  check('an empty token is rejected', r.status === 401, 'status=' + r.status);

  r = await call('session', {}, cfg);
  check('a missing token is rejected', r.status === 401, 'status=' + r.status);

  store._rows.delete('sess@example.org');
  r = await call('session', { session_token: token }, cfg);
  check('a token for a member who no longer exists is rejected', r.status === 401,
    'status=' + r.status);
}

console.log('\nGoogle sign-in');
{
  _resetJwksCache();
  const kp = await keypair();
  const impostor = await keypair();
  const KID = 'test-kid-1';
  const jwks = { keys: [await publicJwk(kp, KID)] };

  const realFetch = globalThis.fetch;
  let jwksUp = false;
  globalThis.fetch = async (input) => {
    const u = typeof input === 'string' ? input : input.url;
    if (u === JWKS_URL) {
      return jwksUp
        ? new Response(JSON.stringify(jwks), { headers: { 'content-type': 'application/json' } })
        : new Response('upstream down', { status: 503 });
    }
    throw new Error('unexpected fetch: ' + u);
  };

  const store = memStore();
  const cfg = cfgFor(store);
  const post = (t) => call('google', { id_token: t }, cfg);
  const members = () => store._rows.size;

  /* First, and it has to be: the key set is cached for an hour on the
     first success, so there is no second chance to see what happens
     when Google is unreachable. */
  let r = await post(await idToken(kp, KID, goodClaims()));
  check('an unreachable JWKS is 401 — not a crash, and not a pass',
    r.status === 401, 'status=' + r.status);
  check('nobody was created while Google was unreachable', members() === 0);

  jwksUp = true;

  r = await post(await idToken(kp, KID, goodClaims()));
  let out = await r.json();
  check('a properly signed token signs in', r.status === 200 && out.success === true,
    JSON.stringify(out));
  check('Google sign-in mints a Lunara id',
    /^LUNA-[0-9A-Z]{4}-[0-9A-Z]{4}$/.test(out.lunara_id || ''), out.lunara_id);
  check('the name from the token is kept', out.full_name === 'A Founder', out.full_name);
  const firstId = out.lunara_id;

  r = await post(await idToken(kp, KID, goodClaims()));
  out = await r.json();
  check('signing in twice does not create a second member',
    out.lunara_id === firstId && members() === 1, out.lunara_id + ' members=' + members());

  const reasons = [];
  const reject = async (name, token) => {
    const res = await post(token);
    reasons.push((await res.json()).error);
    check(name, res.status === 401, 'status=' + res.status);
  };

  await reject('a token signed by someone else is rejected',
    await idToken(impostor, KID, goodClaims({ email: 'attacker@example.org' })));
  await reject('a token with an unknown key id is rejected',
    await idToken(kp, 'some-other-kid', goodClaims({ email: 'attacker@example.org' })));
  await reject('a token declaring alg none is rejected',
    await idToken(kp, KID, goodClaims({ email: 'attacker@example.org' }), 'none'));
  await reject('a token for another audience is rejected',
    await idToken(kp, KID, goodClaims({ aud: 'someone-else.apps.googleusercontent.com' })));
  await reject('a token from another issuer is rejected',
    await idToken(kp, KID, goodClaims({ iss: 'https://accounts.evil.example' })));
  await reject('an expired token is rejected',
    await idToken(kp, KID, goodClaims({ exp: Math.floor(Date.now() / 1000) - 60 })));
  await reject('a token with no expiry is rejected',
    await idToken(kp, KID, goodClaims({ exp: undefined })));
  await reject('a token with no email is rejected',
    await idToken(kp, KID, goodClaims({ email: undefined })));
  await reject('an unverified email is rejected',
    await idToken(kp, KID, goodClaims({ email_verified: false })));
  await reject('a malformed token is rejected', 'not.a.jwt');
  await reject('an empty token is rejected', '');
  await reject('a missing token is rejected', undefined);

  check('no rejection leaks why it failed',
    reasons.every((e) => e === 'Google sign-in could not be verified.'),
    [...new Set(reasons)].join(' | '));
  check('no rejected token created a member', members() === 1, 'members=' + members());

  /* Someone who registered with a passphrase, then later presses the
     Google button on the same address. One person, one record —
     otherwise they get a second empty account and lose their history. */
  const pw = await (await call('signup',
    { email: 'both@example.org', password: 'a passphrase long enough' }, cfg)).json();
  r = await post(await idToken(kp, KID, goodClaims({ email: 'both@example.org', sub: '999' })));
  out = await r.json();
  check('Google links to an existing account rather than duplicating it',
    out.lunara_id === pw.lunara_id, out.lunara_id + ' vs ' + pw.lunara_id);
  check('the linked record kept its passphrase hash',
    /^[0-9a-f]{64}$/.test(store._rows.get('both@example.org').hash));
  check('the linked record gained the Google subject',
    store._rows.get('both@example.org').google_sub === '999');

  r = await call('session', { session_token: out.session_token }, cfg);
  check('the session issued by Google sign-in verifies', r.status === 200, 'status=' + r.status);

  globalThis.fetch = realFetch;
}

/* call() yields a Response. These suites want the status and the body
   together, and a Response body can only be read once. */
const read = async (p) => { const r = await p; return { status: r.status, body: await r.json() }; };

/* ── sessions expire in a day ───────────────────────────────────── */
{
  console.log('\nsession lifetime');
  const cfg = cfgFor(memStore());
  await read(call('signup', { email: 'day@b.co', password: 'a-long-enough-pass', full_name: 'Day' }, cfg));
  const r = await read(call('login', { email: 'day@b.co', password: 'a-long-enough-pass' }, cfg));
  const hours = (r.body.expires_at - Date.now()) / 3600000;

  check('a session expires in about 24 hours, not 30 days',
    hours > 23.9 && hours < 24.1, hours.toFixed(2) + 'h');
  check('the page is told when its session ends',
    typeof r.body.expires_at === 'number' && r.body.expires_at > Date.now());

  /* The claim inside the token has to agree with what was advertised,
     or the page ejects at one time and the server at another. */
  const claims = JSON.parse(
    new TextDecoder().decode(
      Uint8Array.from(atob(r.body.session_token.split('.')[0].replace(/-/g, '+').replace(/_/g, '/')),
        (c) => c.charCodeAt(0))));
  check('the token agrees with the advertised expiry', claims.exp === r.body.expires_at);

  const stale = await signSession({ email: 'day@b.co', exp: Date.now() - 1000 }, SECRET);
  const s2 = await read(call('session', { session_token: stale }, cfg));
  check('a session one second past expiry is refused', s2.status === 401, 'status=' + s2.status);

  const s3 = await read(call('profile', { session_token: stale }, cfg));
  check('an expired session cannot read a profile', s3.status === 401, 'status=' + s3.status);
  const s4 = await read(call('avatar', { session_token: stale, remove: true }, cfg));
  check('an expired session cannot change an avatar', s4.status === 401, 'status=' + s4.status);
}

/* ── the profile ────────────────────────────────────────────────── */
{
  console.log('\nprofile');
  const store = memStore();
  const cfg = cfgFor(store);
  const up = await read(call('signup', { email: 'p@b.co', password: 'a-long-enough-pass', full_name: 'P' }, cfg));
  const tok = up.body.session_token;

  let r = await read(call('profile', { session_token: tok }, cfg));
  check('a new member has an empty profile rather than an error',
    r.status === 200 && r.body.business_name === '', JSON.stringify(r.body.business_name));

  r = await read(call('profile', { session_token: tok, profile: {
    business_name: '  Acme   Systems  Ltd ', business_domain: 'HTTPS://WWW.Acme.com/about?x=1',
    business_country: 'Ireland', business_role: 'Head of Compliance', bio: 'We ship things.'
  } }, cfg));
  check('a profile saves', r.status === 200, 'status=' + r.status);
  check('whitespace is collapsed', r.body.business_name === 'Acme Systems Ltd', r.body.business_name);
  check('a pasted URL is stored as a bare domain',
    r.body.business_domain === 'acme.com', r.body.business_domain);

  r = await read(call('profile', { session_token: tok, profile: { business_domain: 'not a domain' } }, cfg));
  check('a non-domain is refused', r.status === 400, 'status=' + r.status);
  r = await read(call('profile', { session_token: tok }, cfg));
  check('the refused value was not saved', r.body.business_domain === 'acme.com', r.body.business_domain);

  r = await read(call('profile', { session_token: tok, profile: { bio: 'x'.repeat(601) } }, cfg));
  check('an over-long field is refused', r.status === 400, 'status=' + r.status);
  r = await read(call('profile', { session_token: tok, profile: { business_name: 42 } }, cfg));
  check('a non-string field is refused', r.status === 400, 'status=' + r.status);

  r = await read(call('profile', { session_token: tok, profile: { tier: 'founder' } }, cfg));
  check('an unknown field cannot be smuggled in', r.status === 400, 'status=' + r.status);
  check('tier was not changed by the attempt',
    store._rows.get('p@b.co').tier === 'member', store._rows.get('p@b.co').tier);

  r = await read(call('profile', { session_token: tok, profile: { business_name: '' } }, cfg));
  check('a field can be cleared', r.status === 200 && r.body.business_name === '');

  r = await read(call('profile', { session_token: 'forged.token' }, cfg));
  check('a forged token reads no profile', r.status === 401, 'status=' + r.status);

  /* One member must never be able to write another's record. */
  await read(call('signup', { email: 'q@b.co', password: 'another-long-pass', full_name: 'Q' }, cfg));
  r = await read(call('profile', { session_token: tok, profile: { business_name: 'Mine' }, email: 'q@b.co' }, cfg));
  check('a profile write cannot target another member',
    r.status === 200 && store._rows.get('q@b.co').business_name === undefined,
    String(store._rows.get('q@b.co').business_name));

  const sess = await read(call('session', { session_token: tok }, cfg));
  check('the session answer carries the profile', 'business_domain' in sess.body);
}

/* ── the avatar ─────────────────────────────────────────────────── */
{
  console.log('\navatar');
  const store = memStore();
  const cfg = cfgFor(store);
  const up = await read(call('signup', { email: 'a@v.co', password: 'a-long-enough-pass', full_name: 'A' }, cfg));
  const tok = up.body.session_token;
  const png = 'data:image/png;base64,' + btoa('x'.repeat(200));

  let r = await read(call('avatar', { session_token: tok, image: png }, cfg));
  check('an avatar uploads', r.status === 200 && !!r.body.avatar_url, JSON.stringify(r.body));
  check('it is stored under the Lunara id, never the email',
    store._uploads[0].path.startsWith(up.body.lunara_id + '/') &&
    !store._uploads[0].path.includes('@'), store._uploads[0].path);
  check('the record points at the stored file',
    store._rows.get('a@v.co').avatar_url === r.body.avatar_url);

  r = await call('avatar', { session_token: tok, image: 'data:image/svg+xml;base64,' + btoa('<svg/>') }, cfg);
  check('SVG is refused — it is a script container, not a photo', r.status === 400, 'status=' + r.status);
  r = await call('avatar', { session_token: tok, image: 'data:text/html;base64,' + btoa('<b>x</b>') }, cfg);
  check('HTML dressed as an image is refused', r.status === 400, 'status=' + r.status);
  r = await read(call('avatar', { session_token: tok, image: 'https://evil.test/x.png' }, cfg));
  check('a remote URL is not accepted in place of an image', r.status === 400, 'status=' + r.status);
  r = await call('avatar', { session_token: tok, image: 'data:image/png;base64,' + btoa('x'.repeat(300000)) }, cfg);
  check('an oversized image is refused', r.status === 400, 'status=' + r.status);
  check('no refusal reached storage', store._uploads.length === 1, String(store._uploads.length));

  r = await read(call('avatar', { session_token: tok, remove: true }, cfg));
  check('an avatar can be removed', r.status === 200 && r.body.avatar_url === '');
  check('removal cleared the record', !store._rows.get('a@v.co').avatar_url);

  r = await read(call('avatar', { session_token: 'forged.token', image: png }, cfg));
  check('a forged token uploads nothing', r.status === 401, 'status=' + r.status);
  check('and still nothing more reached storage', store._uploads.length === 1);
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
