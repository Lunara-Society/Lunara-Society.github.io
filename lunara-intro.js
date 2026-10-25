/* ═══════════════════════════════════════════════════════════════════
   THE APERTURE: the intro to lunarasociety.com
   ═══════════════════════════════════════════════════════════════════

   A state machine, not a heap of timeouts. One clock (requestAnimation-
   Frame) walks the plan below; entering a state adds its class to the
   box, and lunara-intro.css does the rest. The states:

     grid → signal → landed → ring → read → iris → mark → open → done

   The four readings around the ring are real and are filled only when
   the check behind each has finished:
     the moon      tonight's phase (LunaraPhase, the same function that
                   lights the homepage moon and the footer)
     the record    the Ed25519 signature on /corpus/obligations.json,
                   verified here in the browser against the published key
     the register  how many businesses the public register holds
     next deadline the next date an obligation binds, from the corpus
   A check that has not finished when the intro ends simply ends as it
   was. A check that cannot run says so; none is ever filled in.

   At most once every twelve hours per device (the <head> of index.html
   decides, before anything paints). Never for crawlers or a link to a
   #section; ?intro=1 plays it again. Escape or Skip leaves at once;
   Enter, Space or a click goes straight to the opening. Reduced motion
   gets the composed instrument, still, and a fade. Sound is off unless
   the visitor has switched it on (lx-sound = 1).
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var root = document.documentElement, box = document.getElementById('lx-intro');
  if (!box) return;
  if (!root.classList.contains('lx-intro')) { box.parentNode.removeChild(box); return; }

  var REDUCED = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  var $ = function (id) { return document.getElementById(id); };
  var SVGNS = 'http://www.w3.org/2000/svg';
  function el(tag, attrs, parent) {
    var n = document.createElementNS(SVGNS, tag);
    for (var k in attrs) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }

  /* ── the scale engraved on the ring ───────────────────────────────
     120 ticks, a major one every ten; each lights a few milliseconds
     after the one before it, so the scale is drawn round the dial. */
  (function ticks() {
    var g = $('lxi-ticks');
    for (var i = 0; i < 120; i++) {
      var a = (i * 3 - 90) * Math.PI / 180, major = i % 10 === 0;
      var r0 = 256, r1 = major ? 272 : 264;
      el('line', {
        x1: (300 + Math.cos(a) * r0).toFixed(1), y1: (300 + Math.sin(a) * r0).toFixed(1),
        x2: (300 + Math.cos(a) * r1).toFixed(1), y2: (300 + Math.sin(a) * r1).toFixed(1),
        'class': major ? 'mj' : '', style: '--d:' + (120 + i * 4) + 'ms'
      }, g);
    }
  })();

  /* ── the iris ─────────────────────────────────────────────────────
     Nine half-planes, each turned 40° from the last. The aperture is
     the nonagon their edges leave open: push the edges out from the
     centre and it opens, turn them a little as they go and it opens
     the way a real diaphragm does. Clipped to the housing. */
  var BLADES = [], OPEN = 214, SHUT = -16, TWIST = 34;
  (function iris() {
    var sv = $('lxi-iris');
    var defs = el('defs', {}, sv);
    var cp = el('clipPath', { id: 'lxi-clip' }, defs);
    el('circle', { cx: 300, cy: 300, r: 206 }, cp);
    var gr = el('linearGradient', { id: 'lxi-blade', gradientUnits: 'userSpaceOnUse', x1: 0, y1: 300, x2: 0, y2: 470 }, defs);
    [[0, '#4A5059'], [0.06, '#272B31'], [0.5, '#121418'], [1, '#08090B']].forEach(function (s) { el('stop', { offset: s[0], 'stop-color': s[1] }, gr); });
    var g = el('g', { 'clip-path': 'url(#lxi-clip)' }, sv);
    for (var i = 0; i < 9; i++) {
      var a = i * 40;
      var rot = el('g', { 'class': 'bl' }, g);
      var mv = el('g', {}, rot);
      el('path', { d: 'M-400 300H1000V1100H-400Z', fill: 'url(#lxi-blade)' }, mv);
      el('path', { d: 'M-400 300H1000', stroke: 'rgba(244,226,176,.6)', 'stroke-width': 1.3, fill: 'none' }, mv);
      el('path', { d: 'M-400 304H1000', stroke: 'rgba(0,0,0,.6)', 'stroke-width': 3, fill: 'none' }, mv);
      rot.style.transform = 'rotate(' + a + 'deg)';
      mv.style.transform = 'translate(0px,' + SHUT + 'px)';
      BLADES.push({ rot: rot, mv: mv, a: a });
    }
    el('circle', { cx: 300, cy: 300, r: 206, fill: 'none', stroke: 'rgba(0,0,0,.65)', 'stroke-width': 6 }, sv);
  })();
  function moveIris(open, ms, easing) {
    BLADES.forEach(function (b) {
      var t0 = open ? 0 : TWIST, t1 = open ? TWIST : 0, d0 = open ? SHUT : OPEN, d1 = open ? OPEN : SHUT;
      var opts = { duration: ms, easing: easing || 'cubic-bezier(.6,0,.15,1)', fill: 'forwards' };
      if (!b.rot.animate || REDUCED) { b.rot.style.transform = 'rotate(' + (b.a + t1) + 'deg)'; b.mv.style.transform = 'translate(0px,' + d1 + 'px)'; return; }
      b.rot.animate([{ transform: 'rotate(' + (b.a + t0) + 'deg)' }, { transform: 'rotate(' + (b.a + t1) + 'deg)' }], opts);
      b.mv.animate([{ transform: 'translate(0px,' + d0 + 'px)' }, { transform: 'translate(0px,' + d1 + 'px)' }], opts);
    });
  }

  /* ── the name, letter by letter, from the middle out ─────────────── */
  (function name() {
    var m = $('lxi-mark'), t = m.textContent, mid = (t.length - 1) / 2, h = '';
    m.setAttribute('aria-label', t);
    for (var i = 0; i < t.length; i++) {
      var c = t[i] === ' ' ? '&nbsp;' : t[i];
      h += '<span aria-hidden="true" style="--d:' + Math.round(Math.abs(i - mid) * 34) + 'ms">' + c + '</span>';
    }
    m.innerHTML = h;
  })();

  /* ── the readings: real checks, filled when they finish ─────────── */
  function put(id, text, cls) {
    var b = $(id); if (!b) return;
    b.textContent = text; b.className = 'got' + (cls ? ' ' + cls : '');
  }
  var corpusText = fetch('/corpus/obligations.json', { cache: 'no-cache' }).then(function (r) { if (!r.ok) throw 0; return r.text(); });
  function longDate(t) { return new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }); }
  var moonTries = 0;
  function readMoon() {
    var ph = window.LunaraPhase && window.LunaraPhase.at(new Date());
    // the phase lives in lunara-shell.js, which runs after this script: wait for it, briefly
    if (!ph && moonTries++ < 40) { setTimeout(readMoon, 50); return; }
    if (ph) put('lxi-v-moon', ph.name + ' · ' + ph.percent + '% lit');
    else put('lxi-v-moon', 'not computed here');
  }
  corpusText.then(function (txt) {
    var c = JSON.parse(txt), now = Date.now(), next = null;
    (c.obligations || []).forEach(function (o) { var t = Date.parse(o.applies_from); if (t > now && (!next || t < next)) next = t; });
    if (!next) { put('lxi-v-next', 'none scheduled'); return; }
    var d = Math.ceil((next - now) / 86400000);
    put('lxi-v-next', d + (d === 1 ? ' day' : ' days') + ' · ' + longDate(next));
  }).catch(function () { put('lxi-v-next', 'the record did not load'); });

  /* the signature: the same verification lunara-stage.js runs, here */
  function canon(v) {
    if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']';
    if (v && typeof v === 'object') return '{' + Object.keys(v).filter(function (k) { return v[k] !== undefined; }).sort().map(function (k) { return JSON.stringify(k) + ':' + canon(v[k]); }).join(',') + '}';
    return JSON.stringify(v);
  }
  function b64u(buf) { return btoa(String.fromCharCode.apply(null, new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
  function unb64u(s) { return Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), function (c) { return c.charCodeAt(0); }); }
  Promise.all([
    corpusText,
    fetch('/corpus/obligations.assertion.json', { cache: 'no-cache' }).then(function (r) { return r.json(); }),
    fetch('/.well-known/keys.json', { cache: 'no-cache' }).then(function (r) { return r.json(); })
  ]).then(function (p) {
    var env = p[1], a = env.assertion, jwk = (p[2].keys || []).filter(function (k) { return k.kid === a.key_id; })[0];
    if (!jwk || !window.crypto || !crypto.subtle) throw 0;
    return Promise.all([
      crypto.subtle.digest('SHA-256', new TextEncoder().encode(p[0])),
      crypto.subtle.importKey('jwk', { kty: jwk.kty, crv: jwk.crv, x: jwk.x, key_ops: ['verify'] }, { name: 'Ed25519' }, false, ['verify'])
    ]).then(function (r) {
      return crypto.subtle.verify({ name: 'Ed25519' }, r[1], unb64u(env.signature.value), new TextEncoder().encode(canon(a))).then(function (sig) {
        var same = b64u(r[0]) === a.claims.digest.value;
        if (sig && same) put('lxi-v-sig', 'signature verified, in this browser', 'ok');
        else put('lxi-v-sig', 'does not match its signature');
      });
    });
  }).catch(function () { put('lxi-v-sig', 'not checked in this browser'); });

  fetch('https://luiqtimzcsoqnizybifs.supabase.co/functions/v1/lunara-registry/shieldRegistryList',
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}', cache: 'no-cache' })
    .then(function (r) { if (!r.ok) throw 0; return r.json(); })
    .then(function (d) {
      var n = typeof d.count === 'number' ? d.count : (d.businesses || []).length;
      put('lxi-v-reg', n === 0 ? 'no business certified yet' : n + (n === 1 ? ' business certified' : ' businesses certified'));
    })
    .catch(function () { put('lxi-v-reg', 'did not answer'); });

  /* ── sound: only if the visitor switched it on ───────────────────── */
  var AC = null;
  function audio() {
    try { if (localStorage.getItem('lx-sound') !== '1') return null; } catch (e) { return null; }
    try { if (!AC) AC = new (window.AudioContext || window.webkitAudioContext)(); if (AC.state === 'suspended') AC.resume(); } catch (e) { AC = null; }
    return AC && AC.state === 'running' ? AC : null;
  }
  function tone(f0, f1, t, dur, peak, type) {
    var A = audio(); if (!A) return;
    var at = A.currentTime + (t || 0), o = A.createOscillator(), g = A.createGain();
    o.type = type || 'sine'; o.frequency.setValueAtTime(f0, at); if (f1) o.frequency.exponentialRampToValueAtTime(f1, at + dur);
    g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(peak, at + Math.min(0.3, dur * 0.3)); g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(g); g.connect(A.destination); o.start(at); o.stop(at + dur + 0.05);
  }
  function air(t, dur, f0, f1, peak) {
    var A = audio(); if (!A) return;
    var at = A.currentTime + (t || 0), n = Math.round(A.sampleRate * dur), buf = A.createBuffer(1, n, A.sampleRate), d = buf.getChannelData(0);
    for (var i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    var s = A.createBufferSource(), bp = A.createBiquadFilter(), g = A.createGain();
    s.buffer = buf; bp.type = 'bandpass'; bp.Q.value = 1.4;
    bp.frequency.setValueAtTime(f0, at); bp.frequency.exponentialRampToValueAtTime(f1, at + dur);
    g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(peak, at + dur * 0.4); g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    s.connect(bp); bp.connect(g); g.connect(A.destination); s.start(at);
  }

  /* ── the plan: state, and when it begins (ms) ────────────────────── */
  var PLAN = [['grid', 100], ['signal', 360], ['landed', 880], ['ring', 1060], ['read', 1420], ['iris', 1560], ['mark', 2140], ['open', 3000], ['done', 3740]];
  var ON = {
    grid: function () { tone(55, 82, 0, 1.6, 0.12); },
    signal: function () { air(0, 0.55, 600, 3800, 0.06); },
    landed: function () { tone(880, 0, 0, 0.5, 0.03); },
    ring: function () { tone(1760, 0, 0.5, 1.2, 0.018); },
    read: function () { readMoon(); },
    iris: function () { moveIris(true, 760); air(0, 0.5, 2400, 900, 0.05); tone(98, 62, 0.62, 0.4, 0.09, 'triangle'); },
    mark: function () { tone(220, 0, 0, 2.2, 0.035); tone(330, 0, 0.05, 2, 0.02); },
    open: function () { land(); tone(55, 0, 0, 2.4, 0.09); tone(110, 0, 0, 2, 0.04); air(0, 0.9, 300, 2600, 0.05); },
    done: function () { finish(); }
  };
  var state = 'idle', step = 0, t0 = 0, finished = false, raf = 0;
  function enter(s) {
    state = s; box.setAttribute('data-state', s); box.classList.add('s-' + s);
    try { (ON[s] || function () {})(); } catch (e) { if (window.console) console.warn('[lunara-intro]', s, e); }
  }
  function clock(now) {
    raf = 0;
    if (finished) return;
    if (!t0) t0 = now;
    var t = now - t0;
    while (step < PLAN.length && t >= PLAN[step][1]) enter(PLAN[step++][0]);
    if (step < PLAN.length) raf = requestAnimationFrame(clock);
  }
  /* Jump ahead: every state up to `name` is entered at once (their
     classes land together and the CSS takes them in one move). */
  function jump(name) {
    var at = -1;
    for (var i = 0; i < PLAN.length; i++) if (PLAN[i][0] === name) at = i;
    if (at < 0 || step > at) return;
    while (step <= at) enter(PLAN[step++][0]);
    t0 = performance.now() - PLAN[at][1];
    if (!raf && !finished) raf = requestAnimationFrame(clock);
  }

  /* ── open: the ring leaves the instrument for tonight's moon ─────── */
  function land() {
    var inst = $('lxi-inst').getBoundingClientRect();
    var r0 = inst.width * 250 / 600, c0 = { x: inst.left + inst.width / 2, y: inst.top + inst.height / 2 };
    var moon = document.querySelector('.moon-wrap'), t = moon && moon.getBoundingClientRect();
    var c1 = t && t.width ? { x: t.left + t.width / 2, y: t.top + t.height / 2 } : c0;
    var r1 = t && t.width ? t.width / 2 : Math.hypot(innerWidth, innerHeight) / 2;
    var ring = document.createElement('i');
    ring.className = 'lxi-fly'; ring.setAttribute('aria-hidden', 'true');
    ring.style.left = (c0.x - r0) + 'px'; ring.style.top = (c0.y - r0) + 'px';
    ring.style.width = ring.style.height = (2 * r0) + 'px';
    box.appendChild(ring);
    root.classList.add('lx-arrive');
    setTimeout(function () { root.classList.remove('lx-arrive'); }, 1400);
    if (!ring.animate || REDUCED) { ring.remove(); return; }
    var k = r1 / r0;
    ring.animate([
      { transform: 'translate(0,0) scale(1)', opacity: 1, borderWidth: '2px' },
      { offset: 0.78, opacity: 0.9 },
      { transform: 'translate(' + (c1.x - c0.x).toFixed(1) + 'px,' + (c1.y - c0.y).toFixed(1) + 'px) scale(' + k.toFixed(3) + ')', opacity: 0, borderWidth: (2 / k).toFixed(2) + 'px' }
    ], { duration: 720, easing: 'cubic-bezier(.65,0,.2,1)', fill: 'forwards' });
  }

  /* ── done ────────────────────────────────────────────────────────── */
  function finish() {
    if (finished) return;
    finished = true;
    if (raf) cancelAnimationFrame(raf);
    try { localStorage.setItem('lx-intro-at', String(Date.now())); } catch (e) {}
    root.classList.remove('lx-intro');
    root.classList.add('lx-introdone');
    if (box.parentNode) box.parentNode.removeChild(box);
    try { window.dispatchEvent(new Event('lunara:intro-done')); } catch (e) {}
    var main = document.querySelector('main'); if (main) { main.setAttribute('tabindex', '-1'); main.focus({ preventScroll: true }); }
  }
  function leave() {                                     // Skip and Escape: out now, quietly
    if (finished || box.classList.contains('s-out')) return;
    box.classList.add('s-out');
    setTimeout(finish, 380);
  }
  function hurry() { if (!finished && state !== 'open' && state !== 'done') jump('open'); }

  var skipBtn = $('lxi-skip');
  skipBtn.addEventListener('click', function (e) { e.stopPropagation(); leave(); });
  box.addEventListener('click', hurry);
  document.addEventListener('keydown', function (e) {
    if (finished) return;
    if (e.key === 'Escape') { e.preventDefault(); leave(); return; }
    if (e.key === 'Enter' || e.key === ' ') { if (document.activeElement !== skipBtn) { e.preventDefault(); hurry(); } return; }
    if (e.key === 'Tab') { e.preventDefault(); skipBtn.focus(); }      // the dialog's one control keeps focus
  });
  skipBtn.focus({ preventScroll: true });

  /* ── go ──────────────────────────────────────────────────────────── */
  if (REDUCED) {
    // the composed instrument, still: every state but the opening, at once
    ['grid', 'signal', 'landed', 'ring', 'read', 'iris', 'mark'].forEach(function (s) { box.classList.add('s-' + s); });
    box.setAttribute('data-state', 'mark');
    moveIris(true, 0);
    readMoon();
    setTimeout(leave, 2200);
    return;
  }
  raf = requestAnimationFrame(clock);
})();
