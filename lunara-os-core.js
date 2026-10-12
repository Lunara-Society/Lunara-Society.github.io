/* ═══════════════════════════════════════════════════════════════════
   THE CORE — Lunara's central intelligence structure
   ═══════════════════════════════════════════════════════════════════

   A luminous core inside engraved, concentric rings, with an orbit
   tilted into depth. Every satellite on that orbit is one real health
   check, coloured by its measured status; its pathway to the core is
   solid when the service answered and broken when it did not. A light
   signal travels a pathway only when that check has just completed.
   Nothing here moves to suggest work that is not happening:

     idle        slow rotation; nothing in flight
     connecting  a scan sweeps the outer ring while checks are in flight
     processing  the inner rings quicken while a request you made is open
     active      a little brighter: an event was recorded in the last hour
     attention   a gold ring pulses outward: items wait on the owner
     degraded    the rim turns amber; the failing satellites are marked
     offline     colour drains out and the rings stop

   Canvas 2D, no library. It pauses offscreen and in hidden tabs, holds
   a single still frame under reduced motion or reduced effects, caps
   the pixel ratio, and lowers its own resolution if frames run slow.
   The canvas is aria-hidden: the same facts are in the health list
   beside it, which is the accessible version.
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var COL = {
    operational: [88, 199, 154], degraded: [217, 166, 79], unavailable: [226, 109, 115],
    unknown: [133, 141, 153], not_configured: [133, 141, 153], checking: [198, 203, 211]
  };
  var GOLD = [198, 161, 91], GOLD_HI = [240, 217, 155], PLAT = [198, 203, 211];
  function rgba(c, a) { return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; }
  function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t | 0, a[1] + (b[1] - a[1]) * t | 0, a[2] + (b[2] - a[2]) * t | 0]; }

  function mount(canvas, opts) {
    opts = opts || {};
    var ctx = canvas.getContext('2d');
    var REDUCED = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
    var still = function () { return REDUCED || (window.LunaraOS && window.LunaraOS.lowFx()); };
    var dprCap = Math.min(2, window.devicePixelRatio || 1);
    var W = 0, H = 0, S = 0, cx = 0, cy = 0, dpr = dprCap;
    var state = 'connecting', stateT = 0, t = 0, last = 0, raf = 0, visible = true, running = false;
    var hover = null, pointer = null, sats = [], signals = [], slow = 0;
    var spin = { a: 0, b: 0, c: 0, orbit: 0 };

    function resize() {
      var r = canvas.getBoundingClientRect();
      W = Math.max(200, r.width); H = Math.max(200, r.height); S = Math.min(W, H);
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cx = W / 2; cy = H / 2;
      draw(0);
    }

    function satellites() {
      var list = (opts.satellites && opts.satellites()) || [];
      if (list.length !== sats.length) sats = list.map(function (s, i) { return { id: s.id, name: s.name, status: s.status, i: i, x: 0, y: 0, z: 0 }; });
      else list.forEach(function (s, i) { sats[i].status = s.status; sats[i].name = s.name; sats[i].id = s.id; });
      return sats;
    }

    function speed() {
      return state === 'offline' ? 0 : state === 'processing' ? 2.4 : state === 'connecting' ? 1.4 : state === 'active' ? 1.15 : 1;
    }

    function ring(r, ry, rot, color, width, from, to, dash) {
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(rot); ctx.scale(1, ry / r);
      ctx.beginPath(); ctx.arc(0, 0, r, from == null ? 0 : from, to == null ? Math.PI * 2 : to);
      ctx.restore();
      ctx.strokeStyle = color; ctx.lineWidth = width; ctx.setLineDash(dash || []); ctx.stroke(); ctx.setLineDash([]);
    }

    function ticks(r, n, len, rot, color, every) {
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(rot);
      ctx.strokeStyle = color;
      for (var i = 0; i < n; i++) {
        var a = i / n * Math.PI * 2, long = every && i % every === 0, l = long ? len * 2.2 : len;
        ctx.lineWidth = long ? 1.4 : 0.8;
        ctx.beginPath(); ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r); ctx.lineTo(Math.cos(a) * (r + l), Math.sin(a) * (r + l)); ctx.stroke();
      }
      ctx.restore();
    }

    function draw(dt) {
      var k = S / 620;                         // everything is drawn for 620 and scaled
      var dead = state === 'offline';
      var accent = state === 'degraded' ? COL.degraded : dead ? PLAT : GOLD;
      var sp = speed();
      if (dt) { spin.a += dt * 0.00006 * sp; spin.b -= dt * 0.00011 * sp; spin.c += dt * 0.00021 * sp; spin.orbit += dt * 0.00005 * sp; }
      ctx.clearRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'source-over';

      // ── atmosphere: a column of light behind the object ───────────
      var glow = dead ? 0.05 : state === 'active' || state === 'processing' ? 0.2 : 0.15;
      if (pointer && !dead) glow += 0.03;
      var g = ctx.createRadialGradient(cx, cy, 0, cx, cy, 300 * k);
      g.addColorStop(0, rgba(accent, glow)); g.addColorStop(0.45, rgba(accent, glow * 0.25)); g.addColorStop(1, rgba(accent, 0));
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      if (!dead) {
        ctx.globalCompositeOperation = 'lighter';
        for (var s = 0; s < 6; s++) {             // light shafts, barely there
          var a = spin.a * 2 + s * Math.PI / 3, w = 0.05;
          var sh = ctx.createLinearGradient(cx, cy, cx + Math.cos(a) * 310 * k, cy + Math.sin(a) * 310 * k);
          sh.addColorStop(0, rgba(GOLD_HI, 0.05)); sh.addColorStop(1, rgba(GOLD_HI, 0));
          ctx.fillStyle = sh; ctx.beginPath(); ctx.moveTo(cx, cy);
          ctx.arc(cx, cy, 310 * k, a - w, a + w); ctx.closePath(); ctx.fill();
        }
        ctx.globalCompositeOperation = 'source-over';
      }

      // ── the orbit, tilted into depth: back half first ────────────
      var OR = 236 * k, ORY = OR * 0.36, tilt = -0.18;
      ring(OR, ORY, tilt, rgba(PLAT, 0.10), 1, Math.PI, Math.PI * 2);
      ring(OR + 14 * k, ORY + 5 * k, tilt, rgba(accent, 0.10), 0.8, Math.PI, Math.PI * 2, [2, 6]);

      // satellite positions on the orbit
      var list = satellites(), n = list.length || 1;
      list.forEach(function (st, i) {
        var a = spin.orbit + i / n * Math.PI * 2;
        var x = Math.cos(a) * OR, y = Math.sin(a) * ORY;
        st.x = cx + x * Math.cos(tilt) - y * Math.sin(tilt);
        st.y = cy + x * Math.sin(tilt) + y * Math.cos(tilt);
        st.z = Math.sin(a);                      // >0: in front of the core
      });
      function pathway(st) {
        var c = COL[st.status] || COL.unknown, front = st.z > 0;
        var lg = ctx.createLinearGradient(cx, cy, st.x, st.y);
        lg.addColorStop(0, rgba(accent, 0)); lg.addColorStop(1, rgba(c, front ? 0.42 : 0.2));
        ctx.strokeStyle = lg; ctx.lineWidth = front ? 1.1 : 0.7;
        ctx.setLineDash(st.status === 'operational' ? [] : [3, 5]);
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(st.x, st.y); ctx.stroke(); ctx.setLineDash([]);
      }
      function satellite(st) {
        var c = COL[st.status] || COL.unknown, front = st.z > 0, r = (front ? 5.2 : 3.8) * k * (hover === st ? 1.35 : 1);
        var hg = ctx.createRadialGradient(st.x, st.y, 0, st.x, st.y, r * 4);
        hg.addColorStop(0, rgba(c, front ? 0.45 : 0.22)); hg.addColorStop(1, rgba(c, 0));
        ctx.fillStyle = hg; ctx.beginPath(); ctx.arc(st.x, st.y, r * 4, 0, 7); ctx.fill();
        ctx.fillStyle = rgba(c, front ? 1 : 0.6); ctx.beginPath(); ctx.arc(st.x, st.y, r, 0, 7); ctx.fill();
        if (st.status !== 'operational') { ctx.strokeStyle = rgba(c, 0.9); ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(st.x, st.y, r + 4 * k, 0, 7); ctx.stroke(); }
        if (hover === st) {
          ctx.font = '500 ' + Math.max(10, 11 * k) + 'px "IBM Plex Mono", monospace';
          ctx.fillStyle = rgba([241, 242, 244], 0.95); ctx.textBaseline = 'middle';
          var label = st.name + ' · ' + (window.LunaraOS ? window.LunaraOS.LABEL[st.status] || st.status : st.status);
          var tw = ctx.measureText(label).width, lx = st.x + 14 * k, ly = st.y - 14 * k;
          if (lx + tw + 12 > W) lx = st.x - tw - 22 * k;
          ctx.fillStyle = 'rgba(17,20,26,.92)'; ctx.fillRect(lx - 6, ly - 10, tw + 12, 20);
          ctx.strokeStyle = rgba(GOLD, 0.5); ctx.lineWidth = 1; ctx.strokeRect(lx - 6 + 0.5, ly - 10 + 0.5, tw + 11, 19);
          ctx.fillStyle = rgba([241, 242, 244], 0.95); ctx.fillText(label, lx, ly);
        }
      }
      list.filter(function (st) { return st.z <= 0; }).forEach(function (st) { pathway(st); satellite(st); });

      // ── the architectural rings, face on ─────────────────────────
      ticks(172 * k, 120, 5 * k, spin.a, rgba(accent, dead ? 0.15 : 0.35), 10);
      ring(172 * k, 172 * k, 0, rgba(accent, dead ? 0.15 : 0.32), 1);
      ring(150 * k, 150 * k, spin.b, rgba(PLAT, dead ? 0.08 : 0.18), 1.2, 0, Math.PI * 1.6, [40 * k, 10 * k, 6 * k, 10 * k]);
      ring(126 * k, 126 * k, spin.c, rgba(accent, dead ? 0.12 : 0.45), 2, 0, Math.PI * 2, [70 * k, 22 * k]);
      ring(104 * k, 104 * k, -spin.c * 0.7, rgba(PLAT, dead ? 0.06 : 0.14), 1);
      // the vertical ring, turning about the core's axis: depth
      var ph = Math.cos(spin.a * 3.1);
      ctx.save(); ctx.translate(cx, cy); ctx.scale(Math.max(0.06, Math.abs(ph)), 1);
      ctx.beginPath(); ctx.arc(0, 0, 140 * k, 0, Math.PI * 2); ctx.restore();
      ctx.strokeStyle = rgba(GOLD_HI, dead ? 0.05 : 0.16); ctx.lineWidth = 1; ctx.stroke();

      // connecting: a scan sweeps the outer ring
      if (state === 'connecting') {
        var sa = (t * 0.003) % (Math.PI * 2);
        ctx.save(); ctx.translate(cx, cy);
        var sg = ctx.createRadialGradient(0, 0, 150 * k, 0, 0, 186 * k);
        sg.addColorStop(0, rgba(GOLD_HI, 0)); sg.addColorStop(0.6, rgba(GOLD_HI, 0.22)); sg.addColorStop(1, rgba(GOLD_HI, 0));
        ctx.fillStyle = sg; ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, 186 * k, sa, sa + 0.5); ctx.closePath(); ctx.fill();
        ctx.restore();
      }
      // attention: a ring breathing outward from the core
      if (state === 'attention') {
        var p = (t % 2600) / 2600;
        ring((110 + p * 120) * k, (110 + p * 120) * k, 0, rgba(GOLD_HI, 0.5 * (1 - p)), 1.5);
      }

      // ── the core ─────────────────────────────────────────────────
      var breath = state === 'processing' ? 0.5 + 0.5 * Math.sin(t * 0.008) : 0.5 + 0.5 * Math.sin(t * 0.0012);
      var coreC = dead ? [120, 126, 136] : state === 'degraded' ? mix(GOLD_HI, COL.degraded, 0.6) : GOLD_HI;
      var cg = ctx.createRadialGradient(cx - 8 * k, cy - 10 * k, 0, cx, cy, 62 * k);
      cg.addColorStop(0, 'rgba(255,252,240,' + (dead ? 0.35 : 0.95) + ')');
      cg.addColorStop(0.18, rgba(coreC, dead ? 0.35 : 0.85));
      cg.addColorStop(0.55, rgba(mix(coreC, [40, 32, 18], 0.55), 0.6));
      cg.addColorStop(1, 'rgba(8,9,12,0)');
      ctx.fillStyle = cg; ctx.beginPath(); ctx.arc(cx, cy, 62 * k, 0, 7); ctx.fill();
      if (!dead) {
        ctx.globalCompositeOperation = 'lighter';
        var bloom = ctx.createRadialGradient(cx, cy, 0, cx, cy, (90 + breath * 14) * k);
        bloom.addColorStop(0, rgba(coreC, 0.28 + breath * 0.08)); bloom.addColorStop(1, rgba(coreC, 0));
        ctx.fillStyle = bloom; ctx.beginPath(); ctx.arc(cx, cy, (90 + breath * 14) * k, 0, 7); ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
      }
      // the lattice inside the core: three counter-turning triangles
      ctx.save(); ctx.translate(cx, cy);
      for (var L = 0; L < 3; L++) {
        ctx.rotate(spin.c * (L % 2 ? -1.6 : 1.1) + L);
        ctx.beginPath();
        for (var v = 0; v <= 3; v++) { var va = v / 3 * Math.PI * 2; ctx.lineTo(Math.cos(va) * (30 + L * 7) * k, Math.sin(va) * (30 + L * 7) * k); }
        ctx.strokeStyle = 'rgba(255,248,230,' + (dead ? 0.08 : 0.22 - L * 0.05) + ')'; ctx.lineWidth = 0.8; ctx.stroke();
      }
      ctx.restore();

      // ── front half of the orbit, its pathways and satellites ─────
      ring(OR, ORY, tilt, rgba(PLAT, 0.22), 1.1, 0, Math.PI);
      ring(OR + 14 * k, ORY + 5 * k, tilt, rgba(accent, 0.2), 0.8, 0, Math.PI, [2, 6]);
      list.filter(function (st) { return st.z > 0; }).forEach(function (st) { pathway(st); satellite(st); });

      // ── signals: one per completed check, along its pathway ──────
      for (var j = signals.length - 1; j >= 0; j--) {
        var sg2 = signals[j]; sg2.p += dt ? dt / 900 : 0;
        var st2 = list.filter(function (x) { return x.id === sg2.id; })[0];
        if (!st2 || sg2.p >= 1) { signals.splice(j, 1); continue; }
        var px = st2.x + (cx - st2.x) * sg2.p, py = st2.y + (cy - st2.y) * sg2.p, c2 = COL[st2.status] || COL.unknown;
        var pg = ctx.createRadialGradient(px, py, 0, px, py, 7 * k);
        pg.addColorStop(0, rgba(c2, 0.9 * (1 - sg2.p * 0.6))); pg.addColorStop(1, rgba(c2, 0));
        ctx.fillStyle = pg; ctx.beginPath(); ctx.arc(px, py, 7 * k, 0, 7); ctx.fill();
      }
    }

    function frame(now) {
      raf = 0;
      if (!running) return;
      var dt = last ? Math.min(64, now - last) : 16; last = now; t += dt; stateT += dt;
      if (dt > 30) slow++; else slow = Math.max(0, slow - 1);
      if (slow > 90 && dpr > 1) { dpr = 1; slow = 0; resize(); }   // too slow here: drop resolution
      draw(dt);
      raf = requestAnimationFrame(frame);
    }
    function start() { if (running || still() || !visible || document.hidden) { if (!running) draw(0); return; } running = true; last = 0; raf = requestAnimationFrame(frame); }
    function stop() { running = false; if (raf) cancelAnimationFrame(raf); raf = 0; }

    var io = window.IntersectionObserver ? new IntersectionObserver(function (es) { visible = es[0].isIntersecting; visible ? start() : stop(); }) : null;
    if (io) io.observe(canvas);
    function onVis() { document.hidden ? stop() : start(); }
    document.addEventListener('visibilitychange', onVis);
    var ro = window.ResizeObserver ? new ResizeObserver(resize) : null;
    if (ro) ro.observe(canvas); else window.addEventListener('resize', resize);

    function pick(e) {
      var r = canvas.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top, best = null, bd = 18 * 18;
      satellites().forEach(function (st) { var d = (st.x - x) * (st.x - x) + (st.y - y) * (st.y - y); if (d < bd) { bd = d; best = st; } });
      return best;
    }
    canvas.addEventListener('pointermove', function (e) {
      pointer = e; var h = pick(e);
      if (h !== hover) { hover = h; canvas.style.cursor = h ? 'pointer' : 'default'; if (!running) draw(0); }
    });
    canvas.addEventListener('pointerleave', function () { pointer = null; hover = null; if (!running) draw(0); });
    canvas.addEventListener('click', function (e) { var h = pick(e); if (h && opts.onPick) opts.onPick(h.id); });

    resize();
    start();
    return {
      setState: function (s) { if (s !== state) { state = s; stateT = 0; } if (!running) draw(0); },
      pulse: function (id) { if (still()) { draw(0); return; } signals.push({ id: id, p: 0 }); },
      refresh: function () { satellites(); if (!running) draw(0); },
      fx: function () { still() ? (stop(), draw(0)) : start(); },
      destroy: function () { stop(); if (io) io.disconnect(); if (ro) ro.disconnect(); document.removeEventListener('visibilitychange', onVis); }
    };
  }

  window.LunaraCore = { mount: mount };
})();
