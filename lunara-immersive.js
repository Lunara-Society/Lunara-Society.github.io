/* ============================================================
   LUNARA IMMERSIVE — motion & comprehension engine
   ------------------------------------------------------------
   Additive. Adds atmosphere and orientation aids to pages that
   already work, and never takes anything away. Every effect is
   defensive: if a piece fails, the page is left exactly as it
   was found.

   Honours prefers-reduced-motion throughout.
   ============================================================ */

(function () {
  'use strict';

  var REDUCED = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var COARSE = window.matchMedia &&
    window.matchMedia('(pointer: coarse)').matches;

  /* Run fn, but never let a failure here break the host page. */
  function safe(name, fn) {
    try { fn(); } catch (e) {
      if (window.console && console.warn) {
        console.warn('[lunara-immersive] ' + name + ' skipped:', e.message);
      }
    }
  }

  function el(tag, id) {
    var n = document.createElement(tag);
    if (id) n.id = id;
    return n;
  }

  /* ==========================================================
     1. ATMOSPHERE LAYERS
     Ink wash, vignette and dust canvas, all at z-index -1 so
     they paint behind every piece of real content.
     ========================================================== */

  function buildAtmosphere() {
    if (document.getElementById('lx-ink')) return;

    var frag = document.createDocumentFragment();
    frag.appendChild(el('div', 'lx-ink'));
    frag.appendChild(el('div', 'lx-vignette'));

    if (!REDUCED && !COARSE) {
      frag.appendChild(el('canvas', 'lx-dust'));
    }

    document.body.insertBefore(frag, document.body.firstChild);
  }

  /* ==========================================================
     2. GOLD DUST
     A slow drift of motes, lit like flecks of metal in the air.
     Deliberately sparse — atmosphere, not snow.
     ========================================================== */

  function buildDust() {
    var canvas = document.getElementById('lx-dust');
    if (!canvas) return;

    var ctx = canvas.getContext('2d');
    if (!ctx) return;

    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var motes = [];
    var w = 0, h = 0;
    var running = true;
    var raf = null;

    function resize() {
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = w + 'px';
      canvas.style.height = h + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Density scales with area, capped so large displays stay cheap.
      var target = Math.min(46, Math.round((w * h) / 34000));
      motes = [];
      for (var i = 0; i < target; i++) motes.push(mote());
    }

    function mote() {
      return {
        x: Math.random() * w,
        y: Math.random() * h,
        r: 0.4 + Math.random() * 1.5,
        // Drifting upward, as embers do.
        vy: -(0.05 + Math.random() * 0.16),
        vx: (Math.random() - 0.5) * 0.10,
        a: 0.10 + Math.random() * 0.38,
        // Each mote breathes at its own rate.
        phase: Math.random() * Math.PI * 2,
        rate: 0.004 + Math.random() * 0.010
      };
    }

    function frame() {
      if (!running) return;
      ctx.clearRect(0, 0, w, h);

      for (var i = 0; i < motes.length; i++) {
        var m = motes[i];
        m.x += m.vx;
        m.y += m.vy;
        m.phase += m.rate;

        // Recycle motes that drift off the top.
        if (m.y < -8) { m.y = h + 8; m.x = Math.random() * w; }
        if (m.x < -8) m.x = w + 8;
        if (m.x > w + 8) m.x = -8;

        var twinkle = 0.55 + 0.45 * Math.sin(m.phase);
        var alpha = m.a * twinkle;

        var g = ctx.createRadialGradient(m.x, m.y, 0, m.x, m.y, m.r * 4);
        g.addColorStop(0, 'rgba(244,229,196,' + alpha.toFixed(3) + ')');
        g.addColorStop(0.4, 'rgba(196,164,107,' + (alpha * 0.5).toFixed(3) + ')');
        g.addColorStop(1, 'rgba(196,164,107,0)');

        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(m.x, m.y, m.r * 4, 0, Math.PI * 2);
        ctx.fill();
      }

      raf = requestAnimationFrame(frame);
    }

    resize();
    frame();

    window.addEventListener('resize', debounce(resize, 180), { passive: true });

    // Stop painting entirely when the tab is in the background.
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) {
        running = false;
        if (raf) cancelAnimationFrame(raf);
      } else if (!running) {
        running = true;
        frame();
      }
    });
  }

  /* ==========================================================
     3. HEADER GEOMETRY
     The enforcement banner sits in normal flow while the header
     is fixed at top:0 — so the header was painted over it, and
     on mobile the wrapped banner made the whole thing
     unreadable. We measure the banner and offset the header by
     exactly its height. Markup is left untouched; we only add a
     class so the stylesheet has something to hold on to.
     ========================================================== */

  function fixHeaderGeometry() {
    var header = document.getElementById('top-nav') ||
                 document.querySelector('header[id*="nav"]');

    if (!header) {
      // Fall back to the first genuinely fixed header on the page.
      var candidates = document.querySelectorAll('header, nav');
      for (var i = 0; i < candidates.length; i++) {
        if (getComputedStyle(candidates[i]).position === 'fixed') {
          header = candidates[i];
          header.classList.add('lx-fixed-header');
          break;
        }
      }
    }

    if (!header) return;
    if (getComputedStyle(header).position !== 'fixed') return;

    // The banner is the last in-flow block sibling before the header.
    var banner = null;
    var node = header.previousElementSibling;

    while (node) {
      if (node.nodeType === 1) {
        var cs = getComputedStyle(node);
        var visible = cs.display !== 'none' && cs.visibility !== 'hidden';
        var inFlow = cs.position === 'static' || cs.position === 'relative';
        var hgt = node.offsetHeight;

        if (visible && inFlow && hgt > 12 && hgt < 200) { banner = node; break; }
      }
      node = node.previousElementSibling;
    }

    if (!banner) return;

    banner.classList.add('lx-banner');
    document.body.classList.add('lx-has-banner');

    function measure() {
      var h = banner.offsetHeight;
      document.documentElement.style.setProperty('--lx-banner-h', h + 'px');
    }

    measure();
    window.addEventListener('resize', debounce(measure, 140), { passive: true });

    // Fonts land after first paint and can change the wrap height.
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(measure).catch(function () {});
    }
    window.addEventListener('load', measure);
  }

  /* ==========================================================
     4. SCROLL RAIL + RETURN TO TOP
     Orientation: how far through the document am I, and how do
     I get back to the start.
     ========================================================== */

  function buildScrollAids() {
    var rail = el('div', 'lx-rail');
    document.body.appendChild(rail);

    var top = el('button', 'lx-top');
    top.setAttribute('aria-label', 'Return to top');
    top.setAttribute('type', 'button');
    top.innerHTML = '&#8593;';
    top.addEventListener('click', function () {
      window.scrollTo({ top: 0, behavior: REDUCED ? 'auto' : 'smooth' });
    });
    document.body.appendChild(top);

    var ticking = false;

    function update() {
      var doc = document.documentElement;
      var max = (doc.scrollHeight - window.innerHeight) || 1;
      var y = window.pageYOffset || doc.scrollTop || 0;
      var p = Math.max(0, Math.min(1, y / max));

      doc.style.setProperty('--lx-scroll', p.toFixed(4));
      top.classList.toggle('lx-on', y > window.innerHeight * 0.9);

      ticking = false;
    }

    window.addEventListener('scroll', function () {
      if (!ticking) { ticking = true; requestAnimationFrame(update); }
    }, { passive: true });

    window.addEventListener('resize', debounce(update, 150), { passive: true });
    update();
  }

  /* ==========================================================
     5. LIGHT-FOLLOW ON SURFACES
     A pool of gold light tracks the cursor across cards, so the
     surfaces read as lit metal rather than flat panels.
     ========================================================== */

  function buildLightFollow() {
    if (REDUCED || COARSE) return;

    var surfaces = document.querySelectorAll('.card, .pillar, .tier');
    if (!surfaces.length) return;

    var pending = false;
    var queue = [];

    function flush() {
      for (var i = 0; i < queue.length; i++) {
        var q = queue[i];
        q.node.style.setProperty('--lx-mx', q.x + 'px');
        q.node.style.setProperty('--lx-my', q.y + 'px');
      }
      queue = [];
      pending = false;
    }

    for (var i = 0; i < surfaces.length; i++) {
      (function (node) {
        node.addEventListener('pointermove', function (e) {
          var r = node.getBoundingClientRect();
          queue.push({
            node: node,
            x: Math.round(e.clientX - r.left),
            y: Math.round(e.clientY - r.top)
          });
          if (!pending) { pending = true; requestAnimationFrame(flush); }
        }, { passive: true });
      })(surfaces[i]);
    }
  }

  /* ==========================================================
     6. ENTRANCES
     The site already reveals 134 elements through its own
     observers. We only take responsibility for surfaces that
     nothing else is animating, and we guarantee that nothing
     can ever be left invisible.
     ========================================================== */

  function buildEntrances() {
    if (REDUCED || !('IntersectionObserver' in window)) return;

    var candidates = document.querySelectorAll('.card, .pillar, .tier');
    var claimed = [];

    for (var i = 0; i < candidates.length; i++) {
      var c = candidates[i];

      // Leave anything the page is already animating alone.
      if (c.classList.contains('reveal') ||
          c.classList.contains('fade-in') ||
          c.closest('.reveal, .fade-in')) continue;

      c.classList.add('lx-rise');
      claimed.push(c);
    }

    if (!claimed.length) return;

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('lx-in');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.08, rootMargin: '0px 0px -8% 0px' });

    claimed.forEach(function (c, idx) {
      // A short stagger so rows arrive in sequence, not as a slab.
      c.style.transitionDelay = Math.min(idx % 6, 5) * 0.07 + 's';
      io.observe(c);
    });

    // Failsafe: content must never be stranded at opacity 0.
    setTimeout(function () {
      claimed.forEach(function (c) { c.classList.add('lx-in'); });
    }, 4000);
  }

  /* ==========================================================
     7. CONTAIN WIDE TABLES
     Comparison tables run to ~600px, which on a phone dragged the
     whole page sideways. We give each oversized table its own
     scroll frame so it stays completely readable while the page
     around it stops moving.

     The table is moved into a wrapper, never altered or trimmed.
     ========================================================== */

  function containWideTables() {
    var tables = document.querySelectorAll('table');

    for (var i = 0; i < tables.length; i++) {
      var t = tables[i];

      // Already framed, by us or by the page itself.
      if (t.parentNode && t.parentNode.classList &&
          t.parentNode.classList.contains('lx-scroll-x')) continue;

      var parent = t.parentNode;
      if (!parent) continue;

      // Only frame tables that genuinely outgrow their container.
      var avail = parent.clientWidth || document.documentElement.clientWidth;
      if (t.scrollWidth <= avail + 4) continue;

      var wrap = document.createElement('div');
      wrap.className = 'lx-scroll-x';
      wrap.setAttribute('role', 'region');
      wrap.setAttribute('tabindex', '0');
      wrap.setAttribute('aria-label', 'Scrollable table');

      parent.insertBefore(wrap, t);
      wrap.appendChild(t);
    }
  }

  /* ==========================================================
     8. YOU ARE HERE
     Marks the current page in the navigation.
     ========================================================== */

  function markCurrentPage() {
    var here = location.pathname.replace(/\/+$/, '').split('/').pop() || 'index.html';
    var links = document.querySelectorAll('.nav-pill a, .nav-link');

    for (var i = 0; i < links.length; i++) {
      var href = links[i].getAttribute('href');
      if (!href || href.charAt(0) === '#') continue;

      var target = href.replace(/\/+$/, '').split('/').pop();
      if (target && target === here) links[i].classList.add('lx-current');
    }
  }

  /* ========================================================== */

  function debounce(fn, wait) {
    var t = null;
    return function () {
      var args = arguments, self = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(self, args); }, wait);
    };
  }

  function init() {
    safe('atmosphere', buildAtmosphere);
    safe('dust', buildDust);
    safe('header-geometry', fixHeaderGeometry);
    safe('scroll-aids', buildScrollAids);
    safe('light-follow', buildLightFollow);
    safe('entrances', buildEntrances);
    safe('wide-tables', containWideTables);
    safe('current-page', markCurrentPage);

    // Widths settle after fonts and images land; re-check then.
    window.addEventListener('load', function () {
      safe('wide-tables', containWideTables);
    });

    window.addEventListener('resize', debounce(function () {
      safe('wide-tables', containWideTables);
    }, 250), { passive: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
