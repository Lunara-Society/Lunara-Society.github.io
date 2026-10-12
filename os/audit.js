/* Activity and Audit (audit.html). The public stream from activityFeed;
   the owner's chain from auditLog, re-verified here with the very code the
   server runs (registry-backend/os.mjs), so the two cannot drift apart. */
import { checkChain, auditHash, AUDIT_GENESIS } from '/registry-backend/os.mjs';


const OS = window.LunaraOS;
const esc = OS.esc;
const $ = (id) => document.getElementById(id);
const sha256hex = async (s) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))), (x) => x.toString(16).padStart(2, '0')).join('');

let events = [], filter = 'all', feedAt = null;
const KINDS = { all: 'All', register: 'Register', passport: 'Passports', agent: 'Agents', mission: 'Missions', trial: 'Trials' };

function paintFilters() {
  $('au-filters').innerHTML = Object.entries(KINDS).map(([k, v]) => `<button type="button" class="os-chip" data-k="${k}" aria-pressed="${filter === k}">${esc(v)}${k === 'all' ? '' : ' <span class="os-num">' + events.filter((e) => e.type.startsWith(k)).length + '</span>'}</button>`).join('');
  $('au-filters').querySelectorAll('[data-k]').forEach((b) => b.addEventListener('click', () => { filter = b.dataset.k; paintFilters(); paintFeed(); }));
}
function paintFeed() {
  const list = events.filter((e) => filter === 'all' || e.type.startsWith(filter));
  if (!list.length) {
    $('au-feed').innerHTML = `<div class="os-empty">${OS.icon('audit')}<strong>${events.length ? 'Nothing of this kind yet' : 'Nothing recorded yet'}</strong><p>Register decisions, rescans of the league's domains, agents joining, trials passed and missions approved appear here when they are recorded. Nothing is generated to fill the space.</p></div>`;
    return;
  }
  $('au-feed').innerHTML = '<table class="os-table"><thead><tr><th scope="col">When (UTC)</th><th scope="col">Kind</th><th scope="col">Event</th><th scope="col">Source</th></tr></thead><tbody>' +
    list.map((e, i) => `<tr data-pick="${i}" tabindex="0"><td class="os-num" style="white-space:nowrap">${esc(OS.day(e.at))} ${esc(OS.utc(e.at).replace(' UTC', ''))}</td><td><span class="os-eyebrow" style="font-size:9.5px">${esc(e.type)}</span></td><td><div style="color:var(--os-text)">${esc(e.title)}</div>${e.detail ? `<div class="os-note">${esc(e.detail)}</div>` : ''}</td><td class="os-src">${esc(e.source)}</td></tr>`).join('') + '</tbody></table>';
  $('au-feed').querySelectorAll('tr[data-pick]').forEach((tr) => {
    const open = () => {
      const e = list[+tr.dataset.pick];
      $('au-feed').querySelectorAll('tr').forEach((x) => x.removeAttribute('aria-selected')); tr.setAttribute('aria-selected', 'true');
      OS.inspect({ key: e.id, kind: 'Event · ' + e.type, title: e.title, source: e.source, asOf: feedAt,
        sections: [{ label: 'Recorded', kv: [['When', OS.stamp(e.at)], ['Subject', e.subject], ['Detail', e.detail], ['Event id', e.id]] },
          { label: 'Provenance', html: `<p>${OS.trust('observed', 'Recorded', 'Read from the table named, as it stood when this page asked.')} Read from <code>${esc(e.source)}</code>. The time is when that table recorded it, by the application's clock.</p>` }],
        actions: e.link ? [{ label: 'Open the record', href: e.link, primary: true }] : [] });
    };
    tr.addEventListener('click', open);
    tr.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); open(); } });
  });
}
async function loadFeed() {
  const r = await OS.track(OS.reg('activityFeed', { limit: 100 }));
  if (r.ok && r.json && r.json.success) {
    events = r.json.events || []; feedAt = r.at;
    const bad = Object.entries(r.json.sources || {}).filter(([, v]) => v !== 'ok').map(([k]) => k);
    $('au-fresh').textContent = 'read ' + OS.utc(r.at) + (bad.length ? ' · unavailable: ' + bad.join(', ') : '');
    paintFilters(); paintFeed(); OS.refreshed('activityFeed');
  } else {
    $('au-feed').innerHTML = `<div class="os-empty"><strong>The activity record did not answer</strong><p>${esc(r.status === 404 ? 'The activity route is not deployed yet.' : 'The registry answered ' + (r.status || 'nothing') + '.')} Nothing is shown in its place.</p></div>`;
    $('au-fresh').textContent = 'unavailable';
  }
}
$('au-export').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify({ exported_at: new Date().toISOString(), source: OS.REG + '/activityFeed', read_at: feedAt, events }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'lunara-activity-' + new Date().toISOString().slice(0, 10) + '.json'; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});

