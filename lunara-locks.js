/* ═══════════════════════════════════════════════════════════════════
   THE LOCKS — what stands between one page and the next
   ═══════════════════════════════════════════════════════════════════

   Leaving a page closes the shutter, and in the middle of it a lock
   opens: a vault door, a combination dial, a keypad, a pin tumbler,
   the seal breaking, an iris, a retina scan or a laser grid. Never the
   same one twice running. Each has its own sound, made here with the
   Web Audio API (no files), and each opens on its own in about two
   seconds: ACCESS GRANTED, the lock folds into a seam of light, and the
   next page opens on that seam (lunara-shell.css draws the opening).

   Sound starts only because the visitor clicked; the speaker button in
   the corner turns it off for good (the same switch as the passport's).
   Reduced motion skips all of it and simply goes. Only the intro waits
   for a click: everything here opens by itself.
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.LunaraLocks) return;
  var REDUCED = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);

  /* ── sound ──────────────────────────────────────────────────────── */
  var A = null, OUT = null, NB = null;
  function muted() { try { return localStorage.getItem('lx-sound') === '0'; } catch (e) { return false; } }
  function audio() {
    if (muted()) return null;
    try {
      if (!A) { A = new (window.AudioContext || window.webkitAudioContext)(); OUT = A.createGain(); OUT.gain.value = 0.55; OUT.connect(A.destination); }
      if (A.state === 'suspended') A.resume();
    } catch (e) { A = null; }
    return A;
  }
  function noise() {
    if (!NB) { var n = A.sampleRate; NB = A.createBuffer(1, n, A.sampleRate); var d = NB.getChannelData(0); for (var i = 0; i < n; i++) d[i] = Math.random() * 2 - 1; }
    return NB;
  }
  function env(g, t, peak, dur) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); }
  var S = {
    click: function (t, f, g, d) {           // a metal tick: filtered noise, very short
      var s = A.createBufferSource(), bp = A.createBiquadFilter(), gn = A.createGain();
      s.buffer = noise(); bp.type = 'bandpass'; bp.frequency.value = f || 3200; bp.Q.value = 9;
      env(gn, t, g || 0.6, d || 0.035); s.connect(bp); bp.connect(gn); gn.connect(OUT); s.start(t, Math.random() * 0.8, (d || 0.035) + 0.02);
    },
    thud: function (t, g) {                   // a heavy bolt
      var o = A.createOscillator(), gn = A.createGain(); o.type = 'sine';
      o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.22);
      env(gn, t, g || 0.6, 0.32); o.connect(gn); gn.connect(OUT); o.start(t); o.stop(t + 0.35);
      S.click(t, 700, 0.5, 0.08);
    },
    beep: function (t, f, d, type, g) {
      var o = A.createOscillator(), gn = A.createGain(); o.type = type || 'sine'; o.frequency.value = f;
      env(gn, t, g || 0.12, d || 0.09); o.connect(gn); gn.connect(OUT); o.start(t); o.stop(t + (d || 0.09) + 0.02);
    },
    whir: function (t, d, f0, f1, g) {        // a motor
      var o = A.createOscillator(), lp = A.createBiquadFilter(), gn = A.createGain(); o.type = 'sawtooth';
      o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + d);
      lp.type = 'lowpass'; lp.frequency.value = 900;
      gn.gain.setValueAtTime(0.0001, t); gn.gain.exponentialRampToValueAtTime(g || 0.08, t + 0.05); gn.gain.setValueAtTime(g || 0.08, t + d - 0.06); gn.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.connect(lp); lp.connect(gn); gn.connect(OUT); o.start(t); o.stop(t + d + 0.02);
    },
    hiss: function (t, d, g) {                // pressure let go
      var s = A.createBufferSource(), hp = A.createBiquadFilter(), gn = A.createGain();
      s.buffer = noise(); s.loop = true; hp.type = 'highpass'; hp.frequency.value = 3000;
      gn.gain.setValueAtTime(g || 0.18, t); gn.gain.exponentialRampToValueAtTime(0.0001, t + d);
      s.connect(hp); hp.connect(gn); gn.connect(OUT); s.start(t); s.stop(t + d + 0.02);
    },
    zap: function (t) {
      var o = A.createOscillator(), gn = A.createGain(); o.type = 'sawtooth';
      o.frequency.setValueAtTime(1400, t); o.frequency.exponentialRampToValueAtTime(90, t + 0.12);
      env(gn, t, 0.09, 0.14); o.connect(gn); gn.connect(OUT); o.start(t); o.stop(t + 0.16);
    },
    shatter: function (t) {
      var s = A.createBufferSource(), hp = A.createBiquadFilter(), gn = A.createGain();
      s.buffer = noise(); hp.type = 'highpass'; hp.frequency.value = 1800;
      env(gn, t, 0.5, 0.5); s.connect(hp); hp.connect(gn); gn.connect(OUT); s.start(t, 0, 0.55);
      [2637, 3729, 5274, 4186].forEach(function (f, i) { S.beep(t + i * 0.012, f, 0.6 - i * 0.1, 'sine', 0.05); });
      S.thud(t, 0.35);
    },
    hum: function (t, d) { S.whir(t, d, 70, 74, 0.05); },
    granted: function (t) { S.beep(t, 1318.5, 0.22, 'sine', 0.12); S.beep(t + 0.11, 1975.5, 0.4, 'sine', 0.12); }
  };
  function play(fn) { var a = audio(); if (!a) return; try { fn(a.currentTime + 0.02); } catch (e) {} }

  /* ── the stage ──────────────────────────────────────────────────── */
  var CSS = [
    '#lxl{position:fixed;inset:0;z-index:2147483600;pointer-events:none;font-family:"IBM Plex Mono",ui-monospace,monospace}',
    '#lxl .h{position:absolute;left:0;right:0;height:50.5vh;background:#030405;transition:transform .34s cubic-bezier(.7,0,.3,1)}',
    '#lxl .h.t{top:0;transform:translateY(-101%)}#lxl .h.b{bottom:0;transform:translateY(101%)}',
    '#lxl.go .h{transform:none}',
    '#lxl .seam{position:absolute;left:0;right:0;top:50%;height:2px;margin-top:-1px;opacity:0;text-decoration:none;',
    '  background:linear-gradient(90deg,transparent,#7FE0B0 20%,#FFF6DC 50%,#E2C47A 80%,transparent);box-shadow:0 0 40px 8px rgba(226,196,122,.45);transition:opacity .2s}',
    '#lxl.go .seam{opacity:.5}#lxl.fold .seam{opacity:1}',
    '#lxl .core{position:absolute;left:50%;top:50%;width:1000px;height:340px;margin:-170px 0 0 -500px;display:grid;grid-template-columns:1fr 340px 1fr;align-items:center;gap:40px;',
    '  opacity:0;transform:scale(.9);filter:blur(6px);transition:opacity .25s ease,transform .35s cubic-bezier(.2,.8,.2,1),filter .3s ease}',
    '#lxl.on .core{opacity:1;transform:none;filter:none}',
    '#lxl.fold .core{transition:transform .22s cubic-bezier(.7,0,.3,1),opacity .22s,filter .22s;transform:scaleY(.02) scaleX(1.25);opacity:0;filter:brightness(3)}',
    '#lxl .lk{width:340px;height:340px;position:relative;perspective:900px}',
    '#lxl .lk svg{width:100%;height:100%;overflow:visible;display:block}',
    '#lxl .side{font-size:11px;line-height:2;letter-spacing:.16em;text-transform:uppercase;color:rgba(214,222,234,.55)}',
    '#lxl .side.l{text-align:right}#lxl .side b{color:#F4ECD8;font-weight:500}',
    '#lxl .side .st{color:#E2C47A}',
    '#lxl .ok{color:#7FE0B0;font-size:22px;letter-spacing:.3em;font-weight:500;opacity:0;transform:translateX(-10px);text-shadow:0 0 18px rgba(127,224,176,.8);transition:opacity .2s,transform .3s}',
    '#lxl.granted .ok{opacity:1;transform:none}',
    '#lxl .code{font-size:16px;letter-spacing:.35em;color:rgba(214,222,234,.35)}#lxl .code i{font-style:normal;transition:color .15s,text-shadow .15s}#lxl .code i.on{color:#7FE0B0;text-shadow:0 0 12px rgba(127,224,176,.9)}',
    '#lxl-snd{position:fixed;left:16px;bottom:16px;z-index:2147483000;width:34px;height:34px;border-radius:50%;border:1px solid rgba(226,196,122,.3);background:rgba(8,10,14,.75);',
    '  color:rgba(226,196,122,.75);cursor:pointer;display:grid;place-items:center;padding:0;opacity:.55;transition:opacity .2s}',
    '#lxl-snd:hover,#lxl-snd:focus-visible{opacity:1}#lxl-snd svg{width:16px;height:16px}',
    /* keypad */
    '#lxl .kp{position:absolute;inset:20px 40px;border-radius:22px;background:linear-gradient(160deg,#1a222c,#0b0f14);border:1px solid rgba(226,196,122,.35);box-shadow:0 30px 60px -20px #000,inset 0 1px 0 rgba(255,255,255,.06);padding:22px}',
    '#lxl .kp .dsp{height:52px;border-radius:10px;background:#050806;border:1px solid rgba(127,224,176,.25);display:flex;justify-content:center;align-items:center;gap:12px;font-size:30px;color:rgba(127,224,176,.35)}',
    '#lxl .kp .dsp i{font-style:normal;width:18px;text-align:center}#lxl .kp .dsp i.on{color:#7FE0B0;text-shadow:0 0 12px #7FE0B0}',
    '#lxl .kp .dsp.ok{box-shadow:0 0 30px rgba(127,224,176,.5);border-color:#7FE0B0}',
    '#lxl .kp .keys{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:18px}',
    '#lxl .kp .keys span{height:38px;border-radius:9px;background:linear-gradient(180deg,#222b36,#151b23);border:1px solid rgba(255,255,255,.07);display:grid;place-items:center;color:#cfd5de;font-size:15px;transition:background .1s,box-shadow .1s,color .1s}',
    '#lxl .kp .keys span.hit{background:#7FE0B0;color:#06120c;box-shadow:0 0 18px #7FE0B0}',
    /* tumbler flip */
    '#lxl .flip{position:absolute;inset:0;transform-style:preserve-3d;transition:transform .35s cubic-bezier(.6,0,.3,1)}',
    '#lxl .flip.turn{transform:rotateY(90deg)}#lxl .flip.done{transform:rotateY(180deg)}',
    '#lxl .flip > svg{position:absolute;inset:0;backface-visibility:hidden}#lxl .flip > svg.back{transform:rotateY(180deg)}'
  ].join('\n');

  var SV = function (inner, defs) {
    return '<svg viewBox="0 0 400 400" aria-hidden="true"><defs>'
      + '<radialGradient id="lxgM" cx="38%" cy="32%" r="80%"><stop offset="0" stop-color="#3a3a36"/><stop offset=".6" stop-color="#15181c"/><stop offset="1" stop-color="#090b0e"/></radialGradient>'
      + '<linearGradient id="lxgG" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#F5DDA0"/><stop offset=".5" stop-color="#C9A55E"/><stop offset="1" stop-color="#7a6236"/></linearGradient>'
      + '<filter id="lxgGl" filterUnits="userSpaceOnUse" x="-60" y="-60" width="520" height="520"><feGaussianBlur stdDeviation="4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>'
      + (defs || '') + '</defs>' + inner + '</svg>';
  };
  var C = 'style="transform-box:view-box;transform-origin:200px 200px"';
  function anim(el, frames, opts) { if (!el || !el.animate) return; return el.animate(frames, Object.assign({ fill: 'forwards', easing: 'cubic-bezier(.5,0,.3,1)' }, opts)); }
  function q(root, s) { return root.querySelector(s); }
  function qa(root, s) { return [].slice.call(root.querySelectorAll(s)); }
  function at(ms, fn) { setTimeout(fn, ms); }
  function ring(n, r, fn) { var o = ''; for (var i = 0; i < n; i++) { var a = i / n * Math.PI * 2; o += fn(200 + Math.cos(a) * r, 200 + Math.sin(a) * r, a * 180 / Math.PI, i); } return o; }

  /* ── the locks ──────────────────────────────────────────────────── */
  var LOCKS = {
    vault: {
      name: 'Vault door · Mk IV', dur: 1450,
      html: function () {
        var bolts = '';
        for (var i = 0; i < 8; i++) bolts += '<g transform="rotate(' + i * 45 + ' 200 200)"><rect class="bolt" x="190" y="12" width="20" height="40" rx="4" fill="url(#lxgG)" stroke="#5c4824"/></g>';
        var spokes = '';
        for (var j = 0; j < 3; j++) spokes += '<g transform="rotate(' + j * 60 + ' 200 200)"><rect x="193" y="92" width="14" height="216" rx="7" fill="url(#lxgG)"/><circle cx="200" cy="92" r="12" fill="#E2C47A"/><circle cx="200" cy="308" r="12" fill="#E2C47A"/></g>';
        return SV('<circle cx="200" cy="200" r="196" fill="#0a0c10" stroke="#5c4824" stroke-width="3"/>' + bolts
          + '<circle cx="200" cy="200" r="158" fill="url(#lxgM)" stroke="url(#lxgG)" stroke-width="4"/>'
          + ring(28, 145, function (x, y) { return '<circle cx="' + x + '" cy="' + y + '" r="3" fill="#8a7240"/>'; })
          + '<circle cx="200" cy="200" r="122" fill="none" stroke="rgba(226,196,122,.3)" stroke-dasharray="3 7"/>'
          + '<g class="wheel" ' + C + '>' + spokes + '<circle cx="200" cy="200" r="38" fill="url(#lxgM)" stroke="url(#lxgG)" stroke-width="5"/><circle cx="200" cy="200" r="12" fill="#E2C47A"/></g>'
          + '<circle class="glow" cx="200" cy="200" r="158" fill="none" stroke="#7FE0B0" stroke-width="3" opacity="0" filter="url(#lxgGl)"/>');
      },
      run: function (root) {
        anim(q(root, '.wheel'), [{ transform: 'rotate(0deg)' }, { transform: 'rotate(540deg)' }], { duration: 900 });
        qa(root, '.bolt').forEach(function (b, i) { anim(b, [{ transform: 'translateY(0)' }, { transform: 'translateY(34px)' }], { duration: 220, delay: 920 + i * 22, easing: 'cubic-bezier(.7,0,.3,1)' }); });
        anim(q(root, '.glow'), [{ opacity: 0 }, { opacity: 1 }], { duration: 250, delay: 1180 });
        play(function (t) { for (var i = 0; i < 16; i++) S.click(t + i * 0.052 * (1 - i / 40), 2600 + (i % 3) * 300, 0.45); S.thud(t + 0.95, 0.55); S.thud(t + 1.06, 0.45); S.hiss(t + 1.15, 0.5, 0.16); });
      }
    },

    dial: {
      name: 'Combination dial', dur: 1500,
      html: function () {
        var ticks = '', nums = '';
        for (var i = 0; i < 40; i++) {
          var a = (i / 40) * Math.PI * 2 - Math.PI / 2, long = i % 5 === 0;
          ticks += '<line x1="' + (200 + Math.cos(a) * 150) + '" y1="' + (200 + Math.sin(a) * 150) + '" x2="' + (200 + Math.cos(a) * (long ? 132 : 140)) + '" y2="' + (200 + Math.sin(a) * (long ? 132 : 140)) + '" stroke="' + (long ? '#F4ECD8' : 'rgba(226,196,122,.6)') + '" stroke-width="' + (long ? 2.5 : 1.2) + '"/>';
          if (long) nums += '<text x="' + (200 + Math.cos(a) * 115) + '" y="' + (205 + Math.sin(a) * 115) + '" text-anchor="middle" font-family="IBM Plex Mono,monospace" font-size="15" fill="#E2C47A">' + i + '</text>';
        }
        return SV('<circle cx="200" cy="200" r="190" fill="#0a0c10" stroke="url(#lxgG)" stroke-width="5"/>'
          + ring(36, 176, function (x, y) { return '<circle cx="' + x + '" cy="' + y + '" r="2.4" fill="#8a7240"/>'; })
          + '<g class="dialg" ' + C + '><circle cx="200" cy="200" r="158" fill="url(#lxgM)" stroke="#C9A55E" stroke-width="2"/>' + ticks + nums
          + '<circle cx="200" cy="200" r="62" fill="url(#lxgM)" stroke="url(#lxgG)" stroke-width="4"/>'
          + ring(24, 56, function (x, y, d) { return '<line x1="' + x + '" y1="' + y + '" x2="' + (200 + (x - 200) * 0.86) + '" y2="' + (200 + (y - 200) * 0.86) + '" stroke="rgba(226,196,122,.5)"/>'; }) + '</g>'
          + '<g class="handle" ' + C + '><rect x="188" y="168" width="24" height="64" rx="10" fill="url(#lxgG)"/></g>'
          + '<path d="M200 6 l-11 -0 l11 22 l11 -22 z" fill="#7FE0B0" filter="url(#lxgGl)"/>');
      },
      code: [24, 8, 36],
      run: function (root, side) {
        var d = q(root, '.dialg');
        anim(d, [{ transform: 'rotate(0deg)' }, { transform: 'rotate(-576deg)', offset: 0.36 }, { transform: 'rotate(-576deg)', offset: 0.42 },
          { transform: 'rotate(-72deg)', offset: 0.72 }, { transform: 'rotate(-72deg)', offset: 0.77 }, { transform: 'rotate(-324deg)' }], { duration: 1150, easing: 'linear' });
        at(420, function () { side.code(0); }); at(830, function () { side.code(1); }); at(1150, function () { side.code(2); });
        anim(q(root, '.handle'), [{ transform: 'rotate(0deg)' }, { transform: 'rotate(90deg)' }], { duration: 220, delay: 1220 });
        play(function (t) {
          var i, k = 0; for (i = 0; i < 14; i++) S.click(t + i * 0.029, 3600, 0.3, 0.02);
          S.click(t + 0.42, 1100, 0.7, 0.06);
          for (i = 0; i < 11; i++) S.click(t + 0.48 + i * 0.03, 3300, 0.3, 0.02);
          S.click(t + 0.83, 1100, 0.7, 0.06);
          for (i = 0; i < 8; i++) S.click(t + 0.89 + i * 0.03, 3600, 0.3, 0.02);
          S.click(t + 1.15, 1100, 0.7, 0.06); S.thud(t + 1.3, 0.5);
        });
      }
    },

    keypad: {
      name: 'Keypad · six digits', dur: 1450,
      html: function () {
        var keys = '123456789*0#'.split('').map(function (k) { return '<span data-k="' + k + '">' + k + '</span>'; }).join('');
        return '<div class="kp"><div class="dsp">' + '<i>0</i><i>0</i><i>0</i><i>0</i><i>0</i><i>0</i>' + '</div><div class="keys">' + keys + '</div></div>';
      },
      run: function (root, side) {
        var digits = [], cells = qa(root, '.dsp i');
        for (var i = 0; i < 6; i++) digits.push(String(Math.floor(Math.random() * 10)));
        side.set(digits.join(' '), true);
        var locked = 0, scr = setInterval(function () { cells.forEach(function (c, j) { if (j >= locked) c.textContent = Math.floor(Math.random() * 10); }); }, 40);
        digits.forEach(function (dg, j) {
          at(300 + j * 150, function () {
            locked = j + 1; cells[j].textContent = dg; cells[j].classList.add('on'); side.code(j);
            var key = q(root, '[data-k="' + dg + '"]'); if (key) { key.classList.add('hit'); setTimeout(function () { key.classList.remove('hit'); }, 120); }
          });
        });
        at(300 + 6 * 150, function () { clearInterval(scr); q(root, '.dsp').classList.add('ok'); });
        play(function (t) { for (var j = 0; j < 6; j++) S.beep(t + 0.3 + j * 0.15, 880 + j * 110, 0.07, 'square', 0.05); S.click(t + 1.25, 900, 0.6, 0.06); });
      }
    },

    tumbler: {
      name: 'Pin tumbler · five pins', dur: 1500,
      html: function () {
        var pins = '', teeth = '';
        for (var i = 0; i < 5; i++) {
          var x = 118 + i * 44, kh = 40 + ((i * 13) % 4) * 6, top = 232 - kh;
          pins += '<g class="pin" data-up="' + (82 - kh) + '">'
            + '<path d="M' + (x - 7) + ' 98 l14 -7 l-14 -7 l14 -7 l-14 -7" stroke="#8a7240" fill="none" stroke-width="2"/>'
            + '<rect x="' + (x - 9) + '" y="100" width="18" height="' + (top - 100) + '" rx="4" fill="url(#lxgG)"/>'
            + '<rect x="' + (x - 9) + '" y="' + top + '" width="18" height="' + kh + '" rx="4" fill="#cfd5de"/></g>';
          teeth += 'M' + (x - 13) + ' 232 L' + x + ' ' + (150 + kh) + ' L' + (x + 13) + ' 232 Z ';
        }
        var front = SV('<circle cx="200" cy="200" r="150" fill="url(#lxgM)" stroke="url(#lxgG)" stroke-width="6"/>'
          + '<circle cx="200" cy="200" r="96" fill="#0d1116" stroke="#C9A55E" stroke-width="3"/>'
          + ring(16, 122, function (x, y) { return '<circle cx="' + x + '" cy="' + y + '" r="3" fill="#8a7240"/>'; })
          + '<g class="plug" ' + C + '><circle cx="200" cy="168" r="20" fill="#030405"/><path d="M188 176 h24 l10 78 h-44 z" fill="#030405"/>'
          + '<rect x="193" y="150" width="14" height="96" rx="3" fill="#cfd5de"/><circle cx="200" cy="140" r="16" fill="none" stroke="#cfd5de" stroke-width="6"/></g>');
        front = front.replace('<svg ', '<svg class="back" ');
        var side = SV('<clipPath id="lxtc"><rect x="0" y="0" width="400" height="400"/></clipPath>'
          + '<rect x="70" y="16" width="280" height="290" rx="22" fill="url(#lxgM)" stroke="url(#lxgG)" stroke-width="4"/>'
          + '<rect x="78" y="150" width="264" height="140" rx="14" fill="#11161c" stroke="rgba(226,196,122,.4)"/>'
          + '<rect x="78" y="226" width="264" height="44" fill="#07090c"/>'
          + pins
          + '<line x1="78" y1="150" x2="342" y2="150" stroke="#7FE0B0" stroke-width="1.5" stroke-dasharray="6 6" filter="url(#lxgGl)"/>'
          + '<text x="336" y="144" text-anchor="end" font-family="IBM Plex Mono,monospace" font-size="10" letter-spacing="2" fill="rgba(127,224,176,.8)">SHEAR LINE</text>'
          + '<g clip-path="url(#lxtc)"><g class="key"><path d="M70 232 h268 l12 12 l-12 12 h-268 z ' + teeth + '" fill="#d9dee6"/>'
          + '<circle cx="40" cy="244" r="22" fill="none" stroke="#d9dee6" stroke-width="10"/></g></g>');
        return '<div class="flip">' + side + front + '</div>';
      },
      run: function (root) {
        var key = q(root, '.key'), flip = q(root, '.flip');
        anim(key, [{ transform: 'translateX(-300px)' }, { transform: 'translateX(0)' }], { duration: 600, easing: 'cubic-bezier(.3,.6,.3,1)' });
        qa(root, '.pin').forEach(function (p, i) { anim(p, [{ transform: 'translateY(0)' }, { transform: 'translateY(-' + p.getAttribute('data-up') + 'px)' }], { duration: 110, delay: 330 + i * 60, easing: 'cubic-bezier(.3,1.6,.5,1)' }); });
        at(800, function () { flip.classList.add('turn'); });
        at(960, function () { flip.classList.add('done'); });
        anim(q(root, '.plug'), [{ transform: 'rotate(0deg)' }, { transform: 'rotate(90deg)' }], { duration: 260, delay: 1180, easing: 'cubic-bezier(.6,0,.3,1)' });
        play(function (t) { S.whir(t, 0.55, 300, 520, 0.03); for (var i = 0; i < 5; i++) S.click(t + 0.34 + i * 0.06, 4200 - i * 200, 0.5, 0.03); S.click(t + 0.82, 1800, 0.4, 0.05); S.click(t + 1.2, 1300, 0.7, 0.05); S.thud(t + 1.4, 0.45); });
      }
    },

    seal: {
      name: 'Seal of the register', dur: 1350,
      html: function () {
        var shards = [
          'M200 200 L200 0 L400 0 L400 170 Z', 'M200 200 L400 170 L400 400 L250 400 Z', 'M200 200 L250 400 L0 400 L0 300 Z',
          'M200 200 L0 300 L0 60 Z', 'M200 200 L0 60 L0 0 L200 0 Z'
        ];
        var clips = shards.map(function (d, i) { return '<clipPath id="lxs' + i + '"><path d="' + d + '"/></clipPath>'; }).join('');
        var pieces = shards.map(function (d, i) {
          return '<g class="shard" data-i="' + i + '" clip-path="url(#lxs' + i + ')"><image href="/lunara_emblem_256.png" x="10" y="10" width="380" height="380"/></g>';
        }).join('');
        return SV('<circle class="burst" cx="200" cy="200" r="40" fill="#FFF6DC" opacity="0" filter="url(#lxgGl)" ' + C + '/>' + pieces
          + '<path class="crack" d="M200 200 L214 120 L198 70 L206 0 M200 200 L290 180 L340 200 L400 170 M200 200 L230 300 L250 400 M200 200 L120 250 L60 280 L0 300 M200 200 L130 140 L60 90 L0 60" fill="none" stroke="#FFF6DC" stroke-width="2.5" stroke-dasharray="600" stroke-dashoffset="600" filter="url(#lxgGl)"/>', clips);
      },
      run: function (root) {
        anim(q(root, '.crack'), [{ strokeDashoffset: 600 }, { strokeDashoffset: 0 }], { duration: 600, easing: 'steps(6, end)' });
        var dirs = [[60, -120], [140, 40], [-30, 150], [-150, 30], [-90, -110]];
        qa(root, '.shard').forEach(function (s, i) {
          anim(s, [{ transform: 'translate(0,0) rotate(0deg)', opacity: 1 }, { transform: 'translate(' + dirs[i][0] + 'px,' + dirs[i][1] + 'px) rotate(' + (i % 2 ? 24 : -20) + 'deg)', opacity: 0 }], { duration: 520, delay: 720, easing: 'cubic-bezier(.2,.7,.2,1)' });
        });
        anim(q(root, '.burst'), [{ opacity: 0, transform: 'scale(.3)' }, { opacity: 1, transform: 'scale(2.6)', offset: 0.4 }, { opacity: 0, transform: 'scale(4)' }], { duration: 640, delay: 700 });
        play(function (t) { S.click(t + 0.08, 2400, 0.7, 0.05); S.click(t + 0.3, 2000, 0.8, 0.05); S.click(t + 0.52, 2800, 0.8, 0.05); S.shatter(t + 0.72); });
      }
    },

    iris: {
      name: 'Iris aperture', dur: 1350,
      html: function () {
        var blades = '';
        for (var i = 0; i < 8; i++) blades += '<g transform="rotate(' + i * 45 + ' 200 200)"><path class="blade" d="M200 36 C260 50 300 90 310 120 L205 212 C170 190 150 160 146 130 Z" fill="url(#lxgM)" stroke="url(#lxgG)" stroke-width="2" style="transform-box:fill-box;transform-origin:33% 0%"/></g>';
        return SV('<circle class="light" cx="200" cy="200" r="150" fill="#FFF6DC" opacity=".08" filter="url(#lxgGl)" ' + C + '/>'
          + '<clipPath id="lxic"><circle cx="200" cy="200" r="176"/></clipPath>'
          + '<g class="blades" clip-path="url(#lxic)">' + blades + '</g>'
          + '<g class="collar" ' + C + '><circle cx="200" cy="200" r="182" fill="none" stroke="url(#lxgG)" stroke-width="22"/>'
          + ring(12, 182, function (x, y) { return '<circle cx="' + x + '" cy="' + y + '" r="5" fill="#3a2f18"/>'; }) + '</g>');
      },
      run: function (root) {
        anim(q(root, '.collar'), [{ transform: 'rotate(0deg)' }, { transform: 'rotate(-18deg)' }], { duration: 300, easing: 'cubic-bezier(.6,0,.3,1)' });
        qa(root, '.blade').forEach(function (b) { anim(b, [{ transform: 'rotate(0deg)' }, { transform: 'rotate(-78deg)' }], { duration: 650, delay: 360, easing: 'cubic-bezier(.5,0,.2,1)' }); });
        anim(q(root, '.light'), [{ opacity: 0.08, transform: 'scale(.6)' }, { opacity: 0.9, transform: 'scale(1)' }], { duration: 600, delay: 450 });
        play(function (t) { S.click(t + 0.05, 2200, 0.6, 0.04); S.click(t + 0.2, 2600, 0.6, 0.04); S.click(t + 0.31, 1600, 0.7, 0.05); S.whir(t + 0.36, 0.65, 180, 620, 0.08); S.click(t + 1.02, 1200, 0.8, 0.07); S.thud(t + 1.04, 0.3); });
      }
    },

    retina: {
      name: 'Retina · passport control', dur: 1500,
      html: function () {
        var fibres = '';
        for (var i = 0; i < 72; i++) { var a = i / 72 * Math.PI * 2, r1 = 34 + (i % 3) * 3, r2 = 70 + ((i * 7) % 5) * 4; fibres += '<line x1="' + (200 + Math.cos(a) * r1) + '" y1="' + (200 + Math.sin(a) * r1) + '" x2="' + (200 + Math.cos(a) * r2) + '" y2="' + (200 + Math.sin(a) * r2) + '" stroke="rgba(127,224,176,' + (0.25 + (i % 4) * 0.12) + ')" stroke-width="1.2"/>'; }
        var marks = '';
        [[170, 168], [236, 182], [214, 246], [158, 226], [246, 220], [190, 150]].forEach(function (p, i) { marks += '<g class="mk" opacity="0"><path d="M' + (p[0] - 7) + ' ' + p[1] + ' h14 M' + p[0] + ' ' + (p[1] - 7) + ' v14" stroke="#E2C47A" stroke-width="1.5"/><circle cx="' + p[0] + '" cy="' + p[1] + '" r="9" fill="none" stroke="#E2C47A" stroke-width="1"/></g>'; });
        return SV('<path d="M20 200 Q200 40 380 200 Q200 360 20 200 Z" fill="#05090a" stroke="rgba(127,224,176,.55)" stroke-width="2"/>'
          + '<circle cx="200" cy="200" r="96" fill="#0b1615" stroke="rgba(127,224,176,.7)" stroke-width="2"/>' + fibres
          + '<circle cx="200" cy="200" r="32" fill="#020404"/><circle cx="188" cy="188" r="7" fill="rgba(255,255,255,.6)"/>'
          + '<g opacity=".35">' + [0, 1, 2, 3, 4, 5, 6, 7, 8].map(function (k) { return '<line x1="' + (40 + k * 40) + '" y1="80" x2="' + (40 + k * 40) + '" y2="320" stroke="rgba(127,224,176,.25)"/>'; }).join('') + '</g>'
          + marks + '<circle class="prog" cx="200" cy="200" r="118" fill="none" stroke="#7FE0B0" stroke-width="3" stroke-dasharray="741" stroke-dashoffset="741" transform="rotate(-90 200 200)" filter="url(#lxgGl)"/>'
          + '<rect class="laser" x="10" y="78" width="380" height="3" fill="#BFFFE6" filter="url(#lxgGl)"/>');
      },
      run: function (root, side) {
        anim(q(root, '.laser'), [{ transform: 'translateY(0)' }, { transform: 'translateY(240px)' }, { transform: 'translateY(0)' }, { transform: 'translateY(240px)', opacity: 0 }], { duration: 1150, easing: 'ease-in-out' });
        anim(q(root, '.prog'), [{ strokeDashoffset: 741 }, { strokeDashoffset: 0 }], { duration: 1150, easing: 'linear' });
        qa(root, '.mk').forEach(function (m, i) { anim(m, [{ opacity: 0 }, { opacity: 1 }], { duration: 120, delay: 250 + i * 140 }); });
        var p0 = performance.now();
        (function pct(now) { var k = Math.min(1, (now - p0) / 1150); side.set('MATCH ' + (k * 99.97).toFixed(2) + '%'); if (k < 1) requestAnimationFrame(pct); })(p0);
        play(function (t) { S.hum(t, 1.15); for (var i = 0; i < 6; i++) S.beep(t + 0.25 + i * 0.14, 2093, 0.05, 'sine', 0.06); });
      }
    },

    lasers: {
      name: 'Laser grid · seven beams', dur: 1400,
      html: function () {
        var beams = '';
        for (var i = 0; i < 7; i++) beams += '<rect class="beam" x="40" width="320" y="' + (78 + i * 40) + '" height="4" rx="2" fill="#FF3B4E" filter="url(#lxgGl)"/>';
        return SV('<rect x="20" y="40" width="360" height="320" rx="16" fill="rgba(8,10,14,.6)" stroke="url(#lxgG)" stroke-width="3"/>'
          + '<rect x="24" y="60" width="16" height="280" rx="4" fill="url(#lxgM)" stroke="#5c4824"/><rect x="360" y="60" width="16" height="280" rx="4" fill="url(#lxgM)" stroke="#5c4824"/>'
          + beams + '<text class="st" x="200" y="34" text-anchor="middle" font-family="IBM Plex Mono,monospace" font-size="13" letter-spacing="4" fill="#FF6B78">ARMED</text>');
      },
      run: function (root) {
        var beams = qa(root, '.beam');
        beams.forEach(function (b, i) {
          at(180 + i * 130, function () { b.setAttribute('fill', '#7FE0B0'); anim(b, [{ opacity: 1 }, { opacity: 1, offset: 0.4 }, { opacity: 0 }], { duration: 300 }); });
        });
        at(180 + 7 * 130, function () { var s = q(root, '.st'); s.textContent = 'DISARMED'; s.setAttribute('fill', '#7FE0B0'); });
        play(function (t) { for (var i = 0; i < 7; i++) S.zap(t + 0.18 + i * 0.13); S.click(t + 1.1, 1500, 0.6, 0.05); });
      }
    }
  };
  var ORDER = ['vault', 'dial', 'keypad', 'tumbler', 'seal', 'iris', 'retina', 'lasers'];

  /* ── the sequence ───────────────────────────────────────────────── */
  var box = null, busy = false;
  function build() {
    if (box) return box;
    var st = document.createElement('style'); st.id = 'lxl-css'; st.textContent = CSS; document.head.appendChild(st);
    box = document.createElement('div'); box.id = 'lxl'; box.setAttribute('aria-hidden', 'true');
    box.innerHTML = '<i class="h t"></i><i class="h b"></i><s class="seam"></s><div class="core"><div class="side l"></div><div class="lk"></div><div class="side r"></div></div>';
    document.body.appendChild(box);
    return box;
  }
  function pick() {
    var last = ''; try { last = sessionStorage.getItem('lxl-last') || ''; } catch (e) {}
    var pool = ORDER.filter(function (k) { return k !== last; });
    var k = pool[Math.floor(Math.random() * pool.length)];
    try { sessionStorage.setItem('lxl-last', k); } catch (e) {}
    return k;
  }
  function open(url, kind) {
    if (busy) return; busy = true;
    if (REDUCED) { location.href = url; return; }
    try { var pf = document.createElement('link'); pf.rel = 'prefetch'; pf.href = url; document.head.appendChild(pf); } catch (e) {}
    var b = build(), lock = LOCKS[kind && LOCKS[kind] ? kind : pick()];
    var dest = (new URL(url, location.href).pathname || '/').replace(/\.html$/, '') || '/';
    var serial = 'LX-' + Math.floor(Math.random() * 1e6).toString(36).toUpperCase().padStart(4, '0');
    var codeHtml = lock.code ? '<p class="code">' + lock.code.map(function (n) { return '<i>' + String(n).padStart(2, '0') + '</i>'; }).join(' · ') + '</p>' : '<p class="code"></p>';
    q(b, '.side.l').innerHTML = '<p>Lunara · passport control</p><p>Gate <b>' + dest.toUpperCase() + '</b></p><p>Lock <b>' + lock.name + '</b></p><p>Ref ' + serial + '</p>';
    q(b, '.side.r').innerHTML = '<p class="st">Authenticating…</p>' + codeHtml + '<p class="ok">Access granted</p>';
    q(b, '.lk').innerHTML = lock.html();
    var side = {
      code: function (i) { var c = qa(b, '.side.r .code i')[i]; if (c) c.classList.add('on'); },
      set: function (txt, digits) {
        var c = q(b, '.side.r .code'); if (!c) return;
        if (digits) c.innerHTML = txt.split(' ').map(function (d) { return '<i>' + d + '</i>'; }).join(' ');
        else c.textContent = txt;
      }
    };
    b.className = '';
    void b.offsetWidth;
    b.classList.add('go');
    play(function (t) { S.whir(t, 0.3, 90, 50, 0.05); S.thud(t + 0.3, 0.35); });  // the shutter meets
    at(300, function () {
      b.classList.add('on');
      try { lock.run(q(b, '.lk'), side); } catch (e) {}
    });
    at(300 + lock.dur, function () { b.classList.add('granted'); q(b, '.side.r .st').textContent = 'Verified'; play(function (t) { S.granted(t); }); });
    at(300 + lock.dur + 380, function () { b.classList.add('fold'); });
    at(300 + lock.dur + 560, function () { location.href = url; });
  }
  // Back through the history: the page comes back as it was left.
  window.addEventListener('pageshow', function (e) { if (e.persisted && box) { box.className = ''; busy = false; } });

  /* ── the switch ─────────────────────────────────────────────────── */
  function soundButton() {
    if (document.getElementById('lxl-snd') || REDUCED) return;
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

  window.LunaraLocks = { open: open, kinds: ORDER.slice() };
})();
