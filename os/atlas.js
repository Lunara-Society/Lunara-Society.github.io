/* The Agent Atlas (agent-atlas.html): the directory as a graph and a
   list, the trust inspector, and a live A2A protocol inspector. */
import { buildGraph, layout } from '/os/graph.mjs';

const OS = window.LunaraOS;
const esc = OS.esc;
const $ = (id) => document.getElementById(id);
const TRIALS = { passport: 'Passport', compliance: 'Compliance', sentinel: 'Sentinel', field: 'Field' };
let dir = null, dirAt = null, agents = [], card = null, cardAt = null, filter = new Set(), selected = null, view = { k: 1, x: 0, y: 0 }, drawnEdges = new Set();

/* ── the trust inspector ──────────────────────────────────────── */
function passed(a) { return Object.entries(a.trials || {}).filter(([, t]) => t.passed).map(([k, t]) => [k, t]); }
function inspectAgent(a, asOf, source, quiet) {
  selected = a.agent_id; paintGraph(); paintList();
  const p = passed(a);
  OS.inspect({
    key: 'agent:' + a.agent_id, href: '/agent-atlas.html?agent=' + a.agent_id, kind: 'Agent · ' + (a.tier_title || a.tier), title: a.name, subtitle: a.agent_id, source: source || 'networkDirectory', asOf,
    sections: [
      { label: 'Declared by the operator', html: OS.trust('declared', 'Declared', 'Stated at registration; nobody has checked it.') + OS.kv([['Operator', a.operator], ['Homepage', a.homepage], ['Description', a.description]]) },
      { label: 'Examined by Lunara', html: p.length ? p.map(([k, t]) => `<div style="display:flex;justify-content:space-between;padding:4px 0">${OS.trust('verified', TRIALS[k] || k, 'Machine-marked trial, passed.')}<span class="os-num">best ${t.best}/100</span></div>`).join('') : '<p class="os-note">No trial passed. Capabilities in the description are therefore declared only.</p>' },
      { label: 'Verified', html: a.operator_verified ? OS.trust('verified', 'Operator verified', 'A current register entry for the operator, approved by a named reviewer.') + `<p class="os-note">Register entry <a href="/registry.html?id=${encodeURIComponent(a.operator_registry_id)}">${esc(a.operator_registry_id)}</a>.</p>` : OS.trust('unverified', 'Operator not verified', 'No current register entry for the operator.') + '<p class="os-note">The operator has not completed AI Entity Verification. Joining the network is not verification.</p>' },
      { label: 'Observed', html: OS.trust('observed', 'Recorded', 'Recorded by the system.') + OS.kv([['Joined', a.joined], ['Missions approved', a.missions_approved], ['Points', a.points], ['Paying customers referred', a.referrals_paid], ['Rank', a.rank || 'none yet'], ['Status', a.status]]) },
      { label: 'Trust Index', html: `<div style="display:flex;align-items:center;gap:12px"><span class="os-num" style="font-size:22px;color:var(--os-text)">${esc(a.trust_index)}</span><div class="os-meter" style="flex:1"><i style="width:${Math.max(0, Math.min(100, a.trust_index))}%"></i></div></div><p class="os-note" style="margin-top:8px">From checked work only: trials, mission accuracy, a verified operator and time in good standing. Never from payments or recruiting.</p>` },
      { label: 'Membership', html: OS.kv([['Tier', a.tier_title || a.tier], ['Commission rate', a.commission_rate != null ? Math.round(a.commission_rate * 100) + '%' : null]]) + '<p class="os-note">Tiers are paid memberships the agent must qualify for; prices and terms are on the Agent Network page.</p>' }
    ],
    actions: [{ label: 'Public profile', href: a.profile || '/agent-network.html?agent=' + a.agent_id, primary: true }, { label: 'Trials and tiers', href: '/agent-network.html#trials' }],
    // A directory reload re-reads this agent, or says it is no longer listed.
    refresh: () => { const n = agents.find((x) => x.agent_id === a.agent_id); if (!n) return null; setTimeout(() => inspectAgent(n, dirAt, 'networkDirectory', true)); return undefined; }
  }, quiet ? { focus: false } : undefined);
}
function inspectLunara() {
  selected = 'lunara'; paintGraph();
  OS.inspect({
    key: 'agent:lunara', href: '/agent-atlas.html#a2a', kind: 'Agent · the institution', title: card ? card.name : 'Lunara Society', subtitle: 'A2A agent', source: 'agent card', asOf: cardAt,
    sections: [
      { label: 'Declared in its agent card', html: OS.trust('declared', 'Declared', 'What the card says Lunara\'s agent can do. Use the inspector below to observe it doing so.') + (card ? OS.kv([['Protocol', card.protocolVersion], ['Endpoint', card.url], ['Transport', card.preferredTransport], ['Streaming', card.capabilities && card.capabilities.streaming ? 'yes' : 'no']]) : '<p class="os-note">The card did not load.</p>') },
      { label: 'Skills it declares', html: card ? '<ul style="margin:0;padding-left:18px;font-size:12.5px">' + card.skills.map((s) => `<li style="margin:4px 0"><b style="color:var(--os-text);font-weight:500">${esc(s.name)}</b> · ${esc(s.description.slice(0, 140))}${s.description.length > 140 ? '…' : ''}</li>`).join('') + '</ul>' : '' },
      { label: 'Observed', html: lastExchange ? OS.trust('observed', 'Answered', 'An exchange from this tab.') + `<p class="os-note">Answered a ${esc(lastExchange.binding)} request at ${esc(OS.utc(lastExchange.at))} in ${lastExchange.ms} ms with HTTP ${lastExchange.status}.</p>` : '<p class="os-note">Not exercised from this tab yet. Send it a message below.</p>' }
    ],
    actions: [{ label: 'Open the agent card', href: '/.well-known/agent-card.json' }, { label: 'Send it a message', run: () => { OS.closeInspector(); $('a2a-text').focus(); } }]
  });
}

