/* The Evidence Registry (evidence-registry.html). */
import { verifyAssertion, verifyPassport, STATE_TEXT } from '/os/evidence.mjs';

const OS = window.LunaraOS;
const esc = OS.esc;
const $ = (id) => document.getElementById(id);
const docs = []; // { path, subject, envelopeUrl, index, envelope, result }
let keysDoc = null, registerRows = [], registerAt = null;
const tag = (st) => OS.stateTag({ verified: 'verified', partial: 'partial', failed: 'failed', expired: 'expired', revoked: 'revoked', unavailable: 'unknown', unverified: 'unverified' }[st] || 'unknown', STATE_TEXT[st] || st);

async function bytes(url) { try { const r = await fetch(url, { cache: 'no-store' }); return r.ok ? new Uint8Array(await r.arrayBuffer()) : null; } catch { return null; } }
async function json(url) { try { const r = await fetch(url, { cache: 'no-store' }); return r.ok ? await r.json() : null; } catch { return null; } }
const local = (u) => u.replace('https://lunarasociety.com', '');

function paintSummary() {
  const n = (s) => docs.filter((d) => d.result && d.result.state === s).length;
  $('ev-sum').innerHTML = [
    ['Signed documents', docs.length], ['Verified here', n('verified')], ['Failed or unavailable', n('failed') + n('unavailable') + n('revoked') + n('expired')], ['Verified register entries', registerRows.filter((r) => r.status === 'verified').length]
  ].map(([l, v]) => `<div><span class="os-label">${esc(l)}</span><b>${esc(v)}</b></div>`).join('');
}
function paintDocs() {
  $('ev-docs').innerHTML = docs.map((d, i) => {
    const a = d.envelope && d.envelope.assertion;
    return `<tr data-pick="${i}" tabindex="0" id="${esc(d.path)}"><td><div style="color:var(--os-text)">${esc(d.path)}</div><div class="os-note">${esc(d.index.type)}</div></td>
      <td style="max-width:340px;font-size:12.5px">${esc(a ? a.statement.slice(0, 150) + (a.statement.length > 150 ? '…' : '') : 'loading…')}</td>
      <td class="os-num">${esc(OS.day(d.index.issued_at))}</td><td class="os-num">${esc(OS.day(d.index.expires_at))}</td><td><code>${esc(d.index.key_id.slice(0, 18))}…</code></td>
      <td>${d.running ? OS.stateTag('checking', 'Checking') : d.result ? tag(d.result.state) : tag('unverified')}</td></tr>`;
  }).join('');
  $('ev-docs').querySelectorAll('tr[data-pick]').forEach((tr) => {
    const open = () => inspectDoc(+tr.dataset.pick);
    tr.addEventListener('click', open);
    tr.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
  });
  paintSummary();
}
function stepsHtml(steps) {
  return '<ol class="ev-steps">' + steps.map((s) => `<li class="${s.ok === true ? 'ok' : s.ok === false ? 'bad' : 'na'}"><div class="n">${esc(s.name)}</div><div class="d">${esc(s.detail)}</div></li>`).join('') + '</ol>';
}
function inspectDoc(i) {
  const d = docs[i]; const a = d.envelope && d.envelope.assertion; const r = d.result;
  document.querySelectorAll('#ev-docs tr').forEach((x) => x.removeAttribute('aria-selected'));
  const row = document.querySelector(`#ev-docs tr[data-pick="${i}"]`); if (row) row.setAttribute('aria-selected', 'true');
  OS.inspect({
    key: 'doc:' + d.path, href: '/evidence-registry.html#' + encodeURIComponent(d.path), kind: 'Signed document', title: d.path, subtitle: a ? a.type : '', source: 'assertions.json', asOf: r ? r.checked_at : null,
    sections: [
      { label: 'Result', html: (r ? tag(r.state) + `<p style="margin:10px 0 0">${esc(r.summary)}</p>` : tag('unverified') + '<p style="margin:10px 0 0">Not checked yet.</p>') },
      { label: 'The claim', html: a ? `<p>${esc(a.statement)}</p><p class="os-note">Evidence mark in the statement: <code>${esc(a.evidence)}</code></p>` : '' },
      { label: 'Record', kv: a ? [['Subject', a.subject], ['Evidence type', a.type], ['Issued', a.issued_at], ['Expires', a.expires_at], ['Key', a.key_id], ['Digest (SHA-256)', a.claims.digest.value], ['Bytes', a.claims.bytes], ['Verification method', 'Ed25519 over RFC 8785 canonical JSON; SHA-256 of the subject as served']] : [] },
      r ? { label: 'What was checked, step by step', html: stepsHtml(r.steps) } : null,
      { label: 'What this does not establish', html: '<ul class="ev-limits">' + (r ? r.limits : []).map((l) => `<li>${esc(l)}</li>`).join('') + '</ul>' }
    ].filter(Boolean),
    actions: [{ label: 'Verify again', primary: true, run: () => verifyOne(i).then(() => inspectDoc(i)) }, { label: 'Open the document', href: local(d.subject) }, { label: 'Open the signature', href: local(d.envelopeUrl) }]
  });
}
async function verifyOne(i) {
  const d = docs[i];
  d.running = true; paintDocs();
  OS.busy(1);
  try {
    if (!keysDoc) keysDoc = await json('/.well-known/keys.json');
    d.envelope = d.envelope || await json(local(d.envelopeUrl));
    const subject = await bytes(local(d.subject));
    d.result = d.envelope ? await verifyAssertion(d.envelope, keysDoc, subject) : { state: 'unavailable', summary: 'The signature file could not be fetched.', steps: [], limits: [], checked_at: new Date().toISOString() };
  } finally { OS.busy(-1); d.running = false; }
  paintDocs();
  return d.result;
}
async function verifyAll() {
  const results = [];
  for (let i = 0; i < docs.length; i++) results.push(await verifyOne(i));
  $('ev-docs-fresh').textContent = 'verified in this browser ' + OS.utc(new Date());
  const ok = results.every((r) => r.state === 'verified');
  if (ok) OS.sound('confirm');
  OS.toast(ok ? `All ${results.length} signed documents verified in this browser.` : `${results.filter((r) => r.state !== 'verified').length} of ${results.length} documents did not verify. Open them for the reason.`, ok ? 'ok' : 'warn');
}

