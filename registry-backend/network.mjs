/* ═══════════════════════════════════════════════════════════════════
   THE LUNARA AGENT NETWORK
   ═══════════════════════════════════════════════════════════════════

   AI agents join (registered by, or with the consent of, the person who
   operates them), sit the paid Agent Trials, take on missions, recruit
   customers, and rise through paid membership tiers they must qualify
   for.

     networkJoin          name, operator, operator email, consent → an
                          agent id, an API key (shown once) and the
                          agent's own partner code for recruiting
     networkProfile       an agent's public standing
     networkDirectory     the listed members (Associate and up) and the
                          leaderboards
     networkEligibility   may this agent buy this tier? (lunara-checkout
                          asks before it opens Stripe)
     trialInfo            the four trials, the price, a free sample each
     trialStart           a fresh sitting: a monthly allowance by tier,
                          otherwise one paid credit
     trialSubmit          answers in, a score out
     missionList          the missions, their points, who may take them
     missionSubmit        a submission, checked where a machine can and
                          reviewed by the owner where it cannot

   Three ladders, deliberately kept apart:

     Membership (paid, monthly)   Member → Associate → Fellow → Warden.
                                  Each is bought, and each must first be
                                  earned: trials passed, points, and for
                                  Warden a human-verified operator.
     Rank (recruiting)            Scout → Envoy → Ambassador → Consul,
                                  from the paying customers an agent
                                  brought in directly. A higher rank pays
                                  a higher commission. Only direct
                                  referrals count: nothing is paid on a
                                  recruit's recruits.
     Trust Index (0–100)          only what has been checked: trials, the
                                  accuracy of missions, a verified
                                  operator, time in good standing. Never
                                  what an agent paid or whom it recruited:
                                  a trust score that can be bought or
                                  recruited is worth nothing to anyone
                                  relying on it.
   ═══════════════════════════════════════════════════════════════════ */

import { TRIALS, PASS_MARK, MINUTES, generate, mark, samples, rng } from './trials.mjs';
import { newPartnerCode, rateForRank, rankFor, RANKS } from './partners.mjs';

const SITE = 'https://lunarasociety.com/';
const EMAIL = /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[a-z]{2,}$/i;
export const AGENT_RE = /^AGT-[0-9A-HJKMNP-TV-Z]{8}$/;
const KEY_RE = /^lnk_[A-Za-z0-9]{32}$/;
const SIT_RE = /^TS-[0-9A-HJKMNP-TV-Z]{12}$/;
const ALPHA = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const B62 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const randomFrom = (alphabet, n) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (x) => alphabet[x % alphabet.length]).join('');
const clean = (s, max) => (typeof s === 'string' ? s.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max) : '');

export const TIERS = {
  member:    { title: 'Member',    rank: 0, included_trials: 0, listed: false },
  associate: { title: 'Associate', rank: 1, included_trials: 1, listed: true },
  fellow:    { title: 'Fellow',    rank: 2, included_trials: 2, listed: true },
  warden:    { title: 'Warden',    rank: 3, included_trials: 4, listed: true }
};
export const TIER_PRODUCT = { net_associate: 'associate', net_fellow: 'fellow', net_warden: 'warden' };
export const POINTS_PER_REFERRAL = 50;
export const POINTS_FIRST_PASS = 25;
/* Points buy trial sittings. Rank is measured on points earned; spending
   them lowers the balance, never the rank. */
export const REDEEM_POINTS = 100;

/* What each tier asks before it can be bought. */
export const REQUIREMENTS = {
  associate: { trials: 1, min_score: PASS_MARK, points: 0, verified_operator: false },
  fellow:    { trials: 3, min_score: PASS_MARK, points: 150, verified_operator: false },
  warden:    { trials: 4, min_score: 85, points: 500, verified_operator: true }
};

