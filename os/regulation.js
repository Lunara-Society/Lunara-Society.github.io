/* Regulatory Intelligence (regulation.html): the signed corpus, with every
   date computed against the reader's today and the corpus's own signature
   checked before anything is shown as verified. */
import { verifyAssertion, STATE_TEXT } from '/os/evidence.mjs';
import { status as obligationStatus } from '/os/dates.mjs';

const OS = window.LunaraOS;
const esc = OS.esc;
const $ = (id) => document.getElementById(id);
let corpus = null, rows = [], sig = null, readAt = null;
const today = () => new Date().toISOString().slice(0, 10);

function provenance() {
  const s = sig ? OS.stateTag({ verified: 'verified', failed: 'failed', expired: 'expired', revoked: 'revoked', partial: 'partial' }[sig.state] || 'unknown', STATE_TEXT[sig.state]) : OS.stateTag('checking', 'Checking signature');
  $('rg-prov').innerHTML = `
    <div><span class="os-label">Corpus</span>${esc(corpus ? 'version ' + corpus.version + ' · ' + corpus.count + ' obligations' : '…')}</div>
    <div><span class="os-label">Signature, checked here</span>${s}${sig ? `<div class="os-note" style="margin-top:6px">${esc(sig.summary)}</div>` : ''}</div>
    <div><span class="os-label">Last checked against sources</span>${esc(corpus ? rows.map((o) => o.verified).sort().slice(-1)[0] + ' (newest) · ' + rows.map((o) => o.verified).sort()[0] + ' (oldest)' : '…')}</div>
    <div><span class="os-label">Monitoring</span>${OS.stateTag('not_configured', 'Not automated')}<div class="os-note" style="margin-top:6px">Maintained by hand; see below.</div></div>`;
}

function timeline() {
  const W = $('rg-time').clientWidth || 900, H = 150;
  const ds = rows.map((o) => Date.parse(o.applies_from)).concat(Date.now());
  const lo = Math.min(...ds) - 60 * 864e5, hi = Math.max(...ds) + 90 * 864e5;
  const x = (t) => 10 + (t - lo) / (hi - lo) * (W - 20);
  const years = []; for (let y = new Date(lo).getUTCFullYear() + 1; y <= new Date(hi).getUTCFullYear(); y++) years.push(y);
  const lanes = {};
  const dots = rows.slice().sort((a, b) => a.applies_from.localeCompare(b.applies_from)).map((o) => {
    const k = o.applies_from; lanes[k] = (lanes[k] || 0) + 1;
    const st = obligationStatus(o.applies_from, today());
    return `<circle tabindex="0" role="button" aria-label="${esc(o.name + ', ' + o.jurisdiction + ', applies from ' + o.applies_from)}" data-id="${esc(o.id)}" cx="${x(Date.parse(o.applies_from))}" cy="${92 - (lanes[k] - 1) * 18}" r="6" fill="${st.applies ? '#58C79A' : '#C6A15B'}" fill-opacity="${st.applies ? .55 : .9}" stroke="#08090C" stroke-width="2"><title>${esc(o.applies_from + ' · ' + o.name)}</title></circle>`;
  }).join('');
  const nx = x(Date.now());
  $('rg-time').innerHTML = `<svg viewBox="0 0 ${W} ${H}" aria-label="Timeline of application dates" role="group">
    <line x1="0" x2="${W}" y1="110" y2="110" stroke="rgba(198,203,211,.18)"/>
    ${years.map((y) => { const t = Date.UTC(y, 0, 1); return `<line x1="${x(t)}" x2="${x(t)}" y1="104" y2="116" stroke="rgba(198,203,211,.3)"/><text class="lbl" x="${x(t)}" y="134" text-anchor="middle">${y}</text>`; }).join('')}
    <line x1="${nx}" x2="${nx}" y1="20" y2="118" stroke="#F0D99B" stroke-dasharray="3 4"/><text class="now" x="${nx}" y="14" text-anchor="middle">today ${today()}</text>
    ${dots}</svg>`;
  $('rg-time').querySelectorAll('circle').forEach((c) => {
    c.addEventListener('click', () => inspect(c.dataset.id));
    c.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inspect(c.dataset.id); } });
  });
}

