/* ═══════════════════════════════════════════════════════════════════
   THE SHELL — injected, not pasted
   ═══════════════════════════════════════════════════════════════════

   One navigation and one footer for every page, from one file. The
   markup is written here and inserted at runtime, replacing whatever
   header and footer the page shipped with.

   Why runtime rather than a build step: this site has no build step,
   and a partial that has to be copied into fifty-three files is a
   partial that drifts. It already did — twenty-nine different headers,
   with the same product called Shield, Initiation, Apply and Get
   Certified on four different pages.

   Progressive enhancement: a page's own header stays in the HTML and
   is only removed once this script has built the replacement, so a
   reader without JavaScript keeps the navigation the page shipped
   with rather than losing navigation altogether.
   ═══════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  /* The six destinations, one name each. Changing a name here changes
     it everywhere, which is the whole point of this file existing. */
  var NAV = [
    { href: 'intelligence.html', label: 'Intelligence' },
    { href: 'registry.html',     label: 'Registry' },
    { href: 'shield.html',       label: 'Certification' },
    { href: 'mcp.html',          label: 'For AI Systems' },
    { href: 'evidence.html',     label: 'Evidence' }
  ];

  var FOOT = [
    { head: 'The record', links: [
      ['intelligence.html', 'Regulatory intelligence'],
      ['registry.html',     'Public register'],
      ['evidence.html',     'Evidence standard'],
      ['signing.html',      'How to verify us'],
      ['glossary.html',     'Glossary']
    ]},
    { head: 'Certification', links: [
      ['shield.html',              'Shield certification'],
      ['scorer.html',              'Risk scorer'],
      ['verification-matrix.html', 'Verification matrix'],
      ['constitution.html',        'The constitution']
    ]},
    { head: 'Answers', links: [
      ['what-is-shield-certification.html', 'What is Shield certification?'],
      ['verify-an-ai-business.html',        'How to verify an AI business'],
      ['ai-trust-standards.html',           'AI trust standards'],
      ['trust-badges.html',                 'What a trust badge proves'],
      ['ai-agent-verification.html',        'AI agent verification'],
      ['glossary.html',                     'Glossary']
    ]},
    { head: 'For machines', links: [
      ['mcp.html',            'MCP server'],
      ['test.html',           'The Lunara Test'],
      ['/corpus/index.json',  'Corpus index'],
      ['/llms.txt',           'llms.txt']
    ]}
  ];

  var here = location.pathname.split('/').pop() || 'index.html';
  var esc = function (s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); };

  /* ── the navigation ─────────────────────────────────────────── */
  var nav = document.createElement('nav');
  nav.className = 'lxn';
  nav.innerHTML =
    '<a class="lxn-brand" href="/">' +
      '<img src="/lunara_emblem_96.png" alt="" width="31" height="31" decoding="async">' +
      '<span>Lunara Society</span>' +
    '</a>' +
    '<div class="lxn-mid">' +
      '<a href="/"' + (here === 'index.html' ? ' aria-current="page"' : '') + '>Home</a>' +
      NAV.map(function (n) {
        return '<a href="/' + esc(n.href) + '"' + (here === n.href ? ' aria-current="page"' : '') + '>' + esc(n.label) + '</a>';
      }).join('') +
    '</div>' +
    '<div class="lxn-end">' +
      '<a class="lxn-ghost" href="/member.html">Sign in</a>' +
      '<a class="lxn-cta" href="/shield.html">Apply</a>' +
      '<button class="lxn-burger" type="button" aria-label="Open navigation" aria-expanded="false"><i></i></button>' +
    '</div>';

  var drawer = document.createElement('div');
  drawer.className = 'lxn-drawer';
  drawer.setAttribute('role', 'dialog');
  drawer.setAttribute('aria-label', 'Navigation');
  drawer.setAttribute('aria-modal', 'true');
  drawer.innerHTML =
    '<button class="lxn-x" type="button" aria-label="Close navigation">&times;</button>' +
    '<a href="/">Home</a>' +
    NAV.map(function (n) { return '<a href="/' + esc(n.href) + '">' + esc(n.label) + '</a>'; }).join('') +
    '<a href="/member.html">Sign in</a>';

  /* ── the footer ─────────────────────────────────────────────── */
  var foot = document.createElement('footer');
  foot.className = 'lxf';
  foot.innerHTML =
    '<div class="lxf-in">' +
      '<div class="lxf-grid">' +
        '<div class="lxf-col lxf-brand">' +
          '<a class="lxn-brand" href="/">' +
            '<img src="/lunara_emblem_96.png" alt="" width="28" height="28" decoding="async" style="width:28px;height:28px">' +
            '<span style="font-size:14px">Lunara Society</span>' +
          '</a>' +
          '<p>Constitutional governance for autonomous AI systems. Reading the record is free, unauthenticated and always will be.</p>' +
        '</div>' +
        FOOT.map(function (c) {
          return '<div class="lxf-col"><h4>' + esc(c.head) + '</h4>' +
            c.links.map(function (l) {
              var href = l[0].charAt(0) === '/' ? l[0] : '/' + l[0];
              return '<a href="' + esc(href) + '">' + esc(l[1]) + '</a>';
            }).join('') + '</div>';
        }).join('') +
      '</div>' +
      '<div class="lxf-base">' +
        '<span>Lunara Society &middot; Est. MMXXVI</span>' +
        '<span><a href="/privacy.html">Privacy</a> &middot; <a href="/terms.html">Terms</a> &middot; <a href="/contact.html">Contact</a></span>' +
      '</div>' +
    '</div>';

  function install() {
    /* The page's own header, if it has one. Not every <nav> is a
       header: the answer pages carry a contents rail that is correctly
       marked up as one, and eating it would be a regression nobody
       would notice until a reader lost their place. */
    var old = document.querySelector('nav:not(.lxn):not(.toc)');
    var oldFoot = document.querySelector('footer');

    document.body.insertBefore(nav, document.body.firstChild);
    document.body.insertBefore(drawer, nav.nextSibling);
    if (oldFoot && oldFoot.parentNode) oldFoot.parentNode.replaceChild(foot, oldFoot);
    else document.body.appendChild(foot);

    /* Only now is the page's own header removed — up to this point a
       reader without JavaScript still has one. */
    if (old && old !== nav && old.parentNode) old.parentNode.removeChild(old);

    /* Some pages ship a second, page-specific mobile header or a
       back-to-hall control. Two headers is worse than either one. */
    ['#mob-nav', '#mob-back-btn', '#top-nav', '.mob-header', '#drawer', '#mob-drawer'].forEach(function (sel) {
      var el = document.querySelector(sel);
      if (el && el.parentNode) el.parentNode.removeChild(el);
    });

    document.body.classList.add('lx-shelled');

    var burger = nav.querySelector('.lxn-burger');
    var close  = drawer.querySelector('.lxn-x');
    function set(on) {
      drawer.classList.toggle('on', on);
      burger.setAttribute('aria-expanded', on ? 'true' : 'false');
      document.documentElement.style.overflow = on ? 'hidden' : '';
      if (on) close.focus(); else burger.focus();
    }
    burger.addEventListener('click', function () { set(true); });
    close.addEventListener('click', function () { set(false); });
    drawer.addEventListener('click', function (e) { if (e.target === drawer) set(false); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && drawer.classList.contains('on')) set(false);
    });
  }

  /* ── the member mark ──────────────────────────────────────────
     Loaded from here so it reaches every page the shell reaches.
     Before this it was on exactly one page out of sixty, which meant
     a signed-in member browsing the site saw "Sign in" in the header
     everywhere and had no way to sign out at all except from one
     sidebar button on member.html.

     It loads after the nav exists, because it looks for .lxn-end to
     hang the badge on. One Tap is left on: it only appears for
     visitors with no session, and it remembers being dismissed. */
  function loadMember() {
    if (document.querySelector('script[src*="lunara-member.js"]')) return;
    var s = document.createElement('script');
    s.src = '/lunara-member.js';
    s.defer = true;
    document.head.appendChild(s);
  }

  function boot() { install(); loadMember(); }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
