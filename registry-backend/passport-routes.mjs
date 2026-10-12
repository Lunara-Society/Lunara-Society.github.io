/* ═══════════════════════════════════════════════════════════════════
   PASSPORT ROUTES — what lunara-registry serves around a scan
   ═══════════════════════════════════════════════════════════════════

   passportScan      scan one domain now and keep the result
   passportBadge     the latest passport of a domain, for the free badge
                     (rescanned when older than a week, once a day at most)
   passportLeague    the league table: every listed domain, ranked
   passportTick      the scheduler's knock: rescans the stalest listed or
                     watched domains, a few per call, and tells watchers
                     when a passport got worse. Anyone may knock; it only
                     works on what is stale, so knocking twice does nothing.
   passportWatch     ask for an email when a domain's passport gets worse
   passportWatchSet  confirm or stop a watch, by the token in the email
   passportLead      "email me the full report": the report goes to the
                     visitor, the lead to the owner

   Passport Monitor (sold by lunara-checkout) is a watch tied to a paid
   order: its domain is rescanned daily rather than weekly, scanned
   first, its watcher gets a weekly summary as well as the alerts, and
   the badge and the league mark it as monitored. When the subscription
   lapses lunara-checkout ends the watch and all of that stops.

   The badge and the league read stored scans. Only passportScan and the
   tick reach the network, and both are rate limited.
   ═══════════════════════════════════════════════════════════════════ */

import { passportScan } from './passport.mjs';

export const PASSPORT_LIMIT_HOUR = 30;
export const BADGE_GRADES = ['A+', 'A', 'B'];
const GRADE_RANK = { F: 0, D: 1, C: 2, B: 3, A: 4, 'A+': 5 };
const DAY = 86400e3;
const STALE = 6.5 * DAY;
const MONITOR_STALE = 20 * 3600e3;   // daily, with slack for the schedule
const TICK_BATCH = 6;
const SITE = 'https://lunarasociety.com/';
const EMAIL = /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[a-z]{2,}$/i;

const passportUrl = (d) => `${SITE}passport.html?d=${encodeURIComponent(d)}`;

function row(scan) {
  return { domain: scan.domain, score: scan.score, grade: scan.grade, visa: scan.visa, checks: scan.checks, scanned_at: scan.scanned_at };
}
function brief(r) {
  return r && {
    domain: r.domain, score: r.score, grade: r.grade, visa: r.visa, scanned_at: r.scanned_at,
    prev_score: r.prev_score ?? null, prev_grade: r.prev_grade ?? null,
    passed: Array.isArray(r.checks) ? r.checks.filter((c) => c.pass).map((c) => c.id) : []
  };
}

/* What got worse between two scans, in plain words. Empty when nothing did. */
export function worsened(before, after) {
  if (!before || !after) return [];
  const out = [];
  if (GRADE_RANK[after.grade] < GRADE_RANK[before.grade]) out.push(`Grade fell from ${before.grade} to ${after.grade} (${before.score} → ${after.score}).`);
  else if (after.score <= before.score - 5) out.push(`Score fell from ${before.score} to ${after.score}.`);
  const was = new Map((before.checks || []).map((c) => [c.id, c]));
  for (const c of after.checks || []) {
    if (was.get(c.id)?.pass && !c.pass) out.push(`${c.label} stopped passing: ${c.detail}. Fix: ${c.fix}`);
  }
  return out;
}

async function rescan(domain, deps, roll) {
  const scan = await passportScan(domain, deps);
  const old = await deps.db.getPassport(domain);
  const r = row(scan);
  if (roll && old) Object.assign(r, { prev_score: old.score, prev_grade: old.grade, prev_scanned_at: old.scanned_at });
  await deps.db.savePassport(r);
  return { scan, old };
}

