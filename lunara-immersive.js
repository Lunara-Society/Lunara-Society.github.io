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

    // Widths settle after fonts and images land; re-check then.
    // Heights settle then too, and the rescue check is a height
    // measurement, so it has to run once the page has stopped moving.
    window.addEventListener('load', function () {
      safe('wide-tables', containWideTables);
      safe('rescue-reveals', rescueReveals);
    });

    // A rotation changes both the viewport height and the section
    // heights, so an element can cross the cutoff either way.
    window.addEventListener('resize', debounce(function () {
      safe('wide-tables', containWideTables);
      safe('rescue-reveals', rescueReveals);
    }, 250), { passive: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
