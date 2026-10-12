/* ═══════════════════════════════════════════════════════════════════
   THE OPERATING PICTURE — status, activity and the audit chain
   ═══════════════════════════════════════════════════════════════════

   What the Command Center (command.html) and the other workspaces read.
   Nothing here invents a state: every field is either measured on this
   request, read from a table, or reported as not configured.

     systemStatus   public. One real round trip to the database, timed,
                    and which optional services are configured (mail,
                    the model, the agent-passport signing key). Booleans
                    only: never a key, a hostname or a stack trace.
     activityFeed   public. Events already public elsewhere on the site,
                    in one stream: register decisions, passport rescans
                    of the league's domains, and listed agents joining,
                    passing trials and completing missions. Each carries
                    the table it came from and the time it was recorded.
     opsActivity    owner only. The same, plus what only the owner may
                    see: orders, applications, partner applications,
                    unlisted agents, mission submissions and the audit
                    tail. Figures only for the ops key, as in opsStats.
     auditLog       owner only. The append-only record of every privileged
                    decision, with the hash chain checked on the server.

   The audit chain. Each record carries the SHA-256 of the record before
   it and its own hash over a canonical form of its fields, so a record
   altered, removed or inserted in the middle breaks every hash after it.
   The table refuses UPDATE, DELETE and TRUNCATE (a trigger), and prev_hash
   is unique, so two writers racing cannot fork the chain: the loser
   retries on the new tail. What this does not give: protection from
   whoever controls the database itself, who can disable the trigger and
   rewrite the whole chain consistently. The chain makes tampering
   evident to anyone holding an earlier copy of a hash; it does not make
   the table immutable, and the pages say so.
   ═══════════════════════════════════════════════════════════════════ */

export const AUDIT_GENESIS = '0'.repeat(64);
const DAY = 86400e3;

/* RFC 8785-style canonical JSON: sorted keys, no whitespace. The audit
   records hold strings, numbers, booleans, null and plain objects, for
   which this is exact. */
export function canonical(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v === undefined ? null : v);
  if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
  return '{' + Object.keys(v).filter((k) => v[k] !== undefined).sort().map((k) => JSON.stringify(k) + ':' + canonical(v[k])).join(',') + '}';
}

export const AUDIT_FIELDS = ['at', 'actor', 'action', 'target', 'outcome', 'reason', 'correlation_id', 'detail', 'prev_hash'];
export function auditBody(r) {
  const o = {};
  for (const k of AUDIT_FIELDS) o[k] = r[k] === undefined ? null : r[k];
  // Postgres hands a timestamptz back as +00:00, not Z: the hash covers the
  // instant, so it is normalised to one spelling before hashing.
  if (o.at) o.at = new Date(o.at).toISOString();
  return o;
}
export async function auditHash(r, sha256hex) {
  return sha256hex('lunara-audit-1\n' + canonical(auditBody(r)));
}

/* Walks a chain in order. Returns where it first breaks, if it does. */
export async function checkChain(rows, sha256hex) {
  let prev = AUDIT_GENESIS;
  for (const r of rows) {
    if (r.prev_hash !== prev) return { intact: false, broken_at: r.seq ?? null, reason: 'prev_hash does not match the record before it' };
    if (r.hash !== await auditHash(r, sha256hex)) return { intact: false, broken_at: r.seq ?? null, reason: 'the record does not match its own hash' };
    prev = r.hash;
  }
  return { intact: true, broken_at: null, head: prev, length: rows.length };
}

export function correlationId() {
  const b = crypto.getRandomValues(new Uint8Array(9));
  return 'cor-' + Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
}

/* Appends one record. Never throws into the caller: a decision that has
   already been made is reported with audited:false rather than undone. */
