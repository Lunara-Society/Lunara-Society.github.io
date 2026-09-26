/* ═══════════════════════════════════════════════════════════════════
   LUNARA LENS — Supabase Edge Function
   ═══════════════════════════════════════════════════════════════════

   Everything of consequence lives in lens-core.mjs, which the tests run
   under Node. This file supplies the three things that cannot run off
   the platform: the tables, the model call and PayPal.

   Deployed with verify_jwt disabled on purpose, as lunara-auth is: the
   app signs in through lunara-auth and sends that session token, which
   this function checks by asking lunara-auth. The detection API takes
   its own keys. Every table is behind RLS with no policies.

   Secrets (Supabase → Edge Functions → Secrets):
     ANTHROPIC_API_KEY      required for every AI feature
     PAYPAL_CLIENT_ID       optional; lets buyers activate themselves
     PAYPAL_CLIENT_SECRET     with their PayPal Transaction ID
     LENS_MODEL_DEEP        optional; default claude-opus-5-5 (detection)
     LENS_MODEL_FAST        optional; default claude-sonnet-5 (assistant)
     GOOGLE_PLAY_SERVICE_ACCOUNT  the JSON key of a Google Cloud service
                            account invited to Play Console with the
                            "View financial data" and "Manage orders and
                            subscriptions" permissions; checks and
                            acknowledges purchases made in the Android app
     ELEVENLABS_API_KEY     optional; Rosario speaks with Caty's voice
     LENS_OWNER_EMAILS      optional; default lunarasociety@gmail.com
   ═══════════════════════════════════════════════════════════════════ */

// @ts-nocheck — lens-core.mjs is deliberately plain JS, shared with Node.
import Anthropic from 'npm:@anthropic-ai/sdk';
import { handleLens, withCors, json } from './lens-core.mjs';

const env = Deno.env.toObject();
const REST = `${env.SUPABASE_URL}/rest/v1`;
const H = {
  apikey: env.SUPABASE_SERVICE_ROLE_KEY,
  authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
  'content-type': 'application/json'
};

