/* ═══════════════════════════════════════════════════════════════════
   THE COSMOS — the sky every page is read under
   ═══════════════════════════════════════════════════════════════════

   Loaded by lunara-shell.js, so every page that carries the shell
   carries this, without fifty files each pasting a script tag.

   lunara-immersive.js already gives desktop readers dust and a light
   that follows the pointer, and it switches both off on touch screens,
   which is correct for what it does and left phones with a flat black
   page. Most readers arrive on a phone. This layer is written for them
   first:

     THE SKY        three depths of stars that drift against the
                    scroll, so the page moves through space rather
                    than sliding over a wallpaper. A finger or a
                    pointer draws the nearby stars into a
                    constellation. Now and then, a meteor.
     THE TOUCH      a ring of light where the reader taps.
     THE LIGHT      panels warm as they cross the middle of the screen,
                    so a phone reader sees what a mouse would light.
     THE RISE       headings arrive word by word as they are reached.

   Rules it keeps, the same as every other script here:
     - additive: it never hides, moves or rewrites content, and if any
       part fails the page is exactly as it was;
     - prefers-reduced-motion gets a still sky and nothing else;
     - no figure, date or claim is ever written by this file;
     - it stops drawing when the tab is hidden.
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.__lunaraCosmos) return;
  window.__lunaraCosmos = true;

  var REDUCED = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  var COARSE = !!(window.matchMedia && matchMedia('(pointer: coarse)').matches);

  function safe(name, fn) {
    try { fn(); } catch (e) { if (window.console) console.warn('[lunara-cosmos] ' + name + ' skipped:', e && e.message); }
  }

  /* ── styles, one sheet, injected once ─────────────────────────── */
  var CSS = [
    '#lxc-sky{position:fixed;inset:0;width:100vw;height:100vh;z-index:-1;pointer-events:none;display:block}',
    '.lxc-ripple{position:fixed;z-index:2147483000;pointer-events:none;width:14px;height:14px;margin:-7px 0 0 -7px;border-radius:50%;',
    '  border:1px solid rgba(226,196,122,.85);box-shadow:0 0 18px rgba(226,196,122,.55),inset 0 0 10px rgba(226,196,122,.35);',
    '  animation:lxcRipple .9s cubic-bezier(.2,.7,.2,1) forwards}',
    '@keyframes lxcRipple{0%{transform:scale(.3);opacity:1}100%{transform:scale(5.5);opacity:0}}',
    '.lxc-lit{transition:box-shadow .9s ease,border-color .9s ease}',
    '.lxc-lit.lxc-on{box-shadow:0 0 0 1px rgba(226,196,122,.28),0 30px 80px -40px rgba(226,196,122,.45),inset 0 1px 0 rgba(255,236,190,.08)}',
    '.lxc-w{display:inline-block;opacity:0;transform:translateY(.45em);filter:blur(6px);',
    '  transition:opacity .9s cubic-bezier(.2,.7,.2,1),transform .9s cubic-bezier(.2,.7,.2,1),filter .9s ease}',
    '.lxc-rise.lxc-in .lxc-w{opacity:1;transform:none;filter:none}'
  ].join('\n');

  function injectCss() {
    if (document.getElementById('lxc-css')) return;
    var st = document.createElement('style');
    st.id = 'lxc-css';
    st.textContent = CSS;
    document.head.appendChild(st);
  }

  /* ── THE SKY ───────────────────────────────────────────────────── */
  function buildSky() {
    if (document.getElementById('lxc-sky')) return;

    /* A fixed canvas at z-index -1 paints above the root's background
       but beneath the body's. Where the body carries the page colour,
       that colour moves to the root, so the sky sits between the two:
       behind every word, in front of the black. Nothing visible
       changes except that there is now a sky. */
    var body = document.body, root = document.documentElement;
    var bcs = getComputedStyle(body);
    var hasBodyBg = bcs.backgroundImage !== 'none' || !/rgba\(0, 0, 0, 0\)|transparent/.test(bcs.backgroundColor);
    if (hasBodyBg) {
      var rcs = getComputedStyle(root);
      if (rcs.backgroundImage === 'none' && /rgba\(0, 0, 0, 0\)|transparent/.test(rcs.backgroundColor)) {
        ['backgroundColor', 'backgroundImage', 'backgroundSize', 'backgroundPosition', 'backgroundRepeat', 'backgroundAttachment']
          .forEach(function (k) { root.style[k] = bcs[k]; });
      }
      body.style.background = 'transparent';
    }

    var cv = document.createElement('canvas');
    cv.id = 'lxc-sky';
    cv.setAttribute('aria-hidden', 'true');
    body.insertBefore(cv, body.firstChild);
    var cx = cv.getContext('2d');
    if (!cx) return;

    var DPR = Math.min(window.devicePixelRatio || 1, COARSE ? 1.25 : 1.5);
    var W = 0, H = 0, stars = [], meteors = [];
    var pointer = { x: -9999, y: -9999, alive: 0 };
    var LAYERS = [
      { speed: 0.04, size: [0.4, 0.9], alpha: [0.25, 0.55] },
      { speed: 0.10, size: [0.6, 1.3], alpha: [0.35, 0.75] },
      { speed: 0.20, size: [0.9, 1.9], alpha: [0.5, 0.95] }
    ];
    function rnd(a, b) { return a + Math.random() * (b - a); }

    function seed() {
      W = window.innerWidth; H = window.innerHeight;
      cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
      cx.setTransform(DPR, 0, 0, DPR, 0, 0);
      var n = Math.min(260, Math.round((W * H) / 9000));
      stars = [];
      for (var i = 0; i < n; i++) {
        var L = i % 7 === 0 ? 2 : (i % 3 === 0 ? 1 : 0);
        var cfg = LAYERS[L];
        stars.push({
          x: Math.random() * W, y: Math.random() * H * 1.6, L: L,
          r: rnd(cfg.size[0], cfg.size[1]), a: rnd(cfg.alpha[0], cfg.alpha[1]),
          tw: rnd(0.4, 1.6), ph: Math.random() * 6.28,
          gold: Math.random() < 0.18
        });
      }
    }

    function starPos(s, sy) {
      var span = H * 1.6;
      var y = ((s.y - sy * LAYERS[s.L].speed) % span + span) % span - H * 0.3;
      return y;
    }

    function draw(t) {
      cx.clearRect(0, 0, W, H);
      var sy = window.scrollY || 0;
      var near = [];
      for (var i = 0; i < stars.length; i++) {
        var s = stars[i];
        var y = starPos(s, sy);
        if (y < -4 || y > H + 4) continue;
        var tw = REDUCED ? 1 : 0.65 + 0.35 * Math.sin(t * 0.001 * s.tw + s.ph);
        var a = s.a * tw;
        var dx = s.x - pointer.x, dy = y - pointer.y, d2 = dx * dx + dy * dy;
        if (pointer.alive > 0 && d2 < 190 * 190) {
          var k = 1 - Math.sqrt(d2) / 190;
          a = Math.min(1, a + k * 0.7 * pointer.alive);
          near.push({ x: s.x, y: y, k: k });
        }
        cx.globalAlpha = a;
        cx.fillStyle = s.gold ? '#F1D79A' : '#DCE3EE';
        cx.beginPath(); cx.arc(s.x, y, s.r, 0, 6.2832); cx.fill();
        if (s.L === 2 && a > 0.7) {
          cx.globalAlpha = a * 0.18;
          cx.beginPath(); cx.arc(s.x, y, s.r * 4, 0, 6.2832); cx.fill();
        }
      }

      /* The constellation: every near star joined to its two nearest
         neighbours, faded by distance from the finger. */
      if (near.length > 1 && pointer.alive > 0) {
        cx.lineWidth = 0.7;
        for (var m = 0; m < near.length; m++) {
          var p = near[m], best = [null, null], bd = [1e9, 1e9];
          for (var n2 = 0; n2 < near.length; n2++) {
            if (n2 === m) continue;
            var q = near[n2], dd = (p.x - q.x) * (p.x - q.x) + (p.y - q.y) * (p.y - q.y);
            if (dd < bd[0]) { bd[1] = bd[0]; best[1] = best[0]; bd[0] = dd; best[0] = q; }
            else if (dd < bd[1]) { bd[1] = dd; best[1] = q; }
          }
          for (var b = 0; b < 2; b++) {
            if (!best[b] || bd[b] > 120 * 120) continue;
            cx.globalAlpha = Math.min(p.k, best[b].k) * 0.55 * pointer.alive;
            cx.strokeStyle = '#E2C47A';
            cx.beginPath(); cx.moveTo(p.x, p.y); cx.lineTo(best[b].x, best[b].y); cx.stroke();
          }
        }
      }

      /* Meteors: a streak with a fading tail, rare enough to be noticed. */
      for (var j = meteors.length - 1; j >= 0; j--) {
        var mt = meteors[j];
        mt.life += 1;
        mt.x += mt.vx; mt.y += mt.vy;
        var fade = 1 - mt.life / mt.max;
        if (fade <= 0) { meteors.splice(j, 1); continue; }
        var g = cx.createLinearGradient(mt.x, mt.y, mt.x - mt.vx * 14, mt.y - mt.vy * 14);
        g.addColorStop(0, 'rgba(255,240,205,' + (0.95 * fade) + ')');
        g.addColorStop(1, 'rgba(226,196,122,0)');
        cx.globalAlpha = 1;
        cx.strokeStyle = g; cx.lineWidth = 1.4;
        cx.beginPath(); cx.moveTo(mt.x, mt.y); cx.lineTo(mt.x - mt.vx * 14, mt.y - mt.vy * 14); cx.stroke();
      }
      cx.globalAlpha = 1;
    }

    function meteor() {
      var fromLeft = Math.random() < 0.5;
      var speed = rnd(7, 11);
      var ang = rnd(0.35, 0.6);
      meteors.push({
        x: fromLeft ? rnd(-40, W * 0.4) : rnd(W * 0.6, W + 40), y: rnd(-20, H * 0.35),
        vx: (fromLeft ? 1 : -1) * speed * Math.cos(ang), vy: speed * Math.sin(ang),
        life: 0, max: rnd(38, 60)
      });
    }

    seed();
    window.addEventListener('resize', function () { seed(); if (REDUCED) draw(0); });

    if (REDUCED) { draw(0); return; }

    function track(x, y) { pointer.x = x; pointer.y = y; pointer.alive = 1; }
    window.addEventListener('pointermove', function (e) { track(e.clientX, e.clientY); }, { passive: true });
    window.addEventListener('pointerdown', function (e) { track(e.clientX, e.clientY); }, { passive: true });
    window.addEventListener('touchmove', function (e) {
      var t = e.touches && e.touches[0]; if (t) track(t.clientX, t.clientY);
    }, { passive: true });

    var last = 0, nextMeteor = performance.now() + rnd(2500, 6000), running = true;
    var frameGap = COARSE ? 33 : 16;
    function loop(t) {
      if (!running) return;
      requestAnimationFrame(loop);
      if (t - last < frameGap) return;
      last = t;
      if (pointer.alive > 0) pointer.alive = Math.max(0, pointer.alive - (COARSE ? 0.012 : 0.004));
      if (t > nextMeteor) { meteor(); nextMeteor = t + rnd(6000, 14000); }
      draw(t);
    }
    requestAnimationFrame(loop);
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) running = false;
      else if (!running) { running = true; requestAnimationFrame(loop); }
    });
  }

  /* ── THE TOUCH ─────────────────────────────────────────────────── */
  function buildTouch() {
    if (REDUCED) return;
    document.addEventListener('pointerdown', function (e) {
      if (e.button && e.button !== 0) return;
      var t = e.target;
      if (t && t.closest && t.closest('input, textarea, select, [contenteditable="true"]')) return;
      var r = document.createElement('span');
      r.className = 'lxc-ripple';
      r.style.left = e.clientX + 'px';
      r.style.top = e.clientY + 'px';
      document.body.appendChild(r);
      setTimeout(function () { if (r.parentNode) r.parentNode.removeChild(r); }, 950);
    }, { passive: true });
  }

  /* ── THE LIGHT ─────────────────────────────────────────────────── */
  var PANELS = [
    '.card', '.o-row', '.st-card', '.correction', '.panel', '.tile', '.pillar',
    '.pricing-card', '.price-card', '.feature', '.step', '.box', '.lx-offer',
    '.intel-card', '.ob', '.obl', '.hero-card', '.stat', '.glass'
  ].join(',');

  function buildLight() {
    if (!('IntersectionObserver' in window)) return;
    var els = [].slice.call(document.querySelectorAll(PANELS)).filter(function (el) {
      if (el.closest('.lxn, .lxn-drawer, footer, #site-footer')) return false;
      var r = el.getBoundingClientRect();
      return r.height > 40 && r.height < 1400;
    });
    if (!els.length) return;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { en.target.classList.toggle('lxc-on', en.isIntersecting); });
    }, { rootMargin: '-38% 0px -38% 0px' });
    els.forEach(function (el) { el.classList.add('lxc-lit'); io.observe(el); });
  }

  /* ── THE RISE ──────────────────────────────────────────────────── */
  function buildRise() {
    if (REDUCED || !('IntersectionObserver' in window)) return;
    var heads = [].slice.call(document.querySelectorAll('main h1, main h2, .page-inner h1, .page-inner h2, section h2, article h2'));
    var seen = [];
    heads = heads.filter(function (h) {
      if (seen.indexOf(h) >= 0) return false; seen.push(h);
      if (h.closest('.lxn, .lxn-drawer, footer, #site-footer, [data-rv], .reveal, .rv, [data-lx-type]')) return false;
      if (h.hasAttribute('data-rv') || h.querySelector('[data-rv], script, input, button')) return false;
      var words = (h.textContent || '').trim().split(/\s+/).length;
      if (words < 2 || words > 24) return false;
      // Already on screen at load: leave it alone rather than hide what
      // the reader is already looking at.
      var r = h.getBoundingClientRect();
      return r.top > window.innerHeight * 0.92;
    });
    if (!heads.length) return;

    heads.forEach(function (h) {
      var i = 0;
      (function wrap(node) {
        [].slice.call(node.childNodes).forEach(function (c) {
          if (c.nodeType === 3) {
            var parts = c.textContent.split(/(\s+)/);
            if (parts.join('').trim() === '') return;
            var frag = document.createDocumentFragment();
            parts.forEach(function (p) {
              if (!p) return;
              if (/^\s+$/.test(p)) { frag.appendChild(document.createTextNode(p)); return; }
              var w = document.createElement('span');
              w.className = 'lxc-w';
              w.style.transitionDelay = Math.min(i++ * 55, 900) + 'ms';
              w.textContent = p;
              frag.appendChild(w);
            });
            c.parentNode.replaceChild(frag, c);
          } else if (c.nodeType === 1 && !/^(BR|SVG|IMG)$/i.test(c.tagName)) {
            wrap(c);
          }
        });
      })(h);
      h.classList.add('lxc-rise');
    });

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add('lxc-in'); io.unobserve(en.target); }
      });
    }, { rootMargin: '0px 0px -12% 0px' });
    heads.forEach(function (h) { io.observe(h); });

    /* A heading must never stay invisible: if the observer has not
       fired within a few seconds of the heading being on screen, show
       it anyway. */
    window.addEventListener('scroll', function () {
      heads.forEach(function (h) {
        if (h.classList.contains('lxc-in')) return;
        var r = h.getBoundingClientRect();
        if (r.top < window.innerHeight && r.bottom > 0) setTimeout(function () { h.classList.add('lxc-in'); }, 1200);
      });
    }, { passive: true });
  }

  function start() {
    safe('css', injectCss);
    safe('sky', buildSky);
    safe('touch', buildTouch);
    safe('light', buildLight);
    safe('rise', buildRise);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