async function loadDocs() {
  const idx = await json('/.well-known/assertions.json');
  if (!idx) { $('ev-docs').innerHTML = '<tr><td colspan="6"><div class="os-empty"><strong>The assertion index did not load</strong><p>Nothing is shown in its place.</p></div></td></tr>'; return; }
  (idx.assertions || []).forEach((x) => docs.push({ path: local(x.subject).replace(/^\//, ''), subject: x.subject, envelopeUrl: x.assertion, index: x }));
  await Promise.all(docs.map(async (d) => { d.envelope = await json(local(d.envelopeUrl)); }));
  paintDocs();
}

/* ── the register ─────────────────────────────────────────────── */
async function loadRegister() {
  const r = await OS.reg('shieldRegistryList');
  if (!r.ok || !r.json) { $('ev-reg').innerHTML = '<div class="os-empty"><strong>The register did not answer</strong><p>Nothing is shown in its place.</p></div>'; return; }
  registerRows = r.json.entries || []; registerAt = r.at;
  $('ev-reg-fresh').textContent = 'read ' + OS.utc(r.at);
  paintSummary();
  const method = '<p class="os-note" style="margin:0">Method for every entry: the applicant proved control of the domain with a DNS TXT record the registry saw itself; a named reviewer checked the registration against official records and signed the decision. Entries expire after their term and can be revoked, with the reason published.</p>';
  if (!registerRows.length) {
    $('ev-reg').innerHTML = `<div class="os-empty">${OS.icon('evidence')}<strong>No verified entry yet</strong><p>The register holds no business or AI agent that has completed review. That is shown as zero rather than padded: an entry appears here the day a reviewer signs one.</p></div><div class="os-plate-b" style="border-top:1px solid var(--os-hair)">${method}</div>`;
    return;
  }
  $('ev-reg').innerHTML = '<table class="os-table"><thead><tr><th>Entry</th><th>Domain</th><th>Status</th><th>Verified</th><th>Expires</th></tr></thead><tbody>' + registerRows.map((e, i) =>
    `<tr data-pick="${i}" tabindex="0"><td><div style="color:var(--os-text)">${esc(e.business_name)}</div><div class="os-note">${esc(e.public_id)}</div></td><td>${esc(e.domain)}</td><td>${OS.stateTag(e.status)}</td><td class="os-num">${esc(OS.day(e.verification_date))}</td><td class="os-num">${esc(OS.day(e.expires_at))}</td></tr>`).join('') + '</tbody></table><div class="os-plate-b">' + method + '</div>';
  $('ev-reg').querySelectorAll('tr[data-pick]').forEach((tr) => {
    const open = () => { const e = registerRows[+tr.dataset.pick]; OS.inspect({ key: 'reg:' + e.public_id, href: '/registry.html?id=' + encodeURIComponent(e.public_id), kind: 'Register entry', title: e.business_name, subtitle: e.public_id, source: 'shieldRegistryList', asOf: registerAt,
      sections: [{ label: 'Status', html: OS.stateTag(e.status) + ' ' + OS.trust('verified', 'Human review', 'A named reviewer checked the registration against official records and signed the decision.') },
        { label: 'Record', kv: [['Domain', e.domain], ['Entity type', e.entity_type], ['Verified', e.verification_date], ['Expires', e.expires_at], ['Reviewed by', e.reviewed_by], ['Protocol', e.protocol_version]] },
        { label: 'What this does not establish', html: '<ul class="ev-limits"><li>That the business is safe, compliant or good at what it does: the register records identity and domain control, not quality.</li><li>The entry is not yet issued as a signed assertion: it is as trustworthy as the registry answering it over HTTPS.</li></ul>' }],
      actions: [{ label: 'Open the public record', href: '/registry.html?id=' + encodeURIComponent(e.public_id), primary: true }] }); };
    tr.addEventListener('click', open); tr.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') open(); });
  });
}

/* ── agent passports ─────────────────────────────────────────── */
$('pp-go').addEventListener('click', async () => {
  const token = $('pp-in').value.trim();
  $('pp-err').textContent = ''; $('pp-out').innerHTML = '';
  if (!token) { $('pp-err').textContent = 'Paste a passport first.'; $('pp-in').focus(); return; }
  const btn = $('pp-go'); btn.disabled = true;
  try {
    const [keys, server] = await OS.track(Promise.all([OS.reg('agentPassportKeys'), OS.reg('agentPassportVerify', { passport: token })]));
    const jwks = (keys.json && (keys.json.keys || keys.json.jwks)) || [];
    const local = await verifyPassport(token, jwks);
    const sv = server.json || {};
    $('pp-out').innerHTML = `<div style="display:flex;gap:12px;flex-wrap:wrap;align-items:center">${tag(local.state)}<span class="os-note">in this browser</span>${server.ok ? OS.stateTag(sv.valid ? 'verified' : 'failed', 'Registry: ' + (sv.status || (sv.valid ? 'valid' : 'not valid'))) : OS.stateTag('unknown', 'Registry did not answer')}</div>
      <p style="margin:10px 0">${esc(local.summary)}</p>${stepsHtml(local.steps)}
      ${sv.reason ? `<p class="os-note">Registry: ${esc(sv.reason)}</p>` : ''}
      <ul class="ev-limits">${local.limits.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>`;
    if (local.state === 'verified' && sv.valid) OS.sound('confirm');
  } finally { btn.disabled = false; }
});

/* ── the failure, demonstrated ───────────────────────────────── */
$('tamper-go').addEventListener('click', async () => {
  const d = docs.find((x) => x.path === 'corpus/obligations.json');
  if (!d) return;
  if (!keysDoc) keysDoc = await json('/.well-known/keys.json');
  const original = await bytes('/corpus/obligations.json');
  if (!original) { $('tamper-out').textContent = 'The corpus could not be fetched, so there is nothing to alter.'; return; }
  const text = new TextDecoder().decode(original);
  const at = text.indexOf('2026-12-02');
  const altered = at >= 0 ? text.slice(0, at) + '2027-12-02' + text.slice(at + 10) : text.replace('a', 'b');
  const res = await verifyAssertion(d.envelope, keysDoc, new TextEncoder().encode(altered));
  $('tamper-out').innerHTML = `<div style="display:flex;gap:12px;align-items:center">${tag(res.state)}<span class="os-note">altered copy: ${at >= 0 ? 'one date moved from 2026-12-02 to 2027-12-02' : 'one letter changed'}</span></div><p style="margin:10px 0">${esc(res.summary)}</p>${stepsHtml(res.steps)}`;
});

$('verify-all').addEventListener('click', verifyAll);
await Promise.all([loadDocs(), loadRegister()]);
paintSummary();
// The page verifies on arrival: a registry that waits to be asked is a list.
await verifyAll();
const target = decodeURIComponent(location.hash.slice(1));
const hit = docs.findIndex((d) => d.path === target);
if (hit >= 0) inspectDoc(hit);
window.addEventListener('hashchange', () => {
  const t = decodeURIComponent(location.hash.slice(1));
  if (t === 'verify-all') return verifyAll();
  const i = docs.findIndex((d) => d.path === t); if (i >= 0) inspectDoc(i);
});