async function rest(path: string, init: RequestInit = {}) {
  const res = await fetch(REST + path, { ...init, headers: { ...H, ...(init.headers || {}) } });
  if (!res.ok) throw new Error(`${init.method || 'GET'} ${path.split('?')[0]} ${res.status}: ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}
const one = (r: unknown) => (Array.isArray(r) && r.length ? r[0] : null);
const q = encodeURIComponent;
const insert = (table: string, row: unknown) =>
  rest(`/${table}`, { method: 'POST', headers: { prefer: 'return=representation' }, body: JSON.stringify(row) }).then(one);

const db = {
  licensesFor: (email: string) => rest(`/lens_licenses?email=ilike.${q(email)}&order=expires_at.desc&limit=20`),
  getLicense: (id: string) => rest(`/lens_licenses?id=eq.${q(id)}&limit=1`).then(one),
  licenseByTxn: (txn: string) => rest(`/lens_licenses?paypal_txn=eq.${q(txn)}&limit=1`).then(one),
  createLicense: (row: unknown) => insert('lens_licenses', row),
  spent: (id: string, period: string) =>
    rest('/rpc/lens_spent', { method: 'POST', body: JSON.stringify({ p_license: id, p_period: period }) }).then(Number),
  logUsage: (row: unknown) => insert('lens_usage', row),
  getCode: (code: string) => rest(`/lens_codes?code=eq.${q(code)}&limit=1`).then(one),
  // Conditional on still being unredeemed, so two redemptions at once cannot both win.
  markCodeRedeemed: (code: string, email: string) =>
    rest(`/lens_codes?code=eq.${q(code)}&redeemed_at=is.null`, {
      method: 'PATCH', headers: { prefer: 'return=representation' },
      body: JSON.stringify({ redeemed_by: email, redeemed_at: new Date().toISOString() })
    }).then((r) => Array.isArray(r) && r.length === 1),
  createCode: (row: unknown) => insert('lens_codes', row),
  getMark: (id: string) => rest(`/lens_marks?id=eq.${q(id)}&limit=1`).then(one),
  createMark: (row: unknown) => insert('lens_marks', row),
  getKey: (hash: string) => rest(`/lens_api_keys?key_hash=eq.${q(hash)}&limit=1`).then(one),
  createKey: (row: unknown) => insert('lens_api_keys', row),
  createClaim: (row: unknown) => insert('lens_claims', row),
  claimByTxn: (txn: string) => rest(`/lens_claims?paypal_txn=eq.${q(txn)}&limit=1`).then(one),
  pendingClaimFor: (email: string) => rest(`/lens_claims?email=ilike.${q(email)}&status=eq.pending&limit=1`).then(one),
  pendingClaims: () => rest('/lens_claims?status=eq.pending&order=created_at.asc&limit=50'),
  getClaim: (id: string) => /^[0-9a-f-]{36}$/.test(id) ? rest(`/lens_claims?id=eq.${q(id)}&limit=1`).then(one) : Promise.resolve(null),
  updateClaim: (id: string, patch: unknown) => rest(`/lens_claims?id=eq.${q(id)}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  recentLicenses: () => rest('/lens_licenses?select=email,plan,source,expires_at,created_at&order=created_at.desc&limit=30'),
  stats: (period: string) => rest('/rpc/lens_month_stats', { method: 'POST', body: JSON.stringify({ p_period: period }) }),
  getConfig: (key: string) => rest(`/lens_config?key=eq.${q(key)}&limit=1`).then(one).then((r) => (r ? r.value : null)),
  // Credits
  getWallet: (email: string) => rest(`/lens_wallets?email=eq.${q(email)}&limit=1`).then(one),
  createWallet: (row: unknown) => rest('/lens_wallets?on_conflict=email', {
    method: 'POST', headers: { prefer: 'resolution=ignore-duplicates,return=representation' }, body: JSON.stringify(row)
  }).then(one),
  updateWallet: (email: string, patch: Record<string, unknown>) => rest(`/lens_wallets?email=eq.${q(email)}`, {
    method: 'PATCH', headers: { prefer: 'return=minimal' }, body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() })
  }),
  addLedger: (row: unknown) => rest('/lens_ledger', { method: 'POST', headers: { prefer: 'return=minimal' }, body: JSON.stringify(row) }),
  ledgerFor: (email: string) => rest(`/lens_ledger?email=eq.${q(email)}&order=created_at.desc&limit=30`),
  spendCredits: (email: string, n: number, ref: string) =>
    rest('/rpc/lens_spend', { method: 'POST', body: JSON.stringify({ p_email: email, p_credits: n, p_ref: ref }) }),
  addCredits: (email: string, bucket: string, n: number, kind: string, ref: string) =>
    rest('/rpc/lens_add', { method: 'POST', body: JSON.stringify({ p_email: email, p_bucket: bucket, p_credits: n, p_kind: kind, p_ref: ref }) }),
  getPurchase: (ref: string) => rest(`/lens_purchases?ref=eq.${q(ref)}&limit=1`).then(one),
  // true only for the request that wrote it: a purchase is granted once.
  recordPurchase: (row: unknown) => rest('/lens_purchases?on_conflict=ref', {
    method: 'POST', headers: { prefer: 'resolution=ignore-duplicates,return=representation' }, body: JSON.stringify(row)
  }).then((r) => Array.isArray(r) && r.length === 1),
  recentWallets: () => rest('/lens_wallets?select=email,tier,sub_credits,pack_credits,tier_expires_at,tier_source&order=updated_at.desc&limit=30'),
  deleteAccount: async (email: string, hash: string) => {
    const e = q(email);
    const lics = await rest(`/lens_licenses?email=ilike.${e}&select=id`);
    const ids = (lics || []).map((l: { id: string }) => l.id);
    if (ids.length) {
      const inList = `in.(${ids.join(',')})`;
      await rest(`/lens_usage?license_id=${inList}`, { method: 'DELETE' });
      await rest(`/lens_api_keys?license_id=${inList}`, { method: 'DELETE' });
    }
    for (const t of ['lens_usage', 'lens_wallets', 'lens_ledger', 'lens_claims', 'lens_licenses']) {
      await rest(`/${t}?email=ilike.${e}`, { method: 'DELETE' });
    }
    await rest(`/lens_purchases?email=ilike.${e}`, { method: 'PATCH', body: JSON.stringify({ email: hash }) });
    await rest(`/lens_codes?redeemed_by=ilike.${e}`, { method: 'PATCH', body: JSON.stringify({ redeemed_by: hash }) });
    await rest(`/lens_marks?owner_email=ilike.${e}`, { method: 'PATCH', body: JSON.stringify({ owner_email: hash, owner_name: 'Account deleted', revoked_at: new Date().toISOString() }) });
    const members = await rest(`/members?email=ilike.${e}&select=lunara_id,avatar_url`);
    for (const m of members || []) {
      const path = /\/member-avatars\/(.+)$/.exec(String(m.avatar_url || '').split('?')[0]);
      if (path) await fetch(`${env.SUPABASE_URL}/storage/v1/object/member-avatars/${path[1]}`, { method: 'DELETE', headers: H }).catch(() => null);
      if (m.lunara_id) await rest(`/member_offers?lunara_id=eq.${q(m.lunara_id)}`, { method: 'DELETE' });
    }
    await rest(`/members?email=ilike.${e}`, { method: 'DELETE' });
  },
  setConfig: (key: string, value: string) => rest('/lens_config?on_conflict=key', {
    method: 'POST', headers: { prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ key, value, updated_at: new Date().toISOString() })
  })
};