export async function passportRoute(name, body, deps, ipHash, h) {
  const { json, normDomain, limited, send, mailHtml, randomToken } = h;
  const now = deps.now();
  const canScan = !!(deps.resolve && deps.fetchPage);

  switch (name) {
    case 'passportScan': {
      const domain = normDomain(body.domain);
      if (!domain) return json({ success: false, error: 'Send a domain, for example example.com.' }, 400);
      if (!canScan) return json({ success: false, error: 'Scanning is not available here.' }, 503);
      if (await limited('passport', ipHash, PASSPORT_LIMIT_HOUR, deps)) {
        return json({ success: false, error: `That is ${PASSPORT_LIMIT_HOUR} scans in an hour from here. Try again later.` }, 429);
      }
      const { scan } = await rescan(domain, deps, false);
      return json(scan);
    }

    case 'passportBadge': {
      const domain = normDomain(body.domain);
      if (!domain) return json({ success: false, error: 'domain is required' }, 400);
      let r = await deps.db.getPassport(domain);
      const stale = !r || now - Date.parse(r.scanned_at) > 7 * DAY;
      // One rescan per domain per day, whoever asks: the badge can never
      // be used to make us scan a site over and over.
      if (stale && canScan && !(await limited('badge', 'badge:' + domain, 1, deps, DAY))) {
        try { r = row((await rescan(domain, deps, false)).scan); } catch (e) { /* keep the stored one */ }
      }
      if (!r) return json({ success: true, domain, found: false, eligible: false, passport: passportUrl(domain) });
      const fresh = now - Date.parse(r.scanned_at) <= 30 * DAY;
      const monitored = !!(deps.db.monitorFor && await deps.db.monitorFor(domain).catch(() => null));
      return json({
        success: true, found: true, ...brief(r), fresh, monitored,
        // What each check earned on that scan, partial credit included, so
        // the scenario lab (simulate.html) starts from the measured score.
        earned: Array.isArray(r.checks) ? Object.fromEntries(r.checks.map((c) => [c.id, c.earned])) : null,
        eligible: fresh && BADGE_GRADES.includes(r.grade),
        passport: passportUrl(domain)
      });
    }

    case 'passportLeague': {
      const list = (await deps.leagueList().catch(() => null)) || [];
      const names = new Map(list.map((e) => [e.domain, e]));
      const rows = (await deps.db.getPassports(list.map((e) => e.domain))) || [];
      const monitored = new Set((deps.db.monitoredDomains ? await deps.db.monitoredDomains().catch(() => []) : []) || []);
      const all = rows.filter((r) => names.has(r.domain)).map((r) => ({ ...brief(r), name: names.get(r.domain).name, category: names.get(r.domain).category || null, monitored: monitored.has(r.domain) }));
      // A site we could not reach over HTTPS was not measured, so it is
      // not ranked: a 0 would read as a verdict on its security.
      const ranked = all.filter((e) => e.passed.includes('https')).sort((a, b) => b.score - a.score || a.domain.localeCompare(b.domain));
      const unreachable = all.filter((e) => !e.passed.includes('https')).map(({ domain, name, scanned_at }) => ({ domain, name, scanned_at }));
      return json({ success: true, listed: list.length, scanned: ranked.length, entries: ranked, unreachable });
    }

    case 'passportTick': {
      if (!canScan) return json({ success: false, error: 'Scanning is not available here.' }, 503);
      if (await limited('tick', 'tick', 60, deps)) return json({ success: true, scanned: [], note: 'Enough knocks this hour.' });
      const league = ((await deps.leagueList().catch(() => null)) || []).map((e) => e.domain);
      const watched = (await deps.db.watchedDomains()) || [];
      const monitored = new Set((deps.db.monitoredDomains ? await deps.db.monitoredDomains() : []) || []);
      const all = [...new Set([...monitored, ...league, ...watched])];
      const stored = new Map(((await deps.db.getPassports(all)) || []).map((r) => [r.domain, r]));
      const age = (d) => (stored.has(d) ? now - Date.parse(stored.get(d).scanned_at) : Infinity);
      // Paying customers first, then the stalest.
      const due = all.filter((d) => age(d) > (monitored.has(d) ? MONITOR_STALE : STALE))
        .sort((a, b) => (monitored.has(b) - monitored.has(a)) || (age(b) - age(a)))
        .slice(0, TICK_BATCH);
      const done = [], alerts = [];
      for (let i = 0; i < due.length; i += 3) {
        await Promise.all(due.slice(i, i + 3).map(async (d) => {
          try {
            const { scan, old } = await rescan(d, deps, true);
            done.push({ domain: d, score: scan.score, grade: scan.grade });
            const why = worsened(old, scan);
            for (const w of (await deps.db.watchersFor(d)) || []) {
              if (why.length) {
                const sent = await send(deps, watchEmail(w, scan, why, mailHtml));
                if (sent) { alerts.push(d); await deps.db.updateWatch(w.token, { last_score: scan.score, last_alert_at: new Date(now).toISOString() }); }
              } else if (w.order_ref && (!w.last_summary_at || now - Date.parse(w.last_summary_at) > STALE)) {
                // Passport Monitor's weekly summary, on the first rescan of each week.
                const sent = await send(deps, summaryEmail(w, scan, old, mailHtml));
                if (sent) await deps.db.updateWatch(w.token, { last_score: scan.score, last_summary_at: new Date(now).toISOString() });
              }
            }
          } catch (e) { done.push({ domain: d, error: 'scan failed' }); }
        }));
      }
      return json({ success: true, due: due.length, scanned: done, alerts: alerts.length });
    }

    case 'passportWatch': {
      const domain = normDomain(body.domain);
      const email = String(body.email || '').trim().toLowerCase().slice(0, 200);
      if (!domain || !EMAIL.test(email)) return json({ success: false, error: 'Send a domain and an email address.' }, 400);
      if (!deps.mail) return json({ success: false, error: 'Email alerts are not switched on yet. Check back soon.' }, 503);
      if (await limited('watch', ipHash, 10, deps)) return json({ success: false, error: 'Too many requests from here. Try again later.' }, 429);
      const existing = await deps.db.findWatch(domain, email);
      const token = existing ? existing.token : randomToken(24);
      if (!existing) await deps.db.createWatch({ token, domain, email, created_at: new Date(now).toISOString() });
      else if (existing.unsubscribed_at) await deps.db.updateWatch(token, { unsubscribed_at: null, confirmed_at: null });
      await send(deps, {
        to: email, subject: `Confirm: alerts for ${domain}`,
        text: `Someone (we hope you) asked Lunara Society to email this address when the passport of ${domain} gets worse.\n\nConfirm: ${SITE}passport.html?watch=${token}\n\nIf it was not you, ignore this email and nothing will be sent.`,
        html: mailHtml([`Someone (we hope you) asked Lunara Society to email this address when the passport of ${domain} gets worse.`,
          `<p><a href="${SITE}passport.html?watch=${token}" style="color:#8a7240">Confirm the alerts</a></p>`,
          'If it was not you, ignore this email and nothing will be sent.'])
      });
      return json({ success: true, message: `Check ${email} and click the link to confirm.` });
    }

    case 'passportLead': {
      const domain = normDomain(body.domain);
      const email = String(body.email || '').trim().toLowerCase().slice(0, 200);
      if (!domain || !EMAIL.test(email)) return json({ success: false, error: 'Send a domain and an email address.' }, 400);
      if (await limited('lead', ipHash, 10, deps)) return json({ success: false, error: 'Too many requests from here. Try again later.' }, 429);
      const r = await deps.db.getPassport(domain);
      if (!r) return json({ success: false, error: 'Scan the domain first.' }, 404);
      const failing = (r.checks || []).filter((c) => !c.pass);
      await deps.db.createLead({ organization: domain, system: 'passport', score: r.score, grade: r.grade, gaps: failing.map((c) => c.label), email, product: 'passport' });
      const emailed = await send(deps, reportEmail(r, email, mailHtml));
      if (h.ownerEmail) {
        await send(deps, { to: h.ownerEmail(deps.env), subject: `Lead: ${domain} (${r.grade}, ${r.score}/100) asked for the passport report`,
          text: `${email} asked for the full passport report of ${domain}: grade ${r.grade}, ${r.score}/100, ${failing.length} checks failing (${failing.map((c) => c.label).join('; ') || 'none'}).\n\nPassport: ${passportUrl(domain)}\nEvery lead: ${SITE}desk.html` });
      }
      return json({ success: true, emailed, message: emailed ? `The report is on its way to ${email}.` : 'Your report is ready below.' });
    }

    case 'passportWatchSet': {
      const token = String(body.token || '').toLowerCase();
      if (!/^[a-z0-9]{24}$/.test(token)) return json({ success: false, error: 'That link is not valid.' }, 400);
      const w = await deps.db.getWatch(token);
      if (!w) return json({ success: false, error: 'That link is not valid.' }, 404);
      const stop = body.action === 'stop';
      await deps.db.updateWatch(token, stop ? { unsubscribed_at: new Date(now).toISOString() } : { confirmed_at: new Date(now).toISOString(), unsubscribed_at: null });
      return json({ success: true, domain: w.domain, watching: !stop,
        message: stop ? `No more alerts for ${w.domain}.` : `Confirmed. We rescan ${w.domain} every week and email you if its passport gets worse.` });
    }
  }
  return null;
}

