/* ═══════════════════════════════════════════════════════════════════
   THE ENGINE: light, depth and material, site-wide
   ═══════════════════════════════════════════════════════════════════

   Loaded by lunara-shell.js, so every page that carries the shell
   carries this. It works in the materials of lunara-materials.css
   (obsidian, champagne gold, smoked glass, light) and adds without
   removing anything:

     THE ENVIRONMENT  a WebGL volume behind every page: obsidian, a
                      moonlight key from the upper right that leans
                      with the pointer, a slow smoke that only shows
                      where the light falls. No stars, no particles.
     THE REVEAL       panels settle into place as they arrive, and a
                      single sheen crosses them once; section labels
                      are drawn on from the left, like an engraving.
     THE MATERIAL     panels turn very slightly toward the pointer and
                      catch a specular light and an edge light where it
                      is. No rainbow foil: these are not stickers.
     THE VEIL         leaving a page lowers a veil of obsidian on a
                      hairline of gold (pages open on the same veil
                      lifting, in lunara-shell.css). Between pages a
                      lock may play instead (lunara-locks.js).
     THE STAMP        window.LunaraFX.stamp(el, status): the verdict
                      stamp, for any page that returns a real verdict
                      (the homepage register lookup uses it).

   Rules, the same as every other script here:
     - additive: if any part fails, the page is exactly as it was;
     - prefers-reduced-motion gets none of the motion;
     - no figure, date or claim is written by this file;
     - sound is off unless the visitor has switched it on (lx-sound=1);
     - the environment stops drawing when the tab is hidden, and lowers
       its own resolution if the machine cannot keep up.
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.__lunaraEngine) return;
  window.__lunaraEngine = true;

  var REDUCED = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  var FINE = !!(window.matchMedia && matchMedia('(hover: hover) and (pointer: fine)').matches);

  function safe(name, fn) { try { fn(); } catch (e) { if (window.console) console.warn('[lunara-engine] ' + name + ' skipped:', e && e.message); } }
  function field(fn) { if (window.LunaraField) window.LunaraField.on(fn); else (window.__lxField = window.__lxField || []).push(fn); }

  var EASE = 'cubic-bezier(.16,1,.3,1)';
  var CSS = [
    '#lxe-sky{position:fixed;inset:0;width:100vw;height:100vh;z-index:-1;pointer-events:none;display:block}',
    'html.lxe-gl #lxc-sky,html.lxe-gl #lx-dust{display:none!important}',
    /* the veil, lowered as a page is left */
    '#lxe-veil{position:fixed;inset:0;z-index:2147483600;pointer-events:none;background:#060709;opacity:0;transition:opacity .3s ease}',
    '#lxe-veil i{position:absolute;left:50%;top:50%;width:46vw;height:1px;margin-left:-23vw;transform:scaleX(0);',
    '  background:linear-gradient(90deg,transparent,rgba(240,217,155,.85),transparent);box-shadow:0 0 18px rgba(240,217,155,.35);transition:transform .42s ' + EASE + '}',
    '#lxe-veil.go{opacity:1}#lxe-veil.go i{transform:scaleX(1)}',
    /* the reveal: a panel settles, a sheen crosses it once */
    '.lxe-rise{opacity:0;translate:0 22px}',
    '.lxe-rise.lxe-in{opacity:1;translate:0 0;transition:opacity .9s ease,translate 1.2s ' + EASE + '}',
    '.lxe-sheen{position:absolute;inset:0;border-radius:inherit;pointer-events:none;z-index:3;overflow:hidden}',
    '.lxe-sheen::before{content:"";position:absolute;top:-20%;bottom:-20%;width:40%;left:-45%;transform:skewX(-14deg);',
    '  background:linear-gradient(90deg,transparent,rgba(255,240,205,.075),transparent);animation:lxeSheen 1.5s cubic-bezier(.45,0,.2,1) .25s forwards}',
    '@keyframes lxeSheen{to{left:125%}}',
    /* labels drawn on from the left */
    '.lxe-etch{clip-path:inset(0 100% 0 0)}',
    '.lxe-etch.lxe-in{clip-path:inset(0 -2% 0 0);transition:clip-path 1.1s ' + EASE + '}',
    /* material: a slight turn, a specular light, an edge light */
    '.lxe-tilt{transition:transform .7s ' + EASE + ',box-shadow .5s ease}',
    '.lxe-tilt.lxe-live{transition:transform .25s ease-out,box-shadow .35s ease;box-shadow:0 34px 70px -38px rgba(0,0,0,.9),inset 0 1px 0 rgba(255,255,255,.05)}',
    '.lxe-glare,.lxe-edge{position:absolute;inset:0;border-radius:inherit;pointer-events:none;opacity:0;transition:opacity .45s ease;z-index:2}',
    '.lxe-glare{background:radial-gradient(520px circle at var(--gx,50%) var(--gy,50%),rgba(255,242,214,.11),rgba(240,217,155,.04) 34%,transparent 62%)}',
    '.lxe-edge{padding:1px;background:radial-gradient(320px circle at var(--gx,50%) var(--gy,50%),rgba(255,238,200,.95),rgba(240,217,155,.38) 34%,rgba(240,217,155,0) 70%);',
    '  -webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask:linear-gradient(#000 0 0) content-box exclude,linear-gradient(#000 0 0)}',
    '.lxe-tilt.lxe-live .lxe-glare,.lxe-tilt.lxe-live .lxe-edge{opacity:1}',
    '.lxe-mag{transition:translate .45s ' + EASE + '}',
    /* gold that catches the light once, as the heading arrives, and rests */
    '.lxe-shine{background:linear-gradient(100deg,#B8955A 0%,#E2C47A 34%,#FFF3D2 50%,#E2C47A 66%,#B8955A 100%);background-size:280% 100%;background-position:100% 0;',
    '  -webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;animation:lxeShine 2.8s ' + EASE + ' .5s forwards}',
    '@keyframes lxeShine{to{background-position:22% 0}}',
    /* the stamp, for a real verdict */
    '.lxe-stamp{position:absolute;z-index:8;pointer-events:none;width:150px;height:150px;opacity:0}',
    '.lxe-stamp svg{width:100%;height:100%;filter:drop-shadow(0 0 8px currentColor)}',
    '.lxe-stamp.slam{animation:lxeSlam .55s cubic-bezier(.3,1.6,.5,1) forwards}',
    '@keyframes lxeSlam{0%{opacity:0;transform:scale(2.6) rotate(-4deg)}60%{opacity:1;transform:scale(.94) rotate(-14deg)}100%{opacity:.92;transform:scale(1) rotate(-12deg)}}',
    '.lxe-ink{position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:2147483400}',
    '@keyframes lxeQuake{0%,100%{transform:none}25%{transform:translate(2px,3px)}50%{transform:translate(-3px,-1px)}75%{transform:translate(1px,-2px)}}',
    '.lxe-quake{animation:lxeQuake .32s ease}'
  ].join('\n');

  function injectCss() {
    if (document.getElementById('lxe-css')) return;
    var st = document.createElement('style');
    st.id = 'lxe-css'; st.textContent = CSS;
    document.head.appendChild(st);
  }

  /* ── THE ENVIRONMENT ────────────────────────────────────────────── */
  var FRAG = [
    'precision highp float;',
    'uniform vec2 R;uniform float T;uniform vec2 M;uniform float S;',
    'float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}',
    'float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);',
    ' return mix(mix(h(i),h(i+vec2(1.,0.)),f.x),mix(h(i+vec2(0.,1.)),h(i+vec2(1.,1.)),f.x),f.y);}',
    'float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<4;i++){v+=a*n(p);p=p*2.03+vec2(1.7,9.2);a*=.5;}return v;}',
    'void main(){',
    ' vec2 uv=(gl_FragCoord.xy-.5*R)/R.y;',
    ' vec2 key=vec2(.62*R.x/R.y,.55)+M*vec2(.10,.06);',                 // the moonlight, leaning with the pointer
    ' vec2 d=uv-key;float r=length(d);',
    ' vec2 q=uv*1.1+vec2(T*.008,S*.00008);',
    ' float sm=fbm(q+fbm(q*1.5+vec2(T*.02,-T*.008)));',                 // smoke folding into itself
    ' float lit=exp(-r*1.15);',
    ' vec3 col=vec3(1.,.86,.64)*lit*(.020+.085*pow(sm,2.2));',          // smoke shows only where the light falls
    ' col+=vec3(.62,.70,.82)*exp(-r*3.2)*.028;',                        // the cool core of the key
    ' float ang=atan(d.y,d.x);',
    ' col+=vec3(1.,.88,.66)*pow(max(0.,n(vec2(ang*4.,T*.05))),3.)*exp(-r*.9)*.035*sm;', // one or two soft shafts, no more
    ' col+=vec3(.78,.68,.50)*exp(-pow((uv.y+.62)*4.,2.))*.022;',        // the far horizon, warm
    ' col*=smoothstep(1.6,.2,length(uv*vec2(.8,1.)));',
    ' col+=(h(gl_FragCoord.xy+fract(T))-.5)/255.;',                     // dither: dark gradients without bands
    ' float a=clamp(max(col.r,max(col.g,col.b))*1.4,0.,1.);',
    ' gl_FragColor=vec4(min(col,vec3(a)),a);}'                          // premultiplied: light laid over the page
  ].join('\n');
  var VERT = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}';

  function buildEnvironment() {
    if (REDUCED || document.getElementById('lxe-sky') || document.documentElement.hasAttribute('data-no-haze')) return;
    var cv = document.createElement('canvas');
    cv.id = 'lxe-sky'; cv.setAttribute('aria-hidden', 'true');
    var gl = cv.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false, powerPreference: 'low-power' });
    if (!gl) return;
    function sh(type, src) { var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; }
    var prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error('link');
    gl.useProgram(prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    var loc = gl.getAttribLocation(prog, 'p');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    var U = {}; ['R', 'T', 'M', 'S'].forEach(function (k) { U[k] = gl.getUniformLocation(prog, k); });

    var body = document.body, root = document.documentElement;
    var bcs = getComputedStyle(body);
    if (bcs.backgroundImage !== 'none' || !/rgba\(0, 0, 0, 0\)|transparent/.test(bcs.backgroundColor)) {
      var rcs = getComputedStyle(root);
      if (rcs.backgroundImage === 'none' && /rgba\(0, 0, 0, 0\)|transparent/.test(rcs.backgroundColor)) {
        ['backgroundColor', 'backgroundImage', 'backgroundSize', 'backgroundPosition', 'backgroundRepeat', 'backgroundAttachment']
          .forEach(function (k) { root.style[k] = bcs[k]; });
      }
      body.style.background = 'transparent';
    }
    body.insertBefore(cv, body.firstChild);
    root.classList.add('lxe-gl');

    // Light and smoke are soft by nature, so they are drawn at reduced resolution.
    var scale = FINE ? 0.55 : 0.4, slow = 0, last = 0, running = !document.hidden, m = { x: 0, y: 0 };
    function size() {
      cv.width = Math.max(1, Math.round(innerWidth * scale)); cv.height = Math.max(1, Math.round(innerHeight * scale));
      gl.viewport(0, 0, cv.width, cv.height);
    }
    size();

    /* The smoke moves while the reader does, and rests when they stop.
       A drift nobody is watching still costs a phone its battery and a
       laptop its fan, and a page left open in a tab was drawing it for
       ever. Its clock advances only while it is drawn, so it picks up
       where it left off instead of jumping. */
    var IDLE = 7000, until = 0, sleeping = true, clock = 0;
    function wake() {
      until = performance.now() + IDLE;
      if (sleeping && running) { sleeping = false; last = 0; requestAnimationFrame(frame); }
    }
    window.addEventListener('resize', function () { size(); wake(); });
    window.addEventListener('scroll', wake, { passive: true });
    field(function (s) { m.x = s.x * 2; m.y = -s.y * 2; wake(); });
    document.addEventListener('visibilitychange', function () {
      running = !document.hidden;
      if (running) wake();
    });
    function frame(now) {
      if (!running || now > until) { sleeping = true; return; }       // the last frame stays on the glass
      var dt = last ? now - last : 33;
      if (last && dt < (FINE ? 30 : 45)) { requestAnimationFrame(frame); return; }   // smoke does not need 60 fps
      last = now;
      if (dt > 70 && dt < 300) slow++; else slow = Math.max(0, slow - 1);
      if (slow > 30 && scale > 0.3) { scale = Math.max(0.3, scale - 0.12); slow = 0; size(); }
      clock += Math.min(dt, 100);
      gl.uniform2f(U.R, cv.width, cv.height);
      gl.uniform1f(U.T, clock / 1000);
      gl.uniform2f(U.M, m.x, m.y);
      gl.uniform1f(U.S, (window.scrollY || 0) * scale);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      requestAnimationFrame(frame);
    }
    wake();
  }

  /* ── THE VEIL ───────────────────────────────────────────────────── */
  function veil() {
    if (REDUCED) return;
    var v = document.createElement('div');
    v.id = 'lxe-veil'; v.setAttribute('aria-hidden', 'true');
    v.innerHTML = '<i></i>';
    document.body.appendChild(v);
    document.addEventListener('click', function (e) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      var a = e.target.closest && e.target.closest('a[href]');
      if (!a || a.target && a.target !== '_self' || a.hasAttribute('download') || a.closest('[data-no-shutter]')) return;
      var url;
      try { url = new URL(a.getAttribute('href'), location.href); } catch (x) { return; }
      if (url.origin !== location.origin || !/^https?:$/.test(url.protocol)) return;
      if (url.pathname === location.pathname && url.search === location.search) return; // same page, an anchor
      if (/\.(json|txt|xml|pdf|png|jpe?g|zip|yaml)$/i.test(url.pathname)) return;     // files open as files
      e.preventDefault();
      // A lock may play between the pages (lunara-locks.js); otherwise the veil.
      if (window.LunaraLocks) { window.LunaraLocks.open(url.href); return; }
      v.classList.add('go');
      setTimeout(function () { location.href = url.href; }, 300);
    });
    // Coming back through the history restores this page as it was left.
    window.addEventListener('pageshow', function (e) { if (e.persisted) v.classList.remove('go'); });
  }

  /* ── THE MATERIAL ───────────────────────────────────────────────── */
  var TILT = '[data-tilt],.card,.lxs-panel,.t3c,.stat,.pod,.mv,.lgt-list a,.arch-track,.pillar,.tier-card,.pricing-card,.lx-card';
  function tilt(el) {
    // A panel you type into stays still; so does anything opted out.
    if (el.__lxeTilt || el.closest('[data-no-tilt]') || el.querySelector('input,textarea,select')) return;
    el.__lxeTilt = true;
    el.classList.add('lxe-tilt');
    if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
    ['lxe-glare', 'lxe-edge'].forEach(function (c) { var g = document.createElement('span'); g.className = c; g.setAttribute('aria-hidden', 'true'); el.appendChild(g); });
    var max = el.offsetWidth > 700 ? 1.2 : 3;
    // A panel inside something that already turns in 3D (the homepage rack) takes the light but
    // not a second turn: two rotations fight, and the parent's plane starts winning the pointer.
    var turns = !(el.parentElement && getComputedStyle(el.parentElement).transformStyle === 'preserve-3d');
    // and it sits a pixel in front of that parent's plane, or the two tie for the pointer
    if (!turns) el.style.translate = '0 0 1px';
    el.addEventListener('pointermove', function (e) {
      var b = el.getBoundingClientRect();
      var x = (e.clientX - b.left) / b.width, y = (e.clientY - b.top) / b.height;
      el.classList.add('lxe-live');
      if (turns) el.style.transform = 'perspective(1100px) rotateX(' + ((0.5 - y) * max).toFixed(2) + 'deg) rotateY(' + ((x - 0.5) * max).toFixed(2) + 'deg) translateZ(6px)';
      el.style.setProperty('--gx', (x * 100).toFixed(1) + '%');
      el.style.setProperty('--gy', (y * 100).toFixed(1) + '%');
    });
    el.addEventListener('pointerleave', function () { el.classList.remove('lxe-live'); if (turns) el.style.transform = ''; });
  }

  // Primary actions lean a little toward the pointer: they are the things to press.
  var MAG = '.door,.btn,.lx-buy,.gate button,.pgate button,.lxn-cta,.lxn-apply';
  function magnet(el) {
    if (el.__lxeMag) return;
    el.__lxeMag = true;
    el.classList.add('lxe-mag');
    el.addEventListener('pointermove', function (e) {
      var b = el.getBoundingClientRect();
      var x = e.clientX - (b.left + b.width / 2), y = e.clientY - (b.top + b.height / 2);
      el.style.translate = (x * 0.12).toFixed(1) + 'px ' + (y * 0.2).toFixed(1) + 'px';
    });
    el.addEventListener('pointerleave', function () { el.style.translate = ''; });
  }

  /* ── THE REVEAL ─────────────────────────────────────────────────── */
  var io = null;
  function observer() {
    if (io || !('IntersectionObserver' in window)) return io;
    io = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (!e.isIntersecting) return;
        var el = e.target; io.unobserve(el);
        el.classList.add('lxe-in');
        if (el.__lxeRise) sheen(el);
        setTimeout(function () { el.classList.remove('lxe-rise', 'lxe-etch', 'lxe-in'); }, 1500);
      });
    }, { rootMargin: '0px 0px -8% 0px' });
    // Nothing may stay hidden: if the observer never fires, show everything.
    setTimeout(function () {
      document.querySelectorAll('.lxe-rise:not(.lxe-in),.lxe-etch:not(.lxe-in)').forEach(function (el) {
        var r = el.getBoundingClientRect(); if (r.top < innerHeight && r.bottom > 0) el.classList.add('lxe-in');
      });
    }, 4000);
    return io;
  }
  function sheen(el) {
    if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
    var s = document.createElement('span'); s.className = 'lxe-sheen'; s.setAttribute('aria-hidden', 'true');
    el.appendChild(s);
    setTimeout(function () { if (s.parentNode) s.parentNode.removeChild(s); }, 2000);
  }
  function reveal(els, cls, flag) {
    if (!observer()) return;
    var vh = innerHeight;
    els.forEach(function (el, i) {
      if (el[flag] || el.getBoundingClientRect().top < vh) return; // never hide what is already on screen
      el[flag] = true;
      el.classList.add(cls);
      el.style.transitionDelay = ((i % 3) * 90) + 'ms';
      setTimeout(function () { el.style.transitionDelay = ''; }, 3000);
      io.observe(el);
    });
  }

  function shine() {
    document.querySelectorAll('h1 em, h2 em').forEach(function (em) {
      var cs = getComputedStyle(em);
      if (cs.backgroundImage !== 'none' || em.closest('[data-no-shine]')) return;
      var m = cs.color.match(/\d+/g); if (!m) return;
      var r = +m[0], g = +m[1], b = +m[2];
      if (r > 170 && g > 140 && b < 150 && r > b + 50) em.classList.add('lxe-shine');
    });
  }

  /* ── THE STAMP ──────────────────────────────────────────────────── */
  var AC = null;
  function audio() {
    try { if (localStorage.getItem('lx-sound') !== '1') return null; } catch (e) { return null; }
    try { AC = AC || new (window.AudioContext || window.webkitAudioContext)(); if (AC.state === 'suspended') AC.resume(); } catch (e) { AC = null; }
    return AC;
  }
  function thud() {
    var a = audio(); if (!a) return;
    var t = a.currentTime, o = a.createOscillator(), g = a.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(38, t + 0.28);
    g.gain.setValueAtTime(0.45, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
    o.connect(g); g.connect(a.destination); o.start(t); o.stop(t + 0.42);
  }
  // Ink thrown off by the stamp: particles, because something has just been decided.
  function burst(x, y, color) {
    var cv = document.createElement('canvas'); cv.className = 'lxe-ink'; cv.setAttribute('aria-hidden', 'true');
    document.body.appendChild(cv);
    var dpr = Math.min(2, window.devicePixelRatio || 1), W = window.innerWidth, H = window.innerHeight;
    cv.width = W * dpr; cv.height = H * dpr;
    var cx = cv.getContext('2d'); cx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var ps = [];
    for (var i = 0; i < 60; i++) {
      var a = Math.random() * Math.PI * 2, v = 2 + Math.random() * 7;
      ps.push({ x: x + Math.cos(a) * 40, y: y + Math.sin(a) * 40, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 1.2, r: 1 + Math.random() * 2.4, life: 1 });
    }
    var t0 = performance.now();
    (function f(now) {
      var k = (now - t0) / 1000;
      cx.clearRect(0, 0, W, H);
      cx.globalCompositeOperation = 'lighter';
      cx.strokeStyle = color; cx.globalAlpha = Math.max(0, 0.6 - k * 1.5); cx.lineWidth = 2;
      cx.beginPath(); cx.arc(x, y, 70 + k * 280, 0, Math.PI * 2); cx.stroke();
      ps.forEach(function (p) {
        p.x += p.vx; p.y += p.vy; p.vy += 0.25; p.vx *= 0.97; p.life -= 0.022;
        if (p.life <= 0) return;
        cx.globalAlpha = p.life; cx.fillStyle = color; cx.beginPath(); cx.arc(p.x, p.y, p.r, 0, Math.PI * 2); cx.fill();
      });
      if (k < 1.2) requestAnimationFrame(f); else if (cv.parentNode) cv.parentNode.removeChild(cv);
    })(t0);
  }
  var STAMP = {
    verified: ['VERIFIED', 'NAMED REVIEW', '#7FE0B0'],
    revoked: ['REVOKED', 'WITHDRAWN', '#F2C46B'],
    expired: ['EXPIRED', 'TERM ENDED', '#F2C46B'],
    not_registered: ['NOT REGISTERED', 'NO NAMED REVIEW', '#FF8A7A']
  };
  function stampSvg(t) {
    var big = t[0].length > 9 ? 17 : 26;
    return '<svg viewBox="0 0 240 240" fill="none" stroke="currentColor"><defs><path id="lxe-sc" d="M120 120m-92 0a92 92 0 1 1 184 0a92 92 0 1 1-184 0"/></defs>'
      + '<circle cx="120" cy="120" r="108" stroke-width="5"/><circle cx="120" cy="120" r="78" stroke-width="2"/>'
      + '<text font-family="IBM Plex Mono,monospace" font-size="13" letter-spacing="4" fill="currentColor" stroke="none"><textPath href="#lxe-sc">LUNARA SOCIETY · PASSPORT CONTROL · REGISTER ·</textPath></text>'
      + '<rect x="18" y="100" width="204" height="44" fill="#0d1016" stroke-width="3"/>'
      + '<text x="120" y="' + (big === 26 ? 131 : 128) + '" text-anchor="middle" font-family="Inter,sans-serif" font-weight="700" font-size="' + big + '" letter-spacing="2" fill="currentColor" stroke="none">' + t[0] + '</text>'
      + '<text x="120" y="172" text-anchor="middle" font-family="IBM Plex Mono,monospace" font-size="11" letter-spacing="3" fill="currentColor" stroke="none">' + t[1] + '</text></svg>';
  }
  function stamp(host, status, where) {
    if (!host) return;
    var t = STAMP[status]; if (!t) return;
    var old = host.querySelector('.lxe-stamp'); if (old) old.parentNode.removeChild(old);
    if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
    var s = document.createElement('div'); s.className = 'lxe-stamp'; s.setAttribute('aria-hidden', 'true');
    s.style.color = t[2];
    where = where || {}; s.style.right = (where.right != null ? where.right : 14) + 'px'; s.style.bottom = (where.bottom != null ? where.bottom : 10) + 'px';
    s.innerHTML = stampSvg(t);
    host.appendChild(s);
    if (REDUCED) { s.style.opacity = '.92'; s.style.transform = 'rotate(-12deg)'; return; }
    void s.offsetWidth; s.classList.add('slam');
    setTimeout(function () {
      var b = s.getBoundingClientRect();
      burst(b.left + b.width / 2, b.top + b.height / 2, t[2]); thud();
      host.classList.remove('lxe-quake'); void host.offsetWidth; host.classList.add('lxe-quake');
    }, 300);
  }
  window.LunaraFX = { stamp: stamp, burst: burst, thud: thud };

  function scan() {
    if (REDUCED) return;
    if (FINE) document.querySelectorAll(TILT).forEach(tilt);
    if (FINE) document.querySelectorAll(MAG).forEach(magnet);
    reveal([].slice.call(document.querySelectorAll('.card,.lxs-panel,.t3c,.stat,.mv,.pillar,.tier-card,.arch-track,.pod,.lx-card')), 'lxe-rise', '__lxeRise');
    reveal([].slice.call(document.querySelectorAll('.kicker,.eyebrow,.section-label,.lxs-head,.t3k,.pl')), 'lxe-etch', '__lxeEtch');
    shine();
  }

  function loadField() {
    if (window.LunaraField || document.querySelector('script[src*="lunara-field.js"]')) return;
    var s = document.createElement('script'); s.src = '/lunara-field.js'; s.defer = true;
    document.head.appendChild(s);
  }

  function boot() {
    safe('css', injectCss);
    safe('field', loadField);
    // While the threshold plays, it has the graphics card to itself.
    if (document.documentElement.classList.contains('lx-intro')) window.addEventListener('lunara:intro-done', function () { safe('environment', buildEnvironment); });
    else safe('environment', buildEnvironment);
    safe('veil', veil);
    safe('material', scan);
    if (!REDUCED && 'MutationObserver' in window) {
      var pending = false;
      new MutationObserver(function () {
        if (pending) return; pending = true;
        setTimeout(function () { pending = false; safe('material', scan); }, 250);
      }).observe(document.body, { childList: true, subtree: true });
    }
  }
  window.LunaraEngine = { tilt: tilt, rescan: function () { safe('material', scan); } };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
