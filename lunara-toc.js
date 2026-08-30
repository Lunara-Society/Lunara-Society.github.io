/* ═══════════════════════════════════════════════════════════════════
   THE CONTENTS RAIL
   ═══════════════════════════════════════════════════════════════════

   Built at runtime from the page's own headings, so it cannot drift
   from them and no page has to maintain a second copy of its own
   structure.

   Two reasons it exists. A reader arriving from a search for one of
   these questions usually wants one section, not the essay, and a rail
   is how they find it without scrolling past four screens. And a page
   whose sections are addressable is a page a search engine can offer
   jump links into, which is the difference between one result and a
   result with its own sub-navigation.

   Desktop only, at 1160px and up, where the reading column already
   leaves the space empty. Below that it would be a lid on the article.
   ═══════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  var prose = document.querySelector('.prose');
  if (!prose || !window.matchMedia('(min-width: 1160px)').matches) return;

  var heads = [].slice.call(prose.querySelectorAll('h2'));
  if (heads.length < 3) return;   /* three sections is not a contents list */

  var used = Object.create(null);
  function slugFor(el) {
    if (el.id) return el.id;
    var base = (el.textContent || '')
      .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 44) || 'section';
    var id = base, n = 2;
    while (used[id] || document.getElementById(id)) id = base + '-' + n++;
    used[id] = true;
    el.id = id;
    return id;
  }

  var rail = document.createElement('nav');
  rail.className = 'toc';
  rail.setAttribute('aria-label', 'On this page');

  var html = '<p class="toc-head">On this page</p><ol>';
  heads.forEach(function (h) {
    var id = slugFor(h);
    html += '<li><a href="#' + id + '">' +
      h.textContent.replace(/&/g, '&amp;').replace(/</g, '&lt;') + '</a></li>';
  });
  rail.innerHTML = html + '</ol>';

  /* The rail is a sibling of the prose, not a child, so the reading
     measure stays exactly what it was. */
  prose.parentNode.insertBefore(rail, prose.nextSibling);
  prose.parentNode.classList.add('has-toc');

  /* Which section is being read. Highlighting the heading nearest the
     top of the viewport is more truthful than the last one crossed,
     which lights up the section you have just finished. */
  var links = {};
  [].forEach.call(rail.querySelectorAll('a'), function (a) { links[a.getAttribute('href').slice(1)] = a; });
  var current = null;

  function mark() {
    var best = null, bestTop = Infinity;
    for (var i = 0; i < heads.length; i++) {
      var t = heads[i].getBoundingClientRect().top - 130;
      if (t <= 0 && Math.abs(t) < Math.abs(bestTop)) { best = heads[i]; bestTop = t; }
      else if (t > 0 && best === null && t < bestTop) { best = heads[i]; bestTop = t; }
    }
    var id = best && best.id;
    if (id === current) return;
    if (current && links[current]) links[current].classList.remove('on');
    if (id && links[id]) links[id].classList.add('on');
    current = id;
  }

  var ticking = false;
  window.addEventListener('scroll', function () {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () { ticking = false; mark(); });
  }, { passive: true });
  mark();
})();
