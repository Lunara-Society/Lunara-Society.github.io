#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   THE OS, HELD TO WHAT IT CLAIMS
   ═══════════════════════════════════════════════════════════════════

   The Sovereign Intelligence OS pages make claims about evidence, dates,
   simulations and relationships. Each of those claims is computed by a
   small pure module, and this file runs those modules under Node against
   the repository's real files:

     os/evidence.mjs   every published signature verifies; an altered
                       document, an altered statement, a forged
                       signature, an expired term, a revoked key and a
                       missing key each produce the right state
     os/scenario.mjs   the lab starts from the measured score, a fix
                       earns exactly the scanner's points, nothing else
                       moves
     os/dates.mjs      the day an obligation applies, and the day before
     os/graph.mjs      no relationship is drawn that was not recorded

   And the pages themselves: desktop viewport, one h1, the shell, no
   security theatre left in the page transitions.
   ═══════════════════════════════════════════════════════════════════ */

import { readFileSync, existsSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
if (!globalThis.crypto) globalThis.crypto = webcrypto;

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p));
const readText = (p) => readFileSync(join(ROOT, p), 'utf8');
const { verifyAssertion, verifyPassport, canon, b64u } = await import(join(ROOT, 'os/evidence.mjs'));
const { simulate, plans } = await import(join(ROOT, 'os/scenario.mjs'));
const { status } = await import(join(ROOT, 'os/dates.mjs'));
const { buildGraph, layout } = await import(join(ROOT, 'os/graph.mjs'));
const { CHECKS, grade } = await import(join(ROOT, 'registry-backend/passport.mjs'));

