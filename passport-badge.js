/* ============================================================
   LUNARA PASSPORT — the free badge
   ------------------------------------------------------------
   Any site whose passport grades B or better may show it:

     <div data-lunara-passport></div>
     <script src="https://lunarasociety.com/passport-badge.js" async></script>

   The badge reads the passport of the domain it is running on,
   never a domain written into the page, so it cannot be copied
   onto another site. It is rescanned at least weekly; when the
   grade falls below B, or the scan is over a month old, the
   badge shows nothing rather than an old claim.

   It measures public security signals. It is not the Shield
   credential: that one needs a named human review (badge.js).
   Shadow DOM, no cookies, no tracking.
   ============================================================ */
(function () {
  'use strict';
  var API = 'https://luiqtimzcsoqnizybifs.supabase.co/functions/v1/lunara-registry/passportBadge';
  var SITE = 'https://lunarasociety.com/passport.html?d=';
  var COLOR = { 'A+': '#7FE0B0', A: '#7FE0B0', B: '#E2C47A' };

  function domainHere(el) {
    var h = location.hostname.toLowerCase().replace(/^www\./, '');
    // Previews on our own pages and local development may name a domain.
    if (/^(localhost|127\.0\.0\.1)$/.test(h) || h === 'lunarasociety.com') return (el.getAttribute('data-domain') || h).toLowerCase().replace(/^www\./, '');
    return h;
  }
  function fmt(iso) {
    try { return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }); } catch (e) { return iso.slice(0, 10); }
  }

  function render(el, d) {
    var light = el.getAttribute('data-theme') === 'light';
    var c = COLOR[d.grade] || '#E2C47A';
    var root = el.shadowRoot || el.attachShadow({ mode: 'open' });
    var bg = light ? '#FBF8F1' : '#0D1016', fg = light ? '#1D1A14' : '#F4F0E8', mute = light ? '#6B655A' : '#A9AEB8', line = light ? 'rgba(0,0,0,.12)' : 'rgba(255,255,255,.12)';
    root.innerHTML = '<style>'
      + 'a{display:inline-flex;align-items:center;gap:12px;padding:8px 16px 8px 8px;border-radius:999px;background:' + bg + ';border:1px solid ' + line + ';text-decoration:none;font-family:Inter,system-ui,-apple-system,sans-serif;color:' + fg + ';box-shadow:0 6px 20px -10px rgba(0,0,0,.5);transition:transform .15s}'
      + 'a:hover{transform:translateY(-1px)}'
      + '.g{width:40px;height:40px;border-radius:50%;display:grid;place-items:center;font:700 15px Inter,system-ui,sans-serif;color:' + c + ';border:2px solid ' + c + ';box-shadow:0 0 14px -2px ' + c + '}'
      + '.t{display:flex;flex-direction:column;line-height:1.25}'
      + '.k{font:600 10px ui-monospace,Menlo,monospace;letter-spacing:.16em;text-transform:uppercase;color:' + mute + '}'
      + '.v{font-size:14px;font-weight:600}.s{font-size:11px;color:' + mute + '}'
      + '</style>'
      + '<a href="' + SITE + encodeURIComponent(d.domain) + '" target="_blank" rel="noopener" title="Lunara Passport: public security signals of ' + d.domain + ', checked ' + fmt(d.scanned_at) + '">'
      + '<span class="g">' + d.grade + '</span>'
      + '<span class="t"><span class="k">Lunara Passport</span><span class="v">Grade ' + d.grade + ' · ' + d.score + '/100</span>'
      + '<span class="s">Checked ' + fmt(d.scanned_at) + (d.visa === 'verified' ? ' · Shield verified' : '') + '</span></span></a>';
  }

  function mount(el) {
    if (el.getAttribute('data-lunara-mounted')) return;
    el.setAttribute('data-lunara-mounted', '1');
    var domain = domainHere(el);
    if (el.__lunaraPreview) return render(el, el.__lunaraPreview);
    fetch(API + '?domain=' + encodeURIComponent(domain))
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (d && d.eligible) render(el, d);
        else if (window.console) console.info('Lunara Passport: no badge for ' + domain + ' (grade ' + (d && d.grade || 'unknown') + '; B or better, scanned within a month, is needed). ' + SITE + domain);
      })
      .catch(function () { /* show nothing rather than a guess */ });
  }

  window.LunaraPassportBadge = { render: render };
  function all() { Array.prototype.forEach.call(document.querySelectorAll('[data-lunara-passport]'), mount); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', all); else all();
})();
