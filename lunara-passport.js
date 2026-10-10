/* ═══════════════════════════════════════════════════════════════════
   PASSPORT CONTROL — passport.html
   ═══════════════════════════════════════════════════════════════════

   Nothing is scored on this page. The scan runs on lunara-registry
   (registry-backend/passport.mjs) and this file only draws its answer:
   the passport opens, a laser reads it, the checks land one by one and
   the register's stamp comes down last. ?d=example.com runs a scan on
   arrival, so a passport can be shared as a link.
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var API = 'https://luiqtimzcsoqnizybifs.supabase.co/functions/v1/lunara-registry/passportScan';
  var $ = function (id) { return document.getElementById(id); };
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var GROUPS = { transport: 'The connection', dns: 'The name', ai: 'Speaks to machines' };
  var busy = false;

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function norm(raw) {
    var s = String(raw || '').trim().toLowerCase();
    try { if (/^[a-z]+:\/\//.test(s)) s = new URL(s).hostname; } catch (e) { return ''; }
    s = s.replace(/^www\./, '').split(/[\/?#:\s]/)[0].replace(/\.$/, '');
    return /^([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(s) ? s : '';
  }
  function hash(s) { // FNV-1a, enough for a drawing and a serial
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function rng(seed) { return function () { seed = Math.imul(seed ^ (seed >>> 15), 2246822507) ^ Math.imul(seed ^ (seed >>> 13), 3266489909); return ((seed ^= seed >>> 16) >>> 0) / 4294967296; }; }

  /* The holder's portrait: a moon in its own phase over its own rings,
     drawn from the domain so the same domain always gets the same face. */
  function portrait(domain) {
    var r = rng(hash(domain)), hue = Math.floor(r() * 360), phase = r() * 2 - 1, out = [];
    out.push('<svg viewBox="0 0 150 186" xmlns="http://www.w3.org/2000/svg"><defs><radialGradient id="pg" cx="50%" cy="38%" r="70%"><stop offset="0" stop-color="hsl(' + hue + ',45%,22%)"/><stop offset="1" stop-color="#080a0e"/></radialGradient></defs><rect width="150" height="186" fill="url(#pg)"/>');
    for (var i = 0; i < 7; i++) out.push('<circle cx="75" cy="78" r="' + (26 + i * 9 + r() * 4).toFixed(1) + '" fill="none" stroke="hsla(' + ((hue + i * 18) % 360) + ',60%,70%,' + (0.28 - i * 0.03).toFixed(2) + ')" stroke-width="' + (0.6 + r()).toFixed(2) + '" stroke-dasharray="' + Math.floor(2 + r() * 10) + ' ' + Math.floor(2 + r() * 8) + '"/>');
    out.push('<circle cx="75" cy="78" r="24" fill="#E9E1CF"/><circle cx="' + (75 + phase * 30).toFixed(1) + '" cy="78" r="24" fill="#0c0f15" opacity=".92"/>');
    for (var j = 0; j < 18; j++) out.push('<circle cx="' + (r() * 150).toFixed(1) + '" cy="' + (r() * 186).toFixed(1) + '" r="' + (r() * 1.1 + .2).toFixed(2) + '" fill="#fff" opacity="' + (r() * .6 + .1).toFixed(2) + '"/>');
    out.push('<text x="75" y="168" text-anchor="middle" font-family="IBM Plex Mono,monospace" font-size="9" letter-spacing="2" fill="rgba(226,196,122,.75)">' + esc(domain.toUpperCase().slice(0, 20)) + '</text></svg>');
    return out.join('');
  }
  function serial(domain) { var h = hash(domain + '#lunara').toString(36).toUpperCase(); return 'LP-' + ('000000' + h).slice(-7); }
  function mrz(domain, data) {
    var name = domain.toUpperCase().replace(/[^A-Z0-9]/g, '<');
    var l1 = ('P<LUNARA' + name + '<<' + (data ? data.visa.toUpperCase().replace(/_/g, '<') : '') + '<'.repeat(44)).slice(0, 44);
    var d = (data ? data.scanned_at : new Date().toISOString()).slice(2, 10).replace(/-/g, '');
    var l2 = (serial(domain).replace('-', '') + '<' + d + '<' + (data ? ('000' + data.score).slice(-3) + data.grade.replace('+', 'P') : '') + '<'.repeat(44)).slice(0, 44);
    return l1 + '\n' + l2;
  }

  function stampSvg(visa) {
    var t = { verified: ['VERIFIED', 'NAMED REVIEW'], revoked: ['REVOKED', 'CREDENTIAL WITHDRAWN'], expired: ['EXPIRED', 'TERM ENDED'], not_registered: ['NOT REGISTERED', 'NO NAMED REVIEW'] }[visa] || ['UNKNOWN', ''];
    var big = t[0].length > 9 ? 19 : 30;
    return '<svg viewBox="0 0 240 240" fill="none" stroke="currentColor"><defs><path id="sc" d="M120 120m-92 0a92 92 0 1 1 184 0a92 92 0 1 1-184 0"/></defs>'
      + '<circle cx="120" cy="120" r="108" stroke-width="5"/><circle cx="120" cy="120" r="78" stroke-width="2"/>'
      + '<text font-family="IBM Plex Mono,monospace" font-size="13" letter-spacing="4" fill="currentColor" stroke="none"><textPath href="#sc">LUNARA SOCIETY · PASSPORT CONTROL · ' + new Date().getFullYear() + ' ·</textPath></text>'
      + '<rect x="18" y="100" width="204" height="44" fill="#0d1016" stroke-width="3"/>'
      + '<text x="120" y="' + (big === 30 ? 132 : 128) + '" text-anchor="middle" font-family="Inter,sans-serif" font-weight="700" font-size="' + big + '" letter-spacing="2" fill="currentColor" stroke="none">' + t[0] + '</text>'
      + '<text x="120" y="172" text-anchor="middle" font-family="IBM Plex Mono,monospace" font-size="11" letter-spacing="3" fill="currentColor" stroke="none">' + t[1] + '</text></svg>';
  }

  var LINES = ['Resolving DNS…', 'Asking for DNSSEC signatures…', 'Reading SPF and DMARC…', 'Opening HTTPS…', 'Reading security headers…', 'Looking for llms.txt…', 'Reading robots.txt for AI crawlers…', 'Looking for security.txt…', 'Asking the register…'];

  function reset(domain) {
    $('pp-wrap').classList.add('on');
    $('pp-after').classList.remove('on');
    var book = $('pp-book');
    book.style.animation = 'none'; void book.offsetWidth; book.style.animation = '';
    book.classList.add('scanning');
    $('pp-photo').innerHTML = portrait(domain);
    $('pp-name').textContent = domain;
    $('pp-no').textContent = serial(domain);
    $('pp-when').textContent = new Date().toUTCString().replace(' GMT', ' UTC');
    $('pp-proof').textContent = '…';
    $('pp-visa').textContent = 'Reading the register…';
    $('pp-mrz').textContent = mrz(domain, null);
    $('pp-groups').innerHTML = '';
    $('pp-score').textContent = '0';
    $('pp-grade').textContent = '·';
    $('pp-points').textContent = '';
    $('pp-arc').style.strokeDashoffset = 326.7;
    var st = $('pp-stamp'); st.className = 'stamp'; st.innerHTML = '';
  }

  function count(to) {
    if (reduce) { $('pp-score').textContent = to; return; }
    var t0 = performance.now();
    (function f(t) { var k = Math.min(1, (t - t0) / 1400), e = 1 - Math.pow(1 - k, 3); $('pp-score').textContent = Math.round(to * e); if (k < 1) requestAnimationFrame(f); })(t0);
  }

  function show(domain, d) {
    var book = $('pp-book');
    book.classList.remove('scanning');
    $('pp-status').textContent = 'Scan complete · ' + d.checks.filter(function (c) { return c.pass; }).length + ' of 13 checks passed';
    $('pp-mrz').textContent = mrz(domain, d);
    $('pp-proof').textContent = d.dns_proof ? 'Present (_lunara-verify)' : 'Not published';

    var visa = {
      verified: d.register && ('<b style="color:#7FE0B0;font:600 15px Inter">Verified.</b> ' + esc(d.register.business_name || domain) + ' holds <a class="inline" href="' + esc(d.register.record) + '">' + esc(d.register.public_id) + '</a>. A named reviewer checked who runs it' + (d.register.expires_at ? ', valid until ' + esc(d.register.expires_at.slice(0, 10)) : '') + '.'),
      revoked: '<b style="color:#F2C46B">Revoked.</b> This domain held a credential and it was withdrawn. Read the record before relying on it.',
      expired: '<b style="color:#F2C46B">Expired.</b> The credential term has ended and was not renewed.',
      not_registered: '<b style="color:#F4F0E8">Not registered.</b> Nobody has checked who runs this domain. That is true of almost every site and is not a mark against it.'
    }[d.visa];
    $('pp-visa').innerHTML = visa;

    var html = '', order = ['transport', 'dns', 'ai'];
    order.forEach(function (g) {
      html += '<div class="grp"><h3>' + GROUPS[g] + '</h3>';
      d.checks.filter(function (c) { return c.group === g; }).forEach(function (c) {
        var cls = c.pass ? 'pass' : c.partial ? 'part' : 'fail', ic = c.pass ? '✓' : c.partial ? '½' : '✕';
        html += '<div class="row ' + cls + '"><span class="ic">' + ic + '</span><span class="l">' + esc(c.label) + '<small title="' + esc(c.detail) + '">' + esc(c.detail) + '</small></span><span class="pts">' + c.earned + '/' + c.points + '</span></div>';
      });
      html += '</div>';
    });
    $('pp-groups').innerHTML = html;
    var rows = $('pp-groups').querySelectorAll('.row');
    rows.forEach(function (r, i) { setTimeout(function () { r.classList.add('in'); }, reduce ? 0 : 90 * i); });

    setTimeout(function () {
      $('pp-arc').style.strokeDashoffset = (326.7 * (1 - d.score / 100)).toFixed(1);
      count(d.score);
      $('pp-grade').textContent = d.grade;
      $('pp-points').textContent = d.score + ' points';
      $('pp-gradecap').textContent = d.score >= 80 ? 'Strong public hygiene. The visa is still decided by a person.' : d.score >= 50 ? 'Some doors are open. The list below closes them.' : 'Easy to impersonate from the outside. Start with the list below.';
    }, reduce ? 0 : 300);

    var delay = reduce ? 0 : 90 * rows.length + 900;
    setTimeout(function () {
      var st = $('pp-stamp');
      st.innerHTML = stampSvg(d.visa);
      st.className = 'stamp ' + (d.visa === 'verified' ? 'ok' : d.visa === 'not_registered' ? 'no' : 'rev') + ' slam';
      if (!reduce) setTimeout(function () { book.classList.add('shake'); setTimeout(function () { book.classList.remove('shake'); }, 400); }, 300);
      after(domain, d);
    }, delay);
  }

  function after(domain, d) {
    var fixes = d.checks.filter(function (c) { return c.fix; }).sort(function (a, b) { return (b.points - b.earned) - (a.points - a.earned); });
    $('pp-fixes').innerHTML = fixes.length ? fixes.map(function (c) {
      return '<li><div><b>' + esc(c.label) + '.</b> ' + esc(c.fix) + '</div><span>+' + Math.round((c.points - c.earned) * 10) / 10 + '</span></li>';
    }).join('') : '<li><div><b>Nothing to fix.</b> Every public signal we read is in place.</div><span></span></li>';
    $('pp-fixlede').textContent = fixes.length ? 'Ordered by points. Each is a change your web or DNS host can make, usually in minutes.' : 'A clean sheet on every public signal.';
    if (d.visa === 'verified') {
      $('pp-cta-h').innerHTML = 'Stamped. <em>Show it.</em>';
      $('pp-cta-p').textContent = 'Put the live badge on the site, so visitors and AI systems can check the stamp themselves.';
      $('pp-cta').textContent = 'Get the badge'; $('pp-cta').href = '/badge.html';
    } else {
      $('pp-cta-h').innerHTML = 'Get the <em>stamp</em>';
      $('pp-cta-p').textContent = 'Points come from public signals. The stamp comes from a named reviewer checking who runs ' + domain + ', and every AI system that asks the register gets the same answer.';
      $('pp-cta').textContent = 'Apply for Shield'; $('pp-cta').href = '/shield.html';
    }
    $('pp-call').textContent = 'curl -X POST ' + API + ' \\\n  -H "content-type: application/json" \\\n  -d \'{"domain":"' + domain + '"}\'';
    badge(domain, d);
    $('pp-after').classList.add('on');
  }

  var BADGE = ['A+', 'A', 'B'];
  function badge(domain, d) {
    var ok = BADGE.indexOf(d.grade) >= 0, box = $('pp-badge-preview');
    box.innerHTML = '';
    $('pp-badge-code').hidden = $('pp-badge-btns').hidden = !ok;
    if (!ok) {
      $('pp-badge-h').innerHTML = 'The badge unlocks <em>at B</em>';
      $('pp-badge-p').textContent = domain + ' needs ' + (65 - d.score) + ' more points for the free Lunara Passport badge. The list on the left is the way there.';
      return;
    }
    $('pp-badge-h').innerHTML = 'Earned: the <em>free badge</em>';
    $('pp-badge-p').textContent = 'Put this on ' + domain + '. It shows the live grade, links to this passport, and hides itself if the grade ever drops below B.';
    var el = document.createElement('div');
    el.__lunaraPreview = d;
    box.appendChild(el);
    if (window.LunaraPassportBadge) window.LunaraPassportBadge.render(el, d);
    $('pp-badge-code').textContent = '<div data-lunara-passport></div>\n<script src="https://lunarasociety.com/passport-badge.js" async></script>';
  }
  $('pp-badge-copy').addEventListener('click', function () {
    var b = this;
    (navigator.clipboard ? navigator.clipboard.writeText($('pp-badge-code').textContent) : Promise.reject()).then(function () { b.textContent = 'Copied'; setTimeout(function () { b.textContent = 'Copy badge code'; }, 1800); }, function () {});
  });

  $('pp-watch').addEventListener('submit', function (e) {
    e.preventDefault();
    var out = $('pp-watch-out'), domain = $('pp-name').textContent;
    out.className = 'watch-out'; out.textContent = 'Sending…';
    fetch(API.replace('passportScan', 'passportWatch'), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ domain: domain, email: $('pp-watch-email').value }) })
      .then(function (r) { return r.json(); })
      .then(function (j) { if (!j.success) out.className = 'watch-out err'; out.textContent = j.message || j.error; })
      .catch(function () { out.className = 'watch-out err'; out.textContent = 'Could not reach the server. Try again.'; });
  });

  /* A link from an alert email: confirm the watch, or stop it. */
  (function () {
    var q = new URLSearchParams(location.search), token = q.get('watch');
    if (!token) return;
    var banner = $('pp-banner');
    banner.hidden = false; banner.textContent = 'One moment…';
    $('pp-wrap').parentNode.insertBefore(banner, $('pp-wrap'));
    fetch(API.replace('passportScan', 'passportWatchSet'), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: token, action: q.get('stop') ? 'stop' : 'confirm' }) })
      .then(function (r) { return r.json(); })
      .then(function (j) { banner.textContent = j.message || j.error; if (j.success && j.watching && !q.get('d')) scan(j.domain); })
      .catch(function () { banner.textContent = 'Could not reach the server. Open the link again in a moment.'; });
  })();

  function scan(raw) {
    if (busy) return;
    var domain = norm(raw);
    if (!domain) { $('pp-domain').focus(); $('pp-domain').select(); return; }
    busy = true;
    $('pp-domain').value = domain;
    $('pp-go').disabled = true;
    try { history.replaceState(null, '', '?d=' + encodeURIComponent(domain)); } catch (e) {}
    reset(domain);
    $('pp-wrap').scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    var i = 0, status = $('pp-status');
    status.className = 'status-line'; status.textContent = LINES[0];
    var tick = setInterval(function () { i = Math.min(i + 1, LINES.length - 1); status.textContent = LINES[i]; }, 650);
    var started = Date.now();

    fetch(API, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ domain: domain }) })
      .then(function (r) { return r.json().then(function (j) { if (!r.ok || !j.success) throw new Error(j.error || 'HTTP ' + r.status); return j; }); })
      .then(function (d) {
        // Let the laser finish a pass even on a fast answer; the reading should feel read.
        setTimeout(function () { clearInterval(tick); show(domain, d); busy = false; $('pp-go').disabled = false; }, Math.max(0, (reduce ? 0 : 2200) - (Date.now() - started)));
      })
      .catch(function (e) {
        clearInterval(tick); busy = false; $('pp-go').disabled = false;
        $('pp-book').classList.remove('scanning');
        status.className = 'status-line err';
        status.textContent = (e && e.message && !/^HTTP|Failed to fetch|NetworkError/.test(e.message)) ? e.message : 'The scanner could not be reached just now. Nothing is shown rather than a guess.';
        $('pp-visa').textContent = 'No answer.';
      });
  }

  $('pp-form').addEventListener('submit', function (e) { e.preventDefault(); scan($('pp-domain').value); });
  document.querySelectorAll('.chips button[data-d]').forEach(function (b) { b.addEventListener('click', function () { scan(b.getAttribute('data-d')); }); });
  $('pp-share').addEventListener('click', function () {
    var b = this, url = location.origin + location.pathname + '?d=' + encodeURIComponent($('pp-name').textContent);
    (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(function () { b.textContent = 'Link copied'; }, function () { prompt('Copy this link', url); })
      .then(function () { setTimeout(function () { b.textContent = 'Copy link to this passport'; }, 1800); });
  });
  var pre = new URLSearchParams(location.search).get('d');
  if (pre) scan(pre);
})();