let passed = 0, failed = 0;
async function test(name, fn) { try { await fn(); passed++; } catch (e) { failed++; console.error('FAIL', name, '\n    ', e.stack || e.message); } }
function eq(a, b, m) { if (a !== b) throw new Error(`${m || ''} expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); }
function ok(c, m) { if (!c) throw new Error(m || 'not ok'); }

const keys = JSON.parse(readText('.well-known/keys.json'));
const index = JSON.parse(readText('.well-known/assertions.json'));
const local = (u) => u.replace('https://lunarasociety.com/', '');

/* ── evidence ─────────────────────────────────────────────────── */
await test('every published assertion verifies against the repository\'s own files', async () => {
  ok(index.assertions.length >= 5, 'assertions are indexed');
  const now = Date.parse('2026-10-12T00:00:00Z');
  for (const a of index.assertions) {
    const env = JSON.parse(readText(local(a.assertion)));
    const r = await verifyAssertion(env, keys, new Uint8Array(read(local(a.subject))), now);
    eq(r.state, 'verified', local(a.subject) + ': ' + r.summary);
    ok(r.limits.length >= 3 && r.limits.some((l) => /does not show that what the document says is true/.test(l)), 'states what a hash does not prove');
    ok(r.limits.some((l) => /does not show who holds the key/.test(l)), 'states what a signature does not prove');
  }
});

const ENV = JSON.parse(readText('corpus/obligations.assertion.json'));
const DOC = new Uint8Array(read('corpus/obligations.json'));
await test('an altered document fails, even by one character', async () => {
  const text = new TextDecoder().decode(DOC).replace('2026-12-02', '2027-12-02');
  const r = await verifyAssertion(ENV, keys, new TextEncoder().encode(text), Date.parse('2026-10-12T00:00:00Z'));
  eq(r.state, 'failed'); ok(r.steps.some((s) => s.ok === false && /SHA-256/.test(s.detail)));
});
await test('an altered statement fails the signature', async () => {
  const env = JSON.parse(JSON.stringify(ENV)); env.assertion.expires_at = '2099-01-01T00:00:00.000Z';
  eq((await verifyAssertion(env, keys, DOC)).state, 'failed');
});
await test('a forged signature fails', async () => {
  const env = JSON.parse(JSON.stringify(ENV));
  const sig = Buffer.from(env.signature.value, 'base64url'); sig[5] ^= 1; env.signature.value = sig.toString('base64url');
  eq((await verifyAssertion(env, keys, DOC)).state, 'failed');
});
await test('past its term the assertion is expired, not verified', async () => {
  eq((await verifyAssertion(ENV, keys, DOC, Date.parse('2027-09-01T00:00:00Z'))).state, 'expired');
});
await test('a revoked key gives revoked, a missing key gives unavailable, no document gives partial', async () => {
  const revoked = JSON.parse(JSON.stringify(keys)); revoked.keys[0].revoked = '2026-09-01T00:00:00Z';
  eq((await verifyAssertion(ENV, revoked, DOC, Date.parse('2026-10-12T00:00:00Z'))).state, 'revoked');
  eq((await verifyAssertion(ENV, { keys: [] }, DOC)).state, 'unavailable');
  eq((await verifyAssertion(ENV, keys, null, Date.parse('2026-10-12T00:00:00Z'))).state, 'partial');
  eq((await verifyAssertion({ nonsense: true }, keys, DOC)).state, 'failed');
});
await test('canonical JSON is key-order independent, as RFC 8785 requires', async () => {
  eq(canon({ b: 1, a: [2, { d: null, c: 'x' }] }), '{"a":[2,{"c":"x","d":null}],"b":1}');
});

/* An agent passport, made the way registry-backend/agent-passport.mjs makes one. */
await test('agent passports: genuine, altered, expired, unknown key and garbage', async () => {
  const pair = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
  const jwk = { ...(await crypto.subtle.exportKey('jwk', pair.publicKey)), kid: 'agent-test' };
  const now = Date.parse('2026-10-12T00:00:00Z');
  const mint = async (p) => { const head = b64u(new TextEncoder().encode(JSON.stringify(p))); return head + '.' + b64u(await crypto.subtle.sign({ name: 'Ed25519' }, pair.privateKey, new TextEncoder().encode(head))); };
  const payload = { v: 1, typ: 'lunara-agent-passport', iss: 'https://lunarasociety.com', kid: 'agent-test', sub: 'SHIELD-2026-1234', agent: 'Test', operator: 'Op', iat: now / 1000, exp: now / 1000 + 86400 };
  const good = await mint(payload);
  eq((await verifyPassport(good, [jwk], now)).state, 'verified');
  const [h, s] = good.split('.');
  const forged = b64u(new TextEncoder().encode(JSON.stringify({ ...payload, agent: 'Someone else' }))) + '.' + s;
  eq((await verifyPassport(forged, [jwk], now)).state, 'failed');
  eq((await verifyPassport(good, [jwk], now + 2 * 86400e3)).state, 'expired');
  eq((await verifyPassport(good, [], now)).state, 'unavailable');
  eq((await verifyPassport('not a passport', [jwk], now)).state, 'failed');
  ok(h.length > 10);
});

/* ── the scenario lab ─────────────────────────────────────────── */
await test('the lab starts from the measured score and adds exactly the scanner\'s points', async () => {
  const earned = Object.fromEntries(CHECKS.map((c) => [c.id, 0]));
  earned.https = 15; earned.csp = 8; earned.spf = 4; earned.dmarc = 4; // partial credit, as the scanner gives it
  const observed = { score: 31, earned };
  const none = simulate(observed, [], CHECKS, grade);
  eq(none.baseline, 31); eq(none.projected, 31); eq(none.delta, 0); ok(none.matches_record);
  const some = simulate(observed, ['dmarc', 'spf', 'https'], CHECKS, grade);
  eq(some.projected, 31 + (10 - 4) + (8 - 4), 'https already full: no gain'); eq(some.projected_grade, grade(some.projected));
  ok(some.rows.find((r) => r.id === 'https').assumed === false, 'a full check cannot be assumed');
  const all = simulate(observed, CHECKS.map((c) => c.id), CHECKS, grade);
  eq(all.projected, 100); eq(all.projected_grade, 'A+');
  eq(simulate({ score: 50, earned }, [], CHECKS, grade).matches_record, false, 'a mismatch with the record is reported');
  let threw = false; try { simulate({ score: 1 }, [], CHECKS, grade); } catch { threw = true; }
  ok(threw, 'no per-check results, no simulation');
  const p = plans(CHECKS, earned);
  ok(!p.find((x) => x.id === 'all').fixes.includes('https'), 'plans never include a check already earned in full');
  eq(p.find((x) => x.id === 'dns').fixes.sort().join(), ['caa', 'dmarc', 'dnssec', 'spf'].join());
});

/* ── dates ────────────────────────────────────────────────────── */
await test('an obligation applies on its date and not the day before', async () => {
  eq(status('2026-12-02', '2026-12-01').applies, false); eq(status('2026-12-02', '2026-12-01').text, 'In 1 day');
  eq(status('2026-12-02', '2026-12-02').applies, true); eq(status('2026-12-02', '2026-12-02').text, 'Applies from today');
  eq(status('2026-12-02', '2026-12-04').text, 'Applies · for 2 days');
  eq(status('2026-12-02', '2026-10-12').days, 51);
  eq(status('nonsense', '2026-10-12').text, 'Date unreadable');
  for (const o of JSON.parse(readText('corpus/obligations.json')).obligations) ok(status(o.applies_from, '2026-10-12').days !== null, o.id + ' has a readable date');
});

/* ── the graph ────────────────────────────────────────────────── */
await test('the atlas draws only recorded relationships', async () => {
  const g = buildGraph([
    { agent_id: 'AGT-AAAAAAAA', name: 'A', operator: 'Op One', tier: 'associate', trust_index: 40, operator_verified: true, operator_registry_id: 'SHIELD-2026-1111' },
    { agent_id: 'AGT-BBBBBBBB', name: 'B', operator: 'Op One', tier: 'fellow', trust_index: 50, operator_verified: false },
    { agent_id: 'AGT-CCCCCCCC', name: 'C', operator: 'Op Two', tier: 'associate', trust_index: 30, operator_verified: false }
  ]);
  const agentIds = new Set(['AGT-AAAAAAAA', 'AGT-BBBBBBBB', 'AGT-CCCCCCCC']);
  ok(!g.edges.some((e) => agentIds.has(e.from) && agentIds.has(e.to)), 'never agent to agent');
  eq(g.edges.filter((e) => e.kind === 'member').length, 3);
  eq(g.edges.filter((e) => e.kind === 'declared').length, 3);
  eq(g.edges.filter((e) => e.kind === 'verified').length, 1, 'one operator verified');
  eq(g.nodes.filter((n) => n.kind === 'operator').length, 2, 'two operators, by name');
  const pos = layout(g, 900, 520);
  ok(g.nodes.every((n) => pos[n.id]), 'every node placed');
  eq(JSON.stringify(layout(g, 900, 520)), JSON.stringify(pos), 'the layout is deterministic');
  eq(buildGraph([]).nodes.length, 1, 'an empty network is Lunara alone');
  const card = JSON.parse(readText('.well-known/agent-card.json'));
  const withSkills = buildGraph([], card.skills);
  eq(withSkills.nodes.length, 1 + card.skills.length, 'plus the skills its card declares');
  ok(withSkills.edges.every((e) => e.kind === 'declares' && e.from === 'lunara'), 'skills hang only from Lunara, as declared');
});

/* ── the pages ────────────────────────────────────────────────── */
const OS_PAGES = ['command.html', 'status.html', 'investigate.html', 'agent-atlas.html', 'missions.html', 'evidence-registry.html', 'regulation.html', 'simulate.html', 'audit.html'];
await test('every workspace keeps the desktop viewport, the shell, one h1 and a no-script answer', async () => {
  for (const f of OS_PAGES) {
    const h = readText(f);
    ok(/<meta name="viewport" content="width=1120">/.test(h), f + ': viewport');
    ok(h.includes('/lunara-os.js') && h.includes('/lunara-os.css'), f + ': the shell');
    eq((h.match(/<h1[\s>]/g) || []).length, 1, f + ': h1');
    ok(h.includes('<noscript>'), f + ': noscript');
    ok(!/\$\{/.test(h.replace(/<script[\s\S]*?<\/script>/g, '')), f + ': no template fragment in the markup');
    ok(h.includes('class="os-skip"'), f + ': skip link');
  }
});
await test('every module a page imports exists', async () => {
  for (const f of OS_PAGES.concat(['os/audit.js', 'os/evidence-page.js', 'os/simulate.js', 'os/regulation.js', 'os/atlas.js'])) {
    const h = readText(f);
    for (const m of h.matchAll(/(?:src="|from ')(\/[^"']+\.m?js)/g)) ok(existsSync(join(ROOT, m[1])), `${f} imports ${m[1]}, which does not exist`);
  }
});
await test('the rail lists only places that exist', async () => {
  const js = readText('lunara-os.js');
  const nav = js.slice(js.indexOf('var NAV = ['), js.indexOf('OS.NAV = NAV'));
  const hrefs = [...nav.matchAll(/href: '([^']+)'/g)].map((m) => m[1]);
  ok(hrefs.length >= 10, 'the rail has its places');
  for (const h of hrefs) ok(existsSync(join(ROOT, h)), h + ' exists');
});
await test('the health vocabulary is the five honest words, and a failed request is never operational', async () => {
  const js = readText('lunara-os.js');
  for (const w of ['Operational', 'Degraded', 'Unavailable', 'Unknown', 'Not configured']) ok(js.includes(`'${w}'`), w);
  ok(!/catch\([^)]*\)\s*{[^}]*operational/.test(js), 'no catch handler reports operational');
});
await test('page transitions make no security claim', async () => {
  const locks = readText('lunara-locks.js');
  for (const bad of ['Access granted', 'Authenticating', 'SIG ED25519', 'CLEARANCE Λ5 · GRANTED', 'CHANNEL SECURED', 'ML-KEM', 'REVOCATION · CLEAR', 'IRIS CODE', 'VEIN MAP']) ok(!locks.includes(bad), 'still says ' + bad);
  ok(locks.includes('not a security check'), 'says what it is');
  ok(/COOLDOWN = 60e3/.test(locks), 'a full lock at most once a minute');
  ok(/'Escape'/.test(locks), 'Esc skips it');
});

console.log(`${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
