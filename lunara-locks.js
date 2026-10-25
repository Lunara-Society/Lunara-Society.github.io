/* ═══════════════════════════════════════════════════════════════════
   THE TRANSIT: what stands between one page and the next
   ═══════════════════════════════════════════════════════════════════

   Leaving a page closes an iris over it: nine blades, the same
   diaphragm that opens on the seal in the intro, drawn edge to edge
   across the screen. It stops at a porthole, and in the porthole the
   destination's own mechanism runs, so the scene says where the visitor
   is going rather than pretending to check who they are:

     home            a lunar phase dial, stopping on tonight's phase
     passport        a passport page read by a scan bar, then stamped
     registry        a ledger drum, spun and stopped on the register
     intelligence    an orrery whose rings align on the present
     certification   a seal press striking the official seal
     pricing         a meter whose wheels settle on what checking costs
     for AI systems  signals running a circuit into the protocol
     lens            lens elements sliding along an axis into focus
     everything else a blast door that unbolts and parts

   Beside it, the destination by name and one true sentence about it,
   taken from that page. Then the camera goes through the porthole, the
   iris shuts, and the next page opens on the same aperture
   (lunara-shell.css draws the opening).

   It is a scene between pages and claims nothing: no sign-in, no
   clearance, no scan of the visitor, no "granted", and the panel says
   so in words: a scene between pages, not a security check. A full
   scene plays at most once a minute; in between, the iris closes
   briefly on the destination's name. Esc, Enter, a click or Skip goes at once.
   Reduced motion goes straight to the page. Sound is off until the
   speaker in the corner turns it on, and it never plays a sound that
   suggests a security event.
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.LunaraLocks) return;
  var REDUCED = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  var NS = 'http://www.w3.org/2000/svg';

  /* ── sound (opt-in) ─────────────────────────────────────────────── */
  var A = null, OUT = null, NB = null;
  function muted() { try { return localStorage.getItem('lx-sound') !== '1'; } catch (e) { return true; } }
  function audio() {
    if (muted()) return null;
    try {
      if (!A) {
        A = new (window.AudioContext || window.webkitAudioContext)();
        var comp = A.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 5;
        OUT = A.createGain(); OUT.gain.value = 0.55; OUT.connect(comp); comp.connect(A.destination);
      }
      if (A.state === 'suspended') A.resume();
    } catch (e) { A = null; }
    return A;
  }
  function noise() {
    if (!NB) { var n = A.sampleRate * 2; NB = A.createBuffer(1, n, A.sampleRate); var d = NB.getChannelData(0); for (var i = 0; i < n; i++) d[i] = Math.random() * 2 - 1; }
    return NB;
  }
  function env(g, t, peak, dur) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); }
  var S = {
    click: function (t, f, g, d) {
      var s = A.createBufferSource(), bp = A.createBiquadFilter(), gn = A.createGain();
      s.buffer = noise(); bp.type = 'bandpass'; bp.frequency.value = f || 3000; bp.Q.value = 8;
      env(gn, t, g || 0.5, d || 0.035); s.connect(bp); bp.connect(gn); gn.connect(OUT); s.start(t, Math.random(), (d || 0.035) + 0.02);
    },
    thud: function (t, g, f) {
      var o = A.createOscillator(), gn = A.createGain(); o.type = 'sine';
      o.frequency.setValueAtTime(f || 130, t); o.frequency.exponentialRampToValueAtTime(38, t + 0.28);
      env(gn, t, g || 0.5, 0.36); o.connect(gn); gn.connect(OUT); o.start(t); o.stop(t + 0.4);
      S.click(t, 700, (g || 0.5) * 0.7, 0.08);
    },
    tone: function (t, f, d, g, type) {
      var o = A.createOscillator(), gn = A.createGain(); o.type = type || 'sine'; o.frequency.value = f;
      gn.gain.setValueAtTime(0.0001, t); gn.gain.exponentialRampToValueAtTime(g || 0.05, t + 0.02); gn.gain.exponentialRampToValueAtTime(0.0001, t + (d || 0.3));
      o.connect(gn); gn.connect(OUT); o.start(t); o.stop(t + (d || 0.3) + 0.05);
    },
    sweep: function (t, d, f0, f1, g) {
      var s = A.createBufferSource(), bp = A.createBiquadFilter(), gn = A.createGain();
      s.buffer = noise(); bp.type = 'bandpass'; bp.Q.value = 1.6;
      bp.frequency.setValueAtTime(f0, t); bp.frequency.exponentialRampToValueAtTime(f1, t + d);
      gn.gain.setValueAtTime(0.0001, t); gn.gain.exponentialRampToValueAtTime(g || 0.2, t + d * 0.35); gn.gain.exponentialRampToValueAtTime(0.0001, t + d);
      s.connect(bp); bp.connect(gn); gn.connect(OUT); s.start(t, Math.random()); s.stop(t + d + 0.02);
    },
    servo: function (t, d, f0, f1, g) {
      var o = A.createOscillator(), lp = A.createBiquadFilter(), gn = A.createGain();
      o.type = 'sawtooth'; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + d);
      lp.type = 'lowpass'; lp.frequency.value = 900; lp.Q.value = 2;
      gn.gain.setValueAtTime(0.0001, t); gn.gain.exponentialRampToValueAtTime(g || 0.04, t + 0.04); gn.gain.setValueAtTime(g || 0.04, t + d - 0.05); gn.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.connect(lp); lp.connect(gn); gn.connect(OUT); o.start(t); o.stop(t + d + 0.02);
    },
    ratchet: function (t, d, n) { for (var i = 0; i < n; i++) { var k = i / n; S.click(t + d * (1 - Math.pow(1 - k, 2.2)), 2600 + k * 900, 0.28 * (1 - k * 0.5), 0.02); } }
  };
  function play(fn) { var a = audio(); if (!a) return; try { fn(a.currentTime + 0.02); } catch (e) {} }

  /* ── where a link goes ──────────────────────────────────────────── */
  var SECTION = {
    'league.html': 'passport', 'passport.html': 'passport',
    'registry.html': 'registry', 'verify-an-ai-business.html': 'registry',
    'intelligence.html': 'intelligence', 'check.html': 'intelligence', 'december-2.html': 'intelligence', 'marking.html': 'intelligence',
    'article50.html': 'intelligence', 'briefing.html': 'intelligence', 'regulation.html': 'intelligence', 'investigate.html': 'intelligence',
    'shield.html': 'shield', 'certify.html': 'shield', 'certify-healthcare.html': 'shield', 'certify-fintech.html': 'shield',
    'certify-government.html': 'shield', 'what-is-shield-certification.html': 'shield', 'verification-matrix.html': 'shield',
    'scorer.html': 'shield', 'constitution.html': 'shield', 'badge.html': 'shield',
    'pricing.html': 'pricing', 'join.html': 'pricing', 'readiness-kit.html': 'pricing', 'compliance-intelligence.html': 'pricing',
    'healthcare-intelligence.html': 'pricing', 'manage.html': 'pricing',
    'mcp.html': 'mcp', 'agents.html': 'mcp', 'agent-network.html': 'mcp', 'agent-passport.html': 'mcp', 'agent-atlas.html': 'mcp',
    'missions.html': 'mcp', 'test.html': 'mcp', 'embed.html': 'mcp',
    'lens.html': 'lens'
  };
  var DEST = {
    home:         { scene: 'moon',   title: 'Lunara Society',          line: null },
    passport:     { scene: 'visa',   title: 'Passport control',        line: 'Thirteen public checks on any domain, in seconds. Free, no account.' },
    registry:     { scene: 'ledger', title: 'The public register',     line: 'Anyone may ask it, person or AI system, and gets the same answer.' },
    intelligence: { scene: 'orrery', title: 'Regulatory intelligence', line: 'Every obligation, with the article that sets its date.' },
    shield:       { scene: 'press',  title: 'Certification',           line: 'Every decision is made, and signed, by a named reviewer.' },
    pricing:      { scene: 'meter',  title: 'What it costs',           line: 'Checking is free. Every price is read from one table.' },
    mcp:          { scene: 'bus',    title: 'For AI systems',          line: 'The same answers, by protocol. Free, no key.' },
    lens:         { scene: 'optic',  title: 'Lunara Lens',             line: 'Checks photos, video, voices and text for AI.' },
    other:        { scene: 'gate',   title: null,                      line: null }
  };
  function destination(url) {
    var u = new URL(url, location.href), file = (u.pathname.split('/').pop() || '').toLowerCase();
    if (!file || file === 'index.html' || file === 'home.html') return { key: 'home', file: 'home' };
    return { key: SECTION[file] || 'other', file: file.replace(/\.html?$/, '') };
  }
  function humane(file) { var s = file.replace(/[-_]+/g, ' '); return s.charAt(0).toUpperCase() + s.slice(1); }
  function here() {
    var d = destination(location.href);
    return d.key === 'home' ? 'Home' : (DEST[d.key].title && d.key !== 'other' ? DEST[d.key].title : humane(d.file));
  }

  /* ── helpers for the scenes ─────────────────────────────────────── */
  function q(r, s) { return r.querySelector(s); }
  function qa(r, s) { return Array.prototype.slice.call(r.querySelectorAll(s)); }
  var TIMERS = [];
  function at(ms, fn) { TIMERS.push(setTimeout(fn, ms)); }
  function anim(el, frames, opts) {
    if (!el || !el.animate) return null;
    var o = { fill: 'forwards', easing: 'cubic-bezier(.2,.8,.2,1)' }; for (var k in opts) o[k] = opts[k];
    return el.animate(frames, o);
  }
  function svg(inner, cls) { return '<svg class="' + (cls || 'sv') + '" viewBox="0 0 400 400" aria-hidden="true">' + inner + '</svg>'; }
  function polar(r, deg) { var a = (deg - 90) * Math.PI / 180; return [200 + Math.cos(a) * r, 200 + Math.sin(a) * r]; }
  /* The lit part of a moon of radius r at (cx,cy): k is the fraction lit. */
  function phasePath(cx, cy, r, k, waxing) {
    if (k <= 0.005) return '';
    var rx = Math.abs(1 - 2 * k) * r, top = cx + ' ' + (cy - r), bot = cx + ' ' + (cy + r);
    var limb = waxing ? 1 : 0, term = waxing ? (k > 0.5 ? 1 : 0) : (k > 0.5 ? 0 : 1);
    return 'M' + top + 'A' + r + ' ' + r + ' 0 0 ' + limb + ' ' + bot + 'A' + rx.toFixed(2) + ' ' + r + ' 0 0 ' + term + ' ' + top + 'Z';
  }

  /* ── the scenes ─────────────────────────────────────────────────── */
  var SCENES = {
    /* A dial of the eight phases turns and stops with tonight's under
       the index; the face shows tonight's moon as it is lit. */
    moon: {
      dur: 1150,
      html: function (st) {
        var ph = window.LunaraPhase ? window.LunaraPhase.at(new Date()) : { k: 0.5, waxing: true, name: 'The moon', percent: 50 };
        var pos = ph.waxing ? ph.k / 2 : 1 - ph.k / 2, idx = Math.round(pos * 8) % 8;
        st.moon = { idx: idx, ph: ph };
        var g = '', ticks = '';
        for (var i = 0; i < 8; i++) {
          var p = polar(146, i * 45), kk = [0, 0.25, 0.5, 0.75, 1, 0.75, 0.5, 0.25][i], wx = i < 4;
          g += '<g transform="translate(' + p[0].toFixed(1) + ' ' + p[1].toFixed(1) + ')"><circle r="17" fill="#121419" stroke="rgba(214,222,234,.28)"/>' +
            '<path d="' + phasePath(0, 0, 17, kk, wx) + '" fill="#E9E3D6"/></g>';
        }
        for (var t = 0; t < 72; t++) { var a = polar(170, t * 5), b = polar(t % 9 ? 176 : 182, t * 5); ticks += '<line x1="' + a[0].toFixed(1) + '" y1="' + a[1].toFixed(1) + '" x2="' + b[0].toFixed(1) + '" y2="' + b[1].toFixed(1) + '"/>'; }
        return svg('<defs><radialGradient id="lxlMoon" cx=".4" cy=".35" r=".75"><stop offset="0" stop-color="#FBF6EA"/><stop offset=".7" stop-color="#CFC6B2"/><stop offset="1" stop-color="#8E8676"/></radialGradient></defs>' +
          '<g class="dial"><g stroke="rgba(244,226,176,.55)" stroke-width="1">' + ticks + '</g>' + g + '</g>' +
          '<path class="idx" d="M200 34 l-9 -15 h18 z" fill="#E7C987"/>' +
          '<circle cx="200" cy="200" r="80" fill="#0E1014" stroke="rgba(244,226,176,.45)" stroke-width="1.5"/>' +
          '<g class="face"><path d="' + phasePath(200, 200, 80, ph.k, ph.waxing) + '" fill="url(#lxlMoon)"/></g>' +
          '<text class="lbl" x="200" y="318" text-anchor="middle">' + ph.percent + '% LIT</text>');
      },
      run: function (root, st) {
        var to = -st.moon.idx * 45;
        anim(q(root, '.dial'), [{ transform: 'rotate(' + (to + 400) + 'deg)' }, { transform: 'rotate(' + to + 'deg)' }], { duration: 1000, easing: 'cubic-bezier(.12,.75,.15,1)' });
        anim(q(root, '.face'), [{ opacity: 0.15 }, { opacity: 1 }], { duration: 700, delay: 350 });
        anim(q(root, '.lbl'), [{ opacity: 0 }, { opacity: 1 }], { duration: 300, delay: 750 });
        play(function (t) { S.ratchet(t, 0.95, 14); S.tone(t + 0.98, 659.3, 0.6, 0.035); });
      }
    },

    /* A passport data page rises, a scan bar reads it, a stamp lands. */
    visa: {
      dur: 1150,
      html: function () {
        var gu = '';
        for (var i = 0; i < 7; i++) gu += '<path d="M60 ' + (118 + i * 9) + ' Q 130 ' + (100 + i * 9) + ' 200 ' + (118 + i * 9) + ' T 340 ' + (118 + i * 9) + '" stroke="rgba(217,186,120,.10)" fill="none"/>';
        return svg('<g class="pg">' +
          '<rect x="48" y="92" width="304" height="216" rx="12" fill="#13161B" stroke="rgba(214,222,234,.26)"/>' + gu +
          '<rect x="68" y="116" width="70" height="88" rx="4" fill="#0B0D10" stroke="rgba(214,222,234,.22)"/>' +
          '<circle cx="103" cy="148" r="16" fill="none" stroke="rgba(214,222,234,.22)"/><path d="M80 196 q23 -26 46 0" fill="none" stroke="rgba(214,222,234,.22)"/>' +
          '<text class="cap" x="156" y="126">DOMAIN PASSPORT</text>' +
          '<rect x="156" y="140" width="150" height="5" rx="2" fill="rgba(214,222,234,.18)"/><rect x="156" y="156" width="118" height="5" rx="2" fill="rgba(214,222,234,.14)"/>' +
          '<rect x="156" y="172" width="134" height="5" rx="2" fill="rgba(214,222,234,.14)"/><rect x="156" y="188" width="96" height="5" rx="2" fill="rgba(214,222,234,.10)"/>' +
          '<text class="mrz m1" x="64" y="252">P&lt;LUNARA&lt;&lt;PASSPORT&lt;CONTROL&lt;&lt;&lt;&lt;&lt;&lt;</text>' +
          '<text class="mrz m2" x="64" y="276">DOMAIN&lt;&lt;13&lt;PUBLIC&lt;CHECKS&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;</text>' +
          '<rect class="scan" x="48" y="92" width="304" height="3" fill="#8FE3BD"/></g>' +
          '<g class="stamp"><g transform="translate(276 176) rotate(-14)">' +
          '<circle r="54" fill="rgba(231,182,92,.05)" stroke="#E7B65C" stroke-width="3"/><circle r="45" fill="none" stroke="#E7B65C" stroke-width="1"/>' +
          '<text y="-12" text-anchor="middle" class="st">PASSPORT</text><text y="6" text-anchor="middle" class="st">CONTROL</text><text y="25" text-anchor="middle" class="st s2">LUNARA · 13</text></g></g>');
      },
      run: function (root) {
        anim(q(root, '.pg'), [{ transform: 'translateY(46px)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 320 });
        anim(q(root, '.scan'), [{ transform: 'translateY(0)', opacity: 0 }, { offset: 0.08, opacity: 1 }, { transform: 'translateY(212px)', opacity: 1 }, { transform: 'translateY(212px)', opacity: 0 }], { duration: 540, delay: 260, easing: 'cubic-bezier(.45,0,.55,1)' });
        at(560, function () { var m = q(root, '.m1'); if (m) m.classList.add('read'); });
        at(640, function () { var m = q(root, '.m2'); if (m) m.classList.add('read'); });
        anim(q(root, '.stamp'), [{ transform: 'scale(1.9)', opacity: 0 }, { transform: 'scale(1)', opacity: 0.95 }], { duration: 150, delay: 860, easing: 'cubic-bezier(.6,0,1,1)' });
        anim(q(root, '.pg'), [{ transform: 'none' }, { transform: 'translate(1px,2px)' }, { transform: 'translate(-1px,-1px)' }, { transform: 'none' }], { duration: 160, delay: 1010, fill: 'none' });
        play(function (t) { S.sweep(t + 0.26, 0.55, 1200, 4200, 0.07); S.thud(t + 1.0, 0.5, 160); });
      }
    },

    /* A drum of ruled ledger rows spins and stops on the register's
       one standing rule. The rows are empty: nothing here is invented. */
    ledger: {
      dur: 1200,
      html: function () {
        var rows = '';
        for (var i = 0; i < 10; i++) {
          rows += '<div class="row" style="transform:rotateX(' + (i * 36) + 'deg) translateZ(118px)">' +
            (i === 0 ? '<b>Public</b><b>Free</b><b>No account</b>' : '<i></i><i></i><i></i>') + '</div>';
        }
        return '<div class="ld"><div class="drum">' + rows + '</div><div class="win"></div><p class="lab">THE REGISTER</p></div>';
      },
      run: function (root) {
        anim(q(root, '.drum'), [{ transform: 'rotateX(-1080deg)' }, { transform: 'rotateX(0deg)' }], { duration: 1100, easing: 'cubic-bezier(.1,.6,.12,1)' });
        anim(q(root, '.win'), [{ opacity: 0.3 }, { opacity: 1 }], { duration: 300, delay: 900 });
        play(function (t) { S.ratchet(t, 1.0, 22); S.thud(t + 1.05, 0.32, 150); });
      }
    },

    /* Four orbits, one for each year in the record, turn until their
       markers line up on the present. */
    orrery: {
      dur: 1150,
      html: function () {
        var rings = '', yrs = ['2025', '2026', '2027', '2028'];
        function months(r) { var m = ''; for (var j = 1; j < 12; j++) { var a = polar(r - 4, j * 30), b2 = polar(r + 4, j * 30); m += '<line x1="' + a[0].toFixed(1) + '" y1="' + a[1].toFixed(1) + '" x2="' + b2[0].toFixed(1) + '" y2="' + b2[1].toFixed(1) + '" stroke="rgba(214,222,234,.4)" stroke-width="1"/>'; } return m; }
        [58, 94, 130, 166].forEach(function (r, i) {
          rings += '<circle cx="200" cy="200" r="' + r + '" fill="none" stroke="rgba(214,222,234,.18)" stroke-dasharray="' + (i % 2 ? '2 5' : '') + '"/>' +
            '<g class="orb o' + i + '">' + months(r) + '<line x1="200" y1="' + (200 - r - 9) + '" x2="200" y2="' + (200 - r + 9) + '" stroke="#E7C987" stroke-width="3"/>' +
            '<text x="208" y="' + (200 - r - 2) + '" class="yr">' + yrs[i] + '</text></g>';
        });
        return svg('<line class="now" x1="200" y1="10" x2="200" y2="200" stroke="rgba(244,226,176,.7)" stroke-width="1.2" stroke-dasharray="3 4"/>' + rings +
          '<circle cx="200" cy="200" r="24" fill="#0E1014" stroke="rgba(244,226,176,.6)"/><text x="200" y="204" text-anchor="middle" class="ctr">NOW</text>');
      },
      run: function (root) {
        [[-250, 980], [180, 900], [-140, 820], [310, 1060]].forEach(function (v, i) {
          anim(q(root, '.o' + i), [{ transform: 'rotate(' + v[0] + 'deg)' }, { transform: 'rotate(0deg)' }], { duration: v[1], easing: 'cubic-bezier(.15,.75,.2,1)' });
        });
        anim(q(root, '.now'), [{ opacity: 0.25 }, { opacity: 1 }], { duration: 300, delay: 950 });
        play(function (t) { [523.3, 587.3, 659.3, 784].forEach(function (f, i) { S.tone(t + [0.82, 0.9, 0.98, 1.06][i], f, 0.5, 0.03); }); });
      }
    },

    /* The die comes down on the plate and lifts off the struck seal. */
    press: {
      dur: 1150,
      html: function () {
        return '<div class="pr"><img class="em" src="/lunara_emblem_512.png" alt="" decoding="async"><i class="ring"></i><i class="die"></i></div>';
      },
      run: function (root) {
        var die = q(root, '.die'), em = q(root, '.em');
        anim(die, [{ transform: 'scale(1.7)', opacity: 0 }, { offset: 0.3, opacity: 0.9 }, { transform: 'scale(1)', opacity: 1 }], { duration: 480, delay: 120, easing: 'cubic-bezier(.7,0,1,.6)' });
        anim(q(root, '.ring'), [{ transform: 'scale(.9)', opacity: 0 }, { offset: 0.15, opacity: 0.9 }, { transform: 'scale(1.35)', opacity: 0 }], { duration: 520, delay: 600 });
        anim(die, [{ transform: 'scale(1)', opacity: 1 }, { transform: 'scale(1.45)', opacity: 0 }], { duration: 380, delay: 740, easing: 'cubic-bezier(.3,0,.2,1)' });
        anim(em, [{ filter: 'grayscale(1) brightness(.35)' }, { filter: 'grayscale(0) brightness(1.15)' }, { filter: 'grayscale(0) brightness(1)' }], { duration: 520, delay: 640 });
        play(function (t) { S.servo(t + 0.1, 0.5, 70, 140, 0.035); S.thud(t + 0.6, 0.6, 110); S.tone(t + 0.62, 196, 0.9, 0.03, 'triangle'); });
      }
    },

    /* The meter: wheels spin and settle on what checking costs. */
    meter: {
      dur: 1150,
      html: function () {
        var strip = ''; for (var i = 0; i < 30; i++) strip += '<span>' + ((i + 1) % 10) + '</span>';
        var wheel = '<span class="wh"><span class="st">' + strip + '</span></span>';
        return '<div class="mt"><p class="tt">CHECKING</p><div class="win"><span class="fx">$</span>' + wheel + '<span class="fx dot">.</span>' + wheel + wheel +
          '</div><p class="tt b">ALWAYS · NO ACCOUNT</p></div>';
      },
      run: function (root) {
        qa(root, '.wh .st').forEach(function (s, i) {
          var h = s.firstChild ? s.firstChild.getBoundingClientRect().height || 88 : 88;
          anim(s, [{ transform: 'translateY(0px)' }, { transform: 'translateY(' + (-29 * h) + 'px)' }], { duration: 760 + i * 170, easing: 'cubic-bezier(.2,.6,.15,1)' });
        });
        play(function (t) { S.ratchet(t, 1.05, 26); S.tone(t + 1.1, 1318.5, 0.25, 0.03); });
      }
    },

    /* Signals run the traces into the protocol and one answer leaves. */
    bus: {
      dur: 1150,
      html: function () {
        var ins = ['M0 96 H70 V168 H150', 'M0 140 H96 V184 H150', 'M0 200 H150', 'M0 260 H96 V216 H150', 'M0 304 H70 V232 H150'], t = '', p = '';
        ins.forEach(function (d) { t += '<path d="' + d + '"/>'; p += '<path class="pk" pathLength="100" d="' + d + '"/>'; });
        var pins = ''; for (var i = 0; i < 5; i++) pins += '<rect class="pin" x="146" y="' + (164 + i * 17) + '" width="8" height="5" rx="1"/>';
        return svg('<g class="tr" fill="none" stroke="rgba(214,222,234,.20)" stroke-width="2">' + t + '<path d="M250 200 H400"/></g>' +
          '<g fill="none" stroke="#F4E2B0" stroke-width="3" stroke-linecap="round">' + p + '<path class="pk out" pathLength="100" d="M250 200 H400"/></g>' + pins +
          '<rect class="chip" x="150" y="150" width="100" height="100" rx="10" fill="#111317" stroke="rgba(244,226,176,.55)" stroke-width="1.5"/>' +
          '<text x="200" y="206" text-anchor="middle" class="mcp">MCP</text><text x="392" y="188" text-anchor="end" class="ans">ANSWER</text>');
      },
      run: function (root) {
        qa(root, '.pk:not(.out)').forEach(function (pk, i) {
          anim(pk, [{ strokeDashoffset: '6px', opacity: 1 }, { strokeDashoffset: '-100px', opacity: 1 }], { duration: 520, delay: 80 + i * 70, easing: 'cubic-bezier(.4,0,.6,1)' });
        });
        qa(root, '.pin').forEach(function (pn, i) { at(560 + i * 50, function () { pn.classList.add('on'); }); });
        at(760, function () { var c = q(root, '.chip'); if (c) c.classList.add('on'); });
        anim(q(root, '.out'), [{ strokeDashoffset: '6px', opacity: 1 }, { strokeDashoffset: '-100px', opacity: 1 }], { duration: 380, delay: 800, easing: 'cubic-bezier(.4,0,.6,1)' });
        anim(q(root, '.ans'), [{ opacity: 0 }, { opacity: 1 }], { duration: 250, delay: 1000 });
        play(function (t) { for (var i = 0; i < 10; i++) S.tone(t + 0.1 + i * 0.06, 1400 + (i % 5) * 220, 0.04, 0.02, 'square'); S.tone(t + 0.78, 880, 0.4, 0.04); });
      }
    },

    /* Lens elements slide along the axis; the target comes into focus. */
    optic: {
      dur: 1150,
      html: function () {
        var lens = '';
        [[112, 18, 78], [176, 24, 96], [236, 16, 70]].forEach(function (l, i) {
          lens += '<g class="le l' + i + '"><ellipse cx="' + l[0] + '" cy="200" rx="' + l[1] + '" ry="' + l[2] + '" fill="url(#lxlGlass)" stroke="rgba(244,226,176,.6)" stroke-width="1.2"/></g>';
        });
        return svg('<defs><linearGradient id="lxlGlass" x1="0" x2="1"><stop offset="0" stop-color="rgba(200,220,240,.05)"/><stop offset=".5" stop-color="rgba(200,220,240,.22)"/><stop offset="1" stop-color="rgba(200,220,240,.05)"/></linearGradient>' +
          '<filter id="lxlBlur" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur class="bl" stdDeviation="6"/></filter></defs>' +
          '<line x1="10" y1="200" x2="390" y2="200" stroke="rgba(214,222,234,.18)" stroke-dasharray="4 5"/>' + lens +
          '<g class="tg" filter="url(#lxlBlur)" fill="none" stroke="#EDE7DA" stroke-width="2"><circle cx="322" cy="200" r="30"/><circle cx="322" cy="200" r="17"/><line x1="322" y1="160" x2="322" y2="240"/><line x1="282" y1="200" x2="362" y2="200"/></g>' +
          '<text x="322" y="268" text-anchor="middle" class="foc">IN FOCUS</text>');
      },
      run: function (root) {
        [[-90, 0], [70, 120], [-40, 60]].forEach(function (v, i) {
          anim(q(root, '.l' + i), [{ transform: 'translateX(' + v[0] + 'px)', opacity: 0 }, { transform: 'translateX(0)', opacity: 1 }], { duration: 700, delay: v[1], easing: 'cubic-bezier(.2,.8,.2,1)' });
        });
        var bl = q(root, '.bl'), t0 = performance.now() + 380;
        (function f(now) { var k = Math.max(0, Math.min(1, (now - t0) / 560)); if (bl) bl.setAttribute('stdDeviation', (6 * (1 - k * k)).toFixed(2)); if (k < 1 && document.getElementById('lxl')) requestAnimationFrame(f); })(performance.now());
        anim(q(root, '.foc'), [{ opacity: 0 }, { opacity: 1 }], { duration: 260, delay: 980 });
        play(function (t) { S.servo(t, 0.7, 180, 240, 0.025); S.click(t + 0.95, 2200, 0.3, 0.03); S.tone(t + 0.97, 1046.5, 0.35, 0.03); });
      }
    },

    /* A door in two slabs: the bolts draw back, the slabs part on light. */
    gate: {
      dur: 1150,
      html: function () {
        var fr = '';
        for (var i = 0; i < 7; i++) { var k = Math.pow(0.68, i), w = 300 * k, h = 360 * k; fr += '<rect x="' + (200 - w / 2).toFixed(1) + '" y="' + (200 - h / 2).toFixed(1) + '" width="' + w.toFixed(1) + '" height="' + h.toFixed(1) + '" rx="' + (10 * k).toFixed(1) + '" stroke="rgba(244,226,176,' + (0.7 - i * 0.08).toFixed(2) + ')"/>'; }
        var fl = ''; [[50, 20], [350, 380], [50, 380], [350, 20]].forEach(function (c) { fl += '<line x1="' + c[0] + '" y1="' + c[1] + '" x2="200" y2="200"/>'; });
        return '<div class="gt"><div class="beyond">' + svg('<defs><radialGradient id="lxlEnd"><stop offset="0" stop-color="rgba(255,244,214,.75)"/><stop offset="1" stop-color="rgba(255,244,214,0)"/></radialGradient></defs>' +
          '<g fill="none" stroke="rgba(244,226,176,.18)" stroke-width="1">' + fl + '</g><g fill="none" stroke-width="1.4">' + fr + '</g><circle cx="200" cy="200" r="40" fill="url(#lxlEnd)"/>') +
          '</div><i class="slab l"></i><i class="slab r"></i><i class="bolt b0"></i><i class="bolt b1"></i><i class="bolt b2"></i></div>';
      },
      run: function (root) {
        qa(root, '.bolt').forEach(function (b, i) { anim(b, [{ transform: 'scaleX(1)', opacity: 1 }, { transform: 'scaleX(0)', opacity: 0.4 }], { duration: 170, delay: 120 + i * 130, easing: 'cubic-bezier(.6,0,.4,1)' }); });
        anim(q(root, '.slab.l'), [{ transform: 'translateX(0)' }, { transform: 'translateX(-58%)' }], { duration: 560, delay: 560, easing: 'cubic-bezier(.65,0,.25,1)' });
        anim(q(root, '.slab.r'), [{ transform: 'translateX(0)' }, { transform: 'translateX(58%)' }], { duration: 560, delay: 560, easing: 'cubic-bezier(.65,0,.25,1)' });
        anim(q(root, '.beyond'), [{ opacity: 0, transform: 'scale(.9)' }, { opacity: 1, transform: 'scale(1.06)' }], { duration: 700, delay: 600, easing: 'cubic-bezier(.2,.8,.2,1)' });
        play(function (t) { for (var i = 0; i < 3; i++) S.click(t + 0.12 + i * 0.13, 1800, 0.45, 0.05); S.sweep(t + 0.5, 0.25, 3000, 800, 0.08); S.servo(t + 0.56, 0.56, 60, 90, 0.05); S.thud(t + 1.08, 0.3, 90); });
      }
    }
  };
  var KEYS = Object.keys(SCENES);

  /* ── the stage ──────────────────────────────────────────────────── */
  var CSS = [
    '#lxl{position:fixed;inset:0;z-index:2147483600;pointer-events:none;visibility:hidden;color:#EDE7DA;font-family:"IBM Plex Mono",ui-monospace,monospace;--P:min(52vmin,480px)}',
    '#lxl.go{visibility:visible;pointer-events:auto}',
    '#lxl .iris{position:absolute;left:50%;top:50%;overflow:visible}',
    '#lxl .iris .bl{transform-box:view-box;transform-origin:1000px 1000px}',
    '#lxl .port{position:absolute;left:50%;top:50%;width:var(--P);height:var(--P);margin:calc(var(--P) / -2) 0 0 calc(var(--P) / -2);border-radius:50%;overflow:hidden;opacity:0;',
    '  background:radial-gradient(circle at 50% 40%,#12151B,#06070A 72%)}',
    '#lxl .rim{position:absolute;left:50%;top:50%;width:calc(var(--P) * 1.13);height:calc(var(--P) * 1.13);margin:calc(var(--P) * -.565) 0 0 calc(var(--P) * -.565);border-radius:50%;opacity:0;',
    '  background:conic-gradient(from 210deg,#C9CFD6,#3B4047 22%,#9AA1AA 40%,#2B2F35 62%,#B8BEC6 82%,#C9CFD6);',
    '  -webkit-mask:radial-gradient(closest-side,transparent calc(100% - var(--P) * .072),#000 calc(100% - var(--P) * .072 + 1px));mask:radial-gradient(closest-side,transparent calc(100% - var(--P) * .072),#000 calc(100% - var(--P) * .072 + 1px))}',
    '#lxl .rim::before{content:"";position:absolute;inset:calc(var(--P) * .065 - 1px);border-radius:50%;border:1px solid rgba(244,226,176,.65)}',
    '#lxl .bez{position:absolute;left:50%;top:50%;width:calc(var(--P) * 1.3);height:calc(var(--P) * 1.3);margin:calc(var(--P) * -.65) 0 0 calc(var(--P) * -.65);border-radius:50%;opacity:0;',
    '  background:repeating-conic-gradient(rgba(244,226,176,.55) 0 .45deg,transparent .45deg 5deg);',
    '  -webkit-mask:radial-gradient(closest-side,transparent 89%,#000 89.5%,#000 95%,transparent 95.5%);mask:radial-gradient(closest-side,transparent 89%,#000 89.5%,#000 95%,transparent 95.5%)}',
    '#lxl.on .port,#lxl.on .rim{opacity:1;transition:opacity .22s ease}#lxl.on .bez{opacity:1;transform:rotate(0deg);transition:opacity .4s ease,transform 1.4s cubic-bezier(.2,.8,.2,1)}',
    '#lxl .bez{transform:rotate(-24deg)}',
    '#lxl .sc{position:absolute;inset:0}#lxl .sc .sv{position:absolute;inset:0;width:100%;height:100%}',
    '#lxl .side{position:absolute;top:50%;width:min(340px,calc(50vw - var(--P) * .65 - 56px));opacity:0;transform:translateY(-50%)}',
    '#lxl .side.l{right:calc(50% + var(--P) * .65 + 44px);text-align:right}#lxl .side.r{left:calc(50% + var(--P) * .65 + 44px)}',
    '#lxl.on .side{opacity:1;transition:opacity .3s ease .12s}',
    '#lxl .side.l p{margin:0;font:500 11.5px/2 "IBM Plex Mono",ui-monospace,monospace;letter-spacing:.2em;text-transform:uppercase;color:rgba(217,186,120,.85)}',
    '#lxl .side.l p b{color:#EDE7DA;font-weight:500}#lxl .side.l p.nb{margin-top:14px;font-size:10px;letter-spacing:.16em;color:rgba(200,194,182,.6)}',
    '#lxl .side.r h3{margin:0;font:400 36px/1.08 "Cormorant Garamond",Georgia,serif;color:#F1ECE2;letter-spacing:-.005em}',
    '#lxl .side.r p{margin:14px 0 0;font:400 15.5px/1.55 Inter,system-ui,sans-serif;color:#C8C2B6}',
    '#lxl .dest{position:absolute;left:0;right:0;top:50%;margin-top:-.5em;text-align:center;font:500 14px/1 "IBM Plex Mono",ui-monospace,monospace;letter-spacing:.34em;text-indent:.34em;text-transform:uppercase;color:#EBCF8F;opacity:0;text-shadow:0 0 18px rgba(0,0,0,.9)}',
    '#lxl.brief .dest{opacity:1;transition:opacity .12s ease .16s}',
    '#lxl .skip{position:absolute;right:24px;bottom:22px;padding:9px 16px;border-radius:999px;cursor:pointer;opacity:0;border:1px solid rgba(214,222,234,.24);background:rgba(6,7,9,.6);color:rgba(237,231,218,.8);font:500 11px/1 "IBM Plex Mono",ui-monospace,monospace;letter-spacing:.18em;text-transform:uppercase}',
    '#lxl.on .skip{opacity:1;transition:opacity .3s ease .3s}#lxl .skip:focus-visible{outline:2px solid #E7C987;outline-offset:2px}',
    '#lxl.fly .sc{transform:scale(1.75);opacity:0;transition:transform .3s cubic-bezier(.7,0,.84,0),opacity .28s ease .04s}',
    '#lxl.fly .side,#lxl.fly .skip,#lxl.fly .bez{opacity:0;transition:opacity .14s ease}',
    '#lxl.fly .rim{opacity:0;transition:opacity .2s ease .12s}',
    /* the scenes */
    '#lxl .sv text{font-family:"IBM Plex Mono",ui-monospace,monospace}',
    '#lxl .lbl{font-size:15px;letter-spacing:4px;fill:#E7C987;opacity:0}',
    '#lxl .dial{transform-box:view-box;transform-origin:200px 200px}',
    '#lxl .cap{font-size:9.5px;letter-spacing:2.4px;fill:rgba(217,186,120,.85)}',
    '#lxl .mrz{font-size:11.5px;letter-spacing:.6px;fill:rgba(237,231,218,.35);transition:fill .2s ease}#lxl .mrz.read{fill:#BFF2DA}',
    '#lxl .stamp{transform-box:view-box;transform-origin:276px 176px;opacity:0}',
    '#lxl .st{font-size:11px;letter-spacing:2px;fill:#E7B65C;font-weight:500}#lxl .st.s2{font-size:9px;letter-spacing:1.6px}',
    '#lxl .ld{position:absolute;inset:0;perspective:520px;display:grid;place-items:center}',
    '#lxl .drum{position:relative;width:58%;height:58px;transform-style:preserve-3d}',
    '#lxl .row{position:absolute;inset:0;display:flex;align-items:center;justify-content:space-around;gap:10px;padding:0 18px;backface-visibility:hidden;',
    '  background:linear-gradient(180deg,#191C22,#101216);border:1px solid rgba(214,222,234,.16);border-radius:6px}',
    '#lxl .row i{flex:1;height:5px;border-radius:2px;background:rgba(214,222,234,.14)}',
    '#lxl .row b{font:500 13px/1 "IBM Plex Mono",ui-monospace,monospace;letter-spacing:.14em;text-transform:uppercase;color:#EDE7DA}',
    '#lxl .win{position:absolute;left:9%;right:9%;top:50%;height:88px;margin-top:-44px;border:1.5px solid rgba(231,201,135,.85);border-radius:9px;box-shadow:0 0 24px rgba(231,201,135,.18)}',
    '#lxl .ld .lab{position:absolute;left:0;right:0;bottom:20%;margin:0;text-align:center;font:500 11px/1 "IBM Plex Mono",ui-monospace,monospace;letter-spacing:.3em;color:rgba(217,186,120,.8)}',
    '#lxl .orb{transform-box:view-box;transform-origin:200px 200px}',
    '#lxl .yr{font-size:10px;letter-spacing:1.5px;fill:rgba(237,231,218,.75)}#lxl .ctr{font-size:9px;letter-spacing:2px;fill:#E7C987}',
    '#lxl .pr{position:absolute;inset:0}#lxl .pr .em{position:absolute;left:5%;top:5%;width:90%;height:90%;filter:grayscale(1) brightness(.35)}',
    '#lxl .pr .die{position:absolute;left:11%;top:11%;width:78%;height:78%;border-radius:50%;opacity:0;',
    '  background:radial-gradient(circle at 50% 50%,#2A2E34 0 52%,transparent 53%),repeating-conic-gradient(#C3C9D0 0 1.2deg,#5B6168 1.2deg 2.4deg);',
    '  box-shadow:0 30px 60px rgba(0,0,0,.6),inset 0 0 0 2px rgba(255,255,255,.12)}',
    '#lxl .pr .ring{position:absolute;inset:8%;border-radius:50%;border:2px solid rgba(244,226,176,.9);opacity:0}',
    '#lxl .mt{position:absolute;inset:0;display:grid;place-content:center;justify-items:center;gap:22px;--h:88px}',
    '#lxl .mt .tt{margin:0;font:500 13px/1 "IBM Plex Mono",ui-monospace,monospace;letter-spacing:.34em;color:rgba(217,186,120,.9)}',
    '#lxl .mt .win{position:static;margin:0;width:auto;height:var(--h);display:flex;align-items:center;gap:6px;padding:0 14px;border-radius:10px;background:#0B0D10}',
    '#lxl .mt .fx{font:300 72px/1 "Cormorant Garamond",Georgia,serif;color:#F1ECE2}#lxl .mt .fx.dot{margin:0 -2px}',
    '#lxl .mt .wh{display:block;width:62px;height:var(--h);overflow:hidden;border-radius:6px;background:linear-gradient(180deg,#07080A,#1B1E24 50%,#07080A)}',
    '#lxl .mt .st{display:block}#lxl .mt .st span{display:block;height:var(--h);font:400 72px/var(--h) "Cormorant Garamond",Georgia,serif;text-align:center;color:#F1ECE2}',
    '#lxl .pk{stroke-dasharray:6 100;stroke-dashoffset:6;opacity:0;filter:drop-shadow(0 0 4px rgba(244,226,176,.8))}',
    '#lxl .pin{fill:rgba(214,222,234,.25);transition:fill .15s}#lxl .pin.on{fill:#F4E2B0}',
    '#lxl .chip{transition:stroke .3s,fill .3s}#lxl .chip.on{stroke:#F4E2B0;fill:#16181D}',
    '#lxl .mcp{font-size:20px;letter-spacing:4px;fill:#EDE7DA}#lxl .ans{font-size:10px;letter-spacing:2.5px;fill:#E7C987;opacity:0}',
    '#lxl .foc{font-size:10px;letter-spacing:2.5px;fill:#E7C987;opacity:0}',
    '#lxl .gt{position:absolute;inset:0}#lxl .gt .beyond{position:absolute;inset:0;opacity:0;background:radial-gradient(50% 60% at 50% 50%,rgba(244,226,176,.10),transparent 70%)}',
    '#lxl .gt .slab{position:absolute;top:0;bottom:0;width:56%;background:linear-gradient(90deg,#1A1D22,#2C3037 60%,#16181C);box-shadow:inset 0 0 0 1px rgba(214,222,234,.14)}',
    '#lxl .gt .slab.l{left:0;clip-path:polygon(0 0,100% 0,89% 12%,100% 24%,89% 36%,100% 48%,89% 60%,100% 72%,89% 84%,100% 96%,95% 100%,0 100%)}',
    '#lxl .gt .slab.r{right:0;clip-path:polygon(11% 0,100% 0,100% 100%,0 100%,11% 90%,0 78%,11% 66%,0 54%,11% 42%,0 30%,11% 18%,0 6%)}',
    '#lxl .gt .bolt{position:absolute;left:38%;width:24%;height:12px;margin-top:-6px;border-radius:6px;background:linear-gradient(180deg,#E9D5A0,#8B7440);box-shadow:0 0 12px rgba(231,201,135,.35)}',
    '#lxl .gt .b0{top:30%}#lxl .gt .b1{top:50%}#lxl .gt .b2{top:70%}',
    /* the sound switch, on every page from the start */
    '#lxl-snd{position:fixed;left:16px;bottom:16px;z-index:2147483000;width:34px;height:34px;border-radius:50%;border:1px solid rgba(226,196,122,.3);background:rgba(8,10,14,.75);',
    '  color:rgba(226,196,122,.75);cursor:pointer;display:grid;place-items:center;padding:0;opacity:.55;transition:opacity .2s}',
    '#lxl-snd:hover,#lxl-snd:focus-visible{opacity:1}#lxl-snd svg{width:16px;height:16px}',
    /* portrait: the words above and below the porthole */
    '@media (max-aspect-ratio:4/5){#lxl{--P:min(72vmin,800px)}',
    '  #lxl .side{top:auto;transform:none;width:min(86vw,940px);left:50% !important;right:auto !important;margin-left:calc(min(86vw,940px) / -2);text-align:center !important}',
    '  #lxl .side.l{bottom:calc(50% + var(--P) * .65 + 40px)}#lxl .side.r{top:calc(50% + var(--P) * .65 + 40px)}',
    '  #lxl .side.l p{font-size:16px}#lxl .side.r h3{font-size:54px}#lxl .side.r p{font-size:24px}#lxl .dest{font-size:22px}#lxl .skip{font-size:15px;padding:14px 22px}}'
  ].join('\n');
  function ensureCss() {
    if (document.getElementById('lxl-css')) return;
    var st = document.createElement('style'); st.id = 'lxl-css'; st.textContent = CSS; document.head.appendChild(st);
  }

  /* The iris: nine half-planes on a square the size of the screen's
     diagonal (viewBox 2000, centre 1000). Each blade is pushed out from
     the centre by d and turned by a little twist; the gap they leave is
     the aperture, its apothem d. */
  var box = null, iris = null, BL = [], U = 1;
  function el(tag, a, p) { var n = document.createElementNS(NS, tag); for (var k in a) n.setAttribute(k, a[k]); if (p) p.appendChild(n); return n; }
  function build() {
    if (box) return box;
    ensureCss();
    box = document.createElement('div'); box.id = 'lxl'; box.setAttribute('aria-hidden', 'true');
    box.innerHTML = '<div class="port"><div class="sc"></div></div><i class="rim"></i><i class="bez"></i>' +
      '<div class="side l"></div><div class="side r"></div><p class="dest"></p><button type="button" class="skip">Skip · Esc</button>';
    iris = el('svg', { 'class': 'iris', viewBox: '0 0 2000 2000', 'aria-hidden': 'true' });
    var defs = el('defs', {}, iris), gr = el('linearGradient', { id: 'lxlBl', gradientUnits: 'userSpaceOnUse', x1: 0, y1: 1000, x2: 0, y2: 1600 }, defs);
    [[0, '#3E434B'], [0.04, '#22252B'], [0.4, '#121418'], [1, '#08090B']].forEach(function (s) { el('stop', { offset: s[0], 'stop-color': s[1] }, gr); });
    for (var i = 0; i < 9; i++) {
      var rot = el('g', { 'class': 'bl' }, iris), mv = el('g', {}, rot);
      el('path', { d: 'M-3000 1000H5000V6000H-3000Z', fill: 'url(#lxlBl)' }, mv);
      el('path', { d: 'M-3000 1000H5000', stroke: 'rgba(244,226,176,.5)', 'stroke-width': 1.2, 'vector-effect': 'non-scaling-stroke', fill: 'none' }, mv);
      BL.push({ rot: rot, mv: mv, a: i * 40 });
    }
    box.insertBefore(iris, box.querySelector('.rim'));
    document.body.appendChild(box);
    return box;
  }
  function fit() {
    var d = Math.hypot(innerWidth, innerHeight);
    iris.style.width = iris.style.height = d + 'px';
    iris.style.marginLeft = iris.style.marginTop = (-d / 2) + 'px';
    U = d / 2000;                                   // pixels per unit of the iris
  }
  var OPENED = 1060, SHUT = -30, TW = 34;
  function blades(d0, d1, t0, t1, ms, easing) {
    BL.forEach(function (b) {
      var o = { duration: ms, easing: easing, fill: 'forwards' };
      if (!b.rot.animate) { b.rot.style.transform = 'rotate(' + (b.a + t1) + 'deg)'; b.mv.style.transform = 'translate(0px,' + d1 + 'px)'; return; }
      b.rot.animate([{ transform: 'rotate(' + (b.a + t0) + 'deg)' }, { transform: 'rotate(' + (b.a + t1) + 'deg)' }], o);
      b.mv.animate([{ transform: 'translate(0px,' + d0 + 'px)' }, { transform: 'translate(0px,' + d1 + 'px)' }], o);
    });
  }

  /* ── the sequence ───────────────────────────────────────────────── */
  var busy = false, COOLDOWN = 60e3;
  function lastFull() { try { return +sessionStorage.getItem('lxl-full') || 0; } catch (e) { return 0; } }
  function open(url, kind) {
    if (busy) return; busy = true;
    if (REDUCED) { location.href = url; return; }
    try { var pf = document.createElement('link'); pf.rel = 'prefetch'; pf.href = url; document.head.appendChild(pf); } catch (e) {}
    var b = build(); fit();
    var dst = destination(url), D = DEST[dst.key], name = D.title || humane(dst.file);
    var gone = false;
    function go() { if (gone) return; gone = true; TIMERS.forEach(clearTimeout); TIMERS = []; document.removeEventListener('keydown', key, true); location.href = url; }
    function key(e) { if (e.key === 'Escape' || e.key === 'Enter') { e.preventDefault(); go(); } }
    document.addEventListener('keydown', key, true);
    q(b, '.skip').onclick = go;
    b.onclick = function (e) { if (e.target === b || b.contains(e.target)) go(); };
    q(b, '.dest').textContent = name;
    b.className = 'go';
    var full = kind || Date.now() - lastFull() >= COOLDOWN;

    if (!full) {                                         // brief: shut, name it, go
      b.classList.add('brief');
      blades(OPENED, SHUT, TW, 0, 300, 'cubic-bezier(.7,0,.3,1)');
      play(function (t) { S.sweep(t, 0.26, 3600, 900, 0.08); S.thud(t + 0.27, 0.25, 120); });
      at(440, go);
      return;
    }
    try { sessionStorage.setItem('lxl-full', String(Date.now())); } catch (e) {}
    var sc = SCENES[kind && SCENES[kind] ? kind : D.scene], st = {};
    var portPx = parseFloat(getComputedStyle(q(b, '.port')).width) / 2;
    q(b, '.sc').innerHTML = sc.html(st);
    var ref = 'LX-' + Math.floor(Math.random() * 1679616).toString(36).toUpperCase().padStart(4, '0');
    q(b, '.side.l').innerHTML = '<p>Transit <b>' + ref + '</b></p><p>From <b>' + here() + '</b></p><p>To <b>' + name + '</b></p><p class="nb">A scene between pages · not a security check</p>';
    var line = dst.key === 'home' && st.moon ? st.moon.ph.name + ' · ' + st.moon.ph.percent + '% lit tonight.' : D.line;
    q(b, '.side.r').innerHTML = '<h3>' + name + '</h3>' + (line ? '<p>' + line + '</p>' : '');

    blades(OPENED, portPx / U, TW, 0, 340, 'cubic-bezier(.7,0,.25,1)');      // the iris closes to the porthole
    play(function (t) { S.servo(t, 0.34, 150, 60, 0.04); S.sweep(t, 0.32, 4200, 900, 0.1); S.thud(t + 0.34, 0.32, 120); });
    at(320, function () {
      b.classList.add('on');
      try { sc.run(q(b, '.sc'), st); } catch (e) { if (window.console) console.warn('[lunara-locks]', e); }
    });
    at(320 + sc.dur, function () {                                           // through the porthole
      b.classList.add('fly');
      blades(portPx / U, SHUT, 0, -12, 300, 'cubic-bezier(.7,0,.84,0)');
      play(function (t) { S.sweep(t, 0.32, 500, 5200, 0.12); S.thud(t + 0.3, 0.22, 90); });
    });
    at(320 + sc.dur + 330, go);
  }
  window.addEventListener('pageshow', function (e) { if (e.persisted && box) { box.className = ''; busy = false; } });

  /* ── the switch ─────────────────────────────────────────────────── */
  function soundButton() {
    if (document.getElementById('lxl-snd') || REDUCED) return;
    ensureCss();
    var b = document.createElement('button'); b.id = 'lxl-snd'; b.type = 'button';
    function draw() {
      var on = !muted();
      b.setAttribute('aria-pressed', on ? 'true' : 'false'); b.setAttribute('aria-label', on ? 'Sound on. Turn it off' : 'Sound off. Turn it on'); b.title = on ? 'Sound on' : 'Sound off';
      b.innerHTML = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M2 6h3l4-3v10l-4-3H2z" fill="currentColor"/>' + (on ? '<path d="M11 5.5a3.5 3.5 0 0 1 0 5M12.8 3.5a6 6 0 0 1 0 9"/>' : '<path d="M11 6l4 4M15 6l-4 4"/>') + '</svg>';
    }
    b.addEventListener('click', function () { try { localStorage.setItem('lx-sound', muted() ? '1' : '0'); } catch (e) {} draw(); });
    draw(); document.body.appendChild(b);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', soundButton); else soundButton();

  window.LunaraLocks = { open: open, kinds: KEYS.slice() };
})();
