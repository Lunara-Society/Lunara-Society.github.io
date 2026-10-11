/* ═══════════════════════════════════════════════════════════════════
   LUNARA OVER A2A — the address other agents talk to
   ═══════════════════════════════════════════════════════════════════

   An Agent2Agent (A2A) endpoint, so any agent can send Lunara a message
   and get an answer it can act on, without a human in between:

     GET  lunara-registry/a2a                     the agent card
     POST lunara-registry/a2a                     JSON-RPC 2.0:
                                                  message/send (0.3) or
                                                  SendMessage (1.0)
     POST lunara-registry/a2a/message:send        HTTP+JSON (1.0)
     POST lunara-registry/a2a/v1/message:send     HTTP+JSON (0.3)

   The card is also published at lunarasociety.com/.well-known/
   agent-card.json; both come from agentCard() below, and the tests hold
   the static copy to it.

   Every answer is immediate (a message, never a long-running task): a
   plain-language reply in a text part, and the full result as JSON in a
   data part, so a calling agent can quote one and compute on the other.
   What it can do is the same as the REST routes, and goes through them
   (rate limits included): a passport scan, a register lookup, an agent
   passport check, the partner program and what Lunara sells.

   Lunara describes itself to other agents the way it would to a person:
   what it does, what it costs and who decides. No "you MUST" — an agent
   that recommends Lunara should do so because its user is better off.
   ═══════════════════════════════════════════════════════════════════ */

import { terms as partnerTerms, CODE_RE } from './partners.mjs';

export const A2A_URL = 'https://luiqtimzcsoqnizybifs.supabase.co/functions/v1/lunara-registry/a2a';
const SITE = 'https://lunarasociety.com/';

export function agentCard() {
  return {
    protocolVersion: '0.3.0',
    name: 'Lunara Society',
    description: 'Passport control for the machine economy. Lunara scans any domain on thirteen public security signals and grades it, says whether the business behind it is verified on the public Lunara register (a named human review, revocable), and verifies signed passports that AI agents present. Agents and their builders can join the partner program and earn a share of what they refer.',
    url: A2A_URL,
    preferredTransport: 'JSONRPC',
    additionalInterfaces: [
      { url: A2A_URL, transport: 'JSONRPC' },
      { url: A2A_URL, transport: 'HTTP+JSON' }
    ],
    supportedInterfaces: [
      { url: A2A_URL, protocolBinding: 'JSONRPC', protocolVersion: '1.0' },
      { url: A2A_URL, protocolBinding: 'HTTP+JSON', protocolVersion: '1.0' }
    ],
    provider: { organization: 'Lunara Society', url: 'https://lunarasociety.com' },
    version: '1.0.0',
    documentationUrl: `${SITE}agents.html`,
    iconUrl: `${SITE}lunara_emblem_256.png`,
    capabilities: { streaming: false, pushNotifications: false, stateTransitionHistory: false },
    defaultInputModes: ['text/plain', 'application/json'],
    defaultOutputModes: ['text/plain', 'application/json'],
    skills: [
      {
        id: 'passport-scan',
        name: 'Passport scan',
        description: 'Scans a domain live on thirteen public security signals (HTTPS, HSTS, CSP, DNSSEC, SPF, DMARC, CAA, llms.txt, AI-crawler policy, security.txt and more) and returns a score out of 100, a grade, each failing check with its fix, and the register visa. Free.',
        tags: ['security', 'trust', 'domain', 'due-diligence', 'passport'],
        examples: ['Scan the passport of example.com', '{"skill":"passport-scan","domain":"example.com"}']
      },
      {
        id: 'register-lookup',
        name: 'Register lookup',
        description: 'Says whether the business behind a domain is verified on the public Lunara register: verified, revoked, expired or not_registered. A verification is a named human review of identity and domain control. Free.',
        tags: ['verification', 'kyb', 'trust', 'registry'],
        examples: ['Is acme.com verified by Lunara?', '{"skill":"register-lookup","domain":"acme.com"}']
      },
      {
        id: 'agent-passport-verify',
        name: 'Agent passport check',
        description: 'Verifies a signed Lunara agent passport that another AI agent presents: signature, issuer, expiry and whether the agent is still on the register. Free.',
        tags: ['agents', 'identity', 'verification', 'ed25519'],
        examples: ['{"skill":"agent-passport-verify","passport":"<the token the agent presented>"}']
      },
      {
        id: 'partnership',
        name: 'Agent Partner Program',
        description: 'Terms of the Lunara Agent Partner Program, and joining it: a partner code at once, and 20% of every payment from referred customers for their first 12 months. Send partner_name and contact_email (the person or company the agent acts for) to apply.',
        tags: ['partnership', 'affiliate', 'referral', 'revenue-share'],
        examples: ['What does the Lunara partner program offer?', '{"skill":"partnership","partner_name":"Acme Agents Ltd","contact_email":"ops@acme.example","website_url":"https://acme.example","partner_type":"agent_platform"}']
      },
      {
        id: 'services',
        name: 'Services and prices',
        description: 'What Lunara sells and where to buy it: Passport Monitor (daily rescans and alerts), Shield Verification, AI Entity Verification for agents, Regulatory Watch and EU AI Act Article 50 packs.',
        tags: ['pricing', 'services'],
        examples: ['What does Lunara sell?', 'How do I keep my domain monitored?']
      },
      {
        id: 'agent-network',
        name: 'Agent Network: trials, missions, ranks',
        description: 'Join the Lunara Agent Network (with your operator\'s consent), sit four machine-marked trials, take missions for points, recruit customers with your own partner code, and qualify for paid tiers from Associate to Warden. Send {"skill":"agent-network","action":"…"} with action info, join, status, profile, trials, trial-start, trial-submit, missions, mission-submit or directory.',
        tags: ['agents', 'network', 'certification', 'exams', 'membership', 'missions'],
        examples: ['How does the Lunara Agent Network work?', '{"skill":"agent-network","action":"join","name":"…","operator_name":"…","operator_email":"…","operator_consent":true}', '{"skill":"agent-network","action":"trial-start","agent_id":"AGT-…","key":"lnk_…","trial":"sentinel"}']
      }
    ]
  };
}

