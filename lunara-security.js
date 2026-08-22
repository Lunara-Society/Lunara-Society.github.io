/* ═══════════════════════════════════════════════════════════════
   LUNARA SOCIETY — INSTITUTIONAL SECURITY LAYER v2.0
   Applied to all pages. Do not remove.
   ═══════════════════════════════════════════════════════════════ */

(function(){
  'use strict';

  /* Anything a person types into. None of the protections below may
     apply inside one of these: a member who cannot select, correct or
     paste into the passphrase box cannot sign in, and a protection
     that stops people using the site is not protecting anything. */
  function inField(target){
    var el = target;
    while(el && el.nodeType === 1){
      var tag = el.tagName;
      if(tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
      if(el.isContentEditable) return true;
      el = el.parentElement;
    }
    return false;
  }

  /* ─── 1. SESSION TRACKING ─── */
  /* Prefixed SESSION, not LUN. This string is printed to the visitor
     in the security notice and the watermark, and with a LUN- prefix
     it wore the exact shape of a Lunara ID — an identity credential
     issued by this institution — while being nothing of the kind. On a
     site whose product is verified identity, two things that look
     alike and are not is the one confusion never worth having. */
  var sessionId = 'SESSION-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).substr(2,6).toUpperCase();
  var sessionStart = new Date().toISOString();
  try { sessionStorage.setItem('lunara_session', sessionId); } catch(e){}

  /* ─── 2. DISABLE TEXT SELECTION ─── */
  document.addEventListener('selectstart', function(e){ if(!inField(e.target)) e.preventDefault(); });
  document.addEventListener('mousedown', function(e){ if(e.detail > 1 && !inField(e.target)) e.preventDefault(); });

  /* ─── 3. DISABLE RIGHT CLICK ─── */
  document.addEventListener('contextmenu', function(e){
    if(inField(e.target)) return;    // paste lives in this menu
    e.preventDefault(); showSecurityNotice();
  });

  /* ─── 4. DISABLE COPY SHORTCUTS ─── */
  document.addEventListener('keydown', function(e){
    var key = e.key ? e.key.toLowerCase() : '';
    var ctrl = e.ctrlKey || e.metaKey;
    // Block copy, select all, save, print, view source, find — but
    // never while the caret is in a field. Ctrl+A in the passphrase
    // box is someone fixing a typo, not someone taking the page.
    if(ctrl && ['c','a','s','p','u','f','g'].indexOf(key) > -1 && !inField(e.target)){ e.preventDefault(); }
    // Block F12 devtools
    if(e.key === 'F12'){ e.preventDefault(); showSecurityNotice(); }
    // Block Shift+F10 context
    if(e.shiftKey && e.key === 'F10'){ e.preventDefault(); }
    // Block Ctrl+Shift+I/J/C (devtools)
    if(ctrl && e.shiftKey && ['i','j','c'].indexOf(key) > -1){ e.preventDefault(); }
    // Block PrintScreen signal (best effort)
    if(e.key === 'PrintScreen'){ e.preventDefault(); }
  });

  /* ─── 5. DISABLE DRAG ─── */
  document.addEventListener('dragstart', function(e){ e.preventDefault(); });

  /* ─── 6. DISABLE IMAGE SAVE ─── */
  document.addEventListener('mousedown', function(e){
    if(e.target.tagName === 'IMG'){ e.preventDefault(); return false; }
  });

  /* ─── 7. DEVTOOLS DETECTION — removed ───
     This used to compare outerWidth to innerWidth every second and, on
     a gap over 160px, replace document.body.innerHTML with a notice.

     That gap is produced by an ordinary browser sidebar, by a zoom
     level other than 100%, and by several window managers. It fired on
     people who were simply reading, and what it did to them was delete
     the page they were on — including, on this member area, a sign-in
     form they were halfway through. Anyone actually opening devtools
     can undo it in one line, so it stopped no one and cost real
     visitors their session. It is gone rather than tuned: there is no
     threshold that separates a docked inspector from a docked
     bookmarks bar. */
  /* ─── 8. SECURITY NOTICE OVERLAY ─── */
  function showSecurityNotice(){
    var existing = document.getElementById('lunara-security-notice');
    if(existing){ existing.style.display = 'flex'; return; }
    var overlay = document.createElement('div');
    overlay.id = 'lunara-security-notice';
    overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.92);z-index:99999;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(8px)';
    overlay.innerHTML = '<div style="background:#141414;border:1px solid rgba(196,164,107,0.3);padding:48px;max-width:440px;text-align:center;">' +
      '<p style="font-size:10px;letter-spacing:4px;text-transform:uppercase;color:#C4A46B;margin-bottom:16px">Security Notice</p>' +
      '<p style="font-size:16px;color:rgba(255,255,255,0.9);margin-bottom:12px">This content is protected.</p>' +
      '<p style="font-size:13px;color:rgba(255,255,255,0.4);line-height:1.7;margin-bottom:32px">Lunara Society content is for authorized access only. This session is being logged.</p>' +
      '<p style="font-size:10px;font-family:monospace;color:rgba(196,164,107,0.5);margin-bottom:24px">Session: ' + sessionId + '</p>' +
      '<button onclick="document.getElementById(\'lunara-security-notice\').style.display=\'none\'" style="background:#C4A46B;color:#000;border:none;padding:12px 32px;font-size:11px;font-weight:600;letter-spacing:2px;text-transform:uppercase;cursor:pointer;font-family:Inter,sans-serif">Understood</button>' +
      '</div>';
    document.body.appendChild(overlay);
  }

  /* ─── 9. DYNAMIC WATERMARK ─── */
  function injectWatermark(){
    var wm = document.createElement('div');
    wm.id = 'lunara-watermark';
    var ts = new Date().toISOString().replace('T',' ').substr(0,16);
    var text = 'LUNARA SOCIETY · PROTECTED · ' + ts + ' · ' + sessionId;
    wm.style.cssText = [
      'position:fixed','top:0','left:0','width:100vw','height:100vh',
      'pointer-events:none','z-index:9998','overflow:hidden',
      'opacity:0.04'
    ].join(';');

    var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="200">' +
      '<text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" ' +
      'font-family="Georgia,serif" font-size="13" fill="#C4A46B" ' +
      'transform="rotate(-35 300 100)">' + text + '</text></svg>';

    var encoded = 'data:image/svg+xml;base64,' + btoa(svg);
    wm.style.backgroundImage = 'url("' + encoded + '")';
    wm.style.backgroundRepeat = 'repeat';
    wm.style.backgroundSize = '600px 200px';
    document.body.appendChild(wm);

    /* Mutation observer — prevent watermark removal */
    var mo = new MutationObserver(function(mutations){
      mutations.forEach(function(m){
        m.removedNodes.forEach(function(n){
          if(n.id === 'lunara-watermark'){ document.body.appendChild(wm); }
        });
      });
    });
    mo.observe(document.body, { childList: true });
  }

  /* ─── 10. AUDIT LOG (localStorage) ─── */
  function logAccess(){
    try {
      var log = JSON.parse(localStorage.getItem('lunara_access_log') || '[]');
      log.push({ session: sessionId, page: window.location.pathname, time: sessionStart, ua: navigator.userAgent.substr(0,80) });
      if(log.length > 50) log = log.slice(-50);
      localStorage.setItem('lunara_access_log', JSON.stringify(log));
    } catch(e){}
  }

  /* ─── INIT ─── */
  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', function(){ injectWatermark(); logAccess(); });
  } else {
    injectWatermark(); logAccess();
  }

})();
