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

  var API = 'https://xkriotfcoialxmqvherb.supabase.co/functions/v1/lunara-lens';
  var AUTH = 'https://xkriotfcoialxmqvherb.supabase.co/functions/v1/lunara-auth';
  var CLIENT_ID = '744926178467-645eltr29q4o3lo8msnlnuqsa782feca.apps.googleusercontent.com';
  var TX = window.LensText, FX = window.LensForensics, MK = window.LensMark;
  var main = document.getElementById('main');

  /* ── storage, settings, words ───────────────────────────────────── */
  function get(k, d) { try { var v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } }
  function put(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } }
  function raw(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }

  var S = Object.assign({ lang: /^es\b/i.test(navigator.language || '') ? 'es' : 'en', rate: 1, big: false, hc: false, speak: true, haptic: true }, get('lens_settings', {}));
  function saveSettings() { put('lens_settings', S); applySettings(); }
  function applySettings() {
    document.documentElement.lang = S.lang;
    document.documentElement.classList.toggle('big', !!S.big);
    document.documentElement.classList.toggle('hc', !!S.hc);
  }
  function t(k) { var v = TX[S.lang][k]; return v === undefined ? TX.en[k] : v; }
  var other = function (l) { return l === 'es' ? 'en' : 'es'; };
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
    lang: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18'
  };
  function icon(n) {
    return h('span', { 'aria-hidden': 'true', html: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="' + ICON[n] + '"/></svg>' }).firstChild;
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
  function say(text, lang, opts) {
    opts = opts || {};
    if (!text) return Promise.resolve();
    lastSaid = text; live.textContent = text;
    if (!opts.silentToast) toast(text);
    if (!S.speak || !window.speechSynthesis) return Promise.resolve();
    return new Promise(function (resolve) {
      try {
        if (!opts.queue) speechSynthesis.cancel();
        var u = new SpeechSynthesisUtterance(text);
        var l = lang || S.lang;
        u.lang = l === 'es' ? 'es-ES' : 'en-US';
        var v = voiceFor(l); if (v) u.voice = v;
        u.rate = S.rate || 1;
        u.onend = u.onerror = function () { resolve(); };
        speechSynthesis.speak(u);
        setTimeout(resolve, 2000 + text.length * 120);
      } catch (e) { resolve(); }
    });
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
    return call('/me').then(function (j) { me = j; renderPill(); return j; }).catch(function () { me = null; renderPill(); return null; });
  }
  function licensed() { return !!(me && me.licensed); }
  function aiError(e) {
    var c = e && e.code;
    if (c === 'license') return t('needLicence');
    if (c === 'offline') return t('offline');
    if (c === 'allowance') return t('allowance');
    if (c === 'signin') return t('signin_first');
    return (e && e.error) || t('err');
  }
  function ai(task, body) {
    return call('/ai', Object.assign({ task: task, lang: S.lang }, body)).then(function (j) {
      if (me && typeof j.allowance_left_pct === 'number') { me.allowance_left_pct = j.allowance_left_pct; renderPill(); }
      return j.result;
    });
  }
  function renderPill() {
    var p = document.getElementById('plan');
    if (!p) return;
    p.textContent = licensed() ? (me.plan === 'api_month' ? 'API' : 'Lens') + ' · ' + me.allowance_left_pct + '%' : (session() ? (S.lang === 'es' ? 'Sin licencia' : 'No licence') : (S.lang === 'es' ? 'Entrar' : 'Sign in'));
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
      .then(function () { say((S.lang === 'es' ? 'Sesión iniciada.' : 'Signed in.')); go(current.name === 'account' ? 'account' : current.name, current.arg, true); })
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
    return h('button', { class: 'tile' + (hero ? ' hero' : ''), onclick: function () { buzz(); go(name); } }, icon(ic), h('span', null, t(key), sub ? h('small', null, sub) : null));
  }
  screens.home = function (el) {
    add(el, [
      h('h1', null, S.lang === 'es' ? h('span', null, '¿Es ', h('em', null, 'real'), '?') : h('span', null, 'Is it ', h('em', null, 'real'), '?')),
      h('p', { class: 'lede' }, t('tagline')),
      h('div', { class: 'grid' },
        tile('photo', 't_photo', 'photo', true, S.lang === 'es' ? 'Fotos, capturas y archivos del teléfono' : 'Photos, screenshots and files on your phone'),
        tile('scan', 't_scan', 'scan'), tile('video', 't_video', 'video'), tile('voice', 't_voice', 'voice'),
        tile('text', 't_text', 'text'), tile('scam', 't_scam', 'scam'), tile('verify', 't_verify', 'verify')),
      h('h2', null, t('g_protect')),
      h('div', { class: 'grid' }, tile('mark', 't_mark', 'mark', true, S.lang === 'es' ? 'Marca invisible, registro público' : 'An invisible mark and a public record')),
      h('h2', null, t('g_see')),
      h('div', { class: 'grid' }, tile('describe', 't_describe', 'eye'), tile('read', 't_read', 'read'), tile('magnify', 't_magnify', 'magnify'), tile('color', 't_color', 'color')),
      h('h2', null, t('g_talk')),
      h('div', { class: 'grid' }, tile('converse', 't_converse', 'converse', true, S.lang === 'es' ? 'Habla con cualquiera, en inglés o español' : 'Talk with anyone, in English or Spanish'), tile('translate', 't_translate', 'translate'), tile('replies', 't_replies', 'replies')),
      h('h2', null, t('g_life')),
      h('div', { class: 'grid' }, tile('files', 't_files', 'files'), tile('remember', 't_remember', 'remember'), tile('calm', 't_calm', 'calm'), tile('card', 't_card', 'card'))
    ]);
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
    function turn(speakerLang, isMe) {
      if (!licensed()) { say(t('needLicence')); return; }
      buzz(); say(t('listening'), speakerLang, { silentToast: true }).then(function () { return listen(speakerLang); }).then(function (x) {
        if (!x) return;
        var target = speakerLang === mine ? theirs : mine;
        return ai('translate', { text: x, target: target }).then(function (r) {
          log.appendChild(h('div', { class: 'bubble' + (isMe ? ' me' : '') }, x, h('small', null, r.translation)));
          say(r.translation, target);
          repl.innerHTML = '';
          if (!isMe) repl.appendChild(h('button', { class: 'btn', onclick: function () { suggest(x); } }, icon('replies'), t('conv_replies')));
        });
      }).catch(function (e) { say(e && e.message === 'nospeech' ? t('noSpeech') : aiError(e)); });
    }
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
      h('button', { class: 'btn', onclick: function () { turn(theirs, false); } }, icon('mic'), t('conv_them') + ' · ' + langName(theirs))), log, repl]);
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

  /* ── account and settings ───────────────────────────────────────── */
  screens.account = function (el) {
    head(el, t('t_account'));
    var box = h('div', { class: 'screen' }); el.appendChild(box);
    function draw() {
      box.innerHTML = '';
      if (!session()) {
        var gbtn = h('div', { id: 'gbtn', style: 'min-height:44px' });
        add(box, [h('p', { class: 'lede' }, t('acc_signin')), gbtn]);
        gsi().then(function () {
          google.accounts.id.initialize({ client_id: CLIENT_ID, callback: onGoogle, ux_mode: 'popup', use_fedcm_for_prompt: true });
          google.accounts.id.renderButton(gbtn, { theme: 'filled_black', size: 'large', shape: 'pill', text: 'continue_with', locale: S.lang });
        }).catch(function () { gbtn.textContent = t('err'); });
      } else {
        add(box, h('p', { class: 'small muted' }, t('acc_signed') + ' ' + (raw('lunara_email') || raw('lunara_name') || raw('lunara_id') || '')));
        var planBox = h('div', { class: 'card' }, h('div', { class: 'busy' }, h('div', { class: 'spinner' })));
        box.appendChild(planBox);
        refreshMe().then(function (m) {
          if (m && m.licensed) {
            fill(planBox, h('div', { class: 'small muted' }, t('acc_plan')), h('div', { class: 'price', style: 'font-size:1.5em' }, m.label),
              h('div', { class: 'meter' }, h('i', { style: 'width:' + m.allowance_left_pct + '%;background:var(--gold)' })),
              h('div', { class: 'small muted' }, t('acc_left') + ': ' + m.allowance_left_pct + '% · ' + t('acc_until') + ' ' + new Date(m.expires_at).toLocaleDateString(S.lang === 'es' ? 'es-ES' : 'en-GB')));
            if (m.plan === 'api_month') {
              var keyOut = h('div');
              planBox.appendChild(h('button', { class: 'btn', style: 'margin-top:12px', onclick: function () { call('/apikey', { label: 'app' }).then(function (k) { fill(keyOut, h('div', { class: 'key' }, k.key), h('p', { class: 'small muted' }, t('apikey_note'))); }).catch(function (e) { say(aiError(e)); }); } }, t('apikey')));
              planBox.appendChild(keyOut);
            }
          } else fill(planBox, h('p', { style: 'margin:0' }, t('acc_none')));
        });
        buyBlock(box);
        var txn = h('input', { type: 'text', id: 'txn', autocomplete: 'off', placeholder: '9AB12345CD6789012', style: 'text-transform:uppercase' });
        var code = h('input', { type: 'text', id: 'code', autocomplete: 'off', placeholder: 'LENS-XXXX-XXXX', style: 'text-transform:uppercase' });
        add(box, [h('div', { class: 'card screen' },
          h('label', { class: 'f' }, t('claim'), txn), h('button', { class: 'btn', onclick: function () { call('/claim', { paypal_txn: txn.value }).then(function (m) { me = m; renderPill(); say(t('activated')); draw(); }).catch(function (e) { say(aiError(e)); }); } }, t('claim_go')),
          h('label', { class: 'f' }, t('redeem'), code), h('button', { class: 'btn', onclick: function () { call('/redeem', { code: code.value }).then(function (m) { me = m; renderPill(); say(t('activated')); draw(); }).catch(function (e) { say(aiError(e)); }); } }, t('redeem_go'))),
          h('button', { class: 'btn ghost', onclick: function () { ['lunara_session_token', 'lunara_id', 'lunara_name', 'lunara_tier', 'lunara_email', 'lunara_expires_at', 'lunara_last_active'].forEach(function (k) { try { localStorage.removeItem(k); } catch (e) { } }); me = null; renderPill(); draw(); } }, t('acc_out'))]);
      }
      settingsBlock(box);
      add(box, h('p', { class: 'note' }, t('privacy')));
    }
    draw();
  };
  function buyBlock(box) {
    add(box, h('div', { class: 'grid', style: 'grid-template-columns:1fr' },
      h('div', { class: 'card' }, h('div', { class: 'small muted' }, t('buy_app')), h('div', { class: 'price', 'data-lx-amount': 'lens' }, '$79'), h('p', { class: 'small muted' }, t('buy_app_terms')),
        h('a', { class: 'btn gold', 'data-lx-buy': 'lens', href: '/lens.html#pricing', target: '_blank', rel: 'noopener' }, t('buy_app'))),
      h('div', { class: 'card' }, h('div', { class: 'small muted' }, t('buy_api')), h('div', { class: 'price', 'data-lx-amount': 'lensapi' }, '$199'), h('p', { class: 'small muted' }, t('buy_api_terms')),
        h('a', { class: 'btn', 'data-lx-buy': 'lensapi', href: '/lens.html#pricing', target: '_blank', rel: 'noopener' }, t('buy_api')))));
    if (window.LunaraPricing && LunaraPricing.refresh) LunaraPricing.refresh();
  }
  function settingsBlock(box) {
    function sw(key, label) {
      var i = h('input', { type: 'checkbox', id: 'set-' + key, checked: S[key] || null, onchange: function () { S[key] = i.checked; saveSettings(); } });
      return h('label', { class: 'switch', for: 'set-' + key }, h('span', null, label), i);
    }
    var lang = h('select', { id: 'set-lang', onchange: function () { S.lang = lang.value; saveSettings(); renderPill(); go('account', null, true); } }, ['en', 'es'].map(function (l) { return h('option', { value: l, selected: S.lang === l || null }, l === 'en' ? 'English' : 'Español'); }));
    var rate = h('input', { type: 'range', id: 'set-rate', min: 0.6, max: 1.5, step: 0.1, value: S.rate, onchange: function () { S.rate = +rate.value; saveSettings(); say(S.lang === 'es' ? 'Así sueno ahora.' : 'This is how I sound now.'); } });
    add(box, [h('h2', null, S.lang === 'es' ? 'Ajustes' : 'Settings'), h('label', { class: 'f' }, t('set_lang'), lang), h('label', { class: 'f' }, t('set_rate'), rate),
      sw('speak', t('set_speak')), sw('big', t('set_big')), sw('hc', t('set_contrast')), sw('haptic', t('set_haptic'))]);
  }

  /* ── voice commands ─────────────────────────────────────────────── */
  var NUM = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10 };
  function num(s) { s = String(s || '').toLowerCase(); return NUM[s] || parseInt(s, 10) || 0; }
  function parse(q) {
    var s = q.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[¿?¡!.,]/g, ' ').replace(/\s+/g, ' ').trim();
    var m;
    if ((m = /(?:put|move|organi[sz]e|place|save)\s+(?:the\s+)?(?:last|latest|newest)?\s*(\w+)?\s*(?:photos?|images?|pictures?|pics?)\s+(?:in|into|to)\s+(?:the\s+|a\s+)?(?:folder\s+)?(?:called\s+|named\s+)?(.+)$/.exec(s))) return { action: 'organize', n: num(m[1]) || 1, folder: m[2].replace(/\s+folder$/, '') };
    if ((m = /(?:pon|mueve|guarda|organiza|mete)\s+(?:las\s+|la\s+)?(?:ultimas?\s+)?(\w+)?\s*(?:ultimas?\s+)?(?:fotos?|imagenes?)\s+(?:en|a)\s+(?:la\s+)?(?:carpeta\s+)?(?:llamada\s+)?(.+)$/.exec(s))) return { action: 'organize', n: num(m[1]) || 1, folder: m[2] };
    if ((m = /^(?:translate|traduce|traducir)\s+(.+?)\s+(?:to|into|al|a)\s+(spanish|english|espanol|ingles)$/.exec(s))) return { action: 'translate', text: m[1], to: /span|espan/.test(m[2]) ? 'es' : 'en' };
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
  var ACTION_SCREEN = { photo: 'photo', scan: 'scan', video: 'video', voice: 'voice', text: 'text', scam: 'scam', verify: 'verify', mark: 'mark', describe: 'describe', read: 'read', magnify: 'magnify', color: 'color', translate: 'translate', converse: 'converse', replies: 'replies', files: 'files', remember: 'remember', calm: 'calm', card: 'card', account: 'account', home: 'home' };
  function run(cmd) {
    var a = cmd.action;
    if (a === 'organize') return organize(cmd.n, cmd.folder).then(function () { go('files', { folder: cmd.folder.replace(/^\w/, function (c) { return c.toUpperCase(); }) }); });
    if (a === 'repeat') return say(lastSaid);
    if (a === 'stop') { if (window.speechSynthesis) speechSynthesis.cancel(); return; }
    if (a === 'help') return say(t('notUnderstood'));
    if (a === 'lang') { S.lang = cmd.lang; saveSettings(); renderPill(); go(current.name, current.arg, true); return say(S.lang === 'es' ? 'Ahora hablo español.' : 'Now speaking English.'); }
    if (a === 'answer') return say(cmd.speech);
    var scr = ACTION_SCREEN[a]; if (!scr) return say(t('notUnderstood'));
    if (a === 'translate' && cmd.text) return go('translate', { text: cmd.text, to: cmd.to });
    go(scr, cmd.arg);
    var title = { photo: 't_photo', scan: 't_scan', video: 't_video', voice: 't_voice', text: 't_text', scam: 't_scam', verify: 't_verify', mark: 't_mark', describe: 't_describe', read: 't_read', magnify: 't_magnify', color: 't_color', translate: 't_translate', converse: 't_converse', replies: 't_replies', files: 't_files', remember: 't_remember', calm: 't_calm', card: 't_card', account: 't_account' }[a];
    if (title && a !== 'calm') say(t(title));
  }
  var micBtn = document.getElementById('mic'), micLabel = document.getElementById('miclabel');
  function onMic() {
    buzz(25);
    micBtn.classList.add('on'); micLabel.textContent = t('listening');
    listen().then(function (q) {
      micBtn.classList.remove('on'); micLabel.textContent = t('micHint');
      if (!q) return;
      toast(t('heard') + q, 2500);
      var cmd = parse(q);
      if (cmd) return run(cmd);
      if (licensed()) return ai('intent', { text: q }).then(function (r) {
        var map = { detect_image: 'photo', detect_text: 'text', detect_audio: 'voice', detect_video: 'video', verify_mark: 'verify', settings: 'account' };
        var act = map[r.action] || r.action;
        if (act === 'organize') return run({ action: 'organize', n: r.arg_number, folder: r.arg_folder });
        if (act === 'translate' && r.arg_text) return run({ action: 'translate', text: r.arg_text, to: /span|espa/i.test(r.arg_language) ? 'es' : 'en' });
        if (act === 'answer') return say(r.speech);
        if (act === 'replies' && r.arg_text) return go('replies', { text: r.arg_text });
        say(r.speech); return run({ action: act });
      }).catch(function (e) { say(aiError(e)); });
      say(t('notUnderstood'));
    }).catch(function (e) {
      micBtn.classList.remove('on'); micLabel.textContent = t('micHint');
      if (e && e.message === 'nospeech') { var q = window.prompt ? null : null; say(t('noSpeech')); typeBox(); }
      else if (e && /not-allowed|service-not-allowed/.test(e.message)) say(t('noMic'));
    });
  }
  function typeBox() {
    if (document.getElementById('typecmd')) return;
    var i = h('input', { type: 'text', id: 'typecmd', placeholder: t('micHint'), 'aria-label': t('micHint'), onkeydown: function (e) { if (e.key === 'Enter' && i.value.trim()) { var c = parse(i.value); c ? run(c) : say(t('notUnderstood')); i.remove(); } } });
    main.insertBefore(i, main.firstChild); i.focus();
  }
  micBtn.addEventListener('click', onMic);

  /* ── start ──────────────────────────────────────────────────────── */
  document.getElementById('plan').addEventListener('click', function () { go('account'); });
  document.getElementById('langbtn').addEventListener('click', function () { S.lang = other(S.lang); saveSettings(); renderPill(); micLabel.textContent = t('micHint'); go(current.name, current.arg, true); say(S.lang === 'es' ? 'Español.' : 'English.', null, { silentToast: true }); });
  applySettings();
  micLabel.textContent = t('micHint');
  var first = (location.hash || '').slice(1);
  go(screens[first] ? first : 'home', null, true);
  try { history.replaceState({ s: current.name }, '', location.hash || '#'); } catch (e) { }
  refreshMe();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(function () { });
  window.LensApp = { parse: parse, colorName: colorName, go: go, run: run };
})();