export async function recordAudit(deps, entry, sha256hex) {
  if (!deps.db.auditAppend || !deps.db.auditLast) return { audited: false, reason: 'no audit store' };
  const clip = (s, n) => (s == null ? null : String(s).slice(0, n));
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const last = await deps.db.auditLast();
      const r = {
        at: new Date(deps.now()).toISOString(),
        actor: clip(entry.actor, 254) || 'unknown',
        action: clip(entry.action, 80),
        target: clip(entry.target, 200),
        outcome: clip(entry.outcome, 40) || 'ok',
        reason: clip(entry.reason, 1000),
        correlation_id: clip(entry.correlation_id, 60) || correlationId(),
        detail: entry.detail && typeof entry.detail === 'object' ? JSON.parse(JSON.stringify(entry.detail)) : null,
        prev_hash: last ? last.hash : AUDIT_GENESIS
      };
      r.hash = await auditHash(r, sha256hex);
      await deps.db.auditAppend(r);
      return { audited: true, hash: r.hash, correlation_id: r.correlation_id };
    } catch (e) {
      const msg = String((e && e.message) || e);
      if (!/23505|duplicate|conflict|unique/i.test(msg)) { console.error('audit', msg.slice(0, 200)); return { audited: false, reason: 'the audit store refused the record' }; }
    }
  }
  return { audited: false, reason: 'the audit chain was busy; retry' };
}

const iso = (t) => (t ? new Date(t).toISOString() : null);
const sortDesc = (a, b) => (Date.parse(b.at) || 0) - (Date.parse(a.at) || 0);

/* Public events. Only what the site already publishes, one record each. */
async function publicEvents(deps, h, since) {
  const db = deps.db;
  const [published, scans, league, agents, missions, passes] = await Promise.all([
    db.listPublishedAll ? db.listPublishedAll().catch(() => null) : db.listPublished().catch(() => null),
    db.recentScans ? db.recentScans(80).catch(() => null) : null,
    deps.leagueList ? deps.leagueList().catch(() => null) : null,
    db.netListAgents ? db.netListAgents(['associate', 'fellow', 'warden']).catch(() => null) : null,
    db.misRecentApproved ? db.misRecentApproved(60).catch(() => null) : null,
    db.sitRecentPassed ? db.sitRecentPassed(60).catch(() => null) : null
  ]);
  const ev = [];
  const sources = {};
  const mark = (name, rows) => { sources[name] = rows === null ? 'unavailable' : 'ok'; return rows || []; };

  for (const a of mark('registry_entries', published)) {
    if (a.status === 'approved' && a.verified_at) {
      ev.push({ id: `reg:${a.public_id}:verified`, type: 'register.verified', at: iso(a.verified_at), source: 'registry_entries',
        title: `${a.business_name} entered the public register`, subject: a.public_id, detail: `${a.domain} · reviewed by ${a.reviewer_name || 'a named reviewer'}`,
        link: `https://lunarasociety.com/registry.html?id=${encodeURIComponent(a.public_id)}` });
    }
    if (a.status === 'revoked' && a.revoked_at) {
      ev.push({ id: `reg:${a.public_id}:revoked`, type: 'register.revoked', at: iso(a.revoked_at), source: 'registry_entries',
        title: `${a.business_name} was revoked from the register`, subject: a.public_id, detail: a.revocation_reason || null,
        link: `https://lunarasociety.com/registry.html?id=${encodeURIComponent(a.public_id)}` });
    }
  }

  // Passports: only the league's domains, which the league already lists
  // publicly. A scan of any other domain says someone was curious about
  // it, which is nobody else's business.
  const names = new Map((mark('league', league)).map((e) => [e.domain, e.name]));
  for (const s of mark('passport_scans', scans)) {
    if (!names.has(s.domain) || !s.scanned_at) continue;
    const moved = s.prev_score != null && s.prev_score !== s.score;
    ev.push({ id: `pp:${s.domain}:${s.scanned_at}`, type: moved ? 'passport.changed' : 'passport.scanned', at: iso(s.scanned_at), source: 'passport_scans',
      title: moved ? `${names.get(s.domain) || s.domain}: passport ${s.prev_score} → ${s.score}` : `${names.get(s.domain) || s.domain}: passport ${s.score} (${s.grade})`,
      subject: s.domain, detail: moved ? `${s.prev_grade} → ${s.grade}` : s.grade,
      link: `https://lunarasociety.com/passport.html?d=${encodeURIComponent(s.domain)}` });
  }

  // The Agent Network, listed members only (the directory's own rule).
  const listed = new Map(mark('network_agents', agents).filter((a) => a.status === 'active').map((a) => [a.agent_id, a]));
  for (const a of listed.values()) {
    ev.push({ id: `net:${a.agent_id}:joined`, type: 'agent.joined', at: iso(a.created_at), source: 'network_agents',
      title: `${a.name} joined the Agent Network`, subject: a.agent_id, detail: `operated by ${a.operator_name}`,
      link: `https://lunarasociety.com/agent-network.html?agent=${a.agent_id}` });
  }
  for (const m of mark('mission_submissions', missions)) {
    const a = listed.get(m.agent_id);
    if (!a || m.status !== 'approved' || !m.decided_at) continue;
    ev.push({ id: `mis:${m.id}:approved`, type: 'mission.approved', at: iso(m.decided_at), source: 'mission_submissions',
      title: `${a.name}: mission ${m.mission} approved`, subject: a.agent_id, detail: `${m.points} points`,
      link: `https://lunarasociety.com/agent-network.html?agent=${a.agent_id}` });
  }
  for (const t of mark('trial_sittings', passes)) {
    const a = listed.get(t.agent_id);
    if (!a || !t.passed || !t.submitted_at) continue;
    ev.push({ id: `trial:${t.sitting_id}`, type: 'trial.passed', at: iso(t.submitted_at), source: 'trial_sittings',
      title: `${a.name} passed the ${t.trial} trial`, subject: a.agent_id, detail: `score ${t.score}`,
      link: `https://lunarasociety.com/agent-network.html?agent=${a.agent_id}` });
  }

  const out = ev.filter((e) => e.at && (!since || Date.parse(e.at) > since)).sort(sortDesc);
  return { events: out, sources };
}