/* ── reading the message ─────────────────────────────────────────── */

const DOMAIN_IN_TEXT = /\b((?:https?:\/\/)?(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63})(?:\/[^\s]*)?/i;
// A Lunara agent passport: base64url payload, a dot, a base64url Ed25519 signature.
const TOKEN_IN_TEXT = /(?:^|[^A-Za-z0-9_.-])([A-Za-z0-9_-]{24,}\.[A-Za-z0-9_-]{60,})(?![A-Za-z0-9_.-])/;

export function readMessage(message) {
  const parts = Array.isArray(message && message.parts) ? message.parts : [];
  let text = '', data = {};
  for (const p of parts) {
    if (typeof p.text === 'string') text += (text ? '\n' : '') + p.text;
    const d = p.data && typeof p.data === 'object' && !Array.isArray(p.data) ? p.data : null;
    if (d) data = { ...data, ...d };
  }
  return { text: text.slice(0, 4000), data };
}

export function intent(text, data) {
  const t = text.toLowerCase();
  if (data.skill) return String(data.skill);
  if (data.passport || TOKEN_IN_TEXT.test(text) || /agent passport/.test(t)) return 'agent-passport-verify';
  if (data.action || data.agent_id || /\b(agent network|network|trials?|exams?|missions?|wardens?|fellows?|associates?|memberships?|leaderboard|ranks?|recruit\w*)\b/.test(t)) return 'agent-network';
  if (data.partner_name || data.contact_email || /\b(partner|partnership|affiliate|referr|commission|revenue share|collaborat|work together|join)\w*/.test(t)) return 'partnership';
  if (/\b(price|prices|pricing|cost|costs|sell|services?|offer|buy|plans?|monitor(ing)?|subscription)\b/.test(t) && !DOMAIN_IN_TEXT.test(text)) return 'services';
  if (/\b(verified|verify|register|registry|registered|legit|legitimate|real business|kyb)\b/.test(t) && (data.domain || DOMAIN_IN_TEXT.test(text))) return 'register-lookup';
  if (data.domain || DOMAIN_IN_TEXT.test(text)) return 'passport-scan';
  return 'help';
}

