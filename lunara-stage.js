/* ═══════════════════════════════════════════════════════════════════
   THE STAGE — the instruments
   ═══════════════════════════════════════════════════════════════════

   Three panels in the hero, and nothing in them is decorative:

     THE CLOCK      reads /corpus/obligations.json and counts to the
                    next binding date against the reader's own machine.
     INTEGRITY      verifies the Ed25519 signature on that corpus in
                    the reader's browser, and says so only if it passes.
     THE REGISTRY   answers a lookup the reader types, from the live
                    registry, including when the answer is "not
                    registered" — which is most of the time and is not
                    a smear.

   A hero panel that says "99.99% uptime" is a picture of a product.
   These are the product. The cost of that is that they can fail in
   public, so every one of them has an honest failure state: no number
   is invented, and nothing claims to have verified what it could not.
   ═══════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  var stage = document.getElementById('lxs');
  if (!stage) return;

  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var MONTHS = ['January','February','March','April','May','June',
                'July','August','September','October','November','December'];

  function longDate(iso) { var p = iso.split('-').map(Number); return p[2] + ' ' + MONTHS[p[1]-1] + ' ' + p[0]; }
  function todayUTC() { var n = new Date(); return Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()); }
  function isoUTC(s) { var p = s.split('-').map(Number); return Date.UTC(p[0], p[1]-1, p[2]); }
  var $ = function (id) { return document.getElementById(id); };

  /* ── entrance ──────────────────────────────────────────────────
     One class, one frame after paint, so the whole stage resolves as
     a single movement instead of each piece arriving on its own. */
  requestAnimationFrame(function () {
    requestAnimationFrame(function () { stage.classList.add('lxs-ready'); });
  });

  /* ── parallax ──────────────────────────────────────────────────
     The rack turns very slightly toward the pointer. 4 degrees at the
     extremes: enough to feel like the panels have a position in space,
     not enough to notice as an effect. Pointer only — a phone that
     tilts its hero as you walk is a phone with a broken hero. */
  if (!reduce && window.matchMedia('(hover: hover) and (min-width: 981px)').matches) {
    var rack = document.querySelector('.lxs-rack');
    var raf = 0, tx = 0, ty = 0;
    window.addEventListener('pointermove', function (e) {
      var nx = (e.clientX / window.innerWidth) - 0.5;
      var ny = (e.clientY / window.innerHeight) - 0.5;
      tx = -nx * 4.2; ty = ny * 3.4;
      if (!raf) raf = requestAnimationFrame(function apply() {
        raf = 0;
        rack.style.transform = 'rotateY(' + tx.toFixed(2) + 'deg) rotateX(' + ty.toFixed(2) + 'deg)';
      });
    }, { passive: true });
  }

  /* ── instrument one: the clock ─────────────────────────────────── */
  function runClock(corpus) {
    var now = todayUTC();
    var ahead = corpus.obligations
      .filter(function (o) { return isoUTC(o.applies_from) > now; })
      .sort(function (a, b) { return isoUTC(a.applies_from) - isoUTC(b.applies_from); });
    var inForce = corpus.obligations.length - ahead.length;
    if (!ahead.length) return;

    var next = ahead[0];
    var days = Math.round((isoUTC(next.applies_from) - now) / 86400000);

    /* Counts up to the real figure rather than appearing at it. The
       number is true at every frame — it starts at zero and stops at
       the answer, it does not drift past it and come back. */
    var el = $('lxs-days');
    var target = days;
    if (reduce) { el.textContent = target; }
    else {
      var t0 = performance.now(), dur = 900;
      (function tick(t) {
        var k = Math.min(1, (t - t0) / dur);
        el.textContent = Math.round(target * (1 - Math.pow(1 - k, 3)));
        if (k < 1) requestAnimationFrame(tick);
      })(t0);
    }

    $('lxs-days-unit').textContent = target === 1 ? 'day' : 'days';
    $('lxs-next').innerHTML = next.name + ' &middot; ' + longDate(next.applies_from);
    $('lxs-inforce').textContent = inForce + ' of ' + corpus.obligations.length +
      ' obligation' + (corpus.obligations.length === 1 ? '' : 's') + ' in this register are already in force.';
  }

  /* ── instrument two: the signature ─────────────────────────────── */
  function canon(v) {
    if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']';
    if (v && typeof v === 'object') {
      return '{' + Object.keys(v).filter(function (k) { return v[k] !== undefined; }).sort()
        .map(function (k) { return JSON.stringify(k) + ':' + canon(v[k]); }).join(',') + '}';
    }
    return JSON.stringify(v);
  }
  function b64u(buf) {
    return btoa(String.fromCharCode.apply(null, new Uint8Array(buf)))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function unb64u(s) {
    return Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), function (c) { return c.charCodeAt(0); });
  }

  function fill(pct) { var f = $('lxs-fill'); if (f) f.style.inset = '0 ' + (100 - pct) + '% 0 0'; }

  function runSignature(corpusText) {
    var state = $('lxs-sig-state'), detail = $('lxs-sig-detail'), dot = $('lxs-sig-dot');
    fill(18);

    Promise.all([
      fetch('/corpus/obligations.assertion.json', { cache: 'no-cache' }).then(function (r) { return r.json(); }),
      fetch('/.well-known/keys.json', { cache: 'no-cache' }).then(function (r) { return r.json(); })
    ]).then(function (parts) {
      var env = parts[0], keys = parts[1], a = env.assertion;
      var jwk = (keys.keys || []).filter(function (k) { return k.kid === a.key_id; })[0];
      if (!jwk) throw new Error('key not published');
      fill(52);
      return Promise.all([
        crypto.subtle.digest('SHA-256', new TextEncoder().encode(corpusText)),
        crypto.subtle.importKey('jwk', { kty: jwk.kty, crv: jwk.crv, x: jwk.x, key_ops: ['verify'] },
          { name: 'Ed25519' }, false, ['verify'])
      ]).then(function (r) {
        fill(78);
        return crypto.subtle.verify({ name: 'Ed25519' }, r[1], unb64u(env.signature.value),
          new TextEncoder().encode(canon(a))).then(function (sigOk) {
          var digest = b64u(r[0]);
          var digestOk = digest === a.claims.digest.value;
          fill(100);
          if (sigOk && digestOk) {
            dot.className = 'lxs-dot live';
            state.innerHTML = 'Verified <small>in your browser</small>';
            detail.textContent = 'Ed25519 · key ' + a.key_id + ' · sha-256 ' + digest.slice(0, 22) + '…';
          } else {
            dot.className = 'lxs-dot';
            state.textContent = 'Check failed';
            detail.textContent = 'This copy does not match the signature Lunara published. Do not rely on it.';
          }
        });
      });
    }).catch(function () {
      /* No Ed25519 in this browser, or the files did not arrive. Neither
         means the corpus is bad, and claiming a pass here would be the
         one lie this panel exists to prevent. */
      fill(100);
      dot.className = 'lxs-dot';
      state.innerHTML = 'Not checked here <small>this browser</small>';
      detail.innerHTML = 'Your browser could not run the check. The same verification from a terminal is on <a href="signing.html" style="color:#9FC3E8">the signing page</a>.';
    });
  }

  /* ── instrument three: the registry ────────────────────────────── */
  var REGISTRY = 'https://base44.app/api/apps/6a46cea2687503d2d6d4ecd1/functions/shieldRegistryLookup';
  function lookup() {
    var input = $('lxs-domain'), out = $('lxs-verdict'), dot = $('lxs-reg-dot');
    var domain = (input.value || '').trim().toLowerCase()
      .replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '');
    if (!domain) { input.focus(); return; }

    dot.className = 'lxs-dot work';
    out.textContent = 'Querying the register…';

    fetch(REGISTRY, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ domain: domain })
    }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then(function (json) {
      var status = json.status || (json.found ? 'verified' : 'not_registered');
      if (status === 'verified') {
        dot.className = 'lxs-dot live';
        out.innerHTML = '<span class="ok">Verified.</span> <b>' + domain + '</b> holds a Shield credential. A named reviewer signed that decision.';
      } else if (status === 'revoked') {
        dot.className = 'lxs-dot gold';
        out.innerHTML = '<b>' + domain + '</b> held a credential and it was withdrawn. Check the revocation reason before relying on it.';
      } else {
        dot.className = 'lxs-dot';
        out.innerHTML = '<b>' + domain + '</b> is not in the register. That is true of almost every business and says nothing against them — it means nobody has checked, which is exactly the gap this institution exists to close.';
      }
    }).catch(function () {
      dot.className = 'lxs-dot';
      out.textContent = 'The register could not be reached just now. No status is shown rather than a guessed one.';
    });
  }
  $('lxs-go').addEventListener('click', lookup);
  $('lxs-domain').addEventListener('keydown', function (e) { if (e.key === 'Enter') lookup(); });

  /* ── the one fetch everything hangs off ────────────────────────── */
  fetch('/corpus/obligations.json', { cache: 'no-cache' })
    .then(function (r) { return r.text(); })
    .then(function (text) {
      runClock(JSON.parse(text));
      runSignature(text);
    })
    .catch(function () {
      $('lxs-days').textContent = '—';
      $('lxs-next').textContent = 'The register could not be read just now.';
      $('lxs-inforce').textContent = 'Nothing is shown rather than something remembered.';
      $('lxs-sig-state').textContent = 'Nothing to check';
      $('lxs-sig-detail').textContent = 'The corpus did not load, so there is nothing to verify.';
      fill(100);
    });
})();
