/* ═══════════════════════════════════════════════════════════════════
   LUNARA MARK — an invisible ownership mark for images
   ═══════════════════════════════════════════════════════════════════

   What it carries: an 8-character mark id (40 bits) and a 16-bit
   checksum, 56 bits in all. The id points at a public record in the
   Lunara register: who registered the image, when, and the SHA-256
   fingerprint of the original. The mark proves nothing by itself; the
   record does, and anyone can look it up.

   How it hides: the image is cut into 8×8 blocks, as JPEG does. In
   each block two low-frequency cosine coefficients, (1,2) and (2,1),
   are nudged so that one is larger than the other by a margin. Which
   one is larger is one bit. Every block carries one of the 56 bits,
   laid out on an 8×7 grid that repeats across the whole picture, so
   each bit is written hundreds of times and read back by vote.

   Only brightness changes, by a few levels, spread smoothly across the
   block, so colours stay put and the eye does not find it. Flat areas
   get a gentler push than textured ones, because flat sky is where
   any pattern would show.

   What it survives, measured by the test suite: re-saving as JPEG down
   to quality 60, and cropping. What it does not survive: resizing,
   rotation, heavy filters, or a screenshot at a different scale. That
   is stated in the app, because a mark sold as indestructible would be
   exactly the kind of claim this institution exists to check.
   ═══════════════════════════════════════════════════════════════════ */