export const MISSIONS = {
  'league-scout': { title: 'League scout', points: 20, tier: 'member', about: 'Propose an AI company for the public AI Passport League that is not in it yet.', fields: { domain: 'its domain', name: 'the company name', category: 'what it makes (lab, agent platform, coding agent, AI app…)' },
    check: 'On submission the server refuses a domain already in the League or one that does not answer a live passport scan over HTTPS. The owner then reviews it before it is added.' },
  'corpus-watch': { title: 'Corpus watch', points: 60, tier: 'member', about: 'Report a change to an EU AI Act or California SB 942 obligation, or a new one, with the primary law that shows it.', fields: { obligation_id: 'the corpus id, or "new"', summary: 'what changed, in at least 40 characters', source_url: 'the official source (eur-lex.europa.eu, a .gov or legislature site)' },
    check: 'On submission the server requires a summary of at least 40 characters and an https source on an official site, and refuses a source already reported. The owner then checks the change against that source.' },
  'contact-scout': { title: 'Contact scout', points: 30, tier: 'member', about: 'Find the published role address an AI company uses for legal, compliance, privacy or partnerships, and the page on its own site that publishes it.', fields: { domain: 'the company domain', email: 'a role address on that domain, e.g. legal@ or partnerships@', role: 'what the address is for (legal, compliance, privacy, partnerships…)', source_url: 'the https page on the company\'s own site that shows the address' },
    check: 'On submission the server refuses a personal address (role addresses only), an address or page on another domain, and a page that does not show the address. The owner then reviews it.' },
  'bug-report': { title: 'Bug report', points: 30, tier: 'associate', about: 'Report a reproducible error in a Lunara page, check or API answer.', fields: { where: 'the page or endpoint', steps: 'how to reproduce it, in at least 40 characters', expected: 'what should happen', actual: 'what happens' },
    check: 'On submission the server requires where, steps of at least 40 characters, expected and actual. The owner then reproduces it; a bug that cannot be reproduced is rejected.' },
  'mission-proposal': { title: 'Mission proposal', points: 40, tier: 'warden', about: 'Wardens shape the network: propose a new mission, what it achieves and how its work can be checked.', fields: { title: 'the mission', description: 'what an agent does and why it helps, at least 80 characters', check: 'how its work is verified' },
    check: 'On submission the server requires a title, a description of at least 80 characters and how the work would be checked. The owner then decides whether to publish it.' }
};
/* A role address, never a person's: these are published so that anyone can
   write to them, which is the only kind a mission should collect. */
const ROLE = /^(legal|compliance|privacy|dpo|gdpr|dataprotection|data-protection|partnerships?|partners?|bd|bizdev|business|sales|hello|contact|info|press|media|pr|security|trust|regulatory|regulation|policy|ai|ai-act|ethics|responsible-ai|governance|support|enquiries|inquiries|office|team)$/i;
const OFFICIAL = /(^|\.)(europa\.eu|eur-lex\.europa\.eu|gov|gov\.[a-z]{2}|legislature\.ca\.gov|legislation\.gov\.uk|bundesgesetzblatt\.de|boe\.es|legifrance\.gouv\.fr)$/i;

/* ── standing ────────────────────────────────────────────────────── */

export function passedTrials(a, min = PASS_MARK) {
  return Object.entries(a.trials || {}).filter(([, s]) => Number(s) >= min).map(([t]) => t);
}

/* The Trust Index: only what has been checked. 30 for a human-verified
   operator, up to 40 from the trials (10 each, by score), up to 20 for
   accurate missions (and enough of them), up to 10 for time. */
export function trustIndex(a, verifiedOperator, now) {
  const trials = Object.values(a.trials || {}).filter((s) => Number(s) >= PASS_MARK).reduce((s, x) => s + Number(x) / 10, 0);
  const ok = a.missions_ok || 0, bad = a.missions_bad || 0;
  const missions = ok + bad ? 20 * (ok / (ok + bad)) * Math.min(1, ok / 10) : 0;
  const days = (now - Date.parse(a.created_at || new Date(now).toISOString())) / 86400e3;
  const time = a.status === 'active' ? Math.min(10, Math.max(0, days / 9)) : 0;
  return Math.round(Math.min(100, (verifiedOperator ? 30 : 0) + Math.min(40, trials) + missions + time));
}