async function ownerOrAgent(req, body, deps, h) {
  const who = deps.whoIs ? await deps.whoIs(body.session_token) : null;
  if (who && h.isOwner(who.email, deps.env)) return { owner: true, actor: who.email };
  const key = (req && req.headers && req.headers.get('x-lunara-ops-key')) || '';
  const want = String((deps.env && deps.env.LUNARA_OPS_KEY) || '');
  if (want.length >= 24 && key.length === want.length) {
    let d = 0; for (let i = 0; i < want.length; i++) d |= want.charCodeAt(i) ^ key.charCodeAt(i);
    if (d === 0) return { owner: false, actor: 'ops-key' };
  }
  return null;
}

export async function osRoute(name, req, body, deps, h) {
  const { json, sha256hex } = h;
  const now = deps.now();

  if (name === 'systemStatus') {
    const t0 = Date.now();
    let database = { status: 'unknown' };
    try {
      if (!deps.db.ping) database = { status: 'unknown', note: 'no probe' };
      else { await deps.db.ping(); database = { status: 'operational', latency_ms: Date.now() - t0 }; }
    } catch { database = { status: 'unavailable', latency_ms: Date.now() - t0 }; }
    let signing = { status: 'unknown' };
    try { signing = { status: deps.db.getActiveKey && (await deps.db.getActiveKey()) ? 'configured' : 'not_configured', note: 'Agent-passport signing key; created when the first passport is issued.' }; } catch { signing = { status: 'unknown' }; }
    let lastScan = null;
    try { const s = deps.db.recentScans ? await deps.db.recentScans(1) : null; lastScan = s && s[0] ? iso(s[0].scanned_at) : null; } catch { lastScan = null; }
    const lastScanAge = lastScan ? now - Date.parse(lastScan) : null;
    return json({
      success: true,
      checked_at: iso(now),
      service: 'lunara-registry',
      protocol_version: h.PROTOCOL,
      components: {
        api: { status: 'operational', note: 'This answer came from the function.' },
        database,
        mail: { status: deps.mail ? 'configured' : 'not_configured', note: deps.mail ? 'A mail provider key is set; delivery itself is not tested here.' : 'No mail provider key: nothing is emailed.' },
        model: { status: deps.ai ? 'configured' : 'not_configured', note: 'The language model behind the public chat.' },
        signing,
        passport_rescans: {
          status: lastScanAge == null ? 'unknown' : lastScanAge <= 2 * 3600e3 ? 'operational' : lastScanAge <= DAY ? 'degraded' : 'unavailable',
          last_run: lastScan,
          note: 'The hourly rescan job (passport-tick). Judged by the newest stored scan.'
        }
      }
    });
  }

  // Who is this session, as the server sees it? The shell asks once per
  // page so it can show owner commands; the routes behind those commands
  // check again on every call, so a forged answer here unlocks nothing.
  if (name === 'osSession') {
    const who = deps.whoIs ? await deps.whoIs(body.session_token) : null;
    if (!who) return json({ success: true, signed_in: false, owner: false });
    return json({ success: true, signed_in: true, owner: !!h.isOwner(who.email, deps.env), email: who.email, checked_at: iso(now) });
  }

  if (name === 'activityFeed') {
    const since = body.since && Date.parse(body.since) ? Date.parse(body.since) : null;
    const limit = Math.max(1, Math.min(100, Number(body.limit) || 40));
    const { events, sources } = await publicEvents(deps, h, since);
    return json({ success: true, generated_at: iso(now), scope: 'public', sources, count: Math.min(events.length, limit), events: events.slice(0, limit) });
  }

  if (name === 'opsActivity' || name === 'auditLog') {
    const auth = await ownerOrAgent(req, body, deps, h);
    if (!auth) return json({ success: false, error: 'Owner sign-in required.' }, 403);

    if (name === 'auditLog') {
      if (!auth.owner) return json({ success: false, error: 'The audit log is for the owner only.' }, 403);
      let rows;
      try { rows = (deps.db.auditList ? await deps.db.auditList(1000) : null); } catch { rows = null; }
      if (!rows) return json({ success: false, status: 'not_configured', error: 'The audit store is not installed yet, so no decision has been recorded in it. Decisions themselves still work.' }, 503);
      const chain = await checkChain(rows, sha256hex);
      return json({ success: true, generated_at: iso(now), count: rows.length, chain, records: rows.slice(-300).reverse(),
        limits: 'The chain shows whether records were altered after the fact relative to one another. Whoever controls the database could rewrite all of it consistently; compare the head hash with a copy you kept.' });
    }

    const [pub, orders, apps, partners, allAgents, subs, audit] = await Promise.all([
      publicEvents(deps, h, null),
      deps.db.listOrders().catch(() => null),
      deps.db.listApplications().catch(() => null),
      deps.db.listPartners ? deps.db.listPartners().catch(() => null) : null,
      deps.db.netListAgents ? deps.db.netListAgents(['member', 'associate', 'fellow', 'warden']).catch(() => null) : null,
      deps.db.misList ? deps.db.misList().catch(() => null) : null,
      deps.db.auditList ? deps.db.auditList(30).catch(() => null) : null
    ]);
    const ev = pub.events.slice();
    const sources = { ...pub.sources, stripe_orders: orders ? 'ok' : 'unavailable', registry_applications: apps ? 'ok' : 'unavailable', registry_partners: partners ? 'ok' : 'unavailable', admin_audit: audit ? 'ok' : 'unavailable' };
    const who = (s) => (auth.owner ? s : null); // the ops key sees figures, never names or emails
    for (const o of orders || []) {
      if (o.livemode === false) continue;
      if (o.paid_at) ev.push({ id: `ord:${o.order_ref}:paid`, type: 'payment.confirmed', at: iso(o.paid_at), source: 'stripe_orders', private: true,
        title: `Payment confirmed: ${o.product}`, subject: o.order_ref, detail: `${(o.amount_total / 100).toFixed(2)} ${String(o.currency || 'usd').toUpperCase()}${o.subscription_id ? ' · subscription' : ''}`, link: null });
      else if (o.status === 'open') ev.push({ id: `ord:${o.order_ref}:open`, type: 'checkout.opened', at: iso(o.created_at), source: 'stripe_orders', private: true,
        title: `Checkout opened: ${o.product}`, subject: o.order_ref, detail: 'not paid', link: null });
    }
    for (const a of apps || []) {
      ev.push({ id: `app:${a.public_id}:created`, type: 'application.received', at: iso(a.created_at), source: 'registry_entries', private: true,
        title: `Application ${a.public_id}${who(a.business_name) ? ': ' + a.business_name : ''}`, subject: a.public_id, detail: `${a.status}${a.domain_verified_at ? ' · DNS seen' : ''}`, link: 'https://lunarasociety.com/desk.html' });
    }
    for (const p of partners || []) {
      ev.push({ id: `par:${p.code}`, type: 'partner.applied', at: iso(p.created_at), source: 'registry_partners', private: true,
        title: `Partner ${p.code}${who(p.partner_name) ? ': ' + p.partner_name : ''}`, subject: p.code, detail: `${p.partner_type} · ${p.status}`, link: 'https://lunarasociety.com/desk.html' });
    }
    for (const a of allAgents || []) {
      if (a.tier !== 'member') continue; // listed agents are already public events
      ev.push({ id: `net:${a.agent_id}:joined`, type: 'agent.joined', at: iso(a.created_at), source: 'network_agents', private: true,
        title: `${a.name} joined (unlisted member)`, subject: a.agent_id, detail: who(`operated by ${a.operator_name}`), link: null });
    }
    for (const m of subs || []) {
      ev.push({ id: `mis:${m.id}:submitted`, type: 'mission.submitted', at: iso(m.created_at), source: 'mission_submissions', private: true,
        title: `Mission ${m.mission} submitted by ${m.agent_id}`, subject: String(m.id), detail: m.status, link: 'https://lunarasociety.com/desk.html' });
    }
    if (auth.owner) {
      for (const r of audit || []) {
        ev.push({ id: `aud:${r.seq}`, type: 'admin.action', at: iso(r.at), source: 'admin_audit', private: true,
          title: `${r.action} · ${r.target || ''}`.trim(), subject: r.correlation_id, detail: `${r.outcome}${r.reason ? ' · ' + r.reason.slice(0, 120) : ''}`, link: 'https://lunarasociety.com/audit.html' });
      }
    }
    // De-duplicated by id: the same row can be reached two ways.
    const seen = new Set();
    const events = ev.filter((e) => e.at && !seen.has(e.id) && seen.add(e.id)).sort(sortDesc).slice(0, 150);

    // The queue: things that are waiting on a human, oldest first within
    // each kind, ordered by what blocks a customer soonest.
    const queue = [];
    const age = (t) => Math.round((now - Date.parse(t)) / 3600e3);
    for (const a of apps || []) {
      if (!['pending', 'returned'].includes(a.status)) continue;
      queue.push({ kind: 'application', id: a.public_id, title: `${a.public_id}${who(a.business_name) ? ' · ' + a.business_name : ''}`,
        urgency: a.domain_verified_at ? (a.order_ref ? 1 : 2) : 4, waiting_hours: age(a.created_at),
        why: a.domain_verified_at ? (a.order_ref ? 'Paid, DNS proven: ready for a decision' : 'DNS proven: ready for a decision') : 'Waiting for the applicant\'s DNS record', link: 'https://lunarasociety.com/desk.html' });
    }
    for (const m of subs || []) {
      if (m.status !== 'pending') continue;
      queue.push({ kind: 'mission', id: String(m.id), title: `${m.mission} from ${m.agent_id}`, urgency: 3, waiting_hours: age(m.created_at), why: 'Mission submission awaiting review', link: 'https://lunarasociety.com/desk.html' });
    }
    for (const p of partners || []) {
      if (p.status !== 'pending') continue;
      queue.push({ kind: 'partner', id: p.code, title: `${p.code}${who(p.partner_name) ? ' · ' + p.partner_name : ''}`, urgency: 3, waiting_hours: age(p.created_at), why: 'Partner application awaiting approval', link: 'https://lunarasociety.com/desk.html' });
    }
    queue.sort((a, b) => a.urgency - b.urgency || b.waiting_hours - a.waiting_hours);
    return json({ success: true, generated_at: iso(now), scope: auth.owner ? 'owner' : 'ops-key', sources, events, queue });
  }
  return null;
}
