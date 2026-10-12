/* The Scenario Lab (simulate.html). The scoring weights and grade
   boundaries come from the scanner's own module; the lab only reads. */
import { CHECKS, grade } from '/registry-backend/passport.mjs';
import { BADGE_GRADES } from '/registry-backend/passport-routes.mjs';
import { simulate, plans } from '/os/scenario.mjs';

const OS = window.LunaraOS;
const esc = OS.esc;
const $ = (id) => document.getElementById(id);
const DOMAIN = /^(?:https?:\/\/)?(?:www\.)?([a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,})\/?$/i;
let observed = null, fixes = new Set();

function bar(o, s) {
  return `<div class="sl-bar" aria-hidden="true"><i class="o" style="width:${o}%"></i><i class="s" style="width:${Math.max(0, s - o)}%"></i></div>`;
}
function render() {
  const sim = simulate(observed, [...fixes], CHECKS, grade);
  const pl = plans(CHECKS, observed.earned);
  const badge = (g) => BADGE_GRADES.includes(g);
  $('sl-out').innerHTML = `
  ${sim.matches_record ? '' : `<div class="os-callout warn" style="margin-bottom:16px">The per-check results add up to ${sim.baseline}, but the record says ${observed.score}. The lab starts from the per-check results; trust the record.</div>`}
  <div class="sl-cols">
    <div class="os-plate">
      <div class="os-plate-h"><span class="os-eyebrow">Observed</span><span class="r">${OS.trust('observed', 'Recorded scan', 'Measured by the passport scanner and stored. This is the only number on the page that was measured.')}</span></div>
      <div class="os-plate-b">
        <div class="sl-big"><b>${observed.score}</b><span>${esc(observed.grade)}</span></div>
        <div class="os-fresh">${esc(observed.domain)} · scanned ${esc(OS.stamp(observed.scanned_at))} (${esc(OS.ago(observed.scanned_at))})</div>
        ${bar(sim.baseline, sim.baseline)}
        <p class="os-note">${observed.prev_score != null ? `The scan before it scored ${observed.prev_score} (${esc(observed.prev_grade)}).` : 'No earlier scan is recorded.'} Badge: ${badge(observed.grade) && observed.fresh ? 'eligible' : 'not eligible (needs B or better)'}.</p>
      </div>
    </div>
    <div class="os-plate">
      <div class="os-plate-h"><span class="os-eyebrow">Assumed</span><span class="r">${OS.trust('declared', 'Your assumptions', 'Fixes you chose to assume. Nothing has been changed on the domain.')}</span></div>
      <div class="os-plate-b">
        <div class="os-chips" role="group" aria-label="Plans">${pl.map((p) => `<button type="button" class="os-chip" data-plan="${p.id}" title="${esc(p.about)}" ${p.fixes.length ? '' : 'disabled'}>${esc(p.title)} <span class="os-num">${p.fixes.length}</span></button>`).join('')}<button type="button" class="os-chip" data-plan="none">Clear</button></div>
        <div style="margin-top:10px" role="group" aria-label="Checks to assume fixed">
          ${sim.rows.filter((r) => r.observed < r.points).map((r) => `<label class="sl-check"><input type="checkbox" data-fix="${r.id}" ${fixes.has(r.id) ? 'checked' : ''}><span>${esc(r.label)}</span><span class="p">${r.observed}/${r.points}</span><span class="f">${esc(r.fix)}</span></label>`).join('') || '<p class="os-note">Every check already earns full points. There is nothing to assume.</p>'}
        </div>
      </div>
    </div>
    <div class="os-plate focal">
      <div class="os-plate-h"><span class="os-eyebrow">Simulated</span><span class="r">${OS.trust('simulated', 'Not measured', 'Computed by the scanner\'s scoring code from your assumptions. No scan produced this number.')}</span></div>
      <div class="os-plate-b sl-sim">
        <div class="sl-big"><b>${sim.projected}</b><span>${esc(sim.projected_grade)}</span></div>
        <div class="os-fresh">${sim.delta > 0 ? '+' + sim.delta + ' points if every assumed fix is made correctly' : 'No assumption selected'}</div>
        ${bar(sim.baseline, sim.projected)}
        <p class="os-note">Badge, simulated: ${badge(sim.projected_grade) ? 'would be eligible' : 'still not eligible'}. A simulated grade cannot be displayed as a badge or used anywhere as a score.</p>
      </div>
    </div>
  </div>
  <div class="os-grid c32" style="margin-top:18px">
    <div class="os-plate">
      <div class="os-plate-h"><span class="os-eyebrow">The plans side by side</span><span class="r">${OS.trust('simulated', 'Simulated', 'Each column assumes that plan\'s fixes, from the same recorded scan.')}</span></div>
      <table class="os-table"><thead><tr><th>Plan</th><th>Assumed fixes</th><th>Simulated score</th><th>Grade</th><th>Badge</th></tr></thead><tbody>
        <tr><td>Recorded scan</td><td>none</td><td class="os-num">${sim.baseline}</td><td>${esc(sim.baseline_grade)}</td><td>${badge(sim.baseline_grade) ? 'eligible' : 'no'}</td></tr>
        ${pl.map((p) => { const s = simulate(observed, p.fixes, CHECKS, grade); return `<tr><td><div style="color:var(--os-text)">${esc(p.title)}</div><div class="os-note">${esc(p.about)}</div></td><td class="os-num">${p.fixes.length}</td><td class="os-num">${s.projected}</td><td>${esc(s.projected_grade)}</td><td>${badge(s.projected_grade) ? 'would be eligible' : 'no'}</td></tr>`; }).join('')}
      </tbody></table>
    </div>
    <div class="os-plate">
      <div class="os-plate-h"><span class="os-eyebrow">Actual</span><span class="r">${OS.trust('observed', 'Only a scan records this', 'The next real scan is the actual outcome.')}</span></div>
      <div class="os-plate-b">
        <p>Make the changes, then run a real scan. It is recorded, replaces the observed number above, and shows on the badge and in the league if the domain is listed.</p>
        <div style="display:flex;flex-wrap:wrap;gap:10px;margin-top:12px"><a class="os-btn primary" href="/passport.html?d=${encodeURIComponent(observed.domain)}">Scan it for real</a><a class="os-btn" href="/passport.html?d=${encodeURIComponent(observed.domain)}#monitor">Have it rescanned daily</a></div>
        <p class="os-note" style="margin-top:12px">Passport Monitor is the paid daily rescan with alerts; its price and terms are on the passport page.</p>
      </div>
    </div>
  </div>`;
  $('sl-out').querySelectorAll('[data-fix]').forEach((c) => c.addEventListener('change', () => { c.checked ? fixes.add(c.dataset.fix) : fixes.delete(c.dataset.fix); render(); const el = $('sl-out').querySelector(`[data-fix="${c.dataset.fix}"]`); if (el) el.focus(); }));
  $('sl-out').querySelectorAll('[data-plan]').forEach((b) => b.addEventListener('click', () => { const p = pl.find((x) => x.id === b.dataset.plan); fixes = new Set(p ? p.fixes : []); render(); }));
}

