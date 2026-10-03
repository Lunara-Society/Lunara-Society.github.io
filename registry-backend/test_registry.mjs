/* node registry-backend/test_registry.mjs — runs in CI, needs no network. */

import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { handleRegistry, publicStatus, normDomain, assessArticle50, applicationEmail, decisionEmail, SHIELD_PRICE } from './registry-core.mjs';

let failed = 0, passed = 0;
async function test(name, fn) {
  try { await fn(); passed++; } catch (e) { failed++; console.error('FAIL', name, '\n    ', e.stack || e.message); }
}
function eq(a, b, msg) { if (a !== b) throw new Error(`${msg || ''} expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); }
function ok(c, msg) { if (!c) throw new Error(msg || 'not ok'); }

export function memoryDb() {
  const apps = new Map(), hits = [], partners = [], subs = new Set(), visits = [], leads = [], chats = new Map(), orders = new Map();
  return {
    apps, hits, partners, subs, visits, leads, orders, mailbox: [],
    async getApplication(id) { const a = apps.get(id); return a ? { ...a } : null; },
    async getPublishedByDomain(d) { return [...apps.values()].filter((a) => a.domain === d && ['approved', 'revoked'].includes(a.status)).sort((x, y) => (y.decided_at || '').localeCompare(x.decided_at || ''))[0] || null; },
    async listPublished() { return [...apps.values()].filter((a) => a.status === 'approved'); },
    async countApproved(kind) { return [...apps.values()].filter((a) => a.status === 'approved' && a.kind === kind).length; },
    async findOpenApplication(d, e) { return [...apps.values()].find((a) => a.domain === d && a.contact_email === e && ['pending', 'returned'].includes(a.status)) || null; },
    async createApplication(a) { const row = { ...a, created_at: new Date().toISOString() }; apps.set(a.public_id, row); return { ...row }; },
    async updateApplication(id, p) { Object.assign(apps.get(id), p); },
    async listApplications() { return [...apps.values()]; },
    async applicationsByEmail(e) { return [...apps.values()].filter((a) => a.contact_email === e); },
    async countHits(kind, ip, since) { return hits.filter((h) => h.kind === kind && (!ip || h.ip === ip) && h.at >= since).length; },
    async hit(kind, ip, at) { hits.push({ kind, ip, at }); },
    async createPartner(r) { partners.push(r); },
    async subscribe(e) { if (subs.has(e)) return false; subs.add(e); return true; },
    async logVisit(r) { visits.push(r); },
    async createLead(r) { leads.push(r); },
    async listLeads() { return leads; },
    async chatHistory(c) { return chats.get(c) || []; },
    async saveChat(c, p, m, r) { chats.set(c, (chats.get(c) || []).concat([{ role: 'user', content: m }, { role: 'assistant', content: r }])); },
    async getOrder(ref) { return orders.get(ref) || null; }
  };
}

function setup(over = {}) {
  const db = memoryDb();
  const txt = {};
  const mailbox = [];
  const deps = {
    db, ip: '198.51.100.7', env: {},
    now: () => Date.parse('2026-10-04T12:00:00Z'),
    dns: async (name) => txt[name] || [],
    mail: { send: async (m) => { mailbox.push(m); } },
    whoIs: async (t) => (t === 'owner-session' ? { email: 'lunarasociety@gmail.com' } : t === 'member-session' ? { email: 'ana@yavaya.lat' } : null),
    ai: async (system, messages) => `echo: ${messages.at(-1).content}`,
    ...over
  };
  return { db, deps, txt, mailbox };
}
const call = (deps, name, body, method = 'POST') => handleRegistry(new Request(
  `https://p.supabase.co/functions/v1/lunara-registry/${name}` + (method === 'GET' && body ? '?' + new URLSearchParams(body) : ''),
  method === 'POST' ? { method, body: JSON.stringify(body || {}) } : { method }), deps)
  .then(async (r) => ({ status: r.status, body: r.status === 204 ? null : await r.json() }));

