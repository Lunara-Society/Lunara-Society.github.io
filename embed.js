/* ============================================================
   LUNARA — the AI Act countdown, for anybody's website
   ------------------------------------------------------------
     <div data-lunara-countdown>
       <a href="https://lunarasociety.com/intelligence.html">EU AI Act deadlines, from the Lunara Society regulatory record</a>
     </div>
     <script src="https://lunarasociety.com/embed.js" async></script>

   Options, as attributes on the div:
     data-scope="all" | "eu" | "california"   which obligations (default all)
     data-theme="dark" | "light"              (default dark)
     data-list="3"                            how many upcoming to list (0 to 5)

   It reads https://lunarasociety.com/corpus/obligations.json, the
   signed record every date on lunarasociety.com comes from, and puts
   it in tense against the reader's clock. There is no date in this
   file, so an embed never goes stale: when a deadline passes, the next
   one takes its place on every site that carries it, without anybody
   editing anything.

   The link inside the div stays in the host page's own HTML, so it is
   there for a reader without JavaScript and for any crawler; the
   countdown is drawn in Shadow DOM beside it, so the host's CSS cannot
   break it and it cannot break the host. No cookies, no tracking, no
   dependencies.
   ============================================================ */
(function () {
  'use strict';
  /* Wherever this file was served from, which on every real embed is
     lunarasociety.com. Taken from the script rather than written in,
     so a copy served from a test server reads that server's record. */
  var ORIGIN = 'https://lunarasociety.com';
  try { if (document.currentScript && document.currentScript.src) ORIGIN = new URL(document.currentScript.src).origin; } catch (e) {}
  var DAY = 86400000;
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var corpusP = null;

  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function utc(iso) { var p = iso.split('-'); return Date.UTC(+p[0], +p[1] - 1, +p[2]); }
  function fmt(t) { var d = new Date(t); return d.getUTCDate() + ' ' + MON[d.getUTCMonth()] + ' ' + d.getUTCFullYear(); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }

  function corpus() {
    if (!corpusP) corpusP = fetch(ORIGIN + '/corpus/obligations.json', { mode: 'cors' }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status); return r.json();
    });
    return corpusP;
  }

  function css(light) {
    var fg = light ? '#1B1A17' : '#F2EEE6', dim = light ? '#6B665C' : '#8E949E', gold = light ? '#8A6B2F' : '#E2C47A';
    var bg = light ? 'linear-gradient(180deg,#FFFDF8,#F4EEE2)' : 'radial-gradient(90% 120% at 100% 0%,rgba(226,196,122,.14),transparent 60%),linear-gradient(180deg,#0F1015,#08090C)';
    var line = light ? 'rgba(27,26,23,.12)' : 'rgba(214,222,234,.12)';
    return [
      ':host{all:initial;display:block}',
      '.w{box-sizing:border-box;max-width:560px;border-radius:16px;padding:22px 24px 16px;background:' + bg + ';color:' + fg + ';',
      '  border:1px solid ' + (light ? 'rgba(138,107,47,.35)' : 'rgba(226,196,122,.3)') + ';font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;line-height:1.4}',
      '.k{font:600 10px ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.18em;text-transform:uppercase;color:' + gold + '}',
      '.n{font-family:Georgia,"Times New Roman",serif;font-size:21px;line-height:1.25;margin-top:8px}',
      '.j{font-size:12px;color:' + dim + ';margin-top:4px}',
      '.c{display:flex;gap:10px;margin-top:16px}',
      '.c div{flex:1;text-align:center;padding:10px 4px 8px;border-radius:10px;border:1px solid ' + line + ';background:' + (light ? 'rgba(255,255,255,.6)' : 'rgba(255,255,255,.03)') + '}',
      '.c b{display:block;font-family:Georgia,serif;font-weight:400;font-size:32px;line-height:1;color:' + gold + ';font-variant-numeric:tabular-nums}',
      '.c span{display:block;font:10px ui-monospace,Menlo,monospace;letter-spacing:.14em;text-transform:uppercase;color:' + dim + ';margin-top:6px}',
      '.a{font:11px ui-monospace,Menlo,monospace;color:' + dim + ';margin-top:12px}',
      'ul{list-style:none;margin:14px 0 0;padding:0}',
      'li{display:flex;justify-content:space-between;gap:14px;font-size:13px;padding:8px 0;border-top:1px solid ' + line + '}',
      'li em{font-style:normal;color:' + dim + ';white-space:nowrap;font-variant-numeric:tabular-nums}',
      '.f{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-top:12px;padding-top:10px;border-top:1px solid ' + line + ';font-size:11px;color:' + dim + '}',
      '.f a{color:' + gold + ';text-decoration:none}',
      '.f a:hover{text-decoration:underline}',
      '.dot{display:inline-block;width:7px;height:7px;border-radius:50%;background:#58C79A;margin-right:6px;vertical-align:0;box-shadow:0 0 8px #58C79A}'
    ].join('');
  }

  function render(host) {
    if (host.__lunara) return; host.__lunara = true;
    var scope = (host.getAttribute('data-scope') || 'all').toLowerCase();
    var light = (host.getAttribute('data-theme') || '').toLowerCase() === 'light';
    var listN = Math.max(0, Math.min(5, parseInt(host.getAttribute('data-list') || '3', 10) || 0));
    var root = host.attachShadow ? host.attachShadow({ mode: 'open' }) : null;
    if (!root) return; // very old browser: the plain link in the host page stays

    corpus().then(function (c) {
      var now = Date.now();
      var obs = (c.obligations || []).filter(function (o) {
        if (scope === 'eu') return o.jurisdiction === 'European Union';
        if (scope === 'california') return o.jurisdiction === 'California';
        return true;
      }).map(function (o) { return { o: o, t: utc(o.applies_from) }; })
        .filter(function (e) { return e.t > now; })
        .sort(function (a, b) { return a.t - b.t; });

      var link = ORIGIN + '/intelligence.html';
      if (!obs.length) {
        root.innerHTML = '<style>' + css(light) + '</style><div class="w"><div class="k">AI regulation</div><div class="n">Every tracked obligation in this scope is now in force.</div>' +
          '<div class="f"><span><i class="dot"></i>Live from the signed record</span><a href="' + link + '" target="_blank" rel="noopener">Lunara Society →</a></div></div>';
        return;
      }
      var next = obs[0], same = obs.filter(function (e) { return e.t === next.t; });
      var head = same.length > 1 ? same.length + ' obligations bind on ' + fmt(next.t) : next.o.name;
      var sub = same.length > 1 ? same.map(function (e) { return e.o.name; }).join(' · ') : next.o.jurisdiction + ' · binds ' + fmt(next.t);
      var rest = obs.filter(function (e) { return e.t !== next.t; }).slice(0, listN);

      root.innerHTML = '<style>' + css(light) + '</style><div class="w" role="group" aria-label="Next AI regulation deadline">' +
        '<div class="k">Next binding AI deadline</div>' +
        '<div class="n">' + esc(head) + '</div><div class="j">' + esc(sub) + '</div>' +
        '<div class="c" aria-live="off"><div><b data-u="d">–</b><span>days</span></div><div><b data-u="h">–</b><span>hours</span></div><div><b data-u="m">–</b><span>min</span></div><div><b data-u="s">–</b><span>sec</span></div></div>' +
        '<div class="a">' + same.map(function (e) { return esc(e.o.article); }).join('<br>') + '</div>' +
        (rest.length ? '<ul>' + rest.map(function (e) { return '<li><span>' + esc(e.o.name) + '</span><em>' + fmt(e.t) + '</em></li>'; }).join('') + '</ul>' : '') +
        '<div class="f"><span><i class="dot"></i>Live from the signed record</span><a href="' + link + '" target="_blank" rel="noopener">Lunara Society →</a></div></div>';

      var u = {}; ['d', 'h', 'm', 's'].forEach(function (k) { u[k] = root.querySelector('[data-u="' + k + '"]'); });
      function tick() {
        var ms = Math.max(0, next.t - Date.now());
        u.d.textContent = Math.floor(ms / DAY);
        u.h.textContent = pad(Math.floor(ms / 3600000) % 24);
        u.m.textContent = pad(Math.floor(ms / 60000) % 60);
        u.s.textContent = pad(Math.floor(ms / 1000) % 60);
      }
      tick(); setInterval(tick, 1000);
    }).catch(function () { /* the plain link in the host page stays visible */ root.innerHTML = '<slot></slot>'; });
  }

  function boot() { [].forEach.call(document.querySelectorAll('[data-lunara-countdown]'), render); }
  // For pages that add a countdown after load, such as the preview on /embed.html.
  window.__lunaraEmbedBoot = boot;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
