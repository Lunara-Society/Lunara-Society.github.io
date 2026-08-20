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

    /* Grain sits above everything, so it is appended rather than
       inserted. Purely decorative and never interactive. */
    if (!document.getElementById('lx-grain')) {
      var grain = el('div', 'lx-grain');
      grain.setAttribute('aria-hidden', 'true');
      document.body.appendChild(grain);
    }
  }

  /* ==========================================================
     THE EMBLEM AS PRESENCE
     A third state for the mark: enormous, barely there, bleeding
     off the edge of one section per page. Drawn as SVG rather
     than fetched, so it costs no bytes and stays crisp at any
     size.
     ========================================================== */

  function emblemMark() {
    return '' +
      '<svg viewBox="0 0 100 100" aria-hidden="true" focusable="false">' +
      '<g fill="none" stroke="currentColor" stroke-width="0.6">' +
      '<circle cx="50" cy="50" r="47"/>' +
      '<circle cx="50" cy="50" r="41"/>' +
      '<circle cx="50" cy="50" r="33"/>' +
      '</g>' +
      '<path d="M50 20 L74 33 L74 54 C74 68 63 78 50 83 C37 78 26 68 26 54 L26 33 Z" ' +
      '      fill="none" stroke="currentColor" stroke-width="0.9" stroke-linejoin="round"/>' +
      '<text x="50" y="63" text-anchor="middle" font-family="Georgia,serif" ' +
      '      font-size="34" fill="currentColor">L</text>' +
      '</svg>';
  }

  function placeWatermark() {
    if (document.querySelector('.lx-watermark')) return;

    /* One per page, on a section with enough height to hold it.
       Never the first screen — the emblem already leads there. */
    var candidates = document.querySelectorAll(
      'section, .section, article, main, [class*="section"], #site-footer, footer'
    );
    var host = null;

    for (var i = 0; i < candidates.length; i++) {
      var c = candidates[i];
      if (c.offsetHeight < 380) continue;
      if (c.getBoundingClientRect().top + window.pageYOffset < window.innerHeight * 0.8) continue;
      host = c;
      break;
    }

    /* Every page has a footer, so it is the fallback: better a
       presence low on the page than none at all. */
    if (!host) host = document.getElementById('site-footer') ||
                      document.querySelector('footer');
    if (!host) return;

    /* The watermark bleeds deliberately past its host's edge, so the
       host needs a positioning context and has to clip the overhang.

       Test the axes separately: the `overflow` shorthand reads back as
       "visible auto" whenever either axis is set, so a single equality
       check against "visible" quietly skipped those hosts and let the
       bleed escape onto the page — 101px past the right edge of a
       390px screen on the dashboard.

       Clip rather than hide. `hidden` would make the host a scroll
       container, and any `position: sticky` inside it would anchor to
       a box that never scrolls and stop sticking. `hidden` is set
       first as the fallback for browsers without `clip`. */
    var cs = getComputedStyle(host);
    if (cs.position === 'static') host.style.position = 'relative';
    if (cs.overflowX === 'visible' || cs.overflowY === 'visible') {
      host.style.overflow = 'hidden';
      host.style.overflow = 'clip';
    }

    var w = document.createElement('div');
    w.className = 'lx-watermark';
    w.setAttribute('aria-hidden', 'true');
    w.innerHTML = emblemMark();
    host.appendChild(w);
  }

  /* ==========================================================
     THE LETTERBOX
     A ratio, not an effect. 2.39:1 is the width of cinema, and
     the eye recognises it before it reads anything. One band per
     page, placed at the seam between the content and the footer,
     using imagery the site already owns.

     Lazy-loaded, so it costs nothing until it is nearly in view.
     ========================================================== */

  function placeLetterbox() {
    if (REDUCED) return;
    if (document.querySelector('.lx-letterbox')) return;

    var footer = document.getElementById('site-footer') ||
                 document.querySelector('footer');
    if (!footer || !footer.parentNode) return;

    /* Only on pages with enough content for a pause to mean
       something. A band on a short page is just decoration. */
    if (document.body.scrollHeight < window.innerHeight * 2.2) return;

    var band = document.createElement('div');
    band.className = 'lx-letterbox';
    band.setAttribute('aria-hidden', 'true');

    var img = document.createElement('img');
    img.src = 'shield_gate.jpg';
    img.alt = '';
    img.loading = 'lazy';
    img.decoding = 'async';

    band.appendChild(img);
    footer.parentNode.insertBefore(band, footer);
  }

  /* ==========================================================
     THE GATE
     Two panels of tinted glass over a section, closed until you
     reach it. Marked in the HTML with data-lx-gate so placement
     is a decision rather than a guess.

     The content behind is never hidden from anything that
     matters — it is in the DOM, readable by a crawler, and
     reachable by a screen reader. The panels are decoration
     sitting on top, and they remove themselves once open.
     ========================================================== */

  function buildGates() {
    var gates = document.querySelectorAll('[data-lx-gate]');
    if (!gates.length) return;

    for (var i = 0; i < gates.length; i++) {
      (function (host) {
        if (host.classList.contains('lx-gate')) return;
        host.classList.add('lx-gate');

        /* Reduced motion never sees a closed door. */
        if (REDUCED) { host.classList.add('lx-open', 'lx-done'); return; }

        var l = document.createElement('div');
        var r = document.createElement('div');
        l.className = 'lx-gate-panel lx-gate-l';
        r.className = 'lx-gate-panel lx-gate-r';
        l.setAttribute('aria-hidden', 'true');
        r.setAttribute('aria-hidden', 'true');
        host.appendChild(l);
        host.appendChild(r);

        if (!('IntersectionObserver' in window)) {
          host.classList.add('lx-open', 'lx-done');
          return;
        }

        var io = new IntersectionObserver(function (entries) {
          entries.forEach(function (e) {
            if (!e.isIntersecting) return;
            io.unobserve(e.target);
            /* A beat before it opens. Doors that fly apart the
               instant they appear read as a transition, not an
               arrival. */
            setTimeout(function () {
              host.classList.add('lx-open');
              setTimeout(function () { host.classList.add('lx-done'); }, 2200);
            }, 240);
          });
        }, { threshold: 0.28 });

        io.observe(host);

        /* Nobody should ever be held behind a closed door. */
        setTimeout(function () {
          host.classList.add('lx-open', 'lx-done');
        }, 9000);
      })(gates[i]);
    }
  }

  /* ==========================================================
     THE SWARM
     Ten to thirty motes — not thousands. At this count each one
     is a discrete object doing something deliberate, which is
     what programmable matter looks like. A cloud would just be
     weather, and weather is tiring to watch.

     They scatter, then resolve into the target word, hold, and
     settle. Plays once, when the section arrives.
     ========================================================== */

  function buildSwarms() {
    var hosts = document.querySelectorAll('[data-lx-swarm]');
    if (!hosts.length || REDUCED) return;

    for (var i = 0; i < hosts.length; i++) {
      (function (host) {
        var word = host.getAttribute('data-lx-swarm') || 'VERIFIED';
        var canvas = document.createElement('canvas');
        canvas.className = 'lx-swarm';
        canvas.setAttribute('aria-hidden', 'true');
        host.appendChild(canvas);

        var ctx = canvas.getContext('2d');
        if (!ctx) return;

        var dpr = Math.min(window.devicePixelRatio || 1, 2);
        var W = 0, H = 0, targets = [], motes = [], raf = null;
        var started = false, t0 = 0;

        /* With only a few dozen motes, a word cannot read — eight
           letters across twenty points is two and a half motes per
           letter. A shape can. The swarm traces the Shield instead,
           sampled evenly along its outline, which stays legible at
           this count and is the mark the site already owns.

           data-lx-swarm="shield" (default) traces the silhouette;
           any other value is treated as a short word, which only
           works for three or four characters. */
        function computeTargets() {
          var N = Math.max(10, Math.min(30, Math.round(W / 30)));
          targets = [];

          if (word.toLowerCase() !== 'shield') {
            /* Short-word mode, for three or four characters only. */
            var off = document.createElement('canvas');
            off.width = W; off.height = H;
            var o = off.getContext('2d');
            var size = Math.min(W / (word.length * 0.7), H * 0.7);
            o.fillStyle = '#fff';
            o.font = '600 ' + size + 'px ui-monospace, Menlo, monospace';
            o.textAlign = 'center'; o.textBaseline = 'middle';
            o.fillText(word, W / 2, H / 2);
            var data = o.getImageData(0, 0, W, H).data, found = [];
            for (var y = 0; y < H; y += 3) {
              for (var x = 0; x < W; x += 3) {
                if (data[(y * W + x) * 4 + 3] > 128) found.push({ x: x, y: y });
              }
            }
            if (!found.length) return;
            var stride = found.length / N;
            for (var k = 0; k < N; k++) targets.push(found[Math.floor(k * stride)]);
            return;
          }

          /* Shield outline, sampled at equal arc length so the
             spacing between motes is even the whole way round. */
          var svgNS = 'http://www.w3.org/2000/svg';
          var svg = document.createElementNS(svgNS, 'svg');
          var path = document.createElementNS(svgNS, 'path');
          path.setAttribute('d',
            'M50 14 L80 30 L80 56 C80 74 66 86 50 92 C34 86 20 74 20 56 L20 30 Z');
          svg.appendChild(path);
          svg.setAttribute('style', 'position:absolute;width:0;height:0;overflow:hidden');
          document.body.appendChild(svg);

          var total;
          try { total = path.getTotalLength(); } catch (e) { total = 0; }
          if (!total) { document.body.removeChild(svg); return; }

          /* Fit the 100x100 path into the canvas with margin. */
          var scale = Math.min(W, H) / 100 * 0.86;
          var ox = (W - 100 * scale) / 2;
          var oy = (H - 100 * scale) / 2;

          for (var i3 = 0; i3 < N; i3++) {
            var pt = path.getPointAtLength((i3 / N) * total);
            targets.push({ x: ox + pt.x * scale, y: oy + pt.y * scale });
          }
          document.body.removeChild(svg);
        }

        function seed() {
          motes = targets.map(function (t) {
            return {
              /* enters from off-frame, in a direction of its own */
              x: W / 2 + (Math.random() - 0.5) * W * 2.2,
              y: H / 2 + (Math.random() - 0.5) * H * 3.4,
              tx: t.x, ty: t.y,
              /* each mote arrives at its own pace */
              ease: 0.030 + Math.random() * 0.045,
              r: 1.5 + Math.random() * 1.6,
              phase: Math.random() * Math.PI * 2
            };
          });
        }

        function resize() {
          W = host.clientWidth;
          H = canvas.clientHeight || 132;
          canvas.width = W * dpr; canvas.height = H * dpr;
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          computeTargets();
          seed();
        }

        function frame(now) {
          if (!t0) t0 = now;
          var age = now - t0;
          ctx.clearRect(0, 0, W, H);

          var settled = 0;
          for (var i2 = 0; i2 < motes.length; i2++) {
            var m = motes[i2];
            m.x += (m.tx - m.x) * m.ease;
            m.y += (m.ty - m.y) * m.ease;
            m.phase += 0.045;

            var d = Math.abs(m.tx - m.x) + Math.abs(m.ty - m.y);
            if (d < 1.4) settled++;

            /* A breath once in place, so it never looks frozen. */
            var breathe = d < 3 ? 0.85 + 0.15 * Math.sin(m.phase) : 1;
            var rad = m.r * breathe;

            var g = ctx.createRadialGradient(m.x, m.y, 0, m.x, m.y, rad * 4.5);
            g.addColorStop(0, 'rgba(244,229,196,0.95)');
            g.addColorStop(0.35, 'rgba(226,200,146,0.55)');
            g.addColorStop(1, 'rgba(196,164,107,0)');
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.arc(m.x, m.y, rad * 4.5, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = 'rgba(255,247,230,0.9)';
            ctx.beginPath();
            ctx.arc(m.x, m.y, rad * 0.6, 0, Math.PI * 2);
            ctx.fill();
          }

          /* A hairline drawn between neighbours once assembled —
             the swarm acknowledging it is one thing. */
          if (settled > motes.length * 0.7) {
            ctx.strokeStyle = 'rgba(196,164,107,0.16)';
            ctx.lineWidth = 0.6;
            for (var a = 0; a < motes.length - 1; a++) {
              var p = motes[a], q = motes[a + 1];
              if (Math.abs(p.x - q.x) + Math.abs(p.y - q.y) > 90) continue;
              ctx.beginPath();
              ctx.moveTo(p.x, p.y);
              ctx.lineTo(q.x, q.y);
              ctx.stroke();
            }
          }

          /* Runs until settled, then stops. Nothing loops. */
          if (age < 14000) raf = requestAnimationFrame(frame);
        }

        function start() {
          if (started) return;
          started = true;
          resize();
          raf = requestAnimationFrame(frame);
        }

        if ('IntersectionObserver' in window) {
          var io = new IntersectionObserver(function (entries) {
            entries.forEach(function (e) {
              if (e.isIntersecting) { io.unobserve(e.target); start(); }
            });
          }, { threshold: 0.4 });
          io.observe(host);
        } else {
          start();
        }

        window.addEventListener('resize', debounce(function () {
          if (started) { t0 = 0; resize(); }
        }, 240), { passive: true });

        document.addEventListener('visibilitychange', function () {
          if (document.hidden && raf) cancelAnimationFrame(raf);
        });
      })(hosts[i]);
    }
  }

  /* ==========================================================
     THE MACHINE VOICE
     Typewriter, but only where a machine is actually speaking —
     a registry query, a gateway handshake. Never on prose: it
     delays people who came to read and confuses screen readers.

     The full text is in the markup and exposed to assistive
     technology immediately; only the visible rendering types.
     ========================================================== */

  function buildTypers() {
    var lines = document.querySelectorAll('[data-lx-type]');
    if (!lines.length) return;

    for (var i = 0; i < lines.length; i++) {
      (function (node) {
        var full = node.getAttribute('data-lx-type') || node.textContent || '';
        node.classList.add('lx-type');

        /* Assistive technology gets the finished line at once. */
        node.setAttribute('aria-label', full);

        if (REDUCED || !('IntersectionObserver' in window)) {
          node.textContent = full;
          node.classList.add('lx-type-done');
          return;
        }

        node.textContent = '';

        var io = new IntersectionObserver(function (entries) {
          entries.forEach(function (e) {
            if (!e.isIntersecting) return;
            io.unobserve(e.target);

            var i2 = 0;
            (function tick() {
              node.textContent = full.slice(0, ++i2);
              if (i2 >= full.length) {
                node.classList.add('lx-type-done');
                return;
              }
              /* Uneven cadence. Perfectly regular typing reads as
                 an animation; a machine hesitates at punctuation. */
              var ch = full.charAt(i2 - 1);
              var wait = 26 + Math.random() * 24;
              if (ch === ' ') wait += 18;
              if ('.,:…'.indexOf(ch) > -1) wait += 220;
              setTimeout(tick, wait);
            })();
          });
        }, { threshold: 0.6 });

        io.observe(node);
      })(lines[i]);
    }
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
      var opts = { top: 0, behavior: REDUCED ? 'auto' : 'smooth' };
      /* Send the instruction to whatever is actually scrolling. */
      scroller().scrollTo ? scroller().scrollTo(opts) : window.scrollTo(opts);
    });
    document.body.appendChild(top);

    var ticking = false;

    /* Which element actually scrolls?
       Normally the viewport, and window.pageYOffset tells us so. But a
       page that pins `html, body { height:100% }` alongside an overflow
       declaration turns <body> into its own scroll container: the
       viewport then never moves, pageYOffset is pinned at 0, and body's
       scroll event does not reach window. This layer ships on every
       page, so it asks rather than assumes. */
    function scroller() {
      var doc = document.documentElement;
      if (doc.scrollHeight > doc.clientHeight + 1) return doc;
      if (document.body.scrollHeight > document.body.clientHeight + 1) {
        return document.body;
      }
      return doc;
    }

    function update() {
      var doc = document.documentElement;
      var sc = scroller();
      var max = (sc.scrollHeight - sc.clientHeight) || 1;
      var y = (sc === doc ? (window.pageYOffset || doc.scrollTop) : sc.scrollTop) || 0;
      var p = Math.max(0, Math.min(1, y / max));

      doc.style.setProperty('--lx-scroll', p.toFixed(4));
      top.classList.toggle('lx-on', y > window.innerHeight * 0.9);

      ticking = false;
    }

    function onScroll() {
      if (!ticking) { ticking = true; requestAnimationFrame(update); }
    }

    /* window covers the viewport case; document (capture) catches a
       scroll on any nested container, since scroll events do not
       bubble but do still propagate down through capture. */
    window.addEventListener('scroll', onScroll, { passive: true });
    document.addEventListener('scroll', onScroll, { passive: true, capture: true });

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

    /* Claim by role, not by one page's class names.

       This asked for `.card, .pillar, .tier` — three names that only
       seven of forty-three pages use. Everywhere else it matched
       nothing, claimed nothing, and returned before observing
       anything, so thirty-six pages arrived flat: every word already
       on screen, nothing earned by scrolling. The machinery was never
       broken; it simply had almost nothing to hold.

       Two families, two different travels. Repeating surfaces keep
       the firmer rise they always had. Section-sized blocks get a
       shorter one — a large block sliding a long way reads as a slide
       transition, while the same block barely moving reads as
       arrival. */

    /* The site names its repeating blocks by a consistent convention —
       doctrine-item, step-item, track-card, reg-box, timeline-item and
       two dozen more. Matching the convention rather than listing every
       name covers the pages that exist and the ones written next.

       `$=` alone would miss `class="card-box active"`, so each suffix is
       matched both as the final class and as one among several. */
    function suffixes(list) {
      var out = [];
      for (var i = 0; i < list.length; i++) {
        out.push('[class$="' + list[i] + '"]', '[class*="' + list[i] + ' "]');
      }
      return out.join(',');
    }

    var SURFACES = '.card, .pillar, .tier, .stat, .price-tier, .layer,' +
                   '.gap-item, .reg-item, .locked, .feature, .step,' +
                   '.faq-item, .principle, .metric, .benchmark-stat,' +
                   suffixes(['-item', '-card', '-box', '-tile', '-entry', '-panel']);

    var BLOCKS = '.section, section, article, .callout, .data-callout,' +
                 '.results-section, .content-block, .doc-section,' +
                 '.page-inner > div, .doctrine-body, .prose';

    var claimed = [];

    function eligible(c) {
      /* Never take something the page already animates. Its own
         observer owns it, and two mechanisms competing for one
         element's opacity is exactly how content gets stranded. */
      if (c.classList.contains('reveal') ||
          c.classList.contains('fade-in') ||
          c.classList.contains('lx-rise') ||
          c.classList.contains('lx-rise-soft')) return false;
      if (c.closest && c.closest('.reveal, .fade-in')) return false;

      /* Never the first screen. What is above the fold is what the
         reader came for and what the browser is judged on. Fading it
         delays both. Motion starts where scrolling starts. */
      var box = c.getBoundingClientRect();
      var top = box.top + (window.pageYOffset || 0);
      if (top < window.innerHeight * 0.9) return false;

      /* Nothing empty, nothing decorative, nothing enormous. A block
         taller than the screen can never be watched arriving — its top
         has finished moving before its bottom exists. The height floor
         also excludes the thin rows the suffix match picks up:
         checkbox-item, config-row, dash-nav-item and the like. */
      if (box.height < 56 || box.height > window.innerHeight * 1.5) return false;
      if (!c.textContent || c.textContent.trim().length < 25) return false;

      /* Never a form. A control the reader is trying to use is function,
         not theatre, and a half-arrived field is worse than a plain one.
         Nothing that is, contains, or sits inside a form is claimed. */
      if (c.closest && c.closest('form, fieldset, label')) return false;
      if (c.querySelector && c.querySelector('input, select, textarea')) return false;

      /* Nor anything fixed or sticky. Those are placed deliberately and
         are usually on screen from the start; fading them reads as a
         glitch rather than an entrance. */
      var pos = getComputedStyle(c).position;
      if (pos === 'fixed' || pos === 'sticky') return false;

      return true;
    }

    function gather(selector, cls) {
      var found = document.querySelectorAll(selector);
      for (var i = 0; i < found.length; i++) {
        if (eligible(found[i])) claimed.push({ el: found[i], cls: cls });
      }
    }

    gather(SURFACES, 'lx-rise');
    gather(BLOCKS, 'lx-rise-soft');

    /* Fallback for pages with no shared vocabulary at all. The badge
       guide names every block once — wrap, preview, note, copy, end —
       and the legal pages are plain prose, so neither matches anything
       above and both arrived flat despite running to several screens.

       Where nothing has been claimed, take the direct children of
       whatever holds the content. The same eligibility rules apply, so
       this can only ever add what was already safe to add. */
    if (!claimed.length) {
      var host = document.querySelector(
        'main, .wrap, .page-inner, .container, .content, .body'
      );
      if (host && document.body.scrollHeight > window.innerHeight * 1.4) {
        var kids = host.children;
        for (var k = 0; k < kids.length; k++) {
          if (eligible(kids[k])) claimed.push({ el: kids[k], cls: 'lx-rise-soft' });
        }
      }
    }

    /* Never animate a thing and its own contents. Where a claimed
       block contains another claimed element, the outer one stands
       down: the inner surfaces are what the eye follows, and nesting
       the two produces a fade inside a fade. */
    claimed = claimed.filter(function (c) {
      for (var i = 0; i < claimed.length; i++) {
        if (claimed[i].el !== c.el && c.el.contains(claimed[i].el)) return false;
      }
      return true;
    });

    if (!claimed.length) return;

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('lx-in');
        io.unobserve(entry.target);
      });
    }, { threshold: 0.08, rootMargin: '0px 0px -8% 0px' });

    /* Stagger among siblings, not across the page. A global counter
       makes the twentieth element wait behind nineteen it never shared
       a screen with; counting per parent means a row of three arrives
       as a row of three, wherever it sits. */
    var seen = {};
    claimed.forEach(function (c) {
      var p = c.el.parentNode;
      var key = p ? (p.tagName + '|' + (p.className || '')) : 'root';
      seen[key] = (seen[key] || 0) + 1;

      c.el.classList.add(c.cls);
      c.el.style.transitionDelay = (Math.min(seen[key] - 1, 5) * 0.06) + 's';
      io.observe(c.el);
    });

    /* Failsafe. Content must never be stranded at opacity 0, whatever
       becomes of the observer. */
    setTimeout(function () {
      claimed.forEach(function (c) { c.el.classList.add('lx-in'); });
    }, 4000);
  }

  /* ==========================================================
     6b. RESCUE UNREACHABLE REVEALS
     Every page here hides its sections at opacity 0 and restores
     them with an IntersectionObserver — `.reveal` gets `in`,
     `.fade-in` gets `visible` — using a ratio threshold between
     0.10 and 0.15.

     A ratio threshold is a fraction of THE ELEMENT, not of the
     screen. So a section taller than viewport ÷ threshold can
     never satisfy it: at 0.12, anything over about eight screens
     tall never fires, never gets its class, and stays at opacity
     0 permanently.

     That is not hypothetical. One section on certify.html is
     13454px tall on a phone — at most 6.3% of it is ever on
     screen — so 146 pieces of text on the page that sells
     certification were invisible to every visitor, on desktop as
     well as mobile. Silent, because nothing errors: the observer
     is working exactly as written.

     The same trap has a horizontal form, and this engine set it.
     containWideTables puts an oversized table in its own scroll
     frame and lets it keep its natural width — on the
     verification matrix that is a 3978px table showing through a
     390px window. Barely 10% of it is ever on screen, so those
     tables stopped fading in the moment the frame was added.
     Anything this engine re-parents, this engine answers for.

     This rescues precisely those elements and nothing else. The
     cutoff sits just above the largest threshold in use, so every
     section that can satisfy its own page keeps its own timing
     and choreography untouched.
     ========================================================== */

  function rescueReveals() {
    if (!('IntersectionObserver' in window)) return;

    var CONVENTIONS = [
      { hidden: '.reveal',  shown: 'in' },
      { hidden: '.fade-in', shown: 'visible' }
    ];

    // Highest threshold any page uses is 0.15; leave headroom.
    var CEILING = 0.16;

    CONVENTIONS.forEach(function (rule) {
      var els = document.querySelectorAll(rule.hidden);
      if (!els.length) return;

      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (!e.isIntersecting) return;
          e.target.classList.add(rule.shown);
          io.unobserve(e.target);
        });
      }, { threshold: 0 });

      for (var i = 0; i < els.length; i++) {
        var el = els[i];
        if (el.classList.contains(rule.shown)) continue;

        // Already being watched from an earlier pass.
        if (el.dataset && el.dataset.lxRescued) continue;

        var box = el.getBoundingClientRect();
        if (!box.height || !box.width) continue;

        // How much of this element can ever be on screen at once?
        // Vertically, the viewport is the limit. Horizontally, it is
        // the scroll frame if we put it in one, otherwise the viewport.
        var frame = el.closest ? el.closest('.lx-scroll-x') : null;
        var limitW = frame ? frame.getBoundingClientRect().width
                           : window.innerWidth;

        var ratio = Math.min(1, window.innerHeight / box.height) *
                    Math.min(1, limitW / box.width);

        if (ratio >= CEILING) continue;

        io.observe(el);
      }
    });
  }

  /* ==========================================================
     6c. THE MEASURE
     Line length is the quietest thing that decides whether a page
     gets read. Past roughly ninety characters the eye starts
     losing its place on the return sweep, and the reader stops —
     not because the writing failed, but because the column did.

     The audit found twenty-four over-wide paragraphs, the worst
     running 1376px, about a hundred and eighty characters a line.

     A blanket `p { max-width }` in CSS would fix those and break
     everything else: a centred paragraph given a max-width keeps
     its text centred inside a box that has quietly moved left.
     So this measures first, caps only what is genuinely too wide,
     and preserves whatever alignment the page already chose.
     ========================================================== */

  function capMeasure() {
    var CAP_CH = 78;      // comfortable for this typeface at these sizes
    var TRIGGER_CH = 92;  // leave anything already reasonable alone

    var ps = document.querySelectorAll('p, .provenance, .form-section-desc');

    for (var i = 0; i < ps.length; i++) {
      var el = ps[i];
      if (el.dataset && el.dataset.lxMeasured) continue;

      var own = el.textContent ? el.textContent.trim() : '';
      if (own.length < 110) continue;              // short lines cannot run long

      var cs = getComputedStyle(el);
      if (cs.display === 'none') continue;
      if (el.closest('.lx-scroll-x, table, code, pre')) continue;

      var fs = parseFloat(cs.fontSize) || 16;
      var w = el.getBoundingClientRect().width;
      if (!w) continue;

      // 0.5em is a serviceable average glyph width for both faces here.
      var ch = w / (fs * 0.5);
      if (ch <= TRIGGER_CH) continue;

      el.style.maxWidth = (CAP_CH * fs * 0.5) + 'px';

      /* Keep the alignment the page asked for. Centred text keeps its
         box centred; everything else stays exactly where it started. */
      if (cs.textAlign === 'center') {
        el.style.marginLeft = 'auto';
        el.style.marginRight = 'auto';
      }
      if (el.dataset) el.dataset.lxMeasured = '1';
    }
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

      // Only frame tables that genuinely outgrow the space available.
      //
      // The parent alone is not that measure. Where nothing constrains
      // it, the parent simply stretches to fit its table — so the two
      // are the same width, the table never looks oversized, and we
      // walked past the exact tables we exist to catch. On the
      // dashboard that left a 728px table on a 390px screen, dragging
      // the page 239px sideways.
      //
      // What matters is whether the table fits the SCREEN, so measure
      // against whichever is narrower.
      var docW = document.documentElement.clientWidth;
      var avail = Math.min(parent.clientWidth || docW, docW);
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
    safe('watermark', placeWatermark);
    safe('letterbox', placeLetterbox);
    safe('gates', buildGates);
    safe('swarms', buildSwarms);
    safe('typers', buildTypers);
    safe('current-page', markCurrentPage);
    safe('stow-return', stowReturnControl);
    safe('reactive-edges', buildReactiveEdges);
    safe('ambient-life', buildAmbientLife);
    safe('emblem', buildEmblem);
    safe('thirty-seconds', buildThirtySeconds);
    safe('parallax', buildParallax);
    safe('animation-budget', buildAnimationBudget);
    safe('rosario', buildRosario);

    // Widths settle after fonts and images land; re-check then.
    // Heights settle then too, and the rescue check is a height
    // measurement, so it has to run once the page has stopped moving.
    window.addEventListener('load', function () {
      safe('wide-tables', containWideTables);
      safe('measure', capMeasure);
      safe('rescue-reveals', rescueReveals);
    });

    // A rotation changes both the viewport height and the section
    // heights, so an element can cross the cutoff either way. The
    // measure is a width reading, and widths change here too.
    window.addEventListener('resize', debounce(function () {
      safe('wide-tables', containWideTables);
      safe('measure', capMeasure);
      safe('rescue-reveals', rescueReveals);
    }, 250), { passive: true });
  }


  /* ── STOW THE FLOATING RETURN CONTROL ─────────────────────────
     The control is position:fixed, so it does not live at the end of
     the document; it lives in front of whatever you are reading. On a
     phone that meant it landed across a card mid-page and across the
     footer, which no amount of bottom padding can fix.

     Reading is scrolling down, so it stows on the way down and comes
     back the moment you scroll up, which is when someone is actually
     hunting for a way out. It is always present near the top and
     bottom of the document, where it is wanted and occludes nothing.

     The threshold exists because a page settling after load, or an
     address bar collapsing on iOS, produces small phantom deltas that
     would otherwise make the control flicker. */
  function stowReturnControl() {
    var btn = document.getElementById('mob-back-btn');
    if (!btn) return;

    /* Only assume the horizontal centring the stylesheet applies if
       the element is actually centred; otherwise stowing it would
       shift it sideways. */
    var tf = window.getComputedStyle(btn).transform;
    if (tf && tf !== 'none' && tf.indexOf('matrix') === 0) {
      /* a translateX(-50%) shows up as a non-zero e value */
      var parts = tf.replace(/^matrix\(|\)$/g, '').split(',');
      if (parts.length === 6 && Math.abs(parseFloat(parts[4])) < 1) {
        btn.classList.add('lx-nocentre');
      }
    } else if (!tf || tf === 'none') {
      btn.classList.add('lx-nocentre');
    }

    var last = window.pageYOffset || document.documentElement.scrollTop;
    var THRESHOLD = 6;
    var NEAR_END = 220;
    var ticking = false;

    function apply() {
      ticking = false;
      var y = window.pageYOffset || document.documentElement.scrollTop;
      var delta = y - last;
      if (Math.abs(delta) < THRESHOLD) return;

      var doc = document.documentElement;
      var atTop = y < 120;
      var atEnd = (y + window.innerHeight) >= (doc.scrollHeight - NEAR_END);

      if (atTop || atEnd || delta < 0) {
        btn.classList.remove('lx-stow');
      } else {
        btn.classList.add('lx-stow');
      }
      last = y;
    }

    function onScroll() {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(apply);
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    document.addEventListener('scroll', onScroll, { passive: true, capture: true });
  }


  /* ── THE REACTIVE EDGE ────────────────────────────────────────
     One pointer listener for the whole document rather than one per
     card. With thirty surfaces on a page, per-card listeners mean
     thirty handlers firing on every mouse move; this is one, and it
     only measures the cards near the cursor.

     Positions are written as CSS custom properties and the paint is
     left entirely to the compositor, which is what keeps this smooth
     while a page is scrolling. */
  function buildReactiveEdges() {
    if (!window.matchMedia || !window.matchMedia('(hover: hover)').matches) return;
    if (!CSS || !CSS.supports || !CSS.supports('mask-composite', 'exclude')) {
      if (!CSS.supports('-webkit-mask-composite', 'xor')) return;
    }

    var SEL = '.card, .pillar, .tier, .price-tier, .layer, .lxq-card,' +
              '.split-col, .lxf-stratum';
    var cards = [].slice.call(document.querySelectorAll(SEL));
    if (!cards.length) return;
    cards.forEach(function (c) { c.classList.add('lx-edge'); });

    var REACH = 150;      /* px beyond the card before it lights */
    var boxes = [];
    var ticking = false;
    var lastX = 0, lastY = 0;

    function measure() {
      boxes = cards.map(function (c) {
        var r = c.getBoundingClientRect();
        return { el: c, top: r.top + window.pageYOffset, left: r.left + window.pageXOffset,
                 w: r.width, h: r.height };
      });
    }

    function apply() {
      ticking = false;
      var px = lastX + window.pageXOffset;
      var py = lastY + window.pageYOffset;

      for (var i = 0; i < boxes.length; i++) {
        var b = boxes[i];
        if (!b.w) continue;
        var near = px > b.left - REACH && px < b.left + b.w + REACH &&
                   py > b.top  - REACH && py < b.top  + b.h + REACH;
        if (near) {
          b.el.style.setProperty('--lx-mx', ((px - b.left) / b.w * 100).toFixed(1) + '%');
          b.el.style.setProperty('--lx-my', ((py - b.top) / b.h * 100).toFixed(1) + '%');
          if (!b.el.classList.contains('lx-near')) b.el.classList.add('lx-near');
        } else if (b.el.classList.contains('lx-near')) {
          b.el.classList.remove('lx-near');
        }
      }
    }

    function onMove(e) {
      lastX = e.clientX; lastY = e.clientY;
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(apply);
    }

    measure();
    window.addEventListener('mousemove', onMove, { passive: true });
    window.addEventListener('scroll', function () {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(apply);
    }, { passive: true });
    window.addEventListener('resize', debounce(measure, 200), { passive: true });
    window.addEventListener('load', measure);
  }

  /* ── AMBIENT LIFE ─────────────────────────────────────────────
     A page that only moves when you touch it is a machine. A page
     that moves on a fixed timer is a metronome, and by the third
     repeat the eye has learned the interval and starts bracing for
     it. Neither is a city.

     So: a pool of small events on a randomised interval, never the
     same one twice running, always at the edge of attention rather
     than the centre. Nothing here asks for anything. They exist to
     say the building is occupied.                                */
  function buildAmbientLife() {
    if (!window.matchMedia || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    var MIN = 18000, MAX = 40000;
    var last = -1;
    var timer = null;

    function sweep() {
      /* A light crossing a section, like headlights past a window. */
      var targets = document.querySelectorAll('#urgency-band, #constitution-section, .lxf-strata, #cards-section');
      if (!targets.length) return false;
      var host = targets[Math.floor(Math.random() * targets.length)];
      if (!isOnScreen(host)) return false;

      var bar = document.createElement('div');
      bar.className = 'lx-sweep';
      var cs = window.getComputedStyle(host);
      if (cs.position === 'static') host.style.position = 'relative';
      if (cs.overflow === 'visible') host.style.overflow = 'hidden';
      host.appendChild(bar);
      setTimeout(function () { if (bar.parentNode) bar.parentNode.removeChild(bar); }, 3200);
      return true;
    }

    function rake() {
      /* The emblem catches a rake of light and settles. */
      var em = document.querySelector('.hero-emblem, .hero-seal, #hero-emblem, .lx-emblem');
      if (!em || !isOnScreen(em)) return false;
      em.classList.remove('lx-rake-once');
      void em.offsetWidth;
      em.classList.add('lx-rake-once');
      return true;
    }

    function ledger() {
      /* A single registry or clock row briefly illuminates, as though
         somebody just queried it. */
      var rows = document.querySelectorAll('.lxc-row, .reg-entry, .pillar-row');
      var vis = [].filter.call(rows, isOnScreen);
      if (!vis.length) return false;
      var row = vis[Math.floor(Math.random() * vis.length)];
      row.classList.remove('lx-ping');
      void row.offsetWidth;
      row.classList.add('lx-ping');
      setTimeout(function () { row.classList.remove('lx-ping'); }, 2600);
      return true;
    }

    function isOnScreen(el) {
      var r = el.getBoundingClientRect();
      return r.bottom > 60 && r.top < window.innerHeight - 60 && r.width > 0;
    }

    var pool = [sweep, rake, ledger];

    function fire() {
      if (!document.hidden) {
        /* Try a different event from last time; if it cannot run
           because its target is off screen, fall through to another
           rather than wasting the slot. */
        var order = [];
        for (var i = 0; i < pool.length; i++) if (i !== last) order.push(i);
        order.sort(function () { return Math.random() - 0.5; });
        for (var j = 0; j < order.length; j++) {
          if (pool[order[j]]()) { last = order[j]; break; }
        }
      }
      schedule();
    }

    function schedule() {
      clearTimeout(timer);
      timer = setTimeout(fire, MIN + Math.random() * (MAX - MIN));
    }

    /* A tab in the background should not queue up a backlog of
       events to all fire at once when it returns. */
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) clearTimeout(timer); else schedule();
    });

    schedule();
  }


  /* ── THE DIMENSIONAL EMBLEM ───────────────────────────────────
     Tracks the pointer across the whole viewport rather than only
     over the emblem itself. Tying it to hover would mean the object
     only came alive once you were already touching it, and the
     effect worth having is the one you notice from across the page:
     it turns to follow you before you arrive.

     The highlight moves against the tilt. The metal turns, the light
     does not, and getting that backwards is what makes cheap 3D look
     like a sticker. */
  function buildEmblem() {
    var host = document.querySelector('.hero-medallion');
    if (!host) return;
    if (!window.matchMedia || !window.matchMedia('(hover: hover)').matches) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    var MAX_TILT = 11;      /* degrees; beyond this it reads as a gimmick */
    var ticking = false;
    var px = 0, py = 0;
    var inRange = false;

    function apply() {
      ticking = false;
      var r = host.getBoundingClientRect();
      if (!r.width) return;

      var cx = r.left + r.width / 2;
      var cy = r.top + r.height / 2;

      /* Normalised against a generous radius so the emblem responds
         to the pointer well before it reaches it. */
      var reach = Math.max(window.innerWidth, window.innerHeight) * 0.42;
      var dx = Math.max(-1, Math.min(1, (px - cx) / reach));
      var dy = Math.max(-1, Math.min(1, (py - cy) / reach));

      host.style.setProperty('--lx-ry', (dx * MAX_TILT).toFixed(2) + 'deg');
      host.style.setProperty('--lx-rx', (-dy * MAX_TILT).toFixed(2) + 'deg');

      /* Opposite sign, and a shorter throw, so the highlight slides
         across the face rather than sticking to it. */
      host.style.setProperty('--lx-sx', (50 - dx * 26).toFixed(1) + '%');
      host.style.setProperty('--lx-sy', (34 - dy * 18).toFixed(1) + '%');

      if (!inRange) { host.classList.add('lx-tracking'); inRange = true; }
    }

    function onMove(e) {
      px = e.clientX; py = e.clientY;
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(apply);
    }

    function rest() {
      host.classList.remove('lx-tracking');
      inRange = false;
      host.style.setProperty('--lx-rx', '0deg');
      host.style.setProperty('--lx-ry', '0deg');
      host.style.setProperty('--lx-sx', '50%');
      host.style.setProperty('--lx-sy', '34%');
    }

    window.addEventListener('mousemove', onMove, { passive: true });
    document.addEventListener('mouseleave', rest);
    window.addEventListener('blur', rest);
    window.addEventListener('scroll', function () {
      /* Once the emblem is off screen there is nothing to track and
         no reason to keep measuring it. */
      var r = host.getBoundingClientRect();
      if (r.bottom < 0 || r.top > window.innerHeight) rest();
    }, { passive: true });
  }


  /* ── THIRTY SECONDS ───────────────────────────────────────────
     Three answers, then a verdict that is allowed to say nothing
     binds you. That last part is the whole reason this is worth
     building: a qualifier that only ever escalates is a sales
     funnel, and this institution's entire product is being right
     rather than being alarming. A visitor told plainly that they
     are outside scope is a visitor who believes the next thing we
     say. */
  function buildThirtySeconds() {
    var root = document.getElementById('lx30');
    if (!root) return;
    var steps = [].slice.call(root.querySelectorAll('.lx30-step'));
    var dots  = [].slice.call(root.querySelectorAll('.lx30-dot'));
    var out   = document.getElementById('lx30-verdict');
    if (!steps.length || !out) return;

    var answers = [];

    function show(i) {
      steps.forEach(function (s, n) { s.classList.toggle('lx30-on', n === i); });
      dots.forEach(function (d, n) { d.classList.toggle('on', n <= Math.min(i, dots.length - 1)); });
      var live = steps[i].querySelector('.lx30-opt');
      if (live && i > 0) live.focus({ preventScroll: true });
    }

    function esc(t) {
      return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;');
    }

    function verdict() {
      var talks = answers[0], makes = answers[1], eu = answers[2];
      var unsure = answers.indexOf('unsure') > -1;
      var engages = talks === 'yes' || makes === 'yes';

      var head, title, body, items = [], clear = false;

      if (eu === 'no' && !engages) {
        clear = true;
        head = 'Nothing here binds you';
        title = 'On these three answers, Article 50 does not reach your system.';
        body = 'A system that neither converses nor generates, and whose output no one in the EU uses, sits outside the transparency obligations entirely. That is a real answer and we would rather give it than manufacture a concern.';
        items = ['Worth revisiting if you open an EU market or add a generative feature, because either one changes this.'];

      } else if (eu === 'no' && engages) {
        head = 'Not yet, on these answers';
        title = 'Article 50 follows your output, so today this turns on where that output goes.';
        body = 'Your system does the things the Article governs. What it does not currently do is reach the European Union, and the Act binds on output rather than on establishment.';
        items = [
          '<b>The day an EU user reads a generated reply, this changes</b>, with no grace period attached.',
          'Other regimes may still apply. California SB 942 is operative, and sector rules like HIPAA are unaffected by any of this.'
        ];

      } else if (!engages && eu !== 'no') {
        clear = true;
        head = 'Likely outside Article 50';
        title = 'A system that neither converses nor generates is not what these obligations were written for.';
        body = 'Article 50 governs disclosure to people and the marking of synthetic output. If your system does neither, the transparency duties are not the ones to worry about.';
        items = ['High-risk classification is a separate question with a separate date, now 2 December 2027 for Annex III systems.'];

      } else {
        head = 'In force against you today';
        title = 'Article 50 applies to this system, and it has since 2 August 2026.';
        body = 'Enforcement is live. Penalties reach EUR 15,000,000 or 3% of worldwide annual turnover.';
        if (talks === 'yes') {
          items.push('<b>Disclosure.</b> A person interacting with the system must be told it is AI, unless that is obvious from the context.');
        }
        if (makes === 'yes') {
          items.push('<b>Marking.</b> Generated output must be machine-readably marked so it is detectable downstream as artificial.');
          items.push('<b>2 February 2027.</b> If the system was on the market before 2 August 2026, its transitional relief under Article 50(2) ends then. That is the nearest binding deadline in the entire Act.');
        }
        if (eu === 'unsure') {
          items.push('You were unsure about EU reach. It is worth resolving, because it is the switch that decides all of the above.');
        }
      }

      if (unsure && !clear) {
        items.push('Two of these can be answered definitively in an afternoon by whoever owns the deployment. Guessing is the expensive option.');
      }

      out.className = 'lx30-verdict' + (clear ? ' lx30-clear' : '');
      out.innerHTML =
        '<div class="lx30-vhead">' + esc(head) + '</div>' +
        '<h2 class="lx30-vtitle">' + esc(title) + '</h2>' +
        '<p class="lx30-vbody">' + esc(body) + '</p>' +
        (items.length ? '<ul class="lx30-vlist"><li>' + items.join('</li><li>') + '</li></ul>' : '') +
        '<div class="lx30-actions">' +
          '<a class="lx30-cta" href="scorer.html">' +
            (clear ? 'Run the full assessment anyway' : 'See what else applies') +
          '</a>' +
          '<button class="lx30-again" type="button" id="lx30-restart">Start again</button>' +
        '</div>';

      var again = document.getElementById('lx30-restart');
      if (again) again.addEventListener('click', function () {
        answers = [];
        dots.forEach(function (d, n) { d.classList.toggle('on', n === 0); });
        show(0);
      });
    }

    root.addEventListener('click', function (e) {
      var btn = e.target.closest ? e.target.closest('.lx30-opt') : null;
      if (!btn || !root.contains(btn)) return;
      var step = btn.closest('.lx30-step');
      var idx = steps.indexOf(step);
      if (idx < 0) return;
      answers[idx] = btn.getAttribute('data-a');
      if (idx < 2) {
        show(idx + 1);
      } else {
        verdict();
        show(3);
      }
    });
  }

  /* ── PARALLAX ─────────────────────────────────────────────────
     Only what carries data-par moves, and only by a fraction of the
     scroll distance. The transform is written on a wrapper so the
     compositor owns it; animating background-position instead would
     put paint work on the main thread on every frame.

     Clamped to the band's own travel so a long page cannot drift the
     layer far enough to expose an edge.                          */
  function buildParallax() {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    var layers = [].slice.call(document.querySelectorAll('[data-par]'));
    if (!layers.length) return;

    var ticking = false;

    function apply() {
      ticking = false;
      var vh = window.innerHeight;
      for (var i = 0; i < layers.length; i++) {
        var el = layers[i];
        var host = el.parentElement || el;
        var r = host.getBoundingClientRect();
        if (r.bottom < -80 || r.top > vh + 80) continue;
        var rate = parseFloat(el.getAttribute('data-par')) || 0.12;
        /* -1 when the band is entering from below, +1 when leaving
           above, so the layer's travel is centred on the moment the
           band is in the middle of the screen. */
        var progress = ((vh - r.top) / (vh + r.height)) * 2 - 1;
        var shift = (-progress * rate * r.height).toFixed(1);
        el.style.transform = 'translate3d(0,' + shift + 'px,0)';
      }
    }

    function onScroll() {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(apply);
    }

    apply();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', debounce(apply, 150), { passive: true });
    window.addEventListener('load', apply);
  }


  /* ── PAUSE WHAT IS NOT ON SCREEN ──────────────────────────────
     A measurement, not a hunch: the homepage was running 137 infinite
     animations at once, 127 of them skyline windows, and every one of
     them kept running while the skyline sat two screens away. Opacity
     is cheap per element and 127 of anything is not, least of all on
     a phone deciding whether to throttle the tab.

     So each animating band is watched, and its animations are paused
     the moment it leaves the viewport. The state is a class on the
     container rather than per-element inline style, which keeps this
     to one mutation regardless of how many windows are inside.

     Deliberately generous margins: resuming slightly before the band
     arrives means nothing is ever caught mid-fade on entry.       */
  function buildAnimationBudget() {
    if (!('IntersectionObserver' in window)) return;

    var hosts = document.querySelectorAll(
      '.lxsky-band, #cards-section, .lxf-strata, #constitution-section, .split'
    );
    if (!hosts.length) return;

    var io = new IntersectionObserver(function (entries) {
      for (var i = 0; i < entries.length; i++) {
        entries[i].target.classList.toggle('lx-idle', !entries[i].isIntersecting);
      }
    }, { rootMargin: '260px 0px 260px 0px' });

    for (var i = 0; i < hosts.length; i++) {
      /* Start idle: nothing below the fold should be animating before
         the reader has ever seen it. */
      var r = hosts[i].getBoundingClientRect();
      if (r.top > window.innerHeight + 260 || r.bottom < -260) {
        hosts[i].classList.add('lx-idle');
      }
      io.observe(hosts[i]);
    }

    /* A backgrounded tab should cost nothing at all. */
    document.addEventListener('visibilitychange', function () {
      document.documentElement.classList.toggle('lx-hidden', document.hidden);
    });
  }


  /* ── ROSARIO ──────────────────────────────────────────────────
     Injected rather than pasted into forty pages, for the same
     reason everything else here is: the markup stays untouched and
     one file owns the behaviour.

     She is entirely opt-in. What ships by default is a 46px mark.
     A visitor who wants a compliance authority and nothing else can
     read the whole site and never meet her; a curious one taps and
     gets all of it. That asymmetry is why a character costs this
     brand nothing.

     Everything she offers is a real link that already exists in the
     footer, so nothing here is the only route to anything. */
  function buildRosario() {
    if (document.getElementById('lx-ros')) return;

    /* Home only. She was on every page, which made a character that
       is meant to be a discovery into furniture, and on a phone she
       was competing with the copy on pages people arrive at to read
       one specific thing. A visitor who wants her can find her where
       the site begins; everywhere else the page is the point. */
    var here = (location.pathname.split('/').pop() || 'home').replace(/\.html?$/, '');
    if (here !== 'home') return;

    /* Once dismissed she stays gone for the rest of the session.
       Re-offering something somebody has already declined is the
       precise behaviour that makes these things resented. */
    try {
      if (window.sessionStorage &&
          sessionStorage.getItem('lx-ros-dismissed') === '1') return;
    } catch (e) {}

    var CMDS = [
      { g: '☷', t: 'Menu',            act: 'menu' },
      { g: '◈', t: 'Check a domain',  href: 'registry.html' },
      { g: '△', t: 'Score my AI',     href: 'scorer.html' },
      { g: '◎', t: 'What changed',    href: 'briefing.html' },
      { g: '✉', t: 'Contact',         href: 'contact.html' }
    ];

    var LINKS = [
      ['Assess', [['Risk Scorer','scorer.html'], ['What changed on 27 July','briefing.html'],
                  ['Compliance Kit','readiness-kit.html'], ['Healthcare AI','healthcare-intelligence.html']]],
      ['Verify', [['The Registry','registry.html'], ['Shield Certification','certify.html'],
                  ['Verification Matrix','verification-matrix.html'], ['The Constitution','constitution.html']]],
      ['Institution', [['Home','home.html'], ['Intelligence','intelligence.html'],
                  ['Whitepaper','whitepaper.html'], ['Membership','join.html'], ['Contact','contact.html']]]
    ];


    /* What she says, by page. Dry and specific: the value of a line
       is that it tells you something you did not already know from
       the heading you are looking at. Where there is nothing worth
       adding she says the one thing that is always true here, which
       is also the most useful sentence on the site. */
    var SAYS = {
      'home':                     null,   /* filled from the live clock below */
      'briefing':                 'Most of what was written about 2 August is wrong. This page is the correction.',
      'registry':                 'Give me a domain and I will tell you what the register holds. For most domains that is <b>nothing</b>, which is rather the point.',
      'scorer':                   'Five sections. The first two decide most of your result.',
      'healthcare-intelligence':  'If your system is a device under the MDR, its high-risk date is <b>August 2028</b>, not December 2027. That one catches people.',
      'certify':                  'Four stages in, one path out. The way out is what makes the entry worth holding.',
      'certify-healthcare':       'Four regimes land on the same clinical deployment at once. Satisfying one does not evidence the others.',
      'certify-fintech':          'Credit scoring and insurance pricing are classified high-risk. The classification did not move; only the date did.',
      'certify-government':       'Mapped to NIST AI RMF, FedRAMP and FISMA. The mapping is the work.',
      'constitution':             'Seven pillars, each written as something you either did or did not do. <b>Principles you cannot fail are not principles.</b>',
      'verification-matrix':      'Evidence tiers: what counts, and what merely looks like it counts.',
      'whitepaper':               'Long. Worth it if you are the one who has to defend the decision afterwards.',
      'intelligence':             'Competitive intelligence with sources attached. Where we could not source a claim, we say so.',
      'member':                   'Every briefing carries its provenance, including the ones we have not independently verified.',
      'readiness-kit':            'A checklist you can hand to somebody else and expect back completed.',
      'contact':                  'A person reads these.',
      'join':                     'Membership terms in plain language, which is rarer than it should be.',
      'watch':                    'That is me, at greater length.',
      'architecture':             'How the pieces fit. Useful if you are deciding whether to depend on them.',
      'doctrine':                 'Why the standard is shaped the way it is.'
    };

    var FALLBACK = 'I am a declared AI agent. That is not a disclaimer, it is the product.';

    function pageKey() {
      var f = (location.pathname.split('/').pop() || 'home').replace(/\.html?$/, '');
      return f === '' || f === 'index' ? 'home' : f;
    }

    function line() {
      var key = pageKey();
      if (key === 'home') {
        /* She reads the live clock rather than repeating a number
           somebody typed, so she cannot be wrong about it later. */
        try {
          var live = window.LunaraClock && window.LunaraClock.obligations
                     ? window.LunaraClock.obligations.filter(function (o) { return o.active; }).length
                     : 0;
          if (live) {
            return '<b>' + live + ' obligations</b> are enforceable today. Whether any of them reach you takes about thirty seconds to find out.';
          }
        } catch (e) {}
        return FALLBACK;
      }
      return SAYS[key] || FALLBACK;
    }

    function el(tag, cls, html) {
      var n = document.createElement(tag);
      if (cls) n.className = cls;
      if (html != null) n.innerHTML = html;
      return n;
    }

    var root = el('div', '');
    root.id = 'lx-ros';

    var orb = el('button', 'lxr-orb', '<span class="lxr-core"></span>');
    orb.type = 'button';
    orb.setAttribute('aria-expanded', 'false');
    orb.setAttribute('aria-label', 'Open assistance from Rosario, a declared AI agent');
    root.appendChild(orb);

    var stage = el('div', 'lxr-stage');
    stage.appendChild(el('div', 'lxr-light'));

    var fig = document.createElement('img');
    fig.className = 'lxr-fig';
    fig.src = 'rosario_mini.webp';
    fig.alt = 'Rosario, the Lunara Society institutional representative, as an illustrated figure';
    fig.loading = 'lazy';
    fig.decoding = 'async';
    stage.appendChild(fig);

    var tag = el('a', 'lxr-tag', 'Declared AI agent · verify');
    tag.href = 'registry.html';
    stage.appendChild(tag);

    var cmds = el('div', 'lxr-cmds');

    var says = el('div', 'lxr-says', line());
    says.style.position = 'relative';
    cmds.appendChild(says);

    CMDS.forEach(function (c) {
      var n;
      if (c.href) {
        n = el('a', 'lxr-cmd', '<span class="lxr-glyph">' + c.g + '</span>' + c.t);
        n.href = c.href;
      } else {
        n = el('button', 'lxr-cmd', '<span class="lxr-glyph">' + c.g + '</span>' + c.t);
        n.type = 'button';
        n.addEventListener('click', openPanel);
      }
      cmds.appendChild(n);
    });
    var close = el('button', 'lxr-close', 'Dismiss');
    close.type = 'button';
    close.addEventListener('click', function (e) {
      setOpen(false, fromKeyboard(e));
      /* An explicit dismissal is an answer, not a pause. */
      root.classList.remove('lxr-here');
      clearTimeout(stillTimer);
      try { if (window.sessionStorage) sessionStorage.setItem('lx-ros-dismissed', '1'); } catch (e) {}
    });
    cmds.appendChild(close);
    stage.appendChild(cmds);

    root.appendChild(stage);
    document.body.appendChild(root);

    /* The scrim sits under her and over the page. Clicking it is the
       most obvious way out, so it is wired as one. */
    var scrim = el('div', 'lxr-scrim');
    document.body.appendChild(scrim);
    scrim.addEventListener('click', function (e) { setOpen(false, fromKeyboard(e)); });

    /* ── the panel ── */
    var panel = el('div', 'lxr-panel');
    var sheet = el('div', 'lxr-sheet');
    sheet.setAttribute('role', 'dialog');
    sheet.setAttribute('aria-modal', 'true');
    sheet.setAttribute('aria-label', 'Site navigation');

    var html = '<h3>Where would you like to go?</h3>' +
               '<p class="lxr-sub">Everything below is also in the footer of every page. This is a shortcut, not the only way in.</p>' +
               '<div class="lxr-grid">';
    LINKS.forEach(function (col) {
      html += '<div class="lxr-col"><h4>' + col[0] + '</h4>';
      col[1].forEach(function (l) { html += '<a href="' + l[1] + '">' + l[0] + '</a>'; });
      html += '</div>';
    });
    html += '</div><div class="lxr-dismiss">' +
            '<span class="lxr-note">Rosario is a declared AI agent operating under published rules. ' +
            '<a href="constitution.html">Read them</a>.</span>' +
            '<button type="button" class="lxr-close" style="opacity:1">Close</button></div>';
    sheet.innerHTML = html;
    panel.appendChild(sheet);
    document.body.appendChild(panel);

    sheet.querySelector('.lxr-dismiss .lxr-close')
         .addEventListener('click', closePanel);
    panel.addEventListener('click', function (e) { if (e.target === panel) closePanel(); });


    /* ── STAY OUT OF THE WAY ────────────────────────────────────
       The scorer carries a fixed live-preview panel pinned to the
       same corner, at z-index 9000, and it made the orb literally
       unclickable. Raising her above it would only reverse the
       problem, so she moves instead.

       Measured against whatever is actually on the page rather than
       special-cased per file, because the next page to pin something
       bottom-right will not think to tell us. */
    function avoidCollisions() {
      var orb = root.querySelector('.lxr-orb');
      if (!orb) return;
      root.style.bottom = '';
      var mine = orb.getBoundingClientRect();
      var lift = 0;

      var all = document.body.querySelectorAll('*');
      for (var i = 0; i < all.length; i++) {
        var e = all[i];
        if (e === root || root.contains(e) || e.classList.contains('lxr-scrim')) continue;
        var cs = window.getComputedStyle(e);
        if (cs.position !== 'fixed' || cs.display === 'none' || cs.visibility === 'hidden') continue;
        if (parseFloat(cs.opacity) < 0.05) continue;
        /* A backdrop is not an obstruction. The grain overlay is
           fixed and covers the whole viewport, and the first version
           of this treated it as something to climb over, which shoved
           the orb off the top of every page on the site. Anything that
           cannot receive a click, or that covers most of the screen,
           is scenery. */
        if (cs.pointerEvents === 'none') continue;
        var r = e.getBoundingClientRect();
        if (!r.width || !r.height) continue;
        if (r.width > window.innerWidth * 0.72 &&
            r.height > window.innerHeight * 0.72) continue;
        /* overlap, with a small margin so they never sit flush */
        if (r.right > mine.left - 12 && r.left < mine.right + 12 &&
            r.bottom > mine.top - 12 && r.top < mine.bottom + 12) {
          lift = Math.max(lift, (mine.bottom - r.top) + 16);
        }
      }

      if (lift > 0) root.style.bottom = (26 + lift) + 'px';
    }

    var lastFocus = null;

    function openPanel() {
      lastFocus = document.activeElement;
      panel.classList.add('on');
      var first = sheet.querySelector('a');
      if (first) first.focus({ preventScroll: true });
    }
    function closePanel() {
      panel.classList.remove('on');
      if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
    }

    function setOpen(on, byKeyboard) {
      root.classList.toggle('lxr-open', on);
      scrim.classList.toggle('on', on);
      orb.setAttribute('aria-expanded', on ? 'true' : 'false');

      /* Focus is moved only when the interaction came from a
         keyboard. Older iOS Safari ignores preventScroll, so calling
         focus() on a control inside a fixed container throws the
         document back to the top, which is exactly the reported
         symptom: the page jumps and the reader has to start again.
         A pointer or a thumb needs no focus moved on their behalf;
         a keyboard does, and a keyboard is not the case that
         breaks. */
      if (!byKeyboard) return;
      if (on) {
        var f = cmds.querySelector('.lxr-cmd');
        /* Wait for the entrance before moving focus, or a screen
           reader announces a control that is still travelling. */
        if (f) setTimeout(function () { f.focus({ preventScroll: true }); }, 420);
      } else {
        orb.focus({ preventScroll: true });
      }
    }

    /* A click synthesised by Enter or Space reports detail 0; a real
       pointer or tap reports 1 or more. */
    function fromKeyboard(e) { return !e || !e.detail; }

    orb.addEventListener('click', function (e) { setOpen(true, fromKeyboard(e)); });

    /* ── WHEN SHE IS OFFERED AT ALL ────────────────────────────
       Not on arrival. A visitor landing on the homepage is reading
       the headline, and something appearing in the corner at that
       moment is an interruption rather than an offer.

       She waits until the reader has settled: far enough down to
       have chosen to stay, and still for a moment. Failing that she
       surfaces on a slow timer, so a reader who never scrolls is not
       excluded from finding her.

       And she withdraws while the page is moving. That is what fixes
       the real complaint: on a phone she sat over the copy during
       exactly the moments somebody was trying to read past her. */
    /* ── WHEN SHE IS VISIBLE ───────────────────────────────────
       One rule, and it is the whole rule: she is visible when the
       page has been still for two seconds, and gone the instant it
       moves again.

       The previous version gated her behind a scroll-depth
       threshold as well, which meant she could not be summoned near
       the top of the page and a reader who wanted her had to earn
       her first. That is backwards. Scrolling is the only thing that
       hides her now; stopping is the only thing that brings her
       back, anywhere on the page.

       She holds position while open, because then the reader is
       using her and withdrawing would be the site fighting the
       person operating it. */
    var STILL = 2000;
    var stillTimer = null;

    function settle() {
      root.classList.remove('lxr-moving');
      root.classList.add('lxr-here');
    }

    function onScrollOffer() {
      if (root.classList.contains('lxr-open')) return;
      root.classList.add('lxr-moving');
      clearTimeout(stillTimer);
      stillTimer = setTimeout(settle, STILL);
    }

    window.addEventListener('scroll', onScrollOffer, { passive: true });
    document.addEventListener('scroll', onScrollOffer, { passive: true, capture: true });

    /* Arrival counts as stillness, so a reader who never scrolls is
       not excluded. */
    stillTimer = setTimeout(settle, STILL);

    /* Re-checked rather than measured once. The scorer's panel fades
       in, so at load it is still transparent, the opacity guard skips
       it, and a single measurement concludes the corner is free. It
       is not. Anything that appears in response to the reader has to
       be measured after the reader has done something. */
    avoidCollisions();
    window.addEventListener('load', avoidCollisions);
    window.addEventListener('resize', debounce(avoidCollisions, 200), { passive: true });
    [700, 1800, 3600].forEach(function (t) { setTimeout(avoidCollisions, t); });
    ['input', 'change', 'click'].forEach(function (ev) {
      document.addEventListener(ev, debounce(avoidCollisions, 320), { passive: true, capture: true });
    });

    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      if (panel.classList.contains('on')) { closePanel(); return; }
      if (root.classList.contains('lxr-open')) setOpen(false, true);
    });

    /* Clicking away from her closes her, but not when the click was
       inside the panel she just opened. */
    document.addEventListener('click', function (e) {
      if (!root.classList.contains('lxr-open')) return;
      if (root.contains(e.target) || panel.contains(e.target)) return;
      setOpen(false, false);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