const APP = {
  business_name: 'Yavaya', website_url: 'https://www.Yavaya.lat/', contact_email: 'Ana@Yavaya.lat',
  legal_registration_number: 'J0310000123456', registration_country: 'Nicaragua',
  signature: { signed_by: 'human', attested: true, signed_at: '2026-10-04T12:00:00Z', name: 'Ana', role: 'Founder' }
};

async function approved(deps, txt) {
  const r = await call(deps, 'shieldApply', APP);
  txt[r.body.dns_record.name] = [r.body.dns_record.value];
  await call(deps, 'shieldVerifyDomain', { public_id: r.body.public_id });
  await call(deps, 'adminDecide', { session_token: 'owner-session', public_id: r.body.public_id, decision: 'approve', identity_checked: true, reviewer_name: 'Johan Sjöblom' });
  return r.body.public_id;
}

await test('the registry starts empty and answers the documented shapes', async () => {
  const { deps } = setup();
  eq(JSON.stringify((await call(deps, 'shieldRegistryLookup', { domain: 'yavaya.lat' })).body), JSON.stringify({ success: true, found: false, status: 'not_registered' }));
  eq((await call(deps, 'shieldRegistryLookup', {})).body.error, 'public_id or domain is required');
  const list = (await call(deps, 'shieldRegistryList', null, 'GET')).body;
  eq(list.count, 0); ok(Array.isArray(list.businesses) && Array.isArray(list.entries));
  const f = (await call(deps, 'shieldFoundingCount', null, 'GET')).body;
  eq(f.cap, 80); eq(f.used, 0); eq(f.remaining, 80); eq(f.sold_out, false);
});

await test('an application gets a public id, a DNS record and an email with what to do', async () => {
  const { deps, db, mailbox } = setup();
  const r = await call(deps, 'shieldApply', APP);
  eq(r.body.success, true);
  ok(/^SHIELD-2026-\d{4}$/.test(r.body.public_id), r.body.public_id);
  eq(r.body.domain, 'yavaya.lat');
  eq(r.body.dns_record.name, '_lunara-verify.yavaya.lat');
  eq(r.body.dns_record.value, 'lunara-verify=' + r.body.domain_verification_token);
  const row = db.apps.get(r.body.public_id);
  eq(row.status, 'pending'); eq(row.contact_email, 'ana@yavaya.lat'); eq(row.kind, 'business');
  const toApplicant = mailbox.find((m) => m.to === 'ana@yavaya.lat');
  ok(toApplicant && toApplicant.text.includes('_lunara-verify') && toApplicant.text.includes(r.body.domain_verification_token), 'applicant told the exact record');
  ok(mailbox.some((m) => m.to === 'lunarasociety@gmail.com'), 'owner told');
});

await test('a pending application is not on the public registry', async () => {
  const { deps } = setup();
  const r = await call(deps, 'shieldApply', APP);
  eq((await call(deps, 'shieldRegistryLookup', { domain: 'yavaya.lat' })).body.status, 'not_registered');
  eq((await call(deps, 'shieldRegistryLookup', { public_id: r.body.public_id })).body.found, false);
});

await test('asking twice returns the same application', async () => {
  const { deps, db } = setup();
  const a = await call(deps, 'shieldApply', APP);
  const b = await call(deps, 'shieldApply', APP);
  eq(b.body.public_id, a.body.public_id); eq(db.apps.size, 1);
});

await test('bad applications are refused, and floods are limited', async () => {
  const { deps } = setup();
  eq((await call(deps, 'shieldApply', { ...APP, business_name: '' })).body.success, false);
  eq((await call(deps, 'shieldApply', { ...APP, contact_email: 'nope' })).body.success, false);
  eq((await call(deps, 'shieldApply', { ...APP, website_url: 'not a site', domain: '' })).body.success, false);
  const codes = [];
  for (let i = 0; i < 8; i++) codes.push((await call(deps, 'shieldApply', { ...APP, contact_email: `x${i}@example.com` })).body.success);
  eq(codes.filter(Boolean).length, 6);
});

