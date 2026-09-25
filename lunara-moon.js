/* ═══════════════════════════════════════════════════════════════════
   THE MOON — lit by the date you are reading this on
   ═══════════════════════════════════════════════════════════════════

   Every date on this site is computed at the moment it is read, never
   stored. The moon on the homepage follows the same rule. Its phase
   angle comes from LunaraPhase (lunara-shell.js), evaluated against the
   reader's clock, and the sphere is lit from exactly that angle. Come
   back in a week and it is a different moon, because it is a different
   night.

   The surface is not painted. It is the Lunar Reconnaissance Orbiter
   colour mosaic and the LOLA elevation map, both public domain, from
   NASA's CGI Moon Kit (see /moon/README.md). The shading is
   Lommel-Seeliger blended with Lambert, which is why the full moon
   reads flat and bright to the limb the way the real one does, and the
   elevation map is only used to raise relief along the terminator,
   where the real craters throw their shadows.

   The only thing that moves is libration: the moon rocks a few degrees
   on its axis, which it really does over a month, compressed here into
   a slow breath. The light never moves. The phase is the fact.

   Without WebGL the same phase is drawn in 2D from the same texture.
   With reduced motion it is drawn once and left alone.
   ═══════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  var VERT =
    'attribute vec2 a;' +
    'void main(){gl_Position=vec4(a,0.,1.);}';

  var FRAG = [
    'precision highp float;',
    'uniform sampler2D uColor;',
    'uniform sampler2D uHeight;',
    'uniform vec2  uRes;',
    'uniform vec3  uLight;',
    'uniform vec2  uRot;',
    'uniform float uEarth;',
    'uniform float uRelief;',
    'const float PI = 3.14159265;',

    'mat3 rotY(float a){float c=cos(a),s=sin(a);return mat3(c,0.,-s, 0.,1.,0., s,0.,c);}',
    'mat3 rotX(float a){float c=cos(a),s=sin(a);return mat3(1.,0.,0., 0.,c,s, 0.,-s,c);}',

    'vec2 uvOf(vec3 b){',
    '  float lon = atan(b.x, b.z);',
    '  float lat = asin(clamp(b.y,-1.,1.));',
    '  return vec2(0.5 + lon/(2.*PI), 0.5 - lat/PI);',
    '}',

    'void main(){',
    '  float px = 2.0 / min(uRes.x, uRes.y);',
    '  vec2 p = (gl_FragCoord.xy - 0.5*uRes) / (0.5*min(uRes.x,uRes.y));',
    '  p *= 1.0 + 2.0*px;',                          /* one pixel of room for the edge */
    '  float r2 = dot(p,p);',
    '  if (r2 > 1.0) { gl_FragColor = vec4(0.); return; }',
    '  vec3 n = vec3(p, sqrt(1.0 - r2));',            /* view space, z toward the reader */

    '  mat3 R  = rotX(uRot.y) * rotY(uRot.x);',
    '  mat3 Ri = rotY(-uRot.x) * rotX(-uRot.y);',
    '  vec3 b  = R * n;',                             /* body frame */
    '  vec2 uv = uvOf(b);',

    /* relief: the elevation gradient bends the normal, east and north */
    '  vec2 d = vec2(1.0/1024.0, 1.0/512.0);',
    '  float hE = texture2D(uHeight, uv + vec2(d.x,0.)).r;',
    '  float hW = texture2D(uHeight, uv - vec2(d.x,0.)).r;',
    '  float hN = texture2D(uHeight, uv - vec2(0.,d.y)).r;',
    '  float hS = texture2D(uHeight, uv + vec2(0.,d.y)).r;',
    '  float lon = atan(b.x,b.z);',
    '  vec3 east  = normalize(vec3(cos(lon), 0.0, -sin(lon)));',
    '  vec3 north = normalize(cross(b, east));',
    '  float fade = smoothstep(0.02, 0.45, n.z);',
    '  vec3 nb = normalize(b - uRelief*fade*((hE-hW)*east + (hN-hS)*north));',
    '  vec3 nv = Ri * nb;',

    '  vec3 alb = texture2D(uColor, uv).rgb;',
    '  alb = pow(alb, vec3(2.2));',

    '  float mu0g = dot(n,  uLight);',                /* geometric, for the terminator */
    '  float mu0  = max(dot(nv, uLight), 0.0);',
    '  float mu   = max(n.z, 0.001);',
    '  float ls   = 2.0 * mu0 / (mu0 + mu);',          /* Lommel-Seeliger, 1 at the sub-solar point */
    '  float sh   = mix(mu0, ls, 0.62) * smoothstep(-0.035, 0.06, mu0g);',

    '  vec3 col = alb * sh * 2.35;',
    /* earthshine: the unlit side, faintly, in the blue of a lit Earth */
    '  col += alb * uEarth * (0.35 + 0.65*n.z) * vec3(0.62, 0.74, 0.96) * (1.0 - smoothstep(-0.2, 0.05, mu0g));',

    /* tone: a soft shoulder, and the warmth of a metal seal under a lamp */
    '  col = col / (1.0 + col*0.72);',
    '  col = pow(col, vec3(1.0/2.2));',
    '  col *= vec3(1.03, 0.995, 0.93);',

    '  float edge = 1.0 - smoothstep(1.0 - 2.5*px, 1.0, sqrt(r2));',
    '  gl_FragColor = vec4(col*edge, edge);',
    '}'
  ].join('\n');

  function loadImage(src) {
    return new Promise(function (ok, no) {
      var im = new Image();
      im.decoding = 'async';
      im.onload = function () { ok(im); };
      im.onerror = no;
      im.src = src;
    });
  }

  function phaseNow() {
    if (window.LunaraPhase) return window.LunaraPhase.at(new Date());
    return null;
  }

  function lightFrom(ph) {
    /* The phase angle i is Sun-Moon-Earth. At i = 0 the sun is behind
       the reader (full), at 180 it is behind the moon (new). Waxing, as
       seen from the northern hemisphere, the lit limb is on the right. */
    var i = ph.i * Math.PI / 180;
    var s = ph.waxing ? 1 : -1;
    return [s * Math.sin(i), 0.0, Math.cos(i)];
  }

  function compile(gl, type, src) {
    var sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh));
    return sh;
  }

  function texture(gl, unit, img) {
    var t = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    /* non-power-of-two safe in WebGL 1 */
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }

  /* ── 2D fallback: the same phase, the same surface, no relief ───── */
  function draw2D(canvas, img, ph) {
    var ctx = canvas.getContext('2d');
    var w = canvas.width, h = canvas.height, r = Math.min(w, h) / 2, cx = w / 2, cy = h / 2;
    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.clip();
    /* the near hemisphere is the middle half of the map */
    ctx.drawImage(img, img.width * 0.25, 0, img.width * 0.5, img.height, cx - r, cy - r, r * 2, r * 2);
    /* the unlit part: the far limb and the terminator ellipse, mirrored
       when the moon is waning so the lit limb is on the left */
    var k = ph.k, rx = Math.abs(1 - 2 * k) * r;
    ctx.save();
    if (!ph.waxing) { ctx.translate(cx, 0); ctx.scale(-1, 1); ctx.translate(-cx, 0); }
    if ('filter' in ctx) ctx.filter = 'blur(' + Math.max(1, r / 160).toFixed(1) + 'px)';
    ctx.fillStyle = 'rgba(5,6,9,0.94)';
    ctx.beginPath();
    ctx.arc(cx, cy, r + 2, -Math.PI / 2, Math.PI / 2, true);
    if (k < 0.5) ctx.ellipse(cx, cy, rx, r + 2, 0, Math.PI / 2, -Math.PI / 2, true);
    else ctx.ellipse(cx, cy, rx, r + 2, 0, Math.PI / 2, Math.PI * 1.5, false);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.restore();
  }

  function mount(canvas, opts) {
    opts = opts || {};
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var ph = phaseNow();
    if (!ph) return null;

    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    function fit() {
      var box = canvas.getBoundingClientRect();
      var w = Math.max(2, Math.round(box.width * dpr)), h = Math.max(2, Math.round(box.height * dpr));
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; return true; }
      return false;
    }
    fit();

    var gl = null;
    try {
      gl = canvas.getContext('webgl', { premultipliedAlpha: true, alpha: true, antialias: false }) ||
           canvas.getContext('experimental-webgl');
    } catch (e) { gl = null; }

    var colorSrc  = opts.color  || '/moon/lroc-color-2k.jpg';
    var heightSrc = opts.height || '/moon/lola-height-1k.jpg';

    var ready = Promise.all([loadImage(colorSrc), gl ? loadImage(heightSrc) : Promise.resolve(null)]);

    if (!gl) {
      ready.then(function (ims) {
        draw2D(canvas, ims[0], ph);
        canvas.classList.add('is-lit');
        window.addEventListener('resize', function () { if (fit()) draw2D(canvas, ims[0], ph); });
      }).catch(function () {});
      return { phase: ph };
    }

    var prog, loc = {}, light = lightFrom(ph);
    try {
      prog = gl.createProgram();
      gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT));
      gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAG));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error('link');
    } catch (e) {
      return null;
    }
    gl.useProgram(prog);
    var buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
    var aLoc = gl.getAttribLocation(prog, 'a');
    gl.enableVertexAttribArray(aLoc);
    gl.vertexAttribPointer(aLoc, 2, gl.FLOAT, false, 0, 0);
    ['uColor','uHeight','uRes','uLight','uRot','uEarth','uRelief'].forEach(function (n) {
      loc[n] = gl.getUniformLocation(prog, n);
    });

    /* Earthshine is brightest when the moon is thinnest, because that
       is when the Earth, seen from the moon, is nearly full. */
    var earth = 0.006 + 0.02 * (1 - ph.k);

    var pointer = { x: 0, y: 0, tx: 0, ty: 0 };
    if (!reduce && window.matchMedia('(hover: hover)').matches) {
      window.addEventListener('pointermove', function (e) {
        pointer.tx = ((e.clientX / window.innerWidth) - 0.5) * 0.07;
        pointer.ty = ((e.clientY / window.innerHeight) - 0.5) * 0.05;
      }, { passive: true });
    }

    var visible = true, raf = 0, t0 = performance.now(), texReady = false;

    function frame(now) {
      raf = 0;
      if (!texReady) return;
      fit();
      var t = (now - t0) / 1000;
      pointer.x += (pointer.tx - pointer.x) * 0.04;
      pointer.y += (pointer.ty - pointer.y) * 0.04;
      /* libration: a real few degrees in longitude and latitude, slowed to a breath */
      var lx = reduce ? 0 : Math.sin(t * 0.11) * 0.075 + pointer.x;
      var ly = reduce ? 0 : Math.sin(t * 0.083 + 1.3) * 0.05 + pointer.y;
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform2f(loc.uRes, canvas.width, canvas.height);
      gl.uniform3f(loc.uLight, light[0], light[1], light[2]);
      gl.uniform2f(loc.uRot, lx, ly);
      gl.uniform1f(loc.uEarth, earth);
      gl.uniform1f(loc.uRelief, opts.relief || 9.0);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      if (!reduce && visible) raf = requestAnimationFrame(frame);
    }
    function kick() { if (!raf) raf = requestAnimationFrame(frame); }

    ready.then(function (ims) {
      texture(gl, 0, ims[0]);
      texture(gl, 1, ims[1]);
      gl.uniform1i(loc.uColor, 0);
      gl.uniform1i(loc.uHeight, 1);
      texReady = true;
      kick();
      requestAnimationFrame(function () { canvas.classList.add('is-lit'); });
    }).catch(function () {});

    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (es) {
        visible = es[0].isIntersecting;
        if (visible) kick();
      }).observe(canvas);
    }
    window.addEventListener('resize', kick);
    canvas.addEventListener('webglcontextlost', function (e) { e.preventDefault(); texReady = false; });

    return { phase: ph };
  }

  window.LunaraMoon = { mount: mount };
})();