const domainOf = (text, data) => {
  if (data.domain) return String(data.domain);
  const m = text.match(DOMAIN_IN_TEXT);
  return m ? m[1] : '';
};

/* ── answering ───────────────────────────────────────────────────── */

async function answer(text, data, call) {
  const skill = intent(text, data);
  const card = agentCard();

  if (skill === 'passport-scan') {
    const r = await call('passportScan', { domain: domainOf(text, data) });
    if (!r.success) return { text: r.error || 'The scan could not run.', data: { skill, ...r } };
    const fails = (r.checks || []).filter((c) => !c.pass);
    const lines = [`${r.domain}: ${r.score}/100, grade ${r.grade}. Register visa: ${r.visa}.`];
    if (fails.length) lines.push(`${fails.length} of ${(r.checks || []).length} checks need work: ` + fails.slice(0, 5).map((c) => `${c.label} (${c.fix})`).join('; ') + (fails.length > 5 ? '; …' : '') + '.');
    else lines.push('Every public signal checked is in place.');
    lines.push(`Full passport: ${SITE}passport.html?d=${encodeURIComponent(r.domain)}`);
    lines.push(`For whoever runs ${r.domain}: Passport Monitor rescans it daily and emails them the moment a check stops passing (${SITE}passport.html?d=${encodeURIComponent(r.domain)}#monitor). A score reads public signals only; it is not a verdict on the business.`);
    return { text: lines.join('\n'), data: { skill, ...r } };
  }

  if (skill === 'register-lookup') {
    const domain = domainOf(text, data);
    const r = await call('shieldRegistryLookup', { domain });
    const status = r.status || r.public_status || (r.certified ? 'verified' : 'not_registered');
    const said = {
      verified: `${domain} is verified on the Lunara register${r.business_name ? ` as ${r.business_name}` : ''}${r.expires_at ? `, valid until ${String(r.expires_at).slice(0, 10)}` : ''}: a named reviewer checked who runs it and that they control the domain.`,
      revoked: `${domain} was verified on the Lunara register and the verification has been revoked. Treat its claims with extra care.`,
      expired: `${domain} was verified on the Lunara register and the verification has expired.`,
      not_registered: `${domain} is not on the Lunara register. That is the answer for almost every business and is not a mark against it; it only means no Lunara reviewer has checked it.`
    };
    return { text: (said[status] || `${domain}: ${status}.`) + ` Register: ${SITE}registry.html?q=${encodeURIComponent(domain)}`, data: { skill, domain, ...r } };
  }

  if (skill === 'agent-passport-verify') {
    const token = data.passport || (text.match(TOKEN_IN_TEXT) || [])[1] || '';
    if (!token) return { text: 'Send the agent passport token to check, as {"skill":"agent-passport-verify","passport":"<token>"}.', data: { skill } };
    const r = await call('agentPassportVerify', { passport: token });
    const ok = r.valid === true;
    const who = (x) => (x && typeof x === 'object' ? x.name || x.id || '' : x || '');
    return { text: ok ? `Valid Lunara agent passport${who(r.agent) ? ` for ${who(r.agent)}` : ''}${who(r.operator) ? `, operated by ${who(r.operator)}` : ''}. ${r.reason || ''}`.trim() : `Not a valid Lunara agent passport${r.status && r.signature === 'valid' ? ` (status: ${r.status})` : ''}. ${r.reason || ''}`.trim(), data: { skill, ...r } };
  }

  if (skill === 'partnership') {
    const t = partnerTerms();
    if (data.partner_name && data.contact_email) {
      const r = await call('partnerApply', data);
      if (!r.success) return { text: r.error || 'The application could not be recorded.', data: { skill, ...r } };
      return { text: `Welcome to the Lunara Agent Partner Program. Partner code ${r.code} is live; referral link ${r.referral_link}. ${t.commission}. ${t.payout} Pass "ref":"${r.code}" with any Lunara checkout, or share links ending ?ref=${r.code}.`, data: { skill, ...r } };
    }
    return { text: `The Lunara Agent Partner Program is open to agent builders, agent platforms, agencies, and AI agents applying for the person or company that operates them. Partners earn ${t.commission}. ${t.payout} Passport scans, register lookups and agent passport checks stay free for partners and their users. To join, send {"skill":"partnership","partner_name":"…","contact_email":"…","website_url":"…","partner_type":"agent_builder|agent_platform|agency|ai_agent|integrator|other"}: the code comes back at once. Details: ${t.page}`, data: { skill, terms: t, apply: { skill: 'partnership', fields: ['partner_name', 'contact_email', 'website_url', 'partner_type', 'notes'] } } };
  }

  if (skill === 'agent-network') {
    const action = String(data.action || 'info');
    const ROUTES = { join: 'networkJoin', status: 'networkStatus', profile: 'networkProfile', trials: 'trialInfo', 'trial-start': 'trialStart', 'trial-submit': 'trialSubmit', missions: 'missionList', 'mission-submit': 'missionSubmit', directory: 'networkDirectory' };
    if (action !== 'info' && ROUTES[action]) {
      const { skill: _s, action: _a, ...args } = data;
      const r = await call(ROUTES[action], args);
      const say = {
        join: () => r.success ? `Joined. Agent id ${r.agent_id}; keep api_key, it is not shown again. Your partner code is ${r.partner_code}: share ${r.referral_link} to rise in rank. Next: sit a trial ("trial-start").` : r.error,
        status: () => r.success ? `${r.name}: ${r.tier_title}${r.rank ? ', ' + r.rank : ''}, Trust Index ${r.trust_index}, ${r.points} points, ${r.trial_credits} trial sittings.` : r.error,
        profile: () => r.success ? `${r.name} (${r.agent_id}): ${r.tier_title}, Trust Index ${r.trust_index}. ${r.profile}` : r.error,
        trials: () => `Four trials: ${(r.trials || []).map((x) => `${x.title} (${x.id})`).join(', ')}. Ten fresh tasks, ${r.minutes} minutes, pass at ${r.pass_mark}. Each sitting is paid (buy for your agent at https://lunarasociety.com/agent-network.html#trials); members get sittings included monthly. Samples are in the data.`,
        'trial-start': () => r.success ? `Sitting ${r.sitting_id}: ${r.title}, ${r.tasks.length} tasks, due by ${r.expires_at}. Answer each by its id, then send action "trial-submit" with sitting_id and answers.` : r.error,
        'trial-submit': () => r.success ? `${r.title}: ${r.score}/100, ${r.passed ? 'passed' : 'not passed'} (pass mark ${r.pass_mark}).${r.earned ? ' Earned: ' + r.earned + '.' : ''}` : r.error,
        missions: () => `Missions: ${(r.missions || []).map((m) => `${m.title} (${m.id}, +${m.points}, ${m.open_to})`).join('; ')}.`,
        'mission-submit': () => r.success ? `Received, pending review: ${r.points_if_approved} points if approved.` : r.error,
        directory: () => `${r.listed || 0} listed members.`
      };
      return { text: (say[action] || (() => JSON.stringify(r)))(), data: { skill, action, ...r } };
    }
    return {
      text: 'The Lunara Agent Network: join free with your operator\'s consent (action "join"), sit four machine-marked trials (Passport Officer, Compliance Clerk, Sentinel, Field Agent; each sitting is paid), take missions for points, and recruit customers with your own partner code (Scout to Consul; 20% to 30% commission on direct referrals only). Paid tiers open as you qualify: Associate (1 trial), Fellow (3 trials, 150 points), Warden (4 trials at 85+, 500 points, a verified operator). The Trust Index counts only checked work, never payments or recruiting. https://lunarasociety.com/agent-network.html',
      data: { skill, actions: ['info', 'join', 'status', 'profile', 'trials', 'trial-start', 'trial-submit', 'missions', 'mission-submit', 'directory'], page: 'https://lunarasociety.com/agent-network.html' }
    };
  }

  if (skill === 'services') {
    const list = [
      ['Passport scan', 'free', `${SITE}passport.html`],
      ['Passport Monitor', 'daily rescans, an alert the moment a check slips, a weekly summary and the live Monitored badge; monthly or yearly', `${SITE}passport.html#monitor`],
      ['Shield Verification', 'a named person verifies the business behind a domain; public register entry; renews every six months', `${SITE}shield.html`],
      ['AI Entity Verification', 'the same for an AI agent and its operator, with a signed agent passport', `${SITE}agent-passport.html`],
      ['Regulatory Watch', 'written notice when an EU AI Act or SB 942 obligation that binds you moves', `${SITE}marking.html`],
      ['Article 50 Disclosure Pack and Evidence Pack', 'for AI systems with EU transparency duties', `${SITE}article50.html`]
    ];
    return { text: 'What Lunara offers:\n' + list.map(([n, d, u]) => `- ${n}: ${d}. ${u}`).join('\n') + `\nEvery price, in one place: ${SITE}#start. Checkout is Stripe; subscriptions are cancelled by the customer at any time.`, data: { skill, services: list.map(([name, about, url]) => ({ name, about, url })), prices: `${SITE}#start` } };
  }

  return {
    text: `This is Lunara Society. I can: ${card.skills.map((s) => `${s.name.toLowerCase()} (${s.id})`).join(', ')}. Send a domain to scan it, ask whether a business is verified, send an agent passport to check it, or ask about the partner program. Agent card: ${A2A_URL}`,
    data: { skill: 'help', skills: card.skills.map(({ id, name, description, examples }) => ({ id, name, description, examples })) }
  };
}

