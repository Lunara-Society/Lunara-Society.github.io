/* ═══════════════════════════════════════════════════════════════════
   THE SOVEREIGN INTELLIGENCE OS — the shell
   ═══════════════════════════════════════════════════════════════════

   Every workspace page loads this file and gets the same four areas:
   the navigation rail, the header, the context inspector and the
   command palette. It also owns the things every workspace shares:

     health     real checks against each backend, labelled Operational,
                Degraded, Unavailable, Unknown or Not configured, and
                never replaced by a success value when they fail
     session    who is signed in, as lunara-auth and the registry say,
                not as localStorage says; owner commands appear only
                after the server has confirmed the owner, and every
                route behind them checks again
     palette    commands registered from what is actually implemented,
                and search over real records from their real sources
     inspector  the selected record, with the time it was read, marked
                stale when the data under it changes
     state      the condition the central structure shows (idle,
                connecting, processing, active, attention, degraded,
                offline), derived only from the above
     sound      synthesized, off until the visitor turns it on, never
                on hover, never for an event that did not happen

   Plain ES5-style JavaScript like the rest of the site: no build step,
   no dependency.
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.LunaraOS) return;

  var API = 'https://luiqtimzcsoqnizybifs.supabase.co/functions/v1';
  var REG = API + '/lunara-registry';
  var REDUCED = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  var here = location.pathname.split('/').pop() || 'index.html';

  function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { return null; } }
  function sstore(k, v) { try { if (v === undefined) return sessionStorage.getItem(k); sessionStorage.setItem(k, v); } catch (e) { return null; } }
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function utc(t) { var d = new Date(t); if (isNaN(d)) return '—'; return pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes()) + ':' + pad(d.getUTCSeconds()) + ' UTC'; }
  function day(t) { var d = new Date(t); if (isNaN(d)) return '—'; return d.toISOString().slice(0, 10); }
  function stamp(t) { var d = new Date(t); if (isNaN(d)) return '—'; return day(d) + ' ' + utc(d); }
  function ago(t) {
    var s = Math.round((Date.now() - new Date(t).getTime()) / 1000);
    if (isNaN(s)) return '';
    if (s < 0) return 'in ' + until(t);
    if (s < 60) return s + ' s ago'; if (s < 3600) return Math.round(s / 60) + ' min ago';
    if (s < 86400) return Math.round(s / 3600) + ' h ago'; return Math.round(s / 86400) + ' d ago';
  }
  function until(t) {
    var s = Math.round((new Date(t).getTime() - Date.now()) / 1000);
    if (s < 3600) return Math.max(1, Math.round(s / 60)) + ' min'; if (s < 86400) return Math.round(s / 3600) + ' h';
    return Math.round(s / 86400) + ' days';
  }

  /* One fetch with a timeout. Always resolves; the caller decides what a
     failure means, and nothing here turns one into a success. */
  function request(url, opts) {
    opts = opts || {};
    var ctl = window.AbortController ? new AbortController() : null;
    var t0 = performance.now();
    var timer = setTimeout(function () { if (ctl) ctl.abort(); }, opts.timeout || 9000);
    var init = { method: opts.method || (opts.body ? 'POST' : 'GET'), signal: ctl ? ctl.signal : undefined, cache: 'no-store' };
    if (opts.body) { init.body = typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body); init.headers = { 'content-type': 'application/json' }; }
    return fetch(url, init).then(function (r) {
      return r.text().then(function (txt) {
        var j = null; try { j = txt ? JSON.parse(txt) : null; } catch (e) { j = null; }
        clearTimeout(timer);
        return { ok: r.ok, status: r.status, json: j, text: txt, ms: Math.round(performance.now() - t0), at: new Date().toISOString() };
      });
    }).catch(function (e) {
      clearTimeout(timer);
      return { ok: false, status: 0, json: null, error: e && e.name === 'AbortError' ? 'timed out' : 'no connection', ms: Math.round(performance.now() - t0), at: new Date().toISOString() };
    });
  }
  function reg(route, body) { return request(REG + '/' + route, body ? { body: body } : {}); }

  var OS = window.LunaraOS = {
    API: API, REG: REG, REDUCED: REDUCED,
    esc: esc, utc: utc, day: day, stamp: stamp, ago: ago, until: until, request: request, reg: reg, store: store
  };

  /* ── listeners ──────────────────────────────────────────────────── */
  var subs = {};
  OS.on = function (ev, fn) { (subs[ev] = subs[ev] || []).push(fn); };
  OS.emit = function (ev, data) { (subs[ev] || []).forEach(function (fn) { try { fn(data); } catch (e) { if (window.console) console.warn('[os]', ev, e); } }); };

  /* ── icons: one stroke weight, one grid ─────────────────────────── */
  var I = {
    command: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="7.5"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>',
    intel: '<svg viewBox="0 0 24 24"><circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l6 6M8 10.5h5M10.5 8v5"/></svg>',
    agents: '<svg viewBox="0 0 24 24"><circle cx="12" cy="5" r="2.2"/><circle cx="5" cy="18" r="2.2"/><circle cx="19" cy="18" r="2.2"/><path d="M11 7l-5 9M13 7l5 9M7.2 18h9.6"/></svg>',
    missions: '<svg viewBox="0 0 24 24"><path d="M5 21V4M5 4h11l-2 4 2 4H5"/></svg>',
    evidence: '<svg viewBox="0 0 24 24"><path d="M7 3h7l4 4v14H7z"/><path d="M14 3v4h4M10 13l2 2 4-4"/></svg>',
    trust: '<svg viewBox="0 0 24 24"><path d="M12 3l7 3v6c0 4.2-3 7.6-7 9-4-1.4-7-4.8-7-9V6z"/><path d="M9 12l2 2 4-4"/></svg>',
    law: '<svg viewBox="0 0 24 24"><path d="M12 3v18M5 7h14M7 7l-3 7a3 3 0 006 0zM17 7l-3 7a3 3 0 006 0zM8 21h8"/></svg>',
    sim: '<svg viewBox="0 0 24 24"><path d="M4 19l5-6 4 3 7-9"/><path d="M4 4v15h16" /><circle cx="20" cy="7" r="1.2"/></svg>',
    audit: '<svg viewBox="0 0 24 24"><rect x="4" y="3" width="16" height="18" rx="1"/><path d="M8 8h8M8 12h8M8 16h5"/></svg>',
    member: '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="3.6"/><path d="M4.5 20.5c1.2-3.8 4-5.5 7.5-5.5s6.3 1.7 7.5 5.5"/></svg>',
    status: '<svg viewBox="0 0 24 24"><path d="M3 12h4l2-6 4 12 2-6h6"/></svg>',
    site: '<svg viewBox="0 0 24 24"><path d="M3 11l9-7 9 7M5 10v10h14V10"/></svg>',
    sound: '<svg viewBox="0 0 24 24"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16.5 8.5a5 5 0 010 7M19 6a8.5 8.5 0 010 12"/></svg>',
    mute: '<svg viewBox="0 0 24 24"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M17 9l5 6M22 9l-5 6"/></svg>',
    expand: '<svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg>',
    collapse: '<svg viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6"/></svg>',
    search: '<svg viewBox="0 0 24 24"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5L21 21"/></svg>',
    fx: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
    doc: '<svg viewBox="0 0 24 24"><path d="M7 3h7l4 4v14H7z"/><path d="M14 3v4h4"/></svg>',
    run: '<svg viewBox="0 0 24 24"><path d="M7 5l11 7-11 7z"/></svg>',
    ai: '<svg viewBox="0 0 24 24"><path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z"/><path d="M18 15l.8 2.2L21 18l-2.2.8L18 21l-.8-2.2L15 18l2.2-.8z"/></svg>',
    globe: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z"/></svg>'
  };
  OS.icon = function (k) { return I[k] || I.doc; };

  /* The places. Only what exists; each one a real page. */
  var NAV = [
    { group: 'Operations', items: [
      { href: 'command.html', label: 'Command Center', icon: 'command' },
      { href: 'investigate.html', label: 'Intelligence', icon: 'intel' },
      { href: 'agent-atlas.html', label: 'Agent Network', icon: 'agents' },
      { href: 'missions.html', label: 'Missions', icon: 'missions' }
    ]},
    { group: 'Trust', items: [
      { href: 'evidence-registry.html', label: 'Evidence Registry', icon: 'evidence' },
      { href: 'signing.html', label: 'Trust and Verification', icon: 'trust' },
      { href: 'regulation.html', label: 'Regulatory Intelligence', icon: 'law' },
      { href: 'simulate.html', label: 'Scenario Lab', icon: 'sim' }
    ]},
    { group: 'Oversight', items: [
      { href: 'audit.html', label: 'Activity and Audit', icon: 'audit' },
      { href: 'member.html', label: 'Membership and Account', icon: 'member' },
      { href: 'status.html', label: 'System Status', icon: 'status' }
    ]}
  ];
  OS.NAV = NAV;

  /* ── settings ───────────────────────────────────────────────────── */
  OS.soundOn = function () { return store('lx-sound') === '1'; };
  OS.lowFx = function () { return store('lx-os-fx') === 'low'; };
  function applyFx() { document.documentElement.classList.toggle('os-lowfx', OS.lowFx()); }
  applyFx();

  /* ── sound: synthesized, opt-in ─────────────────────────────────── */
  var AC = null, lastSound = {};
  OS.sound = function (kind) {
    if (!OS.soundOn()) return;
    var now = Date.now();
    if (lastSound[kind] && now - lastSound[kind] < 900) return; // never a stutter of repeats
    lastSound[kind] = now;
    try {
      AC = AC || new (window.AudioContext || window.webkitAudioContext)();
      if (AC.state === 'suspended') AC.resume();
      var t = AC.currentTime, out = AC.createGain(); out.gain.value = 0.18; out.connect(AC.destination);
      var tone = function (f, at, dur, type, peak) {
        var o = AC.createOscillator(), g = AC.createGain(); o.type = type || 'sine'; o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t + at); g.gain.exponentialRampToValueAtTime(peak || 0.5, t + at + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + at + dur);
        o.connect(g); g.connect(out); o.start(t + at); o.stop(t + at + dur + 0.02);
      };
      if (kind === 'open') tone(1320, 0, 0.06, 'sine', 0.25);
      else if (kind === 'confirm') { tone(784, 0, 0.16, 'sine', 0.4); tone(1175, 0.09, 0.22, 'sine', 0.35); }
      else if (kind === 'alert') { tone(220, 0, 0.35, 'triangle', 0.4); tone(196, 0.18, 0.4, 'triangle', 0.3); }
      else if (kind === 'transition') { tone(110, 0, 0.3, 'sine', 0.5); tone(55, 0.02, 0.4, 'sine', 0.35); }
      else if (kind === 'init') { tone(392, 0, 0.5, 'sine', 0.25); tone(587, 0.12, 0.6, 'sine', 0.2); tone(784, 0.24, 0.7, 'sine', 0.15); }
    } catch (e) { /* audio is an enhancement */ }
  };

  /* ── toasts (polite live region) ────────────────────────────────── */
  var toasts;
  OS.toast = function (msg, kind) {
    if (!toasts) return;
    var t = document.createElement('div');
    t.className = 'os-toast ' + (kind || '');
    t.textContent = msg;
    toasts.appendChild(t);
    setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 6000);
  };

  /* ── activity marker: real requests in flight ───────────────────── */
  var busy = 0;
  OS.busy = function (delta) { busy = Math.max(0, busy + delta); OS.emit('state', OS.state()); };
  OS.track = function (promise) { OS.busy(1); return promise.then(function (x) { OS.busy(-1); return x; }, function (e) { OS.busy(-1); throw e; }); };

  /* ═══ HEALTH ════════════════════════════════════════════════════
     Each check names what it proves. A page loading proves the site is
     served; it proves nothing about the functions behind it, which is
     why each of those is asked directly. */
  var LABEL = { operational: 'Operational', degraded: 'Degraded', unavailable: 'Unavailable', unknown: 'Unknown', not_configured: 'Not configured', checking: 'Checking' };
  OS.LABEL = LABEL;
  OS.stateTag = function (s, text) { return '<span class="os-state ' + esc(s) + '"><i aria-hidden="true"></i>' + esc(text || LABEL[s] || s) + '</span>'; };

  function fail(r) { return r.status === 0 ? (r.error || 'no answer') : 'HTTP ' + r.status; }
  var CHECKS = [
    { id: 'site', name: 'Website', group: 'Edge', core: false, proves: 'This page was served. It does not show that any backend is healthy.',
      run: function () { return Promise.resolve({ status: 'operational', note: 'Served to this browser by GitHub Pages.' }); } },
    { id: 'registry', name: 'Registry API', group: 'Core', core: true, proves: 'The registry function answered its status route, and measured a database round trip itself.',
      run: function () {
        return reg('systemStatus').then(function (r) {
          if (r.ok && r.json && r.json.components) return { status: 'operational', ms: r.ms, note: 'Answered in ' + r.ms + ' ms.', detail: r.json };
          if (r.status === 404) return reg('health').then(function (h) {
            return h.ok && h.json && h.json.ok ? { status: 'operational', ms: h.ms, note: 'Answered /health in ' + h.ms + ' ms. The detailed status route is not deployed yet, so the database was not probed.', detail: null }
              : { status: 'unavailable', ms: h.ms, note: 'No answer: ' + fail(h) };
          });
          return { status: r.status >= 500 || r.status === 0 ? 'unavailable' : 'degraded', ms: r.ms, note: 'No status: ' + fail(r) };
        });
      } },
    { id: 'database', name: 'Database', group: 'Core', core: true, derive: 'registry', proves: 'The registry function read one row from Postgres on this request.',
      from: function (reg) {
        var c = reg && reg.detail && reg.detail.components && reg.detail.components.database;
        if (!reg || reg.status === 'unavailable') return { status: 'unknown', note: 'Not probed: the registry did not answer.' };
        if (!c) return { status: 'unknown', note: 'Not probed: the detailed status route is not deployed yet.' };
        return { status: c.status, ms: c.latency_ms, note: c.status === 'operational' ? 'Round trip ' + c.latency_ms + ' ms, measured by the function.' : 'The function could not read the database.' };
      } },
    { id: 'payments', name: 'Payments (Stripe checkout)', group: 'Commerce', core: true, proves: 'The checkout function answered and reports its Stripe configuration. It does not place a charge.',
      run: function () {
        return request(API + '/lunara-checkout/health').then(function (r) {
          var j = r.json;
          if (!r.ok || !j) return { status: 'unavailable', ms: r.ms, note: 'No answer: ' + fail(r) };
          if (!j.configured) return { status: 'not_configured', ms: r.ms, note: 'No Stripe key is set.' };
          var notes = [(j.products || '?') + ' products, ' + (j.subscriptions || 0) + ' renewing', 'mode ' + j.mode];
          notes.push(j.webhook ? 'webhook configured' : 'no webhook: payments are confirmed by asking Stripe (hourly sweep and on return)');
          return { status: j.mode === 'live' ? 'operational' : 'degraded', ms: r.ms, note: notes.join(' · ') + '.', detail: j };
        });
      } },
    { id: 'a2a', name: 'A2A agent endpoint', group: 'Agents', core: true, proves: 'The agent card was served and declares a protocol version and skills.',
      run: function () {
        return request(REG + '/a2a').then(function (r) {
          var j = r.json;
          if (!r.ok || !j) return { status: 'unavailable', ms: r.ms, note: 'No agent card: ' + fail(r) };
          var skills = (j.skills || []).length;
          if (!j.protocolVersion || !skills) return { status: 'degraded', ms: r.ms, note: 'The card is missing its protocol version or skills.' };
          return { status: 'operational', ms: r.ms, note: 'Protocol ' + j.protocolVersion + ' · ' + skills + ' skills.', detail: { protocolVersion: j.protocolVersion, skills: skills } };
        });
      } },
    { id: 'mcp', name: 'MCP server', group: 'Agents', core: true, proves: 'The MCP server answered tools/list over JSON-RPC.',
      run: function () {
        return request(API + '/lunara-mcp', { body: { jsonrpc: '2.0', id: 1, method: 'tools/list' } }).then(function (r) {
          var tools = r.json && r.json.result && r.json.result.tools;
          if (!r.ok || !tools) return { status: 'unavailable', ms: r.ms, note: 'No tool list: ' + fail(r) };
          return { status: 'operational', ms: r.ms, note: tools.length + ' tools listed.', detail: { tools: tools.length } };
        });
      } },
    { id: 'auth', name: 'Member sign-in', group: 'Core', core: true, proves: 'The sign-in function answered a probe with no session the way it should: by refusing it.',
      run: function () {
        return request(API + '/lunara-auth', { body: { action: 'session' } }).then(function (r) {
          if (r.status === 401 && r.json && r.json.success === false) return { status: 'operational', ms: r.ms, note: 'Refused an empty session, as designed.' };
          if (r.status === 0 || r.status >= 500) return { status: 'unavailable', ms: r.ms, note: 'No answer: ' + fail(r) };
          return { status: 'degraded', ms: r.ms, note: 'Unexpected answer: HTTP ' + r.status + '.' };
        });
      } },
    { id: 'lens', name: 'Lens AI service', group: 'AI', core: true, proves: 'The Lens function answered and reports whether its model is switched on.',
      run: function () {
        return request(API + '/lunara-lens/health').then(function (r) {
          var j = r.json;
          if (!r.ok || !j) return { status: 'unavailable', ms: r.ms, note: 'No answer: ' + fail(r) };
          if (j.paused) return { status: 'degraded', ms: r.ms, note: 'Paused by the owner.' };
          if (!j.ai) return { status: 'not_configured', ms: r.ms, note: 'No model key is set.' };
          return { status: 'operational', ms: r.ms, note: 'Model provider: ' + (j.ai_provider || 'configured') + '.' };
        });
      } },
    { id: 'monitor', name: 'Background monitor (Maze)', group: 'Workers', core: true, proves: 'The monitor reports when its last sweep finished and which sources failed.',
      run: function () {
        return request(API + '/maze/health').then(function (r) {
          var j = r.json;
          if (!r.ok || !j) return { status: 'unavailable', ms: r.ms, note: 'No answer: ' + fail(r) };
          if (!j.last_sweep) return { status: 'unknown', ms: r.ms, note: 'No sweep has been recorded.' };
          var age = Date.now() - Date.parse(j.last_sweep);
          var failing = (j.sources || []).filter(function (s) { return s.failing; }).length;
          var st = age > 2 * 3600e3 ? 'unavailable' : age > 20 * 60e3 || failing ? 'degraded' : 'operational';
          return { status: st, ms: r.ms, at: j.last_sweep, note: 'Last sweep ' + ago(j.last_sweep) + ' · ' + (j.sources || []).length + ' sources' + (failing ? ', ' + failing + ' failing' : ', none failing') + '.' };
        });
      } },
    { id: 'rescans', name: 'Passport rescans (hourly)', group: 'Workers', core: true, derive: 'registry', proves: 'The newest stored passport scan, as the registry reports it.',
      from: function (reg) {
        var c = reg && reg.detail && reg.detail.components && reg.detail.components.passport_rescans;
        if (!c) return { status: 'unknown', note: 'Not reported: the detailed status route is not deployed yet.' };
        return { status: c.status, at: c.last_run, note: c.last_run ? 'Newest scan ' + ago(c.last_run) + '.' : 'No scan stored.' };
      } },
    { id: 'mail', name: 'Outgoing email', group: 'Core', core: false, derive: 'registry', proves: 'Whether a mail provider key is set. Delivery itself is not tested.',
      from: function (reg) {
        var c = reg && reg.detail && reg.detail.components && reg.detail.components.mail;
        if (!c) return { status: 'unknown', note: 'Not reported.' };
        return c.status === 'configured' ? { status: 'unknown', note: 'A key is set; delivery is not observed from here.' } : { status: 'not_configured', note: c.note };
      } },
    { id: 'signing', name: 'Passport signing key', group: 'Trust', core: false, derive: 'registry', proves: 'Whether the Ed25519 key that signs agent passports exists.',
      from: function (reg) {
        var c = reg && reg.detail && reg.detail.components && reg.detail.components.signing;
        if (!c) return { status: 'unknown', note: 'Not reported.' };
        return c.status === 'configured' ? { status: 'operational', note: 'Present. Public half at agentPassportKeys.' } : { status: c.status, note: c.note || '' };
      } }
  ];
  OS.CHECKS = CHECKS;

  var health = { results: null, at: null, running: null };
  try { var cached = JSON.parse(sstore('lx-os-health') || 'null'); if (cached && cached.results) { health.results = cached.results; health.at = cached.at; health.cached = true; } } catch (e) {}

  OS.health = function () { return health; };
  OS.checkHealth = function (force) {
    if (health.running) return health.running;
    if (!force && health.at && Date.now() - Date.parse(health.at) < 60e3) return Promise.resolve(health);
    var started = new Date().toISOString();
    var prev = health.results || {};
    health.inFlight = true;
    OS.emit('health:start', started); OS.emit('state', OS.state());
    var direct = CHECKS.filter(function (c) { return c.run; });
    health.running = Promise.all(direct.map(function (c) {
      return c.run().catch(function () { return { status: 'unknown', note: 'The check itself failed in this browser.' }; }).then(function (res) {
        res.id = c.id; res.checked_at = new Date().toISOString();
        var part = {}; part[c.id] = res; OS.emit('health:one', { id: c.id, result: res });
        return res;
      });
    })).then(function (list) {
      var out = {};
      list.forEach(function (r) { out[r.id] = r; });
      CHECKS.filter(function (c) { return c.derive; }).forEach(function (c) {
        var r = c.from(out[c.derive]); r.id = c.id; r.checked_at = (out[c.derive] && out[c.derive].checked_at) || new Date().toISOString(); out[c.id] = r;
      });
      // A component that just got worse is worth one soft alert.
      Object.keys(out).forEach(function (k) {
        var was = prev[k] && prev[k].status, now = out[k].status;
        if (was === 'operational' && (now === 'degraded' || now === 'unavailable')) { OS.sound('alert'); OS.toast((CHECKS.filter(function (c) { return c.id === k; })[0] || {}).name + ' is now ' + LABEL[now].toLowerCase() + '.', 'warn'); }
      });
      health.results = out; health.at = new Date().toISOString(); health.cached = false; health.inFlight = false; health.running = null;
      sstore('lx-os-health', JSON.stringify({ at: health.at, results: out }));
      OS.emit('health', health); OS.emit('state', OS.state());
      return health;
    });
    return health.running;
  };

  OS.summary = function () {
    if (!health.results) return { status: health.inFlight ? 'checking' : 'unknown', text: health.inFlight ? 'Checking services…' : 'Not checked yet', counts: {} };
    var core = CHECKS.filter(function (c) { return c.core; });
    var counts = { operational: 0, degraded: 0, unavailable: 0, unknown: 0, not_configured: 0 };
    core.forEach(function (c) { var r = health.results[c.id]; counts[(r && r.status) || 'unknown']++; });
    var n = core.length, bad = counts.degraded + counts.unavailable;
    var status = counts.unavailable === n ? 'unavailable' : bad ? 'degraded' : counts.operational === n ? 'operational' : 'unknown';
    var text = status === 'operational' ? 'All ' + n + ' core checks operational'
      : status === 'unavailable' ? 'No backend answered'
      : bad ? bad + ' of ' + n + ' checks degraded or unavailable'
      : counts.operational + ' of ' + n + ' operational, ' + (n - counts.operational) + ' unknown';
    return { status: status, text: text, counts: counts, total: n };
  };

  /* ═══ STATE of the central structure ═════════════════════════════ */
  var attention = 0, lastActivity = null;
  OS.setAttention = function (n) { attention = n | 0; OS.emit('state', OS.state()); };
  OS.setActivity = function (iso) { lastActivity = iso; OS.emit('state', OS.state()); };
  OS.state = function () {
    if (navigator.onLine === false) return { id: 'offline', why: 'This browser reports no network connection.' };
    var s = OS.summary();
    if (!health.results && health.inFlight) return { id: 'connecting', why: 'Health checks are in flight.' };
    if (s.status === 'unavailable') return { id: 'offline', why: 'No backend answered its health check.' };
    if (busy > 0) return { id: 'processing', why: busy + ' request' + (busy > 1 ? 's' : '') + ' you started are in flight.' };
    if (s.status === 'degraded') return { id: 'degraded', why: s.text + '.' };
    if (attention > 0) return { id: 'attention', why: attention + ' item' + (attention > 1 ? 's' : '') + ' waiting on the owner.' };
    if (health.inFlight) return { id: 'connecting', why: 'Re-checking services.' };
    if (lastActivity && Date.now() - Date.parse(lastActivity) < 3600e3) return { id: 'active', why: 'A recorded event in the last hour (' + ago(lastActivity) + ').' };
    if (!health.results) return { id: 'idle', why: 'Not checked yet.' };
    return { id: 'idle', why: s.text + '. Nothing recorded in the last hour.' };
  };
  window.addEventListener('online', function () { OS.emit('state', OS.state()); });
  window.addEventListener('offline', function () { OS.emit('state', OS.state()); });

  /* ═══ SESSION ═══════════════════════════════════════════════════ */
  var session = null;
  OS.session = function () {
    if (session) return session;
    var token = store('lunara_session_token');
    if (!token) { session = Promise.resolve({ signed_in: false, owner: false }); return session; }
    session = reg('osSession', { session_token: token }).then(function (r) {
      if (r.ok && r.json && r.json.success) return { signed_in: !!r.json.signed_in, owner: !!r.json.owner, email: r.json.email || null, checked_at: r.json.checked_at, token: token, by: 'lunara-registry' };
      // Before osSession is deployed: identity from lunara-auth, owner unknown.
      return request(API + '/lunara-auth', { body: { action: 'session', session_token: token } }).then(function (a) {
        if (a.ok && a.json && a.json.success) return { signed_in: true, owner: false, owner_unknown: true, email: a.json.email, token: token, by: 'lunara-auth' };
        return { signed_in: false, owner: false };
      });
    });
    return session;
  };

  /* ═══ THE SHELL ═════════════════════════════════════════════════ */
  function buildRail() {
    var rail = document.createElement('aside');
    rail.className = 'os-rail';
    rail.setAttribute('aria-label', 'Lunara navigation');
    var html = '<a class="os-rail-brand" href="/command.html" aria-label="Lunara Society, Command Center"><img src="/lunara_emblem_96.png" alt="" width="34" height="34"><span>Lunara</span></a><nav aria-label="Workspaces">';
    NAV.forEach(function (g) {
      html += '<div class="os-rail-group" aria-hidden="true">' + esc(g.group) + '</div>';
      g.items.forEach(function (n) {
        html += '<a class="os-rail-item" href="/' + esc(n.href) + '" data-label="' + esc(n.label) + '"' + (here === n.href ? ' aria-current="page"' : '') + '>' + I[n.icon] + '<span class="lbl">' + esc(n.label) + '</span></a>';
      });
    });
    html += '</nav><div class="os-rail-foot">' +
      '<a href="/" data-label="Public site">' + I.site + '<span class="lbl">Public site</span></a>' +
      '<button type="button" id="os-snd" aria-pressed="false">' + I.mute + '<span class="lbl">Sound off</span></button>' +
      '<button type="button" id="os-railtog" aria-expanded="false">' + I.expand + '<span class="lbl">Collapse</span><span class="os-sr">Expand navigation</span></button>' +
      '</div>';
    rail.innerHTML = html;
    return rail;
  }

  function buildTop(title) {
    var top = document.createElement('header');
    top.className = 'os-top';
    top.innerHTML =
      '<div class="os-crumb"><span class="env">Lunara · Sovereign Intelligence OS</span><span class="ws">' + esc(title) + '</span></div>' +
      '<button type="button" class="os-cmd" id="os-cmd" aria-haspopup="dialog" aria-keyshortcuts="Control+K Meta+K">' + I.search + '<span>Search records or run a command</span><kbd>' + (/Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl') + ' K</kbd></button>' +
      '<a class="os-health-chip" id="os-hchip" href="/status.html">' + OS.stateTag('checking') + '<span class="txt">Checking services…</span></a>' +
      '<div class="os-id" id="os-id"><a href="/member.html">Sign in</a></div>';
    return top;
  }

  function buildInspector() {
    var ins = document.createElement('aside');
    ins.className = 'os-inspector';
    ins.id = 'os-inspector';
    ins.setAttribute('aria-label', 'Inspector');
    ins.setAttribute('tabindex', '-1');
    ins.innerHTML = '<div class="os-ins-empty">Select a record to inspect it here: what is declared, what is verified and how, what was observed, and where each fact comes from.</div>';
    return ins;
  }

  function buildFoot() {
    var f = document.createElement('footer');
    f.className = 'os-foot';
    f.innerHTML = '<span>Lunara Society · Sovereign Intelligence OS</span><a href="/docs/sovereign-os.md">Engineering note</a><a href="/evidence.html">Evidence standard</a><a href="/privacy.html">Privacy</a><a href="/terms.html">Terms</a><a href="/contact.html">Contact</a>' +
      '<span class="r">Statuses are measured from this browser at the time shown; nothing on these pages is simulated unless it says so.</span>';
    return f;
  }

  function paintHealthChip() {
    var chip = document.getElementById('os-hchip'); if (!chip) return;
    var s = OS.summary();
    chip.innerHTML = OS.stateTag(s.status === 'unknown' && health.inFlight ? 'checking' : s.status) + '<span class="txt">' + esc(s.text) + (health.at ? ' · ' + utc(health.at) : '') + '</span>';
    chip.title = health.at ? 'Checked ' + stamp(health.at) + (health.cached ? ' (carried from the previous page)' : '') : 'Not checked yet';
  }

  function paintSound() {
    var b = document.getElementById('os-snd'); if (!b) return;
    var on = OS.soundOn();
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
    b.innerHTML = (on ? I.sound : I.mute) + '<span class="lbl">' + (on ? 'Sound on' : 'Sound off') + '</span>';
    b.setAttribute('aria-label', on ? 'Sound is on. Turn it off' : 'Sound is off. Turn it on');
  }
  OS.toggleSound = function () { store('lx-sound', OS.soundOn() ? '0' : '1'); paintSound(); if (OS.soundOn()) OS.sound('confirm'); };
  OS.toggleFx = function () { store('lx-os-fx', OS.lowFx() ? null : 'low'); applyFx(); OS.emit('fx', OS.lowFx()); OS.toast(OS.lowFx() ? 'Reduced effects: the central structure holds still.' : 'Full effects restored.'); };

  function setRail(open) {
    var fr = document.querySelector('.os-frame'); if (!fr) return;
    fr.classList.toggle('rail-open', open);
    var b = document.getElementById('os-railtog');
    if (b) { b.setAttribute('aria-expanded', open ? 'true' : 'false'); b.innerHTML = (open ? I.collapse : I.expand) + '<span class="lbl">Collapse</span><span class="os-sr">' + (open ? 'Collapse navigation' : 'Expand navigation') + '</span>'; }
    store('lx-os-rail', open ? '1' : '0');
  }
  OS.toggleRail = function () { setRail(!document.querySelector('.os-frame').classList.contains('rail-open')); };

  function paintIdentity() {
    OS.session().then(function (s) {
      var box = document.getElementById('os-id'); if (!box) return;
      if (!s.signed_in) { box.innerHTML = '<a href="/member.html">Sign in</a>'; return; }
      box.innerHTML = (s.owner ? '<span class="owner" title="Confirmed by the registry for this session">Owner</span>' : '') +
        '<a href="/member.html" title="Session confirmed by ' + esc(s.by) + '">' + esc(s.email || 'Signed in') + '</a>';
      OS.emit('session', s);
    });
  }

  /* ═══ THE INSPECTOR ═════════════════════════════════════════════ */
  var current = null, lastFocus = null;
  function dockable() { return window.innerWidth >= 1360; }
  function layoutDock() {
    var wa = document.querySelector('.os-workarea'); if (!wa) return;
    wa.classList.toggle('has-dock', dockable() && wa.dataset.dock !== 'off');
  }
  OS.trust = function (kind, text, why) {
    return '<span class="os-trust ' + esc(kind) + '" tabindex="0" title="' + esc(why || '') + '">' + esc(text || kind) + (why ? '<span class="os-sr">: ' + esc(why) + '</span>' : '') + '</span>';
  };
  OS.kv = function (rows) {
    return '<dl class="os-kv">' + rows.filter(Boolean).map(function (r) { return '<dt>' + esc(r[0]) + '</dt><dd>' + (r[2] ? r[1] : esc(r[1] == null || r[1] === '' ? '—' : r[1])) + '</dd>'; }).join('') + '</dl>';
  };
  function renderInspector(spec, stale) {
    var ins = document.getElementById('os-inspector'); if (!ins) return;
    var h = '<div class="os-ins-h"><div><div class="k">' + esc(spec.kind || 'Record') + '</div><h2 id="os-ins-title" tabindex="-1">' + esc(spec.title) + '</h2>' +
      (spec.subtitle ? '<div class="os-note" style="margin-top:6px">' + esc(spec.subtitle) + '</div>' : '') + '</div>' +
      '<button type="button" class="os-ins-x" aria-label="Close inspector">&times;</button></div>';
    if (stale) h += '<div class="os-ins-stale" role="status">' + esc(stale) + '</div>';
    h += '<div class="os-ins-b">';
    (spec.sections || []).forEach(function (s) {
      h += '<section class="os-ins-sec">' + (s.label ? '<span class="os-label">' + esc(s.label) + '</span>' : '') + (s.html || (s.kv ? OS.kv(s.kv) : '')) + (s.note ? '<p class="os-note" style="margin:10px 0 0">' + esc(s.note) + '</p>' : '') + '</section>';
    });
    if (spec.actions && spec.actions.length) {
      h += '<section class="os-ins-sec"><span class="os-label">Actions</span><div class="os-ins-actions">' + spec.actions.map(function (a, i) {
        return a.href ? '<a class="os-btn small' + (a.primary ? ' primary' : '') + '" href="' + esc(a.href) + '"' + (a.external ? ' target="_blank" rel="noopener"' : '') + '>' + esc(a.label) + '</a>'
          : '<button type="button" class="os-btn small' + (a.primary ? ' primary' : '') + '" data-act="' + i + '">' + esc(a.label) + '</button>';
      }).join('') + '</div></section>';
    }
    h += '<section class="os-ins-sec"><span class="os-fresh">' + (spec.source ? 'Source: ' + esc(spec.source) + ' · ' : '') + 'read ' + esc(spec.asOf ? stamp(spec.asOf) : stamp(new Date())) + '</span></section></div>';
    ins.innerHTML = h;
    ins.querySelector('.os-ins-x').addEventListener('click', OS.closeInspector);
    [].forEach.call(ins.querySelectorAll('[data-act]'), function (b) { b.addEventListener('click', function () { var a = spec.actions[+b.dataset.act]; if (a && a.run) a.run(b); }); });
  }
  OS.inspect = function (spec, opts) {
    current = { spec: spec, at: Date.now() };
    renderInspector(spec);
    var ins = document.getElementById('os-inspector');
    if (!document.querySelector('.os-workarea.has-dock')) ins.classList.add('open');
    if (!opts || opts.focus !== false) { lastFocus = document.activeElement; var t = document.getElementById('os-ins-title'); if (t) t.focus({ preventScroll: true }); }
    if (spec.key) { try { var rec = JSON.parse(store('lx-os-recent') || '[]').filter(function (x) { return x.key !== spec.key; }); if (spec.href) { rec.unshift({ key: spec.key, title: spec.title, kind: spec.kind, href: spec.href }); store('lx-os-recent', JSON.stringify(rec.slice(0, 8))); } } catch (e) {} }
  };
  OS.closeInspector = function () {
    var ins = document.getElementById('os-inspector'); if (!ins) return;
    ins.classList.remove('open');
    current = null;
    ins.innerHTML = '<div class="os-ins-empty">Select a record to inspect it here.</div>';
    if (lastFocus && lastFocus.focus) lastFocus.focus();
    OS.emit('inspector:closed');
  };
  /* A workspace calls this when it reloads a source. The inspector
     re-reads its record through spec.refresh, or says it is gone. */
  OS.refreshed = function (source) {
    if (!current || current.spec.source !== source) return;
    var next = current.spec.refresh ? current.spec.refresh() : undefined;
    if (next) { current.spec = next; renderInspector(next); }
    else if (next === null) renderInspector(current.spec, 'This record is no longer in the latest data from ' + source + ' (read ' + utc(new Date()) + '). What is shown is what it was.');
  };

  /* ═══ THE COMMAND PALETTE ═══════════════════════════════════════ */
  var commands = [];
  OS.command = function (c) { commands.push(c); };

  function baseCommands() {
    NAV.forEach(function (g) { g.items.forEach(function (n) { OS.command({ group: 'Go to', title: n.label, icon: n.icon, href: '/' + n.href, keys: n.label + ' ' + g.group }); }); });
    [['passport.html', 'Passport control: scan a domain', 'globe'], ['registry.html', 'The public register', 'evidence'], ['agent-network.html', 'Agent Network: trials, tiers and joining', 'agents'],
     ['agents.html', 'For AI agents: A2A and partners', 'agents'], ['intelligence.html', 'The Regulatory Record', 'law'], ['league.html', 'The AI Passport League', 'globe'],
     ['certify.html', 'Certification and prices', 'trust'], ['desk.html', 'Owner review desk', 'audit']].forEach(function (p) {
      OS.command({ group: 'Go to', title: p[1], icon: p[2], href: '/' + p[0], keys: p[0], owner: p[0] === 'desk.html' });
    });
    OS.command({ group: 'Actions', title: 'Check every service now', icon: 'status', keys: 'health status refresh', run: function () { OS.checkHealth(true).then(function () { var s = OS.summary(); OS.toast(s.text + ' · ' + utc(health.at), s.status === 'operational' ? 'ok' : 'warn'); }); } });
    OS.command({ group: 'Actions', title: 'Verify every signed document in this browser', icon: 'evidence', keys: 'signature verify ed25519 hash evidence', href: '/evidence-registry.html#verify-all' });
    OS.command({ group: 'Actions', title: 'Send a message to Lunara\'s A2A agent', icon: 'agents', keys: 'a2a agent message protocol', href: '/agent-atlas.html#a2a' });
    OS.command({ group: 'Actions', title: 'Turn sound ' + (OS.soundOn() ? 'off' : 'on'), icon: 'sound', keys: 'sound audio mute', run: OS.toggleSound, dyn: function () { return 'Turn sound ' + (OS.soundOn() ? 'off' : 'on'); } });
    OS.command({ group: 'Actions', title: 'Reduce visual effects', icon: 'fx', keys: 'effects motion performance low', run: OS.toggleFx, dyn: function () { return OS.lowFx() ? 'Restore full visual effects' : 'Reduce visual effects'; } });
    OS.command({ group: 'Actions', title: 'Expand or collapse the navigation', icon: 'expand', keys: 'rail navigation sidebar', run: OS.toggleRail });
    OS.command({ group: 'Owner', title: 'Open the owner queue', icon: 'command', keys: 'queue pending approvals', href: '/command.html#queue', owner: true });
    OS.command({ group: 'Owner', title: 'Open the audit chain', icon: 'audit', keys: 'audit chain log decisions', href: '/audit.html#chain', owner: true });
    OS.command({ group: 'Account', title: 'Your account and membership', icon: 'member', keys: 'account sign in membership', href: '/member.html' });
    OS.command({ group: 'Account', title: 'Manage or cancel a subscription', icon: 'member', keys: 'subscription cancel billing portal', href: '/manage.html' });
  }

  /* Record sources. Each loads once per page, on first use, and says
     whether it answered. */
  var SOURCES = {
    register: { label: 'Register', route: 'shieldRegistryList', load: function () { return reg('shieldRegistryList').then(function (r) { if (!r.ok || !r.json) throw 0; return (r.json.entries || []).map(function (e) { return { title: e.business_name, sub: e.public_id + ' · ' + e.domain + ' · ' + e.status, href: '/registry.html?id=' + encodeURIComponent(e.public_id), keys: [e.domain, e.public_id, e.agent_name].join(' '), icon: 'evidence', date: e.verification_date, mark: 'verified', markWhy: 'Approved by a named reviewer after a DNS proof.' }; }); }); } },
    agents: { label: 'Agents', route: 'networkDirectory', load: function () { return reg('networkDirectory').then(function (r) { if (!r.ok || !r.json) throw 0; return (r.json.agents || []).map(function (a) { return { title: a.name, sub: a.agent_id + ' · ' + a.tier_title + ' · operated by ' + a.operator, href: '/agent-atlas.html?agent=' + encodeURIComponent(a.agent_id), keys: [a.agent_id, a.operator, a.description].join(' '), icon: 'agents', date: a.joined, mark: 'declared', markWhy: 'Name and description are declared by the operator.' }; }); }); } },
    missions: { label: 'Missions', route: 'missionList', load: function () { return reg('missionList').then(function (r) { if (!r.ok || !r.json) throw 0; return (r.json.missions || []).map(function (m) { return { title: m.title, sub: m.points + ' points · ' + m.open_to, href: '/missions.html#' + encodeURIComponent(m.id), keys: m.id + ' ' + m.about, icon: 'missions', text: m.about, mark: 'observed', markWhy: 'The live mission catalogue.' }; }); }); } },
    law: { label: 'Obligations', route: '/corpus/obligations.json', load: function () { return request('/corpus/obligations.json').then(function (r) { if (!r.ok || !r.json) throw 0; return (r.json.obligations || []).map(function (o) { return { title: o.name, sub: o.instrument + ' · from ' + o.applies_from, href: '/regulation.html#' + encodeURIComponent(o.id), keys: [o.id, o.jurisdiction, o.article, o.summary].join(' '), icon: 'law', text: o.summary, date: o.applies_from, checked: o.verified, mark: o.classification === 'verified' ? 'verified' : 'unverified', markWhy: 'Date and article checked against the primary source on ' + o.verified + '.', source: o.source }; }); }); } },
    docs: { label: 'Signed documents', route: '/.well-known/assertions.json', load: function () { return request('/.well-known/assertions.json').then(function (r) { if (!r.ok || !r.json) throw 0; return (r.json.assertions || []).map(function (a) { var p = a.subject.replace('https://lunarasociety.com/', ''); return { title: p, sub: 'Signed ' + day(a.issued_at) + ' · key ' + a.key_id, href: '/evidence-registry.html#' + encodeURIComponent(p), keys: 'signature assertion ' + a.type + ' ' + p, icon: 'evidence', date: a.issued_at, mark: 'verified', markWhy: 'Carries an Ed25519 signature; verify it in the Evidence Registry.' }; }); }); } },
    league: { label: 'League domains', route: 'passportLeague', load: function () { return reg('passportLeague').then(function (r) { if (!r.ok || !r.json) throw 0; return (r.json.entries || []).map(function (e) { return { title: e.name || e.domain, sub: e.domain + ' · passport ' + e.score + ' (' + e.grade + ') · scanned ' + day(e.scanned_at), href: '/passport.html?d=' + encodeURIComponent(e.domain), keys: e.domain + ' ' + (e.category || ''), icon: 'globe', date: e.scanned_at, mark: 'observed', markWhy: 'Measured by the passport scanner on the date shown.' }; }); }); } },
    glossary: { label: 'Glossary', route: '/glossary.json', load: function () { return request('/glossary.json').then(function (r) { if (!r.ok || !r.json) throw 0; return (r.json.terms || []).map(function (t) { return { title: t.term, sub: t.short, href: '/glossary.html#' + encodeURIComponent(t.id), keys: t.id + ' ' + t.short, icon: 'doc', text: t.short, mark: 'declared', markWhy: 'Lunara\'s definition (' + (t.authority || 'field') + ').' }; }); }); } }
  };
  var PREFIX = { agent: 'agents', agents: 'agents', reg: 'register', register: 'register', law: 'law', doc: 'docs', docs: 'docs', mission: 'missions', missions: 'missions', domain: 'league', league: 'league', term: 'glossary' };
  var loaded = {};
  function loadSource(k) {
    if (loaded[k]) return loaded[k];
    loaded[k] = { state: 'loading', items: [] };
    loaded[k].p = SOURCES[k].load().then(function (items) { loaded[k].state = 'ok'; loaded[k].items = items; loaded[k].at = new Date().toISOString(); }, function () { loaded[k].state = 'unavailable'; });
    return loaded[k];
  }
  OS.searchSources = SOURCES;
  OS.loadSource = function (k) { var s = loadSource(k); return s.p.then(function () { return s; }); };

  function score(q, text) {
    text = String(text || '').toLowerCase();
    var terms = q.split(/\s+/).filter(Boolean), s = 0;
    for (var i = 0; i < terms.length; i++) { var at = text.indexOf(terms[i]); if (at < 0) return 0; s += at === 0 ? 3 : 1; }
    return s;
  }
  var DOMAIN = /^(?:https?:\/\/)?(?:www\.)?([a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,})\/?$/i;

  var pal = null, palList = null, palInput = null, palMode = null, palFoot = null, palItems = [], palSel = 0, palPrev = null, palSession = { owner: false };
  function buildPalette() {
    var back = document.createElement('div');
    back.className = 'os-pal-back'; back.hidden = true;
    back.innerHTML = '<div class="os-pal" role="dialog" aria-modal="true" aria-label="Command palette">' +
      '<div class="os-pal-in">' + I.search + '<input id="os-pal-q" type="text" role="combobox" aria-expanded="true" aria-controls="os-pal-list" aria-autocomplete="list" autocomplete="off" spellcheck="false" placeholder="Search agents, records, obligations… or type a command"><span class="os-pal-mode" id="os-pal-mode">Global</span></div>' +
      '<ul id="os-pal-list" role="listbox" aria-label="Results"></ul>' +
      '<div class="os-pal-foot"><span><kbd>↑</kbd> <kbd>↓</kbd> move</span><span><kbd>Enter</kbd> open</span><span><kbd>Esc</kbd> close</span><span>Filter with <code>agent:</code> <code>reg:</code> <code>law:</code> <code>doc:</code> <code>mission:</code> <code>domain:</code> · ask AI with <code>?</code></span><span class="srcs" id="os-pal-srcs"></span></div></div>';
    document.body.appendChild(back);
    pal = back; palList = back.querySelector('#os-pal-list'); palInput = back.querySelector('#os-pal-q'); palMode = back.querySelector('#os-pal-mode'); palFoot = back.querySelector('#os-pal-srcs');
    back.addEventListener('mousedown', function (e) { if (e.target === back) OS.closePalette(); });
    palInput.addEventListener('input', renderPalette);
    palInput.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
      else if (e.key === 'Enter') { e.preventDefault(); choose(palItems[palSel]); }
      else if (e.key === 'Escape') { e.preventDefault(); OS.closePalette(); }
      else if (e.key === 'Tab') { e.preventDefault(); } // the dialog has one control
    });
  }
  function move(d) { if (!palItems.length) return; palSel = (palSel + d + palItems.length) % palItems.length; paintSel(); }
  function paintSel() {
    [].forEach.call(palList.querySelectorAll('[role="option"]'), function (li, i) {
      var on = i === palSel; li.setAttribute('aria-selected', on ? 'true' : 'false');
      if (on) { palInput.setAttribute('aria-activedescendant', li.id); li.scrollIntoView({ block: 'nearest' }); }
    });
  }
  function choose(it) {
    if (!it) return;
    OS.closePalette(true);
    if (it.run) it.run();
    else if (it.href) location.href = it.href;
  }
  function renderPalette() {
    var raw = palInput.value.trim(), q = raw.toLowerCase();
    var mode = 'global', filter = null;
    var m = q.match(/^([a-z]+):\s*(.*)$/);
    if (m && PREFIX[m[1]]) { filter = PREFIX[m[1]]; q = m[2]; mode = 'filtered'; }
    if (q.charAt(0) === '?') mode = 'ai';
    palMode.className = 'os-pal-mode' + (mode === 'ai' ? ' ai' : mode === 'filtered' ? ' filtered' : '');
    palMode.textContent = mode === 'ai' ? 'AI-assisted' : mode === 'filtered' ? 'Filtered: ' + SOURCES[filter].label : 'Global';
    var groups = [];
    if (mode === 'ai') {
      var ask = raw.replace(/^\?\s*/, '');
      groups.push({ name: 'AI-assisted (answers are generated, not sourced)', items: ask ? [{ title: 'Ask Rosario: ' + ask, sub: 'Opens the Intelligence workspace; the answer is labelled as AI-generated and kept apart from sourced records', icon: 'ai', href: '/investigate.html?ask=' + encodeURIComponent(ask) }] : [] });
    } else {
      if (!filter) {
        var cmds = commands.filter(function (c) { return (!c.owner || palSession.owner) && (!q || score(q, c.title + ' ' + (c.keys || '')) > 0); })
          .map(function (c) { return { title: c.dyn ? c.dyn() : c.title, sub: c.group === 'Go to' ? (c.href || '') : '', icon: c.icon, href: c.href, run: c.run, grp: c.group }; });
        ['Go to', 'Actions', 'Owner', 'Account'].forEach(function (g) {
          var items = cmds.filter(function (c) { return c.grp === g; });
          if (!q && g === 'Go to') items = items.slice(0, 11);
          if (items.length) groups.push({ name: g, items: items });
        });
        var dm = raw.match(DOMAIN);
        if (dm) groups.unshift({ name: 'For this domain', items: [
          { title: 'Scan the passport of ' + dm[1], sub: 'A live scan of 13 public signals, on passport.html', icon: 'globe', href: '/passport.html?d=' + encodeURIComponent(dm[1].toLowerCase()) },
          { title: 'Simulate fixes for ' + dm[1], sub: 'Scenario Lab: from its stored scan, never written back', icon: 'sim', href: '/simulate.html?d=' + encodeURIComponent(dm[1].toLowerCase()) }] });
        if (!q) {
          try { var rec = JSON.parse(store('lx-os-recent') || '[]'); if (rec.length) groups.unshift({ name: 'Recent records', items: rec.map(function (r) { return { title: r.title, sub: r.kind, icon: 'doc', href: r.href }; }) }); } catch (e) {}
        }
      }
      if (q || filter) {
        var keys = filter ? [filter] : Object.keys(SOURCES);
        keys.forEach(function (k) {
          var s = loadSource(k);
          if (s.state === 'loading') s.p.then(function () { if (!pal.hidden) renderPalette(); });
          var hits = s.items.map(function (it) { return { it: it, s: score(q, it.title + ' ' + it.sub + ' ' + it.keys) }; })
            .filter(function (x) { return !q || x.s > 0; }).sort(function (a, b) { return b.s - a.s; }).slice(0, filter ? 30 : 5)
            .map(function (x) { return { title: x.it.title, sub: x.it.sub, icon: x.it.icon, href: x.it.href, src: SOURCES[k].label }; });
          if (hits.length) groups.push({ name: SOURCES[k].label, items: hits });
        });
        if (q && !filter) groups.push({ name: 'Intelligence workspace', items: [{ title: 'Search every source for “' + raw + '”', sub: 'Grouped by record type, with sources and dates', icon: 'intel', href: '/investigate.html?q=' + encodeURIComponent(raw) }] });
      }
    }
    palItems = []; var html = '', n = 0;
    groups.forEach(function (g) {
      html += '<li class="grp" role="presentation">' + esc(g.name) + '</li>';
      g.items.forEach(function (it) {
        palItems.push(it);
        html += '<li role="option" id="os-opt-' + n + '" data-i="' + n + '" aria-selected="false">' + I[it.icon || 'doc'] + '<div style="min-width:0"><div class="t">' + esc(it.title) + '</div>' + (it.sub ? '<div class="d">' + esc(it.sub) + '</div>' : '') + '</div><span class="s">' + esc(it.src || (it.run ? 'run' : '')) + '</span></li>';
        n++;
      });
    });
    palList.innerHTML = html || '<li class="os-pal-empty" role="presentation">' + (Object.keys(loaded).some(function (k) { return loaded[k].state === 'loading'; }) ? 'Searching…' : 'Nothing matches. Records come from the live register, the Agent Network, the corpus and the signed documents; nothing is invented to fill this list.') + '</li>';
    palSel = Math.min(palSel, Math.max(0, palItems.length - 1));
    paintSel();
    [].forEach.call(palList.querySelectorAll('[role="option"]'), function (li) {
      li.addEventListener('mousemove', function () { var i = +li.dataset.i; if (i !== palSel) { palSel = i; paintSel(); } });
      li.addEventListener('click', function () { choose(palItems[+li.dataset.i]); });
    });
    palFoot.textContent = Object.keys(loaded).map(function (k) { return SOURCES[k].label + (loaded[k].state === 'ok' ? ' ✓' : loaded[k].state === 'loading' ? ' …' : ' unavailable'); }).join(' · ');
  }
  OS.openPalette = function (q) {
    if (!pal) return;
    palPrev = document.activeElement;
    pal.hidden = false;
    requestAnimationFrame(function () { pal.classList.add('on'); });
    palInput.value = q || ''; palSel = 0;
    OS.session().then(function (s) { palSession = s; renderPalette(); });
    renderPalette();
    palInput.focus();
    OS.sound('open');
  };
  OS.closePalette = function (keepFocus) {
    if (!pal || pal.hidden) return;
    pal.classList.remove('on'); pal.hidden = true;
    if (!keepFocus && palPrev && palPrev.focus) palPrev.focus();
  };

  /* ═══ BOOT ══════════════════════════════════════════════════════ */
  function rememberReferral() {
    try {
      var r = (new URLSearchParams(location.search).get('ref') || '').trim().toUpperCase();
      if (/^P-[0-9A-HJKMNP-TV-Z]{6}$/.test(r)) localStorage.setItem('lx-ref', JSON.stringify({ c: r, t: Date.now() }));
    } catch (e) {}
  }

  function boot() {
    rememberReferral();
    var frame = document.querySelector('.os-frame'), body = document.querySelector('.os-body'), wa = document.querySelector('.os-workarea');
    if (!frame || !body || !wa) return;
    var fallback = document.querySelector('.os-fallback'); if (fallback) fallback.parentNode.removeChild(fallback);
    frame.insertBefore(buildRail(), body);
    body.insertBefore(buildTop(document.body.dataset.workspace || document.title.split('|')[0].trim()), body.firstChild);
    wa.appendChild(buildInspector());
    body.appendChild(buildFoot());
    toasts = document.createElement('div'); toasts.className = 'os-toasts'; toasts.setAttribute('role', 'status'); toasts.setAttribute('aria-live', 'polite'); document.body.appendChild(toasts);
    buildPalette(); baseCommands();
    setRail(store('lx-os-rail') === '1');
    layoutDock(); window.addEventListener('resize', layoutDock);
    paintSound(); paintHealthChip(); paintIdentity();
    document.getElementById('os-snd').addEventListener('click', OS.toggleSound);
    document.getElementById('os-railtog').addEventListener('click', OS.toggleRail);
    document.getElementById('os-cmd').addEventListener('click', function () { OS.openPalette(); });
    document.addEventListener('keydown', function (e) {
      var typing = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target && e.target.tagName) || '') || (e.target && e.target.isContentEditable);
      if ((e.key === 'k' || e.key === 'K') && (e.metaKey || e.ctrlKey)) { e.preventDefault(); pal.hidden ? OS.openPalette() : OS.closePalette(); }
      else if (e.key === '/' && !typing && pal.hidden) { e.preventDefault(); OS.openPalette(); }
      else if (e.key === 'Escape' && pal.hidden && current) { OS.closeInspector(); }
    });
    OS.on('health', paintHealthChip);
    OS.on('health:start', paintHealthChip);
    OS.on('session', function (s) { palSession = s; });
    // The header's verdict: fresh enough from the previous page, or checked now.
    OS.checkHealth(false);
    OS.emit('ready', OS);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
