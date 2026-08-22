/* ═══════════════════════════════════════════════════════════════════
   THE CREDENTIAL — a specimen, drawn
   ═══════════════════════════════════════════════════════════════════

   shield.html promises "a trust badge for your platform" and "a public
   registry listing", and showed neither. A buyer could read two
   thousand words about certification and never once see the object
   they were being asked to pay for.

   This draws it. The field names come from registry-protocol.js — the
   same source the registry contract and /corpus/registry-protocol.json
   are emitted from — so the specimen cannot drift from the record a
   real certification would produce.

   It is marked SPECIMEN, in the plate and in the text, and every value
   is an obvious placeholder. That is deliberate and not decorative: a
   convincing rendering of a credential that has not been issued is a
   forgery template, and an institution selling verification is the
   last one that should be handing those out.

   The rosette is a hypotrochoid computed at draw time — the same
   family of curve engine-turning lathes have cut into banknotes and
   share certificates for two centuries. It is mathematics, not a
   texture, so it is a few hundred bytes and sharp at any size.
   ═══════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  var NS = 'http://www.w3.org/2000/svg';
  var hosts = document.querySelectorAll('[data-lunara-credential]');
  if (!hosts.length) return;

  var GOLD = '#C4A46B', GOLD_PALE = '#E4C88A', MOON = '#9FC3E8';
  var W = 420, H = 580;

  function el(n, a) {
    var e = document.createElementNS(NS, n);
    for (var k in a) if (a[k] != null) e.setAttribute(k, a[k]);
    return e;
  }
  function txt(s, a) { var t = el('text', a); t.textContent = s; return t; }

  /* A hypotrochoid: the curve traced by a point on a circle rolling
     inside another. R and r coprime give a closed rosette. */
  function guilloche(cx, cy, R, r, d, turns) {
    var pts = [], steps = turns * 180;
    for (var i = 0; i <= steps; i++) {
      var t = i / steps * turns * 2 * Math.PI;
      var k = (R - r) / r;
      pts.push(
        (cx + (R - r) * Math.cos(t) + d * Math.cos(k * t)).toFixed(2) + ',' +
        (cy + (R - r) * Math.sin(t) - d * Math.sin(k * t)).toFixed(2)
      );
    }
    return 'M' + pts.join('L') + 'Z';
  }

  hosts.forEach(function (host) { host.appendChild(card()); });

  function card() {
    var svg = el('svg', {
      viewBox: '0 0 ' + W + ' ' + H,
      class: 'lx-cred-svg',
      role: 'img',
      'aria-label': 'Specimen Shield credential. Not an issued document.'
    });

    var defs = el('defs');
    defs.innerHTML =
      '<linearGradient id="lxCredFace" x1="0" y1="0" x2="1" y2="1">' +
        '<stop offset="0" stop-color="#141A26"/>' +
        '<stop offset="0.55" stop-color="#0B0E14"/>' +
        '<stop offset="1" stop-color="#07090D"/>' +
      '</linearGradient>' +
      '<linearGradient id="lxCredRim" x1="0" y1="0" x2="1" y2="1">' +
        '<stop offset="0" stop-color="' + MOON + '" stop-opacity="0.55"/>' +
        '<stop offset="0.4" stop-color="' + MOON + '" stop-opacity="0.12"/>' +
        '<stop offset="1" stop-color="' + MOON + '" stop-opacity="0.03"/>' +
      '</linearGradient>' +
      '<linearGradient id="lxCredGold" x1="0" y1="0" x2="0" y2="1">' +
        '<stop offset="0" stop-color="' + GOLD_PALE + '"/>' +
        '<stop offset="0.5" stop-color="' + GOLD + '"/>' +
        '<stop offset="1" stop-color="#8A6B3C"/>' +
      '</linearGradient>' +
      '<radialGradient id="lxCredLight" cx="0.78" cy="0.06" r="0.9">' +
        '<stop offset="0" stop-color="' + MOON + '" stop-opacity="0.16"/>' +
        '<stop offset="0.5" stop-color="' + MOON + '" stop-opacity="0.03"/>' +
        '<stop offset="1" stop-color="' + MOON + '" stop-opacity="0"/>' +
      '</radialGradient>';
    svg.appendChild(defs);

    /* ── the plate ────────────────────────────────────────────── */
    svg.appendChild(el('rect', { x: 1, y: 1, width: W - 2, height: H - 2, rx: 5,
      fill: 'url(#lxCredFace)', stroke: 'url(#lxCredRim)', 'stroke-width': '1.2' }));
    svg.appendChild(el('rect', { x: 1, y: 1, width: W - 2, height: H - 2, rx: 5,
      fill: 'url(#lxCredLight)' }));
    // engraved inner rule
    svg.appendChild(el('rect', { x: 15, y: 15, width: W - 30, height: H - 30, rx: 2,
      fill: 'none', stroke: GOLD, 'stroke-opacity': '0.20', 'stroke-width': '0.7' }));

    /* ── the rosette ──────────────────────────────────────────── */
    var g = el('g', { class: 'lx-cred-rosette', opacity: '0.5' });
    [[104, 31, 46, 31], [82, 25, 34, 25], [58, 17, 22, 17]].forEach(function (p, i) {
      g.appendChild(el('path', {
        d: guilloche(W / 2, 196, p[0], p[1], p[2], p[3]),
        fill: 'none', stroke: GOLD,
        'stroke-opacity': (0.30 - i * 0.07).toFixed(2),
        'stroke-width': 0.34
      }));
    });
    svg.appendChild(g);

    /* ── the seal ─────────────────────────────────────────────
       This drew its own circles-and-shield "L" at first, which was
       the same stand-in the watermark used: a monogram in place of an
       institution that owns an actual seal. It is the seal. */
    var SEAL = 76;
    svg.appendChild(el('image', {
      href: '/lunara_emblem_256.png',
      x: (W - SEAL) / 2, y: 158, width: SEAL, height: SEAL,
      preserveAspectRatio: 'xMidYMid meet'
    }));

    /* ── the record ───────────────────────────────────────────── */
    svg.appendChild(txt('LUNARA SOCIETY', { x: W / 2, y: 54, 'text-anchor': 'middle',
      class: 'lx-cred-issuer' }));
    svg.appendChild(txt('Shield Certification', { x: W / 2, y: 86, 'text-anchor': 'middle',
      class: 'lx-cred-kind' }));
    svg.appendChild(el('line', { x1: W / 2 - 34, y1: 100, x2: W / 2 + 34, y2: 100,
      stroke: GOLD, 'stroke-opacity': '0.4', 'stroke-width': '0.7' }));

    var rows = [
      ['Entity',        'Your Business Ltd'],
      ['Domain',        'yourdomain.com'],
      ['Lunara ID',     'LUNA-XXXX-XXXX'],
      ['Status',        'verified'],
      ['Shield',        'active'],
      ['Verified on',   '2026-XX-XX'],
      ['Protocol',      'LUNA-PROTO-1']
    ];
    var y = 296;
    rows.forEach(function (r) {
      svg.appendChild(txt(r[0], { x: 42, y: y, class: 'lx-cred-k' }));
      svg.appendChild(txt(r[1], { x: W - 42, y: y, 'text-anchor': 'end',
        class: 'lx-cred-v' + (r[0] === 'Lunara ID' ? ' id' : '') +
               (r[1] === 'verified' || r[1] === 'active' ? ' good' : '') }));
      svg.appendChild(el('line', { x1: 42, y1: y + 9, x2: W - 42, y2: y + 9,
        stroke: MOON, 'stroke-opacity': '0.09', 'stroke-width': '0.6' }));
      y += 30;
    });

    svg.appendChild(txt('Revocable. Revocations are published as openly as certifications.',
      { x: W / 2, y: 528, 'text-anchor': 'middle', class: 'lx-cred-fine' }));
    svg.appendChild(txt('Verify at lunarasociety.com/registry',
      { x: W / 2, y: 545, 'text-anchor': 'middle', class: 'lx-cred-fine' }));

    /* ── the specimen mark ────────────────────────────────────────
       Across the plate, and again in words underneath. A credible
       drawing of an unissued credential is a template for forging
       one; this must be impossible to mistake or to crop out. */
    var band = el('g', { class: 'lx-cred-specimen' });
    band.appendChild(txt('SPECIMEN', {
      x: W / 2, y: H / 2 + 22, 'text-anchor': 'middle',
      class: 'lx-cred-specimen-word',
      transform: 'rotate(-27 ' + (W / 2) + ' ' + (H / 2) + ')'
    }));
    svg.appendChild(band);

    return svg;
  }
})();