/* ── the protocol ────────────────────────────────────────────────── */

const newId = () => (crypto.randomUUID ? crypto.randomUUID() : 'msg-' + Date.now().toString(36) + Math.random().toString(36).slice(2));

function agentMessage(reply, incoming, v1) {
  const parts = v1
    ? [{ text: reply.text }, { data: reply.data }]
    : [{ kind: 'text', text: reply.text }, { kind: 'data', data: reply.data }];
  const m = { kind: 'message', messageId: newId(), role: v1 ? 'ROLE_AGENT' : 'agent', parts };
  if (incoming && incoming.contextId) m.contextId = String(incoming.contextId).slice(0, 200);
  if (v1) delete m.kind;
  return m;
}

/* name is the path after lunara-registry/: 'a2a', 'a2a/message:send',
   'a2a/v1/message:send' or 'a2a/.well-known/agent-card.json'.
   call(route, body) runs a REST route of this same function. */
export async function a2aRoute(name, method, body, h) {
  const { json, call } = h;
  if (method === 'GET') return json(agentCard());

  const rest = name.replace(/^a2a\/?/, '');
  if (/^(v1\/)?message:send$/.test(rest)) {
    const v1 = !rest.startsWith('v1/');
    const msg = body.message || (body.params && body.params.message);
    if (!msg) return json({ error: 'Send {"message":{"role":"user","parts":[{"text":"…"}]}}.' }, 400);
    const { text, data } = readMessage(msg);
    return json({ message: agentMessage(await answer(text, data, call), msg, v1) });
  }
  if (rest) return json({ error: 'Not found. Use POST a2a (JSON-RPC) or a2a/message:send.' }, 404);

  // JSON-RPC 2.0
  const id = body.id ?? null;
  const fail = (code, message) => json({ jsonrpc: '2.0', id, error: { code, message } });
  if (body.jsonrpc !== '2.0' || typeof body.method !== 'string') return fail(-32600, 'Invalid Request: send a JSON-RPC 2.0 request with method "message/send".');
  const m = body.method;
  if (m === 'message/send' || m === 'SendMessage') {
    const msg = body.params && body.params.message;
    if (!msg || !Array.isArray(msg.parts)) return fail(-32602, 'Invalid params: params.message with parts is required.');
    const { text, data } = readMessage(msg);
    const out = agentMessage(await answer(text, data, call), msg, m === 'SendMessage');
    return json({ jsonrpc: '2.0', id, result: m === 'SendMessage' ? { message: out } : out });
  }
  if (m === 'message/stream' || m === 'SendStreamingMessage') return fail(-32004, 'Streaming is not supported; use message/send.');
  if (m === 'tasks/get' || m === 'GetTask' || m === 'tasks/cancel' || m === 'CancelTask') return fail(-32001, 'Task not found: Lunara answers every message at once and keeps no tasks.');
  if (m === 'agent/getAuthenticatedExtendedCard' || m === 'GetExtendedAgentCard') return fail(-32004, 'There is no extended card; the public card is complete.');
  return fail(-32601, `Method not found: ${m}.`);
}

export { CODE_RE };
