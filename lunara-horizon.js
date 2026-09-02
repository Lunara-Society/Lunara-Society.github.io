/* ═══════════════════════════════════════════════════════════════════
   THE REGULATORY HORIZON
   ═══════════════════════════════════════════════════════════════════

   The site had seven images and five of them were the logo. Five of
   the pages that sell carried no visual element of any kind. This is
   the first thing built to answer that, and it is deliberately not a
   photograph: an institution whose product is evidence should not
   decorate itself with stock imagery of servers and handshakes.

   So the picture is the data. Every obligation in the register laid
   across four years, drawn as markers standing on a plain, lit by one moon. What
   is already in force stands behind you in gold — settled, factual.
   What is coming stands ahead in moonlight, and the nearest one is
   lit brightest, because it is the one that should worry you.

   Every date, name and citation comes from /corpus/obligations.json —
   the same file the MCP server publishes. The "now" line is computed
   at render, so the drawing cannot go stale. Nothing here is
   illustrative: if the corpus changes, the horizon changes.
   ═══════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  var NS = 'http://www.w3.org/2000/svg';
  var host = document.getElementById('lx-horizon');
  if (!host) return;

  var W = 1200, H = 384;
  var GROUND = 300;              // the horizon line
  var PAD_L = 74, PAD_R = 74;

  var GOLD = '#C4A46B', GOLD_HI = '#E4C88A';
  var MOON = '#9FC3E8', MOON_HI = '#CFE4F8';

  function el(name, attrs) {
    var n = document.createElementNS(NS, name);
    for (var k in attrs) if (attrs[k] !== undefined && attrs[k] !== null) {
      n.setAttribute(k, attrs[k]);
    }
    return n;
  }
  function text(str, attrs) {
    var t = el('text', attrs);
    t.textContent = str;
    return t;
  }
  var day = 86400000;
  function todayUTC() {
    var n = new Date();
    return Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate());
  }
  function iso(d) { return Date.parse(d + 'T00:00:00Z'); }

  fetch('/corpus/obligations.json', { cache: 'no-cache' })
    .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(function (data) { draw(data.obligations || []); })
    .catch(function (err) {
      // The register is the only source. Without it there is nothing
      // honest to draw, so nothing is drawn.
      host.innerHTML = '<p class="lx-horizon-fail">The register could not be read, so this ' +
        'drawing has nothing behind it and is not shown. It is published at ' +
        '<a href="/corpus/obligations.json">/corpus/obligations.json</a>.</p>';
      console.warn('horizon: ' + err.message);
    });

  function draw(obs) {
    if (!obs.length) return;
    obs = obs.slice().sort(function (a, b) { return iso(a.applies_from) - iso(b.applies_from); });

    var now = todayUTC();

    /* The section heading used to read "Four are behind you. Five are
       ahead." — two counts typed into a page, which is the one thing no
       page here is allowed to do. Adding one obligation to the register
       made it wrong, silently, above a drawing that was right. */
    (function () {
      var words = ['None', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven',
                   'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve'];
      var behind = 0;
      for (var i = 0; i < obs.length; i++) if (iso(obs[i].applies_from) <= now) behind++;
      var ahead = obs.length - behind;
      var say = function (n) { return words[n] || String(n); };
      var setAll = function (sel, v) {
        var nodes = document.querySelectorAll(sel);
        for (var j = 0; j < nodes.length; j++) nodes[j].textContent = v;
      };
      setAll('[data-lx-hz="behind"]', say(behind) + (behind === 1 ? ' is' : ' are'));
      setAll('[data-lx-hz="ahead"]', say(ahead) + (ahead === 1 ? ' is' : ' are'));
    })();
    var first = iso(obs[0].applies_from);
    var last = iso(obs[obs.length - 1].applies_from);
    // A season of air either side so nothing stands on the frame edge.
    var span = last - first;
    var t0 = first - span * 0.07, t1 = last + span * 0.07;
    var x = function (t) { return PAD_L + (t - t0) / (t1 - t0) * (W - PAD_L - PAD_R); };

    var svg = el('svg', {
      viewBox: '0 0 ' + W + ' ' + H,
      class: 'lx-horizon-svg',
      role: 'img',
      'aria-label': 'The regulatory horizon: ' + obs.length +
        ' obligations between ' + obs[0].applies_from + ' and ' + obs[obs.length - 1].applies_from
    });

    /* ── the sky and the moon ─────────────────────────────────── */
    var defs = el('defs');
    defs.innerHTML =
      '<radialGradient id="lxMoonGlow" cx="0.5" cy="0.5" r="0.5">' +
        '<stop offset="0" stop-color="#9FC3E8" stop-opacity="0.30"/>' +
        '<stop offset="0.45" stop-color="#5E7C9E" stop-opacity="0.10"/>' +
        '<stop offset="1" stop-color="#5E7C9E" stop-opacity="0"/>' +
      '</radialGradient>' +
      '<linearGradient id="lxGround" x1="0" y1="0" x2="0" y2="1">' +
        '<stop offset="0" stop-color="#9FC3E8" stop-opacity="0.20"/>' +
        '<stop offset="1" stop-color="#9FC3E8" stop-opacity="0"/>' +
      '</linearGradient>' +
      '<linearGradient id="lxPast" gradientUnits="userSpaceOnUse" ' +
        'x1="0" y1="' + GROUND + '" x2="0" y2="' + (GROUND - 210) + '">' +
        '<stop offset="0" stop-color="' + GOLD + '" stop-opacity="0.80"/>' +
        '<stop offset="1" stop-color="' + GOLD + '" stop-opacity="0.10"/>' +
      '</linearGradient>' +
      '<linearGradient id="lxAhead" gradientUnits="userSpaceOnUse" ' +
        'x1="0" y1="' + GROUND + '" x2="0" y2="' + (GROUND - 210) + '">' +
        '<stop offset="0" stop-color="' + MOON + '" stop-opacity="0.88"/>' +
        '<stop offset="1" stop-color="' + MOON + '" stop-opacity="0.08"/>' +
      '</linearGradient>' +
      '<filter id="lxSoft" x="-60%" y="-60%" width="220%" height="220%">' +
        '<feGaussianBlur stdDeviation="7"/>' +
      '</filter>';
    svg.appendChild(defs);

    svg.appendChild(el('circle', { cx: W - 52, cy: 234, r: 132, fill: 'url(#lxMoonGlow)' }));
    svg.appendChild(el('circle', { cx: W - 52, cy: 234, r: 12, fill: '#DCE9F7', opacity: '0.88' }));
    svg.appendChild(el('circle', { cx: W - 52, cy: 234, r: 12, fill: 'none',
      stroke: '#FFFFFF', 'stroke-opacity': '0.5', 'stroke-width': '0.6' }));

    /* ── the plain ────────────────────────────────────────────── */
    svg.appendChild(el('rect', { x: 0, y: GROUND, width: W, height: 46, fill: 'url(#lxGround)' }));
    svg.appendChild(el('line', { x1: PAD_L - 30, y1: GROUND, x2: W - PAD_R + 30, y2: GROUND,
      stroke: MOON, 'stroke-opacity': '0.34', 'stroke-width': '1' }));

    // Year ticks, so the distances mean something.
    var y0 = new Date(t0).getUTCFullYear(), y1 = new Date(t1).getUTCFullYear();
    for (var yr = y0; yr <= y1; yr++) {
      var ty = Date.UTC(yr, 0, 1);
      if (ty < t0 || ty > t1) continue;
      svg.appendChild(el('line', { x1: x(ty), y1: GROUND, x2: x(ty), y2: GROUND + 9,
        stroke: MOON, 'stroke-opacity': '0.3', 'stroke-width': '1' }));
      svg.appendChild(text(yr, { x: x(ty), y: GROUND + 27, class: 'lx-h-year',
        'text-anchor': 'middle' }));
    }

    /* ── now ──────────────────────────────────────────────────── */
    var nx = x(now);
    svg.appendChild(el('line', { x1: nx, y1: 188, x2: nx, y2: GROUND,
      stroke: MOON_HI, 'stroke-opacity': '0.45', 'stroke-width': '6', filter: 'url(#lxSoft)' }));
    svg.appendChild(el('line', { x1: nx, y1: 188, x2: nx, y2: GROUND,
      stroke: MOON_HI, 'stroke-opacity': '0.8', 'stroke-width': '1' }));
    svg.appendChild(text('TODAY', { x: nx + 9, y: 198, class: 'lx-h-now', 'text-anchor': 'start' }));

    /* ── the markers ──────────────────────────────────────────── */
    var nearest = null, nearestDays = Infinity;
    obs.forEach(function (o) {
      var d = Math.round((iso(o.applies_from) - now) / day);
      if (d > 0 && d < nearestDays) { nearestDays = d; nearest = o; }
    });

    /* Labels live in fixed lanes above the markers and reach down to
       them with a leader. The first attempt alternated between two
       heights, which still printed "Article 50 transparency" straight
       through "Marking, existing systems" — several of these dates are
       days apart on a four-year axis. Lanes are assigned greedily by
       how much room the previous label in that lane took. */
    var LANES = [46, 84, 122, 160];
    var laneEnd = [-1e9, -1e9, -1e9, -1e9];

    obs.forEach(function (o) {
      var t = iso(o.applies_from);
      var px = x(t);
      var days = Math.round((t - now) / day);
      var inForce = days <= 0;
      var isNearest = nearest && o.id === nearest.id;
      var sig = o.significance || 2;
      var top = GROUND - (sig >= 3 ? 128 : 86);

      var g = el('g', { class: 'lx-h-mark' + (isNearest ? ' is-next' : '') });

      if (isNearest) {
        g.appendChild(el('line', { x1: px, y1: GROUND, x2: px, y2: top,
          stroke: MOON_HI, 'stroke-opacity': '0.5', 'stroke-width': '7',
          filter: 'url(#lxSoft)' }));
      }
      g.appendChild(el('line', {
        x1: px, y1: GROUND, x2: px, y2: top,
        stroke: inForce ? 'url(#lxPast)' : 'url(#lxAhead)',
        'stroke-width': isNearest ? 2.6 : (sig >= 3 ? 1.7 : 1.2)
      }));
      g.appendChild(el('ellipse', { cx: px, cy: GROUND, rx: isNearest ? 15 : 9, ry: 2.6,
        fill: inForce ? GOLD : MOON, 'fill-opacity': isNearest ? 0.55 : 0.28 }));
      g.appendChild(el('circle', {
        cx: px, cy: top, r: isNearest ? 5 : (sig >= 3 ? 3.4 : 2.5),
        fill: inForce ? GOLD_HI : (isNearest ? '#FFFFFF' : MOON_HI)
      }));

      var name = shortName(o.name);
      var w = name.length * 7.6 + 26;
      var left = px - w / 2;
      var MIN_L = PAD_L - 44, MAX_R = W - PAD_R + 44;

      /* Five of these dates fall inside six months of a four-year axis, so
         a label sitting directly over its own marker cannot always fit.
         Take the first lane with room; if none has room, take the lane with
         the most, and slide the label sideways until it clears. The leader
         then runs at an angle instead of straight down, which is what says
         "this label belongs to that marker" once they are no longer in a
         column. Labels that only stack — the earlier behaviour — say
         nothing at all, and printed through each other. */
      var lane = -1;
      for (var li = 0; li < LANES.length; li++) {
        if (left >= laneEnd[li] + 14) { lane = li; break; }
      }
      if (lane < 0) {
        lane = 0;
        for (var lj = 1; lj < LANES.length; lj++) if (laneEnd[lj] < laneEnd[lane]) lane = lj;
        left = Math.max(left, laneEnd[lane] + 14);
      }
      if (left + w > MAX_R) left = MAX_R - w;
      if (left < MIN_L) left = MIN_L;
      laneEnd[lane] = Math.max(laneEnd[lane], left + w);
      var ly = LANES[lane];
      var lx = left + w / 2;

      // Leader from the label to the marker's head, angled when they differ.
      g.appendChild(el('line', { x1: lx, y1: ly + 8, x2: px, y2: top - 6,
        stroke: inForce ? GOLD : MOON, 'stroke-opacity': '0.22', 'stroke-width': '0.8' }));

      g.appendChild(text(name, { x: lx, y: ly, 'text-anchor': 'middle',
        class: 'lx-h-title' + (isNearest ? ' is-next' : '') + (inForce ? ' past' : '') }));
      g.appendChild(text(
        inForce ? 'in force · ' + o.applies_from
                : days + (days === 1 ? ' day' : ' days') + ' · ' + o.applies_from,
        { x: lx, y: ly + 15, 'text-anchor': 'middle',
          class: 'lx-h-when' + (inForce ? ' past' : '') + (isNearest ? ' is-next' : '') }));

      var title = el('title');
      title.textContent = o.name + '. ' + o.instrument + ', ' + o.article;
      g.appendChild(title);
      svg.appendChild(g);
    });

    host.innerHTML = '';
    host.appendChild(svg);

    var cap = document.getElementById('lx-horizon-caption');
    if (cap && nearest) {
      cap.innerHTML = '<strong>' + nearestDays + ' days</strong> to the next one — ' +
        esc(nearest.name) + ', ' + esc(nearest.applies_from) + '. ' +
        'Drawn from <a href="/corpus/obligations.json">the published register</a>, ' +
        'computed against your clock.';
    }
  }

  function esc(s) { var d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

  // The register's names are written for citation, not for a chart.
  function shortName(n) {
    return n
      .replace('Article 50(2) marking for systems already on the market', 'Marking, existing systems')
      .replace('Article 50 transparency obligations', 'Article 50 transparency')
      .replace('General-purpose AI obligations and penalties', 'General-purpose AI')
      .replace('Prohibited AI practices and AI literacy', 'Prohibited practices')
      .replace('Hosting platforms and large online platforms', 'Hosting platforms')
      .replace('High-risk obligations, Annex III', 'High-risk · Annex III')
      .replace('High-risk obligations, Annex I products', 'High-risk · Annex I')
      .replace('Legacy general-purpose models', 'Legacy GPAI models')
      .replace('Prohibition on non-consensual intimate and child sexual abuse material', 'Prohibition · synthetic NCII and CSAM')
      .replace('AI Transparency Act', 'California SB 942');
  }
})();
