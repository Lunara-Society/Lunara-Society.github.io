/* ═══════════════════════════════════════════════════════════════════
   THE LOCKS — what stands between one page and the next
   ═══════════════════════════════════════════════════════════════════

   Leaving a page closes the shutter, and in its centre a lock opens:
   a quantum ring vault, a titanium safe door, a cryptex, a clearance
   card reader, a palm-vein scanner, iris recognition, a genome lock, a
   containment core or a quantum handshake. Never the same one twice
   running. Each is built from layered metal, glass and light (CSS
   gradients, SVG, a little canvas), seen through a slightly tilted
   camera, and each has its own sound, synthesized here with the Web
   Audio API (no files). Every one opens by itself in about two seconds:
   ACCESS GRANTED, the lock folds into a seam of light, and the next page
   opens on that seam (lunara-shell.css draws the opening).

   Sound starts only because the visitor clicked; the speaker button in
   the corner turns it off for good. Reduced motion skips all of it.
   Only the intro waits for a click: everything here opens by itself.
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
      if (!A) {
        A = new (window.AudioContext || window.webkitAudioContext)();
        var comp = A.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 6;
        OUT = A.createGain(); OUT.gain.value = 0.6; OUT.connect(comp); comp.connect(A.destination);
      }
      if (A.state === 'suspended') A.resume();
    } catch (e) { A = null; }
    return A;
  }
  function noise() {
    if (!NB) { var n = A.sampleRate * 2; NB = A.createBuffer(1, n, A.sampleRate); var d = NB.getChannelData(0); for (var i = 0; i < n; i++) d[i] = Math.random() * 2 - 1; }
    return NB;
  }
  function env(g, t, peak, dur) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); }
  function src(type, f) { var o = A.createOscillator(); o.type = type; o.frequency.value = f; return o; }
  var S = {
    click: function (t, f, g, d) {
      var s = A.createBufferSource(), bp = A.createBiquadFilter(), gn = A.createGain();
      s.buffer = noise(); bp.type = 'bandpass'; bp.frequency.value = f || 3200; bp.Q.value = 9;
      env(gn, t, g || 0.6, d || 0.035); s.connect(bp); bp.connect(gn); gn.connect(OUT); s.start(t, Math.random(), (d || 0.035) + 0.02);
    },
    thud: function (t, g) {
      var o = src('sine', 120), gn = A.createGain();
      o.frequency.setValueAtTime(130, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.25);
      env(gn, t, g || 0.6, 0.35); o.connect(gn); gn.connect(OUT); o.start(t); o.stop(t + 0.38);
      S.click(t, 650, 0.45, 0.09);
    },
    boom: function (t, g) {
      var o = src('sine', 70), gn = A.createGain();
      o.frequency.setValueAtTime(75, t); o.frequency.exponentialRampToValueAtTime(28, t + 0.9);
      env(gn, t, g || 0.7, 1.1); o.connect(gn); gn.connect(OUT); o.start(t); o.stop(t + 1.15);
    },
    beep: function (t, f, d, type, g) {
      var o = src(type || 'sine', f), gn = A.createGain();
      env(gn, t, g || 0.1, d || 0.09); o.connect(gn); gn.connect(OUT); o.start(t); o.stop(t + (d || 0.09) + 0.02);
    },
    servo: function (t, d, f0, f1, g) {
      var o = src('sawtooth', f0), o2 = src('square', f0 * 1.5), lp = A.createBiquadFilter(), gn = A.createGain();
      o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + d);
      o2.frequency.setValueAtTime(f0 * 1.5, t); o2.frequency.exponentialRampToValueAtTime(f1 * 1.5, t + d);
      lp.type = 'lowpass'; lp.frequency.value = 1100; lp.Q.value = 3;
      gn.gain.setValueAtTime(0.0001, t); gn.gain.exponentialRampToValueAtTime(g || 0.06, t + 0.04); gn.gain.setValueAtTime(g || 0.06, t + d - 0.05); gn.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.connect(lp); o2.connect(lp); lp.connect(gn); gn.connect(OUT); o.start(t); o2.start(t); o.stop(t + d + 0.02); o2.stop(t + d + 0.02);
    },
    hiss: function (t, d, g, f) {
      var s = A.createBufferSource(), hp = A.createBiquadFilter(), gn = A.createGain();
      s.buffer = noise(); hp.type = 'highpass'; hp.frequency.value = f || 2600;
      gn.gain.setValueAtTime(0.0001, t); gn.gain.exponentialRampToValueAtTime(g || 0.2, t + 0.03); gn.gain.exponentialRampToValueAtTime(0.0001, t + d);
      s.connect(hp); hp.connect(gn); gn.connect(OUT); s.start(t, Math.random()); s.stop(t + d + 0.02);
    },
    sweep: function (t, d, f0, f1, g) {                   // a card in a slot, air past a door
      var s = A.createBufferSource(), bp = A.createBiquadFilter(), gn = A.createGain();
      s.buffer = noise(); bp.type = 'bandpass'; bp.Q.value = 2;
      bp.frequency.setValueAtTime(f0, t); bp.frequency.exponentialRampToValueAtTime(f1, t + d);
      gn.gain.setValueAtTime(0.0001, t); gn.gain.exponentialRampToValueAtTime(g || 0.25, t + d * 0.3); gn.gain.exponentialRampToValueAtTime(0.0001, t + d);
      s.connect(bp); bp.connect(gn); gn.connect(OUT); s.start(t, Math.random()); s.stop(t + d + 0.02);
    },
    creak: function (t, d) {                              // a heavy door on its hinge
      var o = src('sawtooth', 55), bp = A.createBiquadFilter(), gn = A.createGain();
      o.frequency.setValueAtTime(48, t); o.frequency.linearRampToValueAtTime(70, t + d);
      bp.type = 'bandpass'; bp.frequency.setValueAtTime(380, t); bp.frequency.linearRampToValueAtTime(900, t + d); bp.Q.value = 12;
      gn.gain.setValueAtTime(0.0001, t); gn.gain.exponentialRampToValueAtTime(0.18, t + 0.08); gn.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.connect(bp); bp.connect(gn); gn.connect(OUT); o.start(t); o.stop(t + d + 0.02);
    },
    data: function (t, d, n) {                            // a stream of telemetry
      for (var i = 0; i < (n || 12); i++) S.beep(t + i * (d / (n || 12)), 1800 + Math.random() * 2400, 0.018, 'square', 0.025);
    },
    crackle: function (t, d) { for (var i = 0; i < 14; i++) S.click(t + Math.random() * d, 5000 + Math.random() * 3000, 0.35, 0.012); },
    whine: function (t, d, f0, f1) {
      var o = src('sine', f0), gn = A.createGain(); o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + d);
      gn.gain.setValueAtTime(0.0001, t); gn.gain.exponentialRampToValueAtTime(0.07, t + d * 0.8); gn.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.05);
      o.connect(gn); gn.connect(OUT); o.start(t); o.stop(t + d + 0.08);
    },
    hum: function (t, d) { S.servo(t, d, 68, 72, 0.04); },
    granted: function (t) { S.beep(t, 1318.5, 0.22, 'sine', 0.11); S.beep(t + 0.11, 1975.5, 0.42, 'sine', 0.11); }
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
    '#lxl.go .seam{opacity:.35}#lxl.fold .seam{opacity:1}',
    '#lxl .core{position:absolute;left:50%;top:50%;width:1040px;height:400px;margin:-200px 0 0 -520px;display:grid;grid-template-columns:1fr 400px 1fr;align-items:center;gap:36px;',
    '  opacity:0;transform:scale(.92);filter:blur(6px);transition:opacity .25s ease,transform .35s cubic-bezier(.2,.8,.2,1),filter .3s ease}',
    '#lxl.on .core{opacity:1;transform:none;filter:none}',
    '#lxl.fold .core{transition:transform .22s cubic-bezier(.7,0,.3,1),opacity .22s,filter .22s;transform:scaleY(.02) scaleX(1.25);opacity:0;filter:brightness(3)}',
    '#lxl .lk{width:400px;height:400px;position:relative;perspective:1100px}',
    '#lxl .lk::before{content:"";position:absolute;left:8%;right:8%;bottom:-6%;height:16%;border-radius:50%;background:radial-gradient(closest-side,rgba(127,224,176,.22),transparent);filter:blur(4px)}',
    '#lxl .lk::after{content:"";position:absolute;inset:-12%;border-radius:50%;background:radial-gradient(closest-side,rgba(226,196,122,.10),transparent 70%);z-index:-1}',
    '#lxl .lk svg{overflow:visible;display:block}',
    '#lxl .side{font-size:11px;line-height:2;letter-spacing:.16em;text-transform:uppercase;color:rgba(214,222,234,.55)}',
    '#lxl .side.l{text-align:right}#lxl .side b{color:#F4ECD8;font-weight:500}#lxl .side .st{color:#E2C47A}',
    '#lxl .side .ok{color:#7FE0B0;font-size:22px;letter-spacing:.3em;font-weight:500;opacity:0;transform:translateX(-10px);text-shadow:0 0 18px rgba(127,224,176,.8);transition:opacity .2s,transform .3s}',
    '#lxl.granted .side .ok{opacity:1;transform:none}',
    '#lxl .side .code{font-size:15px;letter-spacing:.3em;white-space:nowrap;color:rgba(214,222,234,.4);min-height:2em}#lxl .side .code i{font-style:normal;transition:color .15s,text-shadow .15s}#lxl .side .code i.on{color:#7FE0B0;text-shadow:0 0 12px rgba(127,224,176,.9)}',
    '#lxl-snd{position:fixed;left:16px;bottom:16px;z-index:2147483000;width:34px;height:34px;border-radius:50%;border:1px solid rgba(226,196,122,.3);background:rgba(8,10,14,.75);',
    '  color:rgba(226,196,122,.75);cursor:pointer;display:grid;place-items:center;padding:0;opacity:.55;transition:opacity .2s}',
    '#lxl-snd:hover,#lxl-snd:focus-visible{opacity:1}#lxl-snd svg{width:16px;height:16px}',
    '#lxl .fx{position:absolute;inset:-20%;width:140%;height:140%;pointer-events:none;z-index:20}',

    /* materials */
    '#lxl .steel{background:radial-gradient(120% 120% at 30% 22%,rgba(255,255,255,.42),rgba(255,255,255,0) 38%),repeating-conic-gradient(from 7deg,#5b6168 0deg 2deg,#99a0a9 3.5deg 5deg,#6a7078 6.5deg 8deg,#b7bec7 9.5deg 11deg,#5f656c 12.5deg 14deg)}',
    '#lxl .gold{background:radial-gradient(120% 120% at 30% 22%,rgba(255,250,230,.5),rgba(255,255,255,0) 38%),repeating-conic-gradient(from 3deg,#6e5320 0deg 2deg,#d6b468 3.5deg 5deg,#8f7031 6.5deg 8deg,#f3dc9c 9.5deg 11deg,#7a5e27 12.5deg 14deg)}',
    '#lxl .dark{background:radial-gradient(circle at 38% 30%,#2c323a,#0b0d10 72%)}',
    '#lxl .brushed{background:linear-gradient(125deg,rgba(255,255,255,.28),rgba(255,255,255,0) 35%,rgba(0,0,0,.25) 70%,rgba(255,255,255,.12)),repeating-linear-gradient(0deg,#7a8088 0 1px,#9aa1aa 1px 2px,#858b93 2px 3px,#a7aeb7 3px 4px)}',
    '#lxl .chrome{background:linear-gradient(180deg,#f5f7fa 0%,#9aa3ad 22%,#4a525c 48%,#c9d0d8 52%,#7b848e 78%,#e8ecf0 100%)}',
    '#lxl .bevel{box-shadow:inset 0 2px 2px rgba(255,255,255,.35),inset 0 -4px 8px rgba(0,0,0,.65),0 14px 30px rgba(0,0,0,.75)}',
    '#lxl .deep{box-shadow:inset 0 6px 14px rgba(0,0,0,.85),inset 0 -2px 2px rgba(255,255,255,.15)}',
    '#lxl .knurl{background:repeating-linear-gradient(90deg,#6e5320 0 3px,#f3dc9c 3px 5px,#a8873f 5px 8px),linear-gradient(180deg,#000,transparent)}',
    '#lxl .abs{position:absolute}#lxl .cc{left:50%;top:50%;transform:translate(-50%,-50%)}#lxl .round{border-radius:50%}',

    /* quantum ring vault */
    '#lxl .qv{position:absolute;inset:0;transform-style:preserve-3d;transform:rotateX(16deg) rotateY(-12deg);transition:transform 1.6s cubic-bezier(.2,.8,.2,1)}',
    '#lxl .qv.on{transform:rotateX(4deg) rotateY(0)}',
    '#lxl .qv .ring{position:absolute;left:50%;top:50%;border-radius:50%}',
    '#lxl .qv .ring svg{position:absolute;inset:0;width:100%;height:100%}',
    '#lxl .qv .notch{fill:#1d2a2a;stroke:rgba(127,224,176,.4);transition:fill .15s,filter .15s}',
    '#lxl .qv .ring.lit .notch{fill:#7FE0B0;filter:drop-shadow(0 0 6px #7FE0B0)}',
    '#lxl .qv .pis{position:absolute;left:50%;top:50%;width:22px;height:46px;margin:-23px 0 0 -11px;border-radius:5px}',
    '#lxl .qv .chev{fill:#3a2f18;stroke:#E2C47A;stroke-width:1.5;transition:fill .12s,filter .12s}',
    '#lxl .qv .chev.on{fill:#7FE0B0;filter:drop-shadow(0 0 8px #7FE0B0)}',
    '#lxl .qv .hub img{width:100%;height:100%;border-radius:50%;filter:contrast(1.1)}',

    /* titan safe */
    '#lxl .sf{position:absolute;left:30px;top:40px;width:340px;height:320px;transform-style:preserve-3d;transform:rotateY(-14deg) rotateX(6deg)}',
    '#lxl .sf-frame{position:absolute;inset:-14px;border-radius:14px}',
    '#lxl .sf-in{position:absolute;inset:6px;border-radius:6px;background:radial-gradient(circle at 50% 50%,#FFF6DC 0,#E2C47A 18%,#5a4518 50%,#0a0805 80%);overflow:hidden}',
    '#lxl .sf-in::after{content:"";position:absolute;inset:0;background:repeating-linear-gradient(0deg,transparent 0 58px,rgba(0,0,0,.45) 58px 62px)}',
    '#lxl .sf-door{position:absolute;inset:0;border-radius:8px;transform-origin:0 50%;transform-style:preserve-3d}',
    '#lxl .sf-door .rv{position:absolute;width:9px;height:9px;border-radius:50%;background:radial-gradient(circle at 35% 30%,#fff,#7b848e 60%,#2a2f35);box-shadow:0 1px 1px rgba(0,0,0,.6)}',
    '#lxl .sf-led{position:absolute;left:50%;top:22px;transform:translateX(-50%);padding:6px 12px;border-radius:6px;background:#050806;border:1px solid rgba(127,224,176,.35);font-size:18px;letter-spacing:.3em;color:#ff5a5a;text-shadow:0 0 10px currentColor}',
    '#lxl .sf-led.ok{color:#7FE0B0}',
    '#lxl .sf-dial{position:absolute;left:44px;top:96px;width:150px;height:150px;border-radius:50%}',
    '#lxl .sf-dial svg{position:absolute;inset:0;width:100%;height:100%}',
    '#lxl .sf-wheel{position:absolute;left:226px;top:122px;width:96px;height:96px}',
    '#lxl .sf-bolt{position:absolute;right:-30px;width:46px;height:16px;border-radius:8px}',

    /* cryptex */
    '#lxl .cx{position:absolute;left:0;right:0;top:100px;height:200px;transform-style:preserve-3d;transform:rotateX(18deg) rotateY(-8deg);display:flex;align-items:center}',
    '#lxl .cx-cap{width:50px;height:178px;border-radius:12px;position:relative;box-shadow:inset 0 10px 14px rgba(255,255,255,.25),inset 0 -14px 18px rgba(0,0,0,.7),0 14px 26px rgba(0,0,0,.7)}',
    '#lxl .cx-cap::after{content:"";position:absolute;inset:0;border-radius:12px;background:linear-gradient(180deg,rgba(0,0,0,.6),transparent 30%,transparent 70%,rgba(0,0,0,.7))}',
    '#lxl .cx-body{flex:1;height:156px;display:flex;gap:4px;padding:0 4px;position:relative;background:#0c0e11;border-top:2px solid #8f7031;border-bottom:2px solid #8f7031}',
    '#lxl .cx-drum{flex:1;height:156px;overflow:hidden;position:relative;border-radius:4px;background:linear-gradient(180deg,#2a2f35,#9aa1aa 30%,#e3e7ec 50%,#9aa1aa 70%,#2a2f35)}',
    '#lxl .cx-strip{position:absolute;left:0;right:0;top:0;will-change:transform}',
    '#lxl .cx-strip b{display:block;height:52px;line-height:52px;text-align:center;font:600 40px "Cormorant Garamond",Georgia,serif;color:#2b2416;text-shadow:0 1px 0 rgba(255,255,255,.6)}',
    '#lxl .cx-drum::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.75),transparent 34%,transparent 66%,rgba(0,0,0,.75));pointer-events:none}',
    '#lxl .cx-line{position:absolute;left:0;right:0;top:50%;height:54px;margin-top:-27px;border-top:1px solid rgba(127,224,176,.0);border-bottom:1px solid rgba(127,224,176,.0);transition:all .25s}',
    '#lxl .cx.ok .cx-line{border-color:#7FE0B0;box-shadow:0 0 22px rgba(127,224,176,.6),inset 0 0 22px rgba(127,224,176,.35)}',
    '#lxl .cx-cap.l{transition:transform .3s cubic-bezier(.6,0,.3,1)}#lxl .cx-cap.r{transition:transform .3s cubic-bezier(.6,0,.3,1)}',
    '#lxl .cx.open .cx-cap.l{transform:translateX(-26px)}#lxl .cx.open .cx-cap.r{transform:translateX(26px)}',

    /* clearance reader */
    '#lxl .kc{position:absolute;inset:0;transform-style:preserve-3d;transform:rotateX(10deg) rotateY(14deg)}',
    '#lxl .kc-card{position:absolute;left:96px;top:6px;width:208px;height:132px;border-radius:12px;overflow:hidden;z-index:1;',
    '  background:linear-gradient(115deg,#13202a,#0b1016 60%),#0b1016;border:1px solid rgba(255,255,255,.18);box-shadow:0 18px 30px rgba(0,0,0,.6)}',
    '#lxl .kc-card::before{content:"";position:absolute;inset:0;mix-blend-mode:color-dodge;opacity:.45;background:linear-gradient(115deg,transparent 15%,rgba(255,0,170,.55) 30%,rgba(0,255,220,.55) 45%,rgba(255,240,0,.5) 60%,transparent 75%);background-size:250% 250%;animation:lxHolo 1.4s linear infinite}',
    '@keyframes lxHolo{from{background-position:0 0}to{background-position:250% 0}}',
    '#lxl .kc-chip{position:absolute;left:16px;top:42px;width:38px;height:30px;border-radius:6px;background:linear-gradient(135deg,#f3dc9c,#8f7031);box-shadow:inset 0 0 0 1px rgba(0,0,0,.4)}',
    '#lxl .kc-chip::after{content:"";position:absolute;inset:7px 6px;border:1px solid rgba(0,0,0,.45);border-radius:3px}',
    '#lxl .kc-card img{position:absolute;right:14px;top:14px;width:40px;height:40px;border-radius:50%}',
    '#lxl .kc-card p{position:absolute;left:16px;margin:0;font-size:9px;letter-spacing:.2em;color:rgba(244,236,216,.85);text-transform:uppercase}',
    '#lxl .kc-reader{position:absolute;left:70px;top:150px;width:260px;height:228px;border-radius:22px;z-index:2;',
    '  background:linear-gradient(160deg,#20272f,#0a0d11 70%);border:2px solid #4a525c;box-shadow:inset 0 1px 0 rgba(255,255,255,.12),0 30px 50px rgba(0,0,0,.8)}',
    '#lxl .kc-slot{position:absolute;left:28px;right:28px;top:14px;height:10px;border-radius:6px;background:#000;box-shadow:inset 0 3px 6px rgba(0,0,0,.95),0 1px 0 rgba(255,255,255,.12)}',
    '#lxl .kc-led{position:absolute;left:28px;right:28px;top:40px;height:6px;border-radius:4px;background:#ff3b4e;box-shadow:0 0 16px #ff3b4e;transition:background .2s,box-shadow .2s}',
    '#lxl .kc-led.amber{background:#F2C46B;box-shadow:0 0 16px #F2C46B}#lxl .kc-led.ok{background:#7FE0B0;box-shadow:0 0 20px #7FE0B0}',
    '#lxl .kc-oled{position:absolute;left:28px;right:28px;top:60px;height:110px;border-radius:10px;background:#020403;border:1px solid rgba(127,224,176,.25);padding:12px 14px;box-sizing:border-box;font-size:11px;line-height:1.8;letter-spacing:.14em;color:#7FE0B0;text-shadow:0 0 8px rgba(127,224,176,.7)}',
    '#lxl .kc-bar{height:5px;border-radius:3px;background:rgba(127,224,176,.15);margin-top:8px;overflow:hidden}#lxl .kc-bar i{display:block;height:100%;width:0;background:#7FE0B0;box-shadow:0 0 10px #7FE0B0}',
    '#lxl .kc-grill{position:absolute;left:28px;right:28px;bottom:18px;height:22px;background:repeating-linear-gradient(90deg,#0a0c0f 0 4px,#2a3038 4px 6px);border-radius:6px}',

    /* palm vein */
    '#lxl .pv{position:absolute;left:30px;top:30px;width:340px;height:340px;transform:rotateX(46deg) rotateZ(-8deg);transform-style:preserve-3d}',
    '#lxl .pv-glass{position:absolute;inset:0;border-radius:24px;border:1px solid rgba(127,224,176,.5);box-shadow:0 0 0 6px rgba(127,224,176,.06),0 40px 60px rgba(0,0,0,.8),inset 0 0 60px rgba(127,224,176,.12);',
    '  background:linear-gradient(140deg,rgba(255,255,255,.08),rgba(255,255,255,0) 40%),rgba(6,16,18,.75)}',
    '#lxl .pv-hex{position:absolute;inset:0;border-radius:24px;opacity:.35;background-image:url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%2728%27 height=%2748%27%3E%3Cpath d=%27M14 0l14 8v16l-14 8L0 24V8z M14 32l14 8v16 M0 40l14-8%27 fill=%27none%27 stroke=%27%237FE0B0%27 stroke-width=%27.6%27/%3E%3C/svg%3E")}',
    '#lxl .pv svg{position:absolute;inset:0;width:100%;height:100%}',
    '#lxl .pv-scan{position:absolute;left:0;right:0;top:0;height:4px;background:linear-gradient(90deg,transparent,#BFFFE6,transparent);box-shadow:0 0 30px 8px rgba(127,224,176,.6);opacity:0}',

    /* iris */
    '#lxl .ir{position:absolute;inset:0}',
    '#lxl .ir canvas{position:absolute;left:70px;top:70px;width:260px;height:260px;border-radius:50%}',
    '#lxl .ir .lid{position:absolute;left:20px;right:20px;height:220px;background:#030405;z-index:3;transition:transform .45s cubic-bezier(.6,0,.2,1)}',
    '#lxl .ir .lid.t{top:-30px;border-radius:0 0 50% 50% / 0 0 100% 100%}#lxl .ir .lid.b{bottom:-30px;border-radius:50% 50% 0 0 / 100% 100% 0 0}',
    '#lxl .ir.open .lid.t{transform:translateY(-150px)}#lxl .ir.open .lid.b{transform:translateY(150px)}',
    '#lxl .ir svg{position:absolute;inset:0;width:100%;height:100%;z-index:4}',
    '#lxl .ir .spin{transform-box:view-box;transform-origin:200px 200px;animation:lxSpin 3s linear infinite}#lxl .ir .spin.rev{animation-direction:reverse;animation-duration:5s}',
    '@keyframes lxSpin{to{transform:rotate(360deg)}}',

    /* genome */
    '#lxl .dn{position:absolute;inset:0}#lxl .dn canvas{position:absolute;left:0;top:60px;width:400px;height:280px}',

    /* containment core */
    '#lxl .co{position:absolute;inset:0}#lxl .co>svg{position:absolute;inset:0;width:100%;height:100%}',
    '#lxl .co .g{position:absolute;left:50%;top:50%}#lxl .co .g svg{display:block;width:100%;height:100%}',
    '#lxl .co .halo{position:absolute;left:50%;top:50%;width:320px;height:320px;margin:-160px;border-radius:50%;background:radial-gradient(closest-side,rgba(223,255,242,.6),rgba(127,224,176,.24) 42%,rgba(127,224,176,0));animation:lxPulse .42s ease-in-out infinite alternate}',
    '@keyframes lxPulse{from{opacity:.7;transform:scale(.93)}to{opacity:1;transform:scale(1.07)}}',
    '#lxl .co .orb{position:absolute;left:50%;top:50%;width:112px;height:112px;margin:-56px;border-radius:50%;overflow:hidden;',
    '  background:radial-gradient(circle at 40% 34%,#fff 0,#DFFFF2 12%,#6fe8bf 34%,#159a78 62%,#04382c 88%,#021a14);box-shadow:inset -12px -16px 28px rgba(0,0,0,.55),inset 6px 8px 18px rgba(255,255,255,.35)}',
    '#lxl .co .orb::before,#lxl .co .orb::after{content:"";position:absolute;inset:6px;border-radius:50%;mix-blend-mode:screen;filter:blur(2px);',
    '  background:repeating-conic-gradient(from 0deg,rgba(255,255,255,0) 0 16deg,rgba(223,255,242,.55) 21deg,rgba(255,255,255,0) 28deg);animation:lxSpin .7s linear infinite}',
    '#lxl .co .orb::after{inset:18px;animation-duration:.45s;animation-direction:reverse;opacity:.8}',
    '@keyframes lxSpin{to{transform:rotate(360deg)}}',
    '#lxl .co .clamp{position:absolute;left:50%;top:50%;width:44px;height:30px;margin:-15px -22px;border-radius:6px;box-shadow:inset 0 0 0 1px rgba(0,0,0,.5),0 6px 12px rgba(0,0,0,.6)}',
    '#lxl .co .clamp::after{content:"";position:absolute;left:8px;right:8px;top:12px;height:5px;border-radius:3px;background:#E2C47A;box-shadow:0 0 10px #E2C47A;transition:background .2s,box-shadow .2s}',
    '#lxl .co.ok .clamp::after{background:#7FE0B0;box-shadow:0 0 12px #7FE0B0}',

    /* quantum handshake */
    '#lxl .qh{position:absolute;inset:0}#lxl .qh svg{position:absolute;inset:0;width:100%;height:100%}',
    '#lxl .qh .stream{position:absolute;top:40px;bottom:40px;width:64px;overflow:hidden;font-size:10px;line-height:14px;color:rgba(127,224,176,.75);-webkit-mask:linear-gradient(transparent,#000 20%,#000 80%,transparent);mask:linear-gradient(transparent,#000 20%,#000 80%,transparent)}',
    '#lxl .qh .stream.l{left:-4px}#lxl .qh .stream.r{right:-4px;text-align:right;color:rgba(226,196,122,.8)}',
    '#lxl .qh .stream div{animation:lxFlow .9s linear infinite}@keyframes lxFlow{from{transform:translateY(-50%)}to{transform:translateY(0)}}',
    '#lxl .qh .shell{transform-box:view-box;transform-origin:200px 200px;transition:opacity .3s}',
    '#lxl .qh .shell polygon{fill:none;stroke-width:3;transition:stroke .15s,filter .15s}',
    '#lxl .qh .shell.ok polygon{stroke:#7FE0B0!important;filter:drop-shadow(0 0 8px #7FE0B0)}'
  ].join('\n');

  function at(ms, fn) { setTimeout(fn, ms); }
  function q(root, s) { return root.querySelector(s); }
  function qa(root, s) { return [].slice.call(root.querySelectorAll(s)); }
  function anim(el, frames, opts) { if (!el || !el.animate) return; return el.animate(frames, Object.assign({ fill: 'forwards', easing: 'cubic-bezier(.5,0,.3,1)' }, opts)); }
  function svg(vb, inner, cls) { return '<svg viewBox="' + (vb || '0 0 400 400') + '"' + (cls ? ' class="' + cls + '"' : '') + ' aria-hidden="true"><defs><filter id="lxGl" filterUnits="userSpaceOnUse" x="-100" y="-100" width="600" height="600"><feGaussianBlur stdDeviation="3.5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>' + inner + '</svg>'; }
  function polar(cx, cy, r, deg) { var a = (deg - 90) * Math.PI / 180; return [cx + Math.cos(a) * r, cy + Math.sin(a) * r]; }
  var RUNES = '◇△▽◈⌖⎔⌬⏣⟁⟐⊕⊗⌘⎈⏃⏂⍟⌾'.split('');

  // Steam, sparks and ink thrown off a mechanism, drawn on a canvas over the lock.
  function particles(root, list, opts) {
    var cv = document.createElement('canvas'); cv.className = 'fx'; root.appendChild(cv);
    var W = 560, H = 560; cv.width = W; cv.height = H;
    var cx = cv.getContext('2d'), ps = [];
    list.forEach(function (p) {
      for (var i = 0; i < (opts.n || 14); i++) {
        var a = (p.a != null ? p.a : Math.random() * Math.PI * 2) + (Math.random() - 0.5) * (opts.spread || 0.8), v = (opts.v || 2) * (0.5 + Math.random());
        ps.push({ x: p.x + 80, y: p.y + 80, vx: Math.cos(a) * v, vy: Math.sin(a) * v, r: (opts.r || 3) * (0.5 + Math.random()), life: 1 });
      }
    });
    var t0 = performance.now();
    (function f(now) {
      var k = (now - t0) / (opts.ms || 900);
      cx.clearRect(0, 0, W, H);
      cx.globalCompositeOperation = opts.add ? 'lighter' : 'source-over';
      ps.forEach(function (p) {
        p.x += p.vx; p.y += p.vy; p.vy += opts.g || 0; p.vx *= 0.97; p.vy *= opts.drag || 0.99; p.r *= opts.grow || 1; p.life = 1 - k;
        if (p.life <= 0) return;
        cx.globalAlpha = Math.max(0, p.life) * (opts.alpha || 0.6);
        var g = cx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
        g.addColorStop(0, opts.color || 'rgba(230,240,245,1)'); if (!opts.add) g.addColorStop(0.45, 'rgba(220,232,240,.45)'); g.addColorStop(1, 'rgba(230,240,245,0)');
        cx.fillStyle = opts.flat ? (opts.color || '#fff') : g; cx.beginPath(); cx.arc(p.x, p.y, p.r, 0, 7); cx.fill();
      });
      if (k < 1) requestAnimationFrame(f); else if (cv.parentNode) cv.parentNode.removeChild(cv);
    })(t0);
  }

  /* ── the locks ──────────────────────────────────────────────────── */
  var LOCKS = {
    /* Three counter-rotating rings of engraved glyphs settle into alignment,
       seven chevrons lock, eight hydraulic pistons retract and vent. */
    vault: {
      name: 'Quantum ring vault · Mk IX', dur: 1550,
      html: function () {
        function ringSvg(r, n, glyphs) {
          var o = '', i;
          for (i = 0; i < n; i++) { var p = polar(50, 50, r, i * 360 / n); o += '<text x="' + p[0] + '" y="' + p[1] + '" font-size="4.2" fill="rgba(226,196,122,.75)" text-anchor="middle" dominant-baseline="middle" transform="rotate(' + (i * 360 / n) + ' ' + p[0] + ' ' + p[1] + ')">' + glyphs[i % glyphs.length] + '</text>'; }
          o += '<rect class="notch" x="47.5" y="' + (50 - r - 3.2) + '" width="5" height="6.4" rx="1"/>';
          return '<svg viewBox="0 0 100 100">' + '<circle cx="50" cy="50" r="' + (r + 4) + '" fill="none" stroke="rgba(0,0,0,.6)" stroke-width=".6"/><circle cx="50" cy="50" r="' + (r - 4) + '" fill="none" stroke="rgba(255,255,255,.12)" stroke-width=".4"/>' + o + '</svg>';
        }
        var pis = '', chev = '', i;
        for (i = 0; i < 8; i++) pis += '<div class="pis chrome" data-a="' + (i * 45 + 22.5) + '" style="transform:rotate(' + (i * 45 + 22.5) + 'deg) translateY(-178px)"></div>';
        for (i = 0; i < 7; i++) { var ang = -54 + i * 18, p = polar(200, 200, 196, ang); chev += '<path class="chev" d="M-9 -6 L9 -6 L5 7 L-5 7 Z" transform="translate(' + p[0] + ' ' + p[1] + ') rotate(' + ang + ')"/>'; }
        return '<div class="qv">'
          + '<div class="ring steel bevel" style="width:380px;height:380px;margin:-190px"></div>' + pis
          + '<div class="ring dark deep" style="width:330px;height:330px;margin:-165px"></div>'
          + '<div class="ring r1 steel bevel" data-s="210" style="width:310px;height:310px;margin:-155px">' + ringSvg(44, 36, RUNES) + '</div>'
          + '<div class="ring r2 dark bevel" data-s="-260" style="width:236px;height:236px;margin:-118px">' + ringSvg(43, 24, RUNES.slice().reverse()) + '</div>'
          + '<div class="ring r3 gold bevel" data-s="150" style="width:166px;height:166px;margin:-83px">' + ringSvg(41, 16, RUNES) + '</div>'
          + '<div class="ring hub dark bevel" style="width:96px;height:96px;margin:-48px;padding:6px;box-sizing:border-box"><img src="/lunara_emblem_256.png" alt=""></div>'
          + '<svg viewBox="0 0 400 400" style="position:absolute;inset:0;width:100%;height:100%">' + chev + '</svg>'
          + '</div>';
      },
      run: function (root) {
        var qv = q(root, '.qv'); requestAnimationFrame(function () { qv.classList.add('on'); });
        qa(root, '.r1,.r2,.r3').forEach(function (r, i) {
          var s = +r.getAttribute('data-s');
          anim(r, [{ transform: 'rotate(' + s + 'deg)' }, { transform: 'rotate(' + (-s * 0.04) + 'deg)', offset: 0.85 }, { transform: 'rotate(0deg)' }], { duration: 760 + i * 120, delay: i * 90, easing: 'cubic-bezier(.3,.1,.2,1)' });
          at(760 + i * 210, function () { r.classList.add('lit'); });
        });
        qa(root, '.chev').forEach(function (c, i) { at(1040 + i * 55, function () { c.classList.add('on'); }); });
        qa(root, '.pis').forEach(function (p) { var a = p.getAttribute('data-a'); anim(p, [{ transform: 'rotate(' + a + 'deg) translateY(-178px)' }, { transform: 'rotate(' + a + 'deg) translateY(-150px)' }], { duration: 200, delay: 1250, easing: 'cubic-bezier(.7,0,.3,1)' }); });
        at(1290, function () {
          particles(root, qa(root, '.pis').map(function (p) { var a = +p.getAttribute('data-a'), pt = polar(200, 200, 190, a); return { x: pt[0], y: pt[1], a: (a - 90) * Math.PI / 180 }; }), { n: 18, v: 2.2, r: 12, grow: 1.045, ms: 1000, alpha: 0.13, spread: 0.9 });
        });
        play(function (t) {
          S.servo(t, 0.78, 140, 260, 0.05); S.servo(t + 0.09, 0.88, 210, 120, 0.04); S.servo(t + 0.18, 0.95, 320, 180, 0.035);
          S.thud(t + 0.76, 0.4); S.thud(t + 0.97, 0.4); S.thud(t + 1.18, 0.45);
          for (var i = 0; i < 7; i++) S.click(t + 1.04 + i * 0.055, 2400, 0.45, 0.03);
          S.thud(t + 1.25, 0.6); S.hiss(t + 1.28, 0.8, 0.22, 2200); S.boom(t + 1.3, 0.35);
        });
      }
    },

    /* A titanium safe: the dial spins with motion blur, the wheel cranks,
       the bolts withdraw and the door swings open onto gold light. */
    safe: {
      name: 'Titan safe door · TL-30', dur: 1650,
      html: function () {
        var rivets = '', i;
        for (i = 0; i < 14; i++) { var side = i < 7, k = i % 7; rivets += '<i class="rv" style="' + (side ? 'left:14px' : 'right:14px') + ';top:' + (20 + k * 46) + 'px"></i>'; }
        var ticks = '';
        for (i = 0; i < 100; i += 2) { var p1 = polar(75, 75, 70, i * 3.6), p2 = polar(75, 75, i % 10 === 0 ? 60 : 65, i * 3.6); ticks += '<line x1="' + p1[0] + '" y1="' + p1[1] + '" x2="' + p2[0] + '" y2="' + p2[1] + '" stroke="#1d2126" stroke-width="' + (i % 10 === 0 ? 1.6 : .8) + '"/>'; if (i % 10 === 0) { var pt = polar(75, 75, 52, i * 3.6); ticks += '<text x="' + pt[0] + '" y="' + pt[1] + '" font-size="8" fill="#1d2126" text-anchor="middle" dominant-baseline="middle" font-family="Inter,sans-serif" font-weight="700">' + i + '</text>'; } }
        var bolts = '';
        for (i = 0; i < 4; i++) bolts += '<div class="sf-bolt chrome" style="top:' + (40 + i * 72) + 'px"></div>';
        return '<div class="sf">'
          + '<div class="sf-frame steel bevel"></div><div class="sf-in"></div>'
          + '<div class="sf-door brushed bevel">' + rivets + bolts
          + '<div class="sf-led">– – –</div>'
          + '<div class="sf-dial steel bevel">' + svg('0 0 150 150', '<g class="dl" style="transform-box:view-box;transform-origin:75px 75px">' + ticks + '<circle cx="75" cy="75" r="34" fill="url(#lxk)"/></g><path d="M75 -2 l-6 0 l6 10 l6 -10z" fill="#ff5a5a"/><defs><radialGradient id="lxk"><stop offset="0" stop-color="#e8ecf0"/><stop offset="1" stop-color="#4a525c"/></radialGradient></defs>') + '</div>'
          + '<div class="sf-wheel">' + svg('0 0 96 96', '<g class="wh" style="transform-box:view-box;transform-origin:48px 48px">' + [0, 120, 240].map(function (a) { return '<g transform="rotate(' + a + ' 48 48)"><rect x="44" y="4" width="8" height="44" rx="4" fill="#cfd5dd" stroke="#4a525c"/><circle cx="48" cy="8" r="8" fill="#e8ecf0" stroke="#4a525c"/></g>'; }).join('') + '<circle cx="48" cy="48" r="14" fill="#9aa3ad" stroke="#2a2f35" stroke-width="2"/></g>') + '</div>'
          + '</div></div>';
      },
      run: function (root, side) {
        var dial = q(root, '.dl'), led = q(root, '.sf-led');
        anim(dial, [{ transform: 'rotate(0deg)', filter: 'blur(0)' }, { transform: 'rotate(-540deg)', filter: 'blur(1.6px)', offset: 0.5 }, { transform: 'rotate(-130deg)', filter: 'blur(1.2px)', offset: 0.8 }, { transform: 'rotate(-252deg)', filter: 'blur(0)' }], { duration: 760 });
        var code = [37, 12, 70]; side.set(code.map(function (n) { return String(n).padStart(2, '0'); }).join(' '), true);
        code.forEach(function (n, i) { at(260 + i * 250, function () { side.code(i); led.textContent = code.slice(0, i + 1).map(function (x) { return String(x).padStart(2, '0'); }).concat(['–', '–', '–'].slice(i + 1)).join(' '); }); });
        at(800, function () { led.classList.add('ok'); });
        anim(q(root, '.wh'), [{ transform: 'rotate(0deg)' }, { transform: 'rotate(150deg)' }], { duration: 300, delay: 830 });
        qa(root, '.sf-bolt').forEach(function (b, i) { anim(b, [{ transform: 'translateX(0)' }, { transform: 'translateX(-34px)' }], { duration: 160, delay: 1060 + i * 25, easing: 'cubic-bezier(.7,0,.3,1)' }); });
        anim(q(root, '.sf-door'), [{ transform: 'rotateY(0deg)' }, { transform: 'rotateY(-82deg)' }], { duration: 480, delay: 1200, easing: 'cubic-bezier(.5,0,.2,1)' });
        play(function (t) {
          for (var i = 0; i < 26; i++) S.click(t + i * 0.028, 3800, 0.28, 0.018);
          S.click(t + 0.26, 1200, 0.6, 0.05); S.click(t + 0.51, 1200, 0.6, 0.05); S.click(t + 0.76, 1200, 0.6, 0.05);
          S.beep(t + 0.8, 1568, 0.12, 'square', 0.04);
          S.servo(t + 0.83, 0.3, 90, 60, 0.07); S.click(t + 1.12, 900, 0.7, 0.07);
          for (var j = 0; j < 4; j++) S.click(t + 1.06 + j * 0.025, 1500, 0.5, 0.04);
          S.thud(t + 1.2, 0.5); S.creak(t + 1.22, 0.5); S.sweep(t + 1.25, 0.5, 300, 1200, 0.18);
        });
      }
    },

    /* Six brass-capped letter drums roll and land on L-U-N-A-R-A. */
    cryptex: {
      name: 'Cryptex · six drums', dur: 1450,
      html: function () {
        var AB = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', drums = '';
        for (var i = 0; i < 6; i++) { var s = ''; for (var k = 0; k < 3; k++) for (var j = 0; j < 26; j++) s += '<b>' + AB[j] + '</b>'; drums += '<div class="cx-drum"><div class="cx-strip">' + s + '</div></div>'; }
        return '<div class="cx"><div class="cx-cap l knurl"></div><div class="cx-body">' + drums + '<div class="cx-line"></div></div><div class="cx-cap r knurl"></div></div>';
      },
      run: function (root, side) {
        var word = 'LUNARA', AB = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', H = 52;
        side.set(word.split('').join(' '), true);
        qa(root, '.cx-strip').forEach(function (s, i) {
          var target = 52 + AB.indexOf(word[i]), start = Math.floor(Math.random() * 20);
          var y0 = -(start * H) + H, y1 = -(target * H) + H;
          anim(s, [{ transform: 'translateY(' + y0 + 'px)', filter: 'blur(0)' }, { transform: 'translateY(' + (y1 + 18) + 'px)', filter: 'blur(2px)', offset: 0.82 }, { transform: 'translateY(' + y1 + 'px)', filter: 'blur(0)' }], { duration: 620 + i * 110, easing: 'cubic-bezier(.25,.1,.25,1)' });
          at(620 + i * 110, function () { side.code(i); });
        });
        at(1230, function () { q(root, '.cx').classList.add('ok'); });
        at(1330, function () { q(root, '.cx').classList.add('open'); });
        play(function (t) {
          for (var i = 0; i < 30; i++) S.click(t + i * 0.035, 2800 + (i % 4) * 300, 0.22, 0.015);
          for (var j = 0; j < 6; j++) S.click(t + 0.62 + j * 0.11, 1500, 0.65, 0.05);
          S.beep(t + 1.23, 880, 0.12, 'sine', 0.06); S.thud(t + 1.33, 0.35); S.hiss(t + 1.34, 0.25, 0.08, 4000);
        });
      }
    },

    /* A holographic clearance card drops into a reader; red, amber, green. */
    card: {
      name: 'Clearance reader · level 5', dur: 1450,
      html: function () {
        return '<div class="kc"><div class="kc-card"><img src="/lunara_emblem_96.png" alt=""><div class="kc-chip"></div>'
          + '<p style="top:16px">Lunara Society</p><p style="top:84px;font-size:13px;letter-spacing:.3em;color:#F4ECD8">CLEARANCE Λ5</p><p style="top:106px;color:rgba(127,224,176,.85)">Passport control · all gates</p></div>'
          + '<div class="kc-reader"><div class="kc-slot"></div><div class="kc-led"></div><div class="kc-oled"><div class="ol">AWAITING CARD</div><div class="kc-bar"><i></i></div><div class="ol2" style="margin-top:10px;color:rgba(127,224,176,.6)"></div></div><div class="kc-grill"></div></div></div>';
      },
      run: function (root) {
        var card = q(root, '.kc-card'), led = q(root, '.kc-led'), ol = q(root, '.ol'), ol2 = q(root, '.ol2'), bar = q(root, '.kc-bar i');
        anim(card, [{ transform: 'translateY(-70px) rotateY(-50deg) rotateX(14deg)', opacity: 0 }, { transform: 'translateY(-14px) rotateY(0) rotateX(0)', opacity: 1, offset: 0.4 }, { transform: 'translateY(-8px)', opacity: 1, offset: 0.78 }, { transform: 'translateY(160px)', opacity: 1 }], { duration: 740, easing: 'cubic-bezier(.4,0,.2,1)' });
        at(740, function () { led.classList.add('amber'); ol.textContent = 'READING CHIP'; });
        anim(bar, [{ width: '0%' }, { width: '100%' }], { duration: 400, delay: 760, easing: 'linear' });
        var lines = ['CERT 0x4C55-4E41', 'SIG ED25519 · OK', 'REVOCATION · CLEAR'];
        lines.forEach(function (l, i) { at(790 + i * 120, function () { ol2.textContent = l; }); });
        at(1190, function () { led.classList.remove('amber'); led.classList.add('ok'); ol.textContent = 'CLEARANCE Λ5 · GRANTED'; });
        play(function (t) { S.sweep(t + 0.56, 0.2, 600, 2400, 0.24); S.click(t + 0.74, 900, 0.6, 0.06); S.data(t + 0.76, 0.42, 14); S.beep(t + 1.19, 1046.5, 0.08, 'square', 0.06); S.beep(t + 1.29, 1568, 0.12, 'square', 0.06); S.thud(t + 1.3, 0.35); });
      }
    },

    /* A palm on glass: the wireframe drawn by laser, the vein map matched. */
    palm: {
      name: 'Palm-vein scanner · NIR', dur: 1550,
      html: function () {
        var hand = [
          // one continuous outline, wrist to wrist: thumb, index, middle, ring, little finger
          'M150 356 L146 300 C124 286 98 258 82 222 Q74 200 88 192 Q100 186 112 202 C122 216 130 226 138 222'
          + ' L136 112 Q136 92 152 92 Q167 92 167 112 L170 200 Q174 208 178 200'
          + ' L178 82 Q178 62 195 62 Q212 62 212 82 L212 198 Q216 206 220 198'
          + ' L222 94 Q223 76 238 76 Q253 77 253 96 L250 206 Q254 213 258 206'
          + ' L264 134 Q266 118 279 119 Q292 121 291 137 L284 236 C281 272 272 302 266 322 L262 356',
          'M146 246 C176 238 222 236 280 250',                 // heart line
          'M140 272 C172 270 208 274 252 292',                 // head line
          'M148 232 C150 270 160 308 176 346'                  // life line
        ].map(function (d) { return '<path class="hd" pathLength="100" d="' + d + '"/>'; }).join('');
        var veins = '';
        var seeds = [[196, 350, 195, 214, 0], [186, 350, 154, 222, -10], [206, 350, 236, 220, 8], [214, 346, 272, 244, 10], [180, 340, 118, 222, -16], [158, 300, 262, 284, 0], [170, 324, 246, 314, 0]];
        seeds.forEach(function (v) { var mx = (v[0] + v[2]) / 2 + v[4] + (Math.random() - 0.5) * 16, my = (v[1] + v[3]) / 2 + (Math.random() - 0.5) * 12; veins += '<path class="vn" pathLength="100" d="M' + v[0] + ' ' + v[1] + ' Q' + mx.toFixed(1) + ' ' + my.toFixed(1) + ' ' + v[2] + ' ' + v[3] + '"/>'; });
        var pts = '';
        [[160, 234], [195, 228], [232, 236], [264, 258], [196, 292], [228, 300], [138, 250], [176, 318]].forEach(function (p) { pts += '<g class="pt" opacity="0"><circle cx="' + p[0] + '" cy="' + p[1] + '" r="7" fill="none" stroke="#E2C47A" stroke-width="1.4"/><circle cx="' + p[0] + '" cy="' + p[1] + '" r="2" fill="#E2C47A"/></g>'; });
        return '<div class="pv"><div class="pv-glass"></div><div class="pv-hex"></div>'
          + svg('0 0 400 400', '<g fill="none" stroke="#7FE0B0" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" filter="url(#lxGl)" stroke-dasharray="100" stroke-dashoffset="100" class="hand">' + hand + '</g>'
            + '<g fill="none" stroke="#ff5a6a" stroke-width="2.4" stroke-linecap="round" stroke-dasharray="100" stroke-dashoffset="100" filter="url(#lxGl)" class="veins">' + veins + '</g>' + pts)
          + '<div class="pv-scan"></div></div>';
      },
      run: function (root, side) {
        qa(root, '.hd').forEach(function (h, i) { anim(h, [{ strokeDashoffset: 100 }, { strokeDashoffset: 0 }], i ? { duration: 260, delay: 380 + i * 70 } : { duration: 560, easing: 'cubic-bezier(.4,0,.3,1)' }); });
        anim(q(root, '.pv-scan'), [{ top: '0%', opacity: 1 }, { top: '100%', opacity: 1, offset: 0.48 }, { top: '0%', opacity: 1, offset: 0.96 }, { top: '0%', opacity: 0 }], { duration: 900, delay: 380, easing: 'ease-in-out' });
        qa(root, '.vn').forEach(function (v, i) { anim(v, [{ strokeDashoffset: 100 }, { strokeDashoffset: 0 }], { duration: 360, delay: 600 + i * 70 }); });
        qa(root, '.pt').forEach(function (p, i) { anim(p, [{ opacity: 0, transform: 'scale(1.8)' }, { opacity: 1, transform: 'scale(1)' }], { duration: 160, delay: 820 + i * 80 }); });
        at(1380, function () { qa(root, '.vn').forEach(function (v) { v.parentNode.setAttribute('stroke', '#7FE0B0'); }); });
        var p0 = performance.now();
        (function pct(now) { var k = Math.min(1, (now - p0) / 1400); side.set('VEIN MAP ' + Math.round(k * 2048) + ' / 2048'); if (k < 1) requestAnimationFrame(pct); })(p0);
        play(function (t) { S.hum(t, 1.4); S.sweep(t + 0.38, 0.9, 400, 900, 0.06); for (var i = 0; i < 7; i++) S.beep(t + 0.82 + i * 0.08, 2093 + i * 120, 0.04, 'sine', 0.05); S.beep(t + 1.38, 1318, 0.1, 'sine', 0.07); });
      }
    },

    /* An iris, generated: eyelids open, rings turn, a laser fan reads it. */
    iris: {
      name: 'Iris recognition · ISO 19794-6', dur: 1500,
      html: function () {
        var hud = '<g class="spin"><circle cx="200" cy="200" r="168" fill="none" stroke="rgba(127,224,176,.45)" stroke-width="1" stroke-dasharray="2 6"/>'
          + Array.apply(null, Array(24)).map(function (_, i) { var a = polar(200, 200, 168, i * 15), b = polar(200, 200, i % 6 === 0 ? 150 : 160, i * 15); return '<line x1="' + a[0] + '" y1="' + a[1] + '" x2="' + b[0] + '" y2="' + b[1] + '" stroke="rgba(127,224,176,.7)"/>'; }).join('') + '</g>'
          + '<g class="spin rev"><circle cx="200" cy="200" r="184" fill="none" stroke="rgba(226,196,122,.5)" stroke-width="2" stroke-dasharray="60 30 10 30"/></g>'
          + '<path d="M60 200 h40 M300 200 h40 M200 60 v40 M200 300 v40" stroke="rgba(127,224,176,.8)" stroke-width="1.5"/>'
          + '<rect class="box" x="146" y="146" width="108" height="108" fill="none" stroke="#E2C47A" stroke-width="1.5" opacity="0"/>'
          + '<rect class="fan" x="70" y="40" width="3" height="320" fill="#BFFFE6" filter="url(#lxGl)" opacity="0"/>'
          + '<circle class="ring2" cx="200" cy="200" r="138" fill="none" stroke="#7FE0B0" stroke-width="3" stroke-dasharray="867" stroke-dashoffset="867" transform="rotate(-90 200 200)" filter="url(#lxGl)"/>';
        return '<div class="ir"><canvas width="520" height="520"></canvas><div class="lid t"></div><div class="lid b"></div>' + svg('0 0 400 400', hud) + '</div>';
      },
      paint: function (cv) {
        var x = cv.getContext('2d'), W = 520, c = W / 2, R = 250;
        var hue = 150 + Math.random() * 60;
        var g = x.createRadialGradient(c, c, 40, c, c, R);
        g.addColorStop(0, 'hsl(' + (hue - 110) + ',55%,32%)'); g.addColorStop(0.35, 'hsl(' + hue + ',38%,34%)'); g.addColorStop(0.8, 'hsl(' + (hue + 20) + ',30%,22%)'); g.addColorStop(1, '#05080a');
        x.fillStyle = g; x.beginPath(); x.arc(c, c, R, 0, 7); x.fill();
        for (var i = 0; i < 900; i++) {                         // the fibres
          var a = Math.random() * Math.PI * 2, r1 = 62 + Math.random() * 20, r2 = 150 + Math.random() * 95, w = Math.random() * 0.4 - 0.2;
          x.strokeStyle = 'hsla(' + (hue + (Math.random() * 60 - 30)) + ',' + (30 + Math.random() * 40) + '%,' + (35 + Math.random() * 40) + '%,' + (0.08 + Math.random() * 0.25) + ')';
          x.lineWidth = 0.6 + Math.random() * 1.6; x.beginPath(); x.moveTo(c + Math.cos(a) * r1, c + Math.sin(a) * r1);
          x.quadraticCurveTo(c + Math.cos(a + w) * (r1 + r2) / 2, c + Math.sin(a + w) * (r1 + r2) / 2, c + Math.cos(a + w * 2) * r2, c + Math.sin(a + w * 2) * r2); x.stroke();
        }
        for (var j = 0; j < 26; j++) { var a2 = Math.random() * 7, r3 = 90 + Math.random() * 110; x.fillStyle = 'rgba(0,0,0,' + (0.15 + Math.random() * 0.3) + ')'; x.beginPath(); x.ellipse(c + Math.cos(a2) * r3, c + Math.sin(a2) * r3, 4 + Math.random() * 10, 2 + Math.random() * 4, a2, 0, 7); x.fill(); }
        var col = x.createRadialGradient(c, c, 64, c, c, 110); col.addColorStop(0, 'hsla(' + (hue - 120) + ',70%,45%,.55)'); col.addColorStop(1, 'transparent'); x.fillStyle = col; x.beginPath(); x.arc(c, c, 110, 0, 7); x.fill();
        var lim = x.createRadialGradient(c, c, R - 40, c, c, R); lim.addColorStop(0, 'transparent'); lim.addColorStop(1, 'rgba(0,0,0,.85)'); x.fillStyle = lim; x.beginPath(); x.arc(c, c, R, 0, 7); x.fill();
        x.fillStyle = '#010203'; x.beginPath(); x.arc(c, c, 66, 0, 7); x.fill();
        x.fillStyle = 'rgba(255,255,255,.85)'; x.beginPath(); x.ellipse(c - 70, c - 80, 22, 14, -0.5, 0, 7); x.fill();
        x.fillStyle = 'rgba(255,255,255,.3)'; x.beginPath(); x.ellipse(c + 60, c + 70, 9, 6, -0.5, 0, 7); x.fill();
      },
      run: function (root, side) {
        this.paint(q(root, 'canvas'));
        at(60, function () { q(root, '.ir').classList.add('open'); });
        anim(q(root, '.fan'), [{ transform: 'translateX(0)', opacity: 1 }, { transform: 'translateX(256px)', opacity: 1, offset: 0.5 }, { transform: 'translateX(0)', opacity: 1, offset: 0.95 }, { opacity: 0 }], { duration: 900, delay: 420, easing: 'ease-in-out' });
        anim(q(root, '.ring2'), [{ strokeDashoffset: 867 }, { strokeDashoffset: 0 }], { duration: 1000, delay: 420, easing: 'linear' });
        anim(q(root, '.box'), [{ opacity: 0, transform: 'scale(1.6)' }, { opacity: 1, transform: 'scale(1)' }], { duration: 260, delay: 1200 });
        q(root, '.box').style.cssText = 'transform-box:view-box;transform-origin:200px 200px';
        var p0 = performance.now() + 420;
        (function pct(now) { var k = Math.max(0, Math.min(1, (now - p0) / 1000)); side.set('IRIS CODE ' + (k * 99.98).toFixed(2) + '%'); if (k < 1) requestAnimationFrame(pct); })(performance.now());
        play(function (t) { S.sweep(t + 0.06, 0.4, 200, 600, 0.08); S.hum(t + 0.4, 1.0); S.data(t + 0.45, 0.9, 16); S.beep(t + 1.2, 1760, 0.08, 'sine', 0.07); });
      }
    },

    /* A double helix turns in depth while its base pairs are matched. */
    genome: {
      name: 'Genome lock · 2,048 bp', dur: 1500,
      html: function () { return '<div class="dn"><canvas width="800" height="560"></canvas></div>'; },
      run: function (root, side) {
        var cv = q(root, 'canvas'), x = cv.getContext('2d'), W = 800, H = 560, t0 = performance.now(), dur = 1500, N = 30;
        var pairs = []; for (var i = 0; i < N; i++) pairs.push(Math.floor(Math.random() * 4));
        var cols = ['#7FE0B0', '#E2C47A', '#6FB6FF', '#FF8A7A'];
        (function draw(now) {
          var k = Math.min(1, (now - t0) / dur), ph = (now - t0) / 260, matched = Math.floor(k * 1.15 * N);
          x.clearRect(0, 0, W, H);
          var items = [];
          for (var i = 0; i < N; i++) {
            var px = 40 + i * (W - 80) / (N - 1), a = i * 0.45 + ph, y1 = H / 2 + Math.sin(a) * 150, y2 = H / 2 - Math.sin(a) * 150, z1 = Math.cos(a), z2 = -z1;
            items.push({ x: px, y1: y1, y2: y2, z1: z1, z2: z2, i: i });
          }
          items.forEach(function (it) {                       // rungs first, behind the strands
            var ok = it.i < matched;
            var g = x.createLinearGradient(it.x, it.y1, it.x, it.y2);
            g.addColorStop(0, ok ? '#7FE0B0' : cols[pairs[it.i]]); g.addColorStop(1, ok ? '#BFFFE6' : cols[(pairs[it.i] + 2) % 4]);
            x.globalAlpha = ok ? 0.95 : 0.35; x.strokeStyle = g; x.lineWidth = ok ? 4 : 3; x.beginPath(); x.moveTo(it.x, it.y1); x.lineTo(it.x, it.y2); x.stroke();
            if (ok) { x.shadowColor = '#7FE0B0'; x.shadowBlur = 14; x.stroke(); x.shadowBlur = 0; }
          });
          [['y1', 'z1', '#E2C47A'], ['y2', 'z2', '#9fd7ff']].forEach(function (s) {
            x.globalAlpha = 1; x.strokeStyle = s[2]; x.lineWidth = 3; x.beginPath();
            items.forEach(function (it, j) { if (j) x.lineTo(it.x, it[s[0]]); else x.moveTo(it.x, it[s[0]]); }); x.globalAlpha = 0.5; x.stroke();
            items.forEach(function (it) { var z = (it[s[1]] + 1) / 2; x.globalAlpha = 0.35 + z * 0.65; x.fillStyle = s[2]; x.beginPath(); x.arc(it.x, it[s[0]], 5 + z * 7, 0, 7); x.fill(); });
          });
          x.globalAlpha = 1;
          side.set('MATCH ' + Math.min(2048, Math.round(k * 1.15 * 2048)) + '/2048 BP');
          if (k < 1) requestAnimationFrame(draw);
        })(t0);
        play(function (t) { S.hum(t, 1.5); for (var i = 0; i < 30; i++) S.beep(t + i * 0.043, 1400 + (i % 5) * 220, 0.02, 'sine', 0.035); S.beep(t + 1.35, 1318, 0.1, 'sine', 0.07); });
      }
    },

    /* Plasma held in three gyroscope rings; they spin up, arc, and let go. */
    core: {
      name: 'Containment core · class Ω', dur: 1450,
      html: function () {
        function ring(size, w, nodes) {
          var n = '', i;
          for (i = 0; i < nodes; i++) { var p = polar(50, 50, 46, i * 360 / nodes); n += '<circle cx="' + p[0].toFixed(2) + '" cy="' + p[1].toFixed(2) + '" r="2.2" fill="#F4ECD8" stroke="#6e5320" stroke-width=".6"/>'; }
          return '<div class="g" style="width:' + size + 'px;height:' + size + 'px;margin:' + (-size / 2) + 'px"><svg viewBox="0 0 100 100">'
            + '<circle cx="50" cy="50" r="46" fill="none" stroke="url(#lxCoG)" stroke-width="' + w + '"/>'
            + '<circle cx="50" cy="50" r="46" fill="none" stroke="#0b0d10" stroke-width="' + (w * 0.28) + '" stroke-dasharray="0.6 3.4"/>'
            + '<circle cx="50" cy="50" r="' + (46 - w * 0.9) + '" fill="none" stroke="#7FE0B0" stroke-width=".5" stroke-dasharray="6 3 1 3" opacity=".8"/>' + n + '</svg></div>';
        }
        var ticks = '', i, cl = '';
        for (i = 0; i < 72; i++) { var p0 = polar(200, 200, 168, i * 5), p1 = polar(200, 200, i % 6 ? 174 : 180, i * 5); ticks += '<line x1="' + p0[0].toFixed(1) + '" y1="' + p0[1].toFixed(1) + '" x2="' + p1[0].toFixed(1) + '" y2="' + p1[1].toFixed(1) + '"/>'; }
        for (i = 0; i < 4; i++) cl += '<div class="clamp chrome" data-a="' + (45 + i * 90) + '" style="transform:rotate(' + (45 + i * 90) + 'deg) translateY(-178px)"></div>';
        return '<div class="co">'
          + svg('0 0 400 400', '<linearGradient id="lxCoG" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f3dc9c"/><stop offset=".35" stop-color="#6e5320"/><stop offset=".6" stop-color="#d6b468"/><stop offset="1" stop-color="#5b6168"/></linearGradient>'
            + '<linearGradient id="lxCoS" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c9cfd6"/><stop offset=".5" stop-color="#4a5058"/><stop offset="1" stop-color="#9aa1aa"/></linearGradient>'
            + '<circle cx="200" cy="200" r="190" fill="#07090b" stroke="url(#lxCoS)" stroke-width="10"/><circle cx="200" cy="200" r="160" fill="none" stroke="rgba(127,224,176,.18)" stroke-width="1" stroke-dasharray="2 6"/>'
            + '<g stroke="rgba(226,196,122,.55)" stroke-width="1.2">' + ticks + '</g>'
            + '<text x="200" y="40" text-anchor="middle" font-size="9" letter-spacing="3" fill="rgba(226,196,122,.7)" font-family="IBM Plex Mono,monospace">CONTAINMENT · Ω</text>')
          + '<div class="halo"></div><div class="orb"></div>'
          + ring(330, 3.2, 3) + ring(268, 3.8, 4) + ring(206, 4.6, 2) + cl
          + svg('0 0 400 400', '<g class="arcs" stroke="#DFFFF2" stroke-width="1.8" stroke-linejoin="round" fill="none" filter="url(#lxGl)"></g>') + '</div>';
      },
      run: function (root, side) {
        var g = qa(root, '.g'), arcs = q(root, '.arcs'), co = q(root, '.co');
        var spin = [['rotateX(72deg)', 720], ['rotateY(72deg)', -900], ['rotateX(48deg) rotateY(42deg)', 1080]];
        g.forEach(function (r, i) {
          anim(r, [{ transform: 'perspective(900px) ' + spin[i][0] + ' rotateZ(0deg)' }, { transform: 'perspective(900px) ' + spin[i][0] + ' rotateZ(' + spin[i][1] + 'deg)' }], { duration: 1150, easing: 'cubic-bezier(.5,0,.6,1)' });
        });
        var p0 = performance.now();
        (function rd(now) { var k = Math.min(1, (now - p0) / 1100); side.set('FIELD ' + (k * 100).toFixed(1) + '%'); if (k < 1) requestAnimationFrame(rd); })(p0);
        var stop = false;
        (function bolt() {                                     // arcs from the plasma to the rings
          if (stop) return;
          var d = '';
          for (var i = 0; i < 3; i++) {
            var ang = Math.random() * Math.PI * 2, r = 110 + Math.random() * 55, x, y; d += 'M' + (200 + Math.cos(ang) * 50).toFixed(1) + ' ' + (200 + Math.sin(ang) * 50).toFixed(1) + ' ';
            for (var st = 2; st <= 7; st++) { var rr = 50 + (r - 50) * st / 7; x = 200 + Math.cos(ang) * rr + (Math.random() - 0.5) * 20; y = 200 + Math.sin(ang) * rr + (Math.random() - 0.5) * 20; d += 'L' + x.toFixed(1) + ' ' + y.toFixed(1) + ' '; }
          }
          arcs.innerHTML = '<path d="' + d + '"/>';
          setTimeout(bolt, 55 + Math.random() * 60);
        })();
        at(1000, function () { co.classList.add('ok'); });
        at(1150, function () {
          stop = true; arcs.innerHTML = '';
          qa(root, '.clamp').forEach(function (c) { var a = c.getAttribute('data-a'); anim(c, [{ transform: 'rotate(' + a + 'deg) translateY(-178px)' }, { transform: 'rotate(' + a + 'deg) translateY(-206px)', opacity: 0 }], { duration: 260 }); });
          g.forEach(function (r, i) { anim(r, [{ opacity: 1, transform: 'perspective(900px) ' + spin[i][0] + ' rotateZ(' + spin[i][1] + 'deg) scale(1)' }, { opacity: 0, transform: 'perspective(900px) ' + spin[i][0] + ' rotateZ(' + (spin[i][1] + 90) + 'deg) scale(' + (1.8 + i * 0.35) + ')' }], { duration: 300, easing: 'cubic-bezier(.2,.7,.2,1)' }); });
          anim(q(root, '.orb'), [{ transform: 'scale(1)' }, { transform: 'scale(1.4)' }], { duration: 260 });
          anim(q(root, '.halo'), [{ transform: 'scale(1)', opacity: 1 }, { transform: 'scale(2.6)', opacity: 0.85 }], { duration: 300 });
          particles(root, [{ x: 200, y: 200 }], { n: 80, v: 5.5, r: 2.6, ms: 700, add: true, color: 'rgba(191,255,230,1)', alpha: 0.9 });
        });
        play(function (t) { S.whine(t, 1.1, 180, 1400); S.crackle(t + 0.1, 1.0); S.servo(t, 1.1, 60, 140, 0.04); S.click(t + 1.0, 1400, 0.4, 0.05); S.boom(t + 1.15, 0.6); S.hiss(t + 1.15, 0.4, 0.15, 3000); });
      }
    },

    /* Two key streams meet; three hexagonal shells unlock in turn. */
    handshake: {
      name: 'Quantum handshake · PQC', dur: 1450,
      html: function () {
        function hex(r) { var p = []; for (var i = 0; i < 6; i++) { var pt = polar(200, 200, r, i * 60 + 30); p.push(pt[0].toFixed(1) + ',' + pt[1].toFixed(1)); } return p.join(' '); }
        function stream() { var s = ''; for (var i = 0; i < 48; i++) s += Math.random().toString(16).slice(2, 8).toUpperCase() + '<br>'; return '<div>' + s + s + '</div>'; }
        return '<div class="qh"><div class="stream l">' + stream() + '</div><div class="stream r">' + stream() + '</div>'
          + svg('0 0 400 400',
            '<g class="shell s3"><polygon points="' + hex(170) + '" stroke="#5c4824" stroke-dasharray="40 10 4 10"/></g>'
            + '<g class="shell s2"><polygon points="' + hex(128) + '" stroke="#8a7240" stroke-dasharray="26 8"/></g>'
            + '<g class="shell s1"><polygon points="' + hex(86) + '" stroke="#C9A55E" stroke-dasharray="14 6"/></g>'
            + '<polygon points="' + hex(46) + '" fill="rgba(127,224,176,.08)" stroke="#7FE0B0" stroke-width="2" filter="url(#lxGl)"/>'
            + '<text x="200" y="205" text-anchor="middle" font-family="IBM Plex Mono,monospace" font-size="12" letter-spacing="2" fill="#BFFFE6">ML-KEM</text>'
            + '<line class="beam l" x1="40" y1="200" x2="40" y2="200" stroke="#7FE0B0" stroke-width="2" filter="url(#lxGl)"/>'
            + '<line class="beam r" x1="360" y1="200" x2="360" y2="200" stroke="#E2C47A" stroke-width="2" filter="url(#lxGl)"/>') + '</div>';
      },
      run: function (root, side) {
        anim(q(root, '.beam.l'), [{ x2: 40 }, { x2: 154 }], { duration: 300, delay: 100 });
        anim(q(root, '.beam.r'), [{ x2: 360 }, { x2: 246 }], { duration: 300, delay: 100 });
        var shells = ['.s1', '.s2', '.s3'];
        shells.forEach(function (s, i) {
          var el = q(root, s);
          anim(el, [{ transform: 'rotate(0deg)' }, { transform: 'rotate(' + (i % 2 ? -120 : 120) + 'deg)' }], { duration: 400 + i * 120, delay: 200, easing: 'cubic-bezier(.4,0,.2,1)' });
          at(560 + i * 230, function () { el.classList.add('ok'); side.set('KEY EXCHANGE ' + (i + 1) + ' / 3'); });
          at(700 + i * 230, function () { anim(el, [{ transform: 'rotate(' + (i % 2 ? -120 : 120) + 'deg) scale(1)', opacity: 1 }, { transform: 'rotate(' + (i % 2 ? -150 : 150) + 'deg) scale(' + (1.25 + i * 0.1) + ')', opacity: 0 }], { duration: 300 }); });
        });
        at(1300, function () { side.set('CHANNEL SECURED'); });
        play(function (t) { S.data(t, 1.2, 28); for (var i = 0; i < 3; i++) { S.sweep(t + 0.56 + i * 0.23, 0.2, 800, 3000, 0.12); S.beep(t + 0.56 + i * 0.23, 1046 + i * 262, 0.08, 'sine', 0.06); } S.thud(t + 1.25, 0.35); });
      }
    }
  };
  var ORDER = ['vault', 'safe', 'cryptex', 'card', 'palm', 'iris', 'genome', 'core', 'handshake'];

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
    q(b, '.side.l').innerHTML = '<p>Lunara · passport control</p><p>Gate <b>' + dest.toUpperCase() + '</b></p><p>Lock <b>' + lock.name + '</b></p><p>Ref ' + serial + '</p>';
    q(b, '.side.r').innerHTML = '<p class="st">Authenticating…</p><p class="code"></p><p class="ok">Access granted</p>';
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
    play(function (t) { S.servo(t, 0.3, 90, 50, 0.05); S.thud(t + 0.3, 0.35); });
    at(300, function () { b.classList.add('on'); try { lock.run(q(b, '.lk'), side); } catch (e) { if (window.console) console.warn('[lunara-locks]', e); } });
    at(300 + lock.dur, function () { b.classList.add('granted'); q(b, '.side.r .st').textContent = 'Verified'; play(function (t) { S.granted(t); }); });
    at(300 + lock.dur + 380, function () { b.classList.add('fold'); });
    at(300 + lock.dur + 560, function () { location.href = url; });
  }
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
