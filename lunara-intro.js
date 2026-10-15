/* ═══════════════════════════════════════════════════════════════════
   THE THRESHOLD: the intro to lunarasociety.com
   ═══════════════════════════════════════════════════════════════════

   A  void       0.0s   obsidian; a point of light
   B  signal     0.9s   the point draws out into a gold line, which
                        folds into a ring around where the seal will be
   C  artifact   2.2s   sparks converge on the ring and the official
                        emblem is forged inside it: dark first, then a
                        raking light across its relief
   D  chamber    2.6s   blades of light rise either side and recede to
                        a lit doorway; the floor gives the emblem back
   E  wordmark   4.3s   Lunara Society, then the line beneath it
   F  open              Enter (or, after a few seconds, by itself): the
                        chamber parts down the middle, the emblem flies
                        to its place in the navigation, and the
                        homepage is there behind it

   Particles appear only in C and F, as part of something being made or
   opened; they are never a background. Nothing here claims a check it
   has not made: there is no status read-out. Sound is off unless the
   visitor has switched it on (lx-sound = 1).

   At most once every twelve hours per device (the <head> of index.html
   decides, before anything paints). Never for crawlers or for a link to
   a #section; ?intro=1 plays it again. Escape or Skip leaves at once.
   Reduced motion gets the composed scene, still, and a fade.
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var root = document.documentElement, box = document.getElementById('lx-intro');
  if (!box) return;
  if (!root.classList.contains('lx-intro')) { box.parentNode.removeChild(box); return; }

  var REDUCED = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  var COARSE = !!(window.matchMedia && matchMedia('(pointer: coarse)').matches);
  var $ = function (id) { return document.getElementById(id); };
  var rig = $('lxi-rig'), coin = $('lxi-coin'), hall = $('lxi-hall'), enterBtn = $('lxi-enter'), skipBtn = $('lxi-skip');
  var timers = [], done = false, ready = false, opening = false;
  var WAIT = 3600;                                   // how long the open door waits for a touch
  function at(ms, fn) { timers.push(setTimeout(fn, ms)); }
  function stage(c) { box.classList.add(c); }

  /* ── where the seal sits: everything else is drawn relative to it ── */
  var E = { x: 0, y: 0, r: 0 }, P = { x: 0, y: 0, tx: 0, ty: 0 };
  function measure() {
    var b = rig.getBoundingClientRect();
    E.x = b.left + b.width / 2; E.y = b.top + b.height / 2; E.r = b.width * 0.383;   // the coin's rim, in the artwork
    box.style.setProperty('--hz', (E.y / innerHeight * 100).toFixed(2) + '%');
    box.style.setProperty('--ey', (E.y / innerHeight * 100).toFixed(2) + '%');
  }

  /* ── C: the coin's edge. Darker copies behind the face give it a
     thickness that shows when it turns; the artwork is untouched. ── */
  (function edge() {
    var face = coin.querySelector('img.face');
    for (var i = 1; i <= 4; i++) {
      var e = face.cloneNode(false); e.className = 'edge'; e.alt = '';
      e.style.transform = 'translateZ(' + (-i * 1.6) + 'px)';
      coin.insertBefore(e, face);
    }
  })();

  /* ── D: the chamber ────────────────────────────────────────────── */
  (function chamber() {
    var html = '<div class="floor"></div><div class="door"></div>', n = COARSE ? 5 : 7;
    for (var i = 0; i < n; i++) {
      [-1, 1].forEach(function (side) {
        var z = 30 - i * 56, o = Math.max(0.28, 1 - i * 0.11);
        html += '<i class="blade" style="--x:' + (side * 40) + 'vmin;--z:' + z + 'vmin;--o:' + o.toFixed(2) + ';--d:' + (i * 110 + (side > 0 ? 55 : 0)) + 'ms"></i>';
      });
    }
    hall.innerHTML = html;
  })();

  /* ── the light: one fragment shader, falling back to gradients ──── */
  var GL = null;
  (function light() {
    var cv = $('lxi-gl'), gl = null;
    try { gl = cv.getContext('webgl', { antialias: false, alpha: false, powerPreference: 'high-performance' }); } catch (e) {}
    if (!gl) { box.classList.add('nogl'); return; }
    var FRAG = [
      'precision highp float;',
      'uniform vec2 R,E,M;uniform float T,K,A,L,C,O,F;',
      'float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}',
      'float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h(i),h(i+vec2(1.,0.)),f.x),mix(h(i+vec2(0.,1.)),h(i+vec2(1.,1.)),f.x),f.y);}',
      'float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<4;i++){v+=a*n(p);p=p*2.03+vec2(1.7,9.2);a*=.5;}return v;}',
      'void main(){',
      ' vec2 p=(gl_FragCoord.xy-E)/K;',                                  // vmin units, the seal at the origin, y up
      ' vec2 pm=p-M*1.6;float r=length(pm);',
      ' vec3 col=vec3(.016,.016,.02)+vec3(.012,.010,.008)*smoothstep(-60.,60.,p.y);',
      ' float sm=fbm(p*.045+vec2(T*.018,-T*.011)+fbm(p*.07+T*.02));',
      /* the shaft: a cone of light falling from above onto the seal */
      ' float cw=7.+max(0.,60.-p.y)*.30;float cone=smoothstep(1.,.15,abs(p.x-M.x*3.)/cw)*smoothstep(-20.,40.,p.y);',
      ' col+=vec3(1.,.84,.6)*cone*(.035+.10*sm)*C;',
      /* the halo behind the seal, and the first point of light */
      ' col+=vec3(1.,.78,.46)*exp(-r*.085)*(.22*C)+vec3(1.,.9,.72)*exp(-r*.45)*A*(1.-C*.75)*1.3;',
      /* B: the signal, a line drawn out of the point */
      ' float ext=mix(.5,70.,L);float sx=smoothstep(ext,ext*.55,abs(p.x));',
      ' col+=vec3(1.,.88,.66)*(exp(-pow(p.y*K/1.7,2.))*1.2+exp(-pow(p.y*.9,2.))*.22)*sx*L;',
      /* the floor: polished stone below the seal, giving the halo back */
      ' float fy=-16.;if(p.y<fy){float d=fy-p.y;vec2 q=vec2(pm.x*.8,(p.y-2.*fy));',
      '  col*=.55;col+=vec3(1.,.8,.5)*exp(-length(vec2(q.x,d*2.4))*.07)*.10*C*(.7+.3*sm);',
      '  col+=vec3(1.,.86,.6)*exp(-pow(d*.9,2.))*.05*C;}',
      /* F: the seam where the chamber parts */
      ' col+=vec3(1.,.9,.72)*O*exp(-abs(p.x)*.6)*.9;',
      ' col*=smoothstep(150.,30.,length(p*vec2(.8,1.)));',
      ' col=1.-exp(-col*1.7);',                                          // a filmic shoulder: highlights roll off, never clip
      ' col+=(h(gl_FragCoord.xy+T)-.5)/255.;',                           // dither: no banding in the dark gradients
      ' gl_FragColor=vec4(col*F,1.);}'
    ].join('\n');
    function sh(type, src) { var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; }
    var prog;
    try {
      prog = gl.createProgram();
      gl.attachShader(prog, sh(gl.VERTEX_SHADER, 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}'));
      gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error('link');
      gl.useProgram(prog);
    } catch (e) { box.classList.add('nogl'); return; }
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    var loc = gl.getAttribLocation(prog, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    var U = {}; ['R', 'E', 'M', 'T', 'K', 'A', 'L', 'C', 'O', 'F'].forEach(function (k) { U[k] = gl.getUniformLocation(prog, k); });
    var scale = COARSE ? 0.5 : 0.7, slow = 0;
    function size() { cv.width = Math.round(innerWidth * scale); cv.height = Math.round(innerHeight * scale); gl.viewport(0, 0, cv.width, cv.height); }
    size();
    GL = { A: 0, L: 0, C: 0, O: 0, F: 1, size: size };
    var t0 = performance.now(), last = t0;
    function draw(now) {
      gl.uniform2f(U.R, cv.width, cv.height);
      gl.uniform2f(U.E, E.x * scale, (innerHeight - E.y) * scale);
      gl.uniform1f(U.K, Math.min(innerWidth, innerHeight) / 100 * scale);
      gl.uniform2f(U.M, P.x, -P.y);
      gl.uniform1f(U.T, (now - t0) / 1000);
      ['A', 'L', 'C', 'O', 'F'].forEach(function (k) { gl.uniform1f(U[k], GL[k]); });
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    GL.draw = draw;
    (function frame(now) {
      if (done) return;
      var dt = now - last; last = now;
      if (dt > 34 && dt < 300 && ++slow > 24 && scale > 0.35) { scale -= 0.12; slow = 0; size(); }
      draw(now);
      if (!REDUCED) requestAnimationFrame(frame);
    })(t0);
  })();
  function ramp(key, to, ms, ease) {
    if (!GL) return;
    var from = GL[key], t0 = performance.now();
    if (REDUCED) { GL[key] = to; if (GL.draw) GL.draw(t0); return; }
    (function f(now) { var k = Math.min(1, (now - t0) / ms); GL[key] = from + (to - from) * (ease ? ease(k) : k); if (k < 1 && !done) requestAnimationFrame(f); })(t0);
  }
  var outExpo = function (k) { return k === 1 ? 1 : 1 - Math.pow(2, -10 * k); };
  var inOut = function (k) { return k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2; };

  /* ── C and F: sparks, only while something is being made or opened ─ */
  var motes = (function () {
    var cv = $('lxi-motes'), cx = cv.getContext('2d'), dpr = Math.min(1.5, window.devicePixelRatio || 1), list = [], raf = 0;
    function size() { cv.width = Math.round(innerWidth * dpr); cv.height = Math.round(innerHeight * dpr); cx.setTransform(dpr, 0, 0, dpr, 0, 0); }
    size();
    function loop(now) {
      raf = 0;
      cx.globalCompositeOperation = 'destination-out'; cx.fillStyle = 'rgba(0,0,0,.28)'; cx.fillRect(0, 0, innerWidth, innerHeight);
      cx.globalCompositeOperation = 'lighter';
      var live = 0;
      for (var i = 0; i < list.length; i++) {
        var m = list[i], k = (now - m.t0) / m.dur;
        if (k < 0) { live++; continue; }
        if (k > 1.25) continue;
        live++;
        var x, y, a, s;
        if (m.kind === 'in') {                                     // a spiral onto the rim, then a flare
          var e = inOut(Math.min(1, k)), ang = m.a0 + (m.a1 - m.a0) * e, rad = m.r0 + (E.r - m.r0) * e;
          x = E.x + Math.cos(ang) * rad; y = E.y + Math.sin(ang) * rad;
          a = k < 1 ? Math.min(1, k * 2.5) * 0.9 : (1.25 - k) * 4; s = k < 1 ? m.s : m.s * (1 + (k - 1) * 10);
        } else {                                                   // carried outward by the parting doors
          var o = outExpo(Math.min(1, k));
          x = E.x + m.vx * o; y = m.y0 + m.vy * o;
          a = Math.max(0, 1 - k) * 0.9; s = m.s;
        }
        var col = 'rgba(255,' + (226 + (m.hue * 20 | 0)) + ',' + (170 + (m.hue * 50 | 0)) + ',' + Math.max(0, a).toFixed(3) + ')';
        if (m.px != null && k < 1) {                               // a streak from where it was: motion reads at any frame rate
          var dx = x - m.px, dy = y - m.py, d = Math.hypot(dx, dy), l = Math.min(d, 70) / (d || 1);
          cx.strokeStyle = col; cx.lineWidth = s; cx.lineCap = 'round';
          cx.beginPath(); cx.moveTo(x - dx * l, y - dy * l); cx.lineTo(x, y); cx.stroke();
        }
        cx.fillStyle = col; cx.beginPath(); cx.arc(x, y, s, 0, 6.2832); cx.fill();
        m.px = x; m.py = y;
      }
      if (live && !done) raf = requestAnimationFrame(loop); else { cx.clearRect(0, 0, innerWidth, innerHeight); list = []; }
    }
    function go() { if (!raf) raf = requestAnimationFrame(loop); }
    return {
      size: size,
      forge: function () {
        if (REDUCED) return;
        var n = COARSE ? 100 : 160, t = performance.now();
        for (var i = 0; i < n; i++) {                              // one direction of turn: a vortex, not a scatter
          var a1 = Math.random() * 6.2832, sweep = 1.1 + Math.random() * 1.6;
          list.push({ kind: 'in', t0: t + Math.random() * 650, dur: 1000 + Math.random() * 500, a0: a1 - sweep, a1: a1,
            r0: E.r * (1.5 + Math.random() * 2.2), s: 0.6 + Math.random() * 1.1, hue: Math.random() });
        }
        go();
      },
      part: function () {
        if (REDUCED) return;
        var n = COARSE ? 50 : 90, t = performance.now();
        for (var i = 0; i < n; i++) {
          var side = Math.random() < .5 ? -1 : 1;
          list.push({ kind: 'out', t0: t + Math.random() * 260, dur: 1100 + Math.random() * 700, y0: Math.random() * innerHeight,
            vx: side * (innerWidth * (0.25 + Math.random() * 0.4)), vy: (Math.random() - .5) * 60, s: 0.6 + Math.random() * 1.2, hue: Math.random() });
        }
        go();
      }
    };
  })();

  /* ── the pointer: the seal turns toward it, with weight ─────────── */
  if (!REDUCED && !COARSE) {
    box.addEventListener('pointermove', function (e) { P.tx = e.clientX / innerWidth - 0.5; P.ty = e.clientY / innerHeight - 0.5; }, { passive: true });
    (function follow() {
      if (done) return;
      P.x += (P.tx - P.x) * 0.06; P.y += (P.ty - P.y) * 0.06;     // inertia: it arrives, it does not snap
      if (!box.classList.contains('fly')) {
        rig.style.transform = 'rotateX(' + (-P.y * 12).toFixed(2) + 'deg) rotateY(' + (P.x * 16).toFixed(2) + 'deg)';
        coin.style.setProperty('--sx', (38 - P.x * 60).toFixed(1) + '%'); coin.style.setProperty('--sy', (30 - P.y * 50).toFixed(1) + '%');
        box.style.setProperty('--pox', (50 + P.x * 6).toFixed(2) + '%');
      }
      requestAnimationFrame(follow);
    })();
  }
  window.addEventListener('resize', function () { measure(); motes.size(); if (GL) GL.size(); });

  /* ── F: the way through ─────────────────────────────────────────── */
  function chord() {
    var A;
    try { if (localStorage.getItem('lx-sound') !== '1') return; A = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
    var t = A.currentTime, out = A.createGain(); out.gain.value = 0.5; out.connect(A.destination);
    [[55, .5], [82.4, .3], [110, .22], [164.8, .1], [220, .06]].forEach(function (v) {   // A, its fifth and octaves: a hall resonating
      var o = A.createOscillator(), g = A.createGain(); o.type = 'sine'; o.frequency.value = v[0];
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v[1], t + 0.5); g.gain.exponentialRampToValueAtTime(0.0001, t + 3.2);
      o.connect(g); g.connect(out); o.start(t); o.stop(t + 3.3);
    });
    var len = A.sampleRate * 1.6, buf = A.createBuffer(1, len, A.sampleRate), d = buf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    var nz = A.createBufferSource(), bp = A.createBiquadFilter(), ng = A.createGain();   // air, as the doors part
    nz.buffer = buf; bp.type = 'bandpass'; bp.Q.value = 0.8;
    bp.frequency.setValueAtTime(300, t); bp.frequency.exponentialRampToValueAtTime(2400, t + 1.4);
    ng.gain.setValueAtTime(0.0001, t); ng.gain.exponentialRampToValueAtTime(0.12, t + 0.6); ng.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
    nz.connect(bp); bp.connect(ng); ng.connect(out); nz.start(t);
  }
  function finish() {
    if (done) return;
    done = true;
    timers.forEach(clearTimeout);
    try { localStorage.setItem('lx-intro-at', String(Date.now())); } catch (e) {}
    var brand = document.querySelector('.lxn-brand img'); if (brand) { brand.style.opacity = ''; brand.style.transition = ''; }
    root.classList.remove('lx-intro');
    root.classList.add('lx-introdone');
    if (box.parentNode) box.parentNode.removeChild(box);
    try { window.dispatchEvent(new Event('lunara:intro-done')); } catch (e) {}
    var main = document.querySelector('main'); if (main) { main.setAttribute('tabindex', '-1'); main.focus({ preventScroll: true }); }
  }
  function enter() {
    if (!ready || opening || done) return;
    opening = true;
    box.classList.remove('count');
    chord();
    if (REDUCED) { box.classList.add('out'); setTimeout(finish, 450); return; }
    // the seal goes home: to the emblem in the navigation, if it is there
    var brand = document.querySelector('.lxn-brand img'), b = rig.getBoundingClientRect();
    box.classList.add('fly');
    if (brand) {
      var t = brand.getBoundingClientRect(), s = t.width / (b.width * 0.766);  // the coin fills 76.6% of the 512 artwork, all of the 96
      brand.style.opacity = '0';
      rig.style.transform = 'translate(' + (t.left + t.width / 2 - (b.left + b.width / 2)).toFixed(1) + 'px,' + (t.top + t.height / 2 - (b.top + b.height / 2)).toFixed(1) + 'px) scale(' + s.toFixed(4) + ')';
      setTimeout(function () { brand.style.transition = 'opacity .4s ease'; brand.style.opacity = '1'; }, 1150);
    } else {
      rig.style.transform = 'scale(.4)'; rig.style.opacity = '0';
    }
    stage('open');
    ramp('O', 1, 600, outExpo);
    setTimeout(function () { ramp('O', 0, 900); ramp('F', 0, 1200); }, 500);
    motes.part();
    root.classList.add('lx-arrive');
    setTimeout(function () { root.classList.remove('lx-arrive'); }, 1600);
    setTimeout(finish, 1700);
  }
  function skip() {
    if (done || opening) return;
    opening = true;
    box.classList.add('out');
    setTimeout(finish, 650);
  }
  enterBtn.addEventListener('click', enter);
  skipBtn.addEventListener('click', skip);
  // A click anywhere on the scene, once it is ready, is also a way in.
  box.addEventListener('click', function (e) { if (ready && e.target !== skipBtn && !skipBtn.contains(e.target)) enter(); });
  document.addEventListener('keydown', function (e) {
    if (done) return;
    if (e.key === 'Escape') { e.preventDefault(); skip(); return; }
    if (e.key === 'Tab') {                                          // a dialog keeps focus inside itself
      var stops = [enterBtn, skipBtn].filter(function (b) { return !b.disabled; });
      var i = stops.indexOf(document.activeElement);
      e.preventDefault();
      stops[(i + (e.shiftKey ? stops.length - 1 : 1)) % stops.length].focus();
    }
  });

  /* ── the clock ──────────────────────────────────────────────────── */
  measure();
  if (REDUCED) {
    ['a', 'b', 'ring', 'c', 'd', 'e', 'e2'].forEach(stage);
    if (GL) { GL.A = 1; GL.L = 0; GL.C = 1; GL.draw(performance.now()); }
    at(300, function () { ready = true; stage('ready'); enterBtn.disabled = false; enterBtn.focus({ preventScroll: true }); });
    return;
  }
  at(250, function () { stage('a'); ramp('A', 1, 800, inOut); });
  at(950, function () { stage('b'); ramp('L', 1, 1000, outExpo); });
  at(2000, function () { stage('ring'); ramp('L', 0, 900, inOut); });
  at(2150, function () { motes.forge(); });
  at(2500, function () { stage('c'); });
  at(2700, function () { stage('d'); ramp('C', 1, 2600, inOut); ramp('A', 0.35, 2000); });
  at(3500, function () { stage('rake'); });
  at(4300, function () { stage('e'); });
  at(4950, function () { stage('e2'); });
  at(5700, function () {
    ready = true; stage('ready'); enterBtn.disabled = false; enterBtn.focus({ preventScroll: true });
    box.style.setProperty('--wait', WAIT + 'ms');
    requestAnimationFrame(function () { stage('count'); });
    at(WAIT + 150, enter);
  });
})();