async function load(domain) {
  $('sl-err').textContent = '';
  const m = String(domain || '').trim().match(DOMAIN);
  if (!m) { $('sl-err').textContent = 'Enter a domain such as example.com.'; $('sl-d').setAttribute('aria-invalid', 'true'); $('sl-d').focus(); return; }
  $('sl-d').removeAttribute('aria-invalid');
  const d = m[1].toLowerCase();
  $('sl-d').value = d;
  history.replaceState(null, '', '?d=' + encodeURIComponent(d));
  $('sl-out').innerHTML = '<div class="os-plate os-plate-b"><div class="os-skel"></div><div class="os-skel"></div></div>';
  const r = await OS.track(OS.reg('passportBadge', { domain: d }));
  if (!r.ok || !r.json) { $('sl-out').innerHTML = `<div class="os-plate"><div class="os-empty"><strong>The passport store did not answer</strong><p>HTTP ${esc(r.status || 'none')}. Nothing is simulated without a recorded scan to start from.</p></div></div>`; return; }
  if (!r.json.found) { $('sl-out').innerHTML = `<div class="os-plate"><div class="os-empty">${OS.icon('globe')}<strong>${esc(d)} has no recorded scan</strong><p>The lab starts only from a real measurement. Scan it on Passport control (free, about ten seconds), then come back.</p><a class="os-btn primary" href="/passport.html?d=${encodeURIComponent(d)}">Scan ${esc(d)}</a></div></div>`; return; }
  if (!r.json.earned) { $('sl-out').innerHTML = `<div class="os-plate"><div class="os-empty"><strong>This scan has no per-check detail yet</strong><p>The store answered with a score but not with what each check earned, which the lab needs. That detail arrives with the next registry deployment.</p></div></div>`; return; }
  observed = r.json; fixes = new Set();
  render();
}

$('sl-form').addEventListener('submit', (e) => { e.preventDefault(); load($('sl-d').value); });
const q = new URLSearchParams(location.search).get('d');
if (q) load(q);
