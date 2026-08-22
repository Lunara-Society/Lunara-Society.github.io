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

import { handleAuth, withCors, _resetJwksCache } from './auth-core.mjs';

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
    _rows: rows
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
  check('signup mints a Lunara id', /^LUN-MEM-\d{6}$/.test(out.lunara_id || ''), out.lunara_id);
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

  r = await call('login', { identifier: 'LUN-MEM-000000', password: 'a long enough password' }, cfg);
  check('an unissued Lunara ID is 401', r.status === 401, 'status=' + r.status);

  /* Minting must never hand two members the same id. Crowd the space
     so that only one value is free and check that it finds it. */
  const crowded = memStore();
  crowded.getById = async (id) => (id === 'LUN-MEM-424242' ? null : { lunara_id: id });
  let n = 0;
  const realRandom = crypto.getRandomValues.bind(crypto);
  crypto.getRandomValues = (arr) => { arr[0] = n++ < 3 ? 111111 : 424242; return arr; };
  r = await call('signup', { email: 'crowded@example.org', password: 'a long enough password' },
    cfgFor(crowded));
  out = await r.json();
  crypto.getRandomValues = realRandom;
  check('minting skips ids that are already taken', out.lunara_id === 'LUN-MEM-424242',
    out.lunara_id);
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
  check('Google sign-in mints a Lunara id', /^LUN-MEM-\d{6}$/.test(out.lunara_id || ''),
    out.lunara_id);
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

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
