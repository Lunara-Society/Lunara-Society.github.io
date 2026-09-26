// node lens-backend/test_lens.mjs — exercises lens-core.mjs with an in-memory store.
import assert from 'node:assert/strict';
import { handleLens, PLANS, costOf, sha256hex, period } from './lens-core.mjs';

function makeDeps(over = {}) {
  const t = { licenses: [], usage: [], codes: [], marks: [], keys: [], claims: [], config: {} };
  const calls = [];
  const db = {
    licensesFor: async (e) => t.licenses.filter((l) => l.email === e),
    getLicense: async (id) => t.licenses.find((l) => l.id === id) || null,
    licenseByTxn: async (x) => t.licenses.find((l) => l.paypal_txn === x) || null,
    createLicense: async (row) => { const l = { id: 'L' + (t.licenses.length + 1), ...row }; t.licenses.push(l); return l; },
    spent: async (id, p) => t.usage.filter((u) => u.license_id === id && u.period === p).reduce((a, u) => a + u.cost_usd, 0),
    logUsage: async (row) => { t.usage.push(row); return row; },
    getCode: async (c) => t.codes.find((x) => x.code === c) || null,
    markCodeRedeemed: async (c, e) => { const x = t.codes.find((y) => y.code === c && !y.redeemed_at); if (!x) return false; x.redeemed_at = 'now'; x.redeemed_by = e; return true; },
    createCode: async (row) => { t.codes.push(row); return row; },
    getMark: async (id) => t.marks.find((m) => m.id === id) || null,
    createMark: async (row) => { const m = { ...row, created_at: '2026-09-25T00:00:00Z' }; t.marks.push(m); return m; },
    getKey: async (h) => t.keys.find((k) => k.key_hash === h) || null,
    createKey: async (row) => { t.keys.push(row); return row; },
    createClaim: async (row) => { const c = { id: 'C' + (t.claims.length + 1), status: 'pending', ...row }; t.claims.push(c); return c; },
    claimByTxn: async (x) => t.claims.find((c) => c.paypal_txn === x) || null,
    pendingClaimFor: async (e) => t.claims.find((c) => c.email === e && c.status === 'pending') || null,
    pendingClaims: async () => t.claims.filter((c) => c.status === 'pending'),
    getClaim: async (id) => t.claims.find((c) => c.id === id) || null,
    updateClaim: async (id, patch) => Object.assign(t.claims.find((c) => c.id === id), patch),
    recentLicenses: async () => t.licenses.slice(-20),
    stats: async () => ({ spent_usd: t.usage.reduce((a, u) => a + u.cost_usd, 0), calls: t.usage.length }),
    getConfig: async (k) => t.config[k] || null
  };
  const deps = {
    env: { ANTHROPIC_API_KEY: 'x' },
    db,
    whoIs: async (tok) => (tok === 'good' ? { email: 'Buyer@Example.com', full_name: 'Ana Buyer' } : tok === 'admin' ? { email: 'lunarasociety@gmail.com', full_name: 'Owner' } : null),
    tts: async () => new Uint8Array([1, 2, 3]),
    model: () => 'claude-opus-5',
    callModel: async (a) => { calls.push(a); return { input_tokens: 2000, output_tokens: 400, result: { speech: 'ok', verdict: 'uncertain' } }; },
    paypalCapture: async (id) => ({ '11111111111111111': { status: 'COMPLETED', amount: { value: '25.00', currency_code: 'USD' } },
      '22222222222222222': { status: 'COMPLETED', amount: { value: '199.00', currency_code: 'USD' } },
      '33333333333333333': { status: 'COMPLETED', amount: { value: '10.00', currency_code: 'USD' } } }[id] || { status: 'NOT_FOUND', amount: {} }),
    ...over
  };
  return { deps, t, calls };
}

