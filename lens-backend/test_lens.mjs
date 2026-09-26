// node lens-backend/test_lens.mjs — exercises lens-core.mjs with an in-memory store.
import assert from 'node:assert/strict';
import { handleLens, PLANS, TIERS, PACKS, CREDITS, WELCOME, TASKS, costOf, sha256hex, period, speakCredits } from './lens-core.mjs';

function makeDeps(over = {}) {
  const t = { licenses: [], usage: [], codes: [], marks: [], keys: [], claims: [], config: {}, wallets: {}, ledger: [], purchases: {}, members: [], reports: [] };
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
    // Credits: the same rules as the SQL functions lens_spend and lens_add.
    getWallet: async (e) => (t.wallets[e] ? { ...t.wallets[e] } : null),
    createWallet: async (row) => { if (t.wallets[row.email]) return null; t.wallets[row.email] = { tier_source: null, tier_expires_at: null, play_token: null, play_product: null, ...row }; return { ...t.wallets[row.email] }; },
    updateWallet: async (e, patch) => { Object.assign(t.wallets[e], patch); },
    addLedger: async (row) => { t.ledger.push(row); },
    ledgerFor: async (e) => t.ledger.filter((l) => l.email === e).reverse(),
    spendCredits: async (e, n, ref) => {
      const w = t.wallets[e]; if (!w) return { ok: false, sub: 0, pack: 0 };
      if (w.sub_credits + w.pack_credits < n) return { ok: false, sub: w.sub_credits, pack: w.pack_credits };
      const s = Math.min(w.sub_credits, n); w.sub_credits -= s; w.pack_credits -= n - s;
      t.ledger.push({ email: e, delta: -n, kind: 'spend', ref });
      return { ok: true, sub: w.sub_credits, pack: w.pack_credits };
    },
    addCredits: async (e, bucket, n, kind, ref) => {
      const w = t.wallets[e]; if (!w) return { ok: false };
      w[bucket === 'sub' ? 'sub_credits' : 'pack_credits'] += n; t.ledger.push({ email: e, delta: n, kind, ref });
      return { ok: true, sub: w.sub_credits, pack: w.pack_credits };
    },
    getPurchase: async (ref) => t.purchases[ref] || null,
    recordPurchase: async (row) => { if (t.purchases[row.ref]) return false; t.purchases[row.ref] = row; return true; },
    recentWallets: async () => Object.values(t.wallets),
    createReport: async (row) => { t.reports.push({ id: t.reports.length + 1, ...row }); },
    openReports: async () => t.reports.filter((r) => !r.reviewed_at),
    reviewReport: async (id) => { const r = t.reports.find((x) => x.id === id); if (r) r.reviewed_at = 'now'; },
    deleteAccount: async (e, hash) => {
      delete t.wallets[e]; t.ledger = t.ledger.filter((l) => l.email !== e); t.licenses = t.licenses.filter((l) => l.email !== e);
      t.usage = t.usage.filter((u) => u.email !== e); t.claims = t.claims.filter((c) => c.email !== e);
      for (const p of Object.values(t.purchases)) if (p.email === e) p.email = hash;
      for (const m of t.marks) if (m.owner_email === e) Object.assign(m, { owner_email: hash, owner_name: 'Account deleted', revoked_at: 'now' });
      t.members = t.members.filter((m) => m.email !== e);
    },
    getConfig: async (k) => t.config[k] || null,
    setConfig: async (k, v) => { t.config[k] = v; }
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
  r = await run(deps, post('/me', { session_token: 'good' }));
  assert.equal(r.body.tier, 'free'); assert.equal(r.body.credits, WELCOME + TIERS.free.monthly);
  assert.equal(r.body.pack_credits, WELCOME); assert.equal(r.body.voice, false);
  assert.equal(r.body.catalogue.credits.detect_image, CREDITS.detect_image);
  ok('no session → 401; a new account starts free with 50 welcome and 20 monthly credits');
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
  assert.ok(refused); assert.equal(refused.body.code, 'credits');
  const spent = t.usage.filter((u) => u.period === period() && u.license_id).reduce((a, u) => a + u.cost_usd, 0);
  assert.ok(spent <= PLANS.app_month.budget, `spent ${spent}`);
  const onCredits = t.usage.filter((u) => !u.license_id).length;
  assert.equal(onCredits, Math.floor((WELCOME + TIERS.free.monthly) / CREDITS.describe));
  ok(`an earlier licence is spent to its allowance ($${spent.toFixed(2)} of $${PLANS.app_month.budget}), then credits carry on (${onCredits} more) until they run out`);
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
  const days = (new Date(r.body.legacy.expires_at) - Date.now()) / 86400e3;
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
  assert.equal(r.body.tier, 'free'); assert.equal(r.body.pending, true); assert.equal(r.body.legacy, undefined);
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
  let r = await run(deps, post('/download', { session_token: 'nobody' }));
  assert.equal(r.status, 401); assert.equal(r.body.key, undefined);
  r = await run(deps, post('/download', { session_token: 'good' }));
  assert.equal(r.body.key, 'K');
  ok('the Android download key goes to any signed-in account, never to an anonymous one');
}
{
  const { deps, t, calls } = makeDeps({ env: { ANTHROPIC_API_KEY: 'x', ELEVENLABS_API_KEY: 'y' } });
  await run(deps, post('/claim', { session_token: 'good', paypal_txn: '11111111111111111' }));
  let r = await run(deps, post('/admin/pause', { session_token: 'good', paused: true }));
  assert.equal(r.status, 403);
  r = await run(deps, post('/admin/pause', { session_token: 'admin', paused: true }));
  assert.equal(r.body.paused, true);
  const before = calls.length;
  r = await run(deps, post('/ai', { session_token: 'good', task: 'describe', images: [] }));
  assert.equal(r.status, 503); assert.equal(r.body.code, 'paused');
  r = await run(deps, post('/ai', { session_token: 'admin', task: 'describe', images: [] }));
  assert.equal(r.body.code, 'paused', 'the owner is not exempt from the stop');
  const sp = await handleLens(post('/speak', { session_token: 'good', text: 'hi' }), deps);
  assert.equal(sp.status, 503);
  assert.equal(calls.length, before, 'no model call while paused');
  r = await run(deps, post('/admin/overview', { session_token: 'admin' }));
  assert.equal(r.body.paused, true);
  await run(deps, post('/admin/pause', { session_token: 'admin', paused: false }));
  deps.callModel = async () => ({ input_tokens: 10, output_tokens: 10, result: { action: 'describe', speech: 'ok' } });
  r = await run(deps, post('/ai', { session_token: 'good', task: 'rosario', text: 'what is this' }));
  assert.equal(r.status, 200);
  assert.equal(t.usage.at(-1).route, 'rosario:describe');
  ok('the owner can stop every AI and voice call at once, and the log records what Rosario chose');
}
/* ── credits ──────────────────────────────────────────────────────── */
{ // every action's typical cost stays under half of what its credits bring in at the cheapest credit sold
  const cheapest = Math.min(...Object.values(TIERS).filter((x) => x.price).map((x) => x.price / x.monthly), ...Object.values(PACKS).map((p) => p.price / p.credits)) * 0.85;
  const typical = { // input and output tokens of an ordinary call, images included
    // [uncached input, output, cached instructions read]: the assistant's
    // long instructions are cached, so a question pays full price only
    // for the question, the memory and the conversation.
    rosario: [900, 250, 1400], intent: [900, 120], translate: [1200, 300], replies: [1200, 350], describe: [2600, 450], read: [2600, 700],
    summarize: [3000, 900], write: [1500, 700], coach: [1300, 500], plan_day: [1500, 400],
    detect_image: [2800, 900], detect_text: [2200, 800], detect_audio: [1800, 800], scam: [2200, 700], detect_frames: [10500, 1000]
  };
  for (const [task, price] of Object.entries(CREDITS)) {
    const model = TASKS[task].tier === 'deep' ? 'claude-opus-5-5' : 'claude-sonnet-5';
    const [i, o, c = 0] = typical[task]; const cost = costOf(model, i, o, 0, c);
    assert.ok(cost <= 0.5 * price * cheapest, `${task}: $${cost.toFixed(4)} vs ${price} credits ($${(price * cheapest).toFixed(4)})`);
  }
  for (const chars of [60, 120, 180, 700]) assert.ok(speakCredits(chars) * cheapest >= chars * 0.00011 * 2, `a ${chars}-character answer is priced at least 2× ElevenLabs`);
  ok(`every action is priced at least 2× its typical cost (cheapest credit $${cheapest.toFixed(4)} after Google's 15%)`);
}
{
  const { deps, t, calls } = makeDeps();
  let r = await run(deps, post('/ai', { session_token: 'good', task: 'rosario', text: 'hi' }));
  assert.equal(r.status, 200); assert.equal(r.body.spent, CREDITS.rosario);
  assert.equal(r.body.credits, WELCOME + TIERS.free.monthly - CREDITS.rosario);
  assert.equal(t.wallets['buyer@example.com'].sub_credits, TIERS.free.monthly - CREDITS.rosario, 'monthly credits go first');
  deps.callModel = async () => ({ input_tokens: 5, output_tokens: 5, result: null });
  r = await run(deps, post('/ai', { session_token: 'good', task: 'rosario', text: 'hi' }));
  assert.equal(r.status, 502);
  r = await run(deps, post('/me', { session_token: 'good' }));
  assert.equal(r.body.credits, WELCOME + TIERS.free.monthly - CREDITS.rosario, 'a failed answer is refunded');
  deps.callModel = async () => { throw new Error('network'); };
  await assert.rejects(handleLens(post('/ai', { session_token: 'good', task: 'rosario', text: 'hi' }), deps));
  r = await run(deps, post('/me', { session_token: 'good' }));
  assert.equal(r.body.credits, WELCOME + TIERS.free.monthly - CREDITS.rosario, 'a crashed call is refunded');
  t.wallets['buyer@example.com'].sub_credits = 0; t.wallets['buyer@example.com'].pack_credits = 9;
  const before = calls.length;
  r = await run(deps, post('/ai', { session_token: 'good', task: 'detect_image', images: [] }));
  assert.equal(r.status, 402); assert.equal(r.body.code, 'credits'); assert.equal(r.body.need, 10); assert.equal(calls.length, before);
  ok('credits are taken before the call, returned when it fails, and refused without calling the model');
}
{
  const { deps, t } = makeDeps();
  await run(deps, post('/me', { session_token: 'good' }));
  const w = t.wallets['buyer@example.com'];
  w.sub_credits = 3; w.granted_period = '2020-01';
  let r = await run(deps, post('/me', { session_token: 'good' }));
  assert.equal(r.body.sub_credits, TIERS.free.monthly); assert.equal(r.body.pack_credits, WELCOME);
  Object.assign(w, { tier: 'pro', tier_source: 'paypal', tier_expires_at: new Date(Date.now() - 1000).toISOString(), sub_credits: 900 });
  r = await run(deps, post('/me', { session_token: 'good' }));
  assert.equal(r.body.tier, 'free'); assert.equal(r.body.sub_credits, TIERS.free.monthly); assert.equal(r.body.pack_credits, WELCOME);
  ok('Free refills each month; an ended plan falls back to Free; bought credits stay');
}
{ // PayPal on the web: the member says what they bought, PayPal confirms the amount
  const caps = { AAAAAAAAAAAAAAAA1: '7.99', AAAAAAAAAAAAAAAA2: '6.99', AAAAAAAAAAAAAAAA3: '5.00', AAAAAAAAAAAAAAAA4: '49.99' };
  const { deps, t } = makeDeps({ paypalCapture: async (id) => caps[id] ? { status: 'COMPLETED', amount: { value: caps[id], currency_code: 'USD' } } : null });
  let r = await run(deps, post('/claim', { session_token: 'good', paypal_txn: 'AAAAAAAAAAAAAAAA1', product: 'starter' }));
  assert.equal(r.status, 200); assert.equal(r.body.tier, 'starter'); assert.equal(r.body.sub_credits, TIERS.starter.monthly);
  const days = (new Date(r.body.renews) - Date.now()) / 86400e3; assert.ok(days > 30 && days < 32);
  r = await run(deps, post('/claim', { session_token: 'good', paypal_txn: 'AAAAAAAAAAAAAAAA1', product: 'starter' }));
  assert.equal(r.status, 409);
  r = await run(deps, post('/claim', { session_token: 'good', paypal_txn: 'AAAAAAAAAAAAAAAA2', product: 'credits_500' }));
  assert.equal(r.body.pack_credits, WELCOME + 500);
  r = await run(deps, post('/claim', { session_token: 'good', paypal_txn: 'AAAAAAAAAAAAAAAA3', product: 'credits_1500' }));
  assert.equal(r.status, 400);
  r = await run(deps, post('/claim', { session_token: 'good', paypal_txn: 'AAAAAAAAAAAAAAAA4', product: 'max' }));
  assert.equal(r.body.tier, 'max'); assert.equal(r.body.deep, true);
  r = await run(deps, post('/claim', { session_token: 'good', paypal_txn: 'AAAAAAAAAAAAAAAA9', product: 'credits_5000' }));
  assert.equal(r.status, 202);
  assert.equal(t.claims[0].product, 'credits_5000');
  r = await run(deps, post('/admin/claim', { session_token: 'admin', claim_id: t.claims[0].id }));
  assert.equal(r.body.plan, 'credits_5000');
  r = await run(deps, post('/me', { session_token: 'good' }));
  assert.equal(r.body.pack_credits, WELCOME + 500 + 5000);
  ok('web purchases: plans and packs by PayPal, each payment once, the amount checked, the queue fulfils what was bought');
}
{ // Google Play
  const orders = {};
  const play = {
    subs: {}, products: {}, acked: [], consumed: [],
    getSub: async (tok) => play.subs[tok] || null,
    getProduct: async (id, tok) => play.products[tok] || null,
    consume: async (id, tok) => { play.consumed.push(tok); play.products[tok].consumptionState = 1; return {}; },
    ackSub: async (id, tok) => { play.acked.push(tok); play.subs[tok].acknowledgementState = 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED'; return {}; }
  };
  const { deps, t } = makeDeps({ play });
  const future = new Date(Date.now() + 30 * 86400e3).toISOString();
  play.subs.TOKSUB = { subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE', latestOrderId: 'GPA.1', acknowledgementState: 'ACKNOWLEDGEMENT_STATE_PENDING', lineItems: [{ productId: 'luna_pro', expiryTime: future }] };
  let r = await run(deps, post('/purchase/play', { session_token: 'good', product_id: 'luna_pro', purchase_token: 'TOKSUB' }));
  assert.equal(r.status, 200); assert.equal(r.body.tier, 'pro'); assert.equal(r.body.sub_credits, TIERS.pro.monthly); assert.equal(r.body.voice, true);
  assert.deepEqual(play.acked, ['TOKSUB']);
  r = await run(deps, post('/purchase/play', { session_token: 'good', product_id: 'luna_pro', purchase_token: 'TOKSUB' }));
  assert.equal(r.body.sub_credits, TIERS.pro.monthly, 'the same order is not granted twice');
  r = await run(deps, post('/purchase/play', { session_token: 'admin', product_id: 'luna_pro', purchase_token: 'TOKSUB' }));
  assert.equal(r.status, 409, 'a token belongs to the account that first used it');
  // a month later Google has renewed it: a new order, a new month of credits
  t.wallets['buyer@example.com'].sub_credits = 12;
  t.wallets['buyer@example.com'].tier_expires_at = new Date(Date.now() - 1000).toISOString();
  play.subs.TOKSUB = { ...play.subs.TOKSUB, latestOrderId: 'GPA.1..0', lineItems: [{ productId: 'luna_pro', expiryTime: future }] };
  r = await run(deps, post('/me', { session_token: 'good' }));
  assert.equal(r.body.tier, 'pro'); assert.equal(r.body.sub_credits, TIERS.pro.monthly);
  // then it is cancelled and runs out
  t.wallets['buyer@example.com'].tier_expires_at = new Date(Date.now() - 1000).toISOString();
  play.subs.TOKSUB = { ...play.subs.TOKSUB, subscriptionState: 'SUBSCRIPTION_STATE_EXPIRED' };
  r = await run(deps, post('/me', { session_token: 'good' }));
  assert.equal(r.body.tier, 'free');
  // packs
  play.products.TOKPACK = { purchaseState: 0, consumptionState: 0, orderId: 'GPA.9' };
  r = await run(deps, post('/purchase/play', { session_token: 'good', product_id: 'credits_1500', purchase_token: 'TOKPACK' }));
  assert.equal(r.body.pack_credits, WELCOME + 1500); assert.deepEqual(play.consumed, ['TOKPACK']);
  r = await run(deps, post('/purchase/play', { session_token: 'good', product_id: 'credits_1500', purchase_token: 'TOKPACK' }));
  assert.equal(r.body.pack_credits, WELCOME + 1500);
  play.products.TOKPEND = { purchaseState: 2, consumptionState: 0, orderId: 'GPA.10' };
  r = await run(deps, post('/purchase/play', { session_token: 'good', product_id: 'credits_500', purchase_token: 'TOKPEND' }));
  assert.equal(r.status, 402);
  r = await run(deps, post('/purchase/play', { session_token: 'good', product_id: 'nope', purchase_token: 'X' }));
  assert.equal(r.status, 400);
  ok('Google Play: plans granted once per order and renewed, acknowledged; packs consumed once; pending and foreign tokens refused');
}
{
  const { deps, t, calls } = makeDeps({ env: { ANTHROPIC_API_KEY: 'x', ELEVENLABS_API_KEY: 'y' } });
  await run(deps, post('/me', { session_token: 'good' }));
  let r = await handleLens(post('/speak', { session_token: 'good', text: 'Hello' }), deps);
  assert.equal(r.status, 402); assert.equal((await r.json()).code, 'voice_plan');
  await run(deps, post('/admin/credits', { session_token: 'admin', email: 'buyer@example.com', tier: 'max', days: 31 }));
  const text = 'y'.repeat(180);
  r = await handleLens(post('/speak', { session_token: 'good', text }), deps);
  assert.equal(r.status, 200);
  assert.equal(t.wallets['buyer@example.com'].sub_credits, TIERS.max.monthly - speakCredits(180));
  r = await run(deps, post('/ai', { session_token: 'good', task: 'detect_image', images: [] }));
  assert.equal(r.body.deep, true); assert.equal(calls.at(-1).effort, 'high');
  r = await run(deps, post('/ai', { session_token: 'good', task: 'rosario', text: 'x' }));
  assert.equal(calls.at(-1).effort, 'low', 'only detection goes deeper on Luna Max');
  r = await run(deps, post('/admin/credits', { session_token: 'good', email: 'x@y.com', credits: 5 }));
  assert.equal(r.status, 403);
  r = await run(deps, post('/admin/credits', { session_token: 'admin', email: 'friend@example.com', credits: 300 }));
  assert.equal(t.wallets['friend@example.com'].pack_credits, WELCOME + 300);
  r = await run(deps, post('/admin/codes', { session_token: 'admin', count: 1, plan: 'credits_500' }));
  r = await run(deps, post('/redeem', { session_token: 'good', code: r.body.codes[0] }));
  assert.equal(r.body.pack_credits, WELCOME + 500);
  ok('Caty\'s voice with Pro and Luna Max, priced per length; Luna Max checks think harder; gifts and codes from the owner');
}
{
  const { deps, t, calls } = makeDeps();
  await run(deps, post('/ai', { session_token: 'good', task: 'write', kind: 'complaint', tone: 'firm', text: 'late parcel', memory: '- Name: Ana', mode: 'work' }));
  const txt = calls.at(-1).content.at(-1).text;
  assert.match(txt, /KIND: complaint/); assert.match(txt, /MEMORY:\n- Name: Ana/); assert.match(txt, /MODE: work/);
  await run(deps, post('/mark', { session_token: 'good', sha256: 'b'.repeat(64) }));
  t.members.push({ email: 'buyer@example.com' });
  let r = await run(deps, post('/account/delete', { session_token: 'good' }));
  assert.equal(r.status, 400);
  r = await run(deps, post('/account/delete', { session_token: 'good', confirm: 'DELETE' }));
  assert.equal(r.body.deleted, true);
  assert.equal(t.wallets['buyer@example.com'], undefined); assert.equal(t.members.length, 0);
  assert.equal(t.marks[0].owner_name, 'Account deleted'); assert.ok(t.marks[0].revoked_at);
  assert.ok(!JSON.stringify(t.ledger).includes('buyer@example.com'));
  r = await run(deps, post('/account/delete', { session_token: 'admin', confirm: 'DELETE' }));
  assert.equal(r.status, 403);
  ok('memory, lists and mode reach the model; deleting an account removes the member and their data and revokes their marks');
}
{
  const { deps, t } = makeDeps();
  let r = await run(deps, post('/report', { session_token: 'good', task: 'rosario', answer: '' }));
  assert.equal(r.status, 400);
  r = await run(deps, post('/report', { session_token: 'good', task: 'rosario', answer: 'A rude answer', reason: 'offensive' }));
  assert.equal(r.body.ok, true); assert.equal(t.reports[0].email, 'buyer@example.com');
  r = await run(deps, post('/admin/overview', { session_token: 'admin' }));
  assert.equal(r.body.reports.length, 1);
  r = await run(deps, post('/admin/report', { session_token: 'good', id: 1 }));
  assert.equal(r.status, 403);
  await run(deps, post('/admin/report', { session_token: 'admin', id: 1 }));
  r = await run(deps, post('/admin/overview', { session_token: 'admin' }));
  assert.equal(r.body.reports.length, 0);
  ok('members can report an AI answer, and only the owner reviews reports');
}
console.log(`\n${n} passed`);
