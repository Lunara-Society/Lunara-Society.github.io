/* The Command Center (command.html). Reads only real sources: the
   health checks in lunara-os.js, the registry's activityFeed (or the
   owner's opsActivity), the monitor's public cases, and the published
   corpus, register, league, directory and signed-document index. */
(function () {
  'use strict';
  var OS = window.LunaraOS;
  if (!OS) return;
  var esc = OS.esc, $ = function (id) { return document.getElementById(id); };
  var core = null, session = { owner: false }, events = new Map(), feedAt = null, feedErr = null, queue = [], obligations = [];

  /* ── the entrance: once every 12 hours, never more than ~2.6 s ────
     A component with explicit states, not loose timeouts:
       boot → signal → mark → resolve → done
     "resolve" reports the real result of the health checks, or that
     they are still running. It never claims a sign-in happened. */
  function entrance() {
    var box = $('cc-entrance');
    var seen = Date.now() - (+OS.store('lx-os-entered') || 0) < 12 * 3600e3;
    if (OS.REDUCED || seen || /[?&]intro=0/.test(location.search)) { box.parentNode.removeChild(box); return; }
    OS.store('lx-os-entered', String(Date.now()));
    box.hidden = false;
    var line = $('cc-entrance-line'), timers = [], state = 'boot', finished = false;
    function go(s) { state = s; box.dataset.state = s; }
    function at(ms, fn) { timers.push(setTimeout(fn, ms)); }
    function done() {
      if (finished) return; finished = true;
      timers.forEach(clearTimeout); go('done'); box.classList.add('done');
      setTimeout(function () { if (box.parentNode) box.parentNode.removeChild(box); }, 520);
      document.removeEventListener('keydown', key);
      var h = document.querySelector('h1'); if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); }
    }
    function key(e) { if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') { e.preventDefault(); done(); } }
    document.addEventListener('keydown', key);
    $('cc-skip').addEventListener('click', done);
    $('cc-skip').focus({ preventScroll: true });
    go('signal');
    line.textContent = 'Contacting ' + OS.CHECKS.filter(function (c) { return c.run; }).length + ' services…';
    at(900, function () { go('mark'); });
    at(1700, function () {
      go('resolve');
      var s = OS.summary();
      line.textContent = OS.health().results && !OS.health().cached ? s.text + '.' : 'Checks still running: the page opens now and shows them as they land.';
    });
    at(2600, done);
  }

  /* ── the core and the health list ────────────────────────────── */
  function satellites() {
    var res = OS.health().results || {};
    return OS.CHECKS.filter(function (c) { return c.core; }).map(function (c) { return { id: c.id, name: c.name, status: (res[c.id] && res[c.id].status) || (OS.health().inFlight ? 'checking' : 'unknown') }; });
  }
  function inspectService(id) {
    var c = OS.CHECKS.filter(function (x) { return x.id === id; })[0]; if (!c) return;
    var r = (OS.health().results || {})[id] || { status: 'unknown', note: 'Not checked yet.' };
    OS.inspect({
      kind: 'Service', title: c.name, subtitle: c.group, source: 'health check from this browser', asOf: r.checked_at,
      sections: [
        { label: 'Measured', html: OS.stateTag(r.status) + (r.ms != null ? ' <span class="os-num os-note">' + r.ms + ' ms</span>' : '') + '<p style="margin:10px 0 0">' + esc(r.note || '') + '</p>' },
        { label: 'What this check proves', html: '<p>' + esc(c.proves) + '</p>' },
        { label: 'When', kv: [['Checked', r.checked_at ? OS.stamp(r.checked_at) : 'never'], r.at ? ['Last run', OS.stamp(r.at)] : null, ['Counts toward', c.core ? 'the overall status' : 'nothing: shown for information']] }
      ],
      actions: [{ label: 'Check again', run: function () { OS.checkHealth(true); } }, { label: 'System status page', href: '/status.html' }],
      refresh: function () { return null; }
    });
  }
  function paintServices() {
    var res = OS.health().results || {}, inflight = OS.health().inFlight;
    $('cc-svcs').innerHTML = OS.CHECKS.filter(function (c) { return c.core; }).map(function (c) {
      var r = res[c.id], st = r ? r.status : inflight ? 'checking' : 'unknown';
      return '<button type="button" class="cc-svc" role="listitem" data-svc="' + c.id + '"><span class="n">' + esc(c.name) + '</span>' + OS.stateTag(st) +
        '<span class="m">' + esc(r ? r.note || '' : inflight ? 'Asking now…' : 'Not checked yet.') + '</span></button>';
    }).join('');
    [].forEach.call(document.querySelectorAll('[data-svc]'), function (b) { b.addEventListener('click', function () { inspectService(b.dataset.svc); }); });
    var h = OS.health();
    $('cc-fresh').textContent = h.at ? 'Checked ' + OS.utc(h.at) + (h.cached ? ' (from the previous page; re-checking)' : '') : '';
    if (core) core.refresh();
  }
  function paintState() {
    var s = OS.state();
    $('cc-state').textContent = { idle: 'Idle', connecting: 'Connecting', processing: 'Processing', active: 'Active', attention: 'Attention required', degraded: 'Degraded', offline: 'Offline' }[s.id];
    $('cc-why').textContent = s.why;
    if (core) core.setState(s.id);
  }

  /* ── figures: the record as it stands, each with its source ───── */
  function fig(v, label, src, href, unit) {
    return '<div class="cc-fig"><span class="v">' + esc(v) + (unit ? '<small>' + esc(unit) + '</small>' : '') + '</span><span class="l">' + (href ? '<a href="' + esc(href) + '">' + esc(label) + '</a>' : esc(label)) + '</span><span class="s">' + esc(src) + '</span></div>';
  }
  function paintFigures() {
    var parts = {};
    function render() {
      var order = ['register', 'league', 'agents', 'missions', 'docs', 'deadline'];
      $('cc-figs').innerHTML = order.map(function (k) { return parts[k] || '<div class="cc-fig"><div class="os-skel" style="grid-column:1/3"></div></div>'; }).join('');
    }
    render();
    function miss(k, label) { parts[k] = fig('—', label, 'unavailable just now: the source did not answer'); render(); }
    OS.reg('shieldRegistryList').then(function (r) {
      if (!r.ok || !r.json) return miss('register', 'verified register entries');
      parts.register = fig(r.json.count, r.json.count === 1 ? 'verified register entry' : 'verified register entries', 'registry_entries · read ' + OS.utc(r.at), '/registry.html'); render();
    });
    OS.reg('passportLeague').then(function (r) {
      if (!r.ok || !r.json) return miss('league', 'league domains measured');
      parts.league = fig(r.json.scanned, 'of ' + r.json.listed + ' league domains measured', 'passport_scans · read ' + OS.utc(r.at), '/league.html'); render();
    });
    OS.reg('networkDirectory').then(function (r) {
      if (!r.ok || !r.json) return miss('agents', 'agents in the network');
      var m = r.json.members || {};
      parts.agents = fig(m.total != null ? m.total : r.json.listed, 'agents joined · ' + r.json.listed + ' listed', 'network_agents · read ' + OS.utc(r.at), '/agent-atlas.html'); render();
    });
    OS.reg('missionList').then(function (r) {
      if (!r.ok || !r.json) return miss('missions', 'missions open');
      parts.missions = fig((r.json.missions || []).length, 'missions open to agents', 'mission catalogue · read ' + OS.utc(r.at), '/missions.html'); render();
    });
    OS.request('/.well-known/assertions.json').then(function (r) {
      if (!r.ok || !r.json) return miss('docs', 'signed documents');
      parts.docs = fig((r.json.assertions || []).length, 'documents published with an Ed25519 signature', 'assertions.json · ' + OS.day(r.json.updated), '/evidence-registry.html'); render();
    });
    OS.request('/corpus/obligations.json').then(function (r) {
      if (!r.ok || !r.json) return miss('deadline', 'next regulatory date');
      obligations = r.json.obligations || [];
      var today = new Date().toISOString().slice(0, 10);
      var next = obligations.filter(function (o) { return o.applies_from > today; }).sort(function (a, b) { return a.applies_from.localeCompare(b.applies_from); })[0];
      parts.deadline = next ? fig(Math.ceil((Date.parse(next.applies_from) - Date.now()) / 864e5), 'days to ' + next.applies_from + ': ' + next.name, next.instrument.split(',')[0] + ' · ' + next.classification + ' ' + next.verified, '/regulation.html#' + next.id)
        : fig('—', 'no future date in the corpus', 'corpus/obligations.json');
      render(); paintQueue();
    });
  }

  /* ── activity ────────────────────────────────────────────────── */
  var TYPE = {
    'register.verified': 'Register', 'register.revoked': 'Revocation', 'passport.changed': 'Passport', 'passport.scanned': 'Passport',
    'agent.joined': 'Agent', 'mission.approved': 'Mission', 'trial.passed': 'Trial', 'monitor.case': 'Monitor',
    'payment.confirmed': 'Payment', 'checkout.opened': 'Checkout', 'application.received': 'Application', 'partner.applied': 'Partner',
    'mission.submitted': 'Mission', 'admin.action': 'Decision'
  };
  function paintFeed() {
    var list = Array.from(events.values()).sort(function (a, b) { return Date.parse(b.at) - Date.parse(a.at); }).slice(0, 80);
    var box = $('cc-feed');
    if (feedErr && !list.length) { box.innerHTML = '<div class="os-empty"><strong>The activity record did not answer</strong><p>' + esc(feedErr) + ' Nothing is shown in its place. The page tries again every minute.</p></div>'; return; }
    if (!list.length) {
      box.innerHTML = '<div class="os-empty">' + OS.icon('audit') + '<strong>Nothing recorded yet</strong><p>Register decisions, rescans of the league\'s domains, agents joining, trials passed and missions approved appear here as they are recorded, each with its source table and time.</p></div>'; return;
    }
    box.innerHTML = list.map(function (e) {
      return '<div class="cc-ev"><div class="tm">' + esc(OS.day(e.at)) + '<br>' + esc(OS.utc(e.at).replace(' UTC', '')) + '</div><div><div class="tp' + (e.private ? ' priv' : '') + '">' + esc(TYPE[e.type] || e.type) + (e.private ? ' · owner only' : '') + '</div>' +
        (e.link ? '<a href="' + esc(e.link) + '">' + esc(e.title) + '</a>' : '<span style="color:var(--os-text)">' + esc(e.title) + '</span>') +
        (e.detail ? '<div class="os-note">' + esc(e.detail) + '</div>' : '') + '<div class="sr">' + esc(e.source) + ' · ' + esc(OS.ago(e.at)) + '</div></div></div>';
    }).join('');
    var newest = list[0]; if (newest) OS.setActivity(newest.at);
  }
  function stampFeed() {
    var f = $('cc-feed-fresh'); if (!f) return;
    if (!feedAt) { f.textContent = feedErr ? 'unavailable' : 'loading…'; return; }
    var age = Date.now() - Date.parse(feedAt);
    f.textContent = 'read ' + OS.utc(feedAt) + (feedErr ? ' · last attempt failed' : '');
    f.classList.toggle('stale', age > 180e3 || !!feedErr);
  }
  function loadFeed() {
    var owner = session.owner;
    var p = owner ? OS.reg('opsActivity', { session_token: session.token }) : OS.reg('activityFeed', { limit: 60 });
    var maze = OS.request(OS.API + '/maze/cases');
    return OS.track(Promise.all([p, maze])).then(function (rs) {
      var r = rs[0], m = rs[1];
      if (r.ok && r.json && r.json.success) {
        feedErr = null; feedAt = r.at;
        (r.json.events || []).forEach(function (e) { events.set(e.id, e); });
        if (owner) { queue = r.json.queue || []; OS.setAttention(queue.filter(function (q) { return q.urgency <= 2; }).length); }
        $('cc-scope').textContent = owner ? 'Owner view: public and private records' : 'Public record';
      } else if (r.status === 404) {
        feedErr = 'The activity route is not deployed yet.';
      } else {
        feedErr = 'The registry answered ' + (r.status || 'nothing') + '.';
      }
      if (m.ok && m.json) (m.json.cases || []).forEach(function (c) {
        events.set('maze:' + c.id + ':' + (c.updated_at || c.opened_at), { id: 'maze:' + c.id, type: 'monitor.case', at: c.updated_at || c.opened_at, source: 'maze_cases (public)', title: c.title, detail: c.status + (c.severity ? ' · ' + c.severity : ''), link: null });
      });
      paintFeed(); stampFeed(); paintQueue();
    });
  }

  /* ── the queue ───────────────────────────────────────────────── */
  function paintQueue() {
    var items = [];
    var res = OS.health().results || {};
    OS.CHECKS.filter(function (c) { return c.core; }).forEach(function (c) {
      var r = res[c.id];
      if (r && (r.status === 'degraded' || r.status === 'unavailable')) items.push({ kind: 'service', u: r.status === 'unavailable' ? 1 : 2, title: c.name + ' is ' + OS.LABEL[r.status].toLowerCase(), why: r.note, svc: c.id });
    });
    if (session.owner) queue.forEach(function (q) { items.push({ kind: q.kind, u: q.urgency, title: q.title, why: q.why + ' · waiting ' + (q.waiting_hours < 48 ? q.waiting_hours + ' h' : Math.round(q.waiting_hours / 24) + ' d'), href: q.link }); });
    var today = new Date().toISOString().slice(0, 10), horizon = new Date(Date.now() + 180 * 864e5).toISOString().slice(0, 10);
    obligations.filter(function (o) { return o.applies_from > today && o.applies_from <= horizon && o.classification === 'verified'; }).forEach(function (o) {
      var d = Math.ceil((Date.parse(o.applies_from) - Date.now()) / 864e5);
      items.push({ kind: 'deadline', u: d <= 60 ? 3 : 5, title: o.name + ': applies from ' + o.applies_from, why: d + ' days · ' + o.instrument + ' · ' + o.article.split('—')[0].trim(), href: '/regulation.html#' + o.id });
    });
    items.sort(function (a, b) { return a.u - b.u; });
    $('cc-qscope').textContent = session.owner ? 'Owner: services, decisions, dates' : 'Services and verified regulatory dates';
    var box = $('cc-queue');
    if (!items.length) {
      box.innerHTML = '<div class="os-empty">' + OS.icon('command') + '<strong>Nothing waits on anyone</strong><p>' + (session.owner ? 'No application, mission or partner is waiting for a decision, every service answered, and no verified regulatory date falls in the next 180 days.' : 'Every service answered and no verified regulatory date falls in the next 180 days. Signed in as the owner, decisions waiting on a human appear here too.') + '</p></div>'; return;
    }
    box.innerHTML = items.map(function (q) {
      return '<div class="cc-q"><span class="u ' + (q.kind === 'service' ? 'svc' : 'u' + q.u) + '" title="Urgency ' + q.u + ' of 5">' + (q.kind === 'service' ? '!' : q.u) + '</span><div><div style="color:var(--os-text);font-size:13px">' +
        (q.href ? '<a href="' + esc(q.href) + '">' + esc(q.title) + '</a>' : q.svc ? '<button type="button" class="os-btn quiet small" style="padding:0;min-height:0;border:0" data-q-svc="' + q.svc + '">' + esc(q.title) + '</button>' : esc(q.title)) +
        '</div><div class="os-note">' + esc(q.why || '') + '</div></div><span class="os-state ' + (q.kind === 'service' ? 'degraded' : 'unknown') + '" style="font-size:9.5px">' + esc(q.kind) + '</span></div>';
    }).join('');
    [].forEach.call(box.querySelectorAll('[data-q-svc]'), function (b) { b.addEventListener('click', function () { inspectService(b.dataset.qSvc); }); });
  }

  /* ── boot ────────────────────────────────────────────────────── */
  function start() {
    entrance();
    core = window.LunaraCore ? window.LunaraCore.mount($('cc-canvas'), { satellites: satellites, onPick: inspectService }) : null;
    OS.on('fx', function () { if (core) core.fx(); });
    OS.on('health', function () { paintServices(); paintQueue(); });
    OS.on('health:start', paintServices);
    OS.on('health:one', function (d) { if (core) core.pulse(d.id); });
    OS.on('state', paintState);
    paintServices(); paintState(); paintFigures();
    OS.checkHealth(true);
    OS.session().then(function (s) { session = s; return loadFeed(); });
    $('cc-check').addEventListener('click', function () { OS.checkHealth(true); });
    $('cc-pal').addEventListener('click', function () { OS.openPalette(); });
    // Polling at a pace that matches how fast these records change, and
    // only while the page is being looked at.
    setInterval(function () { if (!document.hidden) { OS.checkHealth(true); loadFeed(); } }, 60e3);
    setInterval(stampFeed, 15e3);
  }
  if (document.querySelector('.os-rail')) start(); else OS.on('ready', start);
})();
