/* node registry-backend/test_registry.mjs — runs in CI, needs no network. */

import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { isPrivateAddress, grade, CHECKS } from './passport.mjs';
import { handleRegistry, publicStatus, normDomain, assessArticle50, applicationEmail, decisionEmail, SHIELD_PRICE } from './registry-core.mjs';

let failed = 0, passed = 0;
async function test(name, fn) {
  try { await fn(); passed++; } catch (e) { failed++; console.error('FAIL', name, '\n    ', e.stack || e.message); }
}
function eq(a, b, msg) { if (a !== b) throw new Error(`${msg || ''} expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); }
function ok(c, msg) { if (!c) throw new Error(msg || 'not ok'); }

export function memoryDb() {
  const apps = new Map(), keys = [], passports = new Map(), watches = new Map(), hits = [], partners = [], subs = new Set(), visits = [], leads = [], chats = new Map(), orders = new Map();
  return {
    apps, passports, watches, hits, partners, subs, visits, leads, orders, mailbox: [],
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
    async getActiveKey() { return keys.find((k) => k.active) || null; },
    async listKeys() { return keys.map(({ kid, public_jwk }) => ({ kid, public_jwk })); },
    async saveKey(k) { keys.push(k); },
    async getPassport(d) { return passports.has(d) ? { ...passports.get(d) } : null; },
    async getPassports(ds) { return ds.filter((d) => passports.has(d)).map((d) => ({ ...passports.get(d) })); },
    async savePassport(r) { passports.set(r.domain, { ...(passports.get(r.domain) || {}), ...r }); },
    async watchedDomains() { return [...new Set([...watches.values()].filter((w) => w.confirmed_at && !w.unsubscribed_at).map((w) => w.domain))]; },
    async monitoredDomains() { return [...new Set([...watches.values()].filter((w) => w.order_ref && !w.unsubscribed_at).map((w) => w.domain))]; },
    async monitorFor(d) { return [...watches.values()].find((w) => w.domain === d && w.order_ref && !w.unsubscribed_at) || null; },
    async watchersFor(d) { return [...watches.values()].filter((w) => w.domain === d && w.confirmed_at && !w.unsubscribed_at); },
    async findWatch(d, e) { return [...watches.values()].find((w) => w.domain === d && w.email === e) || null; },
    async getWatch(t) { return watches.get(t) || null; },
    async createWatch(r) { watches.set(r.token, { ...r }); },
    async updateWatch(t, p) { Object.assign(watches.get(t), p); },
    async listOrders() { return [...orders.values()]; },
    async countPassports() { return passports.size; },
    async countWatchers() { return [...watches.values()].filter((w) => w.confirmed_at && !w.unsubscribed_at).length; },
    async countSubscribers() { return subs.size; },
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
  ok(r.body.message.includes('emailed') && r.body.emailed === true);
  const { deps: quiet } = setup({ mail: null });
  const q = await call(quiet, 'shieldApply', APP);
  ok(!q.body.message.includes('emailed you') && q.body.emailed === false, 'never claims an email that was not sent');
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

/* A well-kept site and a bare one, served from memory. */
function web(site) {
  return {
    resolve: async (name, type) => {
      const r = site.dns[`${type} ${name}`];
      if (r === 'down') throw new Error('dns');
      return { ad: !!site.ad, answers: r || [] };
    },
    fetchPage: async (url) => {
      const p = site.pages[url];
      if (!p) { if (site.pages['https://' + new URL(url).hostname + '/']) return { status: 404, headers: { 'content-type': 'text/html' }, text: '<html>nope' }; throw new Error('unreachable'); }
      return { status: 200, headers: {}, ...p };
    }
  };
}
const GOOD = {
  ad: true,
  dns: {
    'TXT good.example': ['"v=spf1 include:_spf.example -all"'], 'TXT _dmarc.good.example': ['"v=DMARC1; p=reject; rua=mailto:d@good.example"'],
    'CAA good.example': ['0 issue "letsencrypt.org"'], 'SOA good.example': ['ns1 hostmaster 1 2 3 4 5'],
    'TXT _lunara-verify.good.example': ['"lunara-verify=abc"']
  },
  pages: {
    'https://good.example/': { headers: { 'strict-transport-security': 'max-age=63072000; includeSubDomains', 'content-security-policy': "default-src 'self'; frame-ancestors 'none'", 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer' }, text: '<html>' },
    'https://good.example/llms.txt': { headers: { 'content-type': 'text/plain' }, text: '# Good\n> A well kept example site for tests.' },
    'https://good.example/robots.txt': { headers: { 'content-type': 'text/plain' }, text: 'User-agent: GPTBot\nAllow: /\n\nUser-agent: ClaudeBot\nAllow: /' },
    'https://good.example/.well-known/security.txt': { headers: { 'content-type': 'text/plain' }, text: 'Contact: mailto:security@good.example\nExpires: 2027-01-01T00:00:00Z' }
  }
};

await test('passport: weights sum to 100 and grades are monotone', async () => {
  eq(CHECKS.reduce((s, c) => s + c.points, 0), 100);
  eq(grade(100), 'A+'); eq(grade(80), 'A'); eq(grade(0), 'F');
});

await test('passport: a well-kept site scores 100 and is still not registered', async () => {
  const { deps } = setup(web(GOOD));
  const r = (await call(deps, 'passportScan', { domain: 'https://good.example/path' })).body;
  eq(r.domain, 'good.example'); eq(r.score, 100); eq(r.grade, 'A+');
  eq(r.visa, 'not_registered', 'points never buy a stamp'); eq(r.dns_proof, true);
  ok(r.checks.every((c) => c.pass && c.fix === null));
  eq(r.next, 'https://lunarasociety.com/shield.html');
});

await test('passport: a bare site fails honestly, soft 404s and unreachable DNS score nothing', async () => {
  const bare = { dns: { 'SOA bare.example': 'down' }, pages: { 'https://www.bare.example/': { headers: {}, text: '<html>' } } };
  const { deps } = setup(web(bare));
  const r = (await call(deps, 'passportScan', { domain: 'bare.example' })).body;
  eq(r.score, 15, 'only HTTPS (via www)'); eq(r.grade, 'F');
  const by = Object.fromEntries(r.checks.map((c) => [c.id, c]));
  eq(by.https.pass, true); ok(/www\.bare\.example/.test(by.https.detail));
  eq(by.llms.pass, false, 'an HTML 404 page is not an llms.txt'); ok(by.dmarc.fix);
  eq(by.dnssec.detail, 'No answer');
});

await test('passport: partial credit, the register decides the visa', async () => {
  const site = { dns: { 'TXT mid.example': ['"v=spf1 a"'], 'TXT _dmarc.mid.example': ['"v=DMARC1; p=none"'] },
    pages: { 'https://mid.example/': { headers: { 'strict-transport-security': 'max-age=300' }, text: '' } } };
  const { deps, db } = setup(web(site));
  db.apps.set('SHIELD-2026-0001', { public_id: 'SHIELD-2026-0001', domain: 'mid.example', status: 'approved', kind: 'business', business_name: 'Mid', verified_at: '2026-09-01T00:00:00Z', expires_at: '2027-03-01T00:00:00Z' });
  const r = (await call(deps, 'passportScan', { domain: 'mid.example' })).body;
  eq(r.score, 15 + 5 + 4 + 4); eq(r.visa, 'verified'); eq(r.register.public_id, 'SHIELD-2026-0001'); eq(r.next, null);
  db.apps.get('SHIELD-2026-0001').status = 'revoked';
  eq((await call(deps, 'passportScan', { domain: 'mid.example' })).body.visa, 'revoked');
});

await test('passport: a <meta> policy counts, except for framing', async () => {
  const site = { dns: {}, pages: { 'https://meta.example/': { headers: {}, text: `<html><head><meta http-equiv="Content-Security-Policy" content="default-src 'self'; frame-ancestors 'none'"><meta name='referrer' content='no-referrer'></head>` } } };
  const r = (await call(setup(web(site)).deps, 'passportScan', { domain: 'meta.example' })).body;
  const by = Object.fromEntries(r.checks.map((c) => [c.id, c]));
  eq(by.csp.pass, true); ok(/^<meta> default-src/.test(by.csp.detail));
  eq(by.referrer.pass, true); eq(by.referrer.detail, '<meta> no-referrer');
  eq(by.frame.pass, false, 'browsers ignore frame-ancestors in a meta policy');
});

await test('passport: bad input, no network, rate limit', async () => {
  eq((await call(setup(web(GOOD)).deps, 'passportScan', { domain: 'localhost' })).status, 400);
  eq((await call(setup().deps, 'passportScan', { domain: 'good.example' })).status, 503);
  const { deps } = setup(web(GOOD));
  for (let i = 0; i < 30; i++) eq((await call(deps, 'passportScan', { domain: 'good.example' })).status, 200);
  eq((await call(deps, 'passportScan', { domain: 'good.example' })).status, 429);
});

await test('passport: private addresses are refused', async () => {
  for (const ip of ['127.0.0.1', '10.1.2.3', '172.20.0.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', 'fd00::1', 'fe80::1', '::ffff:10.0.0.1', '999.1.1.1'])
    eq(isPrivateAddress(ip), true, ip);
  for (const ip of ['1.1.1.1', '185.199.108.153', '2606:4700::1111']) eq(isPrivateAddress(ip), false, ip);
});

await test('passport: every scan is kept, and the badge reads the kept one', async () => {
  const { deps, db } = setup(web(GOOD));
  eq((await call(setup().deps, 'passportBadge', { domain: 'nobody.example' })).body.found, false, 'nothing kept, no network');
  await call(deps, 'passportScan', { domain: 'good.example' });
  eq(db.passports.get('good.example').score, 100);
  let fetched = 0; const f = deps.fetchPage; deps.fetchPage = async (u) => { fetched++; return f(u); };
  const b = (await call(deps, 'passportBadge', { domain: 'www.good.example' }, 'GET')).body;
  eq(b.grade, 'A+'); eq(b.eligible, true); eq(b.visa, 'not_registered'); eq(fetched, 0, 'a fresh passport is not rescanned');
  ok(b.passport.endsWith('passport.html?d=good.example'));
});

await test('passport: a stale badge rescans once a day at most, and a low grade is not eligible', async () => {
  const { deps, db } = setup(web(GOOD));
  db.passports.set('good.example', { domain: 'good.example', score: 40, grade: 'D', visa: 'not_registered', checks: [], scanned_at: '2026-09-01T00:00:00Z' });
  const b = (await call(deps, 'passportBadge', { domain: 'good.example' })).body;
  eq(b.score, 100, 'rescanned because it was a month old');
  db.passports.set('good.example', { domain: 'good.example', score: 40, grade: 'D', visa: 'not_registered', checks: [], scanned_at: '2026-09-01T00:00:00Z' });
  const again = (await call(deps, 'passportBadge', { domain: 'good.example' })).body;
  eq(again.score, 40, 'not rescanned twice in a day'); eq(again.fresh, false); eq(again.eligible, false);
});

await test('passport: the tick rescans what is stale, rolls the week, and the league ranks it', async () => {
  const site = { ...GOOD, dns: { ...GOOD.dns }, pages: { ...GOOD.pages } };
  const { deps, db } = setup({ ...web(site), leagueList: async () => [{ domain: 'good.example', name: 'Good' }, { domain: 'bare.example', name: 'Bare' }] });
  db.passports.set('good.example', { domain: 'good.example', score: 70, grade: 'B', visa: 'not_registered', checks: [], scanned_at: '2026-09-20T00:00:00Z' });
  const r = (await call(deps, 'passportTick', {})).body;
  eq(r.due, 2);
  eq(db.passports.get('good.example').prev_score, 70); eq(db.passports.get('good.example').score, 100);
  eq((await call(deps, 'passportTick', {})).body.due, 0, 'nothing is stale any more');
  const L = (await call(deps, 'passportLeague', null, 'GET')).body;
  eq(L.listed, 2); eq(L.entries.length, 1, 'bare.example never answered over HTTPS, so it is not ranked'); eq(L.unreachable[0].domain, 'bare.example');
  eq(L.entries[0].domain, 'good.example'); eq(L.entries[0].name, 'Good'); eq(L.entries[0].prev_score, 70);
});

await test('passport: watchers confirm, get told when it gets worse, and can stop', async () => {
  const site = { ...GOOD, dns: { ...GOOD.dns }, pages: { ...GOOD.pages } };
  const { deps, db, mailbox } = setup({ ...web(site), leagueList: async () => [] });
  eq((await call({ ...deps, mail: null }, 'passportWatch', { domain: 'good.example', email: 'o@good.example' })).status, 503, 'no mail, no promise');
  const w = (await call(deps, 'passportWatch', { domain: 'good.example', email: 'O@good.example' })).body;
  eq(w.success, true); eq(mailbox.length, 1);
  const token = [...db.watches.keys()][0];
  ok(mailbox[0].text.includes(token));
  eq((await call(deps, 'passportWatchSet', { token })).body.watching, true);
  await call(deps, 'passportScan', { domain: 'good.example' });
  db.passports.get('good.example').scanned_at = '2026-09-01T00:00:00Z';
  delete site.dns['TXT _dmarc.good.example'];
  const r = (await call(deps, 'passportTick', {})).body;
  eq(r.alerts, 1); ok(/DMARC/.test(mailbox[1].text)); ok(mailbox[1].text.includes('stop=1'));
  eq((await call(deps, 'passportWatchSet', { token, action: 'stop' })).body.watching, false);
  eq((await db.watchersFor('good.example')).length, 0);
  eq((await call(deps, 'passportWatchSet', { token: 'x' })).status, 400);
});

await test('passport monitor: daily, first in line, a weekly summary, and marked in badge and league', async () => {
  const site = { ...GOOD, dns: { ...GOOD.dns }, pages: { ...GOOD.pages } };
  const { deps, db, mailbox } = setup({ ...web(site), leagueList: async () => [{ domain: 'good.example', name: 'Good' }] });
  await call(deps, 'passportScan', { domain: 'good.example' });
  // A day-old passport: too fresh for the weekly rescan, due for the daily one.
  db.passports.get('good.example').scanned_at = '2026-10-03T10:00:00Z';
  eq((await call(deps, 'passportTick', {})).body.due, 0, 'unmonitored: not due after a day');
  db.watches.set('m'.repeat(24), { token: 'm'.repeat(24), domain: 'good.example', email: 'owner@good.example', order_ref: 'LO-AAAAAAAAAAAAAAAA', confirmed_at: '2026-10-03T00:00:00Z' });
  const r = (await call(deps, 'passportTick', {})).body;
  eq(r.due, 1, 'monitored: rescanned daily');
  eq(mailbox.length, 1, 'nothing got worse, so the weekly summary goes');
  ok(/this week: A\+, 100\/100/.test(mailbox[0].subject)); ok(mailbox[0].text.includes('manage.html?order=LO-AAAAAAAAAAAAAAAA'));
  db.passports.get('good.example').scanned_at = '2026-10-03T10:00:00Z';
  await call(deps, 'passportTick', {});
  eq(mailbox.length, 1, 'one summary a week, not one a day');
  eq((await call(deps, 'passportBadge', { domain: 'good.example' })).body.monitored, true);
  eq((await call(deps, 'passportLeague', null, 'GET')).body.entries[0].monitored, true);
  db.watches.get('m'.repeat(24)).unsubscribed_at = '2026-10-04T00:00:00Z';
  eq((await call(deps, 'passportBadge', { domain: 'good.example' })).body.monitored, false, 'lapsed: no mark');
});

await test('passport lead: the visitor gets the report, the owner gets the lead', async () => {
  const site = { ...GOOD, dns: { ...GOOD.dns }, pages: { ...GOOD.pages } };
  delete site.dns['TXT _dmarc.good.example'];
  const { deps, db, mailbox } = setup(web(site));
  eq((await call(deps, 'passportLead', { domain: 'good.example', email: 'a@b.example' })).status, 404, 'scan first');
  await call(deps, 'passportScan', { domain: 'good.example' });
  eq((await call(deps, 'passportLead', { domain: 'good.example', email: 'nope' })).status, 400);
  const r = (await call(deps, 'passportLead', { domain: 'https://good.example/', email: 'Lead@B.example' })).body;
  eq(r.success, true); eq(r.emailed, true);
  eq(db.leads.length, 1); eq(db.leads[0].product, 'passport'); eq(db.leads[0].email, 'lead@b.example'); ok(db.leads[0].gaps.some((g) => /DMARC/.test(g)));
  eq(mailbox[0].to, 'lead@b.example'); ok(/WHAT TO FIX/.test(mailbox[0].text) && /Fix: /.test(mailbox[0].text));
  eq(mailbox[1].to, 'lunarasociety@gmail.com'); ok(mailbox[1].subject.startsWith('Lead: good.example'));
});

await test('agent passport: only a verified AI agent gets one, anyone can verify it, revocation kills it', async () => {
  const { deps, db } = setup();
  const base = { kind: 'ai_agent', status: 'approved', contact_email: 'ana@yavaya.lat', business_name: 'Yavaya', agent_name: 'Yavi', agent_operator: 'Yavaya', domain: 'yavaya.lat', expires_at: '2027-04-04T00:00:00Z' };
  db.apps.set('SHIELD-2026-0007', { public_id: 'SHIELD-2026-0007', ...base });
  db.apps.set('SHIELD-2026-0008', { public_id: 'SHIELD-2026-0008', ...base, kind: 'business' });
  eq((await call(deps, 'agentPassportIssue', { public_id: 'SHIELD-2026-0007' })).status, 401);
  eq((await call(deps, 'agentPassportIssue', { public_id: 'SHIELD-2026-0007', session_token: 'nobody' })).status, 401);
  eq((await call({ ...deps, whoIs: async () => ({ email: 'eve@x.com' }) }, 'agentPassportIssue', { public_id: 'SHIELD-2026-0007', session_token: 'eve' })).status, 404, 'not theirs');
  eq((await call(deps, 'agentPassportIssue', { public_id: 'SHIELD-2026-0008', session_token: 'member-session' })).status, 409, 'a business gets no agent passport');
  const r = (await call(deps, 'agentPassportIssue', { public_id: 'SHIELD-2026-0007', session_token: 'member-session' })).body;
  eq(r.success, true); eq(r.payload.agent, 'Yavi'); ok(r.header.startsWith('Lunara-Passport: '));
  eq((await call(deps, 'agentPassportKeys', null, 'GET')).body.keys.length, 1, 'one key, made on first use');
  ok(!JSON.stringify((await call(deps, 'agentPassportKeys', null, 'GET')).body).includes('pkcs8'), 'the private key is never served');
  let v = (await call(deps, 'agentPassportVerify', { passport: r.passport })).body;
  eq(v.valid, true); eq(v.signature, 'valid'); eq(v.status, 'verified'); eq(v.public_id, 'SHIELD-2026-0007');
  const [h, sig] = r.passport.split('.');
  const forged = Buffer.from(JSON.stringify({ ...r.payload, agent: 'Evil' })).toString('base64url') + '.' + sig;
  v = (await call(deps, 'agentPassportVerify', { passport: forged })).body;
  eq(v.valid, false); eq(v.signature, 'invalid');
  eq((await call(deps, 'agentPassportVerify', { passport: 'garbage' })).body.valid, false);
  db.apps.get('SHIELD-2026-0007').status = 'revoked';
  v = (await call(deps, 'agentPassportVerify', { passport: r.passport })).body;
  eq(v.valid, false); eq(v.signature, 'valid'); eq(v.status, 'revoked');
  eq((await call(deps, 'agentPassportIssue', { public_id: 'SHIELD-2026-0007', session_token: 'member-session' })).status, 409);
  const again = (await call(deps, 'agentPassportIssue', { public_id: 'SHIELD-2026-0007', session_token: 'owner-session' })).status;
  eq(again, 409, 'even the owner cannot issue for a revoked agent');
});

await test('ops: live numbers for the owner; figures without people for the agent key; nothing for anyone else', async () => {
  const { deps, db } = setup({ env: { LUNARA_OPS_KEY: 'k'.repeat(32) } });
  db.orders.set('LO-1', { order_ref: 'LO-1', product: 'shield', amount_total: 7500, status: 'paid', email: 'buyer@x.com', name: 'Buyer', livemode: true, paid_at: '2026-10-03T00:00:00Z', created_at: '2026-10-03T00:00:00Z' });
  db.orders.set('LO-2', { order_ref: 'LO-2', product: 'kit', amount_total: 9500, status: 'open', livemode: true, created_at: '2026-10-03T00:00:00Z' });
  db.orders.set('LO-3', { order_ref: 'LO-3', product: 'kit', amount_total: 9500, status: 'paid', livemode: false, created_at: '2026-10-01T00:00:00Z' });
  const callH = (headers, body) => handleRegistry(new Request('https://p.supabase.co/functions/v1/lunara-registry/opsStats', { method: 'POST', headers, body: JSON.stringify(body || {}) }), deps).then(async (r) => ({ status: r.status, body: await r.json() }));
  eq((await callH({}, {})).status, 403);
  eq((await callH({ 'x-lunara-ops-key': 'k'.repeat(31) + 'x' })).status, 403, 'a wrong key');
  eq((await callH({ 'x-lunara-ops-key': 'short' })).status, 403);
  const a = (await callH({ 'x-lunara-ops-key': 'k'.repeat(32) })).body;
  eq(a.revenue.paid_orders, 1, 'sandbox orders are not revenue'); eq(a.revenue.gross_usd, 75); eq(a.revenue.unfinished_checkouts_7_days, 1);
  ok(!JSON.stringify(a).includes('buyer@x.com'), 'the agent sees no email'); eq(a.access.startsWith('agent'), true);
  const o = (await callH({}, { session_token: 'owner-session' })).body;
  eq(o.access, 'owner'); ok(JSON.stringify(o).includes('buyer@x.com'));
  eq((await callH({}, { session_token: 'member-session' })).status, 403, 'a member is not the owner');
  const none = setup().deps;
  eq((await handleRegistry(new Request('https://p.supabase.co/functions/v1/lunara-registry/opsStats', { method: 'POST', headers: { 'x-lunara-ops-key': 'k'.repeat(32) }, body: '{}' }), none)).status, 403, 'no key configured, no key accepted');
});

console.log(`${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