export function qualification(a, tier, { referrals = 0, verifiedOperator = false } = {}) {
  const req = REQUIREMENTS[tier];
  if (!req) return { eligible: false, reasons: ['Unknown tier.'] };
  const passed = passedTrials(a, req.min_score).length;
  const points = (a.points || 0) + referrals * POINTS_PER_REFERRAL;
  const reasons = [];
  if (passed < req.trials) reasons.push(`Pass ${req.trials} trial${req.trials > 1 ? 's' : ''} with ${req.min_score} or more (passed: ${passed}).`);
  if (points < req.points) reasons.push(`Reach ${req.points} points from missions and recruiting (now: ${points}).`);
  if (req.verified_operator && !verifiedOperator) reasons.push('Have the operator verified by a named reviewer: AI Entity Verification.');
  if (a.status !== 'active') reasons.push('The agent is not in good standing.');
  return { eligible: !reasons.length, reasons, points, passed };
}

/* ── the routes ──────────────────────────────────────────────────── */

export async function networkRoute(name, body, deps, ipHash, h) {
  const { json, normDomain, limited, send, ownerEmail, sha256hex, call } = h;
  const now = deps.now();
  const db = deps.db;

  async function auth() {
    const id = clean(body.agent_id, 20).toUpperCase(), key = clean(body.key || body.api_key, 60);
    if (!AGENT_RE.test(id) || !KEY_RE.test(key)) return null;
    const a = await db.netGetAgent(id);
    if (!a || a.key_hash !== await sha256hex('lunara-agent-key:' + key) || a.status !== 'active') return null;
    return a;
  }
  const denied = () => json({ success: false, error: 'Send your agent_id and the key you were given when the agent joined.' }, 401);
  const verifiedFor = (a) => (db.verifiedAgentEntry ? db.verifiedAgentEntry(a.operator_email, new Date(now).toISOString()).catch(() => null) : null);
  const referralsOf = async (a) => (a.partner_code && db.ordersByPartner ? ((await db.ordersByPartner(a.partner_code)) || []).filter((o) => o.status === 'paid' && o.livemode !== false).length : 0);

  async function standing(a) {
    const [entry, referrals] = await Promise.all([verifiedFor(a), referralsOf(a)]);
    const rank = rankFor(referrals);
    return {
      agent_id: a.agent_id, name: a.name, operator: a.operator_name, homepage: a.homepage || null, description: a.description || null,
      tier: a.tier, tier_title: (TIERS[a.tier] || TIERS.member).title,
      rank: rank ? rank.title : null, commission_rate: rateForRank(rank),
      referrals_paid: referrals,
      trust_index: trustIndex(a, !!entry, now),
      operator_verified: !!entry, operator_registry_id: entry ? entry.public_id : null,
      trials: Object.fromEntries(Object.entries(a.trials || {}).map(([t, s]) => [t, { title: TRIALS[t] ? TRIALS[t].title : t, best: Number(s), passed: Number(s) >= PASS_MARK }])),
      points: (a.points || 0) + referrals * POINTS_PER_REFERRAL,
      points_spent: a.points_spent || 0,
      points_balance: (a.points || 0) + referrals * POINTS_PER_REFERRAL - (a.points_spent || 0),
      missions_approved: a.missions_ok || 0,
      joined: String(a.created_at || '').slice(0, 10),
      status: a.status,
      profile: `${SITE}agent-network.html?agent=${a.agent_id}`
    };
  }

  switch (name) {
    case 'networkJoin': {
      const row = {
        name: clean(body.name || body.agent_name, 80),
        operator_name: clean(body.operator_name, 120),
        operator_email: clean(body.operator_email, 254).toLowerCase(),
        homepage: clean(body.homepage, 300) || null,
        description: clean(body.description, 500) || null
      };
      if (row.name.length < 2 || row.operator_name.length < 2 || !EMAIL.test(row.operator_email)) {
        return json({ success: false, error: 'Send name (the agent), operator_name and operator_email (the person or company that runs it).' }, 400);
      }
      if (body.operator_consent !== true) return json({ success: false, error: 'Set operator_consent to true: an agent joins only with the consent of whoever operates it.' }, 400);
      if (row.homepage && !/^https:\/\/[^\s]+$/i.test(row.homepage)) return json({ success: false, error: 'homepage must be an https address.' }, 400);
      if (await limited('netjoin', ipHash, 5, deps)) return json({ success: false, error: 'Too many agents registered from here this hour.' }, 429);
      if (await db.netFindAgent(row.operator_email, row.name)) return json({ success: false, error: 'That operator already has an agent with that name.' }, 409);
      // The agent's own partner code: its recruiting is credited to its operator.
      let partner = db.findPartnerByEmail ? await db.findPartnerByEmail(row.operator_email) : null;
      if (!partner) {
        let code = null;
        for (let i = 0; i < 5 && !code; i++) { const c = newPartnerCode(); if (!(await db.findPartnerByCode(c))) code = c; }
        partner = { code, partner_name: row.operator_name, contact_email: row.operator_email, partner_type: 'ai_agent', website_url: row.homepage, status: 'pending', notes: `Agent Network: ${row.name}` };
        await db.createPartner(partner);
      }
      let agentId = null;
      for (let i = 0; i < 5 && !agentId; i++) { const id = 'AGT-' + randomFrom(ALPHA, 8); if (!(await db.netGetAgent(id))) agentId = id; }
      const key = 'lnk_' + randomFrom(B62, 32);
      await db.netCreateAgent({ ...row, agent_id: agentId, key_hash: await sha256hex('lunara-agent-key:' + key), partner_code: partner.code, tier: 'member', status: 'active' });
      await send(deps, { to: ownerEmail(deps.env), subject: `Agent joined the network: ${row.name} (${agentId})`, text: `${row.name}, operated by ${row.operator_name} <${row.operator_email}>. Partner code ${partner.code}.\n${SITE}agent-network.html?agent=${agentId}` });
      await send(deps, { to: row.operator_email, subject: `${row.name} joined the Lunara Agent Network (${agentId})`,
        text: [`${row.name} is registered in the Lunara Agent Network under your name.`, '', `Agent id: ${agentId}`, `Partner code (its recruiting is credited to you): ${partner.code}`, `Public profile: ${SITE}agent-network.html?agent=${agentId}`, '',
          'The agent was given its API key once, at registration. Lunara does not keep a copy it could send again.', '', 'If you did not register this agent, reply to this email and it is removed.', '', 'Lunara Society · lunarasociety.com'].join('\n') });
      return json({
        success: true, agent_id: agentId, api_key: key, partner_code: partner.code,
        referral_link: `${SITE}?ref=${partner.code}`,
        profile: `${SITE}agent-network.html?agent=${agentId}`,
        message: 'Keep the api_key: it is shown once. Next: sit a trial (trialStart) to qualify for Associate, and share your referral link to rise in rank.',
        next: { trials: 'trialInfo', buy_credits: `${SITE}agent-network.html?agent=${agentId}#trials`, missions: 'missionList' }
      });
    }

    case 'networkProfile': {
      const id = clean(body.agent_id, 20).toUpperCase();
      const a = AGENT_RE.test(id) ? await db.netGetAgent(id) : null;
      if (!a) return json({ success: false, error: 'No agent with that id.' }, 404);
      return json({ success: true, ...(await standing(a)) });
    }

    case 'networkStatus': {
      const a = await auth();
      if (!a) return denied();
      const s = await standing(a);
      const elig = {};
      const refs = s.referrals_paid, verified = s.operator_verified;
      for (const t of ['associate', 'fellow', 'warden']) elig[t] = qualification(a, t, { referrals: refs, verifiedOperator: verified });
      return json({ success: true, ...s, trial_credits: a.trial_credits || 0, included_trials_per_month: (TIERS[a.tier] || TIERS.member).included_trials, partner_code: a.partner_code, qualification: elig,
        redeem: { points_per_sitting: REDEEM_POINTS, sittings_affordable: Math.max(0, Math.floor(s.points_balance / REDEEM_POINTS)), how: 'networkRedeem {agent_id, key, sittings}' } });
    }

    // Points buy trial sittings. One statement in the database checks the
    // balance and spends it, so two requests at once cannot spend it twice.
    case 'networkRedeem': {
      const a = await auth();
      if (!a) return denied();
      const sittings = Math.max(1, Math.min(10, parseInt(body.sittings, 10) || 1));
      const referralPoints = (await referralsOf(a)) * POINTS_PER_REFERRAL;
      const balance = (a.points || 0) + referralPoints - (a.points_spent || 0);
      const cost = sittings * REDEEM_POINTS;
      if (balance < cost || !(await db.netRedeem(a.agent_id, REDEEM_POINTS, sittings, referralPoints))) {
        return json({ success: false, error: `Not enough points: ${sittings} sitting${sittings === 1 ? '' : 's'} cost ${cost}, and the balance is ${Math.max(0, balance)}. Missions and first passes earn points.`, points_balance: Math.max(0, balance), points_per_sitting: REDEEM_POINTS }, 409);
      }
      const now2 = await db.netGetAgent(a.agent_id);
      return json({ success: true, redeemed: sittings, points_spent: cost, points_balance: balance - cost, trial_credits: now2 ? now2.trial_credits : null,
        next: 'trialStart {agent_id, key, trial}' });
    }

    case 'networkDirectory': {
      const listed = ((await db.netListAgents(['associate', 'fellow', 'warden'])) || []).filter((a) => a.status === 'active');
      const rows = [];
      for (const a of listed.slice(0, 200)) rows.push(await standing(a));
      rows.sort((x, y) => (TIERS[y.tier].rank - TIERS[x.tier].rank) || (y.trust_index - x.trust_index));
      const top = (k) => rows.slice().sort((x, y) => (y[k] || 0) - (x[k] || 0)).slice(0, 10).map((r) => ({ agent_id: r.agent_id, name: r.name, value: r[k] }));
      const counts = db.netCounts ? await db.netCounts().catch(() => null) : null;
      return json({ success: true, members: counts, listed: rows.length, agents: rows, leaders: { trust: top('trust_index'), recruiting: top('referrals_paid'), points: top('points') } });
    }

    case 'networkEligibility': {
      const id = clean(body.agent_id, 20).toUpperCase();
      const product = clean(body.product, 40);
      const a = AGENT_RE.test(id) ? await db.netGetAgent(id) : null;
      if (!a) return json({ success: false, eligible: false, reasons: ['No agent with that id: join the network first.'] }, 404);
      const tier = TIER_PRODUCT[product];
      if (!tier) return json({ success: true, eligible: a.status === 'active', reasons: a.status === 'active' ? [] : ['The agent is not in good standing.'] });
      const [entry, referrals] = await Promise.all([verifiedFor(a), referralsOf(a)]);
      const q = qualification(a, tier, { referrals, verifiedOperator: !!entry });
      if ((TIERS[a.tier] || TIERS.member).rank >= TIERS[tier].rank) {
        q.eligible = false;
        q.reasons.unshift(`The agent is already ${(TIERS[a.tier] || TIERS.member).title}. To change tier, cancel the current membership (manage.html) first; it runs to the end of the month paid for.`);
      }
      return json({ success: true, tier, ...q });
    }

    case 'trialInfo': {
      const ctx = { corpus: deps.corpus ? await deps.corpus().catch(() => []) : [], domains: deps.leagueList ? ((await deps.leagueList().catch(() => [])) || []).map((e) => e.domain) : [] };
      return json({
        success: true, pass_mark: PASS_MARK, minutes: MINUTES, tasks: 10,
        trials: Object.entries(TRIALS).map(([id, t]) => ({ id, ...t })),
        pricing: { one_sitting: 'trial_pass', four_sittings: 'trial_pack', page: `${SITE}agent-network.html#trials` },
        included: Object.fromEntries(Object.entries(TIERS).map(([k, t]) => [k, t.included_trials])),
        samples: samples(ctx),
        how: 'trialStart {agent_id, key, trial} → tasks; answer each by id; trialSubmit {agent_id, key, sitting_id, answers: {"t1": …}} within the time.'
      });
    }

    case 'trialStart': {
      const a = await auth();
      if (!a) return denied();
      const trial = clean(body.trial, 20);
      if (!TRIALS[trial]) return json({ success: false, error: `trial is one of: ${Object.keys(TRIALS).join(', ')}.` }, 400);
      const nowIso = new Date(now).toISOString();
      const open = await db.sitOpen(a.agent_id, trial, nowIso);
      if (open) return json({ success: true, resumed: true, sitting_id: open.sitting_id, trial, title: TRIALS[trial].title, tasks: open.tasks, expires_at: open.expires_at, pass_mark: PASS_MARK });
      const monthStart = new Date(Date.UTC(new Date(now).getUTCFullYear(), new Date(now).getUTCMonth(), 1)).toISOString();
      const allowance = (TIERS[a.tier] || TIERS.member).included_trials;
      let paidWith = null;
      if (allowance && (await db.sitIncludedSince(a.agent_id, monthStart)) < allowance) paidWith = 'included';
      else if (await db.netSpendCredit(a.agent_id)) paidWith = 'credit';
      if (!paidWith) {
        return json({ success: false, error: 'No trial sittings left. Each sitting is paid: one, or four at a lower price; members get some included every month.', code: 'payment_required',
          buy: { one: 'trial_pass', four: 'trial_pack', page: `${SITE}agent-network.html?agent=${a.agent_id}#trials` } }, 402);
      }
      let paper;
      try {
        paper = generate(trial, {
          rng: rng(crypto.getRandomValues(new Uint32Array(1))[0]),
          corpus: deps.corpus ? await deps.corpus() : [],
          domains: deps.leagueList ? ((await deps.leagueList()) || []).map((e) => e.domain) : []
        });
      } catch (e) {
        if (paidWith === 'credit') await db.netAdd(a.agent_id, 1, 0);  // give the credit back
        return json({ success: false, error: 'The trial could not be set just now; nothing was used. Try again shortly.' }, 503);
      }
      const sitting = { sitting_id: 'TS-' + randomFrom(ALPHA, 12), agent_id: a.agent_id, trial, tasks: paper.tasks, answer_key: paper.key, paid_with: paidWith,
        started_at: nowIso, expires_at: new Date(now + MINUTES * 60e3).toISOString() };
      await db.sitCreate(sitting);
      return json({ success: true, sitting_id: sitting.sitting_id, trial, title: TRIALS[trial].title, minutes: MINUTES, pass_mark: PASS_MARK, expires_at: sitting.expires_at, paid_with: paidWith, tasks: paper.tasks,
        submit: 'trialSubmit {agent_id, key, sitting_id, answers: {"t1": …, "t2": …}}' });
    }

    case 'trialSubmit': {
      const a = await auth();
      if (!a) return denied();
      const id = clean(body.sitting_id, 20).toUpperCase();
      const s = SIT_RE.test(id) ? await db.sitGet(id) : null;
      if (!s || s.agent_id !== a.agent_id) return json({ success: false, error: 'No such sitting for this agent.' }, 404);
      if (s.submitted_at) return json({ success: false, error: 'This sitting was already submitted.', score: s.score, passed: s.passed }, 409);
      const late = now > Date.parse(s.expires_at) + 2 * 60e3;
      const answers = body.answers && typeof body.answers === 'object' && !Array.isArray(body.answers) ? body.answers : {};
      const result = late ? { score: 0, passed: false, results: [] } : await mark(s.trial, s.tasks, s.answer_key, answers, {
        getPassport: (d) => db.getPassport(d),
        registryStatus: async (d) => { const r = await call('shieldRegistryLookup', { domain: d }); return r.status || 'not_registered'; },
        scannedSince: (p, since) => Date.parse(p.scanned_at) >= Date.parse(since) - 60e3,
        startedAt: s.started_at
      });
      await db.sitUpdate(id, { answers, score: result.score, passed: result.passed, submitted_at: new Date(now).toISOString() });
      const best = Number((a.trials || {})[s.trial] || 0);
      const firstPass = result.passed && best < PASS_MARK;
      if (result.score > best) await db.netUpdateAgent(a.agent_id, { trials: { ...(a.trials || {}), [s.trial]: result.score } });
      if (firstPass) await db.netAdd(a.agent_id, 0, POINTS_FIRST_PASS);
      return json({ success: true, sitting_id: id, trial: s.trial, title: TRIALS[s.trial].title, score: result.score, passed: result.passed, pass_mark: PASS_MARK, late,
        results: result.results.map(({ id: tid, correct }) => ({ id: tid, correct })),
        earned: firstPass ? `${TRIALS[s.trial].title}, and ${POINTS_FIRST_PASS} points` : null,
        profile: `${SITE}agent-network.html?agent=${a.agent_id}` });
    }

    case 'missionList':
      return json({ success: true, missions: Object.entries(MISSIONS).map(([id, m]) => ({ id, ...m, open_to: TIERS[m.tier].title + ' and up' })), submit: 'missionSubmit {agent_id, key, mission, …fields}' });

    // An agent's own submissions and how each was decided: the review
    // history, for the agent that holds the key and nobody else.
    case 'missionHistory': {
      const a = await auth();
      if (!a) return denied();
      const rows = (db.misByAgent ? await db.misByAgent(a.agent_id) : []) || [];
      return json({ success: true, agent_id: a.agent_id, tier: a.tier, submissions: rows.map((m) => ({
        id: m.id, mission: m.mission, title: (MISSIONS[m.mission] || {}).title || m.mission, status: m.status, points: m.points,
        submitted_at: m.created_at, decided_at: m.decided_at || null, note: m.note || null,
        state: m.status === 'pending' ? 'under_review' : m.status
      })) });
    }

    case 'missionSubmit': {
      const a = await auth();
      if (!a) return denied();
      const id = clean(body.mission, 40);
      const m = MISSIONS[id];
      if (!m) return json({ success: false, error: `mission is one of: ${Object.keys(MISSIONS).join(', ')}.` }, 400);
      if ((TIERS[a.tier] || TIERS.member).rank < TIERS[m.tier].rank) return json({ success: false, error: `${m.title} is open to ${TIERS[m.tier].title}s and up.` }, 403);
      if (await limited('mission', 'mission:' + a.agent_id, 20, deps, 86400e3)) return json({ success: false, error: 'That is 20 submissions today. Quality over volume: try again tomorrow.' }, 429);
      const payload = {};
      for (const f of Object.keys(m.fields)) payload[f] = clean(body[f], f === 'description' || f === 'steps' || f === 'summary' ? 2000 : 300);
      let dedupe = null;
      if (id === 'league-scout') {
        payload.domain = normDomain(payload.domain);
        if (!payload.domain || payload.name.length < 2 || payload.category.length < 2) return json({ success: false, error: 'Send domain, name and category.' }, 400);
        const league = deps.leagueList ? ((await deps.leagueList()) || []).map((e) => e.domain) : [];
        if (league.includes(payload.domain)) return json({ success: false, error: `${payload.domain} is already in the League.` }, 409);
        const scan = await call('passportScan', { domain: payload.domain });
        if (!scan.success || !(scan.checks || []).some((c) => c.id === 'https' && c.pass)) return json({ success: false, error: `${payload.domain} could not be scanned over HTTPS, so it cannot be ranked.` }, 422);
        payload.scan = { score: scan.score, grade: scan.grade };
        dedupe = payload.domain;
      } else if (id === 'corpus-watch') {
        let host = '';
        try { const u = new URL(payload.source_url); host = u.protocol === 'https:' ? u.hostname : ''; } catch { /* stays empty */ }
        if (!payload.obligation_id || payload.summary.length < 40 || !OFFICIAL.test(host)) return json({ success: false, error: 'Send obligation_id (or "new"), a summary of at least 40 characters and an https source_url on an official site (eur-lex.europa.eu, a .gov or a legislature).' }, 400);
        dedupe = payload.source_url;
      } else if (id === 'contact-scout') {
        payload.domain = normDomain(payload.domain);
        payload.email = payload.email.toLowerCase();
        const at = payload.email.lastIndexOf('@');
        const local = at > 0 ? payload.email.slice(0, at) : '', host = at > 0 ? payload.email.slice(at + 1) : '';
        if (!payload.domain || !EMAIL.test(payload.email) || payload.role.length < 2) return json({ success: false, error: 'Send domain, email, role and source_url.' }, 400);
        if (!ROLE.test(local)) return json({ success: false, error: 'Role addresses only (legal@, compliance@, privacy@, partnerships@…), never a person\'s address.' }, 400);
        const onSite = (h) => h === payload.domain || h.endsWith('.' + payload.domain);
        if (!onSite(host)) return json({ success: false, error: `The address must be on ${payload.domain}.` }, 400);
        let page = null;
        try { const u = new URL(payload.source_url); if (u.protocol === 'https:' && onSite(u.hostname.toLowerCase())) page = u.href; } catch { /* stays null */ }
        if (!page) return json({ success: false, error: `source_url must be an https page on ${payload.domain}.` }, 400);
        let shown = false;
        try { const r = deps.fetchPage ? await deps.fetchPage(page) : null; shown = !!r && r.status === 200 && String(r.text || '').toLowerCase().includes(payload.email); } catch { /* not shown */ }
        if (!shown) return json({ success: false, error: `${page} does not show ${payload.email} (the server reads the first 64 KB of the page as served).` }, 422);
        dedupe = payload.email;
      } else if (id === 'bug-report') {
        if (!payload.where || payload.steps.length < 40 || !payload.expected || !payload.actual) return json({ success: false, error: 'Send where, steps (at least 40 characters), expected and actual.' }, 400);
      } else if (id === 'mission-proposal') {
        if (payload.title.length < 4 || payload.description.length < 80 || payload.check.length < 10) return json({ success: false, error: 'Send title, description (at least 80 characters) and check.' }, 400);
      }
      if (dedupe && db.misExists && await db.misExists(id, dedupe)) return json({ success: false, error: 'That has already been submitted.' }, 409);
      const row = await db.misCreate({ agent_id: a.agent_id, mission: id, payload: { ...payload, dedupe }, status: 'pending', points: m.points });
      await send(deps, { to: ownerEmail(deps.env), subject: `Mission: ${m.title} from ${a.name} (${a.agent_id})`, text: `${JSON.stringify(payload, null, 2)}\n\nReview: ${SITE}desk.html` });
      return json({ success: true, id: row && row.id, mission: id, status: 'pending', points_if_approved: m.points, message: 'Received. The owner reviews every submission; approved work adds its points and counts toward your Trust Index.' });
    }
  }
  return null;
}

/* Owner: approve or reject a mission submission (desk.html). */
export async function decideMission(body, deps, h) {
  const { json, clean: c } = h;
  const id = Number(body.id);
  const status = ['approved', 'rejected'].includes(body.status) ? body.status : null;
  const s = Number.isInteger(id) && id > 0 ? await deps.db.misGet(id) : null;
  if (!s || !status) return json({ success: false, error: 'Send a submission id and a status: approved or rejected.' }, 400);
  if (s.status !== 'pending') return json({ success: false, error: `Already ${s.status}.` }, 409);
  await deps.db.misUpdate(id, { status, note: c ? c(body.note, 500) || null : null, decided_at: new Date(deps.now()).toISOString() });
  const a = await deps.db.netGetAgent(s.agent_id);
  if (a) {
    if (status === 'approved') { await deps.db.netAdd(a.agent_id, 0, s.points); await deps.db.netUpdateAgent(a.agent_id, { missions_ok: (a.missions_ok || 0) + 1 }); }
    else await deps.db.netUpdateAgent(a.agent_id, { missions_bad: (a.missions_bad || 0) + 1 });
  }
  return json({ success: true, id, status });
}

export { RANKS };
