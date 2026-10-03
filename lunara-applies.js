/* ═══════════════════════════════════════════════════════════════════
   DOES IT REACH YOU? — the applicability check, for people
   ═══════════════════════════════════════════════════════════════════

   The same question an AI system asks the MCP server through
   lunara_applicability, asked of a person, one question at a time, and
   answered from the same published and signed decision model:

     /corpus/applicability.json   which rule fires, and what it adds
     /corpus/obligations.json     what each obligation is and when

   Nothing here decides anything by itself. The rules, the findings,
   the reasoning and the duties are all read from the model; the dates
   are read from the corpus and put in tense against the reader's
   clock. evaluate() below is a port of the one in mcp/core.mjs, and
   tools/verify-applies.mjs runs both over every one of the 6,561
   possible answer sets on every deploy and refuses to publish if they
   ever disagree. The site and the server cannot give two answers.

   Questions that cannot change the outcome are not asked. Which ones
   those are is decided by relevant() below, and the same gate proves,
   over the same 6,561 cases, that skipping them never changes a
   verdict, an overlay or an obligation.

   It can, and often does, conclude that nothing binds you. When it
   does, it says so and does not try to sell you anything for it: the
   model itself states that a qualifier which only escalates is a sales
   funnel, and would make every other answer here worth less.

   Mount it anywhere with <div data-lunara-check></div>.
   ═══════════════════════════════════════════════════════════════════ */