await test('the domain is verified only when the exact TXT record is there', async () => {
  const { deps, txt, db } = setup();
  const r = await call(deps, 'shieldApply', APP);
  let v = await call(deps, 'shieldVerifyDomain', { public_id: r.body.public_id });
  eq(v.body.domain_verified, false); ok(v.body.message.includes('lunara-verify='));
  deps.now = () => Date.parse('2026-10-04T12:01:00Z');
  txt['_lunara-verify.yavaya.lat'] = ['lunara-verify=wrong'];
  eq((await call(deps, 'shieldVerifyDomain', { public_id: r.body.public_id })).body.domain_verified, false);
  deps.now = () => Date.parse('2026-10-04T12:02:00Z');
  txt['_lunara-verify.yavaya.lat'] = ['"' + r.body.dns_record.value + '"'];
  v = await call(deps, 'shieldVerifyDomain', { public_id: r.body.public_id });
  eq(v.body.domain_verified, true); eq(v.body.verified, true);
  ok(db.apps.get(r.body.public_id).domain_verified_at);
  eq((await call(deps, 'shieldVerifyDomain', {})).body.error, 'public_id is required');
});

await test('only the owner can decide, and approval needs DNS, identity and a name', async () => {
  const { deps, txt } = setup();
  const r = await call(deps, 'shieldApply', APP);
  const id = r.body.public_id;
  for (const t of [undefined, 'member-session', 'forged']) {
    eq((await call(deps, 'adminDecide', { session_token: t, public_id: id, decision: 'approve', identity_checked: true, reviewer_name: 'X Y' })).status, 403);
    eq((await call(deps, 'shieldDashboard', { session_token: t })).status, 403);
  }
  const d = (b) => call(deps, 'adminDecide', { session_token: 'owner-session', public_id: id, ...b });
  eq((await d({ decision: 'approve', identity_checked: true, reviewer_name: 'Johan' })).status, 409, 'no DNS yet');
  txt['_lunara-verify.yavaya.lat'] = [r.body.dns_record.value];
  await call(deps, 'shieldVerifyDomain', { public_id: id });
  eq((await d({ decision: 'approve', reviewer_name: 'Johan' })).status, 400, 'identity not confirmed');
  eq((await d({ decision: 'approve', identity_checked: true })).status, 400, 'unsigned');
  const ok1 = await d({ decision: 'approve', identity_checked: true, reviewer_name: 'Johan Sjöblom' });
  eq(ok1.body.success, true); eq(ok1.body.record.status, 'approved'); eq(ok1.body.emailed, true);
  eq(ok1.body.record.expires_at.slice(0, 10), '2027-04-04', 'six months');
});

await test('an approved entry is public, listed, counted and shown by the badge lookup', async () => {
  const { deps, txt } = setup();
  const id = await approved(deps, txt);
  const look = (await call(deps, 'shieldRegistryLookup', { domain: 'https://www.yavaya.lat/about' })).body;
  eq(look.found, true); eq(look.status, 'verified'); eq(look.public_id, id); eq(look.shield_status, 'active');
  eq(look.business_name, 'Yavaya'); eq(look.reviewed_by, 'Johan Sjöblom'); eq(look.protocol_version, 'LUNA-PROTO-1');
  ok(!('contact_email' in look) && !('legal_registration_number' in look) && !('dns_token' in look), 'nothing private');
  eq((await call(deps, 'shieldRegistryLookup', { public_id: id, domain: 'yavaya.lat' })).body.status, 'verified', 'badge on its own site');
  eq((await call(deps, 'shieldRegistryLookup', { public_id: id, domain: 'impostor.example' })).body.found, false, 'badge copied to another site');
  const list = (await call(deps, 'shieldRegistryList', {})).body;
  eq(list.count, 1); eq(list.businesses[0].domain, 'yavaya.lat');
  eq((await call(deps, 'shieldFoundingCount', {})).body.used, 1);
});