/* Rosario's voice, through ElevenLabs. Returns mp3 bytes or null. */
async function tts({ text, voice, model }) {
  if (!env.ELEVENLABS_API_KEY) return null;
  const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}?output_format=mp3_44100_64`, {
    method: 'POST',
    headers: { 'xi-api-key': env.ELEVENLABS_API_KEY, 'content-type': 'application/json', accept: 'audio/mpeg' },
    body: JSON.stringify({ text, model_id: model, voice_settings: { stability: 0.5, similarity_boost: 0.8 } })
  });
  if (!r.ok) { console.error('tts', r.status, await r.text()); return null; }
  return new Uint8Array(await r.arrayBuffer());
}

/* Sessions are lunara-auth's; asking it keeps its secret in one place. */
async function whoIs(token: unknown) {
  if (typeof token !== 'string' || token.length < 20) return null;
  const res = await fetch(`${env.SUPABASE_URL}/functions/v1/lunara-auth/session`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ session_token: token })
  });
  if (!res.ok) return null;
  const s = await res.json();
  return s && s.email ? s : null;
}

const anthropic = env.ANTHROPIC_API_KEY ? new Anthropic({ apiKey: env.ANTHROPIC_API_KEY }) : null;
const model = (tier: string) =>
  (tier === 'deep' ? env.LENS_MODEL_DEEP || 'claude-opus-5-5' : env.LENS_MODEL_FAST || 'claude-sonnet-5');

async function callModel({ model, system, max_tokens, effort, schema, content }) {
  const res = await anthropic.messages.create({
    model, max_tokens,
    // Each task's instructions are the same on every call: cached, they
    // are billed at a tenth after the first call in five minutes.
    system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
    output_config: { effort, format: { type: 'json_schema', schema } },
    messages: [{ role: 'user', content }]
  });
  const u = res.usage || {};
  const usage = {
    input_tokens: u.input_tokens || 0, output_tokens: u.output_tokens || 0,
    cache_write_tokens: u.cache_creation_input_tokens || 0, cache_read_tokens: u.cache_read_input_tokens || 0
  };
  if (res.stop_reason === 'refusal') return { ...usage, refused: true };
  const text = res.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  let result = null;
  try { result = JSON.parse(text); } catch { /* max_tokens cut it off */ }
  return { ...usage, result };
}

let ppToken = { value: '', until: 0 };
async function paypalCapture(id: string) {
  if (!env.PAYPAL_CLIENT_ID || !env.PAYPAL_CLIENT_SECRET) return null;
  const base = env.PAYPAL_ENV === 'sandbox' ? 'https://api-m.sandbox.paypal.com' : 'https://api-m.paypal.com';
  if (Date.now() > ppToken.until) {
    const r = await fetch(`${base}/v1/oauth2/token`, {
      method: 'POST',
      headers: { authorization: 'Basic ' + btoa(`${env.PAYPAL_CLIENT_ID}:${env.PAYPAL_CLIENT_SECRET}`), 'content-type': 'application/x-www-form-urlencoded' },
      body: 'grant_type=client_credentials'
    });
    if (!r.ok) return null;
    const t = await r.json();
    ppToken = { value: t.access_token, until: Date.now() + (t.expires_in - 60) * 1000 };
  }
  const r = await fetch(`${base}/v2/payments/captures/${encodeURIComponent(id)}`, {
    headers: { authorization: `Bearer ${ppToken.value}` }
  });
  if (r.status === 404) return { status: 'NOT_FOUND', amount: {} };
  return r.ok ? r.json() : null;
}

/* ── Google Play ─────────────────────────────────────────────────────
   A service account signs a short JWT (RS256, WebCrypto) for an access
   token to the Android Publisher API, cached for its hour. */
const PLAY_PKG = 'com.lunarasociety.lens';
const PLAY_API = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PLAY_PKG}/purchases`;
const b64url = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
let gTok = { v: '', until: 0 };
async function googleToken() {
  if (Date.now() < gTok.until) return gTok.v;
  const sa = JSON.parse(env.GOOGLE_PLAY_SERVICE_ACCOUNT);
  const now = Math.floor(Date.now() / 1000), te = new TextEncoder();
  const part = (o: unknown) => b64url(te.encode(JSON.stringify(o)));
  const unsigned = part({ alg: 'RS256', typ: 'JWT' }) + '.' + part({
    iss: sa.client_email, scope: 'https://www.googleapis.com/auth/androidpublisher',
    aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600
  });
  const der = Uint8Array.from(atob(String(sa.private_key).replace(/-----[^-]+-----/g, '').replace(/\s+/g, '')), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, te.encode(unsigned)));
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=' + unsigned + '.' + b64url(sig)
  });
  if (!r.ok) throw new Error('google token ' + r.status);
  const t = await r.json();
  gTok = { v: t.access_token, until: Date.now() + (t.expires_in - 120) * 1000 };
  return gTok.v;
}
async function gcall(url: string, method = 'GET') {
  const r = await fetch(url, { method, headers: { authorization: 'Bearer ' + await googleToken(), 'content-type': 'application/json' }, body: method === 'POST' ? '{}' : undefined });
  if (r.status === 400 || r.status === 404 || r.status === 410) return null;
  if (!r.ok) throw new Error('play ' + r.status + ' ' + (await r.text()).slice(0, 200));
  const txt = await r.text();
  return txt ? JSON.parse(txt) : {};
}
const et = encodeURIComponent;
const play = env.GOOGLE_PLAY_SERVICE_ACCOUNT ? {
  getSub: (token: string) => gcall(`${PLAY_API}/subscriptionsv2/tokens/${et(token)}`),
  getProduct: (id: string, token: string) => gcall(`${PLAY_API}/products/${et(id)}/tokens/${et(token)}`),
  consume: (id: string, token: string) => gcall(`${PLAY_API}/products/${et(id)}/tokens/${et(token)}:consume`, 'POST'),
  ackSub: (id: string, token: string) => gcall(`${PLAY_API}/subscriptions/${et(id)}/tokens/${et(token)}:acknowledge`, 'POST')
} : null;

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('origin');
  if (req.method === 'OPTIONS') return withCors(new Response(null, { status: 204 }), origin);
  try {
    const res = await handleLens(req, { env, db, whoIs, model, callModel, paypalCapture, tts, play });
    return withCors(res, origin);
  } catch (e) {
    console.error(e);
    return withCors(json({ error: 'Something went wrong on our side. Try again.' }, 500), origin);
  }
});
