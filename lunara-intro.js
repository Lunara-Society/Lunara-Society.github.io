/* ═══════════════════════════════════════════════════════════════════
   THE THRESHOLD — the intro to lunarasociety.com
   ═══════════════════════════════════════════════════════════════════

   The seal assembles out of light: rays build in the dark, a grid floor
   runs into the haze, engraved rings draw themselves, the emblem is
   read out of a single scan line and settles, and after seven and a
   half seconds it waits to be touched. Touching it sends the visitor
   through: a shockwave, a burst of light, the seal flying into the
   camera, and the homepage arriving behind it.

   Once per visit. Never for crawlers or for a link with a #section.
   ?intro=1 plays it again; Escape or the faint "Skip" leaves at once.
   Reduced motion gets the seal and the door, without the film.
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var root = document.documentElement, box = document.getElementById('lx-intro');
  if (!box) return;
  if (!root.classList.contains('lx-intro')) { box.parentNode.removeChild(box); return; }

  var REDUCED = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  var $ = function (id) { return document.getElementById(id); };
  var seal = $('lxi-seal'), rig = $('lxi-rig'), stage = $('lxi-stage');
  var timers = [], done = false, ready = false;
  function at(ms, fn) { timers.push(setTimeout(fn, REDUCED ? Math.min(ms, 600) : ms)); }

  /* ── the rings: engraved, drawn on, turning ─────────────────────── */
  (function rings() {
    var svg = $('lxi-rings'), ns = 'http://www.w3.org/2000/svg', C = 500;
    function el(tag, attrs, parent) { var e = document.createElementNS(ns, tag); for (var k in attrs) e.setAttribute(k, attrs[k]); (parent || svg).appendChild(e); return e; }
    function circle(r, attrs, parent) { var c = el('circle', Object.assign({ cx: C, cy: C, r: r, class: 'draw' }, attrs), parent); c.style.setProperty('--len', (2 * Math.PI * r).toFixed(1)); return c; }
    var g1 = el('g', { class: 'spin', style: '--s:90s' });
    circle(250, { stroke: 'rgba(226,196,122,.55)', 'stroke-width': 1.2 }, g1);
    for (var i = 0; i < 120; i++) {                       // the bezel: a tick every three degrees
      var a = i * 3 * Math.PI / 180, long = i % 10 === 0, r1 = 250, r2 = long ? 270 : 260;
      el('line', { x1: C + Math.cos(a) * r1, y1: C + Math.sin(a) * r1, x2: C + Math.cos(a) * r2, y2: C + Math.sin(a) * r2,
        stroke: long ? 'rgba(255,236,190,.8)' : 'rgba(226,196,122,.35)', 'stroke-width': long ? 2 : 1, class: 'tick', opacity: 0 }, g1);
    }
    var g2 = el('g', { class: 'spin rev', style: '--s:120s' });
    el('path', { id: 'lxi-tp', d: 'M500 500m-300 0a300 300 0 1 1 600 0a300 300 0 1 1-600 0', stroke: 'none' }, g2);
    var t = el('text', {}, g2), tp = el('textPath', { href: '#lxi-tp' }, t);
    tp.textContent = 'LUNARA SOCIETY · CONSTITUTIONAL AUTHORITY FOR THE MACHINE ECONOMY · PASSPORT CONTROL · EST. MMXXVI · ';
    var g3 = el('g', { class: 'spin', style: '--s:40s' });
    circle(338, { stroke: 'rgba(127,224,176,.55)', 'stroke-width': 2, 'stroke-dasharray': '120 40 18 40 60 90', class: '' }, g3).style.opacity = '0';
    circle(338, { stroke: 'rgba(127,224,176,.12)', 'stroke-width': 1 }, g3);
    var g4 = el('g', { class: 'spin rev', style: '--s:200s' });
    circle(392, { stroke: 'rgba(226,196,122,.22)', 'stroke-width': 1 }, g4);
    for (var j = 0; j < 4; j++) {                           // four bracket marks, like a sight
      var b = j * Math.PI / 2 + Math.PI / 4;
      el('path', { d: 'M' + (C + Math.cos(b - .08) * 408) + ' ' + (C + Math.sin(b - .08) * 408) + ' A408 408 0 0 1 ' + (C + Math.cos(b + .08) * 408) + ' ' + (C + Math.sin(b + .08) * 408),
        stroke: 'rgba(255,236,190,.7)', 'stroke-width': 3 }, g4);
    }
    // ticks and the segmented ring arrive after their circles
    at(3300, function () { svg.querySelectorAll('.tick').forEach(function (l, k) { setTimeout(function () { l.setAttribute('opacity', 1); }, k * 6); }); g3.firstChild.style.transition = 'opacity 1.2s'; g3.firstChild.style.opacity = '1'; });
  })();

  /* ── the light: rays, haze, a grid floor and a seam ─────────────── */
  var GL = null;
  (function light() {
    var cv = $('lxi-gl'), gl = cv.getContext('webgl', { antialias: false, alpha: false, powerPreference: 'high-performance' });
    if (!gl) return;
    var FRAG = [
      'precision highp float;uniform vec2 R;uniform float T,P,B;uniform vec2 M;',
      'float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}',
      'float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h(i),h(i+vec2(1.,0.)),f.x),mix(h(i+vec2(0.,1.)),h(i+vec2(1.,1.)),f.x),f.y);}',
      'float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<5;i++){v+=a*n(p);p=p*2.03+vec2(1.7,9.2);a*=.5;}return v;}',
      'void main(){',
      ' vec2 uv=(gl_FragCoord.xy-.5*R)/R.y;vec2 c=uv-M*.025;float r=length(c),a=atan(c.y,c.x);',
      ' vec2 q=uv*1.3+vec2(T*.02,0.);float sm=fbm(q+fbm(q*1.8+vec2(T*.04,-T*.02)));',
      ' vec3 col=vec3(.02,.035,.04)*sm*2.+vec3(.08,.38,.36)*pow(sm,3.2)*.6*P;',
      ' float rays=pow(n(vec2(a*9.,T*.16))*.6+n(vec2(a*23.,-T*.11))*.4,3.);',
      ' float halo=exp(-r*3.4);',
      ' col+=vec3(1.,.76,.40)*(rays*smoothstep(1.5,.12,r)*.65*(.5+.5*sm)+halo*.85)*P;',
      ' float y=uv.y+.30;',
      ' if(y<0.){float z=.32/(-y);vec2 g=vec2(uv.x*z*1.4,z+T*.5);vec2 gr=abs(fract(g)-.5);',
      '  float ln=smoothstep(.47,.5,max(gr.x,gr.y));float fog=exp(-z*.16)*smoothstep(0.,.05,-y);',
      '  float pulse=exp(-pow(z-mod(T*2.6,24.),2.)*.6);',
      '  col+=vec3(.25,.85,.75)*(ln*.32+pulse*.25)*fog*P;}',
      ' float fl=exp(-pow((uv.y+.004*sin(T))*70.,2.))*exp(-abs(uv.x)*1.3);',
      ' col+=vec3(.55,.78,1.)*fl*(.25+.9*P);',
      ' col+=vec3(1.,.92,.75)*B*exp(-r*(2.4-B*2.))*1.8;',
      ' col*=smoothstep(1.6,.25,r);',
      ' col=col/(1.+col*.35);',                                   // a gentle filmic roll-off
      ' gl_FragColor=vec4(col,1.);}'
    ].join('\n');
    function sh(type, src) { var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; }
    try {
      var prog = gl.createProgram();
      gl.attachShader(prog, sh(gl.VERTEX_SHADER, 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}'));
      gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
      gl.linkProgram(prog); gl.useProgram(prog);
    } catch (e) { return; }
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    var loc = gl.getAttribLocation(prog, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    var U = {}; ['R', 'T', 'P', 'B', 'M'].forEach(function (k) { U[k] = gl.getUniformLocation(prog, k); });
    var scale = 0.75, W, H;
    function size() { W = innerWidth; H = innerHeight; cv.width = Math.round(W * scale); cv.height = Math.round(H * scale); gl.viewport(0, 0, cv.width, cv.height); }
    size(); window.addEventListener('resize', size);
    GL = { p: 0, b: 0, mx: 0, my: 0, tx: 0, ty: 0 };
    var t0 = performance.now(), last = t0, slow = 0;
    (function frame(now) {
      if (done) return;
      var dt = now - last; last = now;
      if (dt > 40 && dt < 300 && ++slow > 20 && scale > 0.4) { scale -= 0.15; slow = 0; size(); }
      GL.mx += (GL.tx - GL.mx) * 0.05; GL.my += (GL.ty - GL.my) * 0.05;
      gl.uniform2f(U.R, cv.width, cv.height);
      gl.uniform1f(U.T, REDUCED ? 4 : (now - t0) / 1000);
      gl.uniform1f(U.P, GL.p); gl.uniform1f(U.B, GL.b);
      gl.uniform2f(U.M, GL.mx, GL.my);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      if (!REDUCED || GL.b > 0) requestAnimationFrame(frame); else setTimeout(function () { requestAnimationFrame(frame); }, 200);
    })(t0);
  })();
  function ramp(key, to, ms, ease) {
    if (!GL) return;
    var from = GL[key], t0 = performance.now();
    (function f(now) { var k = Math.min(1, (now - t0) / ms); GL[key] = from + (to - from) * (ease ? ease(k) : k); if (k < 1 && !done) requestAnimationFrame(f); })(t0);
  }
  var inOut = function (k) { return k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2; };

  /* ── the read-out ───────────────────────────────────────────────── */
  var log = $('lxi-log');
  function line(label, result, ms) {
    at(ms, function () {
      var row = document.createElement('div'); log.appendChild(row);
      var text = label + ' ', dots = 20 - label.length, i = 0;
      (function type() {
        if (i <= text.length) { row.textContent = text.slice(0, i++); return setTimeout(type, 22); }
        row.textContent = text + '.'.repeat(Math.max(2, dots)) + ' ';
        var b = document.createElement('b'); b.textContent = result; row.appendChild(b);
      })();
    });
  }
  line('PASSPORT CONTROL', 'ARMED', 500);
  line('CHANNEL', 'SECURE', 1500);
  line('ED25519 SEAL', 'VALID', 2500);
  line('REGISTER', 'ONLINE', 3500);
  line('VISITOR', 'UNVERIFIED', 4800);
  line('THRESHOLD', 'AWAITING TOUCH', 6900);
  (function clock() {
    var c = $('lxi-clock'); if (!c || done) return;
    c.textContent = new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
    setTimeout(clock, 1000);
  })();

  /* ── the title, resolving out of noise ──────────────────────────── */
  function decode(el, text, ms) {
    var G = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789<>/#', t0 = performance.now();
    (function f(now) {
      var k = Math.min(1, (now - t0) / ms), n = Math.floor(k * text.length), out = '';
      for (var i = 0; i < text.length; i++) out += i < n || text[i] === ' ' ? text[i] : G[(Math.random() * G.length) | 0];
      el.textContent = out;
      if (k < 1 && !done) requestAnimationFrame(f); else el.textContent = text;
    })(t0);
  }

  /* ── sound, which only a touch may start ─────────────────────────── */
  function boom() {
    var A; try { if (localStorage.getItem('lx-sound') === '0') return; A = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
    var t = A.currentTime, out = A.createGain(); out.gain.value = 0.9; out.connect(A.destination);
    var o = A.createOscillator(), g = A.createGain();                      // the drop
    o.type = 'sine'; o.frequency.setValueAtTime(90, t); o.frequency.exponentialRampToValueAtTime(28, t + 1.4);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.7, t + 0.04); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.8);
    o.connect(g); g.connect(out); o.start(t); o.stop(t + 1.9);
    var len = A.sampleRate * 1.4, buf = A.createBuffer(1, len, A.sampleRate), d = buf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    var nz = A.createBufferSource(), bp = A.createBiquadFilter(), ng = A.createGain();   // the rush of air
    nz.buffer = buf; bp.type = 'bandpass'; bp.Q.value = 1.2;
    bp.frequency.setValueAtTime(180, t); bp.frequency.exponentialRampToValueAtTime(5200, t + 1.1);
    ng.gain.setValueAtTime(0.0001, t); ng.gain.exponentialRampToValueAtTime(0.35, t + 0.5); ng.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
    nz.connect(bp); bp.connect(ng); ng.connect(out); nz.start(t);
    [523.25, 783.99, 1046.5, 1567.98].forEach(function (f, k) {         // the shimmer, a fifth above
      var s = A.createOscillator(), sg = A.createGain(); s.type = 'sine'; s.frequency.value = f * (1 + (k % 2 ? 0.003 : -0.003));
      sg.gain.setValueAtTime(0.0001, t + 0.25); sg.gain.exponentialRampToValueAtTime(0.06 / (k + 1), t + 0.5); sg.gain.exponentialRampToValueAtTime(0.0001, t + 3.2);
      s.connect(sg); sg.connect(out); s.start(t + 0.25); s.stop(t + 3.3);
    });
  }

  /* ── the timeline ───────────────────────────────────────────────── */
  at(200, function () { box.classList.add('p1'); });
  at(700, function () { ramp('p', 1, 3600, inOut); });
  at(2000, function () { box.classList.add('p2'); });
  at(3200, function () { box.classList.add('p3'); });
  at(4600, function () { box.classList.add('p4'); });
  at(5600, function () { decode($('lxi-title'), 'The standard for verified AI', 1500); });
  at(6200, function () { if (!REDUCED) { box.classList.add('glitch'); setTimeout(function () { box.classList.remove('glitch'); }, 110); } });
  at(7500, function () {
    ready = true; box.classList.add('ready');
    seal.disabled = false; seal.focus({ preventScroll: true });
  });
  // An occasional glitch while it waits, as if the signal were live.
  (function flicker() {
    if (done) return;
    if (ready && !REDUCED && Math.random() < 0.5) { box.classList.add('glitch'); setTimeout(function () { box.classList.remove('glitch'); }, 70 + Math.random() * 90); }
    setTimeout(flicker, 2200 + Math.random() * 2600);
  })();

  // The seal turns toward the pointer, the foil against it, and the light follows.
  if (!REDUCED) box.addEventListener('pointermove', function (e) {
    var x = e.clientX / innerWidth - 0.5, y = e.clientY / innerHeight - 0.5;
    rig.style.transform = 'rotateX(' + (-y * 16).toFixed(2) + 'deg) rotateY(' + (x * 22).toFixed(2) + 'deg)';
    seal.style.setProperty('--fx', (50 - x * 100).toFixed(0) + '%'); seal.style.setProperty('--fy', (50 - y * 100).toFixed(0) + '%');
    if (GL) { GL.tx = x * 2; GL.ty = -y * 2; }
  });
  seal.addEventListener('pointerenter', function () { if (ready) box.classList.add('hot'); });
  seal.addEventListener('pointerleave', function () { box.classList.remove('hot'); });

  /* ── the way through ─────────────────────────────────────────────── */
  function finish() {
    done = true;
    timers.forEach(clearTimeout);
    try { sessionStorage.setItem('lx-intro-seen', '1'); } catch (e) {}
    root.classList.add('lx-introdone');
    root.classList.remove('lx-intro');
    if (box.parentNode) box.parentNode.removeChild(box);
    try { window.dispatchEvent(new Event('lunara:intro-done')); } catch (e) {}
    var main = document.querySelector('main,#main,h1'); if (main && main.focus) { main.setAttribute('tabindex', '-1'); main.focus({ preventScroll: true }); }
  }
  function enter() {
    if (!ready || box.classList.contains('enter')) return;
    box.classList.remove('hot'); box.classList.add('enter');
    boom();
    if (!REDUCED) {
      ['s1', 's2'].forEach(function (k) { var s = document.createElement('i'); s.className = 'lxi-shock ' + k; box.appendChild(s); });
      ramp('b', 1, 900, function (k) { return 1 - Math.pow(1 - k, 3); });
    }
    setTimeout(function () {
      root.classList.add('lx-arrive');
      box.classList.add('out');
      setTimeout(function () { root.classList.remove('lx-arrive'); }, 1700);
    }, REDUCED ? 200 : 1050);
    setTimeout(finish, REDUCED ? 900 : 2200);
  }
  function skip() {
    if (box.classList.contains('out')) return;
    box.classList.add('out');
    setTimeout(finish, 800);
  }
  seal.addEventListener('click', enter);
  $('lxi-skip').addEventListener('click', skip);
  document.addEventListener('keydown', function (e) {
    if (done) return;
    if (e.key === 'Escape') skip();
    else if ((e.key === 'Enter' || e.key === ' ') && ready && document.activeElement !== $('lxi-skip')) { e.preventDefault(); enter(); }
  });
})();