await test('an entry expires on its date, and a revocation is published with its reason', async () => {
  const { deps, txt } = setup();
  const id = await approved(deps, txt);
  eq((await call({ ...deps, now: () => Date.parse('2027-05-01T00:00:00Z') }, 'shieldRegistryLookup', { public_id: id })).body.status, 'expired');
  eq((await call(deps, 'adminDecide', { session_token: 'owner-session', public_id: id, decision: 'revoke', reviewer_name: 'Johan' })).status, 400, 'reason required');
  await call(deps, 'adminDecide', { session_token: 'owner-session', public_id: id, decision: 'revoke', reviewer_name: 'Johan', note: 'Domain transferred.' });
  const look = (await call(deps, 'shieldRegistryLookup', { domain: 'yavaya.lat' })).body;
  eq(look.status, 'revoked'); eq(look.revocation_reason, 'Domain transferred.');
  eq((await call(deps, 'shieldRegistryList', {})).body.count, 0);
});

await test('rejected and returned applications need a reason and stay private', async () => {
  const { deps, db } = setup();
  const r = await call(deps, 'shieldApply', APP);
  eq((await call(deps, 'adminDecide', { session_token: 'owner-session', public_id: r.body.public_id, decision: 'return', reviewer_name: 'Johan' })).status, 400);
  await call(deps, 'adminDecide', { session_token: 'owner-session', public_id: r.body.public_id, decision: 'return', reviewer_name: 'Johan', note: 'Registration number missing.' });
  eq(db.apps.get(r.body.public_id).status, 'returned');
  eq((await call(deps, 'shieldRegistryLookup', { public_id: r.body.public_id })).body.found, false);
});

await test('the member sees their own status, only with a valid session', async () => {
  const { deps, txt } = setup();
  eq((await call(deps, 'shieldMemberStatus', { email: 'ana@yavaya.lat' })).body.status, 'none', 'an email alone reveals nothing');
  await call(deps, 'shieldApply', APP);
  eq((await call(deps, 'shieldMemberStatus', { session_token: 'member-session' })).body.status, 'pending');
  const { deps: d2, txt: t2 } = setup();
  await approved(d2, t2);
  const s = (await call(d2, 'shieldMemberStatus', { session_token: 'member-session' })).body;
  eq(s.certified, true); ok(/^SHIELD-/.test(s.public_id));
});

await test('a paid order is linked; a vendor order makes a twelve-month entry', async () => {
  const { deps, db, txt } = setup();
  db.orders.set('LO-AAAAAAAAAAAAAAAA', { order_ref: 'LO-AAAAAAAAAAAAAAAA', status: 'paid', product: 'vendor' });
  db.orders.set('LO-BBBBBBBBBBBBBBBB', { order_ref: 'LO-BBBBBBBBBBBBBBBB', status: 'open', product: 'shield' });
  const r = await call(deps, 'shieldApply', { ...APP, order: 'lo-aaaaaaaaaaaaaaaa' });
  eq(db.apps.get(r.body.public_id).order_ref, 'LO-AAAAAAAAAAAAAAAA'); eq(db.apps.get(r.body.public_id).kind, 'vendor');
  const r2 = await call(deps, 'shieldApply', { ...APP, contact_email: 'b@yavaya.lat', order: 'LO-BBBBBBBBBBBBBBBB' });
  eq(db.apps.get(r2.body.public_id).order_ref, undefined, 'unpaid order not linked');
  txt['_lunara-verify.yavaya.lat'] = [r.body.dns_record.value];
  await call(deps, 'shieldVerifyDomain', { public_id: r.body.public_id });
  const d = await call(deps, 'adminDecide', { session_token: 'owner-session', public_id: r.body.public_id, decision: 'approve', identity_checked: true, reviewer_name: 'Johan' });
  eq(d.body.record.expires_at.slice(0, 10), '2027-10-04');
});

