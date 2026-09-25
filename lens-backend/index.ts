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
     LENS_MODEL_DEEP        optional; default claude-opus-5
     LENS_MODEL_FAST        optional; default claude-opus-5
     LENS_ADMIN_EMAILS      optional; default lunarasociety@gmail.com
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
  createKey: (row: unknown) => insert('lens_api_keys', row)
};

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
  (tier === 'deep' ? env.LENS_MODEL_DEEP : env.LENS_MODEL_FAST) || 'claude-opus-5';

async function callModel({ model, system, max_tokens, effort, schema, content }) {
  const res = await anthropic.messages.create({
    model, max_tokens, system,
    output_config: { effort, format: { type: 'json_schema', schema } },
    messages: [{ role: 'user', content }]
  });
  const usage = { input_tokens: res.usage?.input_tokens || 0, output_tokens: res.usage?.output_tokens || 0 };
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

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('origin');
  if (req.method === 'OPTIONS') return withCors(new Response(null, { status: 204 }), origin);
  try {
    const res = await handleLens(req, { env, db, whoIs, model, callModel, paypalCapture });
    return withCors(res, origin);
  } catch (e) {
    console.error(e);
    return withCors(json({ error: 'Something went wrong on our side. Try again.' }, 500), origin);
  }
});
