/* ═══════════════════════════════════════════════════════════════════
   THE LEDGER — the corrections, seen before they are read
   ═══════════════════════════════════════════════════════════════════

   evidence.html publishes every correction in full, and it should stay
   in full: a correction is meant to be as prominent as the error was.
   But five long cards in a row read as a wall, and a reader on a phone
   cannot see that there are five, or where they are, until they have
   scrolled through all of them.

   So this adds a ledger above them, and changes nothing inside them.
   Every word in the ledger is read from the cards on the page (the
   issue line and the headline), so it cannot say anything the page
   does not. Tapping an entry carries the reader to it; the entry lights
   as its card is read. Each card gains its number, large and faint.
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var cards = [].slice.call(document.querySelectorAll('.correction'));
  if (cards.length < 2) return;
  var REDUCED = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);

  var css = [
    '.ledger{display:block;position:relative;margin:34px 0 40px;padding:26px 24px 22px;border-radius:14px;border:1px solid rgba(226,196,122,.22);',
    '  background:radial-gradient(90% 120% at 0% 0%,rgba(226,196,122,.10),transparent 60%),rgba(10,11,14,.78)}',
    '.ledger-k{font:10px "IBM Plex Mono",ui-monospace,monospace;letter-spacing:.2em;text-transform:uppercase;color:#E2C47A}',
    '.ledger-row{position:relative;display:grid;gap:14px;margin-top:22px}',
    '.ledger-line{position:absolute;left:0;right:0;top:9px;height:1px;background:rgba(214,222,234,.16)}',
    '.ledger-fill{position:absolute;left:0;top:9px;height:1px;width:0;background:linear-gradient(90deg,rgba(226,196,122,.2),#F3DA9A);',
    '  box-shadow:0 0 12px rgba(226,196,122,.6);transition:width .6s cubic-bezier(.2,.7,.2,1)}',
    '.ledger a{position:relative;display:block;text-decoration:none;color:inherit;padding-top:30px}',
    '.ledger a i{position:absolute;top:2px;left:0;width:15px;height:15px;border-radius:50%;border:1px solid rgba(226,196,122,.6);background:#0A0C10;transition:all .5s ease}',
    '.ledger a.seen i{background:#E2C47A;box-shadow:0 0 14px rgba(226,196,122,.8)}',
    '.ledger a.here i{transform:scale(1.35)}',
    '.ledger a b{display:block;font:10px "IBM Plex Mono",monospace;letter-spacing:.14em;text-transform:uppercase;color:#9AA0AA}',
    '.ledger a span{display:block;margin-top:8px;font-family:"Cormorant Garamond",Georgia,serif;font-size:17px;line-height:1.3;color:#D8D4CC;transition:color .4s ease}',
    '.ledger a:hover span,.ledger a.here span{color:#F2EEE6}',
    '.correction{position:relative;overflow:hidden}',
    '.correction .ledger-no{position:absolute;right:18px;top:-8px;font-family:"Cormorant Garamond",Georgia,serif;font-weight:300;',
    '  font-size:150px;line-height:1;color:rgba(226,196,122,.07);pointer-events:none;user-select:none}',
    '.correction.ledger-flash{animation:ledgerFlash 1.8s ease}',
    '@keyframes ledgerFlash{0%,35%{box-shadow:0 0 0 1px rgba(226,196,122,.7),0 0 80px -10px rgba(226,196,122,.45)}100%{box-shadow:none}}'
  ].join('\n');
  var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  function text(el) { return el ? el.textContent.replace(/\s+/g, ' ').trim() : ''; }

  var box = document.createElement('nav');
  box.className = 'ledger';
  box.setAttribute('aria-label', 'The corrections on this page');
  var row = '<div class="ledger-row" style="grid-template-columns:repeat(' + cards.length + ',minmax(0,1fr))">' +
    '<div class="ledger-line"></div><div class="ledger-fill" id="ledger-fill"></div>';
  cards.forEach(function (c, i) {
    if (!c.id) c.id = 'correction-' + (i + 1);
    var head = text(c.querySelector('.correction-head')).replace(/^Correction\s*·\s*/i, '');
    var title = text(c.querySelector('h3'));
    row += '<a href="#' + c.id + '" data-i="' + i + '"><i></i><b>' + String(i + 1).padStart(2, '0') + ' · ' +
      head.replace(/</g, '&lt;') + '</b><span>' + title.replace(/</g, '&lt;') + '</span></a>';
    var no = document.createElement('div');
    no.className = 'ledger-no';
    no.setAttribute('aria-hidden', 'true');
    no.textContent = String(i + 1).padStart(2, '0');
    c.insertBefore(no, c.firstChild);
  });
  row += '</div>';
  box.innerHTML = '<p class="ledger-k">' + cards.length + ' corrections, published against ourselves</p>' + row;
  cards[0].parentNode.insertBefore(box, cards[0]);

  var links = [].slice.call(box.querySelectorAll('a'));
  var fill = document.getElementById('ledger-fill');

  box.addEventListener('click', function (e) {
    var a = e.target.closest('a'); if (!a) return;
    var c = cards[+a.getAttribute('data-i')];
    e.preventDefault();
    c.scrollIntoView({ behavior: REDUCED ? 'auto' : 'smooth', block: 'start' });
    c.classList.remove('ledger-flash'); void c.offsetWidth; c.classList.add('ledger-flash');
    if (history.replaceState) history.replaceState(null, '', '#' + c.id);
  });

  function mark() {
    var mid = window.innerHeight * 0.45, here = -1;
    cards.forEach(function (c, i) { if (c.getBoundingClientRect().top < mid) here = i; });
    links.forEach(function (a, i) {
      a.classList.toggle('seen', i <= here);
      a.classList.toggle('here', i === here);
    });
    if (here < 0) { fill.style.width = '0'; return; }
    var a = links[here].querySelector('i');
    var rr = box.querySelector('.ledger-row').getBoundingClientRect();
    fill.style.width = (a.getBoundingClientRect().left - rr.left + 8) + 'px';
  }
  window.addEventListener('scroll', function () { requestAnimationFrame(mark); }, { passive: true });
  window.addEventListener('resize', mark);
  mark();
})();