/* ── the chain ─────────────────────────────────────────────────── */
async function walkFrom(rows, prev) {
  for (const x of rows) {
    if (x.prev_hash !== prev) return { intact: false, broken_at: x.seq, reason: 'prev_hash does not match the record before it' };
    if (x.hash !== await auditHash(x, sha256hex)) return { intact: false, broken_at: x.seq, reason: 'the record does not match its own hash' };
    prev = x.hash;
  }
  return { intact: true, length: rows.length };
}
async function loadChain() {
  const box = $('au-chain');
  const s = await OS.session();
  if (!s.signed_in) {
    box.innerHTML = `<div class="os-plate"><div class="os-empty">${OS.icon('trust')}<strong>The audit chain is for the owner</strong><p>Sign in with the owner's account to read it. The page does not hide it behind a button: the server refuses the chain to any other session (HTTP 403), whatever this page shows.</p><a class="os-btn" href="/member.html">Sign in</a></div></div>`;
    return;
  }
  const r = await OS.track(OS.reg('auditLog', { session_token: s.token }));
  if (r.status === 403) {
    box.innerHTML = `<div class="os-plate"><div class="os-empty">${OS.icon('trust')}<strong>Refused by the server</strong><p>This session (${esc(s.email || 'signed in')}) is not the owner's, so the registry answered 403. That refusal is the control; this message only reports it.</p></div></div>`;
    return;
  }
  if (r.status === 503 || (r.json && r.json.status === 'not_configured')) {
    box.innerHTML = `<div class="os-plate"><div class="os-plate-h">${OS.stateTag('not_configured')}</div><div class="os-plate-b"><p>${esc((r.json && r.json.error) || 'The audit store is not installed yet.')}</p><p class="os-note">Installing it is one database migration (the admin_audit table, documented in registry-backend/schema.sql). Until then decisions are made and emailed as before, and each one answers with audited:false so the gap is visible.</p></div></div>`;
    return;
  }
  if (!r.ok || !r.json) {
    box.innerHTML = `<div class="os-plate"><div class="os-empty"><strong>The audit log did not answer</strong><p>${esc(r.status === 404 ? 'The audit route is not deployed yet.' : 'HTTP ' + (r.status || 'none'))}.</p></div></div>`;
    return;
  }
  const records = (r.json.records || []).slice().reverse(); // oldest first, for the walk
  // The page receives the newest 300. A longer chain is walked here from
  // the first record received; the records before it are the server's.
  const partial = r.json.count > records.length && records.length && records[0].prev_hash !== AUDIT_GENESIS;
  const walk = await walkFrom(records, partial ? records[0].prev_hash : AUDIT_GENESIS);
  if (partial) walk.note = 'Walked from record ' + records[0].seq + '; the ' + (r.json.count - records.length) + ' before it are checked by the server only.';
  const server = r.json.chain || {};
  const head = records.length ? records[records.length - 1].hash : AUDIT_GENESIS;
  box.innerHTML = `
    <div class="os-grid c3" style="margin-bottom:18px">
      <div class="os-plate os-plate-b"><span class="os-label">Server's verdict</span><div style="margin-top:12px">${OS.stateTag(server.intact ? 'verified' : 'failed', server.intact ? 'Chain intact' : 'Chain broken')}</div><p class="os-note" style="margin-top:10px">${esc(server.intact ? server.length + ' records checked by the registry.' : 'Breaks at record ' + server.broken_at + ': ' + server.reason)}</p></div>
      <div class="os-plate os-plate-b focal"><span class="os-label">This browser's verdict</span><div style="margin-top:12px">${OS.stateTag(walk.intact ? 'verified' : 'failed', walk.intact ? 'Recomputed: intact' : 'Recomputed: broken')}</div><p class="os-note" style="margin-top:10px">${esc((walk.intact ? records.length + ' hashes recomputed here with SHA-256.' : 'Breaks at record ' + walk.broken_at + ': ' + walk.reason) + (walk.note ? ' ' + walk.note : ''))}</p></div>
      <div class="os-plate os-plate-b"><span class="os-label">Head hash</span><div class="au-hash" style="margin-top:12px">${esc(head)}</div><button type="button" class="os-btn small" id="au-keep" style="margin-top:10px">Download the chain</button></div>
    </div>
    <div class="os-plate"><div class="os-plate-h"><span class="os-eyebrow">${records.length} records, newest first</span><span class="r os-fresh">read ${esc(OS.utc(r.at))}</span></div>
    ${records.length ? '<table class="os-table"><thead><tr><th>#</th><th>When (UTC)</th><th>Actor</th><th>Action</th><th>Target</th><th>Outcome</th><th>Reason</th><th>Correlation</th></tr></thead><tbody>' +
      records.slice().reverse().map((x) => `<tr><td class="os-num">${x.seq}</td><td class="os-num" style="white-space:nowrap">${esc(OS.stamp(x.at))}</td><td>${esc(x.actor)}</td><td><code>${esc(x.action)}</code></td><td><code>${esc(x.target || '')}</code></td><td>${esc(x.outcome)}</td><td style="max-width:260px">${esc(x.reason || '')}</td><td><code title="${esc(x.hash)}">${esc(x.correlation_id)}</code></td></tr>`).join('') + '</tbody></table>'
      : `<div class="os-empty">${OS.icon('audit')}<strong>No decision recorded yet</strong><p>The first approval, rejection, revocation, partner decision, mission decision or passport issue will be the first record, linked to a hash of zeros.</p></div>`}
    </div>`;
  const keep = $('au-keep');
  if (keep) keep.addEventListener('click', () => {
    const blob = new Blob([JSON.stringify({ downloaded_at: new Date().toISOString(), head, count: records.length, records }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'lunara-audit-chain-' + head.slice(0, 12) + '.json'; a.click();
  });
  if (walk.intact && records.length) OS.sound('confirm');
}

function tabs() {
  const set = (which) => {
    const act = which === 'act';
    $('tab-act').setAttribute('aria-selected', act); $('tab-chain').setAttribute('aria-selected', !act);
    $('pan-act').hidden = !act; $('pan-chain').hidden = act;
    if (!act && !tabs.loaded) { tabs.loaded = true; loadChain(); }
  };
  $('tab-act').addEventListener('click', () => set('act'));
  $('tab-chain').addEventListener('click', () => set('chain'));
  [$('tab-act'), $('tab-chain')].forEach((t) => t.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); const other = t.id === 'tab-act' ? $('tab-chain') : $('tab-act'); other.focus(); other.click(); }
  }));
  if (location.hash === '#chain') set('chain');
}
tabs();
loadFeed();
setInterval(() => { if (!document.hidden) loadFeed(); }, 90e3);
// Verification helper for the console, so anyone can re-run it by hand.
window.LunaraAudit = { checkChain, auditHash, sha256hex };