await test('an AI agent application is recorded as an agent', async () => {
  const { deps, db } = setup();
  const r = await call(deps, 'shieldApply', { ...APP, type: 'ai_agent', subject_agent_name: 'Yavaya Concierge', agent_operator: 'Yavaya' });
  eq(db.apps.get(r.body.public_id).kind, 'ai_agent'); eq(db.apps.get(r.body.public_id).agent_name, 'Yavaya Concierge');
  const r2 = await call(deps, 'shieldApply', { ...APP, contact_email: 'c@yavaya.lat', signature: { signed_by: 'ai_agent', agent: 'Claude' } });
  eq(db.apps.get(r2.body.public_id).kind, 'business', 'an agent filling the form is not an agent being verified');
});

await test('the certify page\'s short form is accepted as an inquiry', async () => {
  const { deps, db } = setup();
  const r = await call(deps, 'shieldApply', { business_name: 'Clinic SA', website_url: 'https://clinic.example', contact_email: 'a@clinic.example', track: 'healthcare', tier: 'audit', entity_type: 'enterprise', notes: 'hi' });
  eq(r.body.success, true); eq(db.apps.get(r.body.public_id).kind, 'inquiry'); eq(db.apps.get(r.body.public_id).track, 'healthcare');
});

await test('partners, newsletter, visits and score reports are kept', async () => {
  const { deps, db, mailbox } = setup();
  eq((await call(deps, 'shieldPartnerApply', { partner_name: 'Dir', website_url: 'https://d.example', contact_email: 'p@d.example', partner_type: 'directory', embed_domain: '' })).body.success, true);
  eq(db.partners.length, 1);
  eq((await call(deps, 'newsletterSubscribe', { email: 'n@x.example', source_page: 'newsletter.html' })).body.success, true);
  ok((await call(deps, 'newsletterSubscribe', { email: 'N@x.example' })).body.message.includes('already'));
  eq((await call(deps, 'newsletterSubscribe', { email: 'bad' })).body.success, false);
  eq((await call(deps, 'visitorTrack', { page: '/registry.html', referrer: 'https://www.google.com/search?q=x', ua: 'Mozilla', ts: 'x' })).status, 204);
  eq(db.visits[0].referrer_host, 'www.google.com'); ok(!('ua' in db.visits[0]), 'no user agent kept');
  eq((await call(deps, 'lunaraDashboardSync', { page: 'compliance-intelligence.html', referrer: 'direct' })).status, 204);
  await call(deps, 'lunaraScoreReport', { email: 'lead@x.example', orgName: 'Org', systemName: 'Bot', score: 47, grade: 'HIGH RISK', gaps: ['No disclosure'] });
  await call(deps, 'lunaraScoreReport', { organization_name: 'Org2', system_name: 'S', score: 80, gaps: 'A, B', grade: 'LOW RISK', email: '', txn_id: 'LO-X', product: 'compliance-intelligence' });
  eq(db.leads.length, 2); eq(db.leads[1].gaps.length, 2);
  ok(mailbox.some((m) => m.to === 'lead@x.example' && m.subject.includes('47')), 'the score is emailed');
  const leads = await call(deps, 'lunaraScorerLeads', { session_token: 'owner-session' });
  eq(leads.body.stats.total, 2);
  eq((await call(deps, 'lunaraScorerLeads', {})).status, 403);
});