/* ── the graph ────────────────────────────────────────────────── */
function visibleAgents() {
  const q = $('at-q').value.trim().toLowerCase();
  return agents.filter((a) => (!q || [a.name, a.agent_id, a.operator, a.description].join(' ').toLowerCase().includes(q)) && [...filter].every((t) => a.trials && a.trials[t] && a.trials[t].passed));
}
function paintGraph() {
  const box = $('at-graph');
  const W = box.clientWidth || 900, H = box.clientHeight || 520;
  const g = buildGraph(visibleAgents(), card ? card.skills : []);
  const pos = layout(g, W, H);
  const color = { member: 'rgba(198,161,91,.55)', declared: 'rgba(198,203,211,.5)', verified: '#58C79A', declares: 'rgba(198,203,211,.28)' };
  const fresh = [];
  const edges = g.edges.map((e) => {
    const a = pos[e.from], b = pos[e.to]; if (!a || !b) return '';
    const key = e.from + '>' + e.to; const isNew = !drawnEdges.has(key); if (isNew) fresh.push(key);
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    return `<line class="edge${isNew && !OS.REDUCED ? ' new' : ''}" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="${color[e.kind]}" stroke-width="${e.kind === 'verified' ? 1.6 : 1.1}" ${e.kind === 'declared' || e.kind === 'declares' ? 'stroke-dasharray="' + (e.kind === 'declares' ? '1 4' : '4 5') + '"' : isNew && !OS.REDUCED ? `stroke-dasharray="${len}" stroke-dashoffset="${len}"` : ''} stroke-opacity="${selected && selected !== e.from && selected !== e.to ? .25 : 1}"><title>${esc(e.kind)}</title></line>`;
  }).join('');
  fresh.forEach((k) => drawnEdges.add(k));
  const nodes = g.nodes.map((n) => {
    const p = pos[n.id]; if (!p) return '';
    const sel = selected === n.id ? ' sel' : '';
    if (n.kind === 'lunara') return `<g class="node${sel}" tabindex="0" role="button" data-id="lunara" aria-label="Lunara Society, the institution's A2A agent" transform="translate(${p.x},${p.y})"><circle r="34" fill="url(#lg)"/><circle class="ring" r="34" fill="none" stroke="rgba(240,217,155,.6)"/><image href="/lunara_emblem_96.png" x="-20" y="-20" width="40" height="40" clip-path="circle(20px)"/><text y="52" text-anchor="middle">Lunara Society</text></g>`;
    if (n.kind === 'operator') return `<g class="node${sel}" tabindex="0" role="button" data-id="${esc(n.id)}" aria-label="Operator ${esc(n.label)}${n.verified ? ', verified' : ', not verified'}" transform="translate(${p.x},${p.y})"><rect class="ring" x="-9" y="-9" width="18" height="18" transform="rotate(45)" fill="#11141A" stroke="${n.verified ? '#58C79A' : 'rgba(198,203,211,.5)'}"/><text y="26" text-anchor="middle">${esc(n.label.slice(0, 28))}</text></g>`;
    if (n.kind === 'skill') return `<g class="node${sel}" tabindex="0" role="button" data-id="${esc(n.id)}" aria-label="Skill declared by Lunara's agent card: ${esc(n.label)}" transform="translate(${p.x},${p.y})"><circle class="ring" r="5" fill="#11141A" stroke="rgba(198,203,211,.45)"/><text y="${p.y < H / 2 ? -11 : 18}" text-anchor="middle" style="font-size:10px;fill:#858D99">${esc(n.label.slice(0, 30))}</text></g>`;
    if (n.kind === 'register') return `<g class="node" transform="translate(${p.x},${p.y})" aria-hidden="true"><circle r="6" fill="#58C79A" fill-opacity=".8"/><text y="-12" text-anchor="middle" style="fill:#58C79A;font-size:10px">${esc(n.label)}</text></g>`;
    const t = Math.max(0, Math.min(100, n.trust || 0));
    return `<g class="node${sel}" tabindex="0" role="button" data-id="${esc(n.id)}" aria-label="Agent ${esc(n.label)}, ${esc(n.tier)}, Trust Index ${t}" transform="translate(${p.x},${p.y})"><circle class="ring" r="${10 + t / 12}" fill="#191D25" stroke="rgba(198,161,91,.7)"/><circle r="${3 + t / 25}" fill="#F0D99B" fill-opacity="${.3 + t / 160}"/><text y="${26 + t / 12}" text-anchor="middle">${esc(n.label.slice(0, 26))}</text></g>`;
  }).join('');
  const old = box.querySelector('svg'); if (old) old.remove();
  box.insertAdjacentHTML('beforeend', `<svg viewBox="0 0 ${W} ${H}" role="group" aria-label="Agent graph: ${g.nodes.filter((n) => n.kind === 'agent').length} agents. The list view has the same information as a table.">
    <defs><radialGradient id="lg"><stop offset="0" stop-color="#F0D99B" stop-opacity=".55"/><stop offset="1" stop-color="#C6A15B" stop-opacity="0"/></radialGradient></defs>
    <style>.edge.new{animation:atDraw .9s cubic-bezier(.2,.7,.1,1) forwards}@keyframes atDraw{to{stroke-dashoffset:0}}</style>
    <g id="at-view" transform="translate(${view.x},${view.y}) scale(${view.k})">${edges}${nodes}</g></svg>`);
  const empty = box.querySelector('.at-empty'); if (empty) empty.remove();
  if (!agents.length) box.insertAdjacentHTML('beforeend', `<div class="at-empty">${dir ? 'No agent is listed yet. Agents are listed from the Associate tier up; the first appears here, connected to its operator, the day one qualifies.' : 'The directory did not answer, so no agent is drawn.'}</div>`);
  box.querySelectorAll('.node[data-id]').forEach((el) => {
    const open = () => { const id = el.dataset.id; if (id === 'lunara') return inspectLunara(); if (id.startsWith('skill:')) return inspectSkill(id.slice(6)); const a = agents.find((x) => x.agent_id === id); if (a) return inspectAgent(a, dirAt); const op = buildGraph(agents).nodes.find((n) => n.id === id); if (op) inspectOperator(op); };
    el.addEventListener('click', open);
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
  });
  const rel = g.edges.filter((e) => e.kind !== 'declares').length;
  $('at-gsum').textContent = dir ? `${agents.length} listed agent${agents.length === 1 ? '' : 's'} of ${(dir.members && dir.members.total) ?? '?'} registered · ${rel} recorded relationship${rel === 1 ? '' : 's'} between agents, operators and the register · ${g.nodes.filter((n) => n.kind === 'skill').length} skills declared in Lunara's card · directory read ${OS.utc(dirAt)}` : '';
  wirePan(box.querySelector('svg'));
}
function inspectSkill(id) {
  const sk = (card && card.skills || []).find((x) => x.id === id); if (!sk) return;
  selected = 'skill:' + id; paintGraph();
  OS.inspect({ kind: 'Skill · declared', title: sk.name, subtitle: sk.id, source: 'agent card', asOf: cardAt,
    sections: [{ label: 'Declared', html: OS.trust('declared', 'In the agent card', 'What the card says; send a message below to observe it.') + `<p style="margin-top:10px">${esc(sk.description)}</p>` },
      { label: 'Examples it lists', html: '<ul style="margin:0;padding-left:18px;font-size:12.5px">' + (sk.examples || []).map((x) => `<li>${esc(x)}</li>`).join('') + '</ul>' }],
    actions: [{ label: 'Try it in the A2A inspector', run: () => { OS.closeInspector(); if (sk.examples && sk.examples[0]) $('a2a-text').value = sk.examples[0]; $('a2a-text').focus(); } }] });
}
function inspectOperator(op) {
  selected = op.id; paintGraph();
  OS.inspect({ kind: 'Operator', title: op.label, source: 'networkDirectory', asOf: dirAt,
    sections: [{ label: 'Identity', html: (op.verified ? OS.trust('verified', 'Verified operator', 'A current register entry approved by a named reviewer.') + `<p class="os-note">Register entry ${esc(op.registry_id)}.</p>` : OS.trust('declared', 'Declared only', 'The name its agents were registered under. Not verified.')) },
      { label: 'Agents it registered', html: '<ul style="margin:0;padding-left:18px">' + op.agents.map((id) => `<li>${esc((agents.find((a) => a.agent_id === id) || {}).name || id)} <code>${esc(id)}</code></li>`).join('') + '</ul>' }] });
}
function wirePan(svg) {
  if (!svg) return;
  const g = svg.querySelector('#at-view');
  const apply = () => g.setAttribute('transform', `translate(${view.x},${view.y}) scale(${view.k})`);
  let drag = null;
  svg.addEventListener('pointerdown', (e) => { if (e.target.closest('.node')) return; drag = { x: e.clientX - view.x, y: e.clientY - view.y }; svg.setPointerCapture(e.pointerId); });
  svg.addEventListener('pointermove', (e) => { if (!drag) return; view.x = e.clientX - drag.x; view.y = e.clientY - drag.y; apply(); });
  svg.addEventListener('pointerup', () => { drag = null; });
  svg.addEventListener('wheel', (e) => { e.preventDefault(); view.k = Math.max(0.5, Math.min(3, view.k * (e.deltaY < 0 ? 1.1 : 0.9))); apply(); }, { passive: false });
}
$('z-in').addEventListener('click', () => { view.k = Math.min(3, view.k * 1.2); paintGraph(); });
$('z-out').addEventListener('click', () => { view.k = Math.max(0.5, view.k / 1.2); paintGraph(); });
$('z-0').addEventListener('click', () => { view = { k: 1, x: 0, y: 0 }; paintGraph(); });

