/* ═══════════════════════════════════════════════════════════════════
   THE NIGHT — homepage engine
   ═══════════════════════════════════════════════════════════════════

   Everything the homepage draws, except the three instruments (those
   are lunara-stage.js) and the moon's surface (lunara-moon.js).

     THE SKY        decoration, and quiet about it
     THE MOON       mounted here, captioned with its computed phase
     THE HORIZON    the obligation register laid along a planet's rim,
                    by application date, from /corpus/obligations.json
     THE CHAIN      the six steps as a chain of custody the reader
                    scrolls along, carrying the corpus's real key id and
                    its sha-256 recomputed in the reader's browser
     THE CITY       the public register drawn as a city at night. A
                    window lights only for a verified business, and the
                    count comes from the register at load

   The same rule as the rest of the site: no figure is typed into this
   file. Every date, count, digest and key id is read at load, and
   where a source cannot be reached the page says so instead of
   guessing. Honours prefers-reduced-motion throughout.
   ═══════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var hover  = window.matchMedia && window.matchMedia('(hover: hover)').matches;
  var DPR = Math.min(window.devicePixelRatio || 1, 2);
  var $ = function (id) { return document.getElementById(id); };
  var NS = 'http://www.w3.org/2000/svg';
  var MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  var MONTHS_LONG = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  var REGISTRY_LOOKUP = 'https://base44.app/api/apps/6a46cea2687503d2d6d4ecd1/functions/shieldRegistryLookup';
  var REGISTRY_LIST   = 'https://base44.app/api/apps/6a46cea2687503d2d6d4ecd1/functions/shieldRegistryList';

  function safe(name, fn) { try { fn(); } catch (e) { if (window.console) console.warn('[lunara-home] ' + name + ':', e.message); } }
  function isoUTC(s) { var p = s.split('-').map(Number); return Date.UTC(p[0], p[1] - 1, p[2]); }
  function todayUTC() { var n = new Date(); return Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()); }
  function shortDate(t) { var d = new Date(t); return d.getUTCDate() + ' ' + MONTHS[d.getUTCMonth()] + ' ' + d.getUTCFullYear(); }
  function longDate(t) { var d = new Date(t); return d.getUTCDate() + ' ' + MONTHS_LONG[d.getUTCMonth()] + ' ' + d.getUTCFullYear(); }
  function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function el(name, attrs, parent) {
    var n = document.createElementNS(NS, name);
    for (var k in attrs) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }
  function rng(seed) {                       /* mulberry32: the same city every visit */
    return function () {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      var t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function hash(s) { var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

  /* One fetch of the corpus for everything on this page that is not an
     instrument. The instruments fetch their own, so a failure here
     cannot take the clock or the signature check down with it. */
  var corpusP = fetch('/corpus/obligations.json', { cache: 'no-cache' })
    .then(function (r) { return r.text(); })
    .then(function (t) { return { text: t, json: JSON.parse(t) }; });

  var registryP = fetch(REGISTRY_LIST, { cache: 'no-cache' })
    .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(function (j) {
      var list = Array.isArray(j.businesses) ? j.businesses : [];
      var n = typeof j.count === 'number' ? j.count : (Array.isArray(j.businesses) ? j.businesses.length : null);
      if (n === null) throw new Error('no count');
      return { n: n, list: list };
    });

  /* ── reveal ────────────────────────────────────────────────────── */
  safe('reveal', function () {
    var items = document.querySelectorAll('[data-rv]');
    if (reduce || !('IntersectionObserver' in window)) return;
    document.documentElement.classList.add('rv-on');
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
    }, { rootMargin: '0px 0px -12% 0px', threshold: 0.08 });
    items.forEach(function (n) { io.observe(n); });
  });
  if (reduce) document.querySelectorAll('[data-rv]').forEach(function (n) { n.classList.add('in'); });

  /* ── the moon ──────────────────────────────────────────────────── */
  safe('moon', function () {
    var ph = window.LunaraPhase && window.LunaraPhase.at(new Date());
    var cap = $('moon-cap');
    if (ph && cap) {
      cap.innerHTML = '<span class="pulse" aria-hidden="true"></span>The moon, now &middot; <b>' + esc(ph.name) + '</b> &middot; ' +
        ph.percent + '% lit<small>Lit from its phase angle at the moment you opened this page. Surface: NASA LRO.</small>';
    }
    if (window.LunaraMoon) window.LunaraMoon.mount($('moon'), { relief: 7.5 });
  });

  /* ── the sky ───────────────────────────────────────────────────── */
  safe('sky', function () {
    var c = $('sky'); if (!c) return;
    var ctx = c.getContext('2d'), stars = [], W = 0, H = 0, raf = 0, visible = true, mx = 0, my = 0, px = 0, py = 0;
    var moonWrap = document.querySelector('.moon-wrap');

    function build() {
      var b = c.getBoundingClientRect(); W = b.width; H = b.height;
      c.width = Math.round(W * DPR); c.height = Math.round(H * DPR);
      var r = rng(20260802), mb = moonWrap.getBoundingClientRect(), ob = c.getBoundingClientRect();
      var mcx = mb.left - ob.left + mb.width / 2, mcy = mb.top - ob.top + mb.height / 2, mr = mb.width / 2;
      stars = [];
      var count = Math.round(W * H / 2600);
      for (var i = 0; i < count; i++) {
        var x = r() * W, y = r() * H * 0.86;
        /* the moon washes the sky out around itself, as it does */
        var d = Math.hypot(x - mcx, y - mcy) / mr;
        if (d < 1.02) continue;
        var wash = Math.min(1, Math.max(0.12, (d - 1) / 1.6));
        var m = Math.pow(r(), 5);
        stars.push({ x: x, y: y, s: 0.35 + m * 1.35, a: (0.18 + m * 0.75) * wash, tw: r() < 0.14 ? 0.6 + r() * 2.2 : 0, ph: r() * 6.28, z: 0.3 + r() * 0.7,
          c: r() < 0.12 ? '226,205,160' : (r() < 0.2 ? '190,210,255' : '236,238,244') });
      }
      /* a faint band of the galaxy, far off to the left, low contrast */
      for (var k = 0; k < 900; k++) {
        var t = r(), g = (r() + r() + r() - 1.5) * 0.09;
        var bx = W * (-0.05 + t * 0.62), by = H * (0.95 - t * 0.9) + g * H;
        stars.push({ x: bx, y: by, s: 0.3 + r() * 0.5, a: 0.07 + r() * 0.12, tw: 0, ph: 0, z: 0.2, c: '220,224,236' });
      }
    }
    function draw(t) {
      raf = 0;
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      ctx.clearRect(0, 0, W, H);
      px += (mx - px) * 0.05; py += (my - py) * 0.05;
      for (var i = 0; i < stars.length; i++) {
        var s = stars[i], a = s.a;
        if (s.tw && !reduce) a *= 0.72 + 0.28 * Math.sin(t / 1000 * s.tw + s.ph);
        ctx.fillStyle = 'rgba(' + s.c + ',' + a.toFixed(3) + ')';
        var x = s.x - px * 14 * s.z, y = s.y - py * 9 * s.z;
        if (s.s > 1.1) {
          ctx.beginPath(); ctx.arc(x, y, s.s, 0, 6.2832); ctx.fill();
          ctx.fillStyle = 'rgba(' + s.c + ',' + (a * 0.12).toFixed(3) + ')';
          ctx.beginPath(); ctx.arc(x, y, s.s * 3.2, 0, 6.2832); ctx.fill();
        } else ctx.fillRect(x, y, s.s, s.s);
      }
      if (!reduce && visible) raf = requestAnimationFrame(draw);
    }
    build(); draw(0);
    window.addEventListener('resize', function () { build(); if (!raf) raf = requestAnimationFrame(draw); });
    if (hover && !reduce) window.addEventListener('pointermove', function (e) { mx = e.clientX / innerWidth - 0.5; my = e.clientY / innerHeight - 0.5; }, { passive: true });
    new IntersectionObserver(function (es) { visible = es[0].isIntersecting; if (visible && !raf) raf = requestAnimationFrame(draw); }).observe(c);
  });

  /* ── the horizon ───────────────────────────────────────────────── */
  var horizonData = null;
  function drawHorizon() {
    var host = $('horizon'), open = $('open');
    if (!host || !horizonData) return;
    var W = open.clientWidth, H = open.clientHeight;
    host.innerHTML = '';
    var svg = el('svg', { viewBox: '0 0 ' + W + ' ' + H, width: W, height: H }, host);
    var defs = el('defs', {}, svg);

    function grad(id, stops, attrs) {
      var g = el('linearGradient', Object.assign({ id: id }, attrs || { x1: 0, y1: 0, x2: 1, y2: 0 }), defs);
      stops.forEach(function (s) { el('stop', { offset: s[0], 'stop-color': s[1], 'stop-opacity': s[2] }, g); });
    }
    grad('hz-rim',  [[0,'#D9DFE8',0],[0.22,'#D9DFE8',0.35],[0.55,'#FFFFFF',0.85],[0.78,'#E9D3A0',0.7],[1,'#D9DFE8',0]]);
    grad('hz-glow', [[0,'#9FB4D8',0],[0.35,'#B8C8E6',0.35],[0.62,'#F2E4C0',0.5],[1,'#9FB4D8',0]]);
    grad('hz-body', [[0,'#10141B',1],[0.18,'#0A0D12',1],[1,'#06070A',1]], { x1: 0, y1: 0, x2: 0, y2: 1 });
    grad('hz-beam', [[0,'#FFFFFF',0],[1,'#FFFFFF',0.55]], { x1: 0, y1: 0, x2: 0, y2: 1 });
    var blur = el('filter', { id: 'hz-blur', x: '-10%', y: '-200%', width: '120%', height: '500%' }, defs);
    el('feGaussianBlur', { stdDeviation: 9 }, blur);
    var soft = el('filter', { id: 'hz-soft', x: '-50%', y: '-50%', width: '200%', height: '200%' }, defs);
    el('feGaussianBlur', { stdDeviation: 3 }, soft);

    /* The rim is an arc of a circle whose top is 74% of the way down the
       stage and whose ends fall to 91%. */
    var y0 = H * 0.80, y1 = H * 0.965, a = W / 2, dy = y1 - y0;
    var R = (a * a + dy * dy) / (2 * dy), cx = W / 2, cy = y0 + R;
    function yAt(x) { return cy - Math.sqrt(Math.max(0, R * R - (x - cx) * (x - cx))); }
    var arc = 'M 0 ' + y1.toFixed(1) + ' A ' + R.toFixed(1) + ' ' + R.toFixed(1) + ' 0 0 1 ' + W + ' ' + y1.toFixed(1);

    el('path', { d: arc + ' L ' + W + ' ' + H + ' L 0 ' + H + ' Z', fill: 'url(#hz-body)' }, svg);
    el('path', { d: arc, fill: 'none', stroke: 'url(#hz-glow)', 'stroke-width': 26, filter: 'url(#hz-blur)', opacity: 0.5 }, svg);
    var rim = el('path', { d: arc, fill: 'none', stroke: 'url(#hz-rim)', 'stroke-width': 1.3, class: 'rim' }, svg);
    var len = rim.getTotalLength(); rim.style.setProperty('--len', len);

    var obs = horizonData.obligations;
    var dates = obs.map(function (o) { return isoUTC(o.applies_from); });
    var y0yr = new Date(Math.min.apply(null, dates)).getUTCFullYear();
    var y1yr = new Date(Math.max.apply(null, dates)).getUTCFullYear() + 1;
    var t0 = Date.UTC(y0yr, 0, 1), t1 = Date.UTC(y1yr, 0, 1);
    var xL = W * 0.055, xR = W * 0.945;
    function xAt(t) { return xL + (t - t0) / (t1 - t0) * (xR - xL); }
    var now = todayUTC(), xNow = xAt(now);

    /* behind you, the settled part of the rim, in gold */
    var settled = [], step = 8;
    for (var sx = xL; sx <= Math.min(xNow, xR); sx += step) settled.push(sx.toFixed(1) + ',' + yAt(sx).toFixed(1));
    if (settled.length > 1) {
      el('polyline', { points: settled.join(' '), fill: 'none', stroke: '#C4A46B', 'stroke-width': 1.6, opacity: 0.8, class: 'pin', style: 'transition-delay:2s' }, svg);
    }

    /* the calendar: months as hairlines, years named */
    var ticks = el('g', { class: 'pin', style: 'transition-delay:1.6s' }, svg);
    for (var y = y0yr; y <= y1yr; y++) {
      for (var m = 0; m < 12; m++) {
        var t = Date.UTC(y, m, 1); if (t > t1) break;
        var x = xAt(t), yy = yAt(x);
        el('line', { x1: x, y1: yy + 3, x2: x, y2: yy + (m === 0 ? 14 : 6), stroke: m === 0 ? 'rgba(214,222,234,.45)' : 'rgba(214,222,234,.16)', 'stroke-width': 1 }, ticks);
        if (m === 0) { var tx = el('text', { x: x + 6, y: yy + 40, class: 'year' }, ticks); tx.textContent = y; }
      }
    }

    /* today: a beam of light standing on the rim */
    var yN = yAt(xNow), nowG = el('g', { class: 'pin', style: 'transition-delay:2.2s' }, svg);
    el('rect', { x: xNow - 0.75, y: yN - 96, width: 1.5, height: 96, fill: 'url(#hz-beam)' }, nowG);
    el('rect', { x: xNow - 9, y: yN - 96, width: 18, height: 96, fill: 'url(#hz-beam)', opacity: 0.18, filter: 'url(#hz-soft)' }, nowG);
    el('circle', { cx: xNow, cy: yN, r: 3.2, fill: '#FFFFFF' }, nowG);
    el('circle', { cx: xNow, cy: yN, r: 10, fill: '#FFFFFF', opacity: 0.18, filter: 'url(#hz-soft)' }, nowG);
    var tl = el('text', { x: xNow, y: yN + 22, 'text-anchor': 'middle', class: 'tag', fill: '#EFEAE0' }, nowG); tl.textContent = 'Today \u00b7 ' + shortDate(now);

    /* the obligations, grouped by the day they bind */
    var groups = {};
    obs.forEach(function (o) { (groups[o.applies_from] = groups[o.applies_from] || []).push(o); });
    var keys = Object.keys(groups).sort();
    var nextKey = keys.filter(function (k) { return isoUTC(k) > now; })[0];
    var tip = $('hz-tip');

    keys.forEach(function (k, gi) {
      var list = groups[k], t = isoUTC(k), x = xAt(t), base = yAt(x);
      var inForce = t <= now, isNext = k === nextKey;
      var top = base - 30 - (list.length - 1) * 17;
      var g = el('g', { class: 'pin', style: 'transition-delay:' + (1.4 + gi * 0.09).toFixed(2) + 's' }, svg);
      el('line', { x1: x, y1: base, x2: x, y2: top, stroke: inForce ? 'rgba(226,196,122,.7)' : (isNext ? 'rgba(255,255,255,.75)' : 'rgba(214,222,234,.4)'), 'stroke-width': 1 }, g);
      if (isNext) el('circle', { cx: x, cy: top, r: 12, fill: '#FFFFFF', opacity: 0.16, filter: 'url(#hz-soft)', class: 'next-halo' }, g);
      list.forEach(function (o, j) {
        var yy = base - 30 - j * 17;
        el('circle', { cx: x, cy: yy, r: 5.5, fill: '#06070A', opacity: 0.85 }, g);
        if (inForce) {
          el('circle', { cx: x, cy: yy, r: 7, fill: '#E2C47A', opacity: 0.25, filter: 'url(#hz-soft)' }, g);
          el('circle', { cx: x, cy: yy, r: 3.4, fill: '#E2C47A' }, g);
        } else {
          el('circle', { cx: x, cy: yy, r: 3.6, fill: isNext ? '#FFFFFF' : 'none', stroke: isNext ? '#FFFFFF' : '#D9DFE8', 'stroke-width': 1.2, opacity: isNext ? 1 : 0.85 }, g);
        }
      });
      el('circle', { cx: x, cy: base, r: 2, fill: inForce ? '#E2C47A' : '#D9DFE8' }, g);

      if (isNext) {
        var days = Math.round((t - now) / 86400000);
        var l1 = el('text', { x: x + 14, y: top - 2, class: 'tag', fill: '#FFFFFF' }, g);
        l1.textContent = 'Next · ' + days + (days === 1 ? ' day' : ' days');
        var l2 = el('text', { x: x + 14, y: top + 14, class: 'tag-sub', fill: '#A49E93' }, g);
        l2.textContent = list.length === 1 ? shortDate(t) : list.length + ' obligations · ' + shortDate(t);
      }

      var hit = el('rect', { x: x - 14, y: top - 16, width: 28, height: base - top + 24, fill: 'transparent', class: 'pin-hit', tabindex: 0, role: 'img',
        'aria-label': list.map(function (o) { return o.name; }).join('; ') + ', ' + (inForce ? 'in force since ' : 'binds on ') + longDate(t) }, g);
      function show() {
        var days = Math.round((t - now) / 86400000);
        var state = inForce ? '<span class="t-state" style="color:#E2C47A">In force since ' + esc(shortDate(t)) + '</span>'
                            : '<span class="t-state" style="color:' + (isNext ? '#FFFFFF' : '#D9DFE8') + '">Binds in ' + days + (days === 1 ? ' day' : ' days') + ' &middot; ' + esc(shortDate(t)) + '</span>';
        tip.innerHTML = state + list.map(function (o) {
          return '<p class="t-name">' + esc(o.name) + '</p><p class="t-cite">' + esc(o.jurisdiction ? o.jurisdiction + ' · ' : '') + esc(o.article) + '</p>';
        }).join('');
        var tx = Math.min(Math.max(x, 170), W - 170);
        tip.style.left = tx + 'px'; tip.style.top = (top - 6) + 'px';
        tip.classList.add('on');
      }
      function hide() { tip.classList.remove('on'); }
      hit.addEventListener('pointerenter', show); hit.addEventListener('pointerleave', hide);
      hit.addEventListener('focus', show); hit.addEventListener('blur', hide);
    });
  }
  corpusP.then(function (c) { horizonData = c.json; safe('horizon', drawHorizon); }).catch(function () {});
  var rz = 0;
  window.addEventListener('resize', function () { clearTimeout(rz); rz = setTimeout(function () { safe('horizon', drawHorizon); }, 120); });

  /* ── the four offerings: a light that follows the pointer ──────── */
  if (hover) document.querySelectorAll('.o-row').forEach(function (row) {
    row.addEventListener('pointermove', function (e) {
      var b = row.getBoundingClientRect();
      row.style.setProperty('--mx', (e.clientX - b.left) + 'px');
      row.style.setProperty('--my', (e.clientY - b.top) + 'px');
    });
  });

  /* ── the chain of custody ──────────────────────────────────────── */
  safe('chain', function () {
    var chain = $('chain'); if (!chain || reduce) return;
    chain.classList.add('scrolly');
    var sticky = chain.querySelector('.chain-sticky');
    var nodes = [].slice.call(chain.querySelectorAll('.node'));
    var reads = [].slice.call(chain.querySelectorAll('.chain-read p'));
    var line = chain.querySelector('.track-line'), fill = $('track-fill'), token = $('chain-token');
    var track = chain.querySelector('.track');
    var K = [
      ['claim',            'corpus/obligations.json'],
      ['source',           'primary law, cited by article'],
      ['review',           'by a named person'],
      ['signature',        'ed25519'],
      ['public record',    'lunarasociety.com/corpus'],
      ['verifiable',       'sha-256, recompute it yourself']
    ];
    var centers = [], cur = -1;
    nodes.forEach(function (n) { n.classList.add('in'); });

    corpusP.then(function (c) {
      K[1][1] = c.json.obligations.length + ' citations to primary law';
      if (!(window.crypto && crypto.subtle)) return;
      return crypto.subtle.digest('SHA-256', new TextEncoder().encode(c.text)).then(function (buf) {
        var hex = [].map.call(new Uint8Array(buf), function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
        K[5] = ['sha-256 · computed in your browser', hex.slice(0, 16) + '…' + hex.slice(-6)];
        var y = $('chain-yours'); if (y) y.textContent = 'The digest riding the chain was just recomputed in your browser.';
        cur = -1; update();
      });
    }).catch(function () {});
    fetch('/corpus/obligations.assertion.json', { cache: 'no-cache' })
      .then(function (r) { return r.json(); })
      .then(function (a) { if (a && a.assertion && a.assertion.key_id) { K[3][1] = 'ed25519 · key ' + a.assertion.key_id; cur = -1; update(); } })
      .catch(function () {});

    function measure() {
      var tb = track.getBoundingClientRect();
      centers = nodes.map(function (n) { var d = n.querySelector('.n-dot').getBoundingClientRect(); return d.left + d.width / 2 - tb.left; });
      line.style.left = centers[0] + 'px';
      line.style.width = (centers[centers.length - 1] - centers[0]) + 'px';
      line.style.right = 'auto';
    }
    var stage = $('chain-stage');
    function paintStage(idx) {
      if (!stage) return;
      for (var j = 0; j < 6; j++) {
        stage.classList.toggle('k' + j, j <= idx);
        stage.classList.toggle('cur' + j, j === idx);
      }
      var h = $('stg-hash'); if (h && /sha-256/.test(K[5][0])) h.textContent = 'sha-256 ' + K[5][1];
      var k = $('stg-key'); if (k) k.textContent = K[3][1].replace(/^ed25519 · key (.{12}).*$/, 'ed25519 · $1…');
      var src = $('stg-src'); if (src) src.textContent = K[1][1].replace(' to primary law', '');
    }
    function update() {
      var r = chain.getBoundingClientRect();
      var total = chain.offsetHeight - sticky.offsetHeight;
      // The stage is centred rather than pinned to the top, so progress
      // counts from the moment it sticks, not from the section's edge.
      var top = parseFloat(getComputedStyle(sticky).top) || 0;
      var p = Math.min(1, Math.max(0, (top - r.top) / Math.max(1, total)));
      var pos = Math.min(5, p * 5.6);
      var i = Math.floor(pos), f = pos - i;
      var x = i >= 5 ? centers[5] : centers[i] + (centers[i + 1] - centers[i]) * f;
      fill.style.width = (x - centers[0]) + 'px';
      // Kept inside the track: centred on the first node it hung half
      // off the left edge of the screen. The arrow still points at x.
      var half = token.offsetWidth / 2, tw = track.offsetWidth;
      var cx = Math.max(half, Math.min(tw - half, x));
      token.style.left = cx + 'px';
      token.style.setProperty('--ax', (x - cx) + 'px');
      var idx = Math.min(5, Math.floor(pos + 0.001));
      if (idx !== cur) {
        cur = idx;
        nodes.forEach(function (n, j) { n.classList.toggle('on', j <= idx); });
        reads.forEach(function (p, j) { p.classList.toggle('on', j === idx); });
        $('tk-k').textContent = K[idx][0];
        $('tk-v').textContent = K[idx][1];
        paintStage(idx);
      }
    }
    measure(); update();
    window.addEventListener('scroll', function () { requestAnimationFrame(update); }, { passive: true });
    window.addEventListener('resize', function () { measure(); cur = -1; update(); });
  });

  /* ── the door: how dark the register is, read from the register ── */
  registryP.then(function (reg) {
    var em = $('close-em'), n = reg.n;
    if (em) em.textContent = n === 0 ? 'And still dark.' : 'And ' + n + (n === 1 ? ' business is' : ' businesses are') + ' in it.';
  }).catch(function () {});

  /* ── the correction: the right date comes from the corpus ──────── */
  corpusP.then(function (c) {
    var o = c.json.obligations.filter(function (x) { return /^Article 50\(2\) marking/.test(x.name); })[0];
    if (o) $('wc-new').textContent = longDate(isoUTC(o.applies_from));
  }).catch(function () {});

  /* ── the tally counts up to what lunara-stage.js reads ────────── */
  safe('tally', function () {
    if (reduce) return;
    var tally = $('lx-tally'); if (!tally) return;
    var seen = false;
    function run(b) {
      if (b._animating) return;
      var n = parseInt(b.textContent, 10);
      if (isNaN(n) || b._final === n) return;
      b._final = n; b._animating = true;
      var t0 = performance.now();
      (function tick(t) {
        var k = Math.min(1, (t - t0) / 1400);
        b.textContent = k < 1 ? Math.round(n * (1 - Math.pow(1 - k, 4))) : n;
        if (k < 1) requestAnimationFrame(tick); else b._animating = false;
      })(t0);
    }
    tally.querySelectorAll('b').forEach(function (b) {
      new MutationObserver(function () { if (seen && !b._animating) run(b); })
        .observe(b, { childList: true, characterData: true, subtree: true });
    });
    new IntersectionObserver(function (es, io) {
      if (!es[0].isIntersecting) return;
      seen = true; io.disconnect();
      tally.querySelectorAll('b').forEach(run);
    }, { threshold: 0.4 }).observe(tally);
  });
})();
