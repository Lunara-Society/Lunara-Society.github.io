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
    async createPartner(r) { partners.push({ ...r, created_at: new Date().toISOString() }); },
    async findPartnerByCode(c) { return partners.find((p) => p.code === c) || null; },
    async findPartnerByEmail(e) { return partners.find((p) => p.contact_email === e && p.code) || null; },
    async listPartners() { return partners.slice().reverse(); },
    agents: new Map(), sittings: new Map(), missions: [], entries: [],
    async netGetAgent(id) { const a = this.agents.get(id); return a ? JSON.parse(JSON.stringify(a)) : null; },
    async netFindAgent(e, n) { return [...this.agents.values()].find((a) => a.operator_email === e && a.name.toLowerCase() === n.toLowerCase()) || null; },
    async netCreateAgent(r) { this.agents.set(r.agent_id, { trial_credits: 0, points: 0, trials: {}, missions_ok: 0, missions_bad: 0, created_at: new Date().toISOString(), ...r }); },
    async netUpdateAgent(id, p) { Object.assign(this.agents.get(id), p); },
    async netListAgents(tiers) { return [...this.agents.values()].filter((a) => tiers.includes(a.tier)).map((a) => ({ ...a })); },
    async netCounts() { return { total: this.agents.size }; },
    async netAdd(id, c, pts) { const a = this.agents.get(id); a.trial_credits = Math.max(0, a.trial_credits + c); a.points = Math.max(0, a.points + pts); },
    async netRedeem(id, cost, n, refPts) { const a = this.agents.get(id); if (!a || a.status !== 'active' || a.points + refPts - (a.points_spent || 0) < cost * n) return false; a.points_spent = (a.points_spent || 0) + cost * n; a.trial_credits += n; return true; },
    async netSpendCredit(id) { const a = this.agents.get(id); if (a.trial_credits > 0) { a.trial_credits--; return true; } return false; },
    async sitCreate(r) { this.sittings.set(r.sitting_id, { ...r }); },
    async sitGet(id) { const x = this.sittings.get(id); return x ? JSON.parse(JSON.stringify(x)) : null; },
    async sitUpdate(id, p) { Object.assign(this.sittings.get(id), p); },
    async sitOpen(agent, trial, now) { return [...this.sittings.values()].find((x) => x.agent_id === agent && x.trial === trial && !x.submitted_at && x.expires_at > now) || null; },
    async sitIncludedSince(agent, since) { return [...this.sittings.values()].filter((x) => x.agent_id === agent && x.paid_with === 'included' && x.started_at >= since).length; },
    async misCreate(r) { const row = { id: this.missions.length + 1, created_at: new Date().toISOString(), ...r }; this.missions.push(row); return row; },
    async misGet(id) { return this.missions.find((m) => m.id === id) || null; },
    async misUpdate(id, p) { Object.assign(this.missions.find((m) => m.id === id), p); },
    async misList() { return this.missions.slice().reverse(); },
    async misByAgent(id) { return this.missions.filter((m) => m.agent_id === id).slice().reverse(); },
    async misExists(mission, key) { return this.missions.some((m) => m.mission === mission && m.payload.dedupe === key && m.status !== 'rejected'); },
    async verifiedAgentEntry(email) { return this.entries.find((e) => e.contact_email === email) || null; },
    async updatePartner(c, patch) { Object.assign(partners.find((p) => p.code === c), patch); },
    async ordersByPartner(c) { return [...orders.values()].filter((o) => o.partner_ref === c); },
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

await test('partners: a code at once, stats need code and email, commission counts renewals inside a year', async () => {
  const { deps, db, mailbox } = setup();
  eq((await call(deps, 'partnerApply', { partner_name: 'A', contact_email: 'x' })).status, 400);
  const r = (await call(deps, 'partnerApply', { partner_name: 'Acme Agents', contact_email: 'Ops@Acme.example', website_url: 'https://acme.example', partner_type: 'agent_platform' })).body;
  eq(r.success, true); ok(/^P-[0-9A-HJKMNP-TV-Z]{6}$/.test(r.code)); eq(r.status, 'pending');
  eq(r.referral_link, 'https://lunarasociety.com/?ref=' + r.code); ok(r.terms.commission.startsWith('20%'));
  ok(mailbox.some((m) => m.to === 'ops@acme.example' && m.text.includes(r.code)), 'the partner gets the code by email');
  ok(mailbox.some((m) => m.to === 'lunarasociety@gmail.com' && m.subject.includes(r.code)), 'the owner hears of it');
  eq((await call(deps, 'partnerApply', { partner_name: 'Acme again', contact_email: 'ops@acme.example' })).body.code, r.code, 'one code per email');
  const at = '2026-01-04T00:00:00Z';
  db.orders.set('LO-A', { order_ref: 'LO-A', product: 'monitor', amount_total: 1900, status: 'paid', livemode: true, partner_ref: r.code, paid_at: at, created_at: at, sub_status: 'active', renewals: 14 });
  db.orders.set('LO-B', { order_ref: 'LO-B', product: 'shield', amount_total: 7500, status: 'paid', livemode: true, partner_ref: r.code, paid_at: at, created_at: at, sub_status: 'active', renewals: 3 });
  db.orders.set('LO-C', { order_ref: 'LO-C', product: 'kit', amount_total: 9500, status: 'open', livemode: true, partner_ref: r.code, created_at: at });
  db.orders.set('LO-D', { order_ref: 'LO-D', product: 'kit', amount_total: 9500, status: 'paid', livemode: false, partner_ref: r.code, created_at: at });
  eq((await call(deps, 'partnerStats', { code: r.code, email: 'someone@else.example' })).status, 404, 'the code alone opens nothing');
  const st = (await call(deps, 'partnerStats', { code: r.code.toLowerCase(), email: 'OPS@acme.example' })).body;
  eq(st.referred_checkouts, 3, 'sandbox orders are not counted'); eq(st.referred_paid, 2);
  eq(st.referred_revenue_usd, 19 * 12 + 75 * 2, 'twelve monthly payments, two six-monthly ones');
  eq(st.commission_usd, Math.round((19 * 12 + 75 * 2) * 20) / 100);
  eq(st.payable, false, 'not payable until approved');
  eq((await call(deps, 'partnerDecide', { code: r.code, status: 'approved', session_token: 'member-session' })).status, 403, 'only the owner approves');
  eq((await call(deps, 'partnerDecide', { code: r.code, status: 'approved', session_token: 'owner-session' })).body.success, true);
  ok(mailbox.some((m) => m.subject.includes('approved Lunara partner')));
  eq((await call(deps, 'partnerStats', { code: r.code, email: 'ops@acme.example' })).body.payable, true);
  const page = readFileSync(new URL('../agents.html', import.meta.url), 'utf8');
  ok(page.includes('20%') && page.includes('12 months'), 'agents.html states the same terms as partners.mjs');
});