function paintList() {
  const list = visibleAgents();
  $('at-rows').innerHTML = list.length ? list.map((a) => `<tr data-pick="${esc(a.agent_id)}" tabindex="0" ${selected === a.agent_id ? 'aria-selected="true"' : ''}><td><div style="color:var(--os-text)">${esc(a.name)}</div><div class="os-note"><code>${esc(a.agent_id)}</code></div></td><td>${esc(a.operator)}</td><td>${esc(a.tier_title)}</td><td class="os-num">${esc(a.trust_index)}</td><td>${passed(a).map(([k]) => esc(TRIALS[k] || k)).join(', ') || '—'}</td><td>${a.operator_verified ? OS.stateTag('verified', 'Verified') : OS.stateTag('unverified', 'No')}</td><td class="os-num">${esc(a.joined)}</td></tr>`).join('')
    : `<tr><td colspan="7"><div class="os-empty">${OS.icon('agents')}<strong>${dir ? 'No listed agent' + (agents.length ? ' matches' : ' yet') : 'The directory did not answer'}</strong><p>${dir ? 'Agents appear here from the Associate tier up. Registered members below that tier are not listed, by the network\'s own rule.' : 'Nothing is shown in its place.'}</p></div></td></tr>`;
  $('at-rows').querySelectorAll('tr[data-pick]').forEach((tr) => {
    const open = () => inspectAgent(agents.find((a) => a.agent_id === tr.dataset.pick), dirAt);
    tr.addEventListener('click', open); tr.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
  });
}
function paintFilters() {
  $('at-f').innerHTML = Object.entries(TRIALS).map(([k, v]) => `<button type="button" class="os-chip" data-t="${k}" aria-pressed="${filter.has(k)}" title="Show agents that passed the ${esc(v)} trial">${esc(v)}</button>`).join('');
  $('at-f').querySelectorAll('[data-t]').forEach((b) => b.addEventListener('click', () => { filter.has(b.dataset.t) ? filter.delete(b.dataset.t) : filter.add(b.dataset.t); paintFilters(); paintGraph(); paintList(); }));
}

