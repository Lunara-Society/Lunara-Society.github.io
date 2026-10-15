/* ═══════════════════════════════════════════════════════════════════
   THE FIELD: one pointer, read once, eased once, shared by everything
   ═══════════════════════════════════════════════════════════════════

   Before this file, six scripts each listened to the pointer and each
   eased it at its own rate, so the light, the moon and the instrument
   rack drifted at three different speeds. Now there is one listener and
   one inertia, and everything that answers the pointer answers it
   together.

     window.LunaraField.on(fn)  fn({ x, y, vx, vy }) every frame the field
                                moves: x and y eased from -0.5 to 0.5
                                across the viewport, vx and vy how fast
     --px, --py on <html>       the same eased values, for CSS
     data-light on an element   gives it --mx and --my (percent), where
                                the pointer is over it, for a sheen or an
                                edge light (see lunara-materials.css)

   Fine pointers only: on touch there is no hover to follow, and the
   field stays at rest. Reduced motion: it stays at rest. The loop runs
   only while something is still settling, so an idle page costs
   nothing.

   A script that loads before this one can queue a subscriber:
     (window.__lxField = window.__lxField || []).push(fn)
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.LunaraField) return;
  var REDUCED = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  var FINE = !!(window.matchMedia && matchMedia('(hover: hover) and (pointer: fine)').matches);
  var root = document.documentElement, subs = [], raf = 0;
  var S = { x: 0, y: 0, tx: 0, ty: 0, vx: 0, vy: 0, cx: -1, cy: -1 };
  var K = 0.075;                                           // the inertia: about a third of a second to arrive

  function tick() {
    raf = 0;
    var px = S.x, py = S.y;
    S.x += (S.tx - S.x) * K; S.y += (S.ty - S.y) * K;
    S.vx = S.x - px; S.vy = S.y - py;
    root.style.setProperty('--px', S.x.toFixed(4));
    root.style.setProperty('--py', S.y.toFixed(4));
    for (var i = 0; i < subs.length; i++) { try { subs[i](S); } catch (e) {} }
    if (Math.abs(S.tx - S.x) > 0.0005 || Math.abs(S.ty - S.y) > 0.0005) raf = requestAnimationFrame(tick);
  }
  function wake() { if (!raf) raf = requestAnimationFrame(tick); }

  /* the local light: where the pointer is over a lit surface */
  var lit = null;
  function light(e) {
    var el = e.target && e.target.closest ? e.target.closest('[data-light]') : null;
    if (lit && lit !== el) lit.classList.remove('m-lit');
    lit = el;
    if (!el) return;
    var b = el.getBoundingClientRect();
    el.style.setProperty('--mx', ((e.clientX - b.left) / b.width * 100).toFixed(1) + '%');
    el.style.setProperty('--my', ((e.clientY - b.top) / b.height * 100).toFixed(1) + '%');
    el.classList.add('m-lit');
  }

  if (FINE && !REDUCED) {
    window.addEventListener('pointermove', function (e) {
      S.cx = e.clientX; S.cy = e.clientY;
      S.tx = e.clientX / innerWidth - 0.5; S.ty = e.clientY / innerHeight - 0.5;
      light(e);
      wake();
    }, { passive: true });
    document.addEventListener('pointerleave', function () { S.tx = 0; S.ty = 0; if (lit) { lit.classList.remove('m-lit'); lit = null; } wake(); });
  }

  window.LunaraField = {
    state: S,
    active: FINE && !REDUCED,
    on: function (fn) { if (typeof fn === 'function') { subs.push(fn); try { fn(S); } catch (e) {} } }
  };
  (window.__lxField || []).forEach(window.LunaraField.on);
  window.__lxField = { push: window.LunaraField.on };
})();