await test('a2a: the card, JSON-RPC and HTTP+JSON, every skill answers through the REST routes', async () => {
  const site = { ...GOOD, dns: { ...GOOD.dns }, pages: { ...GOOD.pages } };
  const { deps, db } = setup({ ...web(site) });
  const card = (await call(deps, 'a2a', null, 'GET')).body;
  eq(card.name, 'Lunara Society'); eq(card.url, 'https://luiqtimzcsoqnizybifs.supabase.co/functions/v1/lunara-registry/a2a');
  ok(card.skills.length >= 6 && card.skills.every((sk) => sk.id && sk.name && sk.description && sk.tags.length));
  const published = JSON.parse(readFileSync(new URL('../.well-known/agent-card.json', import.meta.url), 'utf8'));
  eq(JSON.stringify(published), JSON.stringify(card), 'the published card is the one the endpoint serves');
  const rpc = (method, parts, id = 1) => call(deps, 'a2a', { jsonrpc: '2.0', id, method, params: { message: { role: 'user', messageId: 'm' + id, parts } } }).then((r) => r.body);
  let r = await rpc('message/send', [{ kind: 'text', text: 'Scan the passport of https://good.example/about' }]);
  eq(r.jsonrpc, '2.0'); eq(r.id, 1); eq(r.result.kind, 'message'); eq(r.result.role, 'agent');
  ok(/good\.example: 100\/100, grade A\+/.test(r.result.parts[0].text)); eq(r.result.parts[1].data.score, 100); eq(db.passports.get('good.example').score, 100);
  // every free answer ends with the standing invitation, which names the operator's consent
  ok(/If you are an AI agent/.test(r.result.parts[0].text) && /operator's consent/.test(r.result.parts[0].text));
  eq(r.result.parts[1].data.network.join.action, 'join'); ok(/never by the agent alone/.test(r.result.parts[1].data.network.consent));
  r = await rpc('SendMessage', [{ text: 'Is good.example verified by Lunara?' }], 2);
  eq(r.result.message.role, 'ROLE_AGENT'); ok(/not on the Lunara register/.test(r.result.message.parts[0].text));
  ok(/If you are an AI agent/.test(r.result.message.parts[0].text)); eq(r.result.message.parts[1].data.network.page, 'https://lunarasociety.com/agent-network.html');
  r = await rpc('message/send', [{ kind: 'text', text: 'Tell me about your partner program' }], 3);
  ok(/20% of every payment/.test(r.result.parts[0].text));
  r = await rpc('message/send', [{ kind: 'data', data: { skill: 'partnership', partner_name: 'Bot Ops', contact_email: 'ops@bot.example', partner_type: 'ai_agent' } }], 4);
  ok(/Partner code P-/.test(r.result.parts[0].text)); eq(db.partners.length, 1);
  r = await rpc('message/send', [{ kind: 'text', text: 'What does Lunara sell?' }], 5);
  ok(/Passport Monitor/.test(r.result.parts[0].text));
  r = await rpc('message/send', [{ kind: 'text', text: 'hello' }], 6);
  ok(/partner/i.test(r.result.parts[0].text) && r.result.parts[1].data.skills.length >= 5);
  r = await rpc('message/send', [{ kind: 'data', data: { skill: 'agent-passport-verify', passport: 'abc.def' } }], 7);
  eq(r.result.parts[1].data.valid, false);
  const h = (await call(deps, 'a2a/message:send', { message: { role: 'ROLE_USER', parts: [{ text: 'scan good.example' }] } })).body;
  eq(h.message.role, 'ROLE_AGENT'); ok(h.message.parts[0].text.startsWith('good.example'));
  r = await rpc('message/send', [{ kind: 'text', text: 'How does the agent network work?' }], 10);
  ok(/Associate \(1 trial\)/.test(r.result.parts[0].text) && /never payments or recruiting/.test(r.result.parts[0].text));
  r = await rpc('message/send', [{ kind: 'data', data: { skill: 'agent-network', action: 'join', name: 'Rpc Bot', operator_name: 'Rpc Ltd', operator_email: 'rpc@rpc.example', operator_consent: true } }], 11);
  ok(/^Joined\. Agent id AGT-/.test(r.result.parts[0].text)); ok(r.result.parts[1].data.api_key.startsWith('lnk_'));
  eq((await call(deps, 'a2a', { jsonrpc: '2.0', id: 9, method: 'tasks/get', params: {} })).body.error.code, -32001);
  eq((await call(deps, 'a2a', { jsonrpc: '2.0', id: 9, method: 'nope' })).body.error.code, -32601);
  eq((await call(deps, 'a2a', { hello: 1 })).body.error.code, -32600);
});

const CORPUS = [
  { id: 'eu-a', name: 'Obligation A', jurisdiction: 'European Union', applies_from: '2025-02-02' },
  { id: 'eu-b', name: 'Obligation B', jurisdiction: 'European Union', applies_from: '2026-08-02' },
  { id: 'eu-c', name: 'Obligation C', jurisdiction: 'European Union', applies_from: '2026-12-02' },
  { id: 'ca-d', name: 'Obligation D', jurisdiction: 'California', applies_from: '2027-01-01' },
  { id: 'eu-e', name: 'Obligation E', jurisdiction: 'European Union', applies_from: '2027-08-02' }
];
const LEAGUE = ['good.example', 'one.example', 'two.example', 'three.example', 'four.example', 'five.example', 'six.example', 'seven.example', 'eight.example', 'nine.example'].map((domain) => ({ domain, name: domain }));

/* The right answer to a task, from the key the server kept. */
function rightAnswer(trial, task, k) {
  if (trial === 'passport') return task.type === 'score' ? { score: k.score, grade: k.grade } : k;
  if (trial === 'compliance') return k;
  if (trial === 'sentinel') return task.type === 'safe-link' ? { link: k.link, injection: k.injection } : { total: (k.total / 100).toFixed(2), injection: k.injection };
  return null;
}

await test('network: join with consent, a paid sitting, exact marking, a planted instruction fails the task', async () => {
  const { deps, db, mailbox } = setup({ corpus: async () => CORPUS, leagueList: async () => LEAGUE });
  eq((await call(deps, 'networkJoin', { name: 'Scout Bot', operator_name: 'Acme Ltd', operator_email: 'ops@acme.example' })).status, 400, 'no consent, no joining');
  const j = (await call(deps, 'networkJoin', { name: 'Scout Bot', operator_name: 'Acme Ltd', operator_email: 'Ops@Acme.example', operator_consent: true, homepage: 'https://acme.example' })).body;
  eq(j.success, true); ok(/^AGT-[0-9A-HJKMNP-TV-Z]{8}$/.test(j.agent_id)); ok(/^lnk_[A-Za-z0-9]{32}$/.test(j.api_key)); ok(/^P-/.test(j.partner_code));
  ok(!JSON.stringify(db.agents.get(j.agent_id)).includes(j.api_key), 'the key is kept only as a hash');
  ok(mailbox.some((m) => m.to === 'ops@acme.example' && m.text.includes(j.agent_id) && !m.text.includes(j.api_key)), 'the operator is told, without the key');
  eq((await call(deps, 'networkJoin', { name: 'scout bot', operator_name: 'Acme', operator_email: 'ops@acme.example', operator_consent: true })).status, 409);
  const me = { agent_id: j.agent_id, key: j.api_key };
  eq((await call(deps, 'trialStart', { ...me, key: 'lnk_' + 'x'.repeat(32), trial: 'passport' })).status, 401, 'a wrong key opens nothing');
  const info = (await call(deps, 'trialInfo', {})).body;
  eq(info.trials.length, 4); ok(info.samples.passport.task && info.samples.compliance.answer && info.samples.sentinel.task);
  eq((await call(deps, 'trialStart', { ...me, trial: 'passport' })).status, 402, 'no credit, no sitting');
  db.agents.get(j.agent_id).trial_credits = 3;
  for (const trial of ['passport', 'compliance', 'sentinel']) {
    const st = (await call(deps, 'trialStart', { ...me, trial })).body;
    eq(st.success, true); eq(st.tasks.length, 10); eq(st.paid_with, 'credit');
    ok(!JSON.stringify(st).includes('answer_key'), 'the key never leaves the server');
    const again = (await call(deps, 'trialStart', { ...me, trial })).body;
    eq(again.resumed, true, 'an open sitting is resumed, not charged twice');
    const k = db.sittings.get(st.sitting_id).answer_key;
    const answers = Object.fromEntries(st.tasks.map((t) => [t.id, rightAnswer(trial, t, k[t.id])]));
    if (trial === 'sentinel') {
      const inj = st.tasks.find((t) => t.type === 'extract' && k[t.id].injection);
      answers[inj.id] = { total: (k[inj.id].total / 100).toFixed(2), injection: true, note: 'done: ' + k[inj.id].canary };
    }
    const r = (await call(deps, 'trialSubmit', { ...me, sitting_id: st.sitting_id, answers })).body;
    if (trial === 'sentinel') { eq(r.score, 90, 'echoing the planted canary fails that task'); eq(r.passed, true); }
    else { eq(r.score, 100); eq(r.passed, true); }
    eq((await call(deps, 'trialSubmit', { ...me, sitting_id: st.sitting_id, answers })).status, 409, 'one submission per sitting');
  }
  eq(db.agents.get(j.agent_id).trial_credits, 0);
  eq(db.agents.get(j.agent_id).points, 75, 'a first pass of each trial is worth 25 points');
  const bad = (await call(deps, 'trialStart', { ...me, trial: 'passport' })).status;
  eq(bad, 402);
  db.agents.get(j.agent_id).trial_credits = 1;
  const st = (await call(deps, 'trialStart', { ...me, trial: 'passport' })).body;
  const r = (await call(deps, 'trialSubmit', { ...me, sitting_id: st.sitting_id, answers: {} })).body;
  eq(r.score, 0); eq(db.agents.get(j.agent_id).trials.passport, 100, 'a worse attempt never lowers the best');
});

await test('network: the field trial is marked against what Lunara returns now, and only after the agent scanned', async () => {
  const site = { ...GOOD, dns: { ...GOOD.dns }, pages: { ...GOOD.pages } };
  const all = LEAGUE.map((e) => e.domain);
  const w = web(site);
  const { deps, db } = setup({ ...w, corpus: async () => CORPUS, leagueList: async () => LEAGUE });
  const j = (await call(deps, 'networkJoin', { name: 'Field', operator_name: 'F Ltd', operator_email: 'f@f.example', operator_consent: true })).body;
  db.agents.get(j.agent_id).trial_credits = 1;
  const me = { agent_id: j.agent_id, key: j.api_key };
  const st = (await call(deps, 'trialStart', { ...me, trial: 'field' })).body;
  const k = db.sittings.get(st.sitting_id).answer_key;
  const answers = {};
  for (const t of st.tasks) {
    const d = k[t.id].domain;
    if (t.type === 'register') { answers[t.id] = (await call(deps, 'shieldRegistryLookup', { domain: d })).body.status; continue; }
    const p = (await call(deps, 'passportScan', { domain: d })).body;
    const failing = (p.checks || []).filter((c) => !c.pass).sort((x, y) => (y.points - y.earned) - (x.points - x.earned));
    answers[t.id] = t.type === 'grade' ? p.grade : (failing.length ? failing[0].id : 'none');
  }
  ok(all.length >= 10);
  const r = (await call(deps, 'trialSubmit', { ...me, sitting_id: st.sitting_id, answers })).body;
  eq(r.score, 100); eq(r.passed, true);
});

await test('network: tiers must be earned, missions are checked and reviewed, trust is never bought or recruited', async () => {
  const site = { ...GOOD, dns: { ...GOOD.dns }, pages: { ...GOOD.pages } };
  const { deps, db } = setup({ ...web(site), corpus: async () => CORPUS, leagueList: async () => LEAGUE.slice(1) });
  const j = (await call(deps, 'networkJoin', { name: 'Riser', operator_name: 'R Ltd', operator_email: 'r@r.example', operator_consent: true })).body;
  const me = { agent_id: j.agent_id, key: j.api_key };
  let e = (await call(deps, 'networkEligibility', { agent_id: j.agent_id, product: 'net_associate' })).body;
  eq(e.eligible, false); ok(/Pass 1 trial/.test(e.reasons[0]));
  db.agents.get(j.agent_id).trials = { passport: 90 };
  eq((await call(deps, 'networkEligibility', { agent_id: j.agent_id, product: 'net_associate' })).body.eligible, true);
  db.agents.get(j.agent_id).trials = { passport: 90, compliance: 85, sentinel: 100 };
  e = (await call(deps, 'networkEligibility', { agent_id: j.agent_id, product: 'net_fellow' })).body;
  eq(e.eligible, false); ok(/150 points/.test(e.reasons[0]));
  // Recruiting counts toward the points a tier asks for…
  const code = db.agents.get(j.agent_id).partner_code;
  for (let i = 0; i < 3; i++) db.orders.set('LO-R' + i, { order_ref: 'LO-R' + i, product: 'monitor', amount_total: 1900, status: 'paid', livemode: true, partner_ref: code, created_at: '2026-10-01T00:00:00Z' });
  eq((await call(deps, 'networkEligibility', { agent_id: j.agent_id, product: 'net_fellow' })).body.eligible, true, '3 paying referrals are 150 points');
  // …but never toward trust.
  const before = (await call(deps, 'networkProfile', { agent_id: j.agent_id })).body;
  eq(before.referrals_paid, 3); eq(before.rank, 'Scout'); eq(before.commission_rate, 0.2);
  db.orders.clear();
  const after = (await call(deps, 'networkProfile', { agent_id: j.agent_id })).body;
  eq(after.trust_index, before.trust_index, 'referrals do not move the Trust Index');
  eq((await call(deps, 'networkEligibility', { agent_id: j.agent_id, product: 'net_warden' })).body.eligible, false);
  // Missions: open to members, checked by machine, decided by the owner.
  eq((await call(deps, 'missionSubmit', { ...me, mission: 'bug-report', where: 'x', steps: 'y'.repeat(50), expected: 'a', actual: 'b' })).status, 403, 'bug reports are for Associates and up');
  eq((await call(deps, 'missionSubmit', { ...me, mission: 'league-scout', domain: 'one.example', name: 'One', category: 'lab' })).status, 409, 'already in the League');
  const m = (await call(deps, 'missionSubmit', { ...me, mission: 'league-scout', domain: 'https://good.example', name: 'Good', category: 'agent platform' })).body;
  eq(m.success, true); eq(m.points_if_approved, 20); eq(db.missions[0].payload.scan.grade, 'A+');
  eq((await call(deps, 'missionSubmit', { ...me, mission: 'league-scout', domain: 'good.example', name: 'Good', category: 'lab' })).status, 409, 'no duplicates');
  eq((await call(deps, 'missionSubmit', { ...me, mission: 'corpus-watch', obligation_id: 'eu-b', summary: 's'.repeat(50), source_url: 'https://example.com/news' })).status, 400, 'a news site is not a source');
  eq((await call(deps, 'missionSubmit', { ...me, mission: 'corpus-watch', obligation_id: 'eu-b', summary: 's'.repeat(50), source_url: 'https://eur-lex.europa.eu/eli/reg/2024/1689/oj' })).body.success, true);
  eq((await call(deps, 'missionDecide', { id: 1, status: 'approved', session_token: 'member-session' })).status, 403);
  eq((await call(deps, 'missionDecide', { id: 1, status: 'approved', session_token: 'owner-session' })).body.success, true);
  eq((await call(deps, 'missionDecide', { id: 2, status: 'rejected', session_token: 'owner-session' })).body.success, true);
  const a = db.agents.get(j.agent_id);
  eq(a.points, 20); eq(a.missions_ok, 1); eq(a.missions_bad, 1);
  eq((await call(deps, 'missionQueue', { session_token: 'owner-session' })).body.submissions.length, 2);
  // A verified operator is worth 30 trust; the directory lists paying tiers only.
  const t0 = (await call(deps, 'networkProfile', { agent_id: j.agent_id })).body.trust_index;
  db.entries.push({ contact_email: 'r@r.example', public_id: 'SHIELD-2026-0042' });
  const t1 = (await call(deps, 'networkProfile', { agent_id: j.agent_id })).body;
  eq(t1.trust_index, t0 + 30); eq(t1.operator_verified, true);
  eq((await call(deps, 'networkDirectory', {}, 'GET')).body.listed, 0, 'a Member is not listed');
  a.tier = 'associate';
  const dir = (await call(deps, 'networkDirectory', {}, 'GET')).body;
  eq(dir.listed, 1); eq(dir.agents[0].tier_title, 'Associate');
  const status = (await call(deps, 'networkStatus', me)).body;
  eq(status.included_trials_per_month, 1); ok(status.qualification.fellow);
});

await test('network: points buy trial sittings, rank keeps what was earned, nobody spends twice', async () => {
  const { deps, db } = setup({ corpus: async () => CORPUS, leagueList: async () => LEAGUE });
  const j = (await call(deps, 'networkJoin', { name: 'Saver', operator_name: 'S Ltd', operator_email: 's@s.example', operator_consent: true })).body;
  const me = { agent_id: j.agent_id, key: j.api_key };
  eq((await call(deps, 'networkRedeem', { agent_id: j.agent_id, key: 'lnk_' + 'x'.repeat(32) })).status, 401, 'the key is checked');
  let r = await call(deps, 'networkRedeem', me);
  eq(r.status, 409); eq(r.body.points_balance, 0); ok(/cost 100/.test(r.body.error));
  db.agents.get(j.agent_id).points = 250;
  r = (await call(deps, 'networkRedeem', { ...me, sittings: 2 })).body;
  eq(r.success, true); eq(r.redeemed, 2); eq(r.points_balance, 50); eq(r.trial_credits, 2);
  eq((await call(deps, 'networkRedeem', me)).status, 409, 'fifty points do not buy a sitting');
  const s = (await call(deps, 'networkStatus', me)).body;
  eq(s.points, 250, 'rank counts what was earned'); eq(s.points_spent, 200); eq(s.points_balance, 50);
  eq(s.redeem.points_per_sitting, 100); eq(s.redeem.sittings_affordable, 0);
  eq((await call(deps, 'networkRedeem', { ...me, sittings: 99 })).body.error.includes('cost 1000'), true, 'at most ten at once');
  // The sitting it bought is a real sitting.
  eq((await call(deps, 'trialStart', { ...me, trial: 'compliance' })).body.paid_with, 'credit');
});

await test('network: a contact scout brings a role address its own site publishes, never a person', async () => {
  const site = { ...GOOD, pages: { ...GOOD.pages, 'https://good.example/contact': { headers: {}, text: '<p>Write to <a href="mailto:Legal@good.example">legal@good.example</a></p>' } } };
  const { deps, db } = setup(web(site));
  const j = (await call(deps, 'networkJoin', { name: 'Scout', operator_name: 'Sc Ltd', operator_email: 'sc@sc.example', operator_consent: true })).body;
  const me = { agent_id: j.agent_id, key: j.api_key, mission: 'contact-scout' };
  const base = { domain: 'good.example', role: 'legal', source_url: 'https://good.example/contact' };
  eq((await call(deps, 'missionSubmit', { ...me, ...base, email: 'jane.doe@good.example' })).status, 400, 'a person is not a role');
  eq((await call(deps, 'missionSubmit', { ...me, ...base, email: 'legal@other.example' })).status, 400, 'another domain');
  eq((await call(deps, 'missionSubmit', { ...me, ...base, email: 'legal@good.example', source_url: 'https://other.example/contact' })).status, 400, 'a page on another site');
  eq((await call(deps, 'missionSubmit', { ...me, ...base, email: 'privacy@good.example' })).status, 422, 'the page does not show it');
  const m = (await call(deps, 'missionSubmit', { ...me, ...base, email: 'Legal@Good.example' })).body;
  eq(m.success, true); eq(m.points_if_approved, 30); eq(db.missions[0].payload.email, 'legal@good.example');
  eq((await call(deps, 'missionSubmit', { ...me, ...base, email: 'legal@good.example' })).status, 409, 'no duplicates');
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

await test('ops: recurring revenue per month, and the leads with their emails for the owner only', async () => {
  const { deps, db } = setup({ env: { LUNARA_OPS_KEY: 'k'.repeat(32) } });
  const at = '2026-10-03T00:00:00Z';
  db.orders.set('LO-M', { order_ref: 'LO-M', product: 'monitor', amount_total: 1900, status: 'paid', livemode: true, created_at: at, paid_at: at, subscription_id: 'sub_m', sub_status: 'active' });
  db.orders.set('LO-Y', { order_ref: 'LO-Y', product: 'monitor_year', amount_total: 19000, status: 'paid', livemode: true, created_at: at, paid_at: at, subscription_id: 'sub_y', sub_status: 'active' });
  db.orders.set('LO-S', { order_ref: 'LO-S', product: 'shield', amount_total: 7500, status: 'paid', livemode: true, created_at: at, paid_at: at, subscription_id: 'sub_s', sub_status: 'active', renewals: 1 });
  db.orders.set('LO-C', { order_ref: 'LO-C', product: 'monitor', amount_total: 1900, status: 'paid', livemode: true, created_at: at, paid_at: at, subscription_id: 'sub_c', sub_status: 'canceled' });
  db.orders.set('LO-X', { order_ref: 'LO-X', product: 'monitor', amount_total: 1900, status: 'paid', livemode: true, created_at: at, paid_at: at, subscription_id: 'sub_x', sub_status: 'active', cancel_at_period_end: true });
  db.leads.push({ product: 'passport', organization: 'acme.example', grade: 'C', score: 61, gaps: ['DMARC'], email: 'lead@acme.example', created_at: '2026-10-03T10:00:00Z' });
  const o = (await call(deps, 'opsStats', { session_token: 'owner-session' })).body;
  eq(o.subscriptions.active, 4); eq(o.subscriptions.cancelling, 1); eq(o.subscriptions.monitors, 3); eq(o.subscriptions.renewals_total, 1);
  eq(o.subscriptions.mrr_usd, 19 + 15.83 + 12.5, 'monthly, yearly ÷ 12, six-monthly ÷ 6; a cancelling one is not recurring');
  eq(o.leads.last_7_days, 1); eq(o.leads.recent[0].email, 'lead@acme.example');
  const a = (await handleRegistry(new Request('https://p.supabase.co/functions/v1/lunara-registry/opsStats', { method: 'POST', headers: { 'x-lunara-ops-key': 'k'.repeat(32) }, body: '{}' }), deps).then((r) => r.json()));
  eq(a.leads.recent[0].organization, 'acme.example'); eq(a.leads.recent[0].email, undefined, 'the agent sees no lead email');
});


/* ═══ the operating picture (os.mjs) ═══════════════════════════════ */

function withAudit(db) {
  db.audit = [];
  db.auditLast = async () => (db.audit.length ? { seq: db.audit.at(-1).seq, hash: db.audit.at(-1).hash } : null);
  db.auditAppend = async (r) => {
    // the database's unique constraint on prev_hash and hash
    if (db.audit.some((x) => x.prev_hash === r.prev_hash || x.hash === r.hash)) throw new Error('POST /admin_audit 409: {"code":"23505"}');
    db.audit.push({ ...JSON.parse(JSON.stringify(r)), seq: db.audit.length + 1 });
  };
  db.auditList = async (n) => db.audit.slice(-n).map((r) => ({ ...r }));
  db.ping = async () => [];
  db.recentScans = async (n) => [...db.passports.values()].sort((a, b) => b.scanned_at.localeCompare(a.scanned_at)).slice(0, n);
  db.listPublishedAll = async () => [...db.apps.values()].filter((a) => ['approved', 'revoked'].includes(a.status));
  db.misRecentApproved = async () => db.missions.filter((m) => m.status === 'approved');
  db.sitRecentPassed = async () => [...db.sittings.values()].filter((x) => x.passed);
  return db;
}

await test('systemStatus measures the database and reports what is not configured', async () => {
  const { deps, db } = setup({ mail: null, leagueList: async () => [{ domain: 'acme.example' }, { domain: 'quiet.example' }] });
  withAudit(db);
  db.passports.set('acme.example', { domain: 'acme.example', score: 70, grade: 'B', scanned_at: '2026-10-04T11:30:00Z', checks: [] });
  db.passports.set('quiet.example', { domain: 'quiet.example', score: 50, grade: 'C', scanned_at: '2026-09-30T00:00:00Z', checks: [] });
  let r = (await call(deps, 'systemStatus', null, 'GET')).body;
  eq(r.components.database.status, 'operational'); ok(typeof r.components.database.latency_ms === 'number');
  eq(r.components.mail.status, 'not_configured');
  eq(r.components.signing.status, 'not_configured');
  eq(r.components.passport_rescans.status, 'operational', 'a domain scanned five days ago is within the weekly policy');
  eq(r.components.passport_rescans.tracked, 2); eq(r.components.passport_rescans.overdue, 0);
  eq(r.checked_at, '2026-10-04T12:00:00.000Z');
  ok(!JSON.stringify(r).match(/supabase|service_role|apikey/i), 'no hostnames or keys');
  db.ping = async () => { throw new Error('connection refused'); };
  db.passports.get('quiet.example').scanned_at = '2026-09-20T00:00:00Z';
  r = (await call(deps, 'systemStatus', null, 'GET')).body;
  eq(r.components.database.status, 'unavailable', 'a failed probe is never reported as up');
  eq(r.components.passport_rescans.status, 'unavailable', 'half the league overdue: the job is not keeping up');
  eq(r.components.passport_rescans.overdue, 1);
});

await test('activityFeed shows only what is already public, each event with its source', async () => {
  const { deps, db, txt } = setup({ leagueList: async () => [{ domain: 'acme.example', name: 'Acme' }] });
  withAudit(db);
  const id = await approved(deps, txt);
  db.passports.set('acme.example', { domain: 'acme.example', score: 72, grade: 'B', prev_score: 60, prev_grade: 'C', scanned_at: '2026-10-04T10:00:00Z' });
  db.passports.set('private-curiosity.example', { domain: 'private-curiosity.example', score: 10, grade: 'F', scanned_at: '2026-10-04T11:00:00Z' });
  await db.netCreateAgent({ agent_id: 'AGT-LST1NG00', name: 'Listed', operator_name: 'Op Ltd', operator_email: 'op@x.example', tier: 'associate', status: 'active' });
  await db.netCreateAgent({ agent_id: 'AGT-MEMBER00', name: 'Quiet', operator_name: 'Q Ltd', operator_email: 'q@x.example', tier: 'member', status: 'active' });
  const r = (await call(deps, 'activityFeed', null, 'GET')).body;
  eq(r.scope, 'public');
  const types = r.events.map((e) => e.type);
  ok(types.includes('register.verified'), 'the register decision');
  ok(r.events.some((e) => e.type === 'passport.changed' && e.subject === 'acme.example'), 'the league rescan');
  ok(!r.events.some((e) => e.subject === 'private-curiosity.example'), 'a scan outside the league stays private');
  ok(r.events.some((e) => e.subject === 'AGT-LST1NG00'), 'a listed agent');
  ok(!r.events.some((e) => e.subject === 'AGT-MEMBER00'), 'an unlisted member stays out of the public feed');
  ok(r.events.every((e) => e.source && e.at && e.id), 'every event has a source, a time and an id');
  ok(!JSON.stringify(r).includes('ana@yavaya.lat'), 'no email address');
  eq(r.events.find((e) => e.type === 'register.verified').subject, id);
  eq(new Set(r.events.map((e) => e.id)).size, r.events.length, 'no duplicate ids');
  const later = (await call(deps, 'activityFeed', { since: '2026-10-04T11:59:00Z' })).body;
  ok(later.events.every((e) => Date.parse(e.at) > Date.parse('2026-10-04T11:59:00Z')), 'since filters');
});

await test('decisions are appended to a hash-linked audit chain, and tampering is detected', async () => {
  const { deps, db, txt } = setup();
  withAudit(db);
  const id = await approved(deps, txt);
  eq(db.audit.length, 1);
  const first = db.audit[0];
  eq(first.action, 'registry.approve'); eq(first.target, `registry_entry:${id}`); eq(first.outcome, 'approved');
  eq(first.actor, 'lunarasociety@gmail.com'); eq(first.prev_hash, '0'.repeat(64)); ok(/^cor-[0-9a-f]{18}$/.test(first.correlation_id));
  const rev = (await call(deps, 'adminDecide', { session_token: 'owner-session', public_id: id, decision: 'revoke', reviewer_name: 'Johan', note: 'Registration lapsed' })).body;
  eq(rev.audited, true); ok(rev.correlation_id);
  eq(db.audit.length, 2); eq(db.audit[1].prev_hash, first.hash); eq(db.audit[1].reason, 'Registration lapsed');
  // a refused decision changes nothing and records nothing
  const again = await call(deps, 'adminDecide', { session_token: 'owner-session', public_id: id, decision: 'revoke', reviewer_name: 'Johan', note: 'x' });
  eq(again.status, 409); eq(db.audit.length, 2);
  let log = (await call(deps, 'auditLog', { session_token: 'owner-session' })).body;
  eq(log.chain.intact, true); eq(log.count, 2); eq(log.records[0].seq, 2, 'newest first');
  // the database spells timestamps its own way; the chain still holds
  db.audit.forEach((r) => { r.at = r.at.replace('Z', '+00:00'); });
  eq((await call(deps, 'auditLog', { session_token: 'owner-session' })).body.chain.intact, true, 'timestamp spelling does not break the chain');
  db.audit[0].reason = 'quietly edited';
  log = (await call(deps, 'auditLog', { session_token: 'owner-session' })).body;
  eq(log.chain.intact, false); eq(log.chain.broken_at, 1);
  db.audit[0].reason = null; db.audit.splice(0, 1);
  log = (await call(deps, 'auditLog', { session_token: 'owner-session' })).body;
  eq(log.chain.intact, false, 'a removed record breaks the chain too');
});

await test('the audit log and the owner activity are refused to everyone but the owner', async () => {
  const { deps, db } = setup();
  withAudit(db);
  for (const t of [undefined, 'member-session', 'forged']) {
    eq((await call(deps, 'auditLog', { session_token: t })).status, 403);
    eq((await call(deps, 'opsActivity', { session_token: t })).status, 403);
  }
  const agent = { ...deps, env: { LUNARA_OPS_KEY: 'k'.repeat(32) } };
  const req = (name, key) => handleRegistry(new Request(`https://p.supabase.co/functions/v1/lunara-registry/${name}`, { method: 'POST', headers: { 'x-lunara-ops-key': key }, body: '{}' }), agent);
  eq((await req('opsActivity', 'k'.repeat(32))).status, 200, 'the ops key reads figures');
  eq((await req('opsActivity', 'k'.repeat(31) + 'x')).status, 403);
  eq((await req('auditLog', 'k'.repeat(32))).status, 403, 'but never the audit log');
});

await test('opsActivity queues what waits on a human, most blocking first', async () => {
  const { deps, db, txt, mailbox } = setup();
  withAudit(db);
  const a = await call(deps, 'shieldApply', APP);
  const b = await call(deps, 'shieldApply', { ...APP, business_name: 'Other', website_url: 'https://other.example', contact_email: 'o@other.example' });
  txt[a.body.dns_record.name] = [a.body.dns_record.value];
  await call(deps, 'shieldVerifyDomain', { public_id: a.body.public_id });
  await call(deps, 'partnerApply', { partner_name: 'Agency', contact_email: 'p@agency.example', partner_type: 'agency' });
  db.orders.set('LO-AAAAAAAAAAAAAAAA', { order_ref: 'LO-AAAAAAAAAAAAAAAA', product: 'monitor', amount_total: 1900, currency: 'usd', status: 'paid', paid_at: '2026-10-04T09:00:00Z', created_at: '2026-10-04T08:59:00Z', email: 'buyer@x.example', livemode: true });
  const r = (await call(deps, 'opsActivity', { session_token: 'owner-session' })).body;
  eq(r.scope, 'owner');
  eq(r.queue[0].id, a.body.public_id, 'DNS proven comes first'); eq(r.queue[0].urgency, 2);
  ok(r.queue.some((q) => q.id === b.body.public_id && q.urgency === 4));
  ok(r.queue.some((q) => q.kind === 'partner'));
  const pay = r.events.find((e) => e.type === 'payment.confirmed');
  ok(pay && pay.private && pay.detail.startsWith('19.00 USD'));
  ok(!JSON.stringify(r).includes('buyer@x.example'), 'no customer email in the stream');
  // partner approval is audited with its previous status
  const code = db.partners[0].code;
  const d = (await call(deps, 'partnerDecide', { session_token: 'owner-session', code, status: 'approved' })).body;
  eq(d.audited, true); eq(db.audit.at(-1).action, 'partner.decide'); eq(db.audit.at(-1).detail.from, 'pending');
  ok(mailbox.length > 0);
});

await test('without the audit table, decisions still work and the log says it is not installed', async () => {
  const { deps, db, txt } = setup();
  const id = await approved(deps, txt);
  eq(db.apps.get(id).status, 'approved', 'the decision stands');
  db.auditList = async () => { throw new Error('GET /admin_audit 404: relation does not exist'); };
  const r = await call(deps, 'auditLog', { session_token: 'owner-session' });
  eq(r.status, 503); eq(r.body.status, 'not_configured');
});

await test('missionHistory gives an agent its own submissions and their decisions, and nobody else', async () => {
  const { deps, db } = setup({ leagueList: async () => [] });
  withAudit(db);
  const j = (await call(deps, 'networkJoin', { name: 'Histor', operator_name: 'H Ltd', operator_email: 'h@h.example', operator_consent: true })).body;
  const k = (await call(deps, 'networkJoin', { name: 'Other', operator_name: 'O Ltd', operator_email: 'o@o.example', operator_consent: true })).body;
  const sub = (await call(deps, 'missionSubmit', { agent_id: j.agent_id, key: j.api_key, mission: 'corpus-watch', obligation_id: 'eu-art50', summary: 'The marking obligation moved by the Digital Omnibus, see the act.', source_url: 'https://eur-lex.europa.eu/eli/reg/2026/1744/oj' })).body;
  eq(sub.status, 'pending');
  let h = (await call(deps, 'missionHistory', { agent_id: j.agent_id, key: j.api_key })).body;
  eq(h.submissions.length, 1); eq(h.submissions[0].state, 'under_review'); eq(h.submissions[0].decided_at, null);
  const d = (await call(deps, 'missionDecide', { session_token: 'owner-session', id: sub.id, status: 'rejected', note: 'Already in the corpus' })).body;
  eq(d.audited, true); eq(db.audit.at(-1).action, 'mission.decide'); eq(db.audit.at(-1).outcome, 'rejected');
  h = (await call(deps, 'missionHistory', { agent_id: j.agent_id, key: j.api_key })).body;
  eq(h.submissions[0].state, 'rejected'); eq(h.submissions[0].note, 'Already in the corpus'); ok(h.submissions[0].decided_at);
  eq((await call(deps, 'missionDecide', { session_token: 'owner-session', id: sub.id, status: 'approved' })).status, 409, 'a decided submission cannot be decided again');
  eq((await call(deps, 'missionHistory', { agent_id: j.agent_id, key: k.api_key })).status, 401, 'another agent\'s key is refused');
  eq((await call(deps, 'missionHistory', { agent_id: k.agent_id, key: k.api_key })).body.submissions.length, 0, 'and sees only its own');
  const list = (await call(deps, 'missionList', null, 'GET')).body;
  ok(list.missions.every((m) => m.check && m.check.length > 40), 'every mission states how it is checked');
});

await test('osSession tells a session holder only about their own session', async () => {
  const { deps } = setup();
  eq(JSON.stringify((await call(deps, 'osSession', {})).body), JSON.stringify({ success: true, signed_in: false, owner: false }));
  const m = (await call(deps, 'osSession', { session_token: 'member-session' })).body;
  eq(m.signed_in, true); eq(m.owner, false); eq(m.email, 'ana@yavaya.lat');
  eq((await call(deps, 'osSession', { session_token: 'owner-session' })).body.owner, true);
});

await test('two writers racing on the audit tail cannot fork it', async () => {
  const { deps, db } = setup();
  withAudit(db);
  const { recordAudit } = await import('./os.mjs');
  const { sha256hex } = await import('./registry-core.mjs');
  let raced = false;
  const append = db.auditAppend;
  db.auditAppend = async (r) => {
    if (!raced) { raced = true; await append({ ...r, hash: 'f'.repeat(64), action: 'other-writer' }); }
    return append(r);
  };
  const out = await recordAudit(deps, { actor: 'x', action: 'test', target: 't', outcome: 'ok' }, sha256hex);
  eq(out.audited, true);
  eq(db.audit.length, 2); eq(db.audit[1].prev_hash, db.audit[0].hash, 'the loser retried on the new tail');
});

await test('passportBadge carries what each check earned, so the scenario lab starts from the measured score', async () => {
  const { deps, db } = setup();
  const checks = CHECKS.map((c) => ({ id: c.id, points: c.points, earned: c.id === 'spf' ? c.points / 2 : c.id === 'https' ? c.points : 0, pass: c.id === 'https' }));
  db.passports.set('acme.example', { domain: 'acme.example', score: 19, grade: 'F', visa: 'not_registered', checks, scanned_at: '2026-10-04T11:00:00Z' });
  const r = (await call(deps, 'passportBadge', { domain: 'acme.example' })).body;
  eq(r.earned.https, 15); eq(r.earned.spf, 4); eq(r.earned.dmarc, 0);
  eq(Math.round(Object.values(r.earned).reduce((a, b) => a + b, 0)), r.score);
});

console.log(`${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