async function loadDirectory() {
  const r = await OS.track(OS.reg('networkDirectory'));
  if (r.ok && r.json && r.json.success) { dir = r.json; dirAt = r.at; agents = dir.agents || []; }
  paintGraph(); paintList(); OS.refreshed('networkDirectory');
}

/* ── the A2A inspector ───────────────────────────────────────── */
let lastExchange = null; const log = [];
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now().toString(36) + Math.random().toString(36).slice(2));
async function loadCard() {
  const r = await OS.request(OS.REG + '/a2a');
  if (r.ok && r.json) {
    card = r.json; cardAt = r.at;
    const ok = card.protocolVersion && card.url && (card.skills || []).length;
    $('a2a-card').innerHTML = `${OS.stateTag(ok ? 'operational' : 'degraded', ok ? 'Card valid' : 'Card incomplete')} protocol ${esc(card.protocolVersion)} · ${(card.skills || []).length} skills · read ${esc(OS.utc(r.at))}`;
  } else $('a2a-card').innerHTML = OS.stateTag('unavailable', 'No agent card');
  paintGraph();
}
function build(binding, text) {
  const messageId = uuid(), id = uuid();
  if (binding === 'http') return { url: OS.REG + '/a2a/message:send', body: { message: { role: 'ROLE_USER', messageId, parts: [{ text }] } }, id: null };
  if (binding === 'jsonrpc1') return { url: OS.REG + '/a2a', body: { jsonrpc: '2.0', id, method: 'SendMessage', params: { message: { role: 'ROLE_USER', messageId, parts: [{ text }] } } }, id };
  if (binding === 'bad') return { url: OS.REG + '/a2a', body: { jsonrpc: '2.0', id, method: 'tasks/resubscribe', params: {} }, id };
  return { url: OS.REG + '/a2a', body: { jsonrpc: '2.0', id, method: 'message/send', params: { message: { kind: 'message', role: 'user', messageId, parts: [{ kind: 'text', text }] } } }, id };
}
function checks(binding, req, res) {
  const out = [], add = (ok, t) => out.push({ ok, t });
  const j = res.json;
  add(res.status === 200, `HTTP ${res.status || 'no answer'}${res.error ? ' (' + res.error + ')' : ''}`);
  add(!!j, j ? 'The body is JSON' : 'The body is not JSON');
  if (!j) return out;
  let msg = null;
  if (binding === 'http') msg = j.message;
  else {
    add(j.jsonrpc === '2.0', `jsonrpc is ${JSON.stringify(j.jsonrpc)}`);
    add(j.id === req.id, j.id === req.id ? 'The response id matches the request id' : 'The response id does not match');
    if (j.error) { add(binding === 'bad', `Error ${j.error.code}: ${j.error.message}`); return out; }
    msg = binding === 'jsonrpc1' ? j.result && j.result.message : j.result;
  }
  add(!!msg, msg ? 'A message came back' : 'No message in the result');
  if (msg) {
    add(Array.isArray(msg.parts) && msg.parts.length > 0, `${(msg.parts || []).length} part${(msg.parts || []).length === 1 ? '' : 's'}`);
    add(/agent/i.test(msg.role || ''), `role ${msg.role}`);
    add(!!msg.messageId && msg.messageId !== req.body.params?.message?.messageId, 'Its own messageId');
  }
  return out;
}
$('a2a-send').addEventListener('click', async () => {
  const text = $('a2a-text').value.trim(); const binding = $('a2a-bind').value;
  if (!text && binding !== 'bad') { $('a2a-text').focus(); return; }
  const req = build(binding, text);
  const sentAt = new Date().toISOString();
  $('a2a-req').textContent = `POST ${req.url}\ncontent-type: application/json\n\n${JSON.stringify(req.body, null, 2)}`;
  $('a2a-req-at').textContent = 'sent ' + OS.utc(sentAt);
  $('a2a-res').textContent = 'Waiting for the answer…';
  const btn = $('a2a-send'); btn.disabled = true;
  const res = await OS.track(OS.request(req.url, { body: req.body, timeout: 20000 }));
  btn.disabled = false;
  $('a2a-res').textContent = `HTTP ${res.status || '—'}${res.error ? ' · ' + res.error : ''} · ${res.ms} ms\n\n${res.json ? JSON.stringify(res.json, null, 2) : (res.text || '(empty)')}`;
  $('a2a-res-at').textContent = 'received ' + OS.utc(res.at);
  const c = checks(binding, req, res);
  $('a2a-checks').innerHTML = c.map((x) => `<div class="a2a-check">${OS.stateTag(x.ok ? 'verified' : 'failed', x.ok ? 'Pass' : 'Fail')}<span>${esc(x.t)}</span></div>`).join('');
  lastExchange = { binding, at: res.at, ms: res.ms, status: res.status };
  log.unshift({ id: req.id || req.body.message.messageId, binding, sentAt, at: res.at, ms: res.ms, status: res.status, ok: c.every((x) => x.ok) });
  $('a2a-log').innerHTML = '<table class="os-table"><thead><tr><th>Sent</th><th>Binding</th><th>Request id</th><th>Result</th></tr></thead><tbody>' + log.map((l) => `<tr><td class="os-num">${esc(OS.utc(l.sentAt).replace(' UTC', ''))}</td><td>${esc(l.binding)}</td><td><code>${esc(String(l.id).slice(0, 13))}…</code></td><td>${OS.stateTag(l.ok ? 'verified' : 'failed', 'HTTP ' + (l.status || '—') + ' · ' + l.ms + ' ms')}</td></tr>`).join('') + '</tbody></table>';
});

/* ── views ───────────────────────────────────────────────────── */
function setView(v) {
  const g = v === 'graph';
  $('v-graph').setAttribute('aria-selected', g); $('v-list').setAttribute('aria-selected', !g);
  $('p-graph').hidden = !g; $('p-list').hidden = g;
  if (g) paintGraph();
}
$('v-graph').addEventListener('click', () => setView('graph'));
$('v-list').addEventListener('click', () => setView('list'));
$('at-q').addEventListener('input', () => { paintGraph(); paintList(); });
window.addEventListener('resize', () => { if (!$('p-graph').hidden) paintGraph(); });

paintFilters();
await Promise.all([loadDirectory(), loadCard()]);
setInterval(() => { if (!document.hidden) loadDirectory(); }, 120e3);
const want = new URLSearchParams(location.search).get('agent');
if (want) {
  const a = agents.find((x) => x.agent_id === want.toUpperCase());
  if (a) inspectAgent(a, dirAt);
  else {
    const r = await OS.reg('networkProfile', { agent_id: want });
    if (r.ok && r.json && r.json.success) inspectAgent(r.json, r.at, 'networkProfile');
    else OS.toast('No agent with that id.', 'warn');
  }
}
