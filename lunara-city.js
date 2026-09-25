/* ═══════════════════════════════════════════════════════════════════
   THE CITY — the public register, drawn at night
   ═══════════════════════════════════════════════════════════════════

   Every window stands for a business an AI system might deal with. A
   window lights only when a named reviewer has verified the business
   behind it and signed the decision. The count and the lit windows are
   read from the register at load; nothing here states them. With an
   empty register the city is dark, which is the true picture.

   A domain always maps to the same window, so a business can find its
   own. Looking one up sends a light to that window and asks the live
   register; the answer is the register's, word for word in meaning,
   including when it is not_registered, which is most of the time and
   is not a mark against anyone.

   Used on registry.html. Pages call LunaraCity.find(domain) to point
   the light from their own lookup.
   ═══════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';
  if (!document.getElementById('city-canvas')) return;

  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var DPR = Math.min(window.devicePixelRatio || 1, 2);
  var $ = function (id) { return document.getElementById(id); };
  var REGISTRY_LOOKUP = 'https://base44.app/api/apps/6a46cea2687503d2d6d4ecd1/functions/shieldRegistryLookup';
  var REGISTRY_LIST   = 'https://base44.app/api/apps/6a46cea2687503d2d6d4ecd1/functions/shieldRegistryList';
  function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function rng(seed) {
    return function () {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      var t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function hash(s) { var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  var registryP = fetch(REGISTRY_LIST, { cache: 'no-cache' })
    .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(function (j) {
      var list = Array.isArray(j.businesses) ? j.businesses : [];
      var n = typeof j.count === 'number' ? j.count : (Array.isArray(j.businesses) ? j.businesses.length : null);
      if (n === null) throw new Error('no count');
      return { n: n, list: list };
    });

  /* ── the city ──────────────────────────────────────────────────── */
  function mount() {
    var c = $('city-canvas'); if (!c) return;
    var ctx = c.getContext('2d'), W = 0, H = 0, base = null, windows = [], masts = [], lit = {}, raf = 0, cityVisible = true;
    var spot = null;                         /* {x,y,tx,ty,a,ta,win,state,t0} */
    var label = $('city-label');

    function build() {
      var b = c.getBoundingClientRect(); W = b.width; H = b.height;
      c.width = Math.round(W * DPR); c.height = Math.round(H * DPR);
      base = document.createElement('canvas'); base.width = c.width; base.height = c.height;
      var g = base.getContext('2d'); g.setTransform(DPR, 0, 0, DPR, 0, 0);
      var r = rng(1744);
      windows = [];

      masts = [];
      /* sky: a moonlit haze toward the horizon, a few stars, and the
         moon's light from the upper right */
      var sky = g.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, 'rgba(6,7,10,0)'); sky.addColorStop(0.55, 'rgba(18,23,33,0.55)'); sky.addColorStop(0.8, 'rgba(26,32,45,0.75)'); sky.addColorStop(1, 'rgba(12,15,21,0.9)');
      g.fillStyle = sky; g.fillRect(0, 0, W, H);
      for (var i = 0; i < 260; i++) {
        var m = Math.pow(r(), 4);
        g.fillStyle = 'rgba(236,238,244,' + (0.1 + m * 0.5).toFixed(2) + ')';
        g.fillRect(r() * W, r() * H * 0.6, 0.5 + m, 0.5 + m);
      }
      var glow = g.createRadialGradient(W * 0.88, H * 0.06, 0, W * 0.88, H * 0.06, W * 0.55);
      glow.addColorStop(0, 'rgba(236,230,214,0.13)'); glow.addColorStop(0.35, 'rgba(170,184,214,0.05)'); glow.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = glow; g.fillRect(0, 0, W, H);

      /* Three depths. Farther is lighter, as air makes it; nearer is
         darker and taller. The skyline rises to the right so the words
         on the left sit on open sky. */
      var layers = [
        { col: [22,27,37], top: [30,36,49], min: 120, max: 320, wmin: 30, wmax: 70,  win: [2, 3, 4, 5],  wa: 0.05, edge: 0.07, gap: [0, 5] },
        { col: [15,18,26], top: [24,29,40], min: 190, max: 500, wmin: 40, wmax: 96,  win: [3, 5, 5, 7],  wa: 0.07, edge: 0.12, gap: [1, 10] },
        { col: [9,11,16],  top: [20,24,33], min: 260, max: 700, wmin: 56, wmax: 128, win: [4, 7, 6, 9],  wa: 0.09, edge: 0.22, gap: [3, 16] }
      ];
      layers.forEach(function (L, li) {
        var x = -30 - r() * 40;
        while (x < W + 30) {
          var bw = L.wmin + r() * (L.wmax - L.wmin);
          var u = Math.min(1, Math.max(0, (x - W * 0.1) / (W * 0.9)));
          var rise = 0.22 + 0.78 * Math.pow(u, 0.9);
          var bh = (L.min + r() * (L.max - L.min)) * rise * Math.min(1, H / 900);
          if (li === 2 && x < W * 0.5) bh *= 0.5;
          if (li === 1 && x < W * 0.45) bh *= 0.62;
          var by = H - bh;
          /* the facade: moonlit at the top, falling into the dark */
          var fg = g.createLinearGradient(0, by, 0, H);
          fg.addColorStop(0, 'rgb(' + L.top.join(',') + ')'); fg.addColorStop(0.35, 'rgb(' + L.col.join(',') + ')'); fg.addColorStop(1, 'rgb(' + L.col.map(function (v) { return Math.round(v * 0.7); }).join(',') + ')');
          g.fillStyle = fg; g.fillRect(x, by, bw, bh);
          /* a crown: setback, and sometimes a mast */
          if (r() < 0.42 && bh > 200) {
            var sw = bw * (0.38 + r() * 0.34), sh = 16 + r() * 46, sx0 = x + (bw - sw) / 2;
            g.fillStyle = 'rgb(' + L.top.join(',') + ')'; g.fillRect(sx0, by - sh, sw, sh);
            g.fillStyle = 'rgba(214,222,234,' + L.edge + ')'; g.fillRect(sx0 + sw - 1, by - sh, 1, sh);
            if (r() < 0.55) {
              var mh = 30 + r() * 70;
              g.fillStyle = 'rgba(' + L.top.join(',') + ',1)'; g.fillRect(sx0 + sw / 2 - 0.75, by - sh - mh, 1.5, mh);
              if (li > 0) masts.push({ x: sx0 + sw / 2, y: by - sh - mh, ph: r() * 6.28, sp: 0.8 + r() * 0.6 });
            }
          }
          /* moonlight on the right-hand edge and the roofline */
          g.fillStyle = 'rgba(214,222,234,' + L.edge + ')'; g.fillRect(x + bw - 1, by, 1, bh);
          g.fillStyle = 'rgba(214,222,234,' + (L.edge * 0.7) + ')'; g.fillRect(x, by, bw, 1);
          /* windows, all dark; the upper right panes catch the moon */
          var ww = L.win[0], wh = L.win[1], gx = L.win[2], gy = L.win[3];
          var cols = Math.floor((bw - 12) / (ww + gx)), rows = Math.floor((bh - 22) / (wh + gy));
          var ox = x + (bw - cols * (ww + gx) + gx) / 2, fins = r() < 0.3;
          for (var cc = 0; cc < cols; cc++) for (var rr = 0; rr < rows; rr++) {
            var wx = ox + cc * (ww + gx), wy = by + 16 + rr * (wh + gy);
            var diag = (cc / Math.max(1, cols - 1)) - (rr / Math.max(1, rows)) * 0.9;
            var glint = diag > 0.55 && r() < 0.5 ? 0.11 * (diag - 0.4) : 0;
            g.fillStyle = 'rgba(150,166,196,' + (L.wa * (0.55 + r() * 0.7) + glint).toFixed(3) + ')';
            g.fillRect(wx, wy, ww, wh);
            if (wy < H * 0.8 && wy > H * 0.38 && wx < W - 90 && ((li === 2 && wx > W * 0.5) || (li === 1 && wx > W * 0.56))) windows.push({ x: wx, y: wy, w: ww, h: wh });
          }
          if (fins) { g.fillStyle = 'rgba(0,0,0,0.25)'; for (var fx = 0; fx < cols; fx += 2) g.fillRect(ox + fx * (ww + gx) - gx / 2, by + 8, 1, bh - 8); }
          x += bw + L.gap[0] + r() * (L.gap[1] - L.gap[0]);
        }
        /* air between the depths */
        if (li < 2) {
          var hz = g.createLinearGradient(0, H * 0.55, 0, H);
          hz.addColorStop(0, 'rgba(14,18,26,0)'); hz.addColorStop(1, 'rgba(14,18,26,0.45)');
          g.fillStyle = hz; g.fillRect(0, 0, W, H);
        }
      });
      /* ground fog, and the street's own faint glow */
      var fog = g.createLinearGradient(0, H - 160, 0, H);
      fog.addColorStop(0, 'rgba(6,7,10,0)'); fog.addColorStop(1, 'rgba(6,7,10,0.92)');
      g.fillStyle = fog; g.fillRect(0, H - 160, W, 160);
      render(performance.now());
    }

    function windowFor(domain) { return windows.length ? windows[hash(domain) % windows.length] : null; }

    function paintWin(w, color, a, bloom) {
      ctx.save();
      ctx.globalAlpha = a;
      if (bloom) { ctx.shadowColor = color; ctx.shadowBlur = bloom; }
      ctx.fillStyle = color; ctx.fillRect(w.x, w.y, w.w, w.h);
      ctx.restore();
    }

    function render(t) {
      raf = 0;
      if (!base) return;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, c.width, c.height);
      ctx.drawImage(base, 0, 0);
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      var anim = false;
      /* aircraft warning lights on the masts: red, so nobody mistakes
         them for a verified business */
      masts.forEach(function (m) {
        var a = reduce ? 0.8 : Math.max(0, Math.sin(t / 1000 * m.sp * 3.14 + m.ph));
        a = Math.pow(a, 6);
        ctx.fillStyle = 'rgba(232,72,58,' + (0.25 + 0.75 * a).toFixed(3) + ')';
        ctx.beginPath(); ctx.arc(m.x, m.y, 1.4, 0, 6.2832); ctx.fill();
        if (a > 0.05) { ctx.fillStyle = 'rgba(232,72,58,' + (0.18 * a).toFixed(3) + ')'; ctx.beginPath(); ctx.arc(m.x, m.y, 7, 0, 6.2832); ctx.fill(); }
      });
      if (!reduce && masts.length && cityVisible) anim = true;
      Object.keys(lit).forEach(function (d) {
        var L = lit[d], w = windowFor(d); if (!w) return;
        var col = L.state === 'revoked' ? '#8A5F2C' : '#E2C47A';
        var flick = L.state === 'verified' && !reduce ? 0.9 + 0.1 * Math.sin(t / 700 + hash(d)) : 1;
        paintWin(w, col, flick, L.state === 'revoked' ? 4 : 16);
        if (L.state === 'verified' && !reduce) anim = true;
      });
      if (spot) {
        var k = reduce ? 1 : Math.min(1, (t - spot.t0) / 900), e = 1 - Math.pow(1 - k, 3);
        var sx = spot.fx + (spot.tx - spot.fx) * e, sy = spot.fy + (spot.ty - spot.fy) * e;
        spot.a += (spot.ta - spot.a) * 0.08;
        var gr = ctx.createRadialGradient(sx, sy, 0, sx, sy, 110);
        gr.addColorStop(0, 'rgba(236,232,220,' + (0.34 * spot.a).toFixed(3) + ')');
        gr.addColorStop(0.35, 'rgba(236,232,220,' + (0.12 * spot.a).toFixed(3) + ')');
        gr.addColorStop(1, 'rgba(236,232,220,0)');
        ctx.fillStyle = gr; ctx.fillRect(sx - 110, sy - 110, 220, 220);
        /* the beam, from the street */
        ctx.save(); ctx.globalAlpha = 0.13 * spot.a;
        var bg = ctx.createLinearGradient(sx, sy, spot.ox, H);
        bg.addColorStop(0, 'rgba(236,232,220,1)'); bg.addColorStop(1, 'rgba(236,232,220,0)');
        ctx.fillStyle = bg; ctx.beginPath(); ctx.moveTo(sx - 5, sy); ctx.lineTo(sx + 5, sy); ctx.lineTo(spot.ox + 40, H); ctx.lineTo(spot.ox - 40, H); ctx.closePath(); ctx.fill();
        ctx.restore();
        if (spot.state === 'querying' && spot.win && k >= 1) {
          paintWin(spot.win, '#F2ECDD', 0.25 + 0.35 * Math.abs(Math.sin(t / 110)), 10);
        }
        if (spot.state === 'answered' && spot.win) {
          /* found, and dark: a frame around the window, not a light in it */
          ctx.strokeStyle = 'rgba(236,232,220,' + (0.85 * spot.a).toFixed(3) + ')';
          ctx.lineWidth = 1;
          ctx.strokeRect(spot.win.x - 3.5, spot.win.y - 3.5, spot.win.w + 7, spot.win.h + 7);
        }
        if (k < 1 || spot.state === 'querying' || Math.abs(spot.ta - spot.a) > 0.01) anim = true;
        else if (spot.ta === 0) spot = null;
        if (spot && spot.win && label.classList.contains('on')) {
          var half = label.offsetWidth / 2 + 12;
          label.style.left = Math.min(W - half, Math.max(half, spot.win.x + spot.win.w / 2)) + 'px';
          label.style.top = (c.offsetTop + spot.win.y) + 'px';
        }
      }
      if (anim) raf = requestAnimationFrame(render);
    }
    function kick() { if (!raf) raf = requestAnimationFrame(render); }

    build();
    var rt = 0; window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(build, 150); });
    new IntersectionObserver(function (es) { cityVisible = es[0].isIntersecting; if (cityVisible) kick(); }).observe(c);

    /* the register's own count, and a light for every verified business */
    registryP.then(function (reg) {
      var n = reg.n;
      if ($('city-n')) $('city-n').textContent = n === 0 ? 'no verified businesses' : n + (n === 1 ? ' verified business' : ' verified businesses');
      reg.list.forEach(function (b) {
        var d = (b.domain || b.website || '').toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '');
        var st = (b.status || b.shield_status || 'verified').toLowerCase();
        if (d) lit[d] = { state: st.indexOf('revok') === 0 ? 'revoked' : 'verified' };
      });
      kick();
    }).catch(function () {
      if ($('city-n')) $('city-n').textContent = 'an unknown number of businesses, because the register could not be reached';
    });

    /* look a business up, and find its window */
    var form = $('city-q'), out = $('city-out') || document.createElement('p'), input = $('city-domain');
    if (form) form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!(input.value || '').trim()) { input.focus(); return; }
      find(input.value);
    });
    window.LunaraCity = { find: function (d) { find(d); } };
    function find(raw) {
      var domain = String(raw || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '');
      if (!domain) return;
      var w = windowFor(domain);
      if (!w) return;
      var from = spot ? { x: spot.tx, y: spot.ty } : { x: W * 0.72, y: H * 0.95 };
      spot = { fx: from.x, fy: from.y, tx: w.x + w.w / 2, ty: w.y + w.h / 2, ox: W * (0.55 + (hash(domain) % 40) / 100), a: spot ? spot.a : 0, ta: 1, win: w, state: 'querying', t0: performance.now() };
      label.classList.remove('on');
      out.innerHTML = 'Querying the register for <b>' + esc(domain) + '</b>&hellip;';
      kick();

      fetch(REGISTRY_LOOKUP, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ domain: domain }) })
        .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
        .then(function (json) {
          var status = json.status || (json.found ? 'verified' : 'not_registered');
          if (status === 'verified') {
            lit[domain] = { state: 'verified' };
            out.innerHTML = '<b>' + esc(domain) + '</b> is verified. Its window is lit, and a named reviewer signed that decision.';
          } else if (status === 'revoked') {
            lit[domain] = { state: 'revoked' };
            out.innerHTML = '<b>' + esc(domain) + '</b> held a credential and it was withdrawn. Check the revocation reason before relying on it.';
          } else {
            out.innerHTML = '<b>' + esc(domain) + '</b> is not in the register, so its window stays dark. That is true of almost every business and says nothing against them. It means nobody has checked yet.';
          }
          label.innerHTML = esc(domain) + '<em>' + esc(status) + '</em>';
          label.classList.add('on');
          spot.state = 'answered';
          spot.ta = status === 'verified' ? 0.5 : 0.75;
          kick();
        })
        .catch(function () {
          out.textContent = 'The register could not be reached just now. No status is shown rather than a guessed one.';
          spot.state = 'answered'; spot.ta = 0; label.classList.remove('on'); kick();
        });
    }
  }

  try { mount(); } catch (e) { if (window.console) console.warn('[lunara-city]', e.message); }
})();