const post = (path, body, headers = {}) =>
  new Request('https://x.supabase.co/functions/v1/lunara-lens' + path, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
const get = (path) => new Request('https://x.supabase.co/functions/v1/lunara-lens' + path);
const run = async (deps, req) => { const r = await handleLens(req, deps); return { status: r.status, body: await r.json() }; };

let n = 0; const ok = (name) => { n++; console.log('ok', n, name); };

{ // the allowance can never exceed what a user paid, net of PayPal's fee
  const net = (p) => p - p * 0.0349 - 0.49;
  assert.ok(PLANS.app_month.budget < net(PLANS.app_month.price) * 0.5);
  assert.ok(PLANS.api_month.budget < net(PLANS.api_month.price) * 0.7);
  assert.equal(costOf('claude-opus-5', 1e6, 0), 5);
  assert.equal(costOf('claude-opus-5', 0, 1e6), 25);
  // lens_licenses.budget_usd_month is numeric(10,4): every budget must fit, the owner's included.
  for (const p of Object.values(PLANS)) assert.ok(p.budget < 1e6, 'budget fits the column');
  ok('allowances leave Lunara a margin on the heaviest user');
}
{
  const { deps } = makeDeps();
  let r = await run(deps, post('/me', { session_token: 'bad' }));
  assert.equal(r.status, 401);
  r = await run(deps, post('/ai', { session_token: 'good', task: 'describe', images: [] }));
  assert.equal(r.status, 402); assert.equal(r.body.code, 'license');
  ok('no session → 401, no licence → 402, and no model call is made');
}
{
  const { deps, t } = makeDeps();
  let r = await run(deps, post('/claim', { session_token: 'good', paypal_txn: '11111111111111111' }));
  assert.equal(r.status, 200); assert.equal(r.body.plan, 'app_month'); assert.equal(t.licenses[0].email, 'buyer@example.com');
  r = await run(deps, post('/claim', { session_token: 'good', paypal_txn: '11111111111111111' }));
  assert.equal(r.status, 409);
  r = await run(deps, post('/claim', { session_token: 'good', paypal_txn: '33333333333333333' }));
  assert.equal(r.status, 400);
  r = await run(deps, post('/claim', { session_token: 'good', paypal_txn: '99999999999999999' }));
  assert.equal(r.status, 400);
  ok('a PayPal payment activates once, and only at the right amount');
}
{
  const { deps } = makeDeps({ paypalCapture: async () => null });
  const r = await run(deps, post('/claim', { session_token: 'good', paypal_txn: '11111111111111111' }));
  assert.equal(r.status, 202); assert.equal(r.body.pending, true);
  ok('without PayPal keys, a claim waits for the owner instead of failing');
}
{
  const { deps, t, calls } = makeDeps();
  await run(deps, post('/claim', { session_token: 'good', paypal_txn: '11111111111111111' }));
  let r = await run(deps, post('/ai', { session_token: 'good', task: 'describe', lang: 'es', images: ['data:image/jpeg;base64,AAAA'] }));
  assert.equal(r.status, 200); assert.equal(r.body.result.speech, 'ok');
  assert.equal(calls[0].content[0].type, 'image');
  assert.match(calls[0].content[1].text, /Spanish/);
  assert.equal(t.usage.length, 1); assert.ok(Math.abs(t.usage[0].cost_usd - costOf('claude-opus-5', 2000, 400)) < 1e-9);
  // Spend the month down: every call is logged and the cap holds.
  let refused = null;
  for (let i = 0; i < 2000 && !refused; i++) {
    r = await run(deps, post('/ai', { session_token: 'good', task: 'describe', images: ['data:image/jpeg;base64,AAAA'] }));
    if (r.status === 402) refused = r;
  }
  assert.ok(refused); assert.equal(refused.body.code, 'allowance');
  const spent = t.usage.filter((u) => u.period === period()).reduce((a, u) => a + u.cost_usd, 0);
  assert.ok(spent <= PLANS.app_month.budget, `spent ${spent}`);
  ok(`metered calls stop at the allowance (${t.usage.length} calls, $${spent.toFixed(2)} of $${PLANS.app_month.budget})`);
}
{
  const { deps } = makeDeps();
  let r = await run(deps, post('/admin/codes', { session_token: 'good', count: 2 }));
  assert.equal(r.status, 403);
  r = await run(deps, post('/admin/codes', { session_token: 'admin', count: 2, plan: 'comp', days: 30 }));
  assert.equal(r.body.codes.length, 2);
  const code = r.body.codes[0];
  r = await run(deps, post('/redeem', { session_token: 'good', code: code.toLowerCase() }));
  assert.equal(r.status, 200); assert.equal(r.body.plan, 'comp');
  const days = (new Date(r.body.expires_at) - Date.now()) / 86400e3;
  assert.ok(days > 29 && days < 31);
  r = await run(deps, post('/redeem', { session_token: 'good', code }));
  assert.equal(r.status, 400);
  ok('only admins mint codes; a code works once and for its own term');
}
{
  const { deps } = makeDeps();
  await run(deps, post('/claim', { session_token: 'good', paypal_txn: '11111111111111111' }));
  let r = await run(deps, post('/mark', { session_token: 'good', sha256: 'a'.repeat(64), title: 'Beach' }));
  assert.equal(r.status, 200); assert.match(r.body.id, /^[0-9A-Z]{8}$/);
  const id = r.body.id;
  r = await run(deps, get('/mark/' + id.toLowerCase()));
  assert.equal(r.body.owner_name, 'Ana Buyer'); assert.equal(r.body.found, true);
  assert.equal(r.body.owner_email, undefined);
  r = await run(deps, get('/mark/ZZZZZZZZ'));
  assert.equal(r.status, 404);
  ok('marks register with a licence and verify publicly without exposing email');
}
{
  const { deps } = makeDeps();
  await run(deps, post('/claim', { session_token: 'good', paypal_txn: '11111111111111111' }));
  let r = await run(deps, post('/apikey', { session_token: 'good' }));
  assert.equal(r.status, 402);
  const d2 = makeDeps();
  await run(d2.deps, post('/claim', { session_token: 'good', paypal_txn: '22222222222222222' }));
  r = await run(d2.deps, post('/apikey', { session_token: 'good', label: 'prod' }));
  assert.match(r.body.key, /^lk_[a-z0-9]{32}$/);
  assert.equal(d2.t.keys[0].key_hash, await sha256hex(r.body.key));
  const key = r.body.key;
  r = await run(d2.deps, post('/v1/detect', { kind: 'text', text: 'hello' }, { authorization: 'Bearer ' + key }));
  assert.equal(r.status, 200); assert.equal(r.body.task, 'detect_text');
  r = await run(d2.deps, post('/v1/detect', { kind: 'image', image: 'http://x' }, { authorization: 'Bearer ' + key }));
  assert.equal(r.status, 400);
  r = await run(d2.deps, post('/v1/detect', { kind: 'text', text: 'x' }, { authorization: 'Bearer lk_' + 'a'.repeat(32) }));
  assert.equal(r.status, 401);
  ok('API keys only on the API plan, stored as a fingerprint, metered the same way');
}
{
  const { deps } = makeDeps({ env: {} });
  await run(deps, post('/claim', { session_token: 'good', paypal_txn: '11111111111111111' }));
  const r = await run(deps, post('/ai', { session_token: 'good', task: 'describe' }));
  assert.equal(r.status, 503); assert.equal(r.body.code, 'offline');
  const h = await run(deps, get('/health'));
  assert.equal(h.body.ai, false);
  ok('without an Anthropic key the AI routes say so and nothing is charged');
}
{
  const { deps, t } = makeDeps();
  let r = await run(deps, post('/me', { session_token: 'admin' }));
  assert.equal(r.body.plan, 'owner'); assert.equal(r.body.unlimited, true);
  for (let i = 0; i < 400; i++) {
    r = await run(deps, post('/ai', { session_token: 'admin', task: 'rosario', text: 'hello' }));
    assert.equal(r.status, 200);
  }
  const spent = t.usage.reduce((a, u) => a + u.cost_usd, 0);
  assert.ok(spent > 4, 'owner went past a normal allowance');
  assert.equal(t.licenses.filter((l) => l.plan === 'owner').length, 1);
  ok(`the owner is never capped ($${spent.toFixed(2)} in one month) and gets one owner licence`);
}
{
  const { deps, t } = makeDeps({ paypalCapture: async () => null });
  let r = await run(deps, post('/claim', { session_token: 'good', paypal_txn: '44444444444444444' }));
  assert.equal(r.status, 202); assert.equal(r.body.pending, true);
  r = await run(deps, post('/me', { session_token: 'good' }));
  assert.equal(r.body.licensed, false); assert.equal(r.body.pending, true);
  r = await run(deps, post('/ai', { session_token: 'good', task: 'describe' }));
  assert.equal(r.status, 402);
  r = await run(deps, post('/admin/overview', { session_token: 'good' }));
  assert.equal(r.status, 403);
  r = await run(deps, post('/admin/claim', { session_token: 'good', claim_id: 'C1' }));
  assert.equal(r.status, 403);
  r = await run(deps, post('/admin/overview', { session_token: 'admin' }));
  assert.equal(r.body.claims.length, 1);
  r = await run(deps, post('/admin/claim', { session_token: 'admin', claim_id: 'C1' }));
  assert.equal(r.body.status, 'approved');
  r = await run(deps, post('/me', { session_token: 'good' }));
  assert.equal(r.body.licensed, true); assert.equal(r.body.plan, 'app_month');
  r = await run(deps, post('/admin/claim', { session_token: 'admin', claim_id: 'C1' }));
  assert.equal(r.status, 400);
  ok('unverifiable payments wait in a queue only the owner can approve');
}
{
  const { deps } = makeDeps();
  let r = await run(deps, post('/admin/grant', { session_token: 'good', email: 'x@y.com' }));
  assert.equal(r.status, 403);
  r = await run(deps, post('/admin/grant', { session_token: 'admin', email: 'friend@example.com', plan: 'comp', days: 30 }));
  assert.equal(r.body.ok, true);
  r = await run(deps, post('/admin/grant', { session_token: 'admin', email: 'friend@example.com', plan: 'owner' }));
  assert.equal(r.body.plan, 'comp');
  ok('the owner can grant access, but never the owner plan');
}
{
  const { deps, t } = makeDeps({ env: { ANTHROPIC_API_KEY: 'x', ELEVENLABS_API_KEY: 'y' } });
  let r = await handleLens(post('/speak', { session_token: 'good', text: 'hola' }), deps);
  assert.equal(r.status, 402);
  await run(deps, post('/claim', { session_token: 'good', paypal_txn: '11111111111111111' }));
  r = await handleLens(post('/speak', { session_token: 'good', text: 'Hello there', lang: 'en' }), deps);
  assert.equal(r.status, 200); assert.equal(r.headers.get('content-type'), 'audio/mpeg');
  assert.equal(t.usage.at(-1).route, 'speak'); assert.ok(t.usage.at(-1).cost_usd > 0);
  let refused = null;
  for (let i = 0; i < 5000 && !refused; i++) {
    const x = await handleLens(post('/speak', { session_token: 'good', text: 'x'.repeat(700) }), deps);
    if (x.status === 402) refused = x;
  }
  assert.ok(refused);
  const spent = t.usage.reduce((a, u) => a + u.cost_usd, 0);
  assert.ok(spent <= PLANS.app_month.budget, `spent ${spent}`);
  ok('Rosario\'s natural voice is metered against the same allowance');
}
{
  const { deps, t } = makeDeps();
  t.config.apk_key = JSON.stringify({ key: 'K', iv: 'I', url: '/lens/dl/x.bin', sha256: 'S' });
  let r = await run(deps, post('/download', { session_token: 'good' }));
  assert.equal(r.status, 402); assert.equal(r.body.key, undefined);
  r = await run(deps, post('/download', { session_token: 'admin' }));
  assert.equal(r.body.key, 'K');
  await run(deps, post('/claim', { session_token: 'good', paypal_txn: '11111111111111111' }));
  r = await run(deps, post('/download', { session_token: 'good' }));
  assert.equal(r.body.key, 'K');
  ok('the Android download key goes only to paying users and the owner');
}
console.log(`\n${n} passed`);
