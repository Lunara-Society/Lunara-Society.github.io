/* ═══════════════════════════════════════════════════════════════════
   BREAK THE SEAL — the reader's hands on the signed record
   ═══════════════════════════════════════════════════════════════════

   Everything this institution publishes for machines is signed, and
   the claim is that a reader need not trust us: they can check. This
   is that check, with the reader holding the document.

   The text is one entry of /corpus/obligations.json, sliced out of the
   file exactly as it is served. Beside it runs the verification an AI
   system performs before it relies on a date from us:

     01  SHA-256 over the whole document, with the reader's edits
         spliced back into the served bytes at the same offsets
     02  the digest Lunara signed, from obligations.assertion.json
     03  Ed25519 over that assertion (RFC 8785 canonical JSON) with the
         key published at /.well-known/keys.json

   Change one character and 01 no longer equals 02: the avalanche puts
   roughly sixty of the sixty-four hex digits somewhere else, and the
   seal breaks. Restore the bytes and it closes. Nothing is simulated,
   nothing is sent anywhere, and where the browser cannot run a step
   the panel says so rather than claiming a pass.

   The one-click edit is our own published mistake: correction 04, the
   Article 50(2) date we once carried as February. The record refuses
   it now, and so will the reader's browser.
   ═══════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  var root = document.getElementById('seal');
  if (!root) return;
  var $ = function (id) { return document.getElementById(id); };
  var src = $('st-src'), hl = $('st-hl');
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var RAW = '', START = 0, END = 0, ORIGINAL = '', PUB = '', FIRST_LINE = 1;
  var sigState = 'pending', keyId = '';

  function esc(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function b64uToBytes(s) {
    return Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), function (c) { return c.charCodeAt(0); });
  }
  function hex(bytes) { return [].map.call(bytes, function (b) { return ('0' + b.toString(16)).slice(-2); }).join(''); }
  function canon(v) {
    if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']';
    if (v && typeof v === 'object') {
      return '{' + Object.keys(v).filter(function (k) { return v[k] !== undefined; }).sort()
        .map(function (k) { return JSON.stringify(k) + ':' + canon(v[k]); }).join(',') + '}';
    }
    return JSON.stringify(v);
  }

  /* ── the excerpt: one whole entry, cut at its braces ─────────────── */
  function slice(raw) {
    var at = raw.indexOf('"name": "Article 50(2) marking');
    if (at < 0) at = raw.indexOf('"applies_from"');
    var s = raw.lastIndexOf('\n    {', at) + 1;
    var e = raw.indexOf('\n    }', at) + 6;
    return { s: s, e: e };
  }

  /* ── syntax colour, and a mark over whatever the reader changed ── */
  var TOK = /("(?:[^"\\]|\\.)*")(\s*:)?|(-?\d+(?:\.\d+)?|null|true|false)|([{}\[\],:])|(\s+)|([^\s"{}\[\],:]+)/g;
  function segments(line) {
    var out = [], m;
    TOK.lastIndex = 0;
    while ((m = TOK.exec(line))) {
      if (m[1]) {
        var cls = m[2] ? 'k' : (/^"\d{4}-\d{2}-\d{2}"$/.test(m[1]) ? 'd' : 's');
        out.push([m[1], cls]);
        if (m[2]) out.push([m[2], 'p']);
      } else if (m[3]) out.push([m[3], 'n']);
      else if (m[4]) out.push([m[4], 'p']);
      else out.push([m[0], '']);
    }
    return out;
  }
  function changedRange(a, b) {
    if (a === b) return null;
    var i = 0, n = Math.min(a.length, b.length);
    while (i < n && a.charCodeAt(i) === b.charCodeAt(i)) i++;
    var j = 0;
    while (j < n - i && a.charCodeAt(a.length - 1 - j) === b.charCodeAt(b.length - 1 - j)) j++;
    var end = b.length - j;
    if (end <= i) end = Math.min(b.length, i + 1);
    return [i, end];
  }
  function paint(text) {
    var r = changedRange(ORIGINAL, text);
    var lines = text.split('\n'), pos = 0, html = '';
    lines.forEach(function (line, li) {
      html += '<span class="l" data-n="' + (FIRST_LINE + li) + '">';
      segments(line).forEach(function (seg) {
        var t = seg[0], a = pos, b = pos + t.length;
        var open = seg[1] ? '<span class="' + seg[1] + '">' : '<span>';
        if (r && b > r[0] && a < r[1]) {
          var x = Math.max(a, r[0]) - a, y = Math.min(b, r[1]) - a;
          html += open + esc(t.slice(0, x)) + '<span class="chg">' + esc(t.slice(x, y)) + '</span>' + esc(t.slice(y)) + '</span>';
        } else html += open + esc(t) + '</span>';
        pos = b;
      });
      /* a change that is only a newline has nowhere to show; mark the line end */
      if (r && r[0] === pos && r[1] === pos + 1 && text.charAt(pos) === '\n') html += '<span class="chg"> </span>';
      html += '​</span>';
      pos += 1;
    });
    hl.innerHTML = html;
  }

  /* ── the hex grids ─────────────────────────────────────────────── */
  function grid(el, h, against, flashFrom) {
    var html = '';
    for (var i = 0; i < h.length; i++) {
      var cls = [];
      if (against && h[i] !== against[i]) cls.push('x');
      if (flashFrom && !reduce && h[i] !== flashFrom[i]) cls.push('f');
      html += '<span' + (cls.length ? ' class="' + cls.join(' ') + '"' : '') + '>' + h[i] + '</span>';
    }
    el.innerHTML = html;
  }

  var seq = 0, lastNow = '';
  function check() {
    var text = src.value;
    var edited = text !== ORIGINAL;
    var doc = RAW.slice(0, START) + text + RAW.slice(END);
    var bytes = new TextEncoder().encode(doc);
    var mine = ++seq;
    paint(text);
    crypto.subtle.digest('SHA-256', bytes).then(function (buf) {
      if (mine !== seq) return;
      var now = hex(new Uint8Array(buf));
      grid($('st-hex-now'), now, PUB, lastNow);
      lastNow = now;
      var diff = 0; for (var i = 0; i < 64; i++) if (now[i] !== PUB[i]) diff++;
      var match = diff === 0;
      $('st-now-sub').innerHTML = match
        ? 'Computed in your browser over <b>' + bytes.length.toLocaleString('en') + ' bytes</b>. Every character matches.'
        : 'Computed in your browser over <b>' + bytes.length.toLocaleString('en') + ' bytes</b>. <b>' + diff + ' of 64</b> characters now differ.';
      verdict(match, edited, diff);
    });
    $('st-edited').textContent = edited ? 'Edited by you' : 'As published';
    $('st-restore').disabled = !edited;
  }

  function verdict(match, edited, diff) {
    var vk = $('st-vk'), vt = $('st-vt');
    root.classList.toggle('broken', !match);
    if (match) {
      if (sigState === 'valid') {
        vk.textContent = 'Seal intact · verified in your browser';
        vt.textContent = 'Byte for byte, this is the record Lunara signed.';
      } else if (sigState === 'invalid') {
        root.classList.add('broken');
        vk.textContent = 'Signature failed';
        vt.textContent = 'The digest matches, but the signature over it does not verify. Do not rely on this copy.';
      } else {
        vk.textContent = 'Digest matches';
        vt.textContent = 'This browser cannot check Ed25519, so the signature itself was not checked here. The terminal check is on the signing page.';
      }
    } else if (edited) {
      vk.textContent = 'Seal broken · ' + diff + ' of 64 differ';
      vt.textContent = 'One edit, and this is no longer the document Lunara signed. An AI system checking it would refuse every date in it.';
    } else {
      vk.textContent = 'This copy does not match';
      vt.textContent = 'What your browser received is not what Lunara signed. Do not rely on it, and tell us: rosario@lunarasociety.com.';
    }
  }

  /* ── the signature: checked once, since the reader cannot edit it ─ */
  function verifySignature(env, keys) {
    var a = env.assertion;
    keyId = a.key_id;
    var jwk = (keys.keys || []).filter(function (k) { return k.kid === a.key_id; })[0];
    if (!jwk) { sigState = 'invalid'; return Promise.resolve(); }
    return crypto.subtle.importKey('jwk', { kty: jwk.kty, crv: jwk.crv, x: jwk.x, key_ops: ['verify'] }, { name: 'Ed25519' }, false, ['verify'])
      .then(function (key) {
        return crypto.subtle.verify({ name: 'Ed25519' }, key, b64uToBytes(env.signature.value), new TextEncoder().encode(canon(a)));
      })
      .then(function (ok) { sigState = ok ? 'valid' : 'invalid'; })
      .catch(function () { sigState = 'unavailable'; });
  }

  function paintSig() {
    var el = $('st-sig');
    if (sigState === 'valid') el.innerHTML = '<span class="ok">Valid.</span> Ed25519 over the canonical assertion, key <b>' + esc(keyId) + '</b>. The claim that the digest above is ours is itself signed.';
    else if (sigState === 'invalid') el.textContent = 'Invalid. The published assertion does not verify against the published key.';
    else el.textContent = 'Not checkable in this browser (no Ed25519 in its Web Crypto). The digest comparison above still is.';
  }

  if (!(window.crypto && crypto.subtle && window.TextEncoder)) {
    hl.textContent = 'This browser has no Web Crypto, so the check cannot run here. The terminal version is on the signing page.';
    return;
  }

  Promise.all([
    fetch('/corpus/obligations.json', { cache: 'no-cache' }).then(function (r) { return r.text(); }),
    fetch('/corpus/obligations.assertion.json', { cache: 'no-cache' }).then(function (r) { return r.json(); }),
    fetch('/.well-known/keys.json', { cache: 'no-cache' }).then(function (r) { return r.json(); })
  ]).then(function (p) {
    RAW = p[0];
    var cut = slice(RAW);
    START = cut.s; END = cut.e;
    ORIGINAL = RAW.slice(START, END);
    FIRST_LINE = RAW.slice(0, START).split('\n').length;
    PUB = hex(b64uToBytes(p[1].assertion.claims.digest.value));
    var total = RAW.split('\n').length - (RAW.endsWith('\n') ? 1 : 0);
    $('st-lines').textContent = 'lines ' + FIRST_LINE + '–' + (FIRST_LINE + ORIGINAL.split('\n').length - 1) + ' of ' + total;
    grid($('st-hex-pub'), PUB);
    $('st-pub-sub').textContent = 'From the signed assertion, issued ' + p[1].assertion.issued_at.slice(0, 10) + '.';
    src.value = ORIGINAL;
    src.disabled = false;
    $('st-mistake').disabled = false;
    return verifySignature(p[1], p[2]).then(function () { paintSig(); check(); });
  }).catch(function () {
    hl.textContent = 'The record could not be fetched just now, so there is nothing to check. Nothing is shown rather than something remembered.';
    $('st-vk').textContent = 'Nothing to check';
    $('st-vt').textContent = 'The record did not load.';
  });

  var pending = 0;
  src.addEventListener('input', function () { if (!pending) pending = requestAnimationFrame(function () { pending = 0; check(); }); });
  src.addEventListener('scroll', function () { hl.scrollTop = src.scrollTop; });

  $('st-mistake').addEventListener('click', function () {
    if (!/"applies_from":\s*"\d{4}-\d{2}-\d{2}"/.test(src.value)) src.value = ORIGINAL;
    src.value = src.value.replace(/("applies_from":\s*")\d{4}-\d{2}-\d{2}(")/, '$12027-02-02$2');
    check();
    var i = src.value.indexOf('2027-02-02');
    if (i >= 0) { src.focus({ preventScroll: true }); src.setSelectionRange(i, i + 10); }
  });
  $('st-restore').addEventListener('click', function () { src.value = ORIGINAL; check(); });
})();