(function (root) {
  'use strict';

  /* ── the evaluator (a port of mcp/core.mjs evaluate) ───────────── */
  function evaluate(model, answers) {
    var a = function (k) { return answers[k] == null ? 'unsure' : answers[k]; };
    var engages = a('interacts_with_people') === 'yes' || a('generates_content') === 'yes';
    var ctx = { engages: engages };
    model.inputs.forEach(function (input) { ctx[input.id] = a(input.id); });

    var test = function (expr) {
      return expr.split(' AND ').every(function (clause) {
        var m = clause.trim().match(/^(\w+)\s*(==|!=)\s*(?:'([^']*)'|(true|false))$/);
        if (!m) return false;
        var want = m[4] !== undefined ? m[4] === 'true' : m[3];
        var got = ctx[m[1]];
        return m[2] === '==' ? got === want : got !== want;
      });
    };

    var matched = null;
    for (var i = 0; i < model.rules.length; i++) { if (test(model.rules[i].when)) { matched = model.rules[i]; break; } }
    var overlays = model.overlays.filter(function (o) { return test(o.when); });

    var ids = [];
    function add(id) { if (ids.indexOf(id) < 0) ids.push(id); }
    ((matched && matched.obligations) || []).forEach(add);
    overlays.forEach(function (o) { (o.adds || []).forEach(add); });

    var unsure = Object.keys(ctx).filter(function (k) { return k !== 'engages' && ctx[k] === 'unsure'; });
    return { rule: matched, overlays: overlays, obligationIds: ids, unsure: unsure, context: ctx };
  }

  /* ── which questions can still matter ─────────────────────────────
     Given the answers so far, is this input able to change the result?
     Every condition below mirrors the model's own `when` clauses; the
     deploy gate checks the claim exhaustively. */
  function relevant(id, ans) {
    var gc = ans.generates_content, eu = ans.eu_exposure, ca = ans.california_exposure;
    switch (id) {
      case 'generates_images_audio_or_video': return eu !== 'no';
      case 'on_market_before_art50':          return gc !== 'no' && eu !== 'no';
      case 'monthly_users_over_1m':           return gc !== 'no' && ca !== 'no';
      case 'hosts_or_distributes_models':     return ca !== 'no';
      default: return true;
    }
  }

  /* The order a person is asked in, which is not the model's storage
     order: the two questions that decide everything come first. */
  var ORDER = ['interacts_with_people', 'generates_content', 'eu_exposure', 'generates_images_audio_or_video',
               'on_market_before_art50', 'california_exposure', 'monthly_users_over_1m', 'hosts_or_distributes_models'];

  /* The answers the model is evaluated on: a question that could not
     matter is answered "no" rather than left "unsure", so it is not
     reported back as an open question. */
  function complete(ans) {
    var out = {};
    ORDER.forEach(function (id) { out[id] = relevant(id, ans) ? (ans[id] || 'unsure') : 'no'; });
    return out;
  }

  root.LunaraApplies = { evaluate: evaluate, relevant: relevant, complete: complete, ORDER: ORDER };
  if (typeof document === 'undefined' || !document.querySelectorAll) return;

  /* ── the instrument ────────────────────────────────────────────── */
  var REDUCED = !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches);
  var DAY = 86400000;
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function utc(iso) { var p = iso.split('-'); return Date.UTC(+p[0], +p[1] - 1, +p[2]); }
  function longDate(iso) { var p = iso.split('-'); return (+p[2]) + ' ' + MONTHS[+p[1] - 1] + ' ' + p[0]; }
  function today() { var n = new Date(); return Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()); }
  var CODE = { yes: 'y', no: 'n', unsure: 'u' }, DECODE = { y: 'yes', n: 'no', u: 'unsure' };

  var CSS = [
    '.lxa{scroll-margin-top:96px;position:relative;border-radius:18px;overflow:hidden;border:1px solid rgba(226,196,122,.26);',
    '  background:radial-gradient(80% 70% at 85% 0%,rgba(226,196,122,.13),transparent 60%),radial-gradient(70% 80% at 0% 100%,rgba(120,150,210,.10),transparent 60%),linear-gradient(180deg,#0E1016,#08090C);',
    '  box-shadow:0 60px 120px -60px rgba(0,0,0,.9),inset 0 1px 0 rgba(255,236,190,.06);color:#F2EEE6;min-height:560px}',
    '.lxa *{box-sizing:border-box}',
    '.lxa-in{position:relative;padding:44px 52px 40px;min-height:560px;display:flex;flex-direction:column}',
    '.lxa-k{font:10.5px "IBM Plex Mono",ui-monospace,monospace;letter-spacing:.22em;text-transform:uppercase;color:#E2C47A}',
    '.lxa-h{font-family:"Cormorant Garamond",Georgia,serif;font-weight:300;font-size:56px;line-height:1.02;margin:14px 0 0;letter-spacing:-.01em}',
    '.lxa-h em{font-style:italic;color:#E2C47A}',
    '.lxa-p{font-size:16px;line-height:1.7;color:#A9AEB8;max-width:36em;margin-top:18px}',
    '.lxa-p b{color:#F2EEE6;font-weight:500}',
    '.lxa-go{margin-top:30px;display:inline-flex;align-items:center;gap:12px;align-self:flex-start;cursor:pointer;border:0;',
    '  font:600 14px Inter,system-ui,sans-serif;letter-spacing:.02em;color:#16130D;padding:17px 28px;border-radius:999px;',
    '  background:linear-gradient(180deg,#F3DA9A,#C9A55E);box-shadow:0 18px 50px -18px rgba(226,196,122,.8);transition:transform .3s ease,box-shadow .3s ease}',
    '.lxa-go:hover{transform:translateY(-2px);box-shadow:0 24px 60px -18px rgba(226,196,122,.95)}',
    '.lxa-meta{margin-top:auto;padding-top:28px;display:flex;gap:26px;flex-wrap:wrap;font:10px "IBM Plex Mono",monospace;letter-spacing:.16em;text-transform:uppercase;color:#6E747E}',
    '.lxa-meta i{font-style:normal;color:#8FD6B8}',
    '.lxa-orb{position:absolute;right:-60px;top:50%;width:380px;height:380px;transform:translateY(-50%);pointer-events:none;opacity:.9}',
    '.lxa-stars{display:flex;align-items:center;gap:0;margin:0 0 30px}',
    '.lxa-stars span{width:12px;height:12px;border-radius:50%;border:1px solid rgba(226,196,122,.5);background:#0A0C10;transition:all .5s ease;flex:0 0 auto}',
    '.lxa-stars span.on{background:#E2C47A;box-shadow:0 0 14px rgba(226,196,122,.9)}',
    '.lxa-stars span.skip{opacity:.25;transform:scale(.6)}',
    '.lxa-stars b{flex:1;height:1px;background:rgba(214,222,234,.14);transition:background .5s ease}',
    '.lxa-stars b.on{background:linear-gradient(90deg,#E2C47A,rgba(226,196,122,.4))}',
    '.lxa-q{font-family:"Cormorant Garamond",Georgia,serif;font-weight:300;font-size:44px;line-height:1.1;max-width:18em}',
    '.lxa-hint{font-size:15px;line-height:1.65;color:#8E949E;max-width:40em;margin-top:16px}',
    '.lxa-ans{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;margin-top:34px;max-width:720px}',
    '.lxa-ans button{cursor:pointer;padding:22px 18px;border-radius:14px;border:1px solid rgba(214,222,234,.16);background:rgba(255,255,255,.02);',
    '  color:#F2EEE6;font:500 17px Inter,system-ui,sans-serif;text-align:left;transition:all .25s ease;position:relative;overflow:hidden}',
    '.lxa-ans button small{display:block;font:10px "IBM Plex Mono",monospace;letter-spacing:.14em;text-transform:uppercase;color:#6E747E;margin-top:8px}',
    '.lxa-ans button:hover,.lxa-ans button:focus-visible{border-color:rgba(226,196,122,.7);background:rgba(226,196,122,.07);transform:translateY(-2px);outline:none}',
    '.lxa-ans button.pick{border-color:#E2C47A;background:rgba(226,196,122,.16)}',
    '.lxa-back{margin-top:22px;align-self:flex-start;background:none;border:0;color:#8E949E;font:11px "IBM Plex Mono",monospace;letter-spacing:.14em;text-transform:uppercase;cursor:pointer}',
    '.lxa-back:hover{color:#F2EEE6}',
    '.lxa-stage{animation:lxaIn .55s cubic-bezier(.2,.7,.2,1) both}',
    '@keyframes lxaIn{from{opacity:0;transform:translateY(18px);filter:blur(6px)}to{opacity:1;transform:none;filter:none}}',
    '.lxa-v{display:flex;align-items:center;gap:22px}',
    '.lxa-seal{flex:0 0 auto;width:92px;height:92px}',
    '.lxa-seal circle.r{fill:none;stroke-width:1.6;stroke-dasharray:280;stroke-dashoffset:280;animation:lxaDraw 1.4s .2s cubic-bezier(.2,.7,.2,1) forwards}',
    '@keyframes lxaDraw{to{stroke-dashoffset:0}}',
    '.lxa-vh{font-family:"Cormorant Garamond",Georgia,serif;font-weight:300;font-size:46px;line-height:1.05}',
    '.lxa-grid{display:grid;grid-template-columns:minmax(0,1.25fr) minmax(0,1fr);gap:34px;margin-top:30px}',
    '.lxa-ob{padding:16px 0;border-top:1px solid rgba(214,222,234,.1);animation:lxaIn .6s both}',
    '.lxa-ob .d{font-family:"Cormorant Garamond",Georgia,serif;font-size:24px;color:#F2EEE6}',
    '.lxa-ob .d small{font:10px "IBM Plex Mono",monospace;letter-spacing:.14em;text-transform:uppercase;color:#E2C47A;margin-left:10px}',
    '.lxa-ob .n{font-size:15px;color:#DCD8D0;margin-top:4px}',
    '.lxa-ob .m{font:11px "IBM Plex Mono",monospace;color:#8E949E;margin-top:6px;line-height:1.6}',
    '.lxa-ob .pen{color:#E2C47A}',
    '.lxa-note{font-size:14px;line-height:1.65;color:#A9AEB8;padding:14px 16px;border-radius:10px;background:rgba(255,255,255,.025);border:1px solid rgba(214,222,234,.08);margin-top:12px}',
    '.lxa-note b{color:#F2EEE6;font-weight:500}',
    '.lxa-side h4{font:10.5px "IBM Plex Mono",monospace;letter-spacing:.2em;text-transform:uppercase;color:#E2C47A;margin:0 0 12px}',
    '.lxa-buy{display:block;text-decoration:none;color:inherit;padding:18px 18px 16px;border-radius:14px;margin-bottom:12px;',
    '  border:1px solid rgba(226,196,122,.3);background:linear-gradient(180deg,rgba(226,196,122,.08),rgba(226,196,122,.02));transition:all .3s ease}',
    '.lxa-buy:hover{border-color:#E2C47A;transform:translateY(-2px);box-shadow:0 20px 50px -24px rgba(226,196,122,.7)}',
    '.lxa-buy .t{display:flex;justify-content:space-between;gap:12px;align-items:baseline}',
    '.lxa-buy .t b{font-weight:500;font-size:15px;color:#F2EEE6}',
    '.lxa-buy .t span{font-family:"Cormorant Garamond",Georgia,serif;font-size:26px;color:#E2C47A}',
    '.lxa-buy .l{font-size:13px;color:#A9AEB8;margin-top:6px;line-height:1.5}',
    '.lxa-buy .c{display:inline-block;margin-top:12px;font:10.5px "IBM Plex Mono",monospace;letter-spacing:.14em;text-transform:uppercase;color:#16130D;background:#E2C47A;padding:8px 12px;border-radius:999px}',
    '.lxa-free{border-color:rgba(143,214,184,.35);background:linear-gradient(180deg,rgba(143,214,184,.08),rgba(143,214,184,.02))}',
    '.lxa-free .c{background:#8FD6B8}',
    '.lxa-row{display:flex;gap:10px;flex-wrap:wrap;margin-top:22px}',
    '.lxa-row button,.lxa-row a{cursor:pointer;font:10.5px "IBM Plex Mono",monospace;letter-spacing:.14em;text-transform:uppercase;color:#F2EEE6;',
    '  background:transparent;border:1px solid rgba(214,222,234,.2);padding:10px 14px;border-radius:999px;text-decoration:none}',
    '.lxa-row button:hover,.lxa-row a:hover{border-color:#E2C47A;color:#E2C47A}',
    '.lxa-fine{font:10.5px "IBM Plex Mono",monospace;line-height:1.7;color:#6E747E;margin-top:22px}',
    '.lxa-code{margin-top:10px;font:11px "IBM Plex Mono",monospace;white-space:pre-wrap;word-break:break-all;color:#9FB3C8;background:#07080B;border:1px solid rgba(214,222,234,.1);border-radius:10px;padding:12px 14px;display:none}',
    '.lxa-code.on{display:block}'
  ].join('\n');

  var PRODUCT_WHY = {
    disclose: 'Article 50(1) disclosure and 50(2) marking, written for your system.',
    cir: 'Every obligation that reaches this system, the evidence each needs, and who owns it.',
    watch: 'Nothing binds you yet. We tell you the day that changes, and only then.',
    shield: 'Separate from the law: be verifiable by anyone who asks, including an AI system.',
    second: 'You answered "not sure". A person reads your deployment and settles it.'
  };

  function offers(result) {
    var v = result.rule ? result.rule.verdict : 'indeterminate';
    var ids = result.obligationIds;
    var list = [];
    if (v === 'applies' || ids.length) {
      if (ids.indexOf('eu-art50') >= 0 || ids.indexOf('eu-art50-legacy') >= 0) list.push('disclose');
      list.push('cir');
      if (result.unsure.length) list.push('second');
      list.push('shield');
    } else if (v === 'not_yet') {
      list.push('watch');
      if (result.unsure.length) list.push('second');
      list.push('shield');
    } else {
      if (result.unsure.length) list.push('second');
    }
    return list.slice(0, 3);
  }

  function ensurePricing(then) {
    if (root.LunaraPricing) return then();
    var s = document.querySelector('script[src*="lunara-pricing.js"]');
    if (!s) {
      s = document.createElement('script');
      s.src = '/lunara-pricing.js';
      document.head.appendChild(s);
    }
    var tries = 0;
    (function wait() {
      if (root.LunaraPricing) return then();
      if (++tries > 60) return;
      setTimeout(wait, 100);
    })();
  }

  function mount(host) {
    if (host.__lxa) return; host.__lxa = true;
    if (!document.getElementById('lxa-css')) {
      var st = document.createElement('style'); st.id = 'lxa-css'; st.textContent = CSS; document.head.appendChild(st);
    }
    host.classList.add('lxa');
    var model = null, corpus = null, answers = {}, trail = [];

    var ready = Promise.all([
      fetch('/corpus/applicability.json', { cache: 'no-cache' }).then(function (r) { return r.json(); }),
      fetch('/corpus/obligations.json', { cache: 'no-cache' }).then(function (r) { return r.json(); })
    ]).then(function (x) { model = x[0]; corpus = x[1]; });

    function input(id) { for (var i = 0; i < model.inputs.length; i++) if (model.inputs[i].id === id) return model.inputs[i]; return null; }

    function orb() {
      return '<svg class="lxa-orb" viewBox="0 0 380 380" aria-hidden="true"><defs>' +
        '<radialGradient id="lxaG" cx="35%" cy="30%" r="75%"><stop offset="0" stop-color="rgba(243,218,154,.55)"/><stop offset=".45" stop-color="rgba(196,164,107,.12)"/><stop offset="1" stop-color="rgba(0,0,0,0)"/></radialGradient></defs>' +
        '<circle cx="190" cy="190" r="150" fill="url(#lxaG)"/>' +
        '<circle cx="190" cy="190" r="170" fill="none" stroke="rgba(226,196,122,.22)" stroke-dasharray="2 6">' +
        (REDUCED ? '' : '<animateTransform attributeName="transform" type="rotate" from="0 190 190" to="360 190 190" dur="80s" repeatCount="indefinite"/>') + '</circle>' +
        '<circle cx="190" cy="190" r="118" fill="none" stroke="rgba(214,222,234,.12)"/>' +
        '<g>' + (REDUCED ? '' : '<animateTransform attributeName="transform" type="rotate" from="0 190 190" to="-360 190 190" dur="40s" repeatCount="indefinite"/>') +
        '<circle cx="190" cy="20" r="5" fill="#E2C47A"/><circle cx="308" cy="190" r="3" fill="#9CC4E8"/><circle cx="72" cy="190" r="3.5" fill="#DCE3EE"/></g></svg>';
    }

    function intro() {
      host.innerHTML = '<div class="lxa-in lxa-stage">' + orb() +
        '<p class="lxa-k">Thirty seconds · at most eight questions</p>' +
        '<h2 class="lxa-h">Does the law<br><em>reach your AI?</em></h2>' +
        '<p class="lxa-p">Answered from the same signed decision model an AI system queries when it asks us, so you and your assistant get the same answer. <b>It can tell you nothing applies</b>, and for most organisations below the California threshold, part of it will.</p>' +
        '<button class="lxa-go" type="button" data-go>Find out <span aria-hidden="true">→</span></button>' +
        '<div class="lxa-meta"><span>EU AI Act · California SB 942</span><span>No account, no email</span><span><i>●</i> Nothing you enter leaves this page</span></div>' +
        '</div>';
      host.querySelector('[data-go]').addEventListener('click', function () { ready.then(next); });
    }

    function stars(curId) {
      var h = '<div class="lxa-stars" aria-hidden="true">';
      ORDER.forEach(function (id, i) {
        var cls = answers[id] ? 'on' : (!relevant(id, answers) ? 'skip' : '');
        if (id === curId) cls += ' on';
        if (i) h += '<b class="' + (answers[ORDER[i - 1]] ? 'on' : '') + '"></b>';
        h += '<span class="' + cls + '"></span>';
      });
      return h + '</div>';
    }

    function next() {
      var id = null;
      for (var i = 0; i < ORDER.length; i++) {
        if (!answers[ORDER[i]] && relevant(ORDER[i], answers)) { id = ORDER[i]; break; }
      }
      if (!id) return result(true);
      ask(id);
    }

    function ask(id) {
      var q = input(id);
      var n = ORDER.filter(function (k) { return relevant(k, answers); }).indexOf(id) + 1;
      var of = ORDER.filter(function (k) { return relevant(k, answers); }).length;
      host.innerHTML = '<div class="lxa-in lxa-stage">' + stars(id) +
        '<p class="lxa-k">Question ' + n + ' of ' + of + '</p>' +
        '<p class="lxa-q" style="margin-top:14px">' + esc(q.question) + '</p>' +
        (q.hint ? '<p class="lxa-hint">' + esc(q.hint) + '</p>' : '') +
        '<div class="lxa-ans" role="group" aria-label="Your answer">' +
          '<button type="button" data-a="yes">Yes<small>it does</small></button>' +
          '<button type="button" data-a="no">No<small>it does not</small></button>' +
          '<button type="button" data-a="unsure">Not sure<small>we will say what it changes</small></button>' +
        '</div>' +
        (trail.length ? '<button class="lxa-back" type="button" data-back>← Back</button>' : '') +
        '</div>';
      [].forEach.call(host.querySelectorAll('[data-a]'), function (b) {
        b.addEventListener('click', function () {
          b.classList.add('pick');
          answers[id] = b.getAttribute('data-a');
          trail.push(id);
          setTimeout(next, REDUCED ? 0 : 220);
        });
      });
      var back = host.querySelector('[data-back]');
      if (back) back.addEventListener('click', function () {
        var last = trail.pop(); delete answers[last];
        // An earlier answer can make a later question relevant again or
        // not; forget anything asked after the one being revisited.
        ask(last);
      });
      var first = host.querySelector('[data-a]'); if (first && host.getBoundingClientRect().top >= 0) first.focus({ preventScroll: true });
    }

    function encode() { return ORDER.map(function (k) { return CODE[answers[k]] || '-'; }).join(''); }

    function result(fresh) {
      var full = complete(answers);
      var r = evaluate(model, full);
      var v = r.rule ? r.rule.verdict : 'indeterminate';
      var byId = {}; corpus.obligations.forEach(function (o) { byId[o.id] = o; });
      var obs = r.obligationIds.map(function (id) { return byId[id]; }).filter(Boolean)
        .sort(function (a, b) { return utc(a.applies_from) - utc(b.applies_from); });
      var now = today();

      var head, color;
      if (obs.length) { head = obs.length === 1 ? 'One obligation reaches this system.' : obs.length + ' obligations reach this system.'; color = '#E2C47A'; }
      else if (v === 'not_yet') { head = 'Not yet. But it is waiting for you.'; color = '#DCE3EE'; }
      else if (v === 'no_obligation' || v === 'likely_no_obligation') { head = 'Nothing in this record binds you.'; color = '#8FD6B8'; }
      else { head = 'Not decided on these answers.'; color = '#DCE3EE'; }

      var seal = '<svg class="lxa-seal" viewBox="0 0 92 92" aria-hidden="true"><circle cx="46" cy="46" r="40" fill="rgba(255,255,255,.02)" stroke="rgba(214,222,234,.1)"/>' +
        '<circle class="r" cx="46" cy="46" r="40" stroke="' + color + '" transform="rotate(-90 46 46)"/>' +
        '<text x="46" y="56" text-anchor="middle" font-family="Cormorant Garamond,Georgia,serif" font-size="30" fill="' + color + '">' + (obs.length || '0') + '</text></svg>';

      var left = '';
      if (r.rule) left += '<p class="lxa-p" style="margin-top:0"><b>' + esc(r.rule.finding) + '</b> ' + esc(r.rule.reasoning) + '</p>';
      obs.forEach(function (o, i) {
        var d = Math.round((utc(o.applies_from) - now) / DAY);
        var rel = d > 0 ? 'in ' + d + ' days' : d === 0 ? 'binds today' : 'in force';
        left += '<div class="lxa-ob" style="animation-delay:' + (i * 90) + 'ms"><div class="d">' + esc(longDate(o.applies_from)) + '<small>' + rel + '</small></div>' +
          '<div class="n">' + esc(o.name) + ' · ' + esc(o.jurisdiction) + '</div>' +
          '<div class="m">' + esc(o.article) + (o.penalty ? '<br><span class="pen">' + esc(o.penalty) + '</span>' : '') + '</div></div>';
      });
      var duties = (r.rule && r.rule.duties || []).filter(function (d) {
        var m = d.when.match(/^(\w+)\s*==\s*'([^']*)'$/); return m ? r.context[m[1]] === m[2] : false;
      });
      if (duties.length) left += '<div class="lxa-note"><b>What is required.</b> ' + duties.map(function (d) { return esc(d.duty) + ' <span style="color:#6E747E">(' + esc(d.article) + ')</span>'; }).join(' ') + '</div>';
      r.overlays.forEach(function (o) {
        if (!(o.adds && o.adds.length) && !o.verdict) return;
        left += '<div class="lxa-note"><b>' + esc(o.finding) + '</b> ' + esc(o.reasoning) + (o.do_not_read_this_as ? ' <i>Do not read this as ' + esc(o.do_not_read_this_as.replace(/^A /, 'a ')) + '</i>' : '') + '</div>';
      });
      if (r.unsure.length) {
        left += '<div class="lxa-note"><b>You were not sure about ' + r.unsure.length + (r.unsure.length === 1 ? ' question' : ' questions') + ':</b> ' +
          r.unsure.map(function (k) { return '“' + esc(input(k).question) + '”'; }).join(' ') + ' ' + esc(model.unsure_handling) + '</div>';
      }
      if (r.rule && r.rule.revisit_if) left += '<div class="lxa-note"><b>Revisit if:</b> ' + esc(r.rule.revisit_if) + '</div>';

      var ids = offers(r);
      var side = '<div class="lxa-side">';
      if (ids.length) {
        side += '<h4>' + (obs.length ? 'What to do about it' : 'If you want more than this') + '</h4>';
        ids.forEach(function (id) {
          side += '<a class="lxa-buy" data-lx-buy="' + id + '" data-lx-nonote href="/shield.html">' +
            '<div class="t"><b data-lx-name="' + id + '"></b><span data-lx-amount="' + id + '"></span></div>' +
            '<div class="l">' + esc(PRODUCT_WHY[id] || '') + '</div><span class="c">Get it →</span></a>';
        });
      } else {
        side += '<h4>What this costs you</h4><div class="lxa-buy lxa-free"><div class="t"><b>Nothing.</b></div>' +
          '<div class="l">On these answers there is nothing here to buy. Come back if the answers change, or ask your AI assistant to check again for you; it will get the same answer.</div></div>';
      }
      side += '<a class="lxa-buy lxa-free" href="/intelligence.html"><div class="t"><b>The full record</b><span>free</span></div>' +
        '<div class="l">All ten obligations, each linked to the article that sets it.</div><span class="c">Read it →</span></a></div>';

      var args = JSON.stringify(full);
      host.innerHTML = '<div class="lxa-in lxa-stage">' +
        '<p class="lxa-k">Your answer · ' + esc(v.replace(/_/g, ' ')) + '</p>' +
        '<div class="lxa-v" style="margin-top:12px">' + seal + '<h2 class="lxa-vh">' + esc(head) + '</h2></div>' +
        '<div class="lxa-grid"><div>' + left + '</div>' + side + '</div>' +
        '<div class="lxa-row"><button type="button" data-share>Copy a link to this answer</button>' +
        '<button type="button" data-ai>Ask your AI the same question</button>' +
        '<button type="button" data-again>Start again</button></div>' +
        '<pre class="lxa-code" data-code>lunara_applicability ' + esc(args) + '\n\nMCP endpoint: https://luiqtimzcsoqnizybifs.supabase.co/functions/v1/lunara-mcp\nSetup: https://lunarasociety.com/mcp.html</pre>' +
        '<p class="lxa-fine">Classification: interpretation. The obligations are verified against primary law; which one reaches you is our reading, and you are free to take the facts and leave the reading. Not legal advice. It does not decide high-risk classification, sector regimes, or whether an implementation is adequate. Model v' +
        esc(model.version) + ' · corpus v' + esc(corpus.version) + ' · computed ' + new Date().toISOString().slice(0, 10) + ' in your browser.</p>' +
        '</div>';

      ensurePricing(function () { root.LunaraPricing.refresh(); });

      try { history.replaceState(null, '', location.pathname + location.search + '#check=' + encode()); } catch (e) {}
      host.querySelector('[data-again]').addEventListener('click', function () {
        answers = {}; trail = [];
        try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {}
        next();
      });
      host.querySelector('[data-ai]').addEventListener('click', function () { host.querySelector('[data-code]').classList.toggle('on'); });
      host.querySelector('[data-share]').addEventListener('click', function (e) {
        var url = location.origin + (location.pathname === '/' || /index\.html$/.test(location.pathname) ? '/check.html' : location.pathname) + '#check=' + encode();
        var b = e.currentTarget;
        var done = function () { b.textContent = 'Link copied'; setTimeout(function () { b.textContent = 'Copy a link to this answer'; }, 2200); };
        if (navigator.share && /Mobi|Android/i.test(navigator.userAgent)) { navigator.share({ title: 'Does the law reach my AI?', url: url }).catch(function () {}); return; }
        if (navigator.clipboard) navigator.clipboard.writeText(url).then(done, function () { prompt('Copy this link', url); });
        else prompt('Copy this link', url);
      });
      if (fresh && host.getBoundingClientRect().top < 0) host.scrollIntoView({ behavior: REDUCED ? 'auto' : 'smooth', block: 'start' });
    }

    /* A shared link reopens the answer it was shared with. */
    var m = /#check=([ynu-]{8})/.exec(location.hash);
    if (m) {
      ready.then(function () {
        ORDER.forEach(function (k, i) { var c = m[1][i]; if (DECODE[c]) answers[k] = DECODE[c]; });
        trail = ORDER.filter(function (k) { return answers[k]; });
        result(false);
      });
      intro(); // shown until the model arrives
    } else {
      intro();
    }
  }

  function boot() { [].forEach.call(document.querySelectorAll('[data-lunara-check]'), function (h) { try { mount(h); } catch (e) { if (root.console) console.warn('[lunara-applies]', e); } }); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(typeof window !== 'undefined' ? window : this);
