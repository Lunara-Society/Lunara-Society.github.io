/* ═══════════════════════════════════════════════════════════════════
   LUNARA LENS — the app
   ═══════════════════════════════════════════════════════════════════

   One file, in sections: settings and speech, the account, the
   screens, and the voice commands that can open every one of them.

   The rule the whole app follows: say what is happening, then say
   what was found. A person who cannot see the screen should be able to
   use every feature by voice and by ear alone.
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var API = 'https://luiqtimzcsoqnizybifs.supabase.co/functions/v1/lunara-lens';
  var AUTH = 'https://luiqtimzcsoqnizybifs.supabase.co/functions/v1/lunara-auth';
  var CLIENT_ID = '744926178467-645eltr29q4o3lo8msnlnuqsa782feca.apps.googleusercontent.com';
  var TX = window.LensText, FX = window.LensForensics, MK = window.LensMark;
  var main = document.getElementById('main');

  /* ── storage, settings, words ───────────────────────────────────── */
  function get(k, d) { try { var v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } }
  function put(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } }
  function raw(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }

  var S = Object.assign({ natural: true, handsFree: false, lang: /^es\b/i.test(navigator.language || '') ? 'es' : 'en', rate: 1, big: false, hc: false, speak: true, haptic: true }, get('lens_settings', {}));
  function saveSettings() { put('lens_settings', S); applySettings(); }
  function applySettings() {
    document.documentElement.lang = S.lang;
    document.documentElement.classList.toggle('big', !!S.big);
    document.documentElement.classList.toggle('hc', !!S.hc);
  }
  function t(k) { var v = TX[S.lang][k]; return v === undefined ? TX.en[k] : v; }
  var other = function (l) { return l === 'es' ? 'en' : 'es'; };
  function L(en, es) { return S.lang === 'es' ? es : en; }
  function fmt(n) { return Number(n || 0).toLocaleString(S.lang === 'es' ? 'es-ES' : 'en-US'); }

  /* The copy installed from Google Play opens with ?src=play. Inside it,
     plans and credits are sold only through Google Play: no PayPal, no
     links out to pay elsewhere (Play's payments policy). The copy
     downloaded from the website and the web app use PayPal. Kept for
     this tab only, so the website in Chrome is never mistaken for it. */
  function isPlay() {
    try {
      if (/[?&]src=play\b/.test(location.search)) sessionStorage.setItem('lens_play', '1');
      return sessionStorage.getItem('lens_play') === '1';
    } catch (e) { return false; }
  }
  isPlay();
  var langName = function (l) { return { en: S.lang === 'es' ? 'Inglés' : 'English', es: S.lang === 'es' ? 'Español' : 'Spanish' }[l]; };
  function buzz(p) { if (S.haptic && navigator.vibrate) try { navigator.vibrate(p || 18); } catch (e) { } }

  /* ── tiny DOM helper ────────────────────────────────────────────── */
  function h(tag, attrs) {
    var el = document.createElement(tag);
    if (attrs) for (var k in attrs) {
      var v = attrs[k];
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (var i = 2; i < arguments.length; i++) add(el, arguments[i]);
    return el;
  }
  function add(el, c) {
    if (c === null || c === undefined || c === false) return;
    if (Array.isArray(c)) c.forEach(function (x) { add(el, x); });
    else el.appendChild(c.nodeType ? c : document.createTextNode(String(c)));
  }
  /* Clear an element and add children, skipping empty ones and flattening arrays. */
  function fill(el) { el.innerHTML = ''; for (var i = 1; i < arguments.length; i++) add(el, arguments[i]); return el; }
  var ICON = {
    photo: 'M4 5h16v14H4zM4 15l5-5 4 4 3-3 4 4M15.5 8.5h.01',
    scan: 'M4 8V5h3M17 5h3v3M20 16v3h-3M7 19H4v-3M4 12h16',
    video: 'M3 6h13v12H3zM16 10l5-3v10l-5-3',
    voice: 'M12 3a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3zM5 11a7 7 0 0 0 14 0M12 18v3',
    text: 'M5 6h14M5 10h14M5 14h10M5 18h7',
    scam: 'M12 3l9 16H3zM12 10v4M12 17h.01',
    verify: 'M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6zM9 12l2 2 4-4',
    mark: 'M12 2l2.4 4.9 5.4.8-3.9 3.8.9 5.4L12 14.4 7.2 16.9l.9-5.4-3.9-3.8 5.4-.8z',
    eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
    read: 'M4 5h7a2 2 0 0 1 2 2v12a2 2 0 0 0-2-2H4zM20 5h-7M20 5v12h-7',
    magnify: 'M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM21 21l-5.5-5.5M10 7v6M7 10h6',
    color: 'M12 3a9 9 0 1 0 0 18c1 0 1.5-.8 1.5-1.5 0-.9-.7-1.2-.7-2 0-.8.7-1.5 1.5-1.5H17a4 4 0 0 0 4-4c0-4.9-4-9-9-9zM7.5 11h.01M10 7h.01M15 7h.01',
    translate: 'M4 5h8M8 3v2M6 5c0 4 3 7 6 8M10 5c0 3-2 6-6 8M13 21l4-10 4 10M14.5 17h5',
    converse: 'M4 4h11v8H8l-4 3zM20 9v8l-3-2h-6v-3',
    replies: 'M9 10L4 14l5 4M4 14h11a5 5 0 0 0 5-5V6',
    files: 'M3 7h6l2 2h10v10H3z',
    remember: 'M12 21s7-6.1 7-11a7 7 0 0 0-14 0c0 4.9 7 11 7 11zM12 7v3l2 1',
    calm: 'M12 21c4-3 7-6 7-10a7 7 0 0 0-14 0c0 4 3 7 7 10zM9 11c1 1 2 1.5 3 1.5s2-.5 3-1.5',
    card: 'M3 6h18v12H3zM7 10h4M7 14h6M16 9v4M14 11h4',
    account: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0',
    mic: 'M12 3a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3zM5 11a7 7 0 0 0 14 0M12 18v3',
    back: 'M15 18l-6-6 6-6',
    speak: 'M4 9v6h4l5 4V5L8 9zM16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11',
    lang: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18',
    link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
    qr: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 18h2v2h-2zM18 14h2M14 18v2',
    summarize: 'M6 3h9l4 4v14H6zM15 3v4h4M9 11h7M9 15h7M9 19h4',
    reminders: 'M12 8v5l3 2M12 21a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM5 3L2 6M19 3l3 3',
    safeword: 'M7 11V8a5 5 0 0 1 10 0v3M5 11h14v10H5zM12 15v2',
    emergency: 'M12 3l9 16H3zM12 9v5M12 17h.01',
    briefing: 'M12 4V2M12 22v-2M4 12H2M22 12h-2M5.6 5.6L4.2 4.2M19.8 19.8l-1.4-1.4M5.6 18.4l-1.4 1.4M19.8 4.2l-1.4 1.4M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z',
    owner: 'M3 8l4 3 5-6 5 6 4-3-2 11H5zM5 21h14'
  };
  ICON.remind = ICON.reminders; ICON.describe = ICON.eye;
  function icon(n) {
    return h('span', { 'aria-hidden': 'true', html: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="' + (ICON[n] || ICON.lunara || ICON.mark) + '"/></svg>' }).firstChild;
  }

  /* ── speaking and listening ─────────────────────────────────────── */
  var live = document.getElementById('live'), toastEl = document.getElementById('toast'), toastTimer;
  var lastSaid = '';
  function toast(msg, ms) {
    toastEl.textContent = msg; toastEl.classList.add('on');
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { toastEl.classList.remove('on'); }, ms || Math.min(9000, 2500 + msg.length * 45));
  }
  function voiceFor(lang) {
    var vs = (window.speechSynthesis && speechSynthesis.getVoices()) || [];
    var want = lang === 'es' ? /^es/i : /^en/i;
    var list = vs.filter(function (v) { return want.test(v.lang); });
    var rank = function (v) { return (/natural|neural|premium|enhanced|google/i.test(v.name) ? 2 : 0) + (lang === 'es' ? (/es-(ES|MX|US)/i.test(v.lang) ? 1 : 0) : (/en-(US|GB)/i.test(v.lang) ? 1 : 0)); };
    list.sort(function (a, b) { return rank(b) - rank(a); });
    return list[0] || null;
  }
  /* Rosario's voice, in order of preference:
       1. a clip Caty recorded for this exact line (free, instant, offline)
       2. Caty live through the server (metered; licensed users, when on)
       3. the phone's own voice (free, offline, always there)
     The rings round her portrait move with whatever is playing. */
  var CLIPS = { en: {}, es: {} }, CLIP_BY_TEXT = { en: {}, es: {} };
  ['en', 'es'].forEach(function (l) {
    fetch('voice/' + l + '/index.json').then(function (r) { return r.json(); }).then(function (idx) {
      CLIPS[l] = idx; Object.keys(idx).forEach(function (k) { CLIP_BY_TEXT[l][norm(idx[k].t)] = k; });
    }).catch(function () { });
  });
  function norm(x) { return String(x || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim(); }
  var voiceEl = new Audio(); voiceEl.preload = 'auto';
  var actx = null, analyser = null, level = 0, speakingDevice = false, speakQ = Promise.resolve();
  function wireAnalyser() {
    if (analyser || !(window.AudioContext || window.webkitAudioContext)) return;
    try {
      actx = new (window.AudioContext || window.webkitAudioContext)();
      var src = actx.createMediaElementSource(voiceEl); analyser = actx.createAnalyser(); analyser.fftSize = 256;
      src.connect(analyser); analyser.connect(actx.destination);
    } catch (e) { analyser = null; }
  }
  function voiceLevel() {
    if (analyser && !voiceEl.paused) {
      var d = new Uint8Array(analyser.frequencyBinCount); analyser.getByteTimeDomainData(d);
      var m = 0; for (var i = 0; i < d.length; i++) m = Math.max(m, Math.abs(d[i] - 128));
      level += (m / 128 - level) * 0.35;
    } else if (speakingDevice) level += ((0.35 + 0.25 * Math.sin(Date.now() / 90)) - level) * 0.2;
    else level *= 0.9;
    return level;
  }
  function isSpeaking() { return !voiceEl.paused || speakingDevice; }
  function playUrl(url) {
    return new Promise(function (resolve) {
      wireAnalyser(); if (actx && actx.state === 'suspended') actx.resume();
      voiceEl.onended = voiceEl.onerror = function () { resolve(true); };
      voiceEl.src = url; voiceEl.playbackRate = 1;
      var p = voiceEl.play(); if (p && p.catch) p.catch(function () { resolve(false); });
    });
  }
  function stopVoice() { try { voiceEl.pause(); } catch (e) { } if (window.speechSynthesis) speechSynthesis.cancel(); speakingDevice = false; }
  function deviceSay(text, l) {
    return new Promise(function (resolve) {
      if (!window.speechSynthesis) return resolve();
      try {
        speechSynthesis.cancel();
        var u = new SpeechSynthesisUtterance(text);
        u.lang = l === 'es' ? 'es-ES' : 'en-US';
        var v = voiceFor(l); if (v) u.voice = v;
        u.rate = S.rate || 1; speakingDevice = true;
        u.onend = u.onerror = function () { speakingDevice = false; resolve(); };
        speechSynthesis.speak(u);
        setTimeout(function () { speakingDevice = false; resolve(); }, 2500 + text.length * 110);
      } catch (e) { speakingDevice = false; resolve(); }
    });
  }
  var ttsCache = {};
  function naturalSay(text, l) {
    var key = l + '|' + text;
    var get = ttsCache[key] ? Promise.resolve(ttsCache[key]) : (function () {
      var tok = session(); if (!tok) return Promise.reject();
      return fetchT(API + '/speak', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ session_token: tok, text: text, lang: l }) }, 20000)
        .then(function (r) { if (!r.ok || !/audio/.test(r.headers.get('content-type') || '')) throw 0; return r.blob(); })
        .then(function (b) { var u = URL.createObjectURL(b); var ks = Object.keys(ttsCache); if (ks.length > 30) { URL.revokeObjectURL(ttsCache[ks[0]]); delete ttsCache[ks[0]]; } ttsCache[key] = u; return u; });
    })();
    return get.then(playUrl);
  }
  function say(text, lang, opts) {
    opts = opts || {};
    if (!text) return Promise.resolve();
    var l = lang || S.lang;
    lastSaid = text; live.textContent = text;
    if (!opts.silentToast) toast(text);
    if (opts.transcript !== false && window.RosarioLog) RosarioLog('rosario', text);
    if (!S.speak) return Promise.resolve();
    stopVoice();
    var clip = CLIP_BY_TEXT[l][norm(text)];
    var run = function () {
      if (clip) return playUrl('voice/' + l + '/' + clip + '.mp3').then(function (ok) { if (!ok) return deviceSay(text, l); });
      if (S.natural !== false && me && me.voice && navigator.onLine !== false) return naturalSay(text, l).catch(function () { return deviceSay(text, l); });
      return deviceSay(text, l);
    };
    return run();
  }
  function sayKey(key, lang) {
    var l = lang || S.lang, c = CLIPS[l][key];
    return say(c ? c.t : key, l);
  }
  if (window.speechSynthesis) speechSynthesis.onvoiceschanged = function () { };

  var Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
  function listen(lang) {
    return new Promise(function (resolve, reject) {
      if (!Rec) return reject(new Error('nospeech'));
      if (window.speechSynthesis) speechSynthesis.cancel();
      var r = new Rec(), got = false;
      r.lang = (lang || S.lang) === 'es' ? 'es-ES' : 'en-US';
      r.interimResults = false; r.maxAlternatives = 1; r.continuous = false;
      r.onresult = function (e) { got = true; resolve(e.results[0][0].transcript || ''); };
      r.onerror = function (e) { if (!got) { got = true; e.error === 'no-speech' ? resolve('') : reject(new Error(e.error)); } };
      r.onend = function () { if (!got) resolve(''); };
      try { r.start(); } catch (e) { reject(e); }
    });
  }

  /* ── account ────────────────────────────────────────────────────── */
  function session() {
    var tok = raw('lunara_session_token'), exp = Number(raw('lunara_expires_at') || 0);
    if (!tok || (exp && Date.now() > exp)) return null;
    return tok;
  }
  /* fetch with a deadline: a phone on a weak signal should hear that
     something failed, not wait forever. */
  function fetchT(url, opts, ms) {
    var ac = window.AbortController ? new AbortController() : null;
    var timer = ac && setTimeout(function () { ac.abort(); }, ms || 20000);
    return fetch(url, Object.assign({}, opts || {}, ac ? { signal: ac.signal } : {})).finally(function () { clearTimeout(timer); });
  }
  var me = null; // last /me answer
  function call(path, body) {
    var tok = session();
    if (!tok) return Promise.reject({ code: 'signin', error: t('signin_first') });
    return fetchT(API + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(Object.assign({ session_token: tok }, body || {})) }, path === '/ai' ? 90000 : 20000)
      .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw j; return j; }); }, function () { throw { code: 'network', error: t('err') }; });
  }
  function refreshMe() {
    if (!session()) { me = null; renderPill(); return Promise.resolve(null); }
    return call('/me').then(function (j) { me = j; renderPill(); return j; }).catch(function (e) { me = null; renderPill(); if (e && e.code === 'signin') { signOut(); } return null; });
  }
  /* Everyone signed in can use everything; the server prices each AI
     action in credits and says so when a balance runs out. */
  function licensed() { return !!session(); }
  function credits() { return me && typeof me.credits === 'number' ? me.credits : null; }
  function aiError(e) {
    var c = e && e.code;
    if (c === 'license') return t('needLicence');
    if (c === 'offline') return t('offline');
    if (c === 'paused') return S.lang === 'es' ? 'La IA de Rosario está en pausa por ahora. Todo lo que funciona en tu teléfono sigue funcionando.' : 'Rosario\u2019s AI is paused for now. Everything that runs on your phone still works.';
    if (c === 'allowance' || c === 'credits') { setTimeout(offerShop, 50); return t('allowance'); }
    if (c === 'voice_plan') return L('Rosario’s natural voice comes with Pro and Luna Max.', 'La voz natural de Rosario viene con Pro y Luna Max.');
    if (c === 'signin') return t('signin_first');
    return (e && e.error) || t('err');
  }
  function ai(task, body) {
    return call('/ai', Object.assign({ task: task, lang: S.lang }, body)).then(function (j) {
      if (me && typeof j.allowance_left_pct === 'number') { me.allowance_left_pct = j.allowance_left_pct; }
      if (me && typeof j.credits === 'number') { me.credits = j.credits; cacheMe(); }
      renderPill();
      setTimeout(function () { reportButton(task, j.result); }, 400);
      return j.result;
    });
  }
  /* Every AI answer can be flagged as offensive, harmful or wrong (Google
     Play's AI-generated content policy). The answer goes to the owner. */
  function reportButton(task, r) {
    if (!r || task === 'intent') return;
    var old = document.getElementById('report-ai'); if (old) old.remove();
    var text = r.speech || r.text || r.summary || r.translation || JSON.stringify(r);
    var box = h('div', { id: 'report-ai', class: 'report-ai' });
    var open = h('button', { class: 'linkbtn', onclick: function () {
      fill(box, h('span', { class: 'small muted' }, L('What’s wrong with this answer?', '¿Qué falla en esta respuesta?')),
        h('div', { class: 'chips' }, [['offensive', L('Offensive', 'Ofensiva')], ['harmful', L('Harmful', 'Dañina')], ['wrong', L('Wrong', 'Incorrecta')], ['other', L('Other', 'Otro')]].map(function (x) {
          return h('button', { class: 'chip', onclick: function () {
            call('/report', { task: task, answer: String(text).slice(0, 4000), reason: x[0] }).then(function () {
              fill(box, h('span', { class: 'small muted' }, L('Thank you. Lunara Society will review it.', 'Gracias. Lunara Society lo revisará.')));
            }).catch(function (e) { say(aiError(e)); });
          } }, x[1]);
        })));
    } }, '⚑ ' + L('Report this answer', 'Denunciar esta respuesta'));
    box.appendChild(open);
    var sc = main.querySelector('section.screen'); if (sc) sc.appendChild(box);
  }
  /* Out of credits: a gentle card, never a wall. */
  function offerShop() {
    if (document.getElementById('shop-offer') || current.name === 'shop') return;
    var card = h('div', { class: 'card screen', id: 'shop-offer', role: 'status' },
      h('b', null, L('You’re out of credits', 'Te has quedado sin créditos')),
      h('p', { class: 'small muted', style: 'margin:0' }, L('Plans start at a few dollars a month. Everything on your phone keeps working for free.', 'Los planes empiezan en unos pocos dólares al mes. Todo lo del teléfono sigue siendo gratis.')),
      h('button', { class: 'btn gold', onclick: function () { card.remove(); go('shop'); } }, L('See plans and credits', 'Ver planes y créditos')));
    var sc = main.querySelector('.screen'); if (sc) sc.appendChild(card);
  }
  function renderPill() {
    var p = document.getElementById('plan');
    if (!p) return;
    p.textContent = me && me.owner ? L('Owner', 'Propietario') : credits() !== null ? '✦ ' + fmt(credits()) : (session() ? '✦ …' : L('Sign in', 'Entrar'));
    p.setAttribute('aria-label', me && me.owner ? L('Owner', 'Propietario') : credits() !== null ? fmt(credits()) + ' ' + L('credits', 'créditos') : L('Sign in', 'Entrar'));
  }

  function loadScript(src) {
    return new Promise(function (res, rej) {
      if (document.querySelector('script[src="' + src + '"]')) return res();
      var s = document.createElement('script'); s.src = src; s.async = true; s.onload = res; s.onerror = function () { rej(new Error('load ' + src)); };
      document.head.appendChild(s);
    });
  }
  function gsi() { return window.google && google.accounts ? Promise.resolve() : loadScript('https://accounts.google.com/gsi/client'); }
  function onGoogle(res) {
    fetch(AUTH + '/google', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id_token: res.credential }) })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (!d || !d.success) throw 0;
        try {
          localStorage.setItem('lunara_session_token', d.session_token);
          localStorage.setItem('lunara_last_active', String(Date.now()));
          localStorage.setItem('lunara_id', d.lunara_id); localStorage.setItem('lunara_name', d.full_name || '');
          localStorage.setItem('lunara_email', d.email || '');
          if (d.expires_at) localStorage.setItem('lunara_expires_at', String(d.expires_at));
        } catch (e) { }
        return refreshMe();
      })
      .then(function () { sayKey('signed_in'); cacheMe(); enter(); })
      .catch(function () { say(t('err')); });
  }

  /* ── screens and navigation ─────────────────────────────────────── */
  var screens = {}, current = { name: 'home' }, cleanup = [];
  function onLeave(fn) { cleanup.push(fn); }
  function go(name, arg, replace) {
    while (cleanup.length) try { cleanup.pop()(); } catch (e) { }
    current = { name: name, arg: arg };
    main.innerHTML = '';
    var el = h('section', { class: 'screen', 'aria-label': name });
    main.appendChild(el);
    (screens[name] || screens.home)(el, arg);
    if (!replace) try { history.pushState({ s: name }, '', name === 'home' ? '#' : '#' + name); } catch (e) { }
    window.scrollTo(0, 0);
    var hd = el.querySelector('h1'); if (hd) { hd.setAttribute('tabindex', '-1'); hd.focus({ preventScroll: true }); }
  }
  window.addEventListener('popstate', function (e) { go((e.state && e.state.s) || 'home', null, true); });
  function head(el, title) {
    add(el, h('div', { class: 'head' },
      h('button', { class: 'iconbtn', 'aria-label': t('back'), onclick: function () { history.length > 1 ? history.back() : go('home'); } }, icon('back')),
      h('h1', null, title)));
  }
  function busy(el, msg) { var b = h('div', { class: 'busy', role: 'status' }, h('div', { class: 'spinner' }), h('span', null, msg || t('working'))); el.appendChild(b); return b; }

  /* ── images and camera ──────────────────────────────────────────── */
  function pickFile(accept, multiple) {
    return new Promise(function (resolve) {
      var i = h('input', { type: 'file', accept: accept, multiple: multiple || null, style: 'display:none' });
      i.onchange = function () { resolve(multiple ? Array.from(i.files) : i.files[0]); i.remove(); };
      document.body.appendChild(i); i.click();
    });
  }
  function fileImage(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () { resolve(img); setTimeout(function () { URL.revokeObjectURL(url); }, 1000); };
      img.onerror = function () { reject(new Error('image')); };
      img.src = url;
    });
  }
  function toCanvas(src, maxSide) {
    var w = src.videoWidth || src.naturalWidth || src.width, hh = src.videoHeight || src.naturalHeight || src.height;
    var sc = maxSide ? Math.min(1, maxSide / Math.max(w, hh)) : 1;
    var c = document.createElement('canvas'); c.width = Math.round(w * sc); c.height = Math.round(hh * sc);
    c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
    return c;
  }
  var forAI = function (src) { return toCanvas(src, 1024).toDataURL('image/jpeg', 0.85); };

  var stream = null;
  function camera(video, facing) {
    stopCamera();
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return Promise.reject(new Error('nocam'));
    return navigator.mediaDevices.getUserMedia({ video: { facingMode: facing || 'environment', width: { ideal: 1920 }, height: { ideal: 1440 } }, audio: false })
      .then(function (s) { stream = s; video.srcObject = s; video.setAttribute('playsinline', ''); video.muted = true; return video.play().then(function () { return s; }); });
  }
  function stopCamera() { if (stream) { stream.getTracks().forEach(function (tr) { tr.stop(); }); stream = null; } }
  function viewer(el) {
    var v = h('video', { 'aria-hidden': 'true', autoplay: true, muted: true, playsinline: true });
    var box = h('div', { class: 'viewer' }, v);
    el.appendChild(box);
    onLeave(stopCamera);
    camera(v).catch(function () { box.replaceWith(h('p', { class: 'note' }, t('noCamera'))); say(t('noCamera')); });
    return { video: v, box: box };
  }
  function shot(el, canvasOrImg) { var s = h('div', { class: 'shot' }, canvasOrImg); el.appendChild(s); return s; }

  /* ── verdicts ───────────────────────────────────────────────────── */
  var VCLASS = { likely_ai: 'v-ai', ai_edited: 'v-ai', declared_ai: 'v-ai', likely_human: 'v-human', uncertain: 'v-unsure', none: 'v-info' };
  function verdictCard(o) {
    var box = h('div', { class: 'verdict ' + (VCLASS[o.verdict] || 'v-info'), role: 'status' },
      h('div', { class: 'src' }, o.deep ? t('deep') : t('localOnly')),
      h('div', { class: 'v' }, t('verdict_' + o.verdict)),
      typeof o.confidence === 'number' ? [h('div', { class: 'meter', 'aria-hidden': 'true' }, h('i', { style: 'width:' + Math.max(4, Math.min(100, o.confidence)) + '%' })),
        h('div', { class: 'small muted' }, t('confidence') + ': ' + o.confidence + '%')] : null,
      o.speech ? h('p', { style: 'margin:.6em 0 0' }, o.speech) : null);
    return box;
  }
  function signalList(findings) {
    var tag = function (p) { return p === 'ai' ? 'AI' : p === 'human' ? (S.lang === 'es' ? 'Real' : 'Real') : 'Info'; };
    return h('ul', { class: 'sig' }, findings.map(function (f) {
      return h('li', { class: f.points_to }, h('b', null, tag(f.points_to)), h('span', null, f.label));
    }));
  }
  function localVerdict(findings, task) {
    var declared = findings.some(function (f) { return f.strength === 'strong' && f.points_to === 'ai'; });
    if (declared) return 'declared_ai';
    // Files can carry provenance; words and voices, once heard, cannot.
    return /detect_(text|audio)/.test(task) ? 'uncertain' : 'none';
  }
  function evidenceText(findings) { return findings.map(function (f) { return '- [' + f.strength + ', points to ' + f.points_to + '] ' + f.label; }).join('\n'); }

  /* Shows the local result, then the deep one if the person has a
     licence. Speaks at each step. */
  function detectFlow(out, task, payload, findings, extraNote) {
    var local = localVerdict(findings, task);
    out.appendChild(verdictCard({ verdict: local }));
    out.appendChild(h('h2', null, t('signals')));
    out.appendChild(signalList(findings));
    if (extraNote) out.appendChild(h('p', { class: 'note' }, extraNote));
    var top = findings[0] ? findings[0].label : '';
    var localSpeech = t('verdict_' + local) + '. ' + top + '.';
    if (!licensed()) {
      say(localSpeech + ' ' + (session() ? t('needLicence') : t('needLicence')));
      out.appendChild(h('div', { class: 'row' }, h('button', { class: 'btn gold', onclick: function () { go('account'); } }, t('buy_app'))));
      return Promise.resolve();
    }
    say(localSpeech + ' ' + t('analysing'));
    var b = busy(out, t('analysing'));
    return ai(task, Object.assign({ evidence: evidenceText(findings) }, payload)).then(function (r) {
      b.remove();
      var deep = h('div', { class: 'screen' },
        verdictCard({ verdict: r.verdict, confidence: r.confidence, speech: r.speech, deep: true }),
        h('h2', null, t('signals')), signalList(r.signals || []),
        h('h2', null, t('advice')), h('p', null, r.advice),
        h('p', { class: 'note' }, t('honest')));
      out.insertBefore(deep, out.firstChild);
      say(r.speech + ' ' + r.advice);
      buzz([30, 60, 30]);
    }).catch(function (e) { b.remove(); var m = aiError(e); out.appendChild(h('p', { class: 'note' }, m)); say(m); });
  }

  /* ── home ───────────────────────────────────────────────────────── */
  function tile(name, key, ic, hero, sub) {
    return h('button', { class: 'tile' + (hero ? ' hero' : ''), onclick: function () { buzz(); go(name); } }, icon(ic), h('span', null, TX.en[key] !== undefined ? t(key) : key, sub ? h('small', null, sub) : null));
  }
  /* Rosario's conversation, kept for the session so she has context. */
  var convo = [];
  window.RosarioLog = function (role, text) {
    convo.push({ role: role, text: String(text), at: Date.now() });
    if (convo.length > 40) convo.shift();
    var box = document.getElementById('convo'); if (box) drawConvo(box);
  };
  function drawConvo(box) {
    fill(box, convo.slice(-4).map(function (m) { return h('div', { class: 'bubble' + (m.role === 'user' ? ' me' : '') }, m.text); }));
  }
  function orb() {
    var c = h('canvas', { class: 'orb-rings', width: 520, height: 520, 'aria-hidden': 'true' });
    var wrap = h('button', { class: 'orb', id: 'orb', 'aria-label': t('tapToTalk'), onclick: function () { onMic(); } },
      c, h('img', { src: 'rosario.jpg', alt: 'Rosario' }));
    var x = c.getContext('2d'), raf;
    (function draw() {
      var lv = voiceLevel(), lis = micBtn.classList.contains('on'), t0 = Date.now() / 1000;
      x.clearRect(0, 0, 520, 520);
      for (var i = 0; i < 3; i++) {
        var r = 188 + i * 22 + lv * (26 + i * 18) + (lis ? Math.sin(t0 * 3 + i) * 6 : Math.sin(t0 * 0.8 + i) * 2);
        x.beginPath(); x.arc(260, 260, r, 0, Math.PI * 2);
        x.strokeStyle = 'rgba(' + (i === 0 ? '244,225,171' : '226,196,122') + ',' + (0.55 - i * 0.15 + lv * 0.4) + ')';
        x.lineWidth = i === 0 ? 2.2 : 1.2; x.shadowColor = 'rgba(226,196,122,.8)'; x.shadowBlur = 18 * (0.4 + lv); x.stroke();
      }
      // a slow orbiting spark
      var ang = t0 * 0.6, sr = 200;
      x.beginPath(); x.arc(260 + Math.cos(ang) * sr, 260 + Math.sin(ang) * sr, 3.2, 0, 7); x.fillStyle = '#F6E3AE'; x.shadowBlur = 20; x.fill();
      raf = requestAnimationFrame(draw);
    })();
    onLeave(function () { cancelAnimationFrame(raf); });
    return wrap;
  }
  /* Inside the installed Android app the page is opened by the app itself. */
  function inAndroidApp() {
    try { if (/^android-app:\/\//.test(document.referrer)) sessionStorage.setItem('lens_twa', '1'); return sessionStorage.getItem('lens_twa') === '1'; } catch (e) { return false; }
  }
  screens.home = function (el) {
    var box = h('div', { class: 'convo', id: 'convo', 'aria-live': 'polite' });
    var hf = h('input', { type: 'checkbox', id: 'hf', checked: S.handsFree || null, onchange: function () { S.handsFree = hf.checked; saveSettings(); wake(S.handsFree); sayKey(S.handsFree ? 'wake_on' : 'wake_off'); } });
    add(el, [
      h('div', { class: 'hero' },
        orb(),
        h('h1', { class: 'rname' }, 'Rosario'),
        h('p', { class: 'rsub' }, (me && me.owner) ? t('owner_badge') : t('rosario_sub')),
        box,
        h('div', { class: 'chips center' }, t('suggest').map(function (q) { return h('button', { class: 'chip', onclick: function () { handle(q); } }, q); })),
        h('label', { class: 'switch hf', for: 'hf' }, h('span', null, t('handsFree'), h('small', null, t('handsFreeHint'))), hf),
        modeSwitch(),
        me && !me.owner && credits() !== null ? h('button', { class: 'chip credits-chip', onclick: function () { go('shop'); } }, '✦ ' + fmt(credits()) + ' ' + L('credits', 'créditos') + ' · ' + ((cat().tiers[me.tier] || {}).label || '')) : null,
        inAndroidApp() ? null : h('a', { class: 'btn gold', href: 'get.html', style: 'margin-top:14px' }, icon('files'), S.lang === 'es' ? 'Descargar la app de Android' : 'Download the Android app')),
      h('h2', null, L('Your assistant', 'Tu asistente') + ' · ' + (S.mode === 'work' ? L('at work', 'en el trabajo') : L('at home', 'en casa'))),
      h('div', { class: 'grid' },
        tile('talk', L('Talk with Rosario', 'Habla con Rosario'), 'converse', true, L('Hands-free conversation: ask, plan, remember', 'Conversación sin manos: pregunta, planifica, recuerda')),
        tile('briefing', L('My day', 'Mi día'), 'briefing'), tile('lists', L('Lists', 'Listas'), 'text'), tile('memory', L('Memory', 'Memoria'), 'remember'),
        tile('write', L('Write for me', 'Escribe por mí'), 'replies'), tile('summarize', 't_summ', 'summarize'), tile('coach', L('Scam coach', 'Antiestafas'), 'safeword'),
        tile('reminders', 't_remind', 'reminders')),
      h('h2', null, t('g_real')),
      h('div', { class: 'grid' },
        tile('photo', 't_photo', 'photo', true, S.lang === 'es' ? 'Fotos, capturas y archivos del teléfono' : 'Photos, screenshots and files on your phone'),
        tile('scan', 't_scan', 'scan'), tile('video', 't_video', 'video'), tile('voice', 't_voice', 'voice'),
        tile('text', 't_text', 'text'), tile('scam', 't_scam', 'scam'), tile('link', 't_link', 'link'), tile('qr', 't_qr', 'qr')),
      h('h2', null, t('g_protect2')),
      h('div', { class: 'grid' }, tile('mark', 't_mark', 'mark'), tile('verify', 't_verify', 'verify'), tile('safeword', 't_safeword', 'safeword'), tile('emergency', 't_emergency', 'emergency')),
      h('h2', null, t('g_see')),
      h('div', { class: 'grid' }, tile('describe', 't_describe', 'eye'), tile('read', 't_read', 'read'), tile('magnify', 't_magnify', 'magnify'), tile('color', 't_color', 'color'), tile('remember', 't_remember', 'remember')),
      h('h2', null, t('g_talk')),
      h('div', { class: 'grid' }, tile('converse', 't_converse', 'converse', true, S.lang === 'es' ? 'Habla con cualquiera, en inglés o español' : 'Talk with anyone, in English or Spanish'), tile('translate', 't_translate', 'translate'), tile('replies', 't_replies', 'replies')),
      h('h2', null, t('g_daily')),
      h('div', { class: 'grid' }, tile('files', 't_files', 'files'), tile('calm', 't_calm', 'calm'), tile('card', 't_card', 'card'), tile('shop', L('Credits', 'Créditos'), 'mark'), tile('account', 't_account', 'account'),
        me && me.owner ? tile('owner', 't_owner', 'owner') : null)
    ]);
    drawConvo(box);
  };

  /* ── is it real: photo ──────────────────────────────────────────── */
  function analyseImageFile(el, file) {
    var out = h('div', { class: 'screen' }); el.appendChild(out);
    var b = busy(out, t('scanning'));
    say(t('scanning'));
    Promise.all([file.arrayBuffer(), fileImage(file)]).then(function (r) {
      var bytes = new Uint8Array(r[0]), img = r[1];
      var scan = FX.scanFile(bytes, file.name, file.type);
      var full = toCanvas(img, 4096);
      var markP = markLookup(full);
      var elaP = /jpe?g/i.test(file.type || scan.facts.format || '') ? FX.ela(toCanvas(img, 1600), 0.9) : Promise.resolve(null);
      return Promise.all([markP, elaP]).then(function (x) {
        b.remove();
        var findings = scan.findings.slice(), mark = x[0], el2 = x[1];
        if (mark) findings.unshift(mark.finding);
        if (el2) findings = findings.concat(FX.elaFindings(el2));
        var pic = toCanvas(img, 1400), s = shot(out, pic);
        if (el2) {
          var showing = false;
          out.appendChild(h('div', { class: 'row' }, h('button', { class: 'btn ghost', onclick: function (e) { showing = !showing; fill(s, showing ? el2.canvas : pic); e.target.textContent = showing ? t('hideEla') : t('showEla'); } }, t('showEla'))));
        }
        return detectFlow(out, 'detect_image', { images: [forAI(img)] }, findings);
      });
    }).catch(function () { b.remove(); say(t('err')); });
  }
  function markLookup(canvas) {
    var d = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
    var r = MK.detect(d);
    if (!r.found) return Promise.resolve(null);
    return fetchT(API + '/mark/' + r.id, null, 10000).then(function (x) { return x.json(); }).then(function (m) {
      if (!m.found) return { id: r.id, record: null, finding: FX.F(t('mark_unknown'), 'weak', 'neither') };
      var when = new Date(m.registered_at).toLocaleDateString(S.lang === 'es' ? 'es-ES' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
      var label = m.revoked ? t('mark_revoked') : t('mark_found') + ' ' + t('mark_owner_is') + ' ' + m.owner_name + ', ' + t('mark_on') + ' ' + when + '.';
      return { id: r.id, record: m, when: when, finding: FX.F(label, 'strong', 'neither') };
    }).catch(function () { return { id: r.id, record: null, finding: FX.F(t('mark_found') + ' ' + r.id, 'moderate', 'neither') }; });
  }
  screens.photo = function (el) {
    head(el, t('t_photo'));
    el.appendChild(h('p', { class: 'lede' }, S.lang === 'es' ? 'Elige una foto o captura. Primero se revisa en tu teléfono; después, si tienes licencia, a fondo.' : 'Choose a photo or screenshot. It is checked on your phone first, then in depth if you have a licence.'));
    var btn = h('button', { class: 'btn gold', onclick: function () { pickFile('image/*').then(function (f) { if (f) { btn.remove(); analyseImageFile(el, f); } }); } }, icon('photo'), t('pick'));
    el.appendChild(h('div', { class: 'row' }, btn));
  };

  /* ── is it real: camera scan (a screen, a print) ───────────────── */
  screens.scan = function (el) {
    head(el, t('t_scan'));
    el.appendChild(h('p', { class: 'lede' }, S.lang === 'es' ? 'Apunta a una pantalla, un cartel o una foto impresa. La cámara no ve los datos del archivo, así que solo cuenta lo visual.' : 'Point at a screen, a poster or a printed photo. The camera cannot see file data, so only what is visible counts.'));
    var cam = viewer(el), out = h('div', { class: 'screen' });
    el.appendChild(h('div', { class: 'row' }, h('button', { class: 'btn gold', onclick: function () {
      buzz(); var c = toCanvas(cam.video, 1600); stopCamera(); cam.box.replaceWith(h('div', { class: 'shot' }, c));
      this.remove(); el.appendChild(out);
      var findings = [FX.F(S.lang === 'es' ? 'Capturado con la cámara: no hay datos de archivo que revisar.' : 'Captured with the camera: there is no file data to check.', 'strong', 'neither')];
      markLookup(c).then(function (m) { if (m) findings.unshift(m.finding); detectFlow(out, 'detect_image', { images: [forAI(c)] }, findings); });
    } }, icon('scan'), t('capture'))));
  };

  /* ── is it real: video ──────────────────────────────────────────── */
  screens.video = function (el) {
    head(el, t('t_video'));
    el.appendChild(h('p', { class: 'lede' }, t('videoHint')));
    var btn = h('button', { class: 'btn gold', onclick: function () {
      pickFile('video/*').then(function (f) {
        if (!f) return; btn.remove();
        var out = h('div', { class: 'screen' }); el.appendChild(out);
        var b = busy(out, t('scanning')); say(t('scanning'));
        var headB = f.slice(0, 262144).arrayBuffer(), tailB = f.slice(Math.max(0, f.size - 131072)).arrayBuffer();
        Promise.all([headB, tailB, FX.videoFrames(f, 6, 768)]).then(function (r) {
          var joined = new Uint8Array(r[0].byteLength + r[1].byteLength); joined.set(new Uint8Array(r[0]), 0); joined.set(new Uint8Array(r[1]), r[0].byteLength);
          var scan = FX.scanFile(joined, f.name, f.type), frames = r[2];
          b.remove();
          var strip = h('div', { class: 'files' }, frames.frames.map(function (u) { return h('div', { class: 'file' }, h('img', { src: u, alt: '' })); }));
          out.appendChild(strip);
          var findings = scan.findings.concat([FX.F((S.lang === 'es' ? 'Duración ' : 'Length ') + Math.round(frames.duration) + ' s, ' + frames.width + '×' + frames.height, 'weak', 'neither')]);
          detectFlow(out, 'detect_frames', { images: frames.frames }, findings);
        }).catch(function (e) { b.remove(); say(e.message || t('err')); });
      });
    } }, icon('video'), t('pick'));
    el.appendChild(h('div', { class: 'row' }, btn));
  };

  /* ── is it real: voice ──────────────────────────────────────────── */
  screens.voice = function (el) {
    head(el, t('t_voice'));
    el.appendChild(h('p', { class: 'lede' }, t('recHint')));
    el.appendChild(h('p', { class: 'note' }, t('voiceCaveat')));
    var said = h('textarea', { id: 'said', placeholder: t('whatWasSaid'), 'aria-label': t('whatWasSaid'), style: 'min-height:90px' });
    var out = h('div', { class: 'screen' }), timer = h('span', { class: 'muted' }, '');
    var rec = null, chunks = [], t0 = 0, tick;
    var recBtn = h('button', { class: 'btn gold', onclick: function () {
      if (rec) { rec.stop(); return; }
      navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } }).then(function (s) {
        chunks = []; rec = new MediaRecorder(s);
        rec.ondataavailable = function (e) { chunks.push(e.data); };
        rec.onstop = function () { s.getTracks().forEach(function (x) { x.stop(); }); clearInterval(tick); rec = null; recBtn.lastChild.textContent = t('rec'); analyse(new Blob(chunks, { type: chunks[0] && chunks[0].type || 'audio/webm' }), 'recording.webm'); };
        rec.start(); t0 = Date.now(); buzz(); recBtn.lastChild.textContent = t('recStop');
        tick = setInterval(function () { timer.textContent = t('recording') + ' ' + Math.round((Date.now() - t0) / 1000) + ' s'; }, 250);
        onLeave(function () { if (rec) try { rec.stop(); } catch (e) { } });
      }).catch(function () { say(t('noMic')); });
    } }, icon('voice'), h('span', null, t('rec')));
    var fileBtn = h('button', { class: 'btn', onclick: function () { pickFile('audio/*,video/*').then(function (f) { if (f) analyse(f, f.name); }); } }, t('pick'));
    add(el, [h('div', { class: 'row' }, recBtn, fileBtn), timer, said, out]);
    function analyse(blob, name) {
      out.innerHTML = ''; var b = busy(out, t('scanning')); say(t('scanning'));
      blob.arrayBuffer().then(function (buf) {
        var scan = FX.scanFile(new Uint8Array(buf.slice(0)), name, blob.type);
        var AC = window.AudioContext || window.webkitAudioContext, ac = new AC();
        return ac.decodeAudioData(buf).then(function (ab) {
          var ch = ab.getChannelData(0), mono = ch;
          if (ab.numberOfChannels > 1) { var c2 = ab.getChannelData(1); mono = new Float32Array(ch.length); for (var i = 0; i < ch.length; i++) mono[i] = (ch[i] + c2[i]) / 2; }
          var maxS = ab.sampleRate * 60; if (mono.length > maxS) mono = mono.subarray(0, maxS);
          var st = FX.audioStats(mono, ab.sampleRate);
          ac.close && ac.close();
          b.remove();
          var fileFindings = scan.findings.filter(function (f) { return f.strength !== 'weak'; });
          var findings = fileFindings.concat(st.findings);
          var ev = { measurements: Object.assign({}, st, { findings: undefined }) };
          detectFlow(out, 'detect_audio', { text: said.value.trim() || undefined, context: JSON.stringify(ev.measurements) }, findings, t('voiceCaveat'));
        });
      }).catch(function () { b.remove(); say(t('err')); });
    }
  };

  /* ── is it real: text, and scams ───────────────────────────────── */
  function textScreen(el, title, task) {
    head(el, title);
    var ta = h('textarea', { id: 'txt-' + task, placeholder: t('textPlaceholder'), 'aria-label': t('textPlaceholder') });
    var out = h('div', { class: 'screen' }), image = null;
    var thumb = h('div');
    add(el, [ta, thumb,
      h('div', { class: 'row' },
        h('button', { class: 'btn', onclick: function () { listen().then(function (x) { if (x) { ta.value += (ta.value ? ' ' : '') + x; say(t('heard') + x); } }).catch(function () { say(t('noSpeech')); }); } }, icon('mic'), t('dictate')),
        h('button', { class: 'btn', onclick: function () { pickFile('image/*').then(function (f) { if (!f) return; fileImage(f).then(function (img) { image = forAI(img); fill(thumb, shot(h('div'), toCanvas(img, 900))); }); }); } }, icon('photo'), S.lang === 'es' ? 'Captura de pantalla' : 'Screenshot')),
      h('button', { class: 'btn gold', onclick: function () {
        var txt = ta.value.trim();
        if (!txt && !image) { say(t('textPlaceholder')); return; }
        out.innerHTML = '';
        if (task === 'scam') return scamFlow(out, txt, image);
        var st = FX.textStats(txt, S.lang);
        detectFlow(out, 'detect_text', { text: txt, images: image ? [image] : undefined }, st.findings);
      } }, t('check')), out]);
  }
  function scamFlow(out, txt, image) {
    if (!licensed()) { var m = t('needLicence'); out.appendChild(h('p', { class: 'note' }, m)); say(m); return; }
    var b = busy(out, t('analysing')); say(t('analysing'));
    ai('scam', { text: txt || undefined, images: image ? [image] : undefined }).then(function (r) {
      b.remove();
      var v = { high: 'likely_ai', medium: 'uncertain', low: 'likely_human' }[r.risk];
      var card = verdictCard({ verdict: v, speech: r.speech, deep: true });
      card.querySelector('.v').textContent = { high: S.lang === 'es' ? 'Riesgo alto de estafa' : 'High scam risk', medium: S.lang === 'es' ? 'Riesgo medio' : 'Some risk', low: S.lang === 'es' ? 'Riesgo bajo' : 'Low risk' }[r.risk];
      add(out, [card, h('h2', null, t('signals')), signalList((r.reasons || []).map(function (x) { return FX.F(x, 'moderate', r.risk === 'low' ? 'neither' : 'ai'); })), h('h2', null, t('advice')), h('p', null, r.advice)]);
      say(r.speech + ' ' + r.advice); buzz(r.risk === 'high' ? [80, 60, 80, 60, 80] : 30);
    }).catch(function (e) { b.remove(); var m = aiError(e); out.appendChild(h('p', { class: 'note' }, m)); say(m); });
  }
  screens.text = function (el) { textScreen(el, t('t_text'), 'detect_text'); };
  screens.scam = function (el) { textScreen(el, t('t_scam'), 'scam'); };

  /* ── who owns this ──────────────────────────────────────────────── */
  screens.verify = function (el) {
    head(el, t('t_verify'));
    el.appendChild(h('p', { class: 'lede' }, t('verify_hint')));
    var out = h('div', { class: 'screen' });
    add(el, [h('div', { class: 'row' }, h('button', { class: 'btn gold', onclick: function () {
      pickFile('image/*').then(function (f) {
        if (!f) return; out.innerHTML = ''; var b = busy(out, t('scanning')); say(t('scanning'));
        Promise.all([f.arrayBuffer(), fileImage(f)]).then(function (r) {
          var scan = FX.scanFile(new Uint8Array(r[0]), f.name, f.type), c = toCanvas(r[1], 4096);
          return markLookup(c).then(function (m) {
            b.remove(); shot(out, toCanvas(r[1], 1200));
            if (m && m.record) {
              var rec = m.record;
              add(out, [h('div', { class: 'verdict ' + (rec.revoked ? 'v-ai' : 'v-human') }, h('div', { class: 'src' }, 'Lunara Mark ' + rec.id), h('div', { class: 'v' }, rec.revoked ? t('mark_revoked') : rec.owner_name),
                h('p', null, (rec.title ? '“' + rec.title + '” · ' : '') + t('mark_on') + ' ' + m.when)),
                h('a', { class: 'btn', href: 'verify.html#' + rec.id, target: '_blank', rel: 'noopener' }, S.lang === 'es' ? 'Ver el registro público' : 'Open the public record')]);
              say(m.finding.label);
            } else {
              var xm = scan.facts.lunaraMark ? ' ' + (S.lang === 'es' ? 'Los metadatos nombran la marca ' : 'The metadata names mark ') + scan.facts.lunaraMark + '.' : '';
              var msg = (m ? t('mark_unknown') : t('mark_none')) + xm;
              out.appendChild(h('div', { class: 'verdict v-info' }, h('div', { class: 'v' }, msg)));
              say(msg);
            }
          });
        }).catch(function () { b.remove(); say(t('err')); });
      });
    } }, icon('verify'), t('pick'))), out]);
  };

  /* ── Lunara Mark ────────────────────────────────────────────────── */
  function sha256(buf) { return crypto.subtle.digest('SHA-256', buf).then(function (d) { return Array.from(new Uint8Array(d), function (x) { return x.toString(16).padStart(2, '0'); }).join(''); }); }
  screens.mark = function (el) {
    head(el, t('t_mark'));
    add(el, [h('p', { class: 'lede' }, t('mark_intro')), h('p', { class: 'note' }, t('mark_limits'))]);
    if (!session() || !licensed()) {
      el.appendChild(h('button', { class: 'btn gold', onclick: function () { go('account'); } }, session() ? t('buy_app') : (S.lang === 'es' ? 'Iniciar sesión' : 'Sign in')));
      say(t('mark_intro'));
      return;
    }
    var owner = h('input', { type: 'text', id: 'mk-owner', value: raw('lunara_name') || '', autocomplete: 'name' });
    var title = h('input', { type: 'text', id: 'mk-title' });
    var file = null, prev = h('div'), out = h('div', { class: 'screen' });
    var go1 = h('button', { class: 'btn gold', disabled: true, onclick: make }, icon('mark'), t('mark_make'));
    add(el, [h('button', { class: 'btn', onclick: function () { pickFile('image/*').then(function (f) { if (!f) return; file = f; go1.disabled = false; fileImage(f).then(function (img) { fill(prev, shot(h('div'), toCanvas(img, 1000))); }); }); } }, icon('photo'), t('pick')),
      prev, h('label', { class: 'f' }, t('mark_owner'), owner), h('label', { class: 'f' }, t('mark_title'), title), go1, out]);
    function make() {
      if (!file || !owner.value.trim()) { say(t('mark_owner')); return; }
      go1.disabled = true; out.innerHTML = ''; var b = busy(out, t('working')); say(t('working'));
      var img;
      Promise.all([file.arrayBuffer(), fileImage(file)]).then(function (r) {
        img = r[1]; return sha256(r[0]);
      }).then(function (hex) {
        return call('/mark', { sha256: hex, owner_name: owner.value.trim(), title: title.value.trim() });
      }).then(function (reg) {
        var c = toCanvas(img, 4096), ctx = c.getContext('2d'), d = ctx.getImageData(0, 0, c.width, c.height);
        MK.embed(d, reg.id); ctx.putImageData(d, 0, 0);
        return new Promise(function (res) { c.toBlob(res, 'image/jpeg', 0.95); }).then(function (blob) { return blob.arrayBuffer(); }).then(function (ab) {
          var bytes = MK.withXmp(new Uint8Array(ab), reg.id, reg.owner_name);
          var out2 = new Blob([bytes], { type: 'image/jpeg' });
          var check = MK.detect(ctx.getImageData(0, 0, c.width, c.height), { quick: true });
          b.remove();
          var name = (file.name.replace(/\.[^.]+$/, '') || 'photo') + '-lunara-' + reg.id + '.jpg';
          var url = URL.createObjectURL(out2);
          add(out, [h('div', { class: 'verdict v-human' }, h('div', { class: 'src' }, 'Lunara Mark ' + reg.id), h('div', { class: 'v' }, reg.owner_name), h('p', null, t('mark_done'))),
            h('div', { class: 'row' },
              h('a', { class: 'btn gold', href: url, download: name }, t('download')),
              navigator.canShare && navigator.canShare({ files: [new File([out2], name, { type: 'image/jpeg' })] }) ? h('button', { class: 'btn', onclick: function () { navigator.share({ files: [new File([out2], name, { type: 'image/jpeg' })], title: name }).catch(function () { }); } }, t('share')) : null,
              h('button', { class: 'btn', onclick: function () { Files.add({ name: name, type: 'image/jpeg', blob: out2, folder: 'Lunara Marks' }).then(function () { say(t('saved')); }); } }, t('save'))),
            h('p', { class: 'small muted' }, (S.lang === 'es' ? 'Registro público: ' : 'Public record: ') + reg.verify_url)]);
          say(t('mark_done') + (check.found ? '' : ''));
          buzz([30, 50, 30]);
        });
      }).catch(function (e) { b.remove(); go1.disabled = false; var m = aiError(e); out.appendChild(h('p', { class: 'note' }, m)); say(m); });
    }
  };

  /* ── see: describe ──────────────────────────────────────────────── */
  screens.describe = function (el) {
    head(el, t('t_describe'));
    el.appendChild(h('p', { class: 'lede' }, t('describe_hint')));
    var cam = viewer(el), out = h('div', { class: 'screen' }), auto = null, inflight = false;
    function run(src) {
      if (!licensed()) { var m = t('needLicence'); fill(out, h('p', { class: 'note' }, m)); say(m); return; }
      if (inflight) return; inflight = true;
      var b = busy(out, t('working'));
      ai('describe', { images: [forAI(src)] }).then(function (r) {
        inflight = false; b.remove();
        fill(out, h('div', { class: 'verdict v-info' }, h('p', { style: 'margin:0;font-size:1.1em' }, r.speech)),
          r.hazards && r.hazards.length ? h('ul', { class: 'sig' }, r.hazards.map(function (x) { return h('li', { class: 'ai' }, h('b', null, '!'), h('span', null, x)); })) : null,
          r.text_found ? h('p', { class: 'note' }, r.text_found) : null);
        say(r.speech + (r.hazards && r.hazards.length ? ' ' + r.hazards.join('. ') : ''));
      }).catch(function (e) { inflight = false; b.remove(); var m = aiError(e); say(m); if (auto) { clearInterval(auto); auto = null; } });
    }
    var autoBtn = h('button', { class: 'btn', onclick: function () {
      if (auto) { clearInterval(auto); auto = null; autoBtn.textContent = t('auto'); say(S.lang === 'es' ? 'Modo guía desactivado.' : 'Guide mode off.'); return; }
      if (!licensed()) return run(cam.video);
      say(t('autoOn')); autoBtn.textContent = t('stop');
      run(cam.video); auto = setInterval(function () { if (!speechSynthesis.speaking) run(cam.video); }, 10000);
    } }, t('auto'));
    onLeave(function () { if (auto) clearInterval(auto); });
    add(el, [h('div', { class: 'row' },
      h('button', { class: 'btn gold', onclick: function () { buzz(); say(t('working'), null, { silentToast: true }); run(cam.video); } }, icon('eye'), t('capture')),
      h('button', { class: 'btn', onclick: function () { pickFile('image/*').then(function (f) { if (f) fileImage(f).then(run); }); } }, t('pick'))),
      autoBtn, out]);
  };

  /* ── see: read text aloud ───────────────────────────────────────── */
  var ocrWorker = null;
  function ocr(canvas) {
    var ready = window.Tesseract ? Promise.resolve() : loadScript('https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js');
    return ready.then(function () {
      if (!ocrWorker) ocrWorker = Tesseract.createWorker(S.lang === 'es' ? 'spa+eng' : 'eng+spa');
      return ocrWorker;
    }).then(function (w) { return w.recognize(canvas); }).then(function (r) { return (r.data && r.data.text || '').replace(/[ \t]+/g, ' ').replace(/\n{2,}/g, '\n').trim(); });
  }
  screens.read = function (el) {
    head(el, t('t_read'));
    var cam = viewer(el), out = h('div', { class: 'screen' }), lastCanvas = null;
    function readLocal(c) {
      lastCanvas = c; out.innerHTML = ''; var b = busy(out, t('read_local')); say(t('read_local'), null, { silentToast: true });
      ocr(c).then(function (txt) {
        b.remove();
        if (!txt || txt.length < 3) { say(t('read_none')); out.appendChild(h('p', { class: 'note' }, t('read_none'))); }
        else { out.appendChild(h('div', { class: 'card', style: 'white-space:pre-wrap' }, txt)); say(txt); }
        if (licensed()) out.appendChild(h('button', { class: 'btn', onclick: readAI }, t('read_ai')));
      }).catch(function () { b.remove(); if (licensed()) readAI(); else say(t('err')); });
    }
    function readAI() {
      var b = busy(out, t('working'));
      ai('read', { images: [toCanvas(lastCanvas, 1600).toDataURL('image/jpeg', 0.88)] }).then(function (r) {
        b.remove(); fill(out, h('div', { class: 'card', style: 'white-space:pre-wrap' }, r.text_found || r.speech)); say(r.speech || t('read_none'));
      }).catch(function (e) { b.remove(); say(aiError(e)); });
    }
    add(el, [h('div', { class: 'row' },
      h('button', { class: 'btn gold', onclick: function () { buzz(); readLocal(toCanvas(cam.video, 2000)); } }, icon('read'), t('capture')),
      h('button', { class: 'btn', onclick: function () { pickFile('image/*').then(function (f) { if (f) fileImage(f).then(function (i) { readLocal(toCanvas(i, 2400)); }); }); } }, t('pick'))), out]);
  };

  /* ── see: magnifier ─────────────────────────────────────────────── */
  screens.magnify = function (el) {
    head(el, t('t_magnify'));
    var cam = viewer(el), zoom = 1, contrast = false, invert = false, torch = false, frozen = false;
    cam.box.style.aspectRatio = '3/4';
    function apply() {
      var track = stream && stream.getVideoTracks()[0], caps = track && track.getCapabilities ? track.getCapabilities() : {};
      if (caps.zoom) { try { track.applyConstraints({ advanced: [{ zoom: Math.min(caps.zoom.max, caps.zoom.min + (zoom - 1) * (caps.zoom.max - caps.zoom.min) / 7) }] }); } catch (e) { } cam.video.style.transform = ''; }
      else cam.video.style.transform = 'scale(' + zoom + ')';
      cam.video.style.filter = (contrast ? 'contrast(1.9) brightness(1.1) ' : '') + (invert ? 'invert(1) hue-rotate(180deg)' : '');
    }
    var z = h('input', { type: 'range', min: 1, max: 8, step: 0.1, value: 1, 'aria-label': t('mag_zoom'), style: 'width:100%', oninput: function () { zoom = +z.value; apply(); } });
    function toggle(label, fn) { var b = h('button', { class: 'chip', 'aria-pressed': 'false', onclick: function () { var on = fn(); b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); buzz(); } }, label); return b; }
    add(el, [h('label', { class: 'f' }, t('mag_zoom'), z), h('div', { class: 'chips' },
      toggle(t('mag_contrast'), function () { contrast = !contrast; apply(); return contrast; }),
      toggle(t('mag_invert'), function () { invert = !invert; apply(); return invert; }),
      toggle(t('mag_light'), function () { torch = !torch; var tr = stream && stream.getVideoTracks()[0]; try { tr.applyConstraints({ advanced: [{ torch: torch }] }); } catch (e) { } return torch; }),
      toggle(t('mag_freeze'), function () { frozen = !frozen; frozen ? cam.video.pause() : cam.video.play(); return frozen; }))]);
    say(t('t_magnify'), null, { silentToast: true });
  };

  /* ── see: colour finder ─────────────────────────────────────────── */
  var COLORS = { en: ['red', 'orange', 'yellow', 'lime green', 'green', 'teal', 'cyan', 'sky blue', 'blue', 'purple', 'magenta', 'pink'], es: ['rojo', 'naranja', 'amarillo', 'verde lima', 'verde', 'verde azulado', 'cian', 'azul cielo', 'azul', 'morado', 'magenta', 'rosa'] };
  function colorName(r, g, b) {
    var mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 510, d = mx - mn, s = d === 0 ? 0 : d / (255 - Math.abs(mx + mn - 255));
    var es = S.lang === 'es';
    if (s < 0.14 || d < 18) return l > 0.9 ? (es ? 'blanco' : 'white') : l < 0.12 ? (es ? 'negro' : 'black') : l > 0.65 ? (es ? 'gris claro' : 'light grey') : l < 0.35 ? (es ? 'gris oscuro' : 'dark grey') : (es ? 'gris' : 'grey');
    var hdeg = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; hdeg = (hdeg * 60 + 360) % 360;
    if (hdeg >= 15 && hdeg < 45 && l < 0.45) return es ? 'marrón' : 'brown';
    if (hdeg >= 330 || hdeg < 15) { if (l > 0.7) return es ? 'rosa' : 'pink'; }
    var idx = Math.round(hdeg / 30) % 12, name = COLORS[es ? 'es' : 'en'][idx];
    var shade = l < 0.28 ? (es ? ' oscuro' : 'dark ') : l > 0.72 ? (es ? ' claro' : 'light ') : '';
    return es ? name + shade : shade + name;
  }
  screens.color = function (el) {
    head(el, t('t_color'));
    el.appendChild(h('p', { class: 'lede' }, t('color_hint')));
    var cam = viewer(el), sw = h('div', { class: 'swatch' }, h('i'), h('span', null, '…'));
    cam.box.appendChild(h('div', { class: 'reticle' })); cam.box.appendChild(sw);
    var c = document.createElement('canvas'); c.width = c.height = 12;
    var last = '', stable = 0, spoken = '';
    var iv = setInterval(function () {
      var v = cam.video; if (!v.videoWidth) return;
      var s = Math.min(v.videoWidth, v.videoHeight) * 0.06;
      c.getContext('2d').drawImage(v, v.videoWidth / 2 - s / 2, v.videoHeight / 2 - s / 2, s, s, 0, 0, 12, 12);
      var d = c.getContext('2d').getImageData(0, 0, 12, 12).data, r = 0, g = 0, b = 0;
      for (var i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; }
      r /= 144; g /= 144; b /= 144;
      var n = colorName(r, g, b);
      sw.firstChild.style.background = 'rgb(' + (r | 0) + ',' + (g | 0) + ',' + (b | 0) + ')';
      sw.lastChild.textContent = n;
      if (n === last) stable++; else { last = n; stable = 0; }
      if (stable === 4 && n !== spoken) { spoken = n; say(n, null, { silentToast: true }); }
    }, 250);
    onLeave(function () { clearInterval(iv); });
  };

  /* ── talk: translate ────────────────────────────────────────────── */
  function langSelect(id, val) {
    var s = h('select', { id: id }, ['en', 'es'].map(function (l) { return h('option', { value: l, selected: l === val || null }, langName(l)); }));
    return s;
  }
  screens.translate = function (el, arg) {
    head(el, t('t_translate'));
    var to = langSelect('tr-to', (arg && arg.to) || other(S.lang));
    var ta = h('textarea', { id: 'tr-text', placeholder: t('textPlaceholder'), 'aria-label': t('textPlaceholder') }, (arg && arg.text) || '');
    var out = h('div', { class: 'screen' }), img = null, thumb = h('div');
    function run() {
      if (!licensed()) { var m = t('needLicence'); fill(out, h('p', { class: 'note' }, m)); say(m); return; }
      if (!ta.value.trim() && !img) return;
      var b = busy(out, t('working'));
      ai('translate', { text: ta.value.trim() || undefined, images: img ? [img] : undefined, target: to.value }).then(function (r) {
        b.remove();
        fill(out, h('div', { class: 'card' }, h('div', { class: 'small muted' }, r.source_language + ' → ' + langName(to.value)), h('p', { style: 'font-size:1.3em;margin:.3em 0 0' }, r.translation)),
          h('button', { class: 'btn', onclick: function () { say(r.speech, to.value); } }, icon('speak'), t('tr_speak')));
        say(r.speech, to.value);
      }).catch(function (e) { b.remove(); say(aiError(e)); });
    }
    add(el, [h('label', { class: 'f' }, t('tr_to'), to), ta, thumb, h('div', { class: 'row' },
      h('button', { class: 'btn', onclick: function () { listen(other(to.value)).then(function (x) { if (x) { ta.value = x; run(); } }).catch(function () { say(t('noSpeech')); }); } }, icon('mic'), t('dictate')),
      h('button', { class: 'btn', onclick: function () { pickFile('image/*').then(function (f) { if (f) fileImage(f).then(function (i) { img = forAI(i); fill(thumb, shot(h('div'), toCanvas(i, 900))); }); }); } }, icon('photo'), t('useCamera'))),
      h('button', { class: 'btn gold', onclick: run }, t('tr_go')), out]);
    if (arg && arg.text) run();
  };

  /* ── talk: conversation ─────────────────────────────────────────── */
  screens.converse = function (el) {
    head(el, t('t_converse'));
    var mine = S.lang, theirs = other(S.lang);
    el.appendChild(h('p', { class: 'lede' }, t('conv_hint')));
    var log = h('div', { class: 'bubbles', 'aria-live': 'polite' }), repl = h('div', { class: 'screen' });
    var auto = false, silent = 0;
    function turn(speakerLang, isMe) {
      if (!licensed()) { say(t('needLicence')); return; }
      buzz(); return say(t('listening'), speakerLang, { silentToast: true }).then(function () { return listen(speakerLang); }).then(function (x) {
        if (!x) { if (auto && ++silent < 3 && current.name === 'converse') return turn(speakerLang, isMe); return; }
        silent = 0;
        var target = speakerLang === mine ? theirs : mine;
        return ai('translate', { text: x, target: target }).then(function (r) {
          log.appendChild(h('div', { class: 'bubble' + (isMe ? ' me' : '') }, x, h('small', null, r.translation)));
          repl.innerHTML = '';
          if (!isMe) repl.appendChild(h('button', { class: 'btn', onclick: function () { suggest(x); } }, icon('replies'), t('conv_replies')));
          return say(r.translation, target).then(function () {
            // Automatic turns: after one person speaks, it is the other's go.
            if (auto && current.name === 'converse') return turn(isMe ? theirs : mine, !isMe);
          });
        });
      }).catch(function (e) { auto = false; say(e && e.message === 'nospeech' ? t('noSpeech') : aiError(e)); });
    }
    var autoBtn = h('button', { class: 'btn ghost', 'aria-pressed': 'false', onclick: function () {
      auto = !auto; autoBtn.setAttribute('aria-pressed', String(auto));
      autoBtn.textContent = auto ? L('Automatic turns: on (tap to stop)', 'Turnos automáticos: sí (toca para parar)') : L('Automatic turns', 'Turnos automáticos');
      if (auto) { silent = 0; turn(mine, true); }
    } }, L('Automatic turns', 'Turnos automáticos'));
    onLeave(function () { auto = false; });
    function suggest(heard) {
      var b = busy(repl, t('working'));
      ai('replies', { text: heard, target: theirs }).then(function (r) {
        b.remove(); fill(repl, h('p', { class: 'small muted' }, t('rep_tap')));
        (r.options || []).slice(0, 3).forEach(function (o) {
          repl.appendChild(h('button', { class: 'btn', style: 'justify-content:flex-start;text-align:left', onclick: function () { say(o.reply, theirs); log.appendChild(h('div', { class: 'bubble me' }, o.reply, h('small', null, o.meaning))); } }, h('span', null, o.reply, h('small', { class: 'muted', style: 'display:block' }, o.meaning))));
        });
        say((r.options || []).map(function (o, i) { return (i + 1) + '. ' + o.meaning; }).join(' '));
      }).catch(function (e) { b.remove(); say(aiError(e)); });
    }
    add(el, [h('div', { class: 'conv' },
      h('button', { class: 'btn gold', onclick: function () { turn(mine, true); } }, icon('mic'), t('conv_me') + ' · ' + langName(mine)),
      h('button', { class: 'btn', onclick: function () { turn(theirs, false); } }, icon('mic'), t('conv_them') + ' · ' + langName(theirs))), autoBtn, log, repl]);
  };

  /* ── talk: help me reply ────────────────────────────────────────── */
  screens.replies = function (el, arg) {
    head(el, t('t_replies'));
    var to = langSelect('rep-to', S.lang);
    var ta = h('textarea', { id: 'rep-text', placeholder: t('rep_hint'), 'aria-label': t('rep_hint') }, (arg && arg.text) || '');
    var out = h('div', { class: 'screen' });
    function run() {
      if (!licensed()) { say(t('needLicence')); return; }
      if (!ta.value.trim()) return;
      var b = busy(out, t('working'));
      ai('replies', { text: ta.value.trim(), target: to.value }).then(function (r) {
        b.remove(); fill(out, h('p', { class: 'small muted' }, t('rep_tap')));
        (r.options || []).slice(0, 3).forEach(function (o, i) {
          out.appendChild(h('button', { class: 'btn', style: 'justify-content:flex-start;text-align:left', onclick: function () { say(o.reply, to.value); } }, h('span', null, (i + 1) + '. ' + o.reply, to.value !== S.lang ? h('small', { class: 'muted', style: 'display:block' }, o.meaning) : null)));
        });
        say((r.options || []).map(function (o, i) { return (i + 1) + '. ' + (to.value === S.lang ? o.reply : o.meaning); }).join(' '));
      }).catch(function (e) { b.remove(); say(aiError(e)); });
    }
    add(el, [ta, h('label', { class: 'f' }, S.lang === 'es' ? 'Responder en' : 'Reply in', to), h('div', { class: 'row' },
      h('button', { class: 'btn', onclick: function () { listen(to.value).then(function (x) { if (x) { ta.value = x; run(); } }).catch(function () { say(t('noSpeech')); }); } }, icon('mic'), t('dictate')),
      h('button', { class: 'btn gold', onclick: run }, t('rep_go'))), out]);
    if (arg && arg.text) run();
  };

  /* ── files: a small shelf on the phone, and Google Drive ───────── */
  var Files = (function () {
    var dbp = null, CAP = 100 * 1024 * 1024;
    function db() {
      if (dbp) return dbp;
      dbp = new Promise(function (res, rej) {
        var r = indexedDB.open('lunara-lens', 1);
        r.onupgradeneeded = function () { r.result.createObjectStore('files', { keyPath: 'id' }); };
        r.onsuccess = function () { res(r.result); }; r.onerror = function () { rej(r.error); };
      });
      return dbp;
    }
    function tx(mode, fn) { return db().then(function (d) { return new Promise(function (res, rej) { var x = d.transaction('files', mode), st = x.objectStore('files'), out = fn(st); x.oncomplete = function () { res(out && out.result !== undefined ? out.result : out); }; x.onerror = function () { rej(x.error); }; }); }); }
    function all() { return tx('readonly', function (s) { return s.getAll(); }).then(function (l) { return (l || []).sort(function (a, b) { return b.created - a.created; }); }); }
    function used() { return all().then(function (l) { return l.reduce(function (a, f) { return a + (f.size || 0); }, 0); }); }
    function addF(f) {
      var size = f.blob ? f.blob.size : (f.text || '').length;
      return used().then(function (u) {
        if (u + size > CAP) throw { error: S.lang === 'es' ? 'El espacio del teléfono para Lens está lleno (100 MB). Copia archivos a Google Drive o borra algunos.' : 'Lens storage on this phone is full (100 MB). Copy files to Google Drive or delete some.' };
        var rec = Object.assign({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7), created: Date.now(), folder: '', size: size }, f);
        return tx('readwrite', function (s) { s.put(rec); }).then(function () { return rec; });
      });
    }
    function update(rec) { return tx('readwrite', function (s) { s.put(rec); }); }
    function del(id) { return tx('readwrite', function (s) { s.delete(id); }); }
    return { all: all, add: addF, update: update, del: del, used: used, CAP: CAP };
  })();

  var Drive = (function () {
    var token = null, until = 0, folders = get('lens_drive_folders', {});
    function auth() {
      if (token && Date.now() < until) return Promise.resolve(token);
      return gsi().then(function () {
        return new Promise(function (res, rej) {
          var c = google.accounts.oauth2.initTokenClient({ client_id: CLIENT_ID, scope: 'https://www.googleapis.com/auth/drive.file', callback: function (r) { if (r.error) return rej(r); token = r.access_token; until = Date.now() + (r.expires_in - 60) * 1000; put('lens_drive', true); res(token); } });
          c.requestAccessToken();
        });
      });
    }
    function api(url, opts) { return auth().then(function (tk) { opts = opts || {}; opts.headers = Object.assign({ authorization: 'Bearer ' + tk }, opts.headers || {}); return fetch(url, opts).then(function (r) { if (!r.ok) throw new Error('drive ' + r.status); return r.json(); }); }); }
    function folder(name) {
      var key = name || 'Lunara Lens';
      if (folders[key]) return Promise.resolve(folders[key]);
      var parent = name ? folder('') : Promise.resolve(null);
      return parent.then(function (pid) {
        return api('https://www.googleapis.com/drive/v3/files', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: name || 'Lunara Lens', mimeType: 'application/vnd.google-apps.folder', parents: pid ? [pid] : undefined }) });
      }).then(function (f) { folders[key] = f.id; put('lens_drive_folders', folders); return f.id; });
    }
    function upload(rec) {
      return folder(rec.folder || '').then(function (fid) {
        var meta = { name: rec.name, parents: [fid] };
        var body = new FormData();
        body.append('metadata', new Blob([JSON.stringify(meta)], { type: 'application/json' }));
        body.append('file', rec.blob || new Blob([rec.text || ''], { type: 'text/plain' }));
        return api('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', { method: 'POST', body: body });
      }).then(function (f) { rec.driveId = f.id; return Files.update(rec); });
    }
    function move(rec) {
      if (!rec.driveId) return Promise.resolve();
      return folder(rec.folder || '').then(function (fid) {
        return api('https://www.googleapis.com/drive/v3/files/' + rec.driveId + '?fields=parents').then(function (f) {
          return api('https://www.googleapis.com/drive/v3/files/' + rec.driveId + '?addParents=' + fid + '&removeParents=' + (f.parents || []).join(','), { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: '{}' });
        });
      });
    }
    return { auth: auth, upload: upload, move: move, connected: function () { return !!get('lens_drive', false); } };
  })();

  /* "Put the latest five photos in the folder Trips." */
  function organize(n, folder) {
    folder = (folder || '').trim().replace(/^\w/, function (c) { return c.toUpperCase(); });
    if (!folder) folder = S.lang === 'es' ? 'Fotos' : 'Photos';
    n = Math.max(1, Math.min(50, n || 1));
    return Files.all().then(function (l) {
      var imgs = l.filter(function (f) { return /^image\//.test(f.type); }).slice(0, n);
      return Promise.all(imgs.map(function (f) { f.folder = folder; return Files.update(f).then(function () { return Drive.connected() ? Drive.move(f).catch(function () { }) : null; }); })).then(function () {
        var m = t('organized')(imgs.length, folder); say(m); return imgs.length;
      });
    });
  }

  screens.files = function (el, arg) {
    head(el, t('t_files'));
    var folder = (arg && arg.folder) || '', sel = {};
    var chips = h('div', { class: 'chips' }), grid = h('div', { class: 'files' }), info = h('p', { class: 'small muted' }), actions = h('div', { class: 'row' });
    function draw() {
      Files.all().then(function (l) {
        var names = {}; l.forEach(function (f) { if (f.folder) names[f.folder] = 1; });
        fill(chips, h('button', { class: 'chip' + (!folder ? ' on' : ''), onclick: function () { folder = ''; draw(); } }, t('files_all')),
          Object.keys(names).sort().map(function (n) { return h('button', { class: 'chip' + (folder === n ? ' on' : ''), onclick: function () { folder = n; draw(); } }, n); }));
        var list = folder ? l.filter(function (f) { return f.folder === folder; }) : l;
        fill(grid, list.length ? list.map(function (f) {
          var b = h('button', { class: 'file' + (sel[f.id] ? ' sel' : ''), 'aria-pressed': String(!!sel[f.id]), 'aria-label': f.name, onclick: function () { sel[f.id] = !sel[f.id]; if (!sel[f.id]) delete sel[f.id]; draw(); } },
            /^image\//.test(f.type) ? h('img', { src: URL.createObjectURL(f.blob), alt: '' }) : h('div', { style: 'padding:10px;font-size:.8em;text-align:left' }, f.text || f.name),
            h('div', { class: 'nm' }, (f.folder ? f.folder + ' · ' : '') + f.name));
          return b;
        }) : [h('p', { class: 'muted' }, t('files_empty'))]);
        Files.used().then(function (u) { info.textContent = (u / 1048576).toFixed(1) + ' MB / 100 MB ' + t('files_used') + (Drive.connected() ? ' · ' + t('drive_on') : ''); });
        var n = Object.keys(sel).length;
        fill(actions, 
          h('button', { class: 'btn', onclick: function () { pickFile('image/*', true).then(function (fs) { if (!fs || !fs.length) return; Promise.all(fs.map(function (f) { return Files.add({ name: f.name, type: f.type, blob: f, folder: folder }); })).then(function () { say(t('saved')); draw(); }).catch(function (e) { say(e.error || t('err')); }); }); } }, icon('photo'), t('files_import')),
          n ? h('button', { class: 'btn', onclick: function () { var name = window.prompt ? null : null; askFolder(function (f) { Promise.all(Object.keys(sel).map(function (id) { return Files.all().then(function (l) { var r = l.find(function (x) { return x.id === id; }); r.folder = f; return Files.update(r).then(function () { return Drive.connected() ? Drive.move(r).catch(function () { }) : null; }); }); })).then(function () { sel = {}; say(t('organized')(n, f)); draw(); }); }); } }, t('files_move')) : null,
          n ? h('button', { class: 'btn', onclick: function () { say(t('working'), null, { silentToast: true }); Files.all().then(function (l) { return Promise.all(l.filter(function (r) { return sel[r.id]; }).map(Drive.upload)); }).then(function () { sel = {}; say(t('drive_uploaded')); draw(); }).catch(function () { say(t('err')); }); } }, t('drive_upload')) : null,
          n ? h('button', { class: 'btn ghost', onclick: function () { Promise.all(Object.keys(sel).map(Files.del)).then(function () { sel = {}; draw(); }); } }, t('files_delete')) : null,
          !Drive.connected() ? h('button', { class: 'btn ghost', onclick: function () { Drive.auth().then(function () { say(t('drive_on')); draw(); }).catch(function () { say(t('err')); }); } }, t('drive_connect')) : null);
      });
    }
    function askFolder(cb) {
      var inp = h('input', { type: 'text', id: 'new-folder', placeholder: t('files_folder') });
      var box = h('div', { class: 'card' }, h('label', { class: 'f' }, t('files_move'), inp), h('div', { class: 'row' },
        h('button', { class: 'btn gold', onclick: function () { if (inp.value.trim()) { box.remove(); cb(inp.value.trim()); } } }, t('done')),
        h('button', { class: 'btn ghost', onclick: function () { box.remove(); } }, t('cancel'))));
      actions.after(box); inp.focus();
    }
    add(el, [chips, info, actions, grid]);
    draw();
  };

  /* ── everyday: remember this ───────────────────────────────────── */
  screens.remember = function (el) {
    head(el, t('t_remember'));
    el.appendChild(h('p', { class: 'lede' }, t('remember_hint')));
    var cam = viewer(el), note = h('input', { type: 'text', id: 'rem-note', placeholder: t('remember_note') }), list = h('div', { class: 'screen' });
    function drawList() {
      Files.all().then(function (l) {
        fill(list, l.filter(function (f) { return f.folder === (S.lang === 'es' ? 'Recuerdos' : 'Remembered'); }).slice(0, 8).map(function (f) {
          return h('div', { class: 'card', style: 'display:flex;gap:12px;align-items:center' }, h('img', { src: URL.createObjectURL(f.blob), alt: '', style: 'width:64px;height:64px;object-fit:cover;border-radius:10px' }),
            h('div', { style: 'flex:1' }, h('div', null, f.note || ''), h('div', { class: 'small muted' }, new Date(f.created).toLocaleString(S.lang === 'es' ? 'es-ES' : 'en-GB')),
              f.lat ? h('a', { href: 'https://www.google.com/maps?q=' + f.lat + ',' + f.lng, target: '_blank', rel: 'noopener' }, S.lang === 'es' ? 'Ver en el mapa' : 'Show on map') : null),
            h('button', { class: 'iconbtn', 'aria-label': t('again'), onclick: function () { say(f.note || ''); } }, icon('speak')));
        }));
      });
    }
    add(el, [note, h('div', { class: 'row' },
      h('button', { class: 'btn', onclick: function () { listen().then(function (x) { if (x) note.value = x; }).catch(function () { say(t('noSpeech')); }); } }, icon('mic'), t('dictate')),
      h('button', { class: 'btn gold', onclick: function () {
        buzz(); var c = toCanvas(cam.video, 1280);
        var save = function (pos) {
          c.toBlob(function (blob) {
            Files.add({ name: 'remember-' + new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-') + '.jpg', type: 'image/jpeg', blob: blob, folder: S.lang === 'es' ? 'Recuerdos' : 'Remembered', note: note.value.trim(), lat: pos && pos.coords.latitude, lng: pos && pos.coords.longitude })
              .then(function () { say(t('remember_saved') + ' ' + note.value.trim()); note.value = ''; drawList(); }).catch(function (e) { say(e.error || t('err')); });
          }, 'image/jpeg', 0.85);
        };
        if (navigator.geolocation) navigator.geolocation.getCurrentPosition(save, function () { save(null); }, { timeout: 6000, maximumAge: 60000 }); else save(null);
      } }, icon('remember'), t('capture'))), list]);
    drawList();
  };

  /* ── everyday: calm ─────────────────────────────────────────────── */
  screens.calm = function (el) {
    head(el, t('t_calm'));
    el.appendChild(h('p', { class: 'lede' }, t('calm_intro')));
    var stage = h('div'), timers = [];
    onLeave(function () { timers.forEach(clearTimeout); if (window.speechSynthesis) speechSynthesis.cancel(); });
    function breathe(pattern) {
      timers.forEach(clearTimeout); timers = [];
      var circle = h('div', { class: 'c' }), word = h('div', { class: 'w', 'aria-live': 'polite' });
      fill(stage, h('div', { class: 'breath', style: 'position:relative' }, circle, word), h('button', { class: 'btn', onclick: function () { timers.forEach(clearTimeout); stage.innerHTML = ''; } }, t('stop')));
      var phases = pattern === '478' ? [['in', 4], ['hold', 7], ['out', 8]] : [['in', 4], ['hold', 4], ['out', 4], ['hold', 4]];
      var rounds = 0, i = 0;
      (function step() {
        if (rounds >= 6) { say(S.lang === 'es' ? 'Muy bien. Quédate un momento aquí.' : 'Well done. Stay here a moment.'); return; }
        var p = phases[i];
        word.textContent = t(p[0]);
        circle.style.transitionDuration = p[1] + 's';
        circle.style.transform = p[0] === 'in' ? 'scale(2.1)' : p[0] === 'out' ? 'scale(1)' : circle.style.transform;
        say(t(p[0]), null, { silentToast: true, queue: false }); buzz(p[0] === 'hold' ? 10 : 25);
        i = (i + 1) % phases.length; if (i === 0) rounds++;
        timers.push(setTimeout(step, p[1] * 1000));
      })();
    }
    function ground() {
      var k = 0, steps = t('ground'), p = h('p', { class: 'big-card', 'aria-live': 'polite' });
      var nx = h('button', { class: 'btn gold', onclick: function () { k++; if (k >= steps.length) { stage.innerHTML = ''; return; } p.textContent = steps[k]; say(steps[k]); } }, t('next'));
      fill(stage, p, nx); p.textContent = steps[0]; say(steps[0]);
    }
    add(el, [h('div', { class: 'row' },
      h('button', { class: 'btn gold', onclick: function () { breathe('box'); } }, t('calm_box')),
      h('button', { class: 'btn', onclick: function () { breathe('478'); } }, t('calm_478')),
      h('button', { class: 'btn', onclick: ground }, t('calm_ground'))), stage]);
    say(t('calm_intro'));
  };

  /* ── everyday: emergency card ───────────────────────────────────── */
  screens.card = function (el) {
    head(el, t('t_card'));
    el.appendChild(h('p', { class: 'lede' }, t('card_intro')));
    var data = get('lens_card', {}), fields = ['card_name', 'card_med', 'card_allergy', 'card_meds', 'card_contact', 'card_note'];
    var inputs = fields.map(function (k) { var i = h('input', { type: 'text', id: k, value: data[k] || '', oninput: function () { data[k] = i.value; put('lens_card', data); } }); return h('label', { class: 'f' }, t(k), i); });
    function text() { return fields.filter(function (k) { return data[k]; }).map(function (k) { return t(k) + ': ' + data[k]; }).join('. '); }
    var big = h('div');
    add(el, [inputs, h('div', { class: 'row' },
      h('button', { class: 'btn gold', onclick: function () { say(text() || t('card_intro')); } }, icon('speak'), t('card_read')),
      h('button', { class: 'btn', onclick: function () { fill(big, h('dl', { class: 'card big-card' }, fields.filter(function (k) { return data[k]; }).map(function (k) { return [h('dt', null, t(k)), h('dd', null, data[k])]; }))); big.scrollIntoView({ behavior: 'smooth' }); } }, t('card_show'))), big]);
  };

  /* ── protect: is this link safe ─────────────────────────────────
     Checked on the phone first, with the tricks phishing links use;
     then, with a licence, weighed by the AI like any other scam. */
  function linkSigns(raw) {
    var out = [], u;
    try { u = new URL(/^https?:\/\//i.test(raw) ? raw : 'https://' + raw); } catch (e) { return { bad: true, signs: [S.lang === 'es' ? 'No es un enlace válido.' : 'That is not a valid link.'] }; }
    var host = u.hostname.toLowerCase(), es = S.lang === 'es';
    if (u.protocol === 'http:') out.push(es ? 'No usa conexión segura (https).' : 'It does not use a secure connection (https).');
    if (/^xn--|\.xn--/.test(host)) out.push(es ? 'Usa letras de otros alfabetos que imitan a las nuestras.' : 'It uses look-alike letters from other alphabets.');
    if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) out.push(es ? 'Es una dirección numérica, no un nombre.' : 'It is a bare number address, not a name.');
    if (/(bit\.ly|tinyurl|t\.co|goo\.gl|is\.gd|cutt\.ly|rb\.gy|shorturl)/.test(host)) out.push(es ? 'Es un enlace acortado que oculta el destino.' : 'It is a shortened link that hides where it goes.');
    if (u.username || /@/.test(u.href.split('?')[0].replace(/^https?:\/\//, ''))) out.push(es ? 'Contiene una @ que puede ocultar el destino real.' : 'It contains an @ that can hide the real destination.');
    if (host.split('.').length > 4) out.push(es ? 'Tiene muchos subdominios, una táctica común.' : 'It has many subdomains, a common trick.');
    var brands = ['paypal', 'apple', 'google', 'microsoft', 'amazon', 'netflix', 'bank', 'banco', 'santander', 'bbva', 'chase', 'wellsfargo', 'correos', 'dhl', 'fedex', 'ups', 'usps', 'whatsapp', 'instagram', 'facebook', 'lunarasociety'];
    var reg = host.split('.').slice(-2).join('.');
    brands.forEach(function (b) { if (host.indexOf(b) >= 0 && reg.indexOf(b) < 0) out.push((es ? 'Menciona «' : 'It mentions “') + b + (es ? '» pero el dominio real es ' : '” but the real domain is ') + reg + '.'); });
    if (/(login|verify|secure|update|account|confirm|wallet|gift|prize|premio|verifica|cuenta)/.test(u.pathname + u.search)) out.push(es ? 'Pide iniciar sesión o verificar datos.' : 'It asks you to sign in or verify details.');
    if (/\.(zip|mov|top|xyz|click|country|gq|tk|ml|cf)$/.test(host)) out.push(es ? 'Usa una terminación de dominio frecuente en estafas.' : 'Its domain ending is common in scams.');
    return { host: host, reg: reg, signs: out, bad: out.length >= 2 };
  }
  function checkLink(out, raw) {
    var r = linkSigns(raw.trim());
    fill(out, h('div', { class: 'verdict ' + (r.bad ? 'v-ai' : r.signs.length ? 'v-unsure' : 'v-human') },
      h('div', { class: 'src' }, t('localOnly')), h('div', { class: 'v' }, r.host || raw),
      r.signs.length ? signalList(r.signs.map(function (x) { return FX.F(x, 'moderate', 'ai'); })) : null));
    sayKey(r.bad ? 'link_risky' : 'link_safe');
    if (licensed()) scamFlow(out, (S.lang === 'es' ? 'Enlace recibido: ' : 'Link received: ') + raw + '\n' + r.signs.join('\n'), null);
  }
  screens.link = function (el, arg) {
    head(el, t('t_link'));
    var inp = h('input', { type: 'text', id: 'link-in', inputmode: 'url', placeholder: t('link_ph'), value: (arg && arg.text) || '' }), out = h('div', { class: 'screen' });
    add(el, [inp, h('button', { class: 'btn gold', onclick: function () { if (inp.value.trim()) checkLink(out, inp.value); } }, t('link_go')), out]);
    if (arg && arg.text) checkLink(out, arg.text);
  };

  /* ── protect: QR codes ──────────────────────────────────────────── */
  screens.qr = function (el) {
    head(el, t('t_qr'));
    var out = h('div', { class: 'screen' });
    function found(val) {
      buzz([20, 40, 20]); sayKey('qr_found');
      fill(out, h('div', { class: 'card', style: 'word-break:break-all' }, val));
      if (/^(https?:\/\/|www\.)/i.test(val)) setTimeout(function () { checkLink(out, val); }, 1400);
    }
    if (!('BarcodeDetector' in window)) {
      add(el, [h('p', { class: 'note' }, t('qr_unsupported')), h('button', { class: 'btn gold', onclick: function () { say(t('qr_unsupported')); } }, t('pick')), out]);
      return;
    }
    el.appendChild(h('p', { class: 'lede' }, t('qr_hint')));
    var cam = viewer(el), det = new BarcodeDetector({ formats: ['qr_code'] }), done = false;
    var iv = setInterval(function () {
      if (done || !cam.video.videoWidth) return;
      det.detect(cam.video).then(function (codes) { if (codes && codes[0] && !done) { done = true; stopCamera(); found(codes[0].rawValue); } }).catch(function () { });
    }, 350);
    onLeave(function () { clearInterval(iv); });
    add(el, [h('button', { class: 'btn', onclick: function () { pickFile('image/*').then(function (f) { if (!f) return; fileImage(f).then(function (img) { return det.detect(img); }).then(function (c) { c && c[0] ? found(c[0].rawValue) : say(S.lang === 'es' ? 'No encontré ningún código.' : 'I found no code.'); }); }); } }, t('pick')), out]);
  };

  /* ── see: explain a letter ──────────────────────────────────────── */
  screens.summarize = function (el) {
    head(el, t('t_summ'));
    el.appendChild(h('p', { class: 'lede' }, t('summ_hint')));
    var ta = h('textarea', { id: 'summ-text', placeholder: t('textPlaceholder'), 'aria-label': t('textPlaceholder') }), img = null, thumb = h('div'), out = h('div', { class: 'screen' });
    function run() {
      if (!ta.value.trim() && !img) return;
      var b = busy(out, t('working')); sayKey('reading');
      ai('summarize', { text: ta.value.trim() || undefined, images: img ? [img] : undefined, context: 'Local date: ' + new Date().toDateString() }).then(function (r) {
        b.remove();
        fill(out, h('div', { class: 'verdict v-info' }, h('p', { style: 'margin:0;font-size:1.08em' }, r.speech)),
          h('div', { class: 'card', style: 'white-space:pre-wrap' }, r.summary),
          r.actions && r.actions.length ? [h('h2', null, t('advice')), signalList(r.actions.map(function (x) { return FX.F(x, 'moderate', 'neither'); }))] : null,
          r.deadlines && r.deadlines.length ? [h('h2', null, S.lang === 'es' ? 'Fechas' : 'Dates'), signalList(r.deadlines.map(function (x) { return FX.F(x, 'strong', 'neither'); }))] : null,
          r.amount_due ? h('p', null, h('b', null, L('To pay: ', 'A pagar: ') + r.amount_due)) : null,
          (r.reminders || []).filter(function (x) { return x.text; }).length ? [h('h2', null, L('Reminders', 'Recordatorios')), (r.reminders || []).filter(function (x) { return x.text; }).map(function (x) {
            var when = /^\d{4}-\d{2}-\d{2}$/.test(x.date) ? new Date(x.date + 'T09:00:00') : null;
            // The day before at nine, so there is time to act; on the day if that has passed.
            var at = when ? new Date(when.getTime() - 864e5) : null; if (at && at < new Date()) at = when; if (at && at < new Date()) at = null;
            var b = h('button', { class: 'btn', onclick: function () {
              if (at) Rem.addAt(x.text, at.getTime()); else Rem.add(x.text, 60 * 24);
              b.disabled = true; b.textContent = '✓ ' + L('Reminder set', 'Recordatorio puesto'); sayKey('reminder_set');
            } }, icon('reminders'), x.text + (at ? ' · ' + at.toLocaleDateString(S.lang === 'es' ? 'es-ES' : 'en-GB', { weekday: 'short', day: 'numeric', month: 'short' }) : L(' · tomorrow', ' · mañana')));
            return b;
          })] : null);
        say(r.speech);
      }).catch(function (e) { b.remove(); say(aiError(e)); });
    }
    add(el, [h('div', { class: 'row' },
      h('button', { class: 'btn gold', onclick: function () { pickFile('image/*').then(function (f) { if (f) fileImage(f).then(function (i) { img = toCanvas(i, 1800).toDataURL('image/jpeg', 0.88); fill(thumb, shot(h('div'), toCanvas(i, 900))); run(); }); }); } }, icon('photo'), S.lang === 'es' ? 'Foto del documento' : 'Photo of the document')),
      thumb, ta, h('button', { class: 'btn', onclick: run }, t('summ_go')), out]);
  };

  /* ── your day: reminders and notes ──────────────────────────────── */
  var Rem = {
    all: function () { return get('lens_reminders', []); },
    save: function (l) { put('lens_reminders', l); },
    add: function (text, minutes) { return Rem.addAt(text, Date.now() + Math.max(1, minutes) * 60000); },
    addAt: function (text, at) {
      var l = Rem.all(); l.push({ id: Date.now() + Math.random(), text: String(text || '').trim() || (S.lang === 'es' ? 'Recordatorio' : 'Reminder'), at: at, done: false, mode: S.mode });
      Rem.save(l);
      if (window.Notification && Notification.permission === 'default') try { Notification.requestPermission(); } catch (e) { }
    },
    tick: function () {
      var l = Rem.all(), now = Date.now(), changed = false;
      l.forEach(function (r) {
        if (!r.done && r.at <= now) {
          r.done = true; changed = true; buzz([200, 100, 200, 100, 200]);
          sayKey('reminder_now').then(function () { return say(r.text); });
          try { if (window.Notification && Notification.permission === 'granted') new Notification('Rosario', { body: r.text, icon: 'icon-192.png' }); } catch (e) { }
        }
      });
      if (changed) Rem.save(l);
    }
  };
  setInterval(Rem.tick, 10000);
  var Notes = { all: function () { return get('lens_notes', []); }, add: function (text) { var l = Notes.all(); l.unshift({ id: Date.now(), text: text }); put('lens_notes', l.slice(0, 200)); } };
  function readNotes() {
    var l = Notes.all();
    if (!l.length) return sayKey('no_notes');
    return say(l.slice(0, 5).map(function (n, i) { return (i + 1) + '. ' + n.text; }).join(' '));
  }
  screens.reminders = function (el) {
    head(el, t('t_remind'));
    var what = h('input', { type: 'text', id: 'rem-what', placeholder: t('rem_what') }), mins = h('input', { type: 'number', id: 'rem-min', min: 1, value: 10, inputmode: 'numeric' });
    var list = h('div', { class: 'screen' }), notes = h('div', { class: 'screen' }), nt = h('input', { type: 'text', id: 'note-in', placeholder: t('note_ph') });
    function draw() {
      var l = Rem.all().filter(function (r) { return !r.done; }).sort(function (a, b) { return a.at - b.at; });
      fill(list, l.length ? l.map(function (r) {
        return h('div', { class: 'card row', style: 'align-items:center' }, h('div', { style: 'flex:1' }, h('div', null, r.text), h('div', { class: 'small muted' }, new Date(r.at).toLocaleString(S.lang === 'es' ? 'es-ES' : 'en-GB', new Date(r.at).toDateString() === new Date().toDateString() ? { hour: '2-digit', minute: '2-digit' } : { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }))),
          h('button', { class: 'btn ghost', onclick: function () { Rem.save(Rem.all().filter(function (x) { return x.id !== r.id; })); draw(); } }, t('files_delete')));
      }) : h('p', { class: 'muted' }, t('rem_none')));
      var n = Notes.all();
      fill(notes, n.length ? n.slice(0, 30).map(function (x) {
        return h('div', { class: 'card row', style: 'align-items:center' }, h('div', { style: 'flex:1' }, x.text),
          h('button', { class: 'iconbtn', 'aria-label': t('again'), onclick: function () { say(x.text); } }, icon('speak')),
          h('button', { class: 'btn ghost', onclick: function () { put('lens_notes', Notes.all().filter(function (y) { return y.id !== x.id; })); draw(); } }, t('files_delete')));
      }) : h('p', { class: 'muted' }, t('no_notes') || ''));
    }
    add(el, [h('h2', null, t('rem_new')), what, h('label', { class: 'f' }, t('rem_in'), mins),
      h('button', { class: 'btn gold', onclick: function () { Rem.add(what.value, +mins.value || 10); what.value = ''; sayKey('reminder_set'); draw(); } }, t('rem_add')), list,
      h('h2', null, t('notes_h')), nt, h('div', { class: 'row' },
        h('button', { class: 'btn', onclick: function () { listen().then(function (x) { if (x) nt.value = x; }).catch(function () { say(t('noSpeech')); }); } }, icon('mic'), t('dictate')),
        h('button', { class: 'btn gold', onclick: function () { if (!nt.value.trim()) return; Notes.add(nt.value.trim()); nt.value = ''; sayKey('note_saved'); draw(); } }, t('note_add'))), notes]);
    draw();
  };

  /* ── your day: briefing (time, weather, reminders) ──────────────── */
  var WX = { en: { 0: 'clear sky', 1: 'mostly clear', 2: 'partly cloudy', 3: 'overcast', 45: 'fog', 48: 'fog', 51: 'light drizzle', 53: 'drizzle', 55: 'heavy drizzle', 61: 'light rain', 63: 'rain', 65: 'heavy rain', 71: 'light snow', 73: 'snow', 75: 'heavy snow', 80: 'showers', 81: 'showers', 82: 'heavy showers', 95: 'thunderstorms', 96: 'thunderstorms', 99: 'thunderstorms' },
    es: { 0: 'cielo despejado', 1: 'casi despejado', 2: 'parcialmente nublado', 3: 'nublado', 45: 'niebla', 48: 'niebla', 51: 'llovizna ligera', 53: 'llovizna', 55: 'llovizna intensa', 61: 'lluvia ligera', 63: 'lluvia', 65: 'lluvia intensa', 71: 'nieve ligera', 73: 'nieve', 75: 'nieve intensa', 80: 'chubascos', 81: 'chubascos', 82: 'chubascos fuertes', 95: 'tormentas', 96: 'tormentas', 99: 'tormentas' } };
  function weather() {
    return new Promise(function (resolve) {
      if (!navigator.geolocation) return resolve(null);
      navigator.geolocation.getCurrentPosition(function (p) {
        fetchT('https://api.open-meteo.com/v1/forecast?latitude=' + p.coords.latitude.toFixed(3) + '&longitude=' + p.coords.longitude.toFixed(3) + '&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=1', null, 8000)
          .then(function (r) { return r.json(); }).then(resolve).catch(function () { resolve(null); });
      }, function () { resolve(null); }, { timeout: 7000, maximumAge: 600000 });
    });
  }
  function briefing(out) {
    var d = new Date(), es = S.lang === 'es', parts = [t('time_now')(d)];
    var rem = Rem.all().filter(function (r) { return !r.done && r.at - d < 86400000; });
    if (out) fill(out, busy(h('div'), t('working')));
    return weather().then(function (w) {
      if (w && w.current) {
        var c = Math.round(w.current.temperature_2m), code = w.current.weather_code, dsc = WX[S.lang][code] || WX[S.lang][Math.floor(code / 10) * 10] || '';
        var hi = Math.round(w.daily.temperature_2m_max[0]), lo = Math.round(w.daily.temperature_2m_min[0]), pr = w.daily.precipitation_probability_max[0];
        parts.push(es ? ('Ahora hace ' + c + ' grados, ' + dsc + '. Máxima de ' + hi + ', mínima de ' + lo + (pr >= 30 ? ', con ' + pr + ' por ciento de probabilidad de lluvia.' : '.'))
          : ('It’s ' + c + ' degrees and ' + dsc + '. A high of ' + hi + ' and a low of ' + lo + (pr >= 30 ? ', with a ' + pr + ' percent chance of rain.' : '.')));
      }
      parts.push(rem.length ? (es ? 'Tienes ' + rem.length + ' recordatorio' + (rem.length > 1 ? 's' : '') + ': ' : 'You have ' + rem.length + ' reminder' + (rem.length > 1 ? 's' : '') + ': ') + rem.map(function (r) { return r.text; }).join(', ') + '.' : (es ? 'No tienes recordatorios pendientes.' : 'No reminders waiting.'));
      var lists = Lists.mine().map(function (x) { return [x.name, x.items.filter(function (i) { return !i.done; }).length]; }).filter(function (x) { return x[1]; });
      if (lists.length) parts.push(lists.map(function (x) { return (es ? 'En ' + x[0] + ' tienes ' + x[1] + (x[1] > 1 ? ' cosas' : ' cosa') : x[0] + ': ' + x[1] + (x[1] > 1 ? ' things' : ' thing')); }).join(', ') + '.');
      if (credits() !== null && !(me && me.owner)) parts.push(es ? 'Te quedan ' + fmt(credits()) + ' créditos.' : 'You have ' + fmt(credits()) + ' credits.');
      var text = parts.join(' ');
      if (out) {
        var plan = h('div', { class: 'screen' });
        fill(out, h('div', { class: 'verdict v-info' }, h('div', { class: 'src' }, t('brief_today') + ' · ' + (S.mode === 'work' ? L('work', 'trabajo') : L('home', 'casa'))), h('p', { style: 'margin:0;font-size:1.1em' }, text)),
          h('button', { class: 'btn gold', onclick: function () { planDay(plan, text); } }, L('Plan my day with Rosario', 'Planifica mi día con Rosario') + ' · ✦ ' + (cat().credits.plan_day || 3)), plan);
        briefing.last = text;
      }
      return say(text);
    });
  }
  function planDay(out, today) {
    var b = busy(out, t('working'));
    var rem = Rem.all().filter(function (r) { return !r.done && r.at - Date.now() < 86400000; }).map(function (r) { return new Date(r.at).toLocaleTimeString(S.lang === 'es' ? 'es-ES' : 'en-GB', { hour: '2-digit', minute: '2-digit' }) + ' ' + r.text; });
    return ai('plan_day', Object.assign({ text: today + '\nReminders today: ' + (rem.join('; ') || 'none') + '\nLocal time: ' + new Date().toString() }, personal())).then(function (r) {
      b.remove();
      fill(out, h('ol', { class: 'plan-list' }, (r.priorities || []).map(function (x) { return h('li', null, x); })));
      say(r.speech);
    }).catch(function (e) { b.remove(); say(aiError(e)); });
  }
  screens.briefing = function (el, arg) {
    head(el, t('t_brief')); el.appendChild(modeSwitch());
    var out = h('div', { class: 'screen' }); el.appendChild(out);
    briefing(out).then(function () { if (arg && arg.plan) { var p = out.querySelector('.screen'); if (p) planDay(p, briefing.last || ''); } });
  };

  /* ── the assistant: memory, lists, modes ────────────────────────
     All of it lives on this phone. It travels with a question to
     Rosario so she can use it, and the server does not keep it. */
  var Mem = {
    all: function () { return get('lens_memory', []); },
    add: function (text) {
      text = String(text || '').trim().replace(/^(that|que)\s+/i, '').slice(0, 220); if (!text) return null;
      var l = Mem.all(); if (l.some(function (m) { return norm(m.text) === norm(text); })) return null;
      var m = { id: Date.now(), text: text.charAt(0).toUpperCase() + text.slice(1), at: Date.now() };
      l.unshift(m); put('lens_memory', l.slice(0, 150)); return m;
    },
    remove: function (id) { put('lens_memory', Mem.all().filter(function (m) { return m.id !== id; })); },
    forget: function (q) {
      var words = norm(q).split(' ').filter(function (w) { return w.length > 2; }), best = null, score = 0;
      Mem.all().forEach(function (m) { var n = norm(m.text), sc = words.filter(function (w) { return n.indexOf(w) >= 0; }).length; if (sc > score) { score = sc; best = m; } });
      if (best) Mem.remove(best.id); return best;
    },
    text: function () { return Mem.all().slice(0, 60).map(function (m) { return '- ' + m.text; }).join('\n'); }
  };
  if (!S.mode) S.mode = 'home';
  function setMode(m) {
    S.mode = /work|trabaj|oficina|office/i.test(m || '') ? 'work' : 'home'; saveSettings();
    say(S.mode === 'work' ? L('Work mode. Your work lists are ready.', 'Modo trabajo. Tus listas del trabajo están listas.') : L('Home mode. Your home lists are ready.', 'Modo casa. Tus listas de casa están listas.'));
    if (/^(home|lists)$/.test(current.name)) go(current.name, current.arg, true);
  }
  var Lists = {
    all: function () { return get('lens_lists', []); },
    save: function (l) { put('lens_lists', l); },
    mine: function () { return Lists.all().filter(function (x) { return (x.mode || 'home') === S.mode; }); },
    defaultName: function () { return S.mode === 'work' ? L('To do', 'Tareas') : L('Shopping', 'Compras'); },
    key: function (n) { return norm(n).replace(/\b(list|lista|de|the|my|mi|la)\b/g, '').replace(/s\b/g, '').trim(); },
    find: function (name, create) {
      name = String(name || '').trim() || Lists.defaultName();
      var all = Lists.all(), k = Lists.key(name);
      var hit = all.find(function (x) { return (x.mode || 'home') === S.mode && Lists.key(x.name) === k; });
      if (!hit && create) { hit = { id: Date.now(), name: name.charAt(0).toUpperCase() + name.slice(1), mode: S.mode, items: [] }; all.push(hit); Lists.save(all); }
      return hit || null;
    },
    update: function (list) { var all = Lists.all().map(function (x) { return x.id === list.id ? list : x; }); Lists.save(all); },
    add: function (name, items) {
      var list = Lists.find(name, true);
      var parts = String(items || '').split(/\s*(?:,|;|\n|\band\b|\by\b)\s*/i).map(function (x) { return x.trim(); }).filter(Boolean);
      parts.forEach(function (x) { list.items.push({ id: Date.now() + Math.random(), text: x, done: false }); });
      Lists.update(list); return { list: list, added: parts };
    },
    text: function () { return Lists.mine().map(function (x) { var open = x.items.filter(function (i) { return !i.done; }); return x.name + ': ' + (open.length ? open.map(function (i) { return i.text; }).join(', ') : '(empty)'); }).join('\n'); }
  };
  function readList(name) {
    var list = Lists.find(name, false) || (Lists.mine().length === 1 ? Lists.mine()[0] : null);
    if (!list) return say(L('I don’t have a list called ' + (name || 'that') + '.', 'No tengo una lista llamada ' + (name || 'así') + '.'));
    var open = list.items.filter(function (i) { return !i.done; });
    return say(open.length ? list.name + ': ' + open.map(function (i) { return i.text; }).join(', ') + '.' : L('Your ' + list.name + ' list is empty.', 'Tu lista ' + list.name + ' está vacía.'));
  }
  /* What Rosario is told about you with a question. */
  function personal() { return { memory: Mem.text() || undefined, lists: Lists.text() || undefined, mode: S.mode }; }

  screens.memory = function (el) {
    head(el, L('What Rosario remembers', 'Lo que Rosario recuerda'));
    el.appendChild(h('p', { class: 'lede' }, L('Tell her things worth remembering: names, birthdays, where you parked, your doctor, how you like things. It stays on this phone and goes with your questions so she can use it. Say “Rosario, remember that…”.',
      'Cuéntale lo que vale la pena recordar: nombres, cumpleaños, dónde aparcaste, tu médico, cómo te gustan las cosas. Se queda en este teléfono y va con tus preguntas para que pueda usarlo. Di «Rosario, recuerda que…».')));
    var inp = h('input', { type: 'text', id: 'mem-in', placeholder: L('My daughter is called Ana', 'Mi hija se llama Ana') }), list = h('div', { class: 'screen' });
    function draw() {
      var l = Mem.all();
      fill(list, l.length ? l.map(function (m) {
        return h('div', { class: 'card row', style: 'align-items:center' }, h('div', { style: 'flex:1' }, m.text, h('div', { class: 'small muted' }, new Date(m.at).toLocaleDateString(S.lang === 'es' ? 'es-ES' : 'en-GB'))),
          h('button', { class: 'btn ghost', style: 'flex:0 0 auto;width:auto;padding:0 16px', onclick: function () { Mem.remove(m.id); draw(); } }, L('Forget', 'Olvidar')));
      }) : h('p', { class: 'muted' }, L('Nothing yet.', 'Nada todavía.')));
    }
    function save() { if (Mem.add(inp.value)) { say(L('I’ll remember that.', 'Lo recordaré.')); inp.value = ''; draw(); } }
    add(el, [inp, h('div', { class: 'row' },
      h('button', { class: 'btn', onclick: function () { listen().then(function (x) { if (x) { inp.value = x; save(); } }).catch(function () { say(t('noSpeech')); }); } }, icon('mic'), t('dictate')),
      h('button', { class: 'btn gold', onclick: save }, L('Remember', 'Recordar'))), list,
      h('button', { class: 'btn ghost', onclick: function () { if (confirm(L('Forget everything?', '¿Olvidarlo todo?'))) { put('lens_memory', []); draw(); } } }, L('Forget everything', 'Olvidarlo todo'))]);
    draw();
  };

  function modeSwitch() {
    var b = h('div', { class: 'chips center', role: 'group', 'aria-label': L('Mode', 'Modo') },
      ['home', 'work'].map(function (m) { return h('button', { class: 'chip' + (S.mode === m ? ' on' : ''), 'aria-pressed': String(S.mode === m), onclick: function () { if (S.mode !== m) setMode(m); } }, m === 'home' ? L('At home', 'En casa') : L('At work', 'En el trabajo')); }));
    return b;
  }
  screens.lists = function (el, arg) {
    head(el, L('Lists', 'Listas'));
    el.appendChild(modeSwitch());
    var cur = arg && arg.name ? Lists.find(arg.name, true) : (Lists.mine()[0] || Lists.find(Lists.defaultName(), true));
    var chips = h('div', { class: 'chips' }), items = h('div', { class: 'screen' });
    var inp = h('input', { type: 'text', id: 'list-in', placeholder: L('Add something (milk, bread…)', 'Añade algo (leche, pan…)'), onkeydown: function (e) { if (e.key === 'Enter') addItems(); } });
    function addItems() { if (!inp.value.trim()) return; Lists.add(cur.name, inp.value); inp.value = ''; cur = Lists.find(cur.name); draw(); buzz(); }
    function draw() {
      fill(chips, Lists.mine().map(function (x) { return h('button', { class: 'chip' + (x.id === cur.id ? ' on' : ''), onclick: function () { cur = x; draw(); } }, x.name + ' · ' + x.items.filter(function (i) { return !i.done; }).length); }),
        h('button', { class: 'chip', onclick: function () { var n = prompt(L('Name of the new list', 'Nombre de la nueva lista')); if (n && n.trim()) { cur = Lists.find(n.trim(), true); draw(); } } }, '+ ' + L('New list', 'Nueva lista')));
      fill(items, cur.items.length ? cur.items.map(function (i) {
        var cb = h('input', { type: 'checkbox', checked: i.done || null, onchange: function () { i.done = cb.checked; Lists.update(cur); draw(); } });
        return h('label', { class: 'card row item' + (i.done ? ' done' : ''), style: 'align-items:center;gap:12px' }, cb, h('span', { style: 'flex:1' }, i.text),
          h('button', { class: 'iconbtn', 'aria-label': t('files_delete'), onclick: function (e) { e.preventDefault(); cur.items = cur.items.filter(function (x) { return x !== i; }); Lists.update(cur); draw(); } }, '×'));
      }) : h('p', { class: 'muted' }, L('Empty. Add something, or say “Rosario, add eggs to my shopping list”.', 'Vacía. Añade algo, o di «Rosario, añade huevos a mi lista de la compra».')));
    }
    add(el, [chips, inp, h('div', { class: 'row' },
      h('button', { class: 'btn gold', onclick: addItems }, L('Add', 'Añadir')),
      h('button', { class: 'btn', onclick: function () { listen().then(function (x) { if (x) { inp.value = x; addItems(); } }).catch(function () { say(t('noSpeech')); }); } }, icon('mic'), t('dictate')),
      h('button', { class: 'btn', onclick: function () { readList(cur.name); } }, icon('speak'), L('Read', 'Leer'))), items,
      h('div', { class: 'row' },
        h('button', { class: 'btn ghost', onclick: function () { cur.items = cur.items.filter(function (i) { return !i.done; }); Lists.update(cur); draw(); } }, L('Clear ticked', 'Quitar marcados')),
        h('button', { class: 'btn ghost', onclick: function () { if (confirm(L('Delete this list?', '¿Borrar esta lista?'))) { Lists.save(Lists.all().filter(function (x) { return x.id !== cur.id; })); cur = Lists.mine()[0] || Lists.find(Lists.defaultName(), true); draw(); } } }, L('Delete list', 'Borrar lista')),
        navigator.share ? h('button', { class: 'btn ghost', onclick: function () { navigator.share({ text: cur.name + ':\n' + cur.items.filter(function (i) { return !i.done; }).map(function (i) { return '• ' + i.text; }).join('\n') }).catch(function () { }); } }, t('share')) : null)]);
    draw();
  };

  function bullets(arr, kind) {
    return h('ul', { class: 'bullets ' + (kind || '') }, (arr || []).map(function (x) { return h('li', null, x); }));
  }

  /* ── the assistant: talk mode ───────────────────────────────────── */
  screens.talk = function (el) {
    head(el, L('Talk with Rosario', 'Habla con Rosario'));
    el.appendChild(h('p', { class: 'lede' }, L('Just talk. She listens, answers and listens again, hands-free. Say “stop” when you’re done.', 'Habla sin más. Ella escucha, responde y vuelve a escuchar, sin manos. Di «para» cuando termines.')));
    var box = h('div', { class: 'convo', id: 'convo', 'aria-live': 'polite' }), on = false, misses = 0;
    var state = h('p', { class: 'center muted', role: 'status' }, '');
    var btn = h('button', { class: 'btn gold big', onclick: function () { on ? stop(true) : start(); } }, icon('mic'), L('Start talking', 'Empezar a hablar'));
    function quiet() { return new Promise(function (res) { (function chk() { if (!isSpeaking()) return setTimeout(res, 350); setTimeout(chk, 250); })(); }); }
    function start() { on = true; misses = 0; wakePause(true); btn.lastChild.textContent = L('Stop', 'Parar'); say(L('I’m listening.', 'Te escucho.')).then(loop); }
    function stop(spoken) { on = false; wakePause(false); btn.lastChild.textContent = L('Start talking', 'Empezar a hablar'); state.textContent = ''; micBtn.classList.remove('on'); if (spoken) say(L('Okay. I’m here when you need me.', 'Vale. Aquí estoy cuando me necesites.')); }
    function loop() {
      if (!on || current.name !== 'talk') return;
      state.textContent = t('listening'); micBtn.classList.add('on');
      listen().then(function (q) {
        micBtn.classList.remove('on'); state.textContent = '';
        if (!on) return;
        if (!q) { if (++misses >= 3) return stop(true); return loop(); }
        misses = 0;
        if (/^(stop|para|parar|adios|adiós|bye|goodbye|that'?s all|eso es todo|gracias,? eso es todo)\b/i.test(q.trim())) return stop(true);
        state.textContent = t('working');
        return Promise.resolve(handle(q)).then(quiet).then(loop);
      }).catch(function () { stop(false); say(t('noSpeech')); });
    }
    onLeave(function () { on = false; wakePause(false); });
    add(el, [box, state, btn]);
    drawConvo(box);
  };

  /* ── the assistant: write for me ────────────────────────────────── */
  screens.write = function (el, arg) {
    head(el, L('Write for me', 'Escribe por mí'));
    var KINDS = [['reply', L('Reply', 'Respuesta')], ['email', L('Email', 'Correo')], ['complaint', L('Complaint', 'Reclamación')], ['message', L('Message', 'Mensaje')], ['letter', L('Letter', 'Carta')]];
    var TONES = [['friendly', L('Friendly', 'Cercano')], ['formal', L('Formal', 'Formal')], ['firm', L('Firm', 'Firme')], ['short', L('Short', 'Breve')]];
    var kind = 'email', tone = 'friendly';
    function chipset(list, getv, setv) {
      var box = h('div', { class: 'chips' });
      function draw() { fill(box, list.map(function (x) { return h('button', { class: 'chip' + (getv() === x[0] ? ' on' : ''), 'aria-pressed': String(getv() === x[0]), onclick: function () { setv(x[0]); draw(); } }, x[1]); })); }
      draw(); return box;
    }
    var lang = langSelect('w-lang', S.lang);
    var ta = h('textarea', { id: 'w-text', placeholder: L('What should it say, and to whom? Or paste the message you got.', '¿Qué debe decir y a quién? O pega el mensaje que recibiste.'), 'aria-label': L('What to write', 'Qué escribir') }, (arg && arg.text) || '');
    var out = h('div', { class: 'screen' });
    function run() {
      if (!ta.value.trim()) { ta.focus(); return; }
      var b = busy(out, t('working'));
      ai('write', Object.assign({ text: ta.value.trim(), kind: kind, tone: tone, target: lang.value }, personal())).then(function (r) {
        b.remove();
        var body = h('textarea', { id: 'w-out', style: 'min-height:220px' }, r.text);
        var subj = r.subject ? h('input', { type: 'text', id: 'w-subj', value: r.subject }) : null;
        fill(out, subj ? h('label', { class: 'f' }, L('Subject', 'Asunto'), subj) : null, body, h('div', { class: 'row' },
          h('button', { class: 'btn gold', onclick: function () { (navigator.clipboard ? navigator.clipboard.writeText(body.value) : Promise.reject()).then(function () { toast(L('Copied.', 'Copiado.')); }).catch(function () { body.select(); }); } }, L('Copy', 'Copiar')),
          navigator.share ? h('button', { class: 'btn', onclick: function () { navigator.share({ title: subj ? subj.value : '', text: body.value }).catch(function () { }); } }, t('share')) : null,
          kind === 'email' || kind === 'complaint' ? h('a', { class: 'btn', href: 'mailto:?subject=' + encodeURIComponent(subj ? subj.value : '') + '&body=' + encodeURIComponent(body.value) }, L('Open in email', 'Abrir en el correo')) : null,
          h('button', { class: 'btn', onclick: function () { say(body.value, lang.value); } }, icon('speak'), L('Read it', 'Léelo'))),
          h('p', { class: 'small muted' }, L('Check it before sending: fill in anything in [brackets].', 'Revísalo antes de enviarlo: completa lo que esté entre [corchetes].')));
        say(r.speech);
      }).catch(function (e) { b.remove(); say(aiError(e)); });
    }
    add(el, [chipset(KINDS, function () { return kind; }, function (v) { kind = v; }), chipset(TONES, function () { return tone; }, function (v) { tone = v; }),
      h('label', { class: 'f' }, L('Write in', 'Escribir en'), lang), ta,
      h('div', { class: 'row' },
        h('button', { class: 'btn', onclick: function () { listen().then(function (x) { if (x) ta.value += (ta.value ? ' ' : '') + x; }).catch(function () { say(t('noSpeech')); }); } }, icon('mic'), t('dictate')),
        h('button', { class: 'btn gold', onclick: run }, L('Write it', 'Escríbelo') + ' · ✦ ' + (cat().credits.write || 4))), out]);
    if (arg && arg.text) run();
  };

  /* ── the assistant: scam coach ──────────────────────────────────── */
  screens.coach = function (el, arg) {
    head(el, L('Scam coach', 'Entrenador antiestafas'));
    var rules = h('div', { class: 'verdict v-unsure' }, h('div', { class: 'v' }, L('You can always hang up.', 'Siempre puedes colgar.')),
      h('p', { style: 'margin:.5em 0 0' }, L('No real bank, police or company will ask for a code, a password, gift cards, crypto or a transfer to a “safe account”. Hang up and call back on a number you already trust.',
        'Ningún banco, policía o empresa de verdad te pedirá un código, una contraseña, tarjetas regalo, criptomonedas o una transferencia a una «cuenta segura». Cuelga y llama tú a un número que ya conozcas.')));
    var SIT = [L('Someone says they’re from my bank', 'Dicen que llaman de mi banco'), L('A family member urgently needs money', 'Un familiar necesita dinero urgente'), L('Tech support says my computer has a virus', 'El soporte técnico dice que mi ordenador tiene un virus'),
      L('A text asks me to pay a delivery fee', 'Un SMS me pide pagar un envío'), L('Someone wants a code sent to my phone', 'Alguien quiere un código que me ha llegado'), L('The police or tax office says I owe money', 'La policía o Hacienda dice que debo dinero')];
    var ta = h('textarea', { id: 'coach-text', placeholder: L('What’s happening?', '¿Qué está pasando?'), 'aria-label': L('What’s happening?', '¿Qué está pasando?') }, (arg && arg.text) || '');
    var out = h('div', { class: 'screen' });
    function run() {
      if (!ta.value.trim()) { ta.focus(); return; }
      var b = busy(out, t('working'));
      ai('coach', Object.assign({ text: ta.value.trim() }, personal())).then(function (r) {
        b.remove();
        var cls = r.risk === 'high' ? 'v-ai' : r.risk === 'medium' ? 'v-unsure' : 'v-info';
        fill(out, h('div', { class: 'verdict ' + cls }, h('div', { class: 'v' }, { high: L('This looks like a scam', 'Esto parece una estafa'), medium: L('Be careful', 'Ten cuidado'), low: L('Probably fine, but check', 'Seguramente bien, pero compruébalo') }[r.risk]), h('p', { style: 'margin:.5em 0 0' }, r.speech)),
          h('h2', null, L('Say this', 'Di esto')), (r.say_this || []).map(function (x) { return h('div', { class: 'card big-card', style: 'font-size:1.2em' }, '“' + x + '”'); }),
          h('h2', null, L('Don’t', 'No hagas')), bullets(r.do_not, 'no'),
          h('h2', null, L('How to check', 'Cómo comprobarlo')), bullets(r.check, 'yes'),
          /familia|family|hij|son|daughter|nieto|grand|mum|mom|dad|madre|padre/i.test(ta.value) ? h('button', { class: 'btn', onclick: function () { go('safeword'); } }, t('t_safeword')) : null);
        say(r.speech + ' ' + (r.say_this && r.say_this[0] ? L('You can say: ', 'Puedes decir: ') + r.say_this[0] : ''));
        buzz(r.risk === 'high' ? [80, 60, 80] : 30);
      }).catch(function (e) { b.remove(); say(aiError(e)); });
    }
    add(el, [rules, h('div', { class: 'chips' }, SIT.map(function (x) { return h('button', { class: 'chip', onclick: function () { ta.value = x; run(); } }, x); })), ta,
      h('div', { class: 'row' },
        h('button', { class: 'btn', onclick: function () { listen().then(function (x) { if (x) { ta.value = x; run(); } }).catch(function () { say(t('noSpeech')); }); } }, icon('mic'), t('dictate')),
        h('button', { class: 'btn gold', onclick: run }, L('Help me', 'Ayúdame') + ' · ✦ ' + (cat().credits.coach || 3))), out]);
    say(L('You can always hang up. Tell me what’s happening.', 'Siempre puedes colgar. Cuéntame qué está pasando.'));
    if (arg && arg.text) run();
  };

  /* ── protect: emergency ─────────────────────────────────────────── */
  screens.emergency = function (el) {
    head(el, t('t_emergency'));
    var data = get('lens_card', {}), num = S.emergency || (/^en-US|^es-(US|MX)/.test(navigator.language || '') ? '911' : '112');
    var fields = ['card_name', 'card_med', 'card_allergy', 'card_meds', 'card_contact', 'card_note'];
    var text = fields.filter(function (k) { return data[k]; }).map(function (k) { return t(k) + ': ' + data[k]; }).join('. ');
    var numIn = h('input', { type: 'text', id: 'em-num', value: num, inputmode: 'tel', style: 'max-width:140px', onchange: function () { S.emergency = numIn.value.trim(); saveSettings(); } });
    add(el, [
      h('a', { class: 'btn sos', href: 'tel:' + num }, (S.lang === 'es' ? 'Llamar al ' : 'Call ') + num),
      h('button', { class: 'btn', onclick: function () {
        if (!navigator.geolocation) return;
        navigator.geolocation.getCurrentPosition(function (p) {
          var link = 'https://maps.google.com/?q=' + p.coords.latitude.toFixed(5) + ',' + p.coords.longitude.toFixed(5), msg = (S.lang === 'es' ? 'Necesito ayuda. Estoy aquí: ' : 'I need help. I am here: ') + link;
          if (navigator.share) navigator.share({ text: msg }).catch(function () { });
          else if (navigator.clipboard) navigator.clipboard.writeText(msg).then(function () { toast(msg); });
        }, function () { say(S.lang === 'es' ? 'No pude obtener tu ubicación.' : 'I could not get your location.'); }, { timeout: 8000 });
      } }, t('emerg_share')),
      h('dl', { class: 'card big-card' }, fields.filter(function (k) { return data[k]; }).map(function (k) { return [h('dt', null, t(k)), h('dd', null, data[k])]; })),
      h('button', { class: 'btn', onclick: function () { say(text || t('card_intro')); } }, icon('speak'), t('emerg_read')),
      h('label', { class: 'f' }, t('emerg_num'), numIn),
      h('button', { class: 'btn ghost', onclick: function () { go('card'); } }, t('t_card'))]);
    sayKey('emergency'); buzz([300, 100, 300]);
  };

  /* ── protect: family safe word ──────────────────────────────────── */
  screens.safeword = function (el) {
    head(el, t('t_safeword'));
    var w = h('input', { type: 'password', id: 'sw', value: get('lens_safeword', ''), autocomplete: 'off', onchange: function () { put('lens_safeword', w.value); } });
    var show = h('button', { class: 'btn ghost', onpointerdown: function () { w.type = 'text'; }, onpointerup: function () { w.type = 'password'; }, onpointerleave: function () { w.type = 'password'; } }, t('sw_show'));
    add(el, [h('p', { class: 'lede' }, t('sw_intro')), h('label', { class: 'f' }, t('sw_set'), w), show]);
    sayKey('safe_word');
  };

  /* ── the door: sign in, pay, wait ───────────────────────────────── */
  function gsiButton(host) {
    gsi().then(function () {
      google.accounts.id.initialize({ client_id: CLIENT_ID, callback: onGoogle, ux_mode: 'popup', use_fedcm_for_prompt: true });
      google.accounts.id.renderButton(host, { theme: 'filled_black', size: 'large', shape: 'pill', text: 'continue_with', locale: S.lang });
      try { google.accounts.id.prompt(); } catch (e) { }
    }).catch(function () { host.textContent = t('err'); });
  }
  screens.welcome = function (el) {
    var g = h('div', { id: 'gbtn', class: 'gbtn' });
    add(el, [h('div', { class: 'hero' }, orb(), h('h1', { class: 'rname' }, t('welcome_h')), h('p', { class: 'rsub wide' }, t('welcome_p')),
      h('p', { class: 'rsub wide', style: 'color:var(--gold)' }, L('Free to use. You start with 70 credits for Rosario’s AI, and get 20 more every month.', 'Gratis. Empiezas con 70 créditos para la IA de Rosario y recibes 20 más cada mes.')),
      h('p', { class: 'small muted' }, t('signin_btn')), g,
      h('p', { class: 'small muted', style: 'margin-top:18px' }, h('a', { href: 'privacy.html', target: '_blank', rel: 'noopener' }, L('Privacy policy', 'Política de privacidad'))))]);
    gsiButton(g);
    setTimeout(function () { sayKey('hello'); }, 600);
  };
  /* ── Google Play Billing (the Play copy only) ─────────────────────
     Plans and packs are bought through Google Play with the Digital
     Goods and Payment Request APIs that the Android app provides. The
     server checks each purchase with Google, grants it once, and
     acknowledges or consumes it. */
  var PLAY_SKU = { starter: 'luna_starter', pro: 'luna_pro', max: 'luna_max', credits_500: 'credits_500', credits_1500: 'credits_1500', credits_5000: 'credits_5000' };
  var Play = (function () {
    var svc = null, details = {};
    function service() {
      if (!isPlay() || !('getDigitalGoodsService' in window)) return Promise.resolve(null);
      if (svc) return Promise.resolve(svc);
      return window.getDigitalGoodsService('https://play.google.com/billing').then(function (x) { svc = x; return x; }).catch(function () { return null; });
    }
    function load() {
      return service().then(function (x) {
        if (!x) return details;
        return x.getDetails(Object.keys(PLAY_SKU).map(function (k) { return PLAY_SKU[k]; }))
          .then(function (list) { (list || []).forEach(function (d) { details[d.itemId] = d; }); return details; })
          .catch(function () { return details; });
      });
    }
    function price(product) {
      var d = details[PLAY_SKU[product]];
      if (!d || !d.price) return null;
      try { return new Intl.NumberFormat(S.lang === 'es' ? 'es-ES' : 'en-US', { style: 'currency', currency: d.price.currency }).format(Number(d.price.value)); }
      catch (e) { return d.price.value + ' ' + d.price.currency; }
    }
    function report(sku, token) {
      return call('/purchase/play', { product_id: sku, purchase_token: token }).then(function (m) { me = m; cacheMe(); renderPill(); return m; });
    }
    function buy(product) {
      var sku = PLAY_SKU[product];
      return service().then(function (x) {
        if (!x || !window.PaymentRequest) throw { error: L('Google Play purchases are not available on this device.', 'Las compras de Google Play no están disponibles en este dispositivo.') };
        var req = new PaymentRequest([{ supportedMethods: 'https://play.google.com/billing', data: { sku: sku } }],
          { total: { label: 'Total', amount: { currency: 'USD', value: '0' } } });
        return req.show().then(function (res) {
          return report(sku, res.details.purchaseToken)
            .then(function (m) { res.complete('success'); return m; }, function (e) { res.complete('fail'); throw e; });
        });
      });
    }
    /* Anything bought but not yet credited (the app closed mid-purchase,
       the network dropped) is handed to the server again. Harmless to
       repeat: the server grants each order once. */
    function restore() {
      return service().then(function (x) {
        if (!x || !x.listPurchases) return 0;
        return x.listPurchases().then(function (list) {
          return Promise.all((list || []).map(function (p) { return report(p.itemId, p.purchaseToken).then(function () { return 1; }, function () { return 0; }); }))
            .then(function (r) { return r.reduce(function (a, b) { return a + b; }, 0); });
        });
      }).catch(function () { return 0; });
    }
    return { available: function () { return service().then(Boolean); }, load: load, price: price, buy: buy, restore: restore };
  })();

  /* ── credits and plans ──────────────────────────────────────────── */
  var DEFAULT_CAT = {
    tiers: { free: { monthly: 20, price: 0, label: 'Free' }, starter: { monthly: 800, price: 7.99, label: 'Starter' }, pro: { monthly: 2500, price: 19.99, voice: true, label: 'Pro' }, max: { monthly: 7000, price: 49.99, voice: true, deep: true, label: 'Luna Max' } },
    packs: { credits_500: { credits: 500, price: 6.99 }, credits_1500: { credits: 1500, price: 17.99 }, credits_5000: { credits: 5000, price: 49.99 } },
    credits: { rosario: 4, detect_image: 25, detect_frames: 60, describe: 8, summarize: 15, write: 10, coach: 8, translate: 5 }, speak_chars_per_credit: 10
  };
  function cat() { return (me && me.catalogue) || DEFAULT_CAT; }
  /* Credits in words a person can picture. */
  function approx(n) {
    var c = cat().credits;
    return L('about ', 'unas ') + fmt(Math.floor(n / c.detect_image)) + L(' AI checks, or ', ' revisiones de IA, o ') + fmt(Math.floor(n / c.rosario)) + L(' questions to Rosario', ' preguntas a Rosario');
  }
  function usd(n) { return '$' + Number(n).toFixed(2); }
  function planPrice(product, perMonth) {
    var p = isPlay() && Play.price(product);
    var base = cat().tiers[product] ? cat().tiers[product].price : cat().packs[product].price;
    return (p || usd(base)) + (perMonth ? L(' / month', ' / mes') : '');
  }
  var PLAN_POINTS = {
    starter: function () { return [L('Every Rosario feature', 'Todas las funciones de Rosario')]; },
    pro: function () { return [L('Rosario’s natural voice', 'La voz natural de Rosario'), L('Every Rosario feature', 'Todas las funciones de Rosario')]; },
    max: function () { return [L('Deepest AI checks', 'Las revisiones de IA más profundas'), L('Rosario’s natural voice', 'La voz natural de Rosario'), L('New features first', 'Novedades antes que nadie')]; }
  };
  screens.shop = function (el) {
    head(el, L('Credits and plans', 'Créditos y planes'));
    var box = h('div', { class: 'screen' }); el.appendChild(box);
    var play = isPlay();
    function done(m) { buzz([30, 60, 30]); sayKey('activated'); draw(); return m; }
    function buyBtn(product, label, cls) {
      var b = h('button', { class: 'btn ' + (cls || 'gold'), onclick: function () {
        if (play) {
          b.disabled = true;
          Play.buy(product).then(done).catch(function (e) { b.disabled = false; if (e && e.name === 'AbortError') return; say(aiError(e)); });
        } else webBuy(product);
      } }, label);
      return b;
    }
    function draw() {
      fill(box, busy(h('div')));
      Promise.all([refreshMe(), play ? Play.load() : null]).then(function () {
        var m = me || {}, tiers = cat().tiers, packs = cat().packs, es = S.lang === 'es';
        var cur = m.owner ? 'owner' : (m.tier || 'free');
        var bal = h('div', { class: 'card screen balance' },
          h('div', { class: 'small muted' }, m.owner ? L('Owner', 'Propietario') : (L('Your plan: ', 'Tu plan: ') + (tiers[cur] ? tiers[cur].label : cur))),
          m.owner ? h('div', { class: 'price' }, L('No limits', 'Sin límites')) : [
            h('div', { class: 'price' }, '✦ ' + fmt(m.credits || 0), h('small', { class: 'muted' }, ' ' + L('credits', 'créditos'))),
            h('p', { style: 'margin:.2em 0 0' }, approx(m.credits || 0)),
            h('p', { class: 'small muted', style: 'margin:.4em 0 0' },
              fmt(m.sub_credits || 0) + L(' monthly', ' del mes') + ' · ' + fmt(m.pack_credits || 0) + L(' bought or welcome (never expire)', ' comprados o de bienvenida (no caducan)') +
              (m.renews ? ' · ' + (cur === 'free' ? L('20 more on ', '20 más el ') : L('Renews ', 'Se renueva el ')) + new Date(m.renews).toLocaleDateString(es ? 'es-ES' : 'en-GB', { day: 'numeric', month: 'long' }) : '')),
            m.legacy ? h('p', { class: 'small muted', style: 'margin:.4em 0 0' }, m.legacy.label + ' · ' + L('until ', 'hasta ') + new Date(m.legacy.expires_at).toLocaleDateString(es ? 'es-ES' : 'en-GB') + L(' (used first)', ' (se usa primero)')) : null,
            m.pending ? h('p', { class: 'small', style: 'margin:.4em 0 0;color:var(--gold)' }, L('A payment is waiting for confirmation.', 'Hay un pago esperando confirmación.')) : null
          ]);
        var plans = ['starter', 'pro', 'max'].map(function (k) {
          var tr = tiers[k], mine = cur === k;
          return h('div', { class: 'card plan' + (k === 'pro' ? ' featured' : '') },
            k === 'pro' ? h('div', { class: 'tag' }, L('Most chosen', 'El más elegido')) : null,
            h('h3', null, tr.label), h('div', { class: 'price' }, planPrice(k, true)),
            h('p', { style: 'margin:.2em 0' }, h('b', null, fmt(tr.monthly) + L(' credits every month', ' créditos cada mes'))),
            h('p', { class: 'small muted', style: 'margin:0 0 .4em' }, approx(tr.monthly)),
            h('ul', { class: 'small' }, PLAN_POINTS[k]().map(function (x) { return h('li', null, x); })),
            mine ? h('div', { class: 'btn ghost', 'aria-disabled': 'true' }, L('Your plan', 'Tu plan')) : buyBtn(k, (play ? L('Subscribe', 'Suscribirme') : L('Buy one month', 'Comprar un mes')), k === 'pro' ? 'gold' : ''));
        });
        var packCards = Object.keys(packs).map(function (k) {
          return h('div', { class: 'card pack' }, h('b', null, '✦ ' + fmt(packs[k].credits)), h('div', { class: 'price small' }, planPrice(k)),
            h('p', { class: 'small muted', style: 'margin:.2em 0 .5em' }, approx(packs[k].credits)), buyBtn(k, L('Buy', 'Comprar'), ''));
        });
        var c = cat().credits;
        var prices = [[L('A question to Rosario', 'Una pregunta a Rosario'), c.rosario], [L('Translate a sentence', 'Traducir una frase'), c.translate],
          [L('Describe what the camera sees', 'Describir lo que ve la cámara'), c.describe], [L('Explain a letter or bill', 'Explicar una carta o factura'), c.summarize],
          [L('Write an email or message', 'Escribir un correo o mensaje'), c.write], [L('Scam coach', 'Entrenador antiestafas'), c.coach],
          [L('AI check of a photo, text, voice or message', 'Revisión de IA de una foto, texto, voz o mensaje'), c.detect_image], [L('AI check of a video', 'Revisión de IA de un vídeo'), c.detect_frames],
          [L('Rosario speaking in her natural voice', 'Rosario hablando con su voz natural'), L('1 per ' + (cat().speak_chars_per_credit || 25) + ' letters (about 5 an answer)', '1 cada ' + (cat().speak_chars_per_credit || 25) + ' letras (unos 5 por respuesta)')]];
        fill(box, bal,
          h('h2', null, L('Plans', 'Planes')),
          h('p', { class: 'small muted' }, play ? L('Billed monthly by Google Play. Cancel any time in Google Play → Subscriptions. Unused monthly credits don’t roll over.', 'Google Play lo cobra cada mes. Cancela cuando quieras en Google Play → Suscripciones. Los créditos del mes que no uses no se acumulan.')
            : L('On the web, each payment is one month and never renews by itself. Unused monthly credits don’t roll over.', 'En la web, cada pago es un mes y nunca se renueva solo. Los créditos del mes que no uses no se acumulan.')),
          h('div', { class: 'plans' }, plans),
          h('h2', null, L('Top up', 'Recargar')),
          h('p', { class: 'small muted' }, L('Bought credits never expire and work with any plan, including Free.', 'Los créditos comprados no caducan y sirven con cualquier plan, también el gratuito.')),
          h('div', { class: 'packs' }, packCards),
          h('h2', null, L('What things cost', 'Lo que cuesta cada cosa')),
          h('div', { class: 'card' }, h('dl', { class: 'costs' }, prices.map(function (x) { return [h('dt', null, x[0]), h('dd', null, typeof x[1] === 'number' ? '✦ ' + x[1] : x[1])]; }))),
          h('p', { class: 'small muted' }, L('Free, always: everything that runs on your phone — reading text aloud, the magnifier, colours, QR and link checks, file checks, invisible Lunara Marks, reminders, lists, notes, memory, the safe word and the emergency screen. Rosario’s recorded voice and your phone’s voice are free too.',
            'Gratis, siempre: todo lo que funciona en tu teléfono — leer texto en voz alta, la lupa, los colores, revisar códigos QR y enlaces, revisar archivos, las Lunara Marks invisibles, recordatorios, listas, notas, memoria, la palabra clave y la pantalla de emergencia. La voz grabada de Rosario y la voz de tu teléfono también son gratis.')),
          play ? h('button', { class: 'btn ghost', onclick: function () { Play.restore().then(function (n) { say(n ? t('activated') : L('No purchases to restore.', 'No hay compras que restaurar.')); draw(); }); } }, L('Restore purchases', 'Restaurar compras')) : webExtras(),
          h('button', { class: 'btn ghost', onclick: function () { go('history'); } }, L('Credit history', 'Historial de créditos')));
        if (!play && window.LunaraPricing && LunaraPricing.refresh) LunaraPricing.refresh();
      });
    }
    /* The web: PayPal, then the Transaction ID from the receipt. */
    var chosen = h('select', { id: 'claim-product' }, ['starter', 'pro', 'max', 'credits_500', 'credits_1500', 'credits_5000'].map(function (k) {
      var tr = cat().tiers[k], pk = cat().packs[k];
      return h('option', { value: k }, tr ? tr.label + ' · ' + usd(tr.price) : fmt(pk.credits) + L(' credits · ', ' créditos · ') + usd(pk.price));
    }));
    function webBuy(product) {
      if (me && me.paypal_client_id) return checkout(product);
      var url = window.LunaraPricing && LunaraPricing.get('lens_' + product) && LunaraPricing.get('lens_' + product).link ? LunaraPricing.url('lens_' + product) : null;
      chosen.value = product;
      if (url) { window.open(url, '_blank', 'noopener'); say(L('After paying, enter the Transaction ID from your PayPal receipt below.', 'Después de pagar, escribe abajo el identificador de la transacción de tu recibo de PayPal.')); }
      else { location.href = 'mailto:lunarasociety@gmail.com?subject=' + encodeURIComponent('Rosario ' + product) + '&body=' + encodeURIComponent(L('I would like to buy: ', 'Quiero comprar: ') + product + '\n' + (raw('lunara_email') || '')); }
      var f = document.getElementById('claim-box'); if (f) f.scrollIntoView({ behavior: 'smooth' });
    }
    /* Pay by card (or PayPal) right here: PayPal's own buttons, including
       "Debit or Credit Card", which needs no PayPal account. The server
       sets the price and adds the credits the moment the payment clears. */
    function checkout(product) {
      var tr = cat().tiers[product], pk = cat().packs[product];
      var what = tr ? tr.label + ' · ' + usd(tr.price) + L(' · 1 month', ' · 1 mes') : fmt(pk.credits) + L(' credits · ', ' créditos · ') + usd(pk.price);
      var old = document.getElementById('checkout'); if (old) old.remove();
      var box = h('div', { id: 'pp-box', style: 'min-height:120px' }, busy(h('div'), L('Opening secure checkout…', 'Abriendo el pago seguro…')));
      var status = h('p', { class: 'small muted', role: 'status' }, '');
      var sheet = h('div', { class: 'card screen checkout', id: 'checkout', role: 'dialog', 'aria-label': L('Checkout', 'Pago') },
        h('div', { class: 'row', style: 'justify-content:space-between;align-items:center' }, h('b', null, what),
          h('button', { class: 'iconbtn', 'aria-label': t('cancel'), onclick: function () { sheet.remove(); } }, '×')),
        h('p', { class: 'small muted', style: 'margin:0' }, L('Pay with a debit or credit card, or with PayPal. No PayPal account needed for cards. Your credits arrive straight away.', 'Paga con tarjeta de débito o crédito, o con PayPal. Para la tarjeta no necesitas cuenta de PayPal. Los créditos llegan al momento.')),
        box, status);
      var host = document.querySelector('.balance'); if (host) host.parentNode.insertBefore(sheet, host.nextSibling); else main.appendChild(sheet);
      sheet.scrollIntoView({ behavior: 'smooth', block: 'center' });
      loadScript('https://www.paypal.com/sdk/js?client-id=' + encodeURIComponent(me.paypal_client_id) + '&currency=USD&intent=capture&components=buttons&disable-funding=paylater,venmo,credit&locale=' + (S.lang === 'es' ? 'es_ES' : 'en_US'))
        .then(function () {
          box.innerHTML = '';
          return window.paypal.Buttons({
            style: { layout: 'vertical', color: 'gold', shape: 'pill', label: 'pay', height: 48 },
            createOrder: function () { return call('/pay/create', { product: product }).then(function (r) { return r.order_id; }); },
            onApprove: function (data) {
              status.textContent = L('Confirming your payment…', 'Confirmando tu pago…');
              return call('/pay/capture', { order_id: data.orderID }).then(function (m) {
                me = m; cacheMe(); renderPill(); sheet.remove(); done(m);
              }).catch(function (e) { status.textContent = aiError(e); say(aiError(e)); });
            },
            onCancel: function () { status.textContent = L('Payment cancelled. Nothing was charged.', 'Pago cancelado. No se ha cobrado nada.'); },
            onError: function () { status.textContent = L('The payment could not be started. Try again in a moment.', 'No se pudo iniciar el pago. Inténtalo de nuevo en un momento.'); }
          }).render(box);
        }).catch(function () { box.innerHTML = ''; status.textContent = L('Secure checkout could not load. Check your connection and try again.', 'No se pudo cargar el pago seguro. Revisa tu conexión e inténtalo de nuevo.'); });
    }
    function webExtras() {
      var txn = h('input', { type: 'text', id: 'txn', autocomplete: 'off', placeholder: '9AB12345CD6789012', style: 'text-transform:uppercase' });
      var code = h('input', { type: 'text', id: 'code', autocomplete: 'off', placeholder: 'LENS-XXXX-XXXX', style: 'text-transform:uppercase' });
      if (me && me.paypal_client_id) return h('div', { class: 'card screen', id: 'claim-box' },
        h('label', { class: 'f' }, t('pay_code'), code),
        h('button', { class: 'btn ghost', onclick: function () { call('/redeem', { code: code.value }).then(done).catch(function (e) { say(aiError(e)); }); } }, t('redeem_go')));
      return h('div', { class: 'card screen', id: 'claim-box' },
        h('b', null, L('Paid with PayPal?', '¿Pagaste con PayPal?')),
        h('label', { class: 'f' }, L('What you bought', 'Lo que compraste'), chosen),
        h('label', { class: 'f' }, t('pay_txn'), txn),
        h('button', { class: 'btn', onclick: function () { call('/claim', { paypal_txn: txn.value, product: chosen.value }).then(function (m) { me = m; cacheMe(); renderPill(); if (m.pending) { say(L('Thank you. Your payment is waiting for confirmation.', 'Gracias. Tu pago está esperando confirmación.')); } else done(m); draw(); }).catch(function (e) { say(aiError(e)); }); } }, t('pay_send')),
        h('label', { class: 'f' }, t('pay_code'), code),
        h('button', { class: 'btn ghost', onclick: function () { call('/redeem', { code: code.value }).then(done).catch(function (e) { say(aiError(e)); }); } }, t('redeem_go')));
    }
    draw();
  };
  screens.history = function (el) {
    head(el, L('Credit history', 'Historial de créditos'));
    var box = h('div', { class: 'screen' }, busy(h('div'))); el.appendChild(box);
    var KIND = { welcome: L('Welcome', 'Bienvenida'), monthly: L('Monthly credits', 'Créditos del mes'), plan: L('Plan', 'Plan'), plan_ended: L('Plan ended', 'Plan terminado'), pack: L('Credits bought', 'Créditos comprados'), gift: L('Gift', 'Regalo'), refund: L('Returned (no answer)', 'Devueltos (sin respuesta)'), spend: L('Used', 'Usados') };
    call('/history').then(function (r) {
      fill(box, (r.rows || []).length ? r.rows.map(function (x) {
        var what = x.kind === 'spend' ? String(x.ref || '').split(':')[0] : '';
        return h('div', { class: 'row small', style: 'justify-content:space-between;border-bottom:1px solid var(--line-2);padding:8px 0' },
          h('span', null, (KIND[x.kind] || x.kind) + (what ? ' · ' + what.replace(/_/g, ' ') : ''), h('span', { class: 'muted', style: 'display:block' }, new Date(x.at).toLocaleString(S.lang === 'es' ? 'es-ES' : 'en-GB'))),
          h('b', { style: 'color:' + (x.delta < 0 ? 'var(--muted)' : 'var(--gold)') }, (x.delta > 0 ? '+' : '') + fmt(x.delta)));
      }) : h('p', { class: 'muted' }, L('Nothing yet.', 'Nada todavía.')));
    }).catch(function (e) { fill(box, h('p', { class: 'note' }, aiError(e))); });
  };

  /* ── the owner's desk ───────────────────────────────────────────── */
  screens.owner = function (el) {
    head(el, t('od_h'));
    if (!me || !me.owner) { el.appendChild(h('p', null, 'Not allowed.')); return; }
    var box = h('div', { class: 'screen' }); el.appendChild(box);
    function draw() {
      fill(box, busy(h('div')));
      call('/admin/overview').then(function (o) {
        var st = o.stats || {};
        var es = S.lang === 'es';
        /* The stop. Halts every AI and voice call for every member at once. */
        var stop = h('div', { class: 'card screen', style: o.paused ? 'border-color:#c0504d' : '' },
          h('b', null, o.paused ? (es ? 'La IA de Rosario está DETENIDA' : 'Rosario\u2019s AI is STOPPED') : (es ? 'La IA de Rosario está activa' : 'Rosario\u2019s AI is running')),
          h('p', { class: 'small muted' }, es ? 'Detiene al instante toda llamada de IA y voz para todos los miembros. Lo que funciona en el teléfono sigue funcionando.' : 'Stops every AI and voice call for every member at once. Everything that runs on the phone keeps working.'),
          h('button', { class: 'btn ' + (o.paused ? 'gold' : 'sos'), onclick: function () {
            var next = !o.paused;
            if (next && !confirm(es ? '¿Detener toda la IA ahora?' : 'Stop all AI now?')) return;
            call('/admin/pause', { paused: next }).then(function () { say(next ? (es ? 'IA detenida.' : 'AI stopped.') : (es ? 'IA reanudada.' : 'AI resumed.')); draw(); }).catch(function (e) { say(aiError(e)); });
          } }, o.paused ? (es ? 'Reanudar la IA' : 'Resume AI') : (es ? 'Detener toda la IA' : 'Stop all AI')));
        fill(box,
          stop,
          h('div', { class: 'stats' },
            [[t('od_spent'), '$' + Number(st.spent_usd || 0).toFixed(2)], [t('od_calls'), st.calls || 0], [L('Accounts', 'Cuentas'), st.accounts || 0], [L('Paying', 'De pago'), st.paying || 0],
              [L('Credits used', 'Créditos usados'), fmt(st.credits_spent || 0)], [L('Purchases', 'Compras'), st.purchases || 0], [t('od_lic'), st.active_licences || 0], [t('od_pending'), st.pending_claims || 0]]
              .map(function (x) { return h('div', { class: 'stat' }, h('b', null, String(x[1])), h('span', null, x[0])); })),
          h('h2', null, t('od_pending')),
          (o.claims || []).length ? o.claims.map(function (c) {
            return h('div', { class: 'card screen' }, h('div', null, c.email), h('div', { class: 'small muted key' }, c.paypal_txn), h('div', { class: 'small' }, L('Says they bought: ', 'Dice que compró: ') + (c.product || L('the earlier $25 month', 'el antiguo mes de 25 $'))), h('div', { class: 'small muted' }, new Date(c.created_at).toLocaleString()),
              h('div', { class: 'row' },
                h('button', { class: 'btn gold', onclick: function () { call('/admin/claim', { claim_id: c.id }).then(function () { say(S.lang === 'es' ? 'Aprobado.' : 'Approved.'); draw(); }).catch(function (e) { say(aiError(e)); }); } }, t('od_approve')),
                h('button', { class: 'btn ghost', onclick: function () { call('/admin/claim', { claim_id: c.id, decision: 'reject' }).then(draw); } }, t('od_reject'))));
          }) : h('p', { class: 'muted' }, t('od_none')),
          h('h2', null, L('Reported answers', 'Respuestas denunciadas') + ' · ' + (o.reports || []).length),
          (o.reports || []).length ? o.reports.map(function (rp) {
            return h('div', { class: 'card screen' }, h('div', { class: 'small muted' }, rp.email + ' · ' + rp.task + ' · ' + (rp.reason || '') + ' · ' + new Date(rp.created_at).toLocaleString()),
              h('div', { style: 'white-space:pre-wrap' }, rp.answer),
              h('button', { class: 'btn ghost', onclick: function () { call('/admin/report', { id: rp.id }).then(draw); } }, L('Mark reviewed', 'Marcar revisada')));
          }) : h('p', { class: 'muted' }, L('None.', 'Ninguna.')),
          h('h2', null, L('Give credits or a plan', 'Regalar créditos o un plan')), giftForm(),
          h('h2', null, t('od_codes')), codeForm(),
          h('h2', null, L('Recent accounts', 'Cuentas recientes')),
          (o.wallets || []).map(function (w) { return h('div', { class: 'small', style: 'display:flex;justify-content:space-between;gap:8px;padding:6px 0;border-bottom:1px solid var(--line-2)' }, h('span', null, w.email), h('span', { class: 'muted' }, w.tier + ' · ✦ ' + fmt(w.sub_credits + w.pack_credits))); }),
          h('h2', null, S.lang === 'es' ? 'Licencias recientes' : 'Recent licences'),
          (o.licences || []).map(function (l) { return h('div', { class: 'small', style: 'display:flex;justify-content:space-between;gap:8px;padding:6px 0;border-bottom:1px solid var(--line-2)' }, h('span', null, l.email), h('span', { class: 'muted' }, l.plan + ' · ' + new Date(l.expires_at).toLocaleDateString())); }));
      }).catch(function (e) { fill(box, h('p', { class: 'note' }, aiError(e))); });
    }
    function productSelect(id) {
      return h('select', { id: id }, [['pro', 'Pro · 1 ' + L('month', 'mes')], ['starter', 'Starter · 1 ' + L('month', 'mes')], ['max', 'Luna Max · 1 ' + L('month', 'mes')],
        ['credits_500', '500 ' + L('credits', 'créditos')], ['credits_1500', '1,500 ' + L('credits', 'créditos')], ['credits_5000', '5,000 ' + L('credits', 'créditos')]].map(function (x) { return h('option', { value: x[0] }, x[1]); }));
    }
    function giftForm() {
      var em = h('input', { type: 'email', id: 'g-email', placeholder: t('od_email') }), what = productSelect('g-what');
      var n = h('input', { type: 'number', id: 'g-credits', value: 100, min: 1 });
      return h('div', { class: 'card screen' }, em, h('label', { class: 'f' }, L('Plan or pack', 'Plan o paquete'), what),
        h('button', { class: 'btn', onclick: function () {
          var v = what.value, body = /^credits_/.test(v) ? { email: em.value, credits: +v.split('_')[1] } : { email: em.value, tier: v, days: 31 };
          call('/admin/credits', body).then(function (r) { toast('✓ ' + r.email); draw(); }).catch(function (e) { say(aiError(e)); });
        } }, t('od_give')),
        h('label', { class: 'f' }, L('Or any number of credits', 'O cualquier número de créditos'), n),
        h('button', { class: 'btn ghost', onclick: function () { call('/admin/credits', { email: em.value, credits: +n.value }).then(function (r) { toast('✓ ' + r.email + ' +' + r.credits); draw(); }).catch(function (e) { say(aiError(e)); }); } }, t('od_give')));
    }
    function codeForm() {
      var n = h('input', { type: 'number', id: 'c-n', value: 3, min: 1, max: 50 }), what = productSelect('c-what'), out = h('div', { class: 'key' });
      return h('div', { class: 'card screen' }, h('label', { class: 'f' }, L('What each code gives', 'Qué da cada código'), what), h('label', { class: 'f' }, L('How many', 'Cuántos'), n),
        h('button', { class: 'btn', onclick: function () { call('/admin/codes', { count: +n.value, plan: what.value, days: 31 }).then(function (r) { out.textContent = r.codes.join('\n'); }).catch(function (e) { say(aiError(e)); }); } }, t('od_codes')), out);
    }
    draw();
  };

  /* ── account and settings ───────────────────────────────────────── */
  screens.account = function (el) {
    head(el, t('t_account'));
    var box = h('div', { class: 'screen' }); el.appendChild(box);
    function draw() {
      box.innerHTML = '';
      if (!session()) {
        var gbtn = h('div', { id: 'gbtn', style: 'min-height:44px' });
        add(box, [h('p', { class: 'lede' }, t('acc_signin')), gbtn]);
        gsiButton(gbtn);
      } else {
        add(box, h('p', { class: 'small muted' }, t('acc_signed') + ' ' + (raw('lunara_email') || raw('lunara_name') || raw('lunara_id') || '')));
        var planBox = h('button', { class: 'card', style: 'text-align:left;width:100%', onclick: function () { go('shop'); } }, h('div', { class: 'busy' }, h('div', { class: 'spinner' })));
        box.appendChild(planBox);
        refreshMe().then(function (m) {
          if (!m) { fill(planBox, h('p', { style: 'margin:0' }, t('err'))); return; }
          if (m.owner) { fill(planBox, h('div', { class: 'small muted' }, t('acc_plan')), h('div', { class: 'price', style: 'font-size:1.5em' }, t('owner_badge'))); return; }
          var tier = cat().tiers[m.tier] || { label: m.tier };
          fill(planBox, h('div', { class: 'small muted' }, t('acc_plan') + ': ' + tier.label),
            h('div', { class: 'price', style: 'font-size:1.6em' }, '✦ ' + fmt(m.credits) + ' ', h('small', { class: 'muted' }, L('credits', 'créditos'))),
            h('div', { class: 'small muted' }, approx(m.credits)),
            h('div', { class: 'small', style: 'margin-top:8px;color:var(--gold)' }, L('Plans and credits →', 'Planes y créditos →')));
          if (m.plan === 'api_month') {
            var keyOut = h('div');
            box.insertBefore(h('div', { class: 'card screen' }, h('button', { class: 'btn', onclick: function () { call('/apikey', { label: 'app' }).then(function (k) { fill(keyOut, h('div', { class: 'key' }, k.key), h('p', { class: 'small muted' }, t('apikey_note'))); }).catch(function (e) { say(aiError(e)); }); } }, t('apikey')), keyOut), planBox.nextSibling);
          }
        });
        if (!inAndroidApp()) add(box, h('a', { class: 'btn', href: 'get.html' }, icon('files'), L('Download the Android app', 'Descargar la app de Android')));
        add(box, h('button', { class: 'btn ghost', onclick: signOut }, t('acc_out')));
      }
      settingsBlock(box);
      add(box, h('p', { class: 'note' }, t('privacy')), h('a', { class: 'small', href: 'privacy.html', target: '_blank', rel: 'noopener' }, L('Privacy policy', 'Política de privacidad')));
      if (session()) deleteBlock(box);
    }
    draw();
  };

  /* Deleting the account, as Google Play requires: from inside the app,
     with the consequences said plainly and a typed confirmation. */
  screens.deleteaccount = function (el) { current.arg = 'delete'; screens.account(el); };
  function deleteBlock(box) {
    var inp = h('input', { type: 'text', id: 'del-confirm', autocomplete: 'off', placeholder: L('Type DELETE', 'Escribe DELETE') });
    var btn = h('button', { class: 'btn sos', onclick: function () {
      if (inp.value.trim().toUpperCase() !== 'DELETE') { say(L('Type DELETE to confirm.', 'Escribe DELETE para confirmar.')); inp.focus(); return; }
      btn.disabled = true;
      call('/account/delete', { confirm: 'DELETE' }).then(function () {
        wipeLocal().then(function () { say(L('Your account has been deleted.', 'Tu cuenta se ha eliminado.')); signOut(); });
      }).catch(function (e) { btn.disabled = false; say(aiError(e)); });
    } }, L('Delete my account', 'Eliminar mi cuenta'));
    add(box, h('details', { class: 'card danger', id: 'delete-account' },
      h('summary', null, L('Delete my account', 'Eliminar mi cuenta')),
      h('p', { class: 'small' }, L('This deletes your Lunara account and everything Rosario keeps for it: credits, plan, history, and the memory, lists, notes, reminders and files on this phone. Any Lunara Marks you made are revoked. It cannot be undone. A Google Play subscription must also be cancelled in Google Play, or it will keep charging.',
        'Esto elimina tu cuenta de Lunara y todo lo que Rosario guarda de ella: créditos, plan, historial, y la memoria, las listas, notas, recordatorios y archivos de este teléfono. Las Lunara Marks que hiciste quedan revocadas. No se puede deshacer. Una suscripción de Google Play también hay que cancelarla en Google Play, o seguirá cobrando.')),
      inp, btn));
    if (current.arg === 'delete' || location.hash === '#deleteaccount') setTimeout(function () { var d = document.getElementById('delete-account'); if (d) { d.open = true; d.scrollIntoView({ behavior: 'smooth' }); } }, 300);
  }
  function wipeLocal() {
    try { Object.keys(localStorage).filter(function (k) { return /^(lens_|lunara_)/.test(k); }).forEach(function (k) { localStorage.removeItem(k); }); } catch (e) { }
    return new Promise(function (res) { try { var r = indexedDB.deleteDatabase('lunara-lens'); r.onsuccess = r.onerror = r.onblocked = function () { res(); }; } catch (e) { res(); } });
  }
  function settingsBlock(box) {
    function sw(key, label) {
      var i = h('input', { type: 'checkbox', id: 'set-' + key, checked: S[key] || null, onchange: function () { S[key] = i.checked; saveSettings(); if (key === 'handsFree') wake(S.handsFree); } });
      return h('label', { class: 'switch', for: 'set-' + key }, h('span', null, label), i);
    }
    var lang = h('select', { id: 'set-lang', onchange: function () { S.lang = lang.value; saveSettings(); renderPill(); go('account', null, true); } }, ['en', 'es'].map(function (l) { return h('option', { value: l, selected: S.lang === l || null }, l === 'en' ? 'English' : 'Español'); }));
    var rate = h('input', { type: 'range', id: 'set-rate', min: 0.6, max: 1.5, step: 0.1, value: S.rate, onchange: function () { S.rate = +rate.value; saveSettings(); say(S.lang === 'es' ? 'Así sueno ahora.' : 'This is how I sound now.'); } });
    add(box, [h('h2', null, S.lang === 'es' ? 'Ajustes' : 'Settings'), h('label', { class: 'f' }, t('set_lang'), lang), h('label', { class: 'f' }, t('set_rate'), rate),
      sw('speak', t('set_speak')), sw('natural', t('voice_natural')), sw('handsFree', t('handsFree')), sw('big', t('set_big')), sw('hc', t('set_contrast')), sw('haptic', t('set_haptic'))]);
  }

  /* ── voice commands ─────────────────────────────────────────────── */
  var NUM = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10 };
  function num(s) { s = String(s || '').toLowerCase(); return NUM[s] || parseInt(s, 10) || 0; }
  function parse(q) {
    var s = q.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[¿?¡!.,]/g, ' ').replace(/\s+/g, ' ').trim();
    var m;
    var raw0 = String(q).trim().replace(/[.!?¡¿]+$/, '');
    // The personal assistant: understood on the phone, free.
    if ((m = /^(?:please\s+)?(?:remember|don'?t forget)\s+(?:that\s+)(.+)$/i.exec(raw0)) || (m = /^(?:por favor\s+)?recuerda\s+que\s+(.+)$/i.exec(raw0))) return { action: 'remember_fact', text: m[1] };
    if ((m = /^(?:forget|olvida)\s+(?:that\s+|que\s+|lo de\s+)?(.+)$/i.exec(raw0)) && !/everything|todo/i.test(m[1])) return { action: 'forget_fact', text: m[1] };
    if (/(what do you (remember|know) about me|what have i told you|que recuerdas|que sabes de mi|mi memoria)/.test(s)) return { action: 'memory' };
    // Lists keep their commas: "milk, bread and eggs" is three things.
    var sc = q.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[¿?¡!.]/g, ' ').replace(/\s+/g, ' ').trim();
    if ((m = /^(?:add|put)\s+(.+?)\s+(?:to|on)\s+(?:my\s+|the\s+)?list$/.exec(sc))) return { action: 'list_add', text: m[1], list: '' };
    if ((m = /^(?:add|put)\s+(.+?)\s+(?:to|on)\s+(?:my\s+|the\s+)(.+?)\s+list$/.exec(sc)) || (m = /^(?:add|put)\s+(.+?)\s+(?:to|on)\s+(.+?)\s+list$/.exec(sc))) return { action: 'list_add', text: m[1], list: m[2] };
    if ((m = /^(?:anade|agrega|apunta|pon|mete)\s+(.+?)\s+(?:a|en)\s+(?:la\s+|mi\s+)?lista(?:\s+de(?:\s+la)?\s+(.+))?$/.exec(sc))) return { action: 'list_add', text: m[1], list: m[2] || '' };
    if ((m = /(?:what'?s|what is|read)\s+(?:on\s+)?(?:my\s+|the\s+)?(.+?)\s+list/.exec(s)) || (m = /(?:que hay en|lee|leeme)\s+(?:mi\s+|la\s+)?lista(?:\s+de(?:\s+la)?\s+(.+))?/.exec(s))) return { action: 'list_read', list: m[1] || '' };
    if (/^(my lists|lists|mis listas|listas)$/.test(s)) return { action: 'lists' };
    if ((m = /\b(work|home|trabajo|casa)\s+mode\b|\bmodo\s+(trabajo|casa)\b/.exec(s))) return { action: 'mode', text: m[1] || m[2] };
    if (/(plan my day|what should i do (first|today)|planifica mi dia|organiza mi dia|que hago hoy)/.test(s)) return { action: 'plan_day' };
    if (/(let'?s talk|let'?s chat|conversation mode|talk mode|keep listening|hablemos|modo conversacion|charlemos)/.test(s)) return { action: 'talk' };
    if (/(credits|creditos|buy (more )?credits|comprar creditos|my plan|mi plan|subscription|suscripcion|luna max|upgrade)/.test(s)) return { action: 'shop' };
    if (/(someone is calling|they say (they'?re|they are) from|says? (they'?re|they are|he'?s|she'?s|it'?s) from|says (he|she|they)'?s? from (my|the) bank|asking for (a|my) code|me (esta|estan) llamando|dicen que (son|llaman) de|me piden (un|el) codigo)/.test(s)) return { action: 'coach', text: raw0 };
    if (/^(write|draft|escribe|redacta)\b/.test(s)) return { action: 'write', text: raw0.replace(/^(write|draft|escribe|redacta)\s*(me\s+|me\s+un\s+|un\s+|una\s+|an?\s+)?/i, '') };
    if ((m = /(?:put|move|organi[sz]e|place|save)\s+(?:the\s+)?(?:last|latest|newest)?\s*(\w+)?\s*(?:photos?|images?|pictures?|pics?)\s+(?:in|into|to)\s+(?:the\s+|a\s+)?(?:folder\s+)?(?:called\s+|named\s+)?(.+)$/.exec(s))) return { action: 'organize', n: num(m[1]) || 1, folder: m[2].replace(/\s+folder$/, '') };
    if ((m = /(?:pon|mueve|guarda|organiza|mete)\s+(?:las\s+|la\s+)?(?:ultimas?\s+)?(\w+)?\s*(?:ultimas?\s+)?(?:fotos?|imagenes?)\s+(?:en|a)\s+(?:la\s+)?(?:carpeta\s+)?(?:llamada\s+)?(.+)$/.exec(s))) return { action: 'organize', n: num(m[1]) || 1, folder: m[2] };
    if ((m = /^(?:translate|traduce|traducir)\s+(.+?)\s+(?:to|into|al|a)\s+(spanish|english|espanol|ingles)$/.exec(s))) return { action: 'translate', text: m[1], to: /span|espan/.test(m[2]) ? 'es' : 'en' };
    // reminders: "remind me in 10 minutes to call mum" / "recuérdame en 10 minutos llamar a mamá"
    if ((m = /(?:remind me|set a reminder|reminder)(?:\s+(?:in|for))?\s+(\w+)\s+(minutes?|mins?|hours?)(?:\s+(?:to|that|about)\s+(.+))?$/.exec(s)) ||
        (m = /(?:recuerdame|recordatorio)(?:\s+en)?\s+(\w+)\s+(minutos?|horas?)(?:\s+(?:que|de|para)?\s*(.+))?$/.exec(s))) {
      var nn = num(m[1]) || 10; if (/^h/.test(m[2])) nn *= 60;
      return { action: 'remind', minutes: nn, text: m[3] || '' };
    }
    if ((m = /^(?:take a note|note|make a note|write down|anota|apunta|toma nota)[:,]?\s+(?:that\s+|que\s+)?(.+)$/.exec(s))) return { action: 'note', text: m[1] };
    if (/(read|what are) my notes|lee mis notas|mis notas/.test(s)) return { action: 'notes' };
    if (/(reminders|recordatorios|notes|notas)$/.test(s)) return { action: 'reminders' };
    if (/(good morning|briefing|my day|what'?s (the )?weather|weather|buenos dias|mi dia|resumen|que tiempo hace|el tiempo)/.test(s)) return { action: 'briefing' };
    if (/(what time|what'?s the time|what day|date today|que hora|que dia)/.test(s)) return { action: 'time' };
    if (/(emergency|help me|i need help|call (an )?ambulance|sos|emergencia|ayuda|socorro|necesito ayuda)/.test(s)) return { action: 'emergency' };
    if (/(safe word|family word|palabra clave|palabra secreta)/.test(s)) return { action: 'safeword' };
    if (/(qr|scan (a |the )?code|codigo qr|escanea (el |un )?codigo)/.test(s)) return { action: 'qr' };
    if ((m = /(?:is (?:this|that) link safe|check (?:this|the) link|link|enlace)\s*(\S+\.\S+)?/.exec(s)) && /link|enlace/.test(s)) return { action: 'link', text: m[1] || '' };
    if (/(letter|bill|document|form|explain|summari[sz]e|carta|factura|documento|formulario|explicame|resume)/.test(s)) return { action: 'summarize' };
    if (/(who are you|your name|quien eres|como te llamas)/.test(s)) return { action: 'whoami' };
    if (/(owner|dashboard|admin|propietario|panel)/.test(s) && me && me.owner) return { action: 'owner' };
    if (/(hands.?free|manos libres)/.test(s)) return { action: 'handsfree', on: !/(off|stop|desactiva|apaga)/.test(s) };
    if (/scam|fraud|estafa|fraude|timo/.test(s)) return { action: 'scam' };
    if (/(who owns|verify|lunara mark|de quien es|verificar|comprobar la marca)/.test(s)) return { action: 'verify' };
    if (/(watermark|protect|mark my|marca de agua|proteger|marcar mi)/.test(s)) return { action: 'mark' };
    if (/\b(ai|a i|ia|fake|falso|falsa|real|deepfake|generated|generado|generada)\b/.test(s) || /detect|detecta|es real|is it real|check|revisa|comprueba/.test(s)) {
      if (/video/.test(s)) return { action: 'video' };
      if (/voice|audio|call|llamada|voz|sound|sonido/.test(s)) return { action: 'voice' };
      if (/text|texto|message|mensaje|email|correo|writing|escrito/.test(s)) return { action: 'text' };
      if (/camera|screen|camara|pantalla|scan|escanea/.test(s)) return { action: 'scan' };
      return { action: 'photo' };
    }
    if (/(what'?s? (is )?(in front|around|this|that)|describe|what do you see|what am i looking|que (hay|ves|tengo delante)|describe|que es esto)/.test(s)) return { action: 'describe' };
    if (/\b(read|lee|leer|leeme)\b/.test(s)) return { action: 'read' };
    if (/(magnif|zoom|bigger|lupa|ampliar|aumentar|agrandar)/.test(s)) return { action: 'magnify' };
    if (/(colou?r|color)/.test(s)) return { action: 'color' };
    if (/(conversation|conversacion|interpret|talk to someone|hablar con)/.test(s)) return { action: 'converse' };
    if (/(reply|answer|respond|responder|contestar|que (le )?digo)/.test(s)) return { action: 'replies' };
    if (/(translate|traduc)/.test(s)) return { action: 'translate' };
    if (/(remember|where did i park|recuerda|donde aparque)/.test(s)) return { action: 'remember' };
    if (/(calm|breath|stress|anxious|anxiety|panic|overwhelm|calma|respira|estres|ansiedad|panico|agobi)/.test(s)) return { action: 'calm' };
    if (/(emergency|medical|emergencia|medica|tarjeta)/.test(s)) return { action: 'card' };
    if (/(files|folder|archivos|carpeta|photos|fotos)/.test(s)) return { action: 'files' };
    if (/(account|licen|buy|comprar|cuenta|sign in|iniciar)/.test(s)) return { action: 'account' };
    if (/(settings|ajustes|language|idioma|spanish|espanol|english|ingles)/.test(s)) {
      if (/(spanish|espanol)/.test(s) && S.lang !== 'es') return { action: 'lang', lang: 'es' };
      if (/(english|ingles)/.test(s) && S.lang !== 'en') return { action: 'lang', lang: 'en' };
      return { action: 'account' };
    }
    if (/(repeat|again|repite|otra vez)/.test(s)) return { action: 'repeat' };
    if (/^(stop|para|parar|silence|silencio|callate)$/.test(s)) return { action: 'stop' };
    if (/(home|inicio|menu|back|atras)/.test(s)) return { action: 'home' };
    if (/(help|ayuda|what can you do|que puedes hacer)/.test(s)) return { action: 'help' };
    return null;
  }
  var ACTION_SCREEN = { memory: 'memory', lists: 'lists', talk: 'talk', shop: 'shop', write: 'write', coach: 'coach', link: 'link', qr: 'qr', summarize: 'summarize', reminders: 'reminders', briefing: 'briefing', emergency: 'emergency', safeword: 'safeword', owner: 'owner', photo: 'photo', scan: 'scan', video: 'video', voice: 'voice', text: 'text', scam: 'scam', verify: 'verify', mark: 'mark', describe: 'describe', read: 'read', magnify: 'magnify', color: 'color', translate: 'translate', converse: 'converse', replies: 'replies', files: 'files', remember: 'remember', calm: 'calm', card: 'card', account: 'account', home: 'home' };
  function run(cmd) {
    var a = cmd.action;
    if (a === 'organize') return organize(cmd.n, cmd.folder).then(function () { go('files', { folder: cmd.folder.replace(/^\w/, function (c) { return c.toUpperCase(); }) }); });
    if (a === 'remind') { Rem.add(cmd.text, cmd.minutes || 10); return sayKey('reminder_set'); }
    if (a === 'note') { if (!cmd.text) return go('reminders'); Notes.add(cmd.text); return sayKey('note_saved'); }
    if (a === 'notes') return readNotes();
    if (a === 'briefing') { go('briefing'); return; }
    if (a === 'time') return say(t('time_now')(new Date()));
    if (a === 'whoami') return sayKey('hello');
    if (a === 'handsfree') { S.handsFree = cmd.on; saveSettings(); wake(cmd.on); return sayKey(cmd.on ? 'wake_on' : 'wake_off'); }
    if (a === 'link' && cmd.text) return go('link', { text: cmd.text });
    if (a === 'repeat') return say(lastSaid);
    if (a === 'stop') { stopVoice(); return; }
    if (a === 'help') return sayKey('try_saying');
    if (a === 'lang') { S.lang = cmd.lang; saveSettings(); renderPill(); go(current.name, current.arg, true); return say(S.lang === 'es' ? 'Ahora hablo español.' : 'Now speaking English.'); }
    if (a === 'answer') return say(cmd.speech);
    if (a === 'remember_fact') { var mm = Mem.add(cmd.text); return say(mm ? L('I’ll remember that.', 'Lo recordaré.') : L('I already knew that.', 'Eso ya lo sabía.')); }
    if (a === 'forget_fact') { var fm = Mem.forget(cmd.text); return say(fm ? L('Forgotten: ', 'Olvidado: ') + fm.text : L('I don’t remember anything like that.', 'No recuerdo nada parecido.')); }
    if (a === 'list_add') { var ra = Lists.add(cmd.list, cmd.text); buzz(); return say(L('Added to ', 'Añadido a ') + ra.list.name + ': ' + ra.added.join(', ') + '.'); }
    if (a === 'list_read') return readList(cmd.list);
    if (a === 'mode') return setMode(cmd.text);
    if (a === 'plan_day') { go('briefing', { plan: true }); return; }
    if (a === 'coach' || a === 'write') { go(a, { text: cmd.text }); return; }
    var scr = ACTION_SCREEN[a]; if (!scr) return sayKey('not_caught');
    if (a === 'translate' && cmd.text) return go('translate', { text: cmd.text, to: cmd.to });
    go(scr, cmd.arg);
    if (a === 'magnify') return sayKey('magnifier');
    if (/^(calm|emergency|safeword|briefing)$/.test(a)) return;
    var title = { photo: 't_photo', scan: 't_scan', video: 't_video', voice: 't_voice', text: 't_text', scam: 't_scam', verify: 't_verify', mark: 't_mark', describe: 't_describe', read: 't_read', color: 't_color', translate: 't_translate', converse: 't_converse', replies: 't_replies', files: 't_files', remember: 't_remember', card: 't_card', account: 't_account', link: 't_link', qr: 't_qr', summarize: 't_summ', reminders: 't_remind', owner: 't_owner' }[a];
    if (title) say(t(title), null, { transcript: true });
    else if (a === 'lists') say(L('Your lists.', 'Tus listas.'));
    else if (a === 'memory') say(Mem.all().length ? L('Here is what I remember.', 'Esto es lo que recuerdo.') : L('I don’t remember anything yet. Say “remember that…”.', 'Aún no recuerdo nada. Di «recuerda que…».'));
    else if (a === 'shop') say(me && !me.owner && credits() !== null ? L('You have ', 'Tienes ') + fmt(credits()) + L(' credits.', ' créditos.') : L('Credits and plans.', 'Créditos y planes.'));
  }

  /* Rosario hears something. Quick things are understood on the phone;
     everything else goes to her brain on the server, with the
     conversation so far, so she can answer and follow up. */
  function handle(q) {
    q = String(q || '').trim(); if (!q) return;
    RosarioLog('user', q);
    var cmd = parse(q);
    if (cmd) return run(cmd);
    if (!licensed()) return sayKey('no_licence');
    var hist = convo.slice(-9, -1).map(function (m) { return { role: m.role, text: m.text }; });
    var d = new Date();
    return ai('rosario', Object.assign({ text: q, history: hist, context: 'Local time: ' + d.toString() + '. App language: ' + (S.lang === 'es' ? 'Spanish' : 'English') + '. Current screen: ' + current.name + (me && me.owner ? '. The user is the owner of Lunara Society.' : '') }, personal())).then(function (r) {
      var map = { detect_image: 'photo', detect_text: 'text', detect_audio: 'voice', detect_video: 'video', verify_mark: 'verify', settings: 'account', card: 'card' };
      var act = map[r.action] || r.action;
      if (act === 'answer' || act === 'stop') return say(r.speech);
      /* The one action that changes the member's files. When the model
         chose it, a person confirms before anything moves. */
      if (act === 'organize') {
        var n = Math.max(1, Math.min(50, r.arg_number || 1)), f = String(r.arg_folder || '').slice(0, 40) || 'Rosario';
        var q2 = S.lang === 'es' ? '¿Mover las ' + n + ' imágenes más recientes a la carpeta «' + f + '»?' : 'Move the latest ' + n + ' images into the folder "' + f + '"?';
        say(q2);
        if (!confirm(q2)) return say(S.lang === 'es' ? 'De acuerdo, no muevo nada.' : 'Okay, nothing moved.');
        return run({ action: 'organize', n: n, folder: f });
      }
      if (act === 'remind') { Rem.add(r.arg_text, r.arg_minutes || 10); return say(r.speech || t('rem_add')); }
      if (act === 'note') { if (r.arg_text) Notes.add(r.arg_text); return say(r.speech); }
      if (act === 'notes') return readNotes();
      if (act === 'translate' && r.arg_text) return run({ action: 'translate', text: r.arg_text, to: /span|espa/i.test(r.arg_language) ? 'es' : 'en' });
      if (act === 'replies' && r.arg_text) { say(r.speech); return go('replies', { text: r.arg_text }); }
      if (act === 'link' && r.arg_text) return go('link', { text: r.arg_text });
      if (act === 'remember_fact') { Mem.add(r.arg_text); return say(r.speech || L('I’ll remember that.', 'Lo recordaré.')); }
      if (act === 'forget_fact') { Mem.forget(r.arg_text); return say(r.speech); }
      if (act === 'list_add') { var ra = Lists.add(r.arg_folder, r.arg_text); return say(r.speech || (L('Added to ', 'Añadido a ') + ra.list.name + '.')); }
      if (act === 'list_read') return readList(r.arg_folder);
      if (act === 'mode') return setMode(r.arg_text);
      if (act === 'plan_day') { say(r.speech); return go('briefing', { plan: true }); }
      if ((act === 'write' || act === 'coach') && r.arg_text) { say(r.speech); return go(act, { text: r.arg_text }); }
      // In talk mode the conversation stays on screen; she only speaks.
      if (current.name === 'talk' && /^(briefing|notes|help|calm|safe_word)$/.test(act)) return say(r.speech);
      say(r.speech); var sc = ACTION_SCREEN[act]; if (sc) go(sc);
    }).catch(function (e) { say(aiError(e)); });
  }

  var micBtn = document.getElementById('mic'), micLabel = document.getElementById('miclabel');
  function onMic() {
    buzz(25); stopVoice(); wakePause(true);
    micBtn.classList.add('on'); micLabel.textContent = t('listening');
    listen().then(function (q) {
      micBtn.classList.remove('on'); micLabel.textContent = t('micHint'); wakePause(false);
      if (!q) return;
      handle(q);
    }).catch(function (e) {
      micBtn.classList.remove('on'); micLabel.textContent = t('micHint'); wakePause(false);
      if (e && e.message === 'nospeech') { say(t('noSpeech')); typeBox(); }
      else if (e && /not-allowed|service-not-allowed/.test(e.message)) say(t('noMic'));
    });
  }
  function typeBox() {
    if (document.getElementById('typecmd')) return;
    var i = h('input', { type: 'text', id: 'typecmd', placeholder: t('micHint'), 'aria-label': t('micHint'), onkeydown: function (e) { if (e.key === 'Enter' && i.value.trim()) { handle(i.value); i.remove(); } } });
    main.insertBefore(i, main.firstChild); i.focus();
  }
  micBtn.addEventListener('click', onMic);

  /* Hands free: always listening for her name. "Rosario, is this real?"
     runs at once; "Rosario" alone makes her ask what you need. She stops
     listening while she speaks, so she never hears herself. */
  var wakeRec = null, wakeOn = false, wakeHold = false;
  function wake(on) {
    wakeOn = !!on && !!Rec;
    if (!wakeOn) { if (wakeRec) try { wakeRec.abort(); } catch (e) { } wakeRec = null; return; }
    startWake();
  }
  function wakePause(hold) { wakeHold = hold; if (hold && wakeRec) try { wakeRec.abort(); } catch (e) { } if (!hold && wakeOn) setTimeout(startWake, 400); }
  function startWake() {
    if (!wakeOn || wakeHold || wakeRec) return;
    if (isSpeaking()) { setTimeout(startWake, 500); return; }
    var r = new Rec(); wakeRec = r;
    r.lang = S.lang === 'es' ? 'es-ES' : 'en-US'; r.continuous = true; r.interimResults = false;
    r.onresult = function (e) {
      var said = e.results[e.results.length - 1][0].transcript || '';
      var m = /\b(rosario|rosa rio|rosarios)\b[\s,.:]*(.*)$/i.exec(said);
      if (!m) return;
      try { r.abort(); } catch (x) { }
      var rest = (m[2] || '').trim();
      if (rest.length > 2) handle(rest);
      else { sayKey('listening').then(function () { onMic(); }); }
    };
    r.onend = function () { wakeRec = null; if (wakeOn && !wakeHold) setTimeout(startWake, isSpeaking() ? 800 : 250); };
    r.onerror = function () { wakeRec = null; };
    try { r.start(); } catch (e) { wakeRec = null; }
  }
  voiceEl.addEventListener('play', function () { if (wakeRec) try { wakeRec.abort(); } catch (e) { } });

  /* ── the door ───────────────────────────────────────────────────────
     The app is free: signing in is the only door, because credits and
     marks belong to an account. The server prices every AI action. */
  var OPEN = { welcome: 1 };
  function cacheMe() { if (me) put('lens_me', { me: me, at: Date.now() }); }
  function signOut() {
    ['lunara_session_token', 'lunara_id', 'lunara_name', 'lunara_tier', 'lunara_email', 'lunara_expires_at', 'lunara_last_active'].forEach(function (k) { try { localStorage.removeItem(k); } catch (e) { } });
    try { localStorage.removeItem('lens_me'); } catch (e) { }
    me = null; renderPill(); wake(false); go('welcome', null, true);
  }
  var entered = false;
  function enter() {
    var first = (location.hash || '').slice(1);
    go(screens[first] && !OPEN[first] ? first : 'home', null, true);
    if (!entered) {
      entered = true;
      var today = new Date().toDateString();
      if (get('lens_greeted', '') !== today) { put('lens_greeted', today); setTimeout(function () { sayKey(me && me.owner ? 'welcome_owner' : 'hello_back'); }, 700); }
      if (S.handsFree) wake(true);
    }
  }
  var goInner = go;
  go = function (name, arg, replace) {
    if (!OPEN[name] && !session()) name = 'welcome';
    if (name === 'paywall' || name === 'pending') name = 'shop';
    return goInner(name, arg, replace);
  };
  function boot() {
    if (!session()) { go('welcome', null, true); return; }
    var cached = get('lens_me', null);
    if (cached && cached.me && Date.now() - cached.at < 30 * 864e5) { me = cached.me; renderPill(); }
    enter();
    refreshMe().then(function (m) {
      if (m) { cacheMe(); if (current.name === 'home') go('home', null, true); Play.restore(); }
      else if (session() && (boot.tries = (boot.tries || 0) + 1) < 4) setTimeout(function () { refreshMe(); }, 5000 * boot.tries);
    });
  }

  /* ── start ──────────────────────────────────────────────────────── */
  document.getElementById('plan').addEventListener('click', function () { go('account'); });
  document.getElementById('langbtn').addEventListener('click', function () { S.lang = other(S.lang); saveSettings(); renderPill(); micLabel.textContent = t('micHint'); go(current.name, current.arg, true); if (wakeOn) { wake(false); wake(true); } say(S.lang === 'es' ? 'Español.' : 'English.', null, { silentToast: true, transcript: false }); });
  applySettings();
  micLabel.textContent = t('micHint');
  boot();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(function () { });
  window.LensApp = { parse: parse, colorName: colorName, go: function (n, a) { go(n, a); }, run: run, handle: handle, linkSigns: linkSigns, _setMe: function (m) { me = m; renderPill(); enter(); } };
})();
