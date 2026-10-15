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


  /* ── the cinema ────────────────────────────────────────────────────
     The cover opens on its spine, the booklet follows the pointer and
     catches light in its foil, each check lands with a tick, and the
     stamp comes down with ink, a flash and a thud. Sound is off until
     the reader switches it on with the button, and stays as they left it. */
  var AC = null, soundOn = false;
  try { soundOn = localStorage.getItem('lx-sound') === '1'; } catch (e) {}      // off until the visitor switches it on
  function snd() {
    if (!soundOn || reduce) return null;
    try { AC = AC || new (window.AudioContext || window.webkitAudioContext)(); if (AC.state === 'suspended') AC.resume(); } catch (e) { AC = null; }
    return AC;
  }
  function tick(i) {
    var a = snd(); if (!a) return;
    var o = a.createOscillator(), g = a.createGain(), t = a.currentTime;
    o.type = 'sine'; o.frequency.setValueAtTime(1500 + (i % 4) * 140, t);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.035, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
    o.connect(g); g.connect(a.destination); o.start(t); o.stop(t + 0.08);
  }
  function thud() {
    var a = snd(); if (!a) return;
    var t = a.currentTime, o = a.createOscillator(), g = a.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(38, t + 0.28);
    g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
    o.connect(g); g.connect(a.destination); o.start(t); o.stop(t + 0.42);
    var len = Math.floor(a.sampleRate * 0.12), buf = a.createBuffer(1, len, a.sampleRate), d = buf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    var n = a.createBufferSource(), f = a.createBiquadFilter(), ng = a.createGain();
    n.buffer = buf; f.type = 'lowpass'; f.frequency.value = 900; ng.gain.value = 0.35;
    n.connect(f); f.connect(ng); ng.connect(a.destination); n.start(t);
  }
  function hum(on) {
    var a = snd(); if (!a) return;
    if (on && !hum.o) {
      var o = a.createOscillator(), g = a.createGain(); o.type = 'sawtooth'; o.frequency.value = 62;
      var f = a.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 260;
      g.gain.setValueAtTime(0.0001, a.currentTime); g.gain.exponentialRampToValueAtTime(0.02, a.currentTime + 0.4);
      o.connect(f); f.connect(g); g.connect(a.destination); o.start(); hum.o = o; hum.g = g;
    } else if (!on && hum.o) {
      var t = a.currentTime; hum.g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3); hum.o.stop(t + 0.32); hum.o = null;
    }
  }
  $('pp-snd').addEventListener('click', function () {
    soundOn = !soundOn; this.setAttribute('aria-pressed', soundOn ? 'true' : 'false'); this.textContent = soundOn ? 'Sound on' : 'Sound off';
    try { localStorage.setItem('lx-sound', soundOn ? '1' : '0'); } catch (e) {}
    if (!soundOn) hum(false);
  });
  if (!soundOn) { $('pp-snd').setAttribute('aria-pressed', 'false'); $('pp-snd').textContent = 'Sound off'; }

  function openCover() {
    var rig = $('pp-rig'), cover = $('pp-cover');
    if (reduce) { rig.classList.remove('closed'); return; }
    cover.classList.add('snap'); cover.classList.remove('open', 'gone'); rig.classList.add('closed');
    void cover.offsetWidth; cover.classList.remove('snap');
    setTimeout(function () { rig.classList.remove('closed'); cover.classList.add('open'); }, 650);
    setTimeout(function () { cover.classList.add('gone'); }, 1900);
  }

  // The booklet turns toward the pointer; the foil moves against it.
  (function () {
    if (reduce || !(window.matchMedia && matchMedia('(pointer: fine)').matches)) return;
    var wrap = $('pp-wrap'), rig = $('pp-rig'), holo = wrap.querySelector('.holo');
    wrap.addEventListener('pointermove', function (e) {
      if (rig.classList.contains('closed')) return;
      var b = wrap.getBoundingClientRect(), x = (e.clientX - b.left) / b.width, y = (e.clientY - b.top) / b.height;
      rig.style.transform = 'rotateX(' + ((0.5 - y) * 7).toFixed(2) + 'deg) rotateY(' + ((x - 0.5) * 9).toFixed(2) + 'deg)';
      holo.style.setProperty('--hx', (100 - x * 100).toFixed(1) + '%'); holo.style.setProperty('--hy', (100 - y * 100).toFixed(1) + '%');
    });
    wrap.addEventListener('pointerleave', function () { rig.style.transform = ''; });
  })();

  // Ink thrown off the stamp, and a ring of air.
  function burst(color) {
    if (reduce) return;
    var cv = $('pp-fx'), stamp = $('pp-stamp'), rig = $('pp-rig');
    var rb = rig.getBoundingClientRect(), sb = stamp.getBoundingClientRect();
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = cv.offsetWidth * dpr; cv.height = cv.offsetHeight * dpr;
    var cx = cv.getContext('2d'); cx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var ox = sb.left - rb.left + 120 + sb.width / 2, oy = sb.top - rb.top + 120 + sb.height / 2;
    var ps = [];
    for (var i = 0; i < 90; i++) {
      var a = Math.random() * Math.PI * 2, v = 2 + Math.random() * 9;
      ps.push({ x: ox + Math.cos(a) * 60, y: oy + Math.sin(a) * 60, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 1.5, r: 1 + Math.random() * 3.2, life: 1 });
    }
    var t0 = performance.now();
    (function f(now) {
      var k = (now - t0) / 1000;
      cx.clearRect(0, 0, cv.width, cv.height);
      cx.globalCompositeOperation = 'lighter';
      cx.strokeStyle = color; cx.globalAlpha = Math.max(0, 0.7 - k * 1.4); cx.lineWidth = 3;
      cx.beginPath(); cx.arc(ox, oy, 120 + k * 420, 0, Math.PI * 2); cx.stroke();
      ps.forEach(function (p) {
        p.x += p.vx; p.y += p.vy; p.vy += 0.25; p.vx *= 0.97; p.life -= 0.018;
        if (p.life <= 0) return;
        cx.globalAlpha = p.life; cx.fillStyle = color;
        cx.beginPath(); cx.arc(p.x, p.y, p.r, 0, Math.PI * 2); cx.fill();
      });
      if (k < 1.3) requestAnimationFrame(f); else cx.clearRect(0, 0, cv.width, cv.height);
    })(t0);
  }
  function impact(visa) {
    var color = visa === 'verified' ? '#7FE0B0' : visa === 'not_registered' ? '#FF8A7A' : '#F2C46B';
    thud(); burst(color);
    var fl = $('pp-flash'); fl.classList.remove('go'); void fl.offsetWidth; fl.classList.add('go');
    if (!reduce) { document.body.classList.add('quake'); setTimeout(function () { document.body.classList.remove('quake'); }, 420); }
  }

  var LINES = ['Resolving DNS…', 'Asking for DNSSEC signatures…', 'Reading SPF and DMARC…', 'Opening HTTPS…', 'Reading security headers…', 'Looking for llms.txt…', 'Reading robots.txt for AI crawlers…', 'Looking for security.txt…', 'Asking the register…'];

  function reset(domain) {
    $('pp-wrap').classList.add('on');
    $('pp-after').classList.remove('on');
    var book = $('pp-book');
    book.style.animation = 'none'; void book.offsetWidth; book.style.animation = '';
    book.classList.add('scanning');
    openCover();
    hum(true);
    if (!reduce) document.body.classList.add('spot');
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
    hum(false);
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
    rows.forEach(function (r, i) { setTimeout(function () { r.classList.add('in'); tick(i); }, reduce ? 0 : 90 * i); });

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
      if (!reduce) setTimeout(function () { impact(d.visa); book.classList.add('shake'); setTimeout(function () { book.classList.remove('shake'); }, 400); }, 300);
      after(domain, d);
      setTimeout(function () { document.body.classList.remove('spot'); }, 1600);
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
    offer(domain, d);
    last = { domain: domain, d: d };
    $('pp-after').classList.add('on');
    if (location.hash === '#monitor') setTimeout(function () { $('monitor').scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' }); }, 400);
  }

  /* What to do about the score: keep it (Passport Monitor) or have the
     business behind it verified (Shield). The buy buttons carry the
     domain, so Stripe's page arrives with the website already filled. */
  var last = null;
  function offer(domain, d) {
    var top = d.grade === 'A+' || d.grade === 'A';
    $('pp-offer-h').innerHTML = top ? 'Keep this <em>' + esc(d.grade) + '</em>' : d.grade === 'B' ? 'Hold the B. <em>Then climb.</em>' : 'Fix it once. <em>Keep it fixed.</em>';
    $('pp-offer-p').textContent = top
      ? domain + ' scores ' + d.score + ' today. One expired certificate or one deleted DNS record and it drops, usually without anyone noticing until a customer, a partner or an AI system does.'
      : domain + ' scores ' + d.score + '. The list below is the way up; Passport Monitor rescans it every day, tells you the moment anything slips, and puts the live Monitored badge on your site once you reach B.';
    ['pp-buy-monitor', 'pp-buy-year', 'pp-buy-shield'].forEach(function (id) { $(id).setAttribute('data-lx-website', domain); });
    var shield = $('pp-buy-shield').closest('.plan');
    shield.hidden = d.visa === 'verified';
    shield.parentNode.style.gridTemplateColumns = d.visa === 'verified' ? '1fr' : '';
    if (window.LunaraPricing) window.LunaraPricing.refresh();
  }

  /* The full report: the lead goes to the register (and the report to
     the visitor's inbox when mail is on); the PDF opens here either way,
     so asking for it never ends in "check your email" and nothing. */
  function reportHtml(domain, d) {
    var fails = d.checks.filter(function (c) { return !c.pass; }).sort(function (a, b) { return (b.points - b.earned) - (a.points - a.earned); });
    var row = function (c) {
      return '<tr><td class="' + (c.pass ? 'ok' : c.partial ? 'part' : 'no') + '">' + (c.pass ? 'Pass' : c.partial ? 'Partly' : 'Fail') + '</td><td><b>' + esc(c.label) + '</b><br><span>' + esc(c.detail || '') + '</span>' + (!c.pass && c.fix ? '<br><i>Fix: ' + esc(c.fix) + '</i>' : '') + '</td><td>' + (Math.round(c.earned * 10) / 10) + ' / ' + c.points + '</td></tr>';
    };
    return '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Lunara Passport report: ' + esc(domain) + '</title><style>'
      + 'body{font:14px/1.5 Georgia,serif;color:#1d1a14;max-width:760px;margin:32px auto;padding:0 24px}h1{font-size:28px;margin:0}'
      + '.k{font:11px monospace;letter-spacing:.2em;text-transform:uppercase;color:#8a7240}.big{font-size:44px;margin:14px 0 2px}'
      + 'table{width:100%;border-collapse:collapse;margin-top:18px}td{border-top:1px solid #e6dfcf;padding:9px 8px;vertical-align:top}td:first-child{width:62px;font:600 12px monospace}td:last-child{width:70px;text-align:right;font:12px monospace}'
      + 'td span{color:#6b6252;font-size:13px}td i{color:#3d5a4c;font-size:13px}.ok{color:#2e7d5b}.part{color:#a87b1f}.no{color:#b23b2e}'
      + '.box{margin-top:24px;padding:14px 16px;border:1px solid #e6dfcf;border-radius:10px;font-size:13.5px}a{color:#8a7240}@media print{.noprint{display:none}}'
      + '</style></head><body><p class="k">Lunara Society · Passport report</p><h1>' + esc(domain) + '</h1>'
      + '<p class="big">' + esc(d.grade) + ' · ' + d.score + '/100</p><p>Scanned ' + esc(new Date(d.scanned_at || Date.now()).toUTCString()) + '. Visa on the public register: ' + esc(d.visa) + '. ' + fails.length + ' of ' + d.checks.length + ' checks need work.</p>'
      + '<table>' + fails.concat(d.checks.filter(function (c) { return c.pass; })).map(row).join('') + '</table>'
      + '<div class="box"><b>Next.</b> Live passport: <a href="https://lunarasociety.com/passport.html?d=' + encodeURIComponent(domain) + '">lunarasociety.com/passport.html?d=' + esc(domain) + '</a>. Passport Monitor rescans it every day and emails you the moment anything slips; Shield Verification has a person verify the business behind it.</div>'
      + '<p class="noprint" style="margin-top:20px"><button onclick="print()">Save as PDF</button></p>'
      + '<script>setTimeout(function(){print()},400)<\/script></body></html>';
  }
  $('pp-report').addEventListener('submit', function (e) {
    e.preventDefault();
    if (!last) return;
    var out = $('pp-report-out'), snap = last;
    var w = window.open('', '_blank');
    if (w) w.document.write('<p style="font:16px Georgia,serif;margin:40px">Preparing the report for ' + esc(snap.domain) + '…</p>');
    out.className = 'watch-out'; out.textContent = 'Preparing…';
    fetch(API.replace('passportScan', 'passportLead'), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ domain: snap.domain, email: $('pp-report-email').value }) })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (!j.success) { out.className = 'watch-out err'; out.textContent = j.error || 'Could not prepare the report.'; if (w) w.close(); return; }
        out.textContent = j.emailed ? 'Done. A copy is on its way to your inbox too.' : 'Done. Your report opened in a new tab; save it as a PDF from there.';
        var html = reportHtml(snap.domain, snap.d);
        if (w) { w.document.open(); w.document.write(html); w.document.close(); }
        else { var b = new Blob([html], { type: 'text/html' }); location.href = URL.createObjectURL(b); }
      })
      .catch(function () { out.className = 'watch-out err'; out.textContent = 'Could not reach the server. Try again.'; if (w) w.close(); });
  });

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
        setTimeout(function () { clearInterval(tick); show(domain, d); busy = false; $('pp-go').disabled = false; }, Math.max(0, (reduce ? 0 : 2700) - (Date.now() - started)));
      })
      .catch(function (e) {
        clearInterval(tick); hum(false); document.body.classList.remove('spot'); busy = false; $('pp-go').disabled = false;
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
