/* ═══════════════════════════════════════════════════════════════════
   THE ENGINE — light, depth and the passport's language, site-wide
   ═══════════════════════════════════════════════════════════════════

   Loaded by lunara-shell.js, so every page that carries the shell
   carries this. It speaks the visual language of Passport Control
   everywhere, and adds without removing anything:

     THE HAZE       a WebGL volume behind every page: slow smoke lit in
                    gold and teal, and shafts of light that turn with the
                    pointer. No stars, no embers.
     THE SCAN       cards are read into view by a laser, the way the
                    passport is read; section labels decrypt like a
                    document reader settling on each line.
     THE FOIL       cards tilt toward the pointer in 3D, catch a moving
                    glare and a holographic foil, as the passport does.
     THE SHUTTER    leaving a page closes a cinematic shutter on a seam
                    of light; every page opens on the same seam (the
                    opening itself is pure CSS in lunara-shell.css, so it
                    never flickers).
     THE STAMP      window.LunaraFX.stamp(el, status): the passport's
                    stamp, ink and thud, for any page that returns a
                    verdict (the homepage register lookup uses it).
     THE CURSOR     a ring of light that opens over anything clickable.

   Rules, the same as every other script here:
     - additive: if any part fails, the page is exactly as it was;
     - prefers-reduced-motion gets none of it;
     - no figure, date or claim is written by this file;
     - the haze stops drawing when the tab is hidden and lowers its own
       resolution if the machine cannot keep up.
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.__lunaraEngine) return;
  window.__lunaraEngine = true;

  var REDUCED = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  var FINE = !!(window.matchMedia && matchMedia('(pointer: fine)').matches);

  function safe(name, fn) { try { fn(); } catch (e) { if (window.console) console.warn('[lunara-engine] ' + name + ' skipped:', e && e.message); } }

  var CSS = [
    '#lxe-sky{position:fixed;inset:0;width:100vw;height:100vh;z-index:-1;pointer-events:none;display:block}',
    'html.lxe-gl #lxc-sky,html.lxe-gl #lx-dust{display:none!important}',
    /* the shutter, closing as a page is left */
    '#lxe-shut{position:fixed;inset:0;z-index:2147483600;pointer-events:none}',
    '#lxe-shut i{position:absolute;left:0;right:0;height:50.5vh;background:#030405;transition:transform .42s cubic-bezier(.7,0,.3,1)}',
    '#lxe-shut i.t{top:0;transform:translateY(-101%)}#lxe-shut i.b{bottom:0;transform:translateY(101%)}',
    '#lxe-shut s{position:absolute;left:0;right:0;top:50%;height:2px;margin-top:-1px;opacity:0;text-decoration:none;',
    '  background:linear-gradient(90deg,transparent,#7FE0B0 20%,#FFF6DC 50%,#E2C47A 80%,transparent);box-shadow:0 0 40px 8px rgba(226,196,122,.45);transition:opacity .2s .25s}',
    '#lxe-shut.go i{transform:none}#lxe-shut.go s{opacity:1}',
    /* the scan: a card read into view by a laser */
    '.lxe-scan{clip-path:inset(0 0 100% 0)}',
    '.lxe-scan.lxe-in{animation:lxeScan .95s cubic-bezier(.6,0,.2,1) forwards}',
    '@keyframes lxeScan{to{clip-path:inset(0 0 -2% 0)}}',
    '.lxe-laser{position:absolute;left:0;right:0;top:0;height:2px;z-index:6;pointer-events:none;',
    '  background:linear-gradient(90deg,transparent,#7FE0B0 15%,#FFFFFF 50%,#7FE0B0 85%,transparent);box-shadow:0 0 22px 5px rgba(127,224,176,.55);',
    '  animation:lxeLaser .95s cubic-bezier(.6,0,.2,1) forwards}',
    '@keyframes lxeLaser{0%{top:0;opacity:1}90%{opacity:1}100%{top:100%;opacity:0}}',
    /* depth and foil */
    '.lxe-tilt{transform-style:preserve-3d;will-change:transform;transition:transform .5s cubic-bezier(.2,.8,.2,1),box-shadow .5s ease}',
    '.lxe-tilt.lxe-live{transition:transform .08s linear,box-shadow .3s ease;box-shadow:0 40px 80px -40px rgba(0,0,0,.85),0 0 0 1px rgba(226,196,122,.25)}',
    '.lxe-glare,.lxe-foil{position:absolute;inset:0;border-radius:inherit;pointer-events:none;opacity:0;transition:opacity .4s ease;z-index:2}',
    '.lxe-glare{background:radial-gradient(420px circle at var(--gx,50%) var(--gy,50%),rgba(255,240,205,.16),rgba(226,196,122,.05) 35%,transparent 60%);mix-blend-mode:screen}',
    '.lxe-foil{mix-blend-mode:color-dodge;background:linear-gradient(115deg,transparent 22%,rgba(255,0,170,.5) 34%,rgba(0,255,220,.5) 46%,rgba(255,240,0,.45) 58%,rgba(120,80,255,.5) 70%,transparent 82%);',
    '  background-size:300% 300%;background-position:calc(100% - var(--gx,50%)) calc(100% - var(--gy,50%))}',
    '.lxe-tilt.lxe-live .lxe-glare{opacity:1}.lxe-tilt.lxe-live .lxe-foil{opacity:.13}',
    '.lxe-mag{transition:transform .35s cubic-bezier(.2,.8,.2,1)}',
    /* gold that catches the light */
    '.lxe-shine{background:linear-gradient(100deg,#C4A46B 0%,#E2C47A 38%,#FFF3D2 50%,#E2C47A 62%,#C4A46B 100%);background-size:260% 100%;',
    '  -webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;animation:lxeShine 7s ease-in-out infinite}',
    '@keyframes lxeShine{0%,100%{background-position:100% 0}50%{background-position:0 0}}',
    /* the stamp, for any verdict */
    '.lxe-stamp{position:absolute;z-index:8;pointer-events:none;width:150px;height:150px;opacity:0}',
    '.lxe-stamp svg{width:100%;height:100%;filter:drop-shadow(0 0 8px currentColor)}',
    '.lxe-stamp.slam{animation:lxeSlam .55s cubic-bezier(.3,1.6,.5,1) forwards}',
    '@keyframes lxeSlam{0%{opacity:0;transform:scale(2.6) rotate(-4deg)}60%{opacity:1;transform:scale(.94) rotate(-14deg)}100%{opacity:.92;transform:scale(1) rotate(-12deg)}}',
    '.lxe-ink{position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:2147483400}',
    '@keyframes lxeQuake{0%,100%{transform:none}25%{transform:translate(2px,3px)}50%{transform:translate(-3px,-1px)}75%{transform:translate(1px,-2px)}}',
    '.lxe-quake{animation:lxeQuake .32s ease}',
    /* the cursor */
    '#lxe-cur{position:fixed;left:0;top:0;width:34px;height:34px;margin:-17px 0 0 -17px;border-radius:50%;z-index:2147483500;pointer-events:none;',
    '  border:1px solid rgba(226,196,122,.55);box-shadow:0 0 24px rgba(226,196,122,.25),inset 0 0 12px rgba(226,196,122,.15);',
    '  transition:width .3s,height .3s,margin .3s,border-color .3s,background .3s,opacity .3s;mix-blend-mode:screen;opacity:0}',
    '#lxe-cur.on{opacity:1}',
    '#lxe-cur.hot{width:64px;height:64px;margin:-32px 0 0 -32px;border-color:rgba(127,224,176,.7);background:radial-gradient(circle,rgba(127,224,176,.12),transparent 70%)}',
    '#lxe-dot{position:fixed;left:0;top:0;width:5px;height:5px;margin:-2.5px 0 0 -2.5px;border-radius:50%;background:#FFF3D2;z-index:2147483501;pointer-events:none;',
    '  box-shadow:0 0 10px #E2C47A,0 0 20px rgba(226,196,122,.6);opacity:0;transition:opacity .3s}',
    '#lxe-dot.on{opacity:1}',
    /* the arrival scan */
    '.lxe-pagescan{position:fixed;inset:0;z-index:2147483300;pointer-events:none;overflow:hidden}',
    '.lxe-pagescan i{position:absolute;left:0;right:0;top:-80px;height:80px;display:block;',
    '  background:linear-gradient(180deg,transparent,rgba(127,224,176,.05) 30%,rgba(127,224,176,.12) 92%,rgba(220,255,240,.95) 98%,transparent),',
    '  repeating-linear-gradient(90deg,rgba(127,224,176,.10) 0 1px,transparent 1px 22px);',
    '  box-shadow:0 2px 26px 4px rgba(127,224,176,.35);animation:lxePageScan 1.15s cubic-bezier(.55,0,.35,1) forwards}',
    '@keyframes lxePageScan{0%{top:-80px;opacity:1}85%{opacity:1}100%{top:100%;opacity:0}}'
  ].join('\n');

  function injectCss() {
    if (document.getElementById('lxe-css')) return;
    var st = document.createElement('style');
    st.id = 'lxe-css'; st.textContent = CSS;
    document.head.appendChild(st);
  }

  /* ── THE HAZE ───────────────────────────────────────────────────── */
  var FRAG = [
    'precision highp float;',
    'uniform vec2 R;uniform float T;uniform vec2 M;uniform float S;',
    'float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}',
    'float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);',
    ' return mix(mix(h(i),h(i+vec2(1.,0.)),f.x),mix(h(i+vec2(0.,1.)),h(i+vec2(1.,1.)),f.x),f.y);}',
    'float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<5;i++){v+=a*n(p);p=p*2.03+vec2(1.7,9.2);a*=.5;}return v;}',
    'void main(){',
    ' vec2 uv=(gl_FragCoord.xy-.5*R)/R.y;',
    ' vec2 cam=M*.05;',
    ' vec2 q=uv*1.15+cam*.3+vec2(T*.010,S*.00010);',
    ' float f1=fbm(q+fbm(q*1.6+vec2(T*.025,-T*.01)));',              // smoke folding into itself
    ' float f2=fbm(q*2.3-vec2(T*.018,0.)+cam);',
    ' vec3 col=vec3(.86,.66,.34)*pow(f1,3.)*.55+vec3(.10,.48,.46)*pow(f2,3.3)*.40;',
    ' vec2 src=vec2(.72*R.x/R.y,.6)+cam*.5;vec2 dv=uv-src;float ang=atan(dv.y,dv.x);',
    ' float ray=pow(max(0.,n(vec2(ang*6.,T*.12))),2.4)*smoothstep(1.9,0.,length(dv));',
    ' col+=vec3(1.,.85,.6)*ray*.13*(.6+.4*f1);',                       // shafts of light through the haze
    ' float seam=exp(-pow((uv.y+.12*sin(T*.07))*16.,2.))*.035;',
    ' col+=vec3(.55,.85,1.)*seam*(.5+.5*sin(uv.x*3.+T*.2));',          // a slow anamorphic seam
    ' col*=smoothstep(1.45,.2,length(uv));',
    ' float a=clamp(max(col.r,max(col.g,col.b)),0.,1.);',
    ' gl_FragColor=vec4(min(col,vec3(a)),a);}'
  ].join('\n');
  var VERT = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}';

  function buildHaze() {
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

    // The haze is soft by nature, so it is drawn at reduced resolution.
    var scale = FINE ? 0.6 : 0.4, slow = 0, last = 0, W = 0, H = 0;
    var mouse = { x: 0, y: 0, tx: 0, ty: 0 }, running = true;
    function size() {
      W = window.innerWidth; H = window.innerHeight;
      cv.width = Math.max(1, Math.round(W * scale)); cv.height = Math.max(1, Math.round(H * scale));
      gl.viewport(0, 0, cv.width, cv.height);
    }
    size();
    window.addEventListener('resize', size);
    window.addEventListener('pointermove', function (e) { mouse.tx = (e.clientX / W) * 2 - 1; mouse.ty = -((e.clientY / H) * 2 - 1); }, { passive: true });
    document.addEventListener('visibilitychange', function () { running = !document.hidden; if (running) requestAnimationFrame(frame); });
    var t0 = performance.now();
    function frame(now) {
      if (!running) return;
      var dt = now - last;
      if (dt < (FINE ? 28 : 40)) { requestAnimationFrame(frame); return; } // smoke does not need 60 fps
      last = now;
      if (dt > 60 && dt < 300) slow++; else slow = Math.max(0, slow - 1);
      if (slow > 30 && scale > 0.3) { scale = Math.max(0.3, scale - 0.15); slow = 0; size(); }
      mouse.x += (mouse.tx - mouse.x) * 0.06; mouse.y += (mouse.ty - mouse.y) * 0.06;
      gl.uniform2f(U.R, cv.width, cv.height);
      gl.uniform1f(U.T, (now - t0) / 1000);
      gl.uniform2f(U.M, mouse.x, mouse.y);
      gl.uniform1f(U.S, (window.scrollY || 0) * scale);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  /* ── THE SHUTTER ────────────────────────────────────────────────── */
  function shutter() {
    if (REDUCED) return;
    var sh = document.createElement('div');
    sh.id = 'lxe-shut'; sh.setAttribute('aria-hidden', 'true');
    sh.innerHTML = '<i class="t"></i><i class="b"></i><s></s>';
    document.body.appendChild(sh);
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
      // A lock opens between the pages (lunara-locks.js); without it, the plain shutter.
      if (window.LunaraLocks) { window.LunaraLocks.open(url.href); return; }
      sh.classList.add('go');
      setTimeout(function () { location.href = url.href; }, 430);
    });
    // Coming back through the history restores this page as it was left.
    window.addEventListener('pageshow', function (e) { if (e.persisted) sh.classList.remove('go'); });
  }

  /* ── THE FOIL ───────────────────────────────────────────────────── */
  var TILT = '[data-tilt],.card,.lxs-panel,.t3c,.stat,.pod,.mv,.lgt-list a,.arch-track,.pillar,.tier-card,.pricing-card,.lx-card';
  function tilt(el) {
    // A card you type into stays still; so does anything opted out.
    if (el.__lxeTilt || el.closest('[data-no-tilt]') || el.querySelector('input,textarea,select')) return;
    el.__lxeTilt = true;
    el.classList.add('lxe-tilt');
    if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
    ['lxe-glare', 'lxe-foil'].forEach(function (c) { var g = document.createElement('span'); g.className = c; g.setAttribute('aria-hidden', 'true'); el.appendChild(g); });
    var max = el.offsetWidth > 700 ? 3 : 7;
    el.addEventListener('pointermove', function (e) {
      var b = el.getBoundingClientRect();
      var x = (e.clientX - b.left) / b.width, y = (e.clientY - b.top) / b.height;
      el.classList.add('lxe-live');
      el.style.transform = 'perspective(1000px) rotateX(' + ((0.5 - y) * max).toFixed(2) + 'deg) rotateY(' + ((x - 0.5) * max).toFixed(2) + 'deg) translateZ(14px)';
      el.style.setProperty('--gx', (x * 100).toFixed(1) + '%');
      el.style.setProperty('--gy', (y * 100).toFixed(1) + '%');
    });
    el.addEventListener('pointerleave', function () { el.classList.remove('lxe-live'); el.style.transform = ''; });
  }

  var MAG = '.door,.btn,.lx-buy,.gate button,.pgate button,.lxn-cta,.lxn-apply';
  function magnet(el) {
    if (el.__lxeMag) return;
    el.__lxeMag = true;
    el.classList.add('lxe-mag');
    el.addEventListener('pointermove', function (e) {
      var b = el.getBoundingClientRect();
      var x = e.clientX - (b.left + b.width / 2), y = e.clientY - (b.top + b.height / 2);
      el.style.transform = 'translate(' + (x * 0.18).toFixed(1) + 'px,' + (y * 0.28).toFixed(1) + 'px)';
    });
    el.addEventListener('pointerleave', function () { el.style.transform = ''; });
  }

  /* ── THE SCAN ───────────────────────────────────────────────────── */
  var io = null;
  function observer() {
    if (io || !('IntersectionObserver' in window)) return io;
    io = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (!e.isIntersecting) return;
        var el = e.target; io.unobserve(el);
        if (el.__lxeScan) read(el);
        if (el.__lxeCode) decode(el);
      });
    }, { rootMargin: '0px 0px -10% 0px' });
    return io;
  }
  function read(el) {
    if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
    var l = document.createElement('span'); l.className = 'lxe-laser'; l.setAttribute('aria-hidden', 'true');
    el.appendChild(l);
    el.classList.add('lxe-in');
    setTimeout(function () { el.classList.remove('lxe-scan', 'lxe-in'); if (l.parentNode) l.parentNode.removeChild(l); }, 1100);
  }
  function scanIn(els) {
    if (!observer()) return;
    var vh = window.innerHeight;
    els.forEach(function (el, i) {
      if (el.__lxeScan || el.getBoundingClientRect().top < vh) return; // never hide what is already on screen
      el.__lxeScan = true;
      el.classList.add('lxe-scan');
      el.style.animationDelay = ((i % 3) * 110) + 'ms';
      setTimeout(function () { el.style.animationDelay = ''; }, 4000);
      io.observe(el);
    });
  }

  // Labels settle like a document reader resolving each character.
  var GLYPHS = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789<>/#=';
  function decode(el) {
    var nodes = [], walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
    while (walker.nextNode()) if (walker.currentNode.nodeValue.trim()) nodes.push(walker.currentNode);
    var finals = nodes.map(function (n) { return n.nodeValue; });
    var total = finals.join('').length; if (!total || total > 140) return;
    el.setAttribute('aria-label', el.textContent.trim());
    var t0 = performance.now(), dur = 520 + total * 14;
    (function f(now) {
      var k = Math.min(1, (now - t0) / dur), shown = Math.floor(k * total), seen = 0;
      nodes.forEach(function (n, i) {
        var s = finals[i], out = '';
        for (var c = 0; c < s.length; c++, seen++) {
          var ch = s[c];
          out += (seen < shown || ch === ' ' || ch === '·') ? ch : GLYPHS[(Math.random() * GLYPHS.length) | 0];
        }
        n.nodeValue = out;
      });
      if (k < 1) requestAnimationFrame(f);
      else { nodes.forEach(function (n, i) { n.nodeValue = finals[i]; }); el.removeAttribute('aria-label'); }
    })(t0);
  }
  function codeIn(els) {
    if (!observer()) return;
    els.forEach(function (el) {
      if (el.__lxeCode) return;
      el.__lxeCode = true;
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
    try { if (localStorage.getItem('lx-sound') === '0') return null; } catch (e) {}
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
  function burst(x, y, color) {
    var cv = document.createElement('canvas'); cv.className = 'lxe-ink'; cv.setAttribute('aria-hidden', 'true');
    document.body.appendChild(cv);
    var dpr = Math.min(2, window.devicePixelRatio || 1), W = window.innerWidth, H = window.innerHeight;
    cv.width = W * dpr; cv.height = H * dpr;
    var cx = cv.getContext('2d'); cx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var ps = [];
    for (var i = 0; i < 70; i++) {
      var a = Math.random() * Math.PI * 2, v = 2 + Math.random() * 8;
      ps.push({ x: x + Math.cos(a) * 40, y: y + Math.sin(a) * 40, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 1.2, r: 1 + Math.random() * 3, life: 1 });
    }
    var t0 = performance.now();
    (function f(now) {
      var k = (now - t0) / 1000;
      cx.clearRect(0, 0, W, H);
      cx.globalCompositeOperation = 'lighter';
      cx.strokeStyle = color; cx.globalAlpha = Math.max(0, 0.7 - k * 1.5); cx.lineWidth = 2.5;
      cx.beginPath(); cx.arc(x, y, 70 + k * 300, 0, Math.PI * 2); cx.stroke();
      ps.forEach(function (p) {
        p.x += p.vx; p.y += p.vy; p.vy += 0.25; p.vx *= 0.97; p.life -= 0.02;
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

  /* ── THE CURSOR ─────────────────────────────────────────────────── */
  function cursor() {
    if (!FINE || REDUCED) return;
    var ring = document.createElement('div'), dot = document.createElement('div');
    ring.id = 'lxe-cur'; dot.id = 'lxe-dot';
    ring.setAttribute('aria-hidden', 'true'); dot.setAttribute('aria-hidden', 'true');
    document.body.appendChild(ring); document.body.appendChild(dot);
    var x = -100, y = -100, rx = -100, ry = -100, on = false;
    window.addEventListener('pointermove', function (e) {
      x = e.clientX; y = e.clientY;
      if (!on) { on = true; ring.classList.add('on'); dot.classList.add('on'); rx = x; ry = y; }
      var hot = e.target && e.target.closest && e.target.closest('a,button,input,textarea,select,summary,[role=button],tr[data-d]');
      ring.classList.toggle('hot', !!hot);
    }, { passive: true });
    document.addEventListener('pointerleave', function () { on = false; ring.classList.remove('on'); dot.classList.remove('on'); });
    (function loop() {
      rx += (x - rx) * 0.16; ry += (y - ry) * 0.16;
      ring.style.transform = 'translate(' + rx.toFixed(1) + 'px,' + ry.toFixed(1) + 'px)';
      dot.style.transform = 'translate(' + x + 'px,' + y + 'px)';
      requestAnimationFrame(loop);
    })();
  }

  function scan() {
    if (REDUCED) return;
    if (FINE) document.querySelectorAll(TILT).forEach(tilt);
    if (FINE) document.querySelectorAll(MAG).forEach(magnet);
    scanIn([].slice.call(document.querySelectorAll('.card,.lxs-panel,.t3c,.stat,.mv,.pillar,.tier-card,.arch-track,.pod,.lx-card')));
    codeIn([].slice.call(document.querySelectorAll('.kicker,.eyebrow,.section-label,.lxs-head,.t3k,.pl')));
    shine();
  }

  /* ── THE ARRIVAL SCAN ───────────────────────────────────────────────
     Once the shutter has parted (lunara-shell.css), the passport's
     laser reads the page from top to bottom, trailing its grid. */
  function arrivalScan() {
    if (REDUCED || document.documentElement.classList.contains('lx-intro')) return;
    var since = performance.now();
    var wait = Math.max(0, 820 - since);
    setTimeout(function () {
      var l = document.createElement('div'); l.className = 'lxe-pagescan'; l.setAttribute('aria-hidden', 'true');
      l.innerHTML = '<i></i>';
      document.body.appendChild(l);
      setTimeout(function () { if (l.parentNode) l.parentNode.removeChild(l); }, 1300);
    }, wait);
  }

  function boot() {
    safe('css', injectCss);
    safe('arrival', arrivalScan);
    // While the threshold plays, it has the graphics card to itself.
    if (document.documentElement.classList.contains('lx-intro')) window.addEventListener('lunara:intro-done', function () { safe('haze', buildHaze); });
    else safe('haze', buildHaze);
    safe('shutter', shutter);
    safe('depth', scan);
    safe('cursor', cursor);
    if (!REDUCED && 'MutationObserver' in window) {
      var pending = false;
      new MutationObserver(function () {
        if (pending) return; pending = true;
        setTimeout(function () { pending = false; safe('depth', scan); }, 250);
      }).observe(document.body, { childList: true, subtree: true });
    }
  }
  window.LunaraEngine = { tilt: tilt, rescan: function () { safe('depth', scan); } };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
