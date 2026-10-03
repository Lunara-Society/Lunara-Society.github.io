/* ═══════════════════════════════════════════════════════════════════
   THE CHOOSER — one question instead of thirteen price cards
   ═══════════════════════════════════════════════════════════════════

   The catalogue is thirteen products, and a buyer does not arrive
   wanting a product. They arrive needing to prove something to
   somebody: that the business is real, that an agent is who it says,
   that a system meets Article 50, to a procurement panel. So the
   chooser asks that, and answers with the product that proves it.

   Every word about a product (its name, price, terms, lede and points)
   is read from window.LunaraPricing, the one table every price on this
   site comes from. This file holds only the question, the six answers,
   and which product each answer points at. Change a price in
   lunara-pricing.js and it changes here too.

   Mount it with <div data-lunara-chooser></div>.
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var REDUCED = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);

  var NEEDS = [
    { id: 'real',    icon: 'M12 3l7 3v6c0 4.2-2.9 7.7-7 9-4.1-1.3-7-4.8-7-9V6l7-3z M9.5 12l1.9 1.9L15 10',
      say: 'That my business is real', sub: 'to customers, partners, and the AI systems that recommend you',
      pick: 'shield', also: ['agent'] },
    { id: 'agent',   icon: 'M8 8h8v8H8z M12 3v5 M12 16v5 M3 12h5 M16 12h5',
      say: 'That my AI agent is who it says', sub: 'an identity another system can check before it deals with yours',
      pick: 'agent', also: ['shield'] },
    { id: 'law',     icon: 'M7 3h7l5 5v13H7z M14 3v5h5 M10 13h6 M10 17h4',
      say: 'What the law requires of my AI', sub: 'which obligations reach it, cited, and what to do about each',
      pick: 'cir', also: ['disclose', 'cirplus'], free: true },
    { id: 'eu',      icon: 'M12 3v18 M3 12h18 M5.6 5.6l12.8 12.8 M18.4 5.6L5.6 18.4',
      say: 'That we meet Article 50', sub: 'a written evidence record for output that reaches the European Union',
      pick: 'evidence', also: ['disclose', 'vendor'] },
    { id: 'tender',  icon: 'M4 20h16 M6 20V9l6-5 6 5v11 M10 20v-6h4v6',
      say: 'To a procurement panel', sub: 'a certificate that holds for the length of a tender',
      pick: 'vendor', also: ['evidence'] },
    { id: 'clinic',  icon: 'M12 5v14 M5 12h14 M4 4h16v16H4z',
      say: 'A clinical AI deployment', sub: 'HIPAA, Article 50, SB 942 and accreditation, on one system',
      pick: 'clinical', also: ['cir'] }
  ];

  var CSS = [
    '.lch{scroll-margin-top:96px;position:relative;margin:10px 0 60px;border-radius:18px;padding:40px 44px 36px;overflow:hidden;color:#F2EEE6;',
    '  border:1px solid rgba(226,196,122,.26);background:radial-gradient(70% 90% at 100% 0%,rgba(226,196,122,.12),transparent 60%),linear-gradient(180deg,#100E0A,#08070A);',
    '  box-shadow:0 60px 120px -60px rgba(0,0,0,.9)}',
    '.lch *{box-sizing:border-box}',
    '.lch-k{font:10.5px "IBM Plex Mono",ui-monospace,monospace;letter-spacing:.22em;text-transform:uppercase;color:#E2C47A}',
    '.lch-h{font-family:"Cormorant Garamond",Georgia,serif;font-weight:300;font-size:44px;line-height:1.08;margin:12px 0 0}',
    '.lch-h em{color:#E2C47A}',
    '.lch-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;margin-top:28px}',
    '.lch-opt{cursor:pointer;text-align:left;padding:20px 18px 18px;border-radius:14px;border:1px solid rgba(214,222,234,.14);background:rgba(255,255,255,.02);',
    '  color:#F2EEE6;font:inherit;transition:all .3s ease;position:relative}',
    '.lch-opt svg{width:26px;height:26px;fill:none;stroke:#E2C47A;stroke-width:1.3;stroke-linecap:round;stroke-linejoin:round;display:block;margin-bottom:14px}',
    '.lch-opt b{display:block;font:500 16px Inter,system-ui,sans-serif;line-height:1.3}',
    '.lch-opt span{display:block;font-size:13px;line-height:1.55;color:#8E949E;margin-top:6px}',
    '.lch-opt:hover,.lch-opt:focus-visible{outline:none;border-color:rgba(226,196,122,.7);transform:translateY(-3px);background:rgba(226,196,122,.06);box-shadow:0 22px 50px -30px rgba(226,196,122,.8)}',
    '.lch-opt.on{border-color:#E2C47A;background:rgba(226,196,122,.12)}',
    '.lch-res{margin-top:26px;display:grid;grid-template-columns:minmax(0,1.3fr) minmax(0,1fr);gap:18px;animation:lchIn .6s cubic-bezier(.2,.7,.2,1) both}',
    '@keyframes lchIn{from{opacity:0;transform:translateY(16px);filter:blur(5px)}to{opacity:1;transform:none;filter:none}}',
    '.lch-main{position:relative;padding:28px 28px 24px;border-radius:16px;border:1px solid #E2C47A;',
    '  background:radial-gradient(90% 90% at 100% 0%,rgba(226,196,122,.18),transparent 60%),#0B0A08;overflow:hidden}',
    '.lch-main:before{content:"";position:absolute;inset:-40%;background:conic-gradient(from 0deg,transparent 0 80%,rgba(255,236,190,.16) 88%,transparent 96%);',
    '  animation:lchSweep 7s linear infinite;pointer-events:none}',
    '@keyframes lchSweep{to{transform:rotate(360deg)}}',
    '.lch-main > *{position:relative}',
    '.lch-tag{font:10px "IBM Plex Mono",monospace;letter-spacing:.2em;text-transform:uppercase;color:#16130D;background:#E2C47A;padding:5px 9px;border-radius:999px;display:inline-block}',
    '.lch-name{font-family:"Cormorant Garamond",Georgia,serif;font-size:32px;line-height:1.1;margin-top:14px}',
    '.lch-amt{font-family:"Cormorant Garamond",Georgia,serif;font-size:54px;line-height:1;color:#E2C47A;margin-top:10px}',
    '.lch-terms{font:11px "IBM Plex Mono",monospace;letter-spacing:.06em;color:#A9AEB8;margin-top:6px}',
    '.lch-lede{font-size:15px;color:#DCD8D0;margin-top:14px;line-height:1.6}',
    '.lch-pts{list-style:none;margin:14px 0 0;padding:0}',
    '.lch-pts li{font-size:14px;color:#A9AEB8;padding:8px 0 8px 24px;border-top:1px solid rgba(214,222,234,.08);position:relative;line-height:1.5}',
    '.lch-pts li:before{content:"";position:absolute;left:2px;top:14px;width:10px;height:6px;border-left:1.5px solid #8FD6B8;border-bottom:1.5px solid #8FD6B8;transform:rotate(-45deg)}',
    '.lch-buy{display:inline-flex;gap:10px;align-items:center;margin-top:20px;text-decoration:none;font:600 14px Inter,system-ui,sans-serif;color:#16130D;',
    '  padding:15px 24px;border-radius:999px;background:linear-gradient(180deg,#F3DA9A,#C9A55E);box-shadow:0 18px 50px -18px rgba(226,196,122,.9)}',
    '.lch-main .lx-paynote{color:#A9AEB8}',
    '.lch-side h4{font:10.5px "IBM Plex Mono",monospace;letter-spacing:.2em;text-transform:uppercase;color:#8E949E;margin:0 0 10px}',
    '.lch-alt{display:block;text-decoration:none;color:inherit;padding:16px;border-radius:12px;border:1px solid rgba(214,222,234,.14);margin-bottom:10px;transition:all .3s ease}',
    '.lch-alt:hover{border-color:rgba(226,196,122,.6);transform:translateY(-2px)}',
    '.lch-alt .t{display:flex;justify-content:space-between;gap:10px;align-items:baseline}',
    '.lch-alt .t b{font-weight:500;font-size:14.5px}',
    '.lch-alt .t span{font-family:"Cormorant Garamond",Georgia,serif;font-size:22px;color:#E2C47A}',
    '.lch-alt p{font-size:12.5px;color:#8E949E;margin-top:5px;line-height:1.5}',
    '.lch-free{border-color:rgba(143,214,184,.4)}.lch-free .t span{color:#8FD6B8}'
  ].join('\n');

  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

  function mount(host) {
    var P = window.LunaraPricing;
    if (!P) return;
    if (!document.getElementById('lch-css')) { var st = document.createElement('style'); st.id = 'lch-css'; st.textContent = CSS; document.head.appendChild(st); }
    host.classList.add('lch');
    var needs = NEEDS.filter(function (n) { return P.get(n.pick); });

    host.innerHTML = '<p class="lch-k">Find your certification</p>' +
      '<h2 class="lch-h">What do you need to prove, <em>and to whom?</em></h2>' +
      '<div class="lch-grid" role="group" aria-label="What you need to prove">' +
      needs.map(function (n) {
        return '<button type="button" class="lch-opt" data-need="' + n.id + '"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="' + n.icon + '"/></svg>' +
          '<b>' + esc(n.say) + '</b><span>' + esc(n.sub) + '</span></button>';
      }).join('') + '</div><div data-res aria-live="polite"></div>';

    var res = host.querySelector('[data-res]');
    [].forEach.call(host.querySelectorAll('[data-need]'), function (b) {
      b.addEventListener('click', function () {
        [].forEach.call(host.querySelectorAll('[data-need]'), function (x) { x.classList.toggle('on', x === b); });
        var n = NEEDS.filter(function (x) { return x.id === b.getAttribute('data-need'); })[0];
        show(n);
        try { history.replaceState(null, '', location.pathname + '#need=' + n.id); } catch (e) {}
      });
    });

    function show(n) {
      var p = P.get(n.pick);
      var main = '<div class="lch-main"><span class="lch-tag">What proves it</span>' +
        '<div class="lch-name" data-lx-name="' + p.id + '"></div>' +
        '<div class="lch-amt" data-lx-amount="' + p.id + '"></div>' +
        '<div class="lch-terms" data-lx-terms="' + p.id + '"></div>' +
        '<p class="lch-lede" data-lx-lede="' + p.id + '"></p>' +
        '<ul class="lch-pts">' + (p.points || []).map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul>' +
        '<a class="lch-buy" data-lx-buy="' + p.id + '" href="#">Get it <span aria-hidden="true">→</span></a></div>';
      var side = '<div class="lch-side"><h4>Also consider</h4>';
      if (n.free) side += '<a class="lch-alt lch-free" href="/check.html"><div class="t"><b>First, the free check</b><span>free</span></div><p>Thirty seconds to see which obligations reach your system at all. It can say none do.</p></a>';
      (n.also || []).forEach(function (id) {
        if (!P.get(id)) return;
        side += '<a class="lch-alt" data-lx-buy="' + id + '" data-lx-nonote href="#"><div class="t"><b data-lx-name="' + id + '"></b><span data-lx-amount="' + id + '"></span></div><p data-lx-lede="' + id + '"></p></a>';
      });
      side += '</div>';
      res.innerHTML = '<div class="lch-res">' + main + side + '</div>';
      P.refresh();
      var r = res.getBoundingClientRect();
      if (r.bottom > window.innerHeight) res.scrollIntoView({ behavior: REDUCED ? 'auto' : 'smooth', block: 'nearest' });
    }

    var m = /#need=(\w+)/.exec(location.hash);
    if (m) { var b = host.querySelector('[data-need="' + m[1] + '"]'); if (b) b.click(); }
  }

  function boot() {
    var hosts = document.querySelectorAll('[data-lunara-chooser]');
    if (!hosts.length) return;
    var tries = 0;
    (function wait() {
      if (window.LunaraPricing) { [].forEach.call(hosts, function (h) { try { mount(h); } catch (e) { if (window.console) console.warn('[chooser]', e); } }); return; }
      if (++tries < 80) setTimeout(wait, 75);
    })();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