function filtered() {
  const q = $('rg-q').value.trim().toLowerCase(), j = $('rg-j').value, s = $('rg-s').value;
  return rows.filter((o) => (!j || o.jurisdiction === j) && (!s || (s === 'applies') === obligationStatus(o.applies_from, today()).applies) &&
    (!q || [o.name, o.summary, o.article, o.instrument, o.id].join(' ').toLowerCase().includes(q)));
}
function table() {
  const list = filtered();
  $('rg-rows').innerHTML = list.length ? list.map((o) => {
    const st = obligationStatus(o.applies_from, today());
    return `<tr data-pick="${esc(o.id)}" tabindex="0" id="row-${esc(o.id)}"><td><div style="color:var(--os-text)">${esc(o.name)}</div><div class="os-note">${esc(o.instrument)}</div></td><td>${esc(o.jurisdiction)}</td>
      <td class="os-num">${esc(o.applies_from)}</td><td>${OS.stateTag(st.applies ? 'operational' : 'pending', st.text)}</td><td style="max-width:260px;font-size:12px">${esc(o.article)}</td>
      <td>${OS.trust(o.classification === 'verified' ? 'verified' : 'unverified', o.classification + ' ' + o.verified, 'Date and article checked against the primary source on this day.')}</td><td><a href="${esc(o.source)}" rel="noopener" target="_blank">Official source</a></td></tr>`;
  }).join('') : '<tr><td colspan="7"><div class="os-empty"><strong>No obligation matches</strong><p>Clear a filter to see the rest.</p></div></td></tr>';
  $('rg-rows').querySelectorAll('tr[data-pick]').forEach((tr) => {
    tr.addEventListener('click', () => inspect(tr.dataset.pick));
    tr.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inspect(tr.dataset.pick); } });
  });
}

function inspect(id) {
  const o = rows.find((x) => x.id === id); if (!o) return;
  document.querySelectorAll('#rg-rows tr').forEach((x) => x.removeAttribute('aria-selected'));
  const tr = $('row-' + id); if (tr) tr.setAttribute('aria-selected', 'true');
  const st = obligationStatus(o.applies_from, today());
  OS.inspect({
    key: 'law:' + o.id, href: '/regulation.html#' + o.id, kind: 'Obligation · ' + o.jurisdiction, title: o.name, subtitle: o.instrument, source: 'corpus/obligations.json', asOf: readAt,
    sections: [
      { label: 'As of today', html: OS.stateTag(st.applies ? 'operational' : 'pending', st.text) + `<p class="os-note" style="margin:8px 0 0">Computed now from applies_from (${esc(o.applies_from)}, UTC midnight) and your clock. It is the date the obligation begins to bind, not a filing deadline.</p>` },
      { label: 'Source', html: `<p>${OS.trust('verified', 'Primary source', 'The official instrument. Lunara links it rather than reproducing it.')} <a href="${esc(o.source)}" target="_blank" rel="noopener">${esc(o.source)}</a></p>` + OS.kv([['Instrument', o.instrument], ['Article', o.article], ['Amended by', o.amended_by], ['Checked', o.classification + ' on ' + o.verified]]) },
      { label: 'Lunara\'s summary', html: `<p>${OS.trust('declared', 'Lunara\'s words', 'An editorial summary written against the source. Read the source before relying on it.')}</p><p>${esc(o.summary)}</p>` + (o.penalty ? `<p class="os-note">Penalty, as stated in the corpus: ${esc(typeof o.penalty === 'string' ? o.penalty : JSON.stringify(o.penalty))}</p>` : '') },
      { label: 'What this is not', html: '<p class="os-note">Not legal advice and not a determination that this obligation applies to you. The applicability model on check.html is Lunara\'s interpretation, marked as such.</p>' }
    ],
    actions: [
      { label: 'Does it reach my AI?', href: '/check.html', primary: true },
      { label: 'Ask Rosario (AI, unsourced)', href: '/investigate.html?ask=' + encodeURIComponent('Explain ' + o.name + ' (' + o.article + ') in plain words') },
      { label: 'Report a change (Corpus watch)', href: '/missions.html#corpus-watch' }
    ]
  });
}

async function boot() {
  const [c, env, keys, raw] = await Promise.all([
    OS.request('/corpus/obligations.json'), OS.request('/corpus/obligations.assertion.json'), OS.request('/.well-known/keys.json'),
    fetch('/corpus/obligations.json', { cache: 'no-store' }).then((r) => (r.ok ? r.arrayBuffer() : null)).catch(() => null)
  ]);
  if (!c.ok || !c.json) { $('rg-rows').innerHTML = '<tr><td colspan="7"><div class="os-empty"><strong>The corpus did not load</strong><p>Nothing is shown in its place. The same table is on the Regulatory Record page.</p></div></td></tr>'; return; }
  corpus = c.json; rows = corpus.obligations || []; readAt = c.at;
  [...new Set(rows.map((o) => o.jurisdiction))].forEach((j) => { const op = document.createElement('option'); op.value = j; op.textContent = j; $('rg-j').appendChild(op); });
  provenance(); timeline(); table();
  ['rg-q', 'rg-j', 'rg-s'].forEach((id) => $(id).addEventListener('input', table));
  window.addEventListener('resize', () => timeline());
  sig = env.json && keys.json ? await verifyAssertion(env.json, keys.json, raw ? new Uint8Array(raw) : null) : { state: 'unavailable', summary: 'The signature or key file did not load.' };
  provenance();
  const id = decodeURIComponent(location.hash.slice(1)); if (id && rows.some((o) => o.id === id)) inspect(id);
}
boot();
// The palette links to rows on this page by #id: open them without a reload.
window.addEventListener('hashchange', () => { const id = decodeURIComponent(location.hash.slice(1)); if (rows.some((o) => o.id === id)) inspect(id); });
