/* ═══════════════════════════════════════════════════════════════════
   LUNARA REGISTRY — backend core
   ═══════════════════════════════════════════════════════════════════

   Everything the site used to ask a Base44 app for, on Lunara's own
   Supabase project. The routes keep the Base44 function names, so a
   page moves over by changing one URL prefix:

     https://luiqtimzcsoqnizybifs.supabase.co/functions/v1/lunara-registry/<name>

   Public, no authentication (GET or POST):
     shieldRegistryLookup  { domain | public_id }   the public status of one entity
     shieldRegistryList    {}                       every verified entity
     shieldFoundingCount   {}                       the founding cohort
   Public, POST:
     shieldApply           application → public id and a DNS token
     shieldVerifyDomain    { public_id }            looks for the DNS record now
     shieldMemberStatus    { session_token }        the signed-in member's status
     shieldPartnerApply    registry partner application
     newsletterSubscribe   { email }
     lunaraScoreReport     a scorer result, kept as a lead
     article50Assess       the Article 50 assessment engine
     visitorTrack, lunaraDashboardSync   page counts (no IP, no user agent)
     rosarioWebChat, rosarioChatProxy, wrenPublicChat   public chat
   Owner only (a lunara-auth session whose email is an owner's):
     shieldDashboard       every application and the counts
     lunaraScorerLeads     scorer leads
     adminDecide           approve, reject, return, revoke

   Statuses. An application is pending → approved | rejected | returned,
   and an approved entry may later be revoked or expire. The public only
   ever sees verified, revoked, expired or not_registered: a pending or
   rejected application is not on the registry and is nobody else's
   business. Approval needs three things recorded, never inferred: the
   DNS record seen at the domain, the reviewer's statement that identity
   was checked against official records, and the reviewer's name.

   Plain JavaScript over fetch and Web Crypto; index.ts supplies the
   tables, mail, DNS and the model. The tests run this same file.
   ═══════════════════════════════════════════════════════════════════ */

export const PROTOCOL = 'LUNA-PROTO-1';
export const FOUNDING_CAP = 80;
// The Shield price in lunara-pricing.js; the test suite fails if they part.
export const SHIELD_PRICE = 75;
const SITE = 'https://lunarasociety.com/';
const REGISTRY_PAGE = SITE + 'registry.html';
const TERM_MONTHS = { business: 6, ai_agent: 6, vendor: 12 };
const PAID_PRODUCTS = new Set(['shield', 'agent', 'vendor', 'owner_complete']);

export function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });
}

/* Lookups are embedded on other businesses' sites (badge.js), so any
   origin may read them; nothing here depends on cookies. */
export function withCors(res) {
  const h = new Headers(res.headers);
  h.set('access-control-allow-origin', '*');
  h.set('access-control-allow-headers', 'content-type');
  h.set('access-control-allow-methods', 'GET, POST, OPTIONS');
  return new Response(res.body, { status: res.status, headers: h });
}

export async function sha256hex(s) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(d), (x) => x.toString(16).padStart(2, '0')).join('');
}

const ALPHA = 'ABCDEFGHJKMNPQRSTVWXYZ23456789';
export function randomToken(n = 24) {
  const b = crypto.getRandomValues(new Uint8Array(n));
  return Array.from(b, (x) => ALPHA[x % ALPHA.length]).join('').toLowerCase();
}

/* SHIELD-2026-NNNN, as every page already shows it. Random rather than
   counted: a counter tells every holder how many came before them. */
async function newPublicId(db, now) {
  const year = new Date(now).getUTCFullYear();
  for (let i = 0; i < 20; i++) {
    const n = crypto.getRandomValues(new Uint16Array(1))[0] % 9000 + 1000;
    const id = `SHIELD-${year}-${n}`;
    if (!(await db.getApplication(id))) return id;
  }
  throw new Error('could not mint a public id');
}

