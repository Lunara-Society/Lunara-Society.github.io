/* ═══════════════════════════════════════════════════════════════════
   THE ENGINE — depth, light and motion for every page
   ═══════════════════════════════════════════════════════════════════

   Loaded by lunara-shell.js, so every page that carries the shell
   carries this. It adds, and never removes:

     THE DEEP SKY   a WebGL scene behind every page: three depths of
                    stars you fly through, a slow nebula, a shaft of
                    light. Scrolling fast stretches the stars into
                    streaks; the pointer turns the camera. Where WebGL
                    is missing, the 2D sky of lunara-cosmos.js stays.
     THE OPENING    the first page of a visit opens like a film:
                    letterbox bars, a light sweep, a fade from black.
                    Later pages only fade in. It never blocks a click.
     THE DEPTH      cards tilt toward the pointer in 3D and catch a
                    moving glare; buttons lean toward the cursor; cards
                    below the fold rise out of depth as they arrive.
     THE CURSOR     a soft ring of light trails the pointer and opens
                    over anything clickable. The system cursor stays.

   Rules, the same as every other script here:
     - additive: if any part fails, the page is exactly as it was;
     - prefers-reduced-motion gets none of it;
     - no figure, date or claim is written by this file;
     - the sky stops drawing when the tab is hidden, and lowers its own
       resolution if the machine cannot keep up.
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.__lunaraEngine) return;
  window.__lunaraEngine = true;

  var REDUCED = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  var FINE = !!(window.matchMedia && matchMedia('(pointer: fine)').matches);
  if (REDUCED) return;

  function safe(name, fn) { try { fn(); } catch (e) { if (window.console) console.warn('[lunara-engine] ' + name + ' skipped:', e && e.message); } }

  var CSS = [
    '#lxe-sky{position:fixed;inset:0;width:100vw;height:100vh;z-index:-1;pointer-events:none;display:block}',
    'html.lxe-gl #lxc-sky{display:none!important}',
    /* the opening */
    '#lxe-open{position:fixed;inset:0;z-index:2147483600;pointer-events:none}',
    '#lxe-open i{position:absolute;left:0;right:0;height:13vh;background:#000;transition:transform 1.25s cubic-bezier(.7,0,.2,1)}',
    '#lxe-open i.t{top:0}#lxe-open i.b{bottom:0}',
    '#lxe-open b{position:absolute;inset:0;background:#000;transition:opacity 1.1s ease}',
    '#lxe-open s{position:absolute;left:-30%;top:50%;width:30%;height:2px;margin-top:-1px;text-decoration:none;',
    '  background:linear-gradient(90deg,transparent,#fff6dc,#E2C47A,transparent);box-shadow:0 0 30px 6px rgba(226,196,122,.55);opacity:0}',
    '#lxe-open.go i.t{transform:translateY(-101%)}#lxe-open.go i.b{transform:translateY(101%)}',
    '#lxe-open.go b{opacity:0}',
    '#lxe-open.go s{animation:lxeSweep 1.1s cubic-bezier(.6,0,.2,1) forwards}',
    '@keyframes lxeSweep{0%{left:-30%;opacity:0}20%{opacity:1}100%{left:110%;opacity:0}}',
    /* depth */
    '.lxe-tilt{transform-style:preserve-3d;will-change:transform;transition:transform .5s cubic-bezier(.2,.8,.2,1),box-shadow .5s ease}',
    '.lxe-tilt.lxe-live{transition:transform .08s linear,box-shadow .3s ease;box-shadow:0 40px 80px -40px rgba(0,0,0,.85),0 0 0 1px rgba(226,196,122,.22)}',
    '.lxe-glare{position:absolute;inset:0;border-radius:inherit;pointer-events:none;opacity:0;transition:opacity .4s ease;z-index:2;',
    '  background:radial-gradient(420px circle at var(--gx,50%) var(--gy,50%),rgba(255,240,205,.16),rgba(226,196,122,.05) 35%,transparent 60%);mix-blend-mode:screen}',
    '.lxe-tilt.lxe-live .lxe-glare{opacity:1}',
    '.lxe-rise{opacity:0;transform:perspective(1200px) rotateX(16deg) translateY(70px) scale(.96);filter:blur(4px);',
    '  transition:opacity 1s cubic-bezier(.2,.7,.2,1),transform 1.1s cubic-bezier(.2,.7,.2,1),filter 1s ease;transform-origin:50% 0}',
    '.lxe-rise.lxe-in{opacity:1;transform:none;filter:none}',
    '.lxe-mag{transition:transform .35s cubic-bezier(.2,.8,.2,1)}',
    /* gold that catches the light */
    '.lxe-shine{background:linear-gradient(100deg,#C4A46B 0%,#E2C47A 38%,#FFF3D2 50%,#E2C47A 62%,#C4A46B 100%);background-size:260% 100%;',
    '  -webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;animation:lxeShine 7s ease-in-out infinite}',
    '@keyframes lxeShine{0%,100%{background-position:100% 0}50%{background-position:0 0}}',
    /* the cursor */
    '#lxe-cur{position:fixed;left:0;top:0;width:34px;height:34px;margin:-17px 0 0 -17px;border-radius:50%;z-index:2147483500;pointer-events:none;',
    '  border:1px solid rgba(226,196,122,.55);box-shadow:0 0 24px rgba(226,196,122,.25),inset 0 0 12px rgba(226,196,122,.15);',
    '  transition:width .3s,height .3s,margin .3s,border-color .3s,background .3s,opacity .3s;mix-blend-mode:screen;opacity:0}',
    '#lxe-cur.on{opacity:1}',
    '#lxe-cur.hot{width:64px;height:64px;margin:-32px 0 0 -32px;border-color:rgba(127,224,176,.7);background:radial-gradient(circle,rgba(127,224,176,.12),transparent 70%)}',
    '#lxe-dot{position:fixed;left:0;top:0;width:5px;height:5px;margin:-2.5px 0 0 -2.5px;border-radius:50%;background:#FFF3D2;z-index:2147483501;pointer-events:none;',
    '  box-shadow:0 0 10px #E2C47A,0 0 20px rgba(226,196,122,.6);opacity:0;transition:opacity .3s}',
    '#lxe-dot.on{opacity:1}'
  ].join('\n');

  function injectCss() {
    if (document.getElementById('lxe-css')) return;
    var st = document.createElement('style');
    st.id = 'lxe-css'; st.textContent = CSS;
    document.head.appendChild(st);
  }

  /* ── THE DEEP SKY ───────────────────────────────────────────────── */
  var FRAG = [
    'precision highp float;',
    'uniform vec2 R;uniform float T;uniform vec2 M;uniform float S;uniform float V;',
    'float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}',
    'float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);',
    ' return mix(mix(h(i),h(i+vec2(1.,0.)),f.x),mix(h(i+vec2(0.,1.)),h(i+vec2(1.,1.)),f.x),f.y);}',
    'float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<5;i++){v+=a*n(p);p=p*2.03+vec2(1.7,9.2);a*=.5;}return v;}',
    'vec3 layer(vec2 uv,float sc,float dep){',
    ' vec2 p=uv*sc;vec2 id=floor(p);vec2 f=fract(p)-.5;float r=h(id);',
    ' if(r<.86)return vec3(0.);',
    ' vec2 o=(vec2(h(id+3.1),h(id+7.7))-.5)*.6;vec2 d=f-o;',
    ' d.y/=1.+V*dep*9.;',                                   // scrolling fast stretches stars into streaks
    ' float sz=.02+.05*h(id+1.9);',
    ' float b=smoothstep(sz,0.,length(d))+.35*smoothstep(sz*5.,0.,length(d));',
    ' float tw=.55+.45*sin(T*(.6+2.*h(id+5.3))+r*90.);',
    ' vec3 c=mix(vec3(.85,.9,1.),vec3(1.,.82,.5),step(.82,h(id+2.2)));',
    ' c=mix(c,vec3(.5,1.,.85),step(.97,h(id+8.1)));',
    ' return c*b*tw*(.45+.55*dep);}',
    'void main(){',
    ' vec2 uv=(gl_FragCoord.xy-.5*R)/R.y;',
    ' vec2 cam=M*.06;',
    ' vec3 col=vec3(0.);',
    ' for(int i=0;i<3;i++){float dep=float(i)/2.;',
    '  vec2 q=uv+cam*(.3+dep)+vec2(T*.004*(1.+dep),S*(.00012+.0004*dep));',
    '  col+=layer(q,mix(70.,22.,dep),dep);}',
    ' vec2 nq=uv*1.3+vec2(T*.012,S*.00008)+cam*.2;',
    ' float neb=fbm(nq+fbm(nq*1.7+T*.02));',
    ' float neb2=fbm(nq*2.4-vec2(T*.015,0.));',
    ' vec3 gold=vec3(.88,.7,.38),teal=vec3(.15,.55,.5),vio=vec3(.35,.25,.6);',
    ' col+=gold*pow(neb,3.)*.58+teal*pow(neb2,3.4)*.40+vio*pow(neb*neb2,2.)*.24;',
    ' vec2 src=vec2(.75*R.x/R.y,.62)+cam*.4;vec2 dv=uv-src;float ang=atan(dv.y,dv.x);',
    ' float ray=pow(max(0.,n(vec2(ang*7.,T*.18))),3.)*smoothstep(1.6,0.,length(dv));',
    ' col+=vec3(1.,.86,.6)*ray*.10;',
    ' col*=smoothstep(1.35,.25,length(uv));',
    ' float a=clamp(max(col.r,max(col.g,col.b)),0.,1.);',
    ' gl_FragColor=vec4(min(col,vec3(a)),a);}'
  ].join('\n');
  var VERT = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}';

  function buildSky() {
    if (document.getElementById('lxe-sky')) return;
    var cv = document.createElement('canvas');
    cv.id = 'lxe-sky'; cv.setAttribute('aria-hidden', 'true');
    var gl = cv.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false, powerPreference: 'low-power' });
    if (!gl) return; // the 2D sky stays

    function sh(type, src) { var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; }
    var prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error('link');
    gl.useProgram(prog);
    var buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    var loc = gl.getAttribLocation(prog, 'p');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    var U = {}; ['R', 'T', 'M', 'S', 'V'].forEach(function (k) { U[k] = gl.getUniformLocation(prog, k); });

    // The sky goes under everything, like the 2D one it replaces.
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

    var scale = FINE ? 1 : 0.6, slow = 0, last = 0, W = 0, H = 0;
    var mouse = { x: 0, y: 0, tx: 0, ty: 0 }, sy = window.scrollY || 0, vel = 0, lastSy = sy, running = true;
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
      var dt = now - last; last = now;
      if (!FINE && dt < 30) { requestAnimationFrame(frame); return; } // 30 fps is plenty on a phone
      // Lower the resolution if the machine is struggling, once, quietly.
      if (dt > 26 && dt < 200) slow++; else slow = Math.max(0, slow - 1);
      if (slow > 40 && scale > 0.5) { scale = scale > 0.75 ? 0.75 : 0.5; slow = 0; size(); }
      mouse.x += (mouse.tx - mouse.x) * 0.05; mouse.y += (mouse.ty - mouse.y) * 0.05;
      var y = window.scrollY || 0; var dv = Math.abs(y - lastSy); lastSy = y;
      vel += (Math.min(1, dv / 70) - vel) * 0.12; sy = y;
      gl.uniform2f(U.R, cv.width, cv.height);
      gl.uniform1f(U.T, (now - t0) / 1000);
      gl.uniform2f(U.M, mouse.x, mouse.y);
      gl.uniform1f(U.S, sy * scale);
      gl.uniform1f(U.V, vel);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  /* ── THE OPENING ────────────────────────────────────────────────── */
  function opening() {
    var first = false;
    try { first = !sessionStorage.getItem('lxe-opened'); sessionStorage.setItem('lxe-opened', '1'); } catch (e) {}
    var o = document.createElement('div');
    o.id = 'lxe-open'; o.setAttribute('aria-hidden', 'true');
    o.innerHTML = first ? '<b></b><i class="t"></i><i class="b"></i><s></s>' : '<b style="transition-duration:.5s"></b>';
    document.body.appendChild(o);
    requestAnimationFrame(function () { requestAnimationFrame(function () { o.classList.add('go'); }); });
    setTimeout(function () { if (o.parentNode) o.parentNode.removeChild(o); }, first ? 1800 : 700);
  }

  /* ── THE DEPTH ──────────────────────────────────────────────────── */
  var TILT = '[data-tilt],.card,.lxs-panel,.t3c,.stat,.pod,.mv,.lgt-list a,.arch-track,.pillar,.tier-card,.pricing-card,.lx-card,.pod';
  function tilt(el) {
    // A card you type into stays still; so does anything opted out.
    if (el.__lxeTilt || el.closest('[data-no-tilt]') || el.querySelector('input,textarea,select')) return;
    el.__lxeTilt = true;
    el.classList.add('lxe-tilt');
    if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
    var g = document.createElement('span'); g.className = 'lxe-glare'; g.setAttribute('aria-hidden', 'true');
    el.appendChild(g);
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

  function rise(els) {
    if (!('IntersectionObserver' in window)) return;
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (!e.isIntersecting) return;
        var el = e.target; el.classList.add('lxe-in'); io.unobserve(el);
        setTimeout(function () { el.style.transitionDelay = ''; el.classList.remove('lxe-rise', 'lxe-in'); }, 1400);
      });
    }, { rootMargin: '0px 0px -8% 0px' });
    var vh = window.innerHeight;
    els.forEach(function (el, i) {
      if (el.__lxeRise || el.getBoundingClientRect().top < vh) return; // never hide what is already on screen
      el.__lxeRise = true;
      el.classList.add('lxe-rise');
      el.style.transitionDelay = ((i % 3) * 90) + 'ms';
      io.observe(el);
    });
  }

  function shine() {
    document.querySelectorAll('h1 em, h2 em').forEach(function (em) {
      var cs = getComputedStyle(em);
      if (cs.backgroundImage !== 'none' || em.closest('[data-no-shine]')) return;
      // Only gold italics: the house accent. Anything else keeps its colour.
      var m = cs.color.match(/\d+/g); if (!m) return;
      var r = +m[0], g = +m[1], b = +m[2];
      if (r > 170 && g > 140 && b < 150 && r > b + 50) em.classList.add('lxe-shine');
    });
  }

  /* ── THE CURSOR ─────────────────────────────────────────────────── */
  function cursor() {
    if (!FINE) return;
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
    if (FINE) document.querySelectorAll(TILT).forEach(tilt);
    if (FINE) document.querySelectorAll(MAG).forEach(magnet);
    rise([].slice.call(document.querySelectorAll('.card,.lxs-panel,.t3c,.stat,.mv,.pillar,.tier-card,.arch-track')));
    shine();
  }

  function boot() {
    safe('css', injectCss);
    safe('opening', opening);
    safe('sky', buildSky);
    safe('depth', scan);
    safe('cursor', cursor);
    // Pages that draw cards after loading (the league, the passport)
    // get the same treatment when their cards arrive.
    if ('MutationObserver' in window) {
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
