/* ═══════════════════════════════════════════════════════════════════
   THE ORBIT — the record, drawn as time
   ═══════════════════════════════════════════════════════════════════

   intelligence.html lists ten obligations as ten rows. A list tells
   you what; it does not show you how the years are loaded, that two
   deadlines fall on the same December day, or how much of the Act is
   already binding while you read. This draws the same record as a
   line of time you can drag through.

   It reads corpus/obligations.json, the same signed file the rows are
   generated from, so the drawing and the table cannot disagree: there
   is no date, count or name in this file. "Today" is the reader's
   clock, and "in force" is computed against it, exactly as the corpus
   instructs (no tense is stored).

   The scrubber is a real range input, so it works with a thumb, a
   mouse, a keyboard and a screen reader, and it answers one question
   precisely: on the date you choose, how many of these obligations
   bind.

   Without JavaScript, or if the corpus cannot be read, nothing is
   drawn and the rows below are the whole page, as before.
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var host = document.getElementById('orbit');
  if (!host) return;
  var REDUCED = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  var DAY = 86400000;
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function utc(s) { var p = s.split('-'); return Date.UTC(+p[0], +p[1] - 1, +p[2]); }
  function fmt(t) { var d = new Date(t); return d.getUTCDate() + ' ' + MONTHS[d.getUTCMonth()] + ' ' + d.getUTCFullYear(); }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function todayUtc() { var n = new Date(); return Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()); }

  var css = [
    '.orbit{margin:8px 0 46px;position:relative;border:1px solid var(--hair,rgba(214,222,234,.1));border-radius:14px;',
    '  background:radial-gradient(120% 90% at 50% 120%,rgba(226,196,122,.10),transparent 60%),linear-gradient(180deg,rgba(14,16,22,.85),rgba(8,9,12,.92));',
    '  padding:26px 26px 22px;overflow:hidden}',
    '.orbit-top{display:flex;justify-content:space-between;align-items:flex-end;gap:20px;flex-wrap:wrap}',
    '.orbit-q{font-family:"Cormorant Garamond",Georgia,serif;font-weight:300;font-size:30px;line-height:1.15;color:#F2EEE6}',
    '.orbit-q em{color:#E2C47A}',
    '.orbit-ans{font-family:"IBM Plex Mono",ui-monospace,monospace;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#9AA0AA;text-align:right}',
    '.orbit-ans b{display:block;font-family:"Cormorant Garamond",Georgia,serif;font-weight:300;font-size:54px;letter-spacing:0;line-height:1;color:#F2EEE6;text-transform:none}',
    '.orbit-ans b small{font-size:22px;color:#9AA0AA}',
    '.orbit-stage{position:relative;margin-top:14px}',
    '.orbit svg{display:block;width:100%;height:auto;overflow:visible}',
    '.orbit .ax{stroke:rgba(214,222,234,.18)}',
    '.orbit .ax-on{stroke:url(#orbGold);stroke-width:2;filter:drop-shadow(0 0 6px rgba(226,196,122,.6))}',
    '.orbit .yr{font:10px "IBM Plex Mono",monospace;letter-spacing:.14em;fill:#6E747E}',
    '.orbit .tick{stroke:rgba(214,222,234,.16)}',
    '.orbit .stem{stroke-width:1;transition:stroke .5s ease,opacity .5s ease}',
    '.orbit .nd{cursor:pointer;outline:none}',
    '.orbit .nd circle.c{transition:fill .5s ease,stroke .5s ease,r .3s ease}',
    '.orbit .nd .lbl{font:10px "IBM Plex Mono",monospace;letter-spacing:.06em;fill:#8E949E;transition:fill .4s ease}',
    '.orbit .nd:hover .lbl,.orbit .nd:focus .lbl,.orbit .nd.sel .lbl{fill:#F2EEE6}',
    '.orbit .nd.sel circle.c{stroke-width:2.2}',
    '.orbit .halo{fill:none;stroke:#E2C47A;opacity:0;transform-box:fill-box;transform-origin:center}',
    '.orbit .nd.next .halo{animation:orbHalo 2.4s ease-out infinite}',
    '@keyframes orbHalo{0%{opacity:.8;transform:scale(1)}100%{opacity:0;transform:scale(3.2)}}',
    '.orbit .today line{stroke:#F2EEE6;stroke-width:1}',
    '.orbit .today text{font:10px "IBM Plex Mono",monospace;letter-spacing:.16em;fill:#F2EEE6}',
    '.orbit .beam{fill:url(#orbBeam)}',
    '.orbit .scrub line{stroke:#E2C47A;stroke-dasharray:3 4}',
    '.orbit .scrub circle{fill:#E2C47A;filter:drop-shadow(0 0 8px rgba(226,196,122,.9))}',
    '.orbit .scrub text{font:10px "IBM Plex Mono",monospace;letter-spacing:.1em;fill:#E2C47A}',
    '.orbit input[type=range]{position:absolute;left:0;right:0;bottom:0;width:100%;height:72px;margin:0;opacity:0;cursor:ew-resize;touch-action:pan-y}',
    '.orbit-card{margin-top:18px;display:grid;grid-template-columns:150px minmax(0,1fr) auto;gap:22px;align-items:center;',
    '  padding:16px 18px;border-radius:10px;border:1px solid rgba(226,196,122,.22);background:rgba(10,12,16,.7)}',
    '.orbit-card .w{font-family:"Cormorant Garamond",Georgia,serif;font-size:26px;color:#F2EEE6;line-height:1.1}',
    '.orbit-card .w small{display:block;font:10px "IBM Plex Mono",monospace;letter-spacing:.16em;text-transform:uppercase;color:#E2C47A;margin-top:6px}',
    '.orbit-card .n{font-size:15px;color:#F2EEE6;line-height:1.45}',
    '.orbit-card .a{font:11px "IBM Plex Mono",monospace;color:#9AA0AA;margin-top:6px;line-height:1.6}',
    '.orbit-card a.go{font:10.5px "IBM Plex Mono",monospace;letter-spacing:.14em;text-transform:uppercase;color:#16130D;background:#E2C47A;',
    '  padding:10px 14px;border-radius:999px;text-decoration:none;white-space:nowrap}',
    '.orbit-legend{display:flex;gap:18px;flex-wrap:wrap;margin-top:14px;font:10px "IBM Plex Mono",monospace;letter-spacing:.14em;text-transform:uppercase;color:#6E747E}',
    '.orbit-legend i{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:7px;vertical-align:-1px}',
    '.orbit-hint{font:10px "IBM Plex Mono",monospace;letter-spacing:.14em;text-transform:uppercase;color:#E2C47A;opacity:.8}',
    '.ob.orb-flash{animation:orbFlash 1.8s ease}',
    '@keyframes orbFlash{0%,40%{box-shadow:0 0 0 1px rgba(226,196,122,.6),0 0 60px -10px rgba(226,196,122,.5)}100%{box-shadow:none}}'
  ].join('\n');

  var JUR = {
    'European Union': { c: '#E2C47A', soft: 'rgba(226,196,122,.35)' },
    'California':     { c: '#9CC4E8', soft: 'rgba(156,196,232,.35)' }
  };
  function jur(j) { return JUR[j] || { c: '#DCE3EE', soft: 'rgba(220,227,238,.3)' }; }

  fetch('/corpus/obligations.json', { cache: 'no-cache' })
    .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(draw)
    .catch(function (e) { if (window.console) console.warn('[orbit] not drawn:', e.message); });

  function draw(corpus) {
    var obs = (corpus.obligations || []).map(function (o) { return { o: o, t: utc(o.applies_from) }; })
      .sort(function (a, b) { return a.t - b.t; });
    if (!obs.length) return;

    var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

    var today = todayUtc();
    var t0 = Math.min(obs[0].t, today) - 150 * DAY;
    var t1 = Math.max(obs[obs.length - 1].t, today) + 150 * DAY;
    var W = 1060, AX = 214, L = 20, R = W - 20;
    function X(t) { return L + (t - t0) / (t1 - t0) * (R - L); }

    /* Same-day obligations stack rather than overlap. */
    var byDay = {};
    obs.forEach(function (e) { (byDay[e.t] = byDay[e.t] || []).push(e); });
    Object.keys(byDay).forEach(function (k) { byDay[k].forEach(function (e, i) { e.stack = i; }); });

    var next = null;
    obs.forEach(function (e) { if (!next && e.t >= today) next = e; });

    var svg = '<svg viewBox="0 0 ' + W + ' 260" role="img" aria-label="The ' + obs.length + ' obligations placed on a line of time">' +
      '<defs><linearGradient id="orbGold" x1="0" x2="1"><stop offset="0" stop-color="rgba(226,196,122,.15)"/><stop offset="1" stop-color="#F3DA9A"/></linearGradient>' +
      '<linearGradient id="orbBeam" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="rgba(242,238,230,0)"/><stop offset="1" stop-color="rgba(242,238,230,.16)"/></linearGradient></defs>';

    for (var y = new Date(t0).getUTCFullYear(); y <= new Date(t1).getUTCFullYear() + 1; y++) {
      var ty = Date.UTC(y, 0, 1);
      if (ty < t0 || ty > t1) continue;
      svg += '<line class="tick" x1="' + X(ty) + '" x2="' + X(ty) + '" y1="' + (AX - 6) + '" y2="' + (AX + 6) + '"/>' +
             '<text class="yr" x="' + (X(ty) + 6) + '" y="' + (AX + 22) + '">' + y + '</text>';
    }
    svg += '<line class="ax" x1="' + L + '" x2="' + R + '" y1="' + AX + '" y2="' + AX + '"/>';
    svg += '<line class="ax-on" id="orb-on" x1="' + L + '" x2="' + X(today) + '" y1="' + AX + '" y2="' + AX + '"/>';
    svg += '<g class="today"><rect class="beam" x="' + (X(today) - 14) + '" y="18" width="28" height="' + (AX - 18) + '"/>' +
           '<line x1="' + X(today) + '" x2="' + X(today) + '" y1="18" y2="' + AX + '"/>' +
           '<text x="' + (X(today) + 8) + '" y="30">TODAY · ' + fmt(today).toUpperCase() + '</text></g>';

    obs.forEach(function (e, i) {
      var j = jur(e.o.jurisdiction);
      var x = X(e.t);
      var h = 36 + (e.o.significance || 2) * 18 + e.stack * 36 + (i % 3) * 18;
      var cy = AX - h;
      var r = e.o.significance >= 3 ? 7 : 5.5;
      var past = e.t <= today;
      svg += '<g class="nd' + (e === next ? ' next' : '') + '" tabindex="0" role="button" data-i="' + i + '" aria-label="' +
        esc(e.o.name + ', ' + e.o.jurisdiction + ', applies from ' + fmt(e.t)) + '">' +
        '<line class="stem" x1="' + x + '" x2="' + x + '" y1="' + (cy + r) + '" y2="' + AX + '" stroke="' + j.soft + '"/>' +
        '<circle class="halo" cx="' + x + '" cy="' + cy + '" r="' + r + '"/>' +
        '<circle class="c" cx="' + x + '" cy="' + cy + '" r="' + r + '" fill="' + (past ? j.c : '#0A0C10') + '" stroke="' + j.c + '" stroke-width="1.4"/>' +
        '<circle cx="' + x + '" cy="' + cy + '" r="16" fill="transparent"/>' +

        '</g>';
    });

    svg += '<g class="scrub" id="orb-scrub"><line x1="0" x2="0" y1="' + (AX - 150) + '" y2="' + AX + '"/><circle cx="0" cy="' + AX + '" r="6"/>' +
           '<text x="8" y="' + (AX + 40) + '" id="orb-scrub-t"></text></g>';
    svg += '</svg>';

    var span = Math.round((t1 - t0) / DAY);
    host.innerHTML =
      '<div class="orbit-top">' +
        '<div><p class="orbit-hint">Drag along the line of time</p>' +
        '<p class="orbit-q" id="orb-q">On <em id="orb-date">' + fmt(today) + '</em>, this much of the record binds.</p></div>' +
        '<div class="orbit-ans"><b><span id="orb-n">0</span><small> of ' + obs.length + '</small></b>obligations in force</div>' +
      '</div>' +
      '<div class="orbit-stage">' + svg +
        '<input type="range" id="orb-range" min="0" max="' + span + '" step="1" value="' + Math.round((today - t0) / DAY) + '" aria-label="Choose a date to see which obligations are in force">' +
      '</div>' +
      '<div class="orbit-card" id="orb-card" aria-live="polite"></div>' +
      '<div class="orbit-legend"><span><i style="background:' + JUR['European Union'].c + '"></i>European Union</span>' +
        '<span><i style="background:' + JUR.California.c + '"></i>California</span>' +
        '<span><i style="background:#0A0C10;border:1px solid #9AA0AA"></i>Still ahead</span>' +
        '<span><i style="background:#9AA0AA"></i>In force</span></div>';

    var nodes = [].slice.call(host.querySelectorAll('.nd'));
    var range = document.getElementById('orb-range');
    var scrub = document.getElementById('orb-scrub');
    var on = document.getElementById('orb-on');

    function setDate(t, animate) {
      var n = 0;
      obs.forEach(function (e, i) {
        var binds = e.t <= t;
        if (binds) n++;
        var c = nodes[i].querySelector('circle.c');
        c.setAttribute('fill', binds ? jur(e.o.jurisdiction).c : '#0A0C10');
        nodes[i].querySelector('.stem').style.opacity = binds ? '1' : '.45';
      });
      var x = X(t);
      scrub.setAttribute('transform', 'translate(' + x + ',0)');
      var lab = document.getElementById('orb-scrub-t');
      lab.textContent = fmt(t).toUpperCase();
      lab.setAttribute('text-anchor', x > W - 140 ? 'end' : 'start');
      lab.setAttribute('x', x > W - 140 ? -8 : 8);
      on.setAttribute('x2', x);
      document.getElementById('orb-date').textContent = fmt(t);
      var el = document.getElementById('orb-n');
      if (!animate || REDUCED) { el.textContent = n; return; }
      var from = +el.textContent || 0, k = 0;
      (function step() { k++; el.textContent = Math.round(from + (n - from) * Math.min(1, k / 18)); if (k < 18) requestAnimationFrame(step); })();
    }

    function select(i) {
      var e = obs[i];
      nodes.forEach(function (nd, j) { nd.classList.toggle('sel', j === i); });
      var days = Math.round((e.t - today) / DAY);
      var rel = days > 0 ? 'in ' + days + ' days' : days === 0 ? 'binds today' : 'in force · ' + (-days) + ' days';
      document.getElementById('orb-card').innerHTML =
        '<div class="w">' + esc(fmt(e.t)) + '<small>' + esc(rel) + '</small></div>' +
        '<div><div class="n">' + esc(e.o.name) + ' <span style="color:' + jur(e.o.jurisdiction).c + '">· ' + esc(e.o.jurisdiction) + '</span></div>' +
        '<div class="a">' + esc(e.o.article) + '</div></div>' +
        '<a class="go" href="#' + encodeURIComponent(e.o.id) + '" data-go="' + esc(e.o.id) + '">Read the entry ↓</a>';
    }

    nodes.forEach(function (nd, i) {
      nd.addEventListener('click', function () { select(i); });
      nd.addEventListener('keydown', function (ev) { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); select(i); } });
      nd.addEventListener('mouseenter', function () { select(i); });
    });

    /* The range input sits over the axis only, so the nodes above it
       stay tappable. */
    range.addEventListener('input', function () { setDate(t0 + (+range.value) * DAY, false); });

    host.addEventListener('click', function (ev) {
      var a = ev.target.closest && ev.target.closest('a[data-go]');
      if (!a) return;
      var row = document.getElementById(a.getAttribute('data-go'));
      if (!row) return;
      ev.preventDefault();
      row.scrollIntoView({ behavior: REDUCED ? 'auto' : 'smooth', block: 'center' });
      row.classList.remove('orb-flash'); void row.offsetWidth; row.classList.add('orb-flash');
    });

    select(obs.indexOf(next || obs[obs.length - 1]));

    /* An entrance: time runs from the first obligation to today, once,
       when the drawing is first seen, so the count is watched filling
       rather than read. */
    if (REDUCED || !('IntersectionObserver' in window)) { setDate(today, false); return; }
    setDate(t0, false);
    var io = new IntersectionObserver(function (en) {
      if (!en[0].isIntersecting) return;
      io.disconnect();
      var start = performance.now(), dur = 2200;
      (function run(now) {
        var k = Math.min(1, (now - start) / dur), ease = 1 - Math.pow(1 - k, 3);
        var t = t0 + (today - t0) * ease;
        setDate(t, false);
        range.value = Math.round((t - t0) / DAY);
        if (k < 1) requestAnimationFrame(run);
      })(start);
    }, { threshold: 0.35 });
    io.observe(host);
  }
})();