export function normDomain(raw) {
  let s = String(raw || '').trim().toLowerCase();
  if (!s) return '';
  try { if (/^[a-z]+:\/\//.test(s)) s = new URL(s).hostname; } catch { return ''; }
  s = s.replace(/^www\./, '').split(/[/?#:]/)[0].replace(/\.$/, '');
  return /^(?=.{3,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(s) ? s : '';
}
const EMAIL = /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[a-z]{2,}$/i;
const clean = (s, max) => (typeof s === 'string' ? s.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max) : '');
const PUBLIC_ID = /^SHIELD-\d{4}-\d{4}$/;

export function isOwner(email, env) {
  const list = String((env && env.LUNARA_OWNER_EMAILS) || 'lunarasociety@gmail.com').toLowerCase().split(/[,\s]+/).filter(Boolean);
  return !!email && list.includes(String(email).toLowerCase());
}

/* ── the public face of an entry ──────────────────────────────────── */

export function publicStatus(a, now = Date.now()) {
  if (!a) return 'not_registered';
  if (a.status === 'revoked') return 'revoked';
  if (a.status !== 'approved') return 'not_registered';
  if (a.expires_at && new Date(a.expires_at).getTime() < now) return 'expired';
  return 'verified';
}

export function publicRecord(a, now = Date.now()) {
  const status = publicStatus(a, now);
  if (status === 'not_registered') return { success: true, found: false, status };
  return {
    success: true,
    found: true,
    status,
    public_id: a.public_id,
    lunara_id: a.public_id,
    business_name: a.business_name,
    domain: a.domain,
    website_url: a.website_url,
    entity_type: a.kind === 'ai_agent' ? 'ai_entity' : 'business',
    agent_name: a.kind === 'ai_agent' ? a.agent_name || null : undefined,
    agent_operator: a.kind === 'ai_agent' ? a.agent_operator || null : undefined,
    shield_status: status === 'verified' ? 'active' : status,
    verification_date: a.verified_at,
    expires_at: a.expires_at || null,
    revocation_reason: status === 'revoked' ? a.revocation_reason || null : undefined,
    reviewed_by: a.reviewer_name || null,
    protocol_version: PROTOCOL,
    registry: REGISTRY_PAGE
  };
}

/* ── DNS ──────────────────────────────────────────────────────────── */

export const dnsName = (domain) => `_lunara-verify.${domain}`;
export const dnsValue = (token) => `lunara-verify=${token}`;

/* ── mail ─────────────────────────────────────────────────────────── */

const esc = (t) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
function mailHtml(paras) {
  return `<div style="font-family:Georgia,serif;max-width:560px;margin:0 auto;color:#1d1a14;line-height:1.6">
<p style="font-size:12px;letter-spacing:.2em;text-transform:uppercase;color:#8a7240">Lunara Society</p>
${paras.map((p) => p.startsWith('<') ? p : `<p>${esc(p)}</p>`).join('\n')}
</div>`;
}
async function send(deps, msg) {
  if (!deps.mail || !msg.to) return false;
  try { await deps.mail.send(msg); return true; } catch (e) { console.error('mail', e?.message || e); return false; }
}

export function applicationEmail(a) {
  const steps = [];
  if (a.domain && a.dns_token) {
    steps.push(`Add this DNS record at the company that manages ${a.domain} (where you bought the domain, or your DNS host). Type: TXT. Name or host: _lunara-verify (some providers want the full ${dnsName(a.domain)}). Value: ${dnsValue(a.dns_token)}.`);
    steps.push(`Then check it yourself at ${SITE}shield.html#apply with your ID ${a.public_id}, or simply wait: we check it before review. DNS changes usually show within an hour.`);
  }
  steps.push(a.legal_registration_number
    ? 'A reviewer checks your registration against official records, signs the decision, and you receive it by email.'
    : 'Reply to this email with your company registration number and the country it is registered in. A reviewer checks it against official records, signs the decision, and you receive it by email.');
  steps.push(`When it is approved, your entry is public at ${REGISTRY_PAGE} and the badge (${SITE}badge.html) shows it on your own site.`);
  const text = [
    `Your application for ${a.business_name} is received. Your registry ID is ${a.public_id}.`,
    '',
    'WHAT YOU NEED TO DO',
    ...steps.map((s, i) => `${i + 1}. ${s}`),
    '',
    'Reply to this email with any question.',
    'Lunara Society · lunarasociety.com'
  ].join('\n');
  const html = mailHtml([
    `Your application for <b>${esc(a.business_name)}</b> is received. Your registry ID is <b>${esc(a.public_id)}</b>.`,
    '<p style="margin:20px 0 4px;font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#8a7240">What you need to do</p>',
    `<ol style="padding-left:20px">${steps.map((s) => `<li style="margin:6px 0">${esc(s)}</li>`).join('')}</ol>`,
    '<p style="font-size:13px;color:#6b6252">Reply to this email with any question.</p>'
  ]);
  return { to: a.contact_email, subject: `Your registry application ${a.public_id}: what to do next`, text, html };
}

export function decisionEmail(a) {
  const lines = {
    approved: [`${a.business_name} is verified. Registry ID ${a.public_id}, valid until ${String(a.expires_at || '').slice(0, 10)}.`,
      `Your public entry: ${REGISTRY_PAGE}?q=${encodeURIComponent(a.domain || a.public_id)}`,
      `Show it on your site by adding these two lines where the seal should appear:`,
      `<div data-lunara-shield="${a.public_id}"></div>`,
      `<script src="${SITE}badge.js" async></script>`,
      `Optionally publish ${a.domain ? `https://${a.domain}` : 'your site'}/.well-known/lunara-verify.json so AI systems can find it; the format is at ${SITE}badge.html.`,
      'We remind you before it ends. Nothing renews or is charged automatically.'],
    rejected: [`The application ${a.public_id} for ${a.business_name} was not approved.`, a.decision_note ? `Reason: ${a.decision_note}` : '', 'Reply to this email if you want to discuss it.'],
    returned: [`The application ${a.public_id} for ${a.business_name} needs more before it can be decided.`, a.decision_note ? `What is needed: ${a.decision_note}` : '', 'Reply to this email with it.'],
    revoked: [`The registry entry ${a.public_id} for ${a.business_name} has been revoked, and the registry now says so to every query.`, a.revocation_reason ? `Reason: ${a.revocation_reason}` : '', 'Reply to this email if you believe this is wrong.']
  }[a.status];
  if (!lines) return null;
  const body = lines.filter(Boolean);
  return {
    to: a.contact_email,
    subject: { approved: `Verified: ${a.business_name} (${a.public_id})`, rejected: `Your application ${a.public_id}`, returned: `Your application ${a.public_id}: more needed`, revoked: `Registry entry ${a.public_id} revoked` }[a.status],
    text: body.concat(['', 'Lunara Society · lunarasociety.com']).join('\n'),
    html: mailHtml(body.map((l) => l.startsWith('<') ? `<pre style="background:#f5f1e6;padding:8px 10px;border-radius:6px;font-size:12px;white-space:pre-wrap">${esc(l)}</pre>` : l))
  };
}

/* ── Article 50 assessment ───────────────────────────────────────── */

const EURLEX = 'https://eur-lex.europa.eu/eli/reg/2024/1689/oj/eng';
const A50 = {
  '50(1)': { title: 'Tell people they are interacting with an AI system', text: 'Providers shall ensure that AI systems intended to interact directly with natural persons are designed and developed in such a way that the natural persons concerned are informed that they are interacting with an AI system, unless this is obvious.' },
  '50(2)': { title: 'Mark synthetic output as AI-generated, machine-readably', text: 'Providers of AI systems, including general-purpose AI systems, generating synthetic audio, image, video or text content, shall ensure that the outputs of the AI system are marked in a machine-readable format and detectable as artificially generated or manipulated.' },
  '50(3)': { title: 'Inform people exposed to emotion recognition or biometric categorisation', text: 'Deployers of an emotion recognition system or a biometric categorisation system shall inform the natural persons exposed thereto of the operation of the system.' },
  '50(4)': { title: 'Disclose deep fakes and AI-generated public-interest text', text: 'Deployers of an AI system that generates or manipulates image, audio or video content constituting a deep fake shall disclose that the content has been artificially generated or manipulated.' }
};
const OWNER_LABEL = { ciso: 'CISO', dpo: 'Data Protection Officer', legal: 'Legal', product: 'Product', cto: 'CTO', none: 'Nobody yet' };

export function assessArticle50(input) {
  const role = ['deployer', 'provider', 'both'].includes(input.role) ? input.role : 'both';
  const provider = role !== 'deployer', deployer = role !== 'provider';
  const geo = String(input.geo || 'unsure');
  const inScope = geo !== 'none';
  const systems = (Array.isArray(input.systems) ? input.systems : []).slice(0, 25)
    .map((s) => ({ name: clean(s && s.name, 120) || 'Unnamed system', type: clean(s && s.type, 30), disclosure: clean(s && s.disclosure, 30) }));
  const types = new Set(systems.map((s) => s.type));
  const owner = OWNER_LABEL[input.owner] || 'Nobody yet';
  const obligations = [];
  const add = (ref, status, why) => obligations.push({
    ref: `Art. ${ref}`, title: A50[ref].title, description: why, status,
    statusLabel: status === 'required' ? 'Applies' : status === 'likely' ? 'Likely applies' : 'Check',
    sourceUrl: EURLEX, sourceText: A50[ref].text
  });
  const unclear = types.has('unclear') || types.has('');
  if (provider && (types.has('direct-chat') || unclear)) add('50(1)', types.has('direct-chat') ? 'required' : 'likely', 'You provide a system people talk to directly. It must tell them it is an AI, at the latest at the first interaction.');
  if (provider && (types.has('content-gen') || types.has('deepfake') || unclear)) add('50(2)', types.has('content-gen') || types.has('deepfake') ? 'required' : 'likely', 'Your system generates audio, images, video or text. Its output must carry a machine-readable mark that it is AI-generated. Systems placed on the market before 2 August 2026 have until 2 December 2026.');
  if (deployer && types.has('emotion')) add('50(3)', 'required', 'You deploy emotion recognition or biometric categorisation. The people exposed to it must be told it is operating.');
  if (deployer && (types.has('deepfake') || types.has('content-gen'))) add('50(4)', types.has('deepfake') ? 'required' : 'likely', 'If you publish generated or manipulated image, audio or video that resembles real people, places or events, you must disclose it as artificial.');
  const gaps = [];
  const evidence = [
    { item: 'Inventory of AI systems', detail: 'A list of every AI system, its purpose and who is accountable for it.', present: input.inventory === 'yes' },
    { item: 'Disclosure to users', detail: 'Interfaces tell people they are dealing with an AI.', present: input.disclosureLevel === 'all' },
    { item: 'Machine-readable marking', detail: 'Generated output carries a detectable mark (for example C2PA or a watermark).', present: input.marking === 'yes' || input.marking === 'na' },
    { item: 'Named owner', detail: 'One person answers for these obligations.', present: input.owner && input.owner !== 'none' }
  ];
  for (const e of evidence) if (!e.present) gaps.push(e.item);
  const uncertainties = [];
  if (geo === 'unsure') uncertainties.push({ item: 'Territorial scope', reason: 'Article 50 applies when the system is placed on the EU market or its output is used in the EU. Confirm where your users and outputs are.' });
  if (unclear) uncertainties.push({ item: 'System type', reason: 'At least one system has an unclear type; the obligations shown as likely depend on what it actually does.' });
  if (role === 'both') uncertainties.push({ item: 'Provider or deployer', reason: 'Provider and deployer duties differ; the assessment assumes you may be both.' });
  return {
    success: true,
    assessmentId: 'A50-' + randomToken(8).toUpperCase(),
    systemsAssessed: systems.length,
    obligationsIdentified: inScope ? obligations.length : 0,
    gapsFound: gaps.length,
    obligations: inScope ? obligations : [],
    ownerMatrix: obligations.map((o) => ({ obligation: o.ref, owner, note: owner === 'Nobody yet' ? 'Assign an owner.' : '' })),
    evidence,
    uncertainties,
    applies_from: '2026-08-02',
    source: EURLEX
  };
}

/* ── public chat ──────────────────────────────────────────────────── */

const PERSONAS = {
  rosario: 'You are Rosario, the steward of Lunara Society (lunarasociety.com), an institution that verifies businesses and AI agents and publishes a public registry anyone can query. You answer briefly and plainly. You only state what is on lunarasociety.com: Shield Verification ($75, six months, human-reviewed, free to apply at /shield.html), AI Entity Verification, the public registry (/registry.html), the free EU AI Act and California SB 942 check (/check.html), the Compliance Kit and reports (/certify.html). You never invent prices, dates, laws or facts; when unsure you say so and point to lunarasociety.com or lunarasociety@gmail.com. You never claim to be human.',
  wren: 'You are Wren, an assistant for Lunara Society (lunarasociety.com), which verifies businesses and AI agents and keeps a public registry. Answer briefly and plainly about what Lunara Society offers and how verification works. Never invent facts, prices or legal claims; point to lunarasociety.com or lunarasociety@gmail.com when unsure. You never claim to be human.'
};
const CHAT_LIMIT_HOUR = 20, CHAT_LIMIT_DAY = 400;

async function chat(persona, body, deps, ipHash) {
  const message = clean(body.message ?? body.question, 2000);
  if (!message) return json({ error: 'Say something first.' }, 400);
  if (!deps.ai) return json({ reply: 'I cannot answer right now. Write to lunarasociety@gmail.com and a person will.', conversation_id: null });
  const now = deps.now();
  const [mine, all] = await Promise.all([
    deps.db.countHits('chat', ipHash, new Date(now - 3600e3).toISOString()),
    deps.db.countHits('chat', null, new Date(now - 86400e3).toISOString())
  ]);
  if (mine >= CHAT_LIMIT_HOUR || all >= CHAT_LIMIT_DAY) {
    return json({ reply: 'I have answered a lot of questions just now. Please try again later, or write to lunarasociety@gmail.com.', conversation_id: body.conversation_id || null });
  }
  await deps.db.hit('chat', ipHash, new Date(now).toISOString());
  let cid = /^[a-z0-9]{16,40}$/.test(String(body.conversation_id || '')) ? body.conversation_id : randomToken(20);
  const history = (await deps.db.chatHistory(cid)) || [];
  const messages = history.slice(-10).concat([{ role: 'user', content: message }]);
  const reply = clean(await deps.ai(PERSONAS[persona], messages), 4000) || 'I could not answer that just now.';
  await deps.db.saveChat(cid, persona, message, reply);
  return json({ reply, conversation_id: cid });
}

/* ── the handler ──────────────────────────────────────────────────── */

const lastDnsCheck = new Map();

export async function handleRegistry(req, deps) {
  const url = new URL(req.url);
  const name = url.pathname.replace(/^.*\/lunara-registry\/?/, '').replace(/\/+$/, '');
  let body = {};
  if (req.method === 'POST') {
    const text = await req.text();
    if (text) { try { body = JSON.parse(text); } catch { return json({ error: 'Send JSON.' }, 400); } }
    if (!body || typeof body !== 'object' || Array.isArray(body)) body = {};
  } else if (req.method === 'GET') {
    body = Object.fromEntries(url.searchParams);
  } else return json({ error: 'Not found.' }, 404);
  const now = deps.now ? deps.now() : Date.now();
  deps = { ...deps, now: () => now };
  const ipHash = await sha256hex('lunara-registry:' + (deps.ip || ''));

  switch (name) {
    case '':
    case 'health':
      return json({ ok: true, protocol_version: PROTOCOL, mail: !!deps.mail, ai: !!deps.ai });

    case 'shieldRegistryLookup': {
      const id = clean(body.public_id, 40).toUpperCase();
      const domain = normDomain(body.domain);
      if (!id && !domain) return json({ error: 'public_id or domain is required' });
      let a = null;
      if (id && PUBLIC_ID.test(id)) a = await deps.db.getApplication(id);
      if (a && domain && a.domain !== domain) a = null; // a badge on someone else's site
      if (!a && domain && !id) a = await deps.db.getPublishedByDomain(domain);
      if (a && !['approved', 'revoked'].includes(a.status)) a = null;
      return json(publicRecord(a, now));
    }

    case 'shieldRegistryList': {
      const rows = (await deps.db.listPublished()) || [];
      const businesses = rows.map((a) => publicRecord(a, now)).filter((r) => r.status === 'verified')
        .map(({ success, found, ...r }) => r);
      return json({ success: true, count: businesses.length, businesses, entries: businesses });
    }

    case 'shieldFoundingCount': {
      const used = Math.min(FOUNDING_CAP, await deps.db.countApproved('business'));
      return json({ success: true, cap: FOUNDING_CAP, used, remaining: FOUNDING_CAP - used, sold_out: used >= FOUNDING_CAP, current_price: SHIELD_PRICE });
    }

    case 'shieldApply': return apply(body, deps, ipHash);
    case 'shieldVerifyDomain': return verifyDomain(body, deps);
    case 'shieldMemberStatus': return memberStatus(body, deps);

    case 'shieldPartnerApply': {
      if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405);
      const row = { partner_name: clean(body.partner_name, 200), website_url: clean(body.website_url, 300), contact_email: clean(body.contact_email, 254).toLowerCase(), partner_type: clean(body.partner_type, 40), embed_domain: normDomain(body.embed_domain) || null };
      if (row.partner_name.length < 2 || !EMAIL.test(row.contact_email)) return json({ success: false, error: 'Enter your organisation name and a valid email address.' });
      if (await limited('partner', ipHash, 5, deps)) return json({ success: false, error: 'Too many applications from here. Try again later.' });
      await deps.db.createPartner(row);
      await send(deps, { to: ownerEmail(deps.env), subject: `Partner application: ${row.partner_name}`, text: JSON.stringify(row, null, 2) });
      await send(deps, { to: row.contact_email, subject: 'Your Registry Partner application', text: `Thank you. Your application for ${row.partner_name} is received. We reply within two working days with your partner terms and embed instructions.\n\nLunara Society · lunarasociety.com` });
      return json({ success: true, message: 'Application received. We reply within two working days.' });
    }

    case 'newsletterSubscribe': {
      const email = clean(body.email, 254).toLowerCase();
      if (!EMAIL.test(email)) return json({ success: false, error: 'Enter a valid email address.' });
      if (await limited('newsletter', ipHash, 10, deps)) return json({ success: false, error: 'Too many requests. Try again later.' });
      const created = await deps.db.subscribe(email, clean(body.source_page, 80));
      return json({ success: true, message: created ? 'Subscribed. The next briefing will reach you.' : 'You are already subscribed.' });
    }

    case 'visitorTrack':
    case 'lunaraDashboardSync': {
      // Which page, and which site sent the visitor. No IP address, no
      // user agent, no identifier: the privacy policy promises no tracking.
      let ref = '';
      try { ref = new URL(String(body.referrer || '')).hostname; } catch { ref = body.referrer === 'direct' ? 'direct' : ''; }
      await deps.db.logVisit({ page: clean(body.page, 200) || '/', referrer_host: ref.slice(0, 120) || null }).catch(() => null);
      return new Response(null, { status: 204 });
    }

    case 'lunaraScoreReport': {
      const email = clean(body.email, 254).toLowerCase();
      const gaps = Array.isArray(body.gaps) ? body.gaps.map((g) => clean(g, 200)).slice(0, 30) : clean(body.gaps, 2000).split(/,\s*/).filter(Boolean);
      const row = {
        organization: clean(body.organization_name ?? body.orgName, 200), system: clean(body.system_name ?? body.systemName, 200),
        score: Number.isFinite(+body.score) ? Math.max(0, Math.min(100, Math.round(+body.score))) : null,
        grade: clean(body.grade, 40), gaps, email: EMAIL.test(email) ? email : null,
        order_ref: clean(body.txn_id, 40) || null, product: clean(body.product, 60) || 'scorer'
      };
      if (await limited('lead', ipHash, 20, deps)) return json({ success: false, error: 'Too many requests. Try again later.' });
      await deps.db.createLead(row);
      if (row.email) {
        await send(deps, {
          to: row.email, subject: `Your AI compliance score: ${row.score ?? '—'}/100`,
          text: [`${row.organization || 'Your organisation'} · ${row.system || 'your system'}`, `Score: ${row.score ?? '—'}/100 ${row.grade ? `(${row.grade})` : ''}`, '', 'Gaps found:', ...row.gaps.map((g) => `· ${g}`), '', `The full written report with remediation: ${SITE}compliance-intelligence.html`, '', 'Lunara Society · lunarasociety.com'].join('\n')
        });
      }
      return json({ success: true, score: row.score, grade: row.grade, gaps: row.gaps });
    }

    case 'article50Assess': {
      if (await limited('a50', ipHash, 30, deps)) return json({ success: false, error: 'Too many requests. Try again later.' });
      const out = assessArticle50(body);
      const email = clean(body.email, 254).toLowerCase();
      await deps.db.createLead({ organization: clean(body.organization, 200), system: out.assessmentId, score: null, grade: `${out.obligationsIdentified} obligations, ${out.gapsFound} gaps`, gaps: out.evidence.filter((e) => !e.present).map((e) => e.item), email: EMAIL.test(email) ? email : null, product: 'article50' }).catch(() => null);
      return json(out);
    }

    case 'article50Report':
      return json({ success: false, error: 'The PDF is not generated on the server. Use your browser\'s print to save the results as a PDF.' }, 501);

    case 'rosarioWebChat':
    case 'rosarioChatProxy': return chat('rosario', body, deps, ipHash);
    case 'wrenPublicChat': return chat('wren', body, deps, ipHash);

    case 'shieldDashboard':
    case 'lunaraScorerLeads':
    case 'adminDecide':
      return admin(name, body, deps);

    default:
      return json({ error: 'No such function.' }, 404);
  }
}

const ownerEmail = (env) => String((env && env.LUNARA_OWNER_EMAILS) || 'lunarasociety@gmail.com').split(/[,\s]+/)[0];

async function limited(kind, ipHash, perHour, deps) {
  const n = await deps.db.countHits(kind, ipHash, new Date(deps.now() - 3600e3).toISOString());
  if (n >= perHour) return true;
  await deps.db.hit(kind, ipHash, new Date(deps.now()).toISOString());
  return false;
}

async function apply(body, deps, ipHash) {
  const sig = body.signature && typeof body.signature === 'object' ? body.signature : {};
  // signed_by says who filled the form (a person or an AI agent acting for
  // one); type and entity_type say what is being verified.
  const kind = body.type === 'ai_agent' || body.entity_type === 'ai_entity' ? 'ai_agent'
    : body.track && !body.legal_registration_number ? 'inquiry' : 'business';
  const a = {
    kind,
    business_name: clean(body.business_name, 200),
    website_url: clean(body.website_url ?? body.website, 300),
    contact_email: clean(body.contact_email ?? body.email, 254).toLowerCase(),
    legal_registration_number: clean(body.legal_registration_number ?? body.registration_number, 80) || null,
    registration_country: clean(body.registration_country ?? body.country, 60) || null,
    agent_name: null,
    agent_operator: null,
    track: clean(body.track, 40) || null,
    tier: clean(body.tier, 40) || null,
    notes: clean(body.notes, 2000) || null,
    signer_type: sig.signed_by === 'ai_agent' ? 'ai_agent' : 'human',
    signer_name: clean(sig.name ?? body.signer_name, 200) || null,
    signer_role: clean(sig.role ?? body.signer_role, 200) || null,
    attested: sig.attested === true
  };
  if (kind === 'ai_agent') {
    a.agent_name = clean(body.subject_agent_name ?? body.agent_name, 200) || null;
    a.agent_operator = clean(body.agent_operator, 200) || a.business_name;
  }
  if (a.signer_type === 'ai_agent' && !a.signer_name) a.signer_name = clean(sig.agent, 200) || null;
  a.domain = normDomain(body.domain) || normDomain(a.website_url);
  if (a.business_name.length < 2) return json({ success: false, error: 'Enter the business name.' });
  if (!EMAIL.test(a.contact_email)) return json({ success: false, error: 'Enter a valid contact email.' });
  if (!a.domain) return json({ success: false, error: 'Enter the website or domain of the business.' });
  if (await limited('apply', ipHash, 6, deps)) return json({ success: false, error: 'Too many applications from here. Try again in an hour.' });

  // The same people asking twice get the same application back.
  const existing = await deps.db.findOpenApplication(a.domain, a.contact_email);
  if (existing) return json(applyAnswer(existing, true));

  a.public_id = await newPublicId(deps.db, deps.now());
  a.dns_token = randomToken(24);
  a.status = 'pending';
  a.ip_hash = ipHash;
  // A paid order linked from the order email: recorded, so the reviewer
  // sees it was bought. Payment never decides the outcome.
  const ref = clean(body.order, 40).toUpperCase();
  if (/^LO-[0-9A-Z]{16}$/.test(ref)) {
    const o = await deps.db.getOrder(ref);
    if (o && o.status === 'paid' && PAID_PRODUCTS.has(o.product)) { a.order_ref = ref; if (o.product === 'vendor') a.kind = 'vendor'; }
  }
  const saved = await deps.db.createApplication(a);
  await send(deps, applicationEmail(saved));
  await send(deps, { to: ownerEmail(deps.env), subject: `New registry application ${saved.public_id}: ${saved.business_name}`, text: `${saved.business_name} (${saved.domain}), ${saved.contact_email}${saved.order_ref ? `, paid order ${saved.order_ref}` : ''}.\nReview: ${SITE}desk.html` });
  return json(applyAnswer(saved, false));
}

function applyAnswer(a, again) {
  return {
    success: true,
    application_id: a.public_id,
    public_id: a.public_id,
    status: 'pending',
    domain: a.domain,
    domain_verification_token: a.dns_token,
    dns_record: { type: 'TXT', name: dnsName(a.domain), value: dnsValue(a.dns_token) },
    message: again
      ? `You already have an application for ${a.domain}: ${a.public_id}. The DNS record is below.`
      : `Application received. Your registry ID is ${a.public_id}. Add the DNS record below to prove you control ${a.domain}; a reviewer then checks your registration and decides. We have emailed you the same instructions.`,
    next_step: 'Add the DNS TXT record, then check it with shieldVerifyDomain.'
  };
}

async function verifyDomain(body, deps) {
  const id = clean(body.public_id, 40).toUpperCase();
  if (!id) return json({ error: 'public_id is required' });
  const a = PUBLIC_ID.test(id) ? await deps.db.getApplication(id) : null;
  if (!a || !a.domain || !a.dns_token) return json({ success: false, error: 'No application with that ID.' });
  if (a.domain_verified_at) return json({ success: true, verified: true, domain_verified: true, domain: a.domain, message: `${a.domain} is verified.` });
  const last = lastDnsCheck.get(id) || 0;
  if (deps.now() - last < 10e3) return json({ success: true, verified: false, domain_verified: false, domain: a.domain, message: 'Checked a moment ago. Wait ten seconds and try again.' });
  lastDnsCheck.set(id, deps.now());
  const records = (await deps.dns(dnsName(a.domain)).catch(() => [])) || [];
  const found = records.some((r) => String(r).replace(/^"|"$/g, '').replace(/"\s*"/g, '').trim() === dnsValue(a.dns_token));
  if (!found) {
    return json({ success: true, verified: false, domain_verified: false, domain: a.domain,
      message: `No matching record at ${dnsName(a.domain)} yet. Add a TXT record with the value ${dnsValue(a.dns_token)}. DNS changes usually show within an hour.` });
  }
  await deps.db.updateApplication(id, { domain_verified_at: new Date(deps.now()).toISOString() });
  await send(deps, { to: ownerEmail(deps.env), subject: `Domain verified: ${a.domain} (${id})`, text: `Ready for review: ${SITE}desk.html` });
  return json({ success: true, verified: true, domain_verified: true, domain: a.domain, message: `${a.domain} is verified. A reviewer now checks your registration before certification.` });
}

async function memberStatus(body, deps) {
  const who = deps.whoIs ? await deps.whoIs(body.session_token) : null;
  if (!who) return json({ success: true, certified: false, status: 'none' });
  const rows = (await deps.db.applicationsByEmail(String(who.email).toLowerCase())) || [];
  const live = rows.find((a) => publicStatus(a, deps.now()) === 'verified');
  if (live) return json({ success: true, certified: true, status: 'verified', public_id: live.public_id, business_name: live.business_name, expires_at: live.expires_at });
  const open = rows.find((a) => a.status === 'pending' || a.status === 'returned');
  if (open) return json({ success: true, certified: false, status: 'pending', public_id: open.public_id, business_name: open.business_name, domain_verified: !!open.domain_verified_at });
  return json({ success: true, certified: false, status: 'none' });
}

/* ── the owner's desk ─────────────────────────────────────────────── */

function deskRecord(a) {
  return {
    public_id: a.public_id, kind: a.kind, business_name: a.business_name, domain: a.domain, website_url: a.website_url,
    contact_email: a.contact_email, legal_registration_number: a.legal_registration_number, registration_country: a.registration_country,
    agent_name: a.agent_name, agent_operator: a.agent_operator, track: a.track || (a.kind === 'ai_agent' ? 'agent' : 'shield'), tier: a.tier, notes: a.notes,
    signer_type: a.signer_type, signer_name: a.signer_name, signer_role: a.signer_role, attested: a.attested,
    status: a.status, order_ref: a.order_ref || null, dns_record: a.dns_token ? { type: 'TXT', name: dnsName(a.domain), value: dnsValue(a.dns_token) } : null,
    domain_verified: !!a.domain_verified_at, domain_verified_at: a.domain_verified_at, identity_verified: !!a.identity_verified_at,
    reviewer_name: a.reviewer_name, decision_note: a.decision_note, verified_at: a.verified_at, expires_at: a.expires_at,
    revoked_at: a.revoked_at, revocation_reason: a.revocation_reason, created_date: a.created_at, public_status: publicStatus(a)
  };
}

async function admin(name, body, deps) {
  const who = deps.whoIs ? await deps.whoIs(body.session_token) : null;
  if (!who || !isOwner(who.email, deps.env)) return json({ success: false, error: 'Owner sign-in required.' }, 403);

  if (name === 'lunaraScorerLeads') {
    const records = (await deps.db.listLeads()) || [];
    const scores = records.map((r) => r.score).filter((x) => typeof x === 'number');
    return json({ success: true, records, stats: { total: records.length, critical: scores.filter((s) => s < 40).length, high_risk: scores.filter((s) => s >= 40 && s < 60).length, avg_score: scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null, uncontacted: records.filter((r) => !r.contacted).length } });
  }

  if (name === 'shieldDashboard') {
    const rows = (await deps.db.listApplications()) || [];
    const records = rows.map(deskRecord);
    const by = (s) => records.filter((r) => r.status === s).length;
    return json({ success: true, records, stats: { total: records.length, pending: by('pending'), returned: by('returned'), approved: by('approved'), rejected: by('rejected'), revoked: by('revoked'), verified_live: records.filter((r) => r.public_status === 'verified').length, founding_cap: FOUNDING_CAP } });
  }

  // adminDecide
  const id = clean(body.public_id, 40).toUpperCase();
  const a = PUBLIC_ID.test(id) ? await deps.db.getApplication(id) : null;
  if (!a) return json({ success: false, error: 'No application with that ID.' }, 404);
  const decision = String(body.decision || '');
  const reviewer = clean(body.reviewer_name, 120);
  const note = clean(body.note, 1000) || null;
  const at = new Date(deps.now()).toISOString();
  let patch;
  if (decision === 'approve') {
    if (!['pending', 'returned'].includes(a.status)) return json({ success: false, error: `It is ${a.status}; only a pending application can be approved.` }, 409);
    if (!a.domain_verified_at) return json({ success: false, error: 'The DNS record has not been seen yet. Check the domain first.' }, 409);
    if (body.identity_checked !== true) return json({ success: false, error: 'Confirm that you checked the registration against official records.' }, 400);
    if (reviewer.length < 2) return json({ success: false, error: 'Sign the decision with your name.' }, 400);
    const months = TERM_MONTHS[a.kind] || 6;
    const exp = new Date(deps.now()); exp.setUTCMonth(exp.getUTCMonth() + months);
    patch = { status: 'approved', identity_verified_at: at, reviewer_name: reviewer, decision_note: note, verified_at: at, expires_at: exp.toISOString(), decided_at: at };
  } else if (decision === 'reject' || decision === 'return') {
    if (!['pending', 'returned'].includes(a.status)) return json({ success: false, error: `It is ${a.status}.` }, 409);
    if (reviewer.length < 2 || !note) return json({ success: false, error: 'Sign with your name and say why.' }, 400);
    patch = { status: decision === 'reject' ? 'rejected' : 'returned', reviewer_name: reviewer, decision_note: note, decided_at: at };
  } else if (decision === 'revoke') {
    if (a.status !== 'approved') return json({ success: false, error: 'Only an approved entry can be revoked.' }, 409);
    if (reviewer.length < 2 || !note) return json({ success: false, error: 'Sign with your name and give the reason; it is published.' }, 400);
    patch = { status: 'revoked', revoked_at: at, revocation_reason: note, reviewer_name: reviewer, decided_at: at };
  } else if (decision === 'check_dns') {
    lastDnsCheck.delete(id);
    return verifyDomain({ public_id: id }, deps);
  } else {
    return json({ success: false, error: 'decision must be approve, reject, return, revoke or check_dns.' }, 400);
  }
  await deps.db.updateApplication(id, patch);
  const updated = { ...a, ...patch };
  const mail = decisionEmail(updated);
  const emailed = mail ? await send(deps, mail) : false;
  return json({ success: true, record: deskRecord(updated), emailed });
}