const escHtml = (x) => String(x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/* The full report a visitor asked for: every check, what failed, the fix
   for each, and where to go next. */
export function reportEmail(r, to, mailHtml) {
  const checks = r.checks || [];
  const failing = checks.filter((c) => !c.pass);
  const lines = failing.map((c, i) => `${i + 1}. ${c.label}${c.partial ? ' (partly)' : ''}: ${c.detail || 'missing'}. Fix: ${c.fix || 'see the passport page'}`);
  const url = passportUrl(r.domain);
  return {
    to,
    subject: `Passport report for ${r.domain}: ${r.grade}, ${r.score}/100`,
    text: [
      `${r.domain} scores ${r.score}/100, grade ${r.grade}, on the public signals Lunara checks.`,
      '', failing.length ? `WHAT TO FIX (${failing.length})` : 'Every check passes.', ...lines,
      '', `Passed: ${checks.filter((c) => c.pass).map((c) => c.label).join('; ') || 'none'}.`,
      '', `Full passport: ${url}`,
      `Keep it watched (daily rescans, alerts, the Monitored badge): ${url}#monitor`,
      `Get the business behind it verified by a person: ${SITE}shield.html`,
      '', 'Lunara Society · lunarasociety.com'
    ].join('\n'),
    html: mailHtml([
      `${r.domain} scores ${r.score}/100, grade ${r.grade}, on the public signals Lunara checks.`,
      failing.length ? `<p style="margin:18px 0 4px;font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#8a7240">What to fix (${failing.length})</p><ol style="padding-left:20px;margin:0">${failing.map((c) => `<li style="margin:6px 0"><b>${escHtml(c.label)}</b>${c.partial ? ' (partly)' : ''}: ${escHtml(c.detail || 'missing')}.<br><span style="color:#6b6252">Fix: ${escHtml(c.fix || 'see the passport page')}</span></li>`).join('')}</ol>` : '<p>Every check passes.</p>',
      `<p><a href="${url}" style="display:inline-block;background:#c9a84c;color:#111;padding:10px 18px;border-radius:999px;text-decoration:none">Open the full passport</a></p>`,
      `<p style="font-size:14px">Keep it watched: <a href="${url}#monitor" style="color:#8a7240">Passport Monitor</a> rescans daily, emails you the moment anything slips and gives your site the live Monitored badge. Want the business behind it verified by a person? <a href="${SITE}shield.html" style="color:#8a7240">Shield Verification</a>.</p>`
    ])
  };
}

/* Passport Monitor's weekly note: where the grade stands and what moved. */
export function summaryEmail(w, scan, old, mailHtml) {
  const moved = old && typeof old.score === 'number' && old.score !== scan.score ? ` (from ${old.score})` : '';
  const failing = (scan.checks || []).filter((c) => !c.pass);
  const url = passportUrl(scan.domain);
  const stop = `${SITE}manage.html${w.order_ref ? '?order=' + w.order_ref : ''}`;
  return {
    to: w.email,
    subject: `${scan.domain} this week: ${scan.grade}, ${scan.score}/100`,
    text: [`Passport Monitor, weekly summary for ${scan.domain}.`, '', `Grade ${scan.grade}, ${scan.score}/100${moved}. Rescanned every day; nothing got worse since the last check.`,
      failing.length ? `Still open: ${failing.map((c) => c.label).join('; ')}. Each one's fix is on the passport page.` : 'Every check passes.',
      '', `Passport: ${url}`, `Your subscription: ${stop}`].join('\n'),
    html: mailHtml([`Passport Monitor, weekly summary for ${scan.domain}.`,
      `Grade ${scan.grade}, ${scan.score}/100${moved}. Rescanned every day; nothing got worse since the last check.`,
      failing.length ? `Still open: ${failing.map((c) => c.label).join('; ')}. Each one's fix is on the passport page.` : 'Every check passes.',
      `<p><a href="${url}" style="color:#8a7240">Open the passport</a> · <a href="${stop}" style="color:#8a7240">Your subscription</a></p>`])
  };
}

function watchEmail(w, scan, why, mailHtml) {
  const stop = `${SITE}passport.html?watch=${w.token}&stop=1`;
  return {
    to: w.email,
    subject: `${scan.domain}: passport got worse (${scan.grade}, ${scan.score}/100)`,
    text: [`The weekly rescan of ${scan.domain} found:`, ...why.map((x) => '- ' + x), '', `Full passport: ${passportUrl(scan.domain)}`, `Stop these alerts: ${stop}`].join('\n'),
    html: mailHtml([`The weekly rescan of ${scan.domain} found:`,
      `<ul>${why.map((x) => `<li>${x.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</li>`).join('')}</ul>`,
      `<p><a href="${passportUrl(scan.domain)}" style="color:#8a7240">Open the full passport</a> · <a href="${stop}" style="color:#8a7240">Stop these alerts</a></p>`])
  };
}
