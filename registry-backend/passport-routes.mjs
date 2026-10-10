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

   The badge and the league read stored scans. Only passportScan and the
   tick reach the network, and both are rate limited.
   ═══════════════════════════════════════════════════════════════════ */

import { passportScan } from './passport.mjs';

export const PASSPORT_LIMIT_HOUR = 30;
export const BADGE_GRADES = ['A+', 'A', 'B'];
const GRADE_RANK = { F: 0, D: 1, C: 2, B: 3, A: 4, 'A+': 5 };
const DAY = 86400e3;
const STALE = 6.5 * DAY;
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
      return json({
        success: true, found: true, ...brief(r), fresh,
        eligible: fresh && BADGE_GRADES.includes(r.grade),
        passport: passportUrl(domain)
      });
    }

    case 'passportLeague': {
      const list = (await deps.leagueList().catch(() => null)) || [];
      const names = new Map(list.map((e) => [e.domain, e]));
      const rows = (await deps.db.getPassports(list.map((e) => e.domain))) || [];
      const ranked = rows.filter((r) => names.has(r.domain)).map((r) => ({ ...brief(r), name: names.get(r.domain).name, category: names.get(r.domain).category || null }))
        .sort((a, b) => b.score - a.score || a.domain.localeCompare(b.domain));
      return json({ success: true, listed: list.length, scanned: ranked.length, entries: ranked });
    }

    case 'passportTick': {
      if (!canScan) return json({ success: false, error: 'Scanning is not available here.' }, 503);
      if (await limited('tick', 'tick', 60, deps)) return json({ success: true, scanned: [], note: 'Enough knocks this hour.' });
      const league = ((await deps.leagueList().catch(() => null)) || []).map((e) => e.domain);
      const watched = (await deps.db.watchedDomains()) || [];
      const all = [...new Set([...league, ...watched])];
      const stored = new Map(((await deps.db.getPassports(all)) || []).map((r) => [r.domain, r]));
      const due = all.filter((d) => !stored.has(d) || now - Date.parse(stored.get(d).scanned_at) > STALE)
        .sort((a, b) => (Date.parse(stored.get(a)?.scanned_at || 0)) - (Date.parse(stored.get(b)?.scanned_at || 0)))
        .slice(0, TICK_BATCH);
      const done = [], alerts = [];
      for (let i = 0; i < due.length; i += 3) {
        await Promise.all(due.slice(i, i + 3).map(async (d) => {
          try {
            const { scan, old } = await rescan(d, deps, true);
            done.push({ domain: d, score: scan.score, grade: scan.grade });
            const why = worsened(old, scan);
            if (!why.length) return;
            for (const w of (await deps.db.watchersFor(d)) || []) {
              const sent = await send(deps, watchEmail(w, scan, why, mailHtml));
              if (sent) { alerts.push(d); await deps.db.updateWatch(w.token, { last_score: scan.score, last_alert_at: new Date(now).toISOString() }); }
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