await test('the Article 50 assessment returns what the page renders', async () => {
  const out = assessArticle50({ organization: 'Org', role: 'both', geo: 'eu', systems: [{ name: 'Chat', type: 'direct-chat' }, { name: 'Images', type: 'content-gen' }, { name: 'Mood', type: 'emotion' }], inventory: 'no', disclosureLevel: 'some', marking: 'no', owner: 'none' });
  for (const k of ['systemsAssessed', 'obligationsIdentified', 'gapsFound', 'obligations', 'ownerMatrix', 'evidence', 'uncertainties', 'assessmentId']) ok(k in out, k);
  eq(out.systemsAssessed, 3);
  const refs = out.obligations.map((o) => o.ref).sort().join();
  eq(refs, 'Art. 50(1),Art. 50(2),Art. 50(3),Art. 50(4)');
  for (const o of out.obligations) ok(o.sourceUrl.startsWith('https://eur-lex.europa.eu/') && o.sourceText.length > 50 && o.statusLabel);
  eq(out.gapsFound, 4);
  const dep = assessArticle50({ role: 'deployer', geo: 'eu', systems: [{ name: 'Chat', type: 'direct-chat' }], inventory: 'yes', disclosureLevel: 'all', marking: 'na', owner: 'legal' });
  eq(dep.obligations.length, 0, 'a deployer of a chatbot has no 50(1) duty'); eq(dep.gapsFound, 0);
});

await test('public chat answers, keeps the conversation and is limited', async () => {
  const { deps } = setup();
  const a = await call(deps, 'rosarioChatProxy', { message: 'hello' });
  eq(a.body.reply, 'echo: hello'); ok(a.body.conversation_id);
  eq((await call(deps, 'rosarioWebChat', { question: 'q?' })).body.reply, 'echo: q?');
  eq((await call(deps, 'wrenPublicChat', { message: 'hi', conversation_id: a.body.conversation_id })).body.conversation_id, a.body.conversation_id);
  let limitedReply = null;
  for (let i = 0; i < 25 && !limitedReply; i++) {
    const r = await call(deps, 'wrenPublicChat', { message: 'x' + i });
    if (!r.body.reply.startsWith('echo')) limitedReply = r.body.reply;
  }
  ok(limitedReply, 'per-visitor hourly limit');
  const { deps: d2 } = setup({ ai: null });
  ok((await call(d2, 'wrenPublicChat', { message: 'hi' })).body.reply.includes('lunarasociety@gmail.com'));
});

await test('emails say exactly what to do', async () => {
  const a = { public_id: 'SHIELD-2026-1234', business_name: 'Yavaya', domain: 'yavaya.lat', dns_token: 'abc', contact_email: 'y@x.example', legal_registration_number: null };
  const m = applicationEmail(a);
  ok(m.text.includes('_lunara-verify') && m.text.includes('lunara-verify=abc') && m.text.includes('registration number'));
  const d = decisionEmail({ ...a, status: 'approved', expires_at: '2027-04-04T00:00:00Z' });
  ok(d.text.includes('data-lunara-shield="SHIELD-2026-1234"') && d.text.includes('badge.js'));
  ok(!decisionEmail({ ...a, status: 'pending' }));
});

await test('helpers', async () => {
  eq(normDomain('HTTPS://WWW.Yavaya.lat/x?y'), 'yavaya.lat'); eq(normDomain('not a domain'), ''); eq(normDomain('a.b.example.co'), 'a.b.example.co');
  eq(publicStatus({ status: 'pending' }), 'not_registered');
  const src = readFileSync(new URL('../lunara-pricing.js', import.meta.url), 'utf8');
  const w = {}; vm.runInNewContext(src, { window: w, document: { readyState: 'complete', querySelectorAll: () => [] } });
  eq(w.LunaraPricing.get('shield').price, SHIELD_PRICE, 'founding price matches the pricing table');
});

await test('unknown functions and methods', async () => {
  const { deps } = setup();
  eq((await call(deps, 'nope', {})).status, 404);
  eq((await call(deps, 'health', null, 'GET')).body.ok, true);
});

console.log(`${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