(function (root) {
  'use strict';

  var ALPHA = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  var GX = 8, GY = 7, NBITS = GX * GY; // 56 = 40 id + 16 crc

  // The two basis functions, computed once.
  var B12 = new Float64Array(64), B21 = new Float64Array(64);
  (function () {
    for (var y = 0; y < 8; y++) for (var x = 0; x < 8; x++) {
      // orthonormal 8×8 DCT-II basis, u horizontal, v vertical
      var cx1 = Math.cos((2 * x + 1) * 1 * Math.PI / 16), cx2 = Math.cos((2 * x + 1) * 2 * Math.PI / 16);
      var cy1 = Math.cos((2 * y + 1) * 1 * Math.PI / 16), cy2 = Math.cos((2 * y + 1) * 2 * Math.PI / 16);
      B12[y * 8 + x] = 0.25 * cx1 * cy2;
      B21[y * 8 + x] = 0.25 * cx2 * cy1;
    }
  })();

  function crc16(bits) { // CRC-16/CCITT over a bit array
    var c = 0xFFFF;
    for (var i = 0; i < bits.length; i++) {
      var top = ((c >> 15) & 1) ^ bits[i];
      c = (c << 1) & 0xFFFF;
      if (top) c ^= 0x1021;
    }
    return c;
  }

  function idToBits(id) {
    id = String(id).toUpperCase();
    if (!/^[0-9A-HJKMNP-TV-Z]{8}$/.test(id)) throw new Error('Mark id must be 8 Crockford characters');
    var bits = [];
    for (var i = 0; i < 8; i++) {
      var v = ALPHA.indexOf(id[i]);
      for (var b = 4; b >= 0; b--) bits.push((v >> b) & 1);
    }
    var c = crc16(bits);
    for (var k = 15; k >= 0; k--) bits.push((c >> k) & 1);
    return bits;
  }

  function bitsToId(bits) {
    var payload = bits.slice(0, 40), c = 0;
    for (var k = 0; k < 16; k++) c = (c << 1) | bits[40 + k];
    if (crc16(payload) !== c) return null;
    var s = '';
    for (var i = 0; i < 8; i++) {
      var v = 0;
      for (var b = 0; b < 5; b++) v = (v << 1) | payload[i * 5 + b];
      s += ALPHA[v];
    }
    return s;
  }

  function luma(d, i) { return 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]; }

  /* Embed in place. img: { data: Uint8ClampedArray RGBA, width, height }. */
  function embed(img, id, opts) {
    opts = opts || {};
    var bits = idToBits(id);
    var W = img.width, H = img.height, d = img.data;
    var bw = Math.floor(W / 8), bh = Math.floor(H / 8);
    var base = opts.strength || 20;
    var Y = new Float64Array(64), delta = new Float64Array(64);
    var touched = 0;
    for (var by = 0; by < bh; by++) for (var bx = 0; bx < bw; bx++) {
      var c12 = 0, c21 = 0, mean = 0, sq = 0;
      for (var y = 0; y < 8; y++) for (var x = 0; x < 8; x++) {
        var i = ((by * 8 + y) * W + bx * 8 + x) * 4;
        var v = luma(d, i); Y[y * 8 + x] = v;
        c12 += v * B12[y * 8 + x]; c21 += v * B21[y * 8 + x];
        mean += v; sq += v * v;
      }
      mean /= 64;
      var sd = Math.sqrt(Math.max(0, sq / 64 - mean * mean));
      // Gentler in flat blocks, where a pattern would be visible.
      var S = Math.min(base * 1.25, Math.max(base * 0.55, base * (0.55 + sd / 30)));
      // Near black or white the push would clip; keep it light there.
      if (mean < 18 || mean > 237) S *= 0.6;
      var bit = bits[(bx % GX) + GX * (by % GY)];
      var dd = c12 - c21, target = bit ? S : -S;
      if ((bit && dd >= S) || (!bit && dd <= -S)) continue;
      // A block fighting hard the other way is left partly unconvinced;
      // the vote across hundreds of blocks settles it, invisibly.
      var half = Math.max(-1.5 * S, Math.min(1.5 * S, (target - dd) / 2));
      for (var k = 0; k < 64; k++) delta[k] = half * (B12[k] - B21[k]);
      for (y = 0; y < 8; y++) for (x = 0; x < 8; x++) {
        i = ((by * 8 + y) * W + bx * 8 + x) * 4;
        var dv = delta[y * 8 + x];
        d[i] = d[i] + dv; d[i + 1] = d[i + 1] + dv; d[i + 2] = d[i + 2] + dv; // clamped arrays clip
      }
      touched++;
    }
    return { blocks: bw * bh, touched: touched };
  }

  /* Soft votes per grid cell, for one pixel offset. */
  function votes(img, ox, oy) {
    var W = img.width, H = img.height, d = img.data;
    var bw = Math.floor((W - ox) / 8), bh = Math.floor((H - oy) / 8);
    var sum = new Float64Array(NBITS), n = new Float64Array(NBITS);
    for (var by = 0; by < bh; by++) for (var bx = 0; bx < bw; bx++) {
      var c12 = 0, c21 = 0;
      for (var y = 0; y < 8; y++) {
        var row = ((oy + by * 8 + y) * W + ox + bx * 8) * 4;
        for (var x = 0; x < 8; x++) {
          var v = luma(d, row + x * 4);
          c12 += v * B12[y * 8 + x]; c21 += v * B21[y * 8 + x];
        }
      }
      var cell = (bx % GX) + GX * (by % GY);
      var dd = c12 - c21;
      sum[cell] += Math.max(-40, Math.min(40, dd)); n[cell]++;
    }
    return { sum: sum, n: n, blocks: bw * bh };
  }

  /* Every grid shift whose 56 bits pass the checksum, with how firmly
     the blocks voted for them. */
  function candidates(v, offset, out) {
    for (var sy = 0; sy < GY; sy++) for (var sx = 0; sx < GX; sx++) {
      var bits = new Array(NBITS), margin = 0;
      for (var k = 0; k < NBITS; k++) {
        var cell = ((k % GX) + sx) % GX + GX * ((Math.floor(k / GX) + sy) % GY);
        bits[k] = v.sum[cell] > 0 ? 1 : 0;
        margin += Math.abs(v.sum[cell]) / Math.max(1, v.n[cell]);
      }
      var id = bitsToId(bits);
      if (id) out.push({ id: id, strength: margin / NBITS, offset: offset });
    }
    return out;
  }

  /* A 16-bit checksum passes by chance once in 65,536 tries, and a
     full search makes 3,584 of them, so a lone pass is not proof. The
     true mark wins by a wide margin: every block agrees with it. So the
     strongest candidate must clear a floor and beat any rival clearly,
     and the app still confirms the id exists in the register before it
     names an owner. */
  function pick(list) {
    if (!list.length) return { found: false };
    list.sort(function (a, b) { return b.strength - a.strength; });
    var best = list[0], rival = null;
    for (var i = 1; i < list.length; i++) if (list[i].id !== best.id) { rival = list[i]; break; }
    if (best.strength < 1.5) return { found: false };
    if (rival && best.strength < rival.strength * 1.4) return { found: false, ambiguous: true };
    return { found: true, id: best.id, strength: best.strength, offset: best.offset };
  }

  /* Read. The aligned grid first (an untouched or re-saved image);
     then, if nothing clear, every pixel offset (a cropped image). */
  function detect(img, opts) {
    opts = opts || {};
    if (img.width < 64 || img.height < 56) return { found: false, reason: 'too_small' };
    var first = pick(candidates(votes(img, 0, 0), [0, 0], []));
    if (first.found && first.strength > 2.5) return first;
    if (opts.quick) return first;
    var all = [];
    for (var oy = 0; oy < 8; oy++) for (var ox = 0; ox < 8; ox++) candidates(votes(img, ox, oy), [ox, oy], all);
    return pick(all);
  }

  /* An XMP packet naming the mark, for JPEG files: the readable copy
     of the same fact, for software that looks at metadata. */
  function xmpSegment(id, owner) {
    var esc = function (s) { return String(s).replace(/[<>&"]/g, function (c) { return { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]; }); };
    var xml = '<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">' +
      '<rdf:Description rdf:about="" xmlns:lunara="https://lunarasociety.com/ns/mark/1.0/" xmlns:dc="http://purl.org/dc/elements/1.1/"' +
      ' lunara:mark="' + esc(id) + '" lunara:verify="https://lunarasociety.com/lens/verify.html#' + esc(id) + '">' +
      '<dc:rights><rdf:Alt><rdf:li xml:lang="x-default">' + esc(owner) + ' — registered with Lunara Society, mark ' + esc(id) + '</rdf:li></rdf:Alt></dc:rights>' +
      '</rdf:Description></rdf:RDF></x:xmpmeta>';
    var head = 'http://ns.adobe.com/xap/1.0/\0';
    var payload = new TextEncoder().encode(head + xml);
    var len = payload.length + 2;
    var seg = new Uint8Array(payload.length + 4);
    seg[0] = 0xFF; seg[1] = 0xE1; seg[2] = (len >> 8) & 255; seg[3] = len & 255;
    seg.set(payload, 4);
    return seg;
  }

  /* Insert the XMP segment right after SOI (and any APP0) of a JPEG. */
  function withXmp(jpegBytes, id, owner) {
    var b = jpegBytes;
    if (b[0] !== 0xFF || b[1] !== 0xD8) return b;
    var at = 2;
    if (b[2] === 0xFF && b[3] === 0xE0) at = 4 + ((b[4] << 8) | b[5]);
    var seg = xmpSegment(id, owner);
    var out = new Uint8Array(b.length + seg.length);
    out.set(b.subarray(0, at), 0); out.set(seg, at); out.set(b.subarray(at), at + seg.length);
    return out;
  }

  var api = { embed: embed, detect: detect, withXmp: withXmp, idToBits: idToBits, bitsToId: bitsToId, ALPHA: ALPHA };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.LensMark = api;
})(typeof self !== 'undefined' ? self : this);
