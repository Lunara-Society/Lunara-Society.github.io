/* ═══════════════════════════════════════════════════════════════
   LUNARA SOCIETY — INSTITUTIONAL SECURITY LAYER v2.0
   Applied to all pages. Do not remove.
   ═══════════════════════════════════════════════════════════════ */

(function(){
  'use strict';

  /* ─── 1. SESSION TRACKING ─── */
  var sessionId = 'LUN-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).substr(2,6).toUpperCase();
  var sessionStart = new Date().toISOString();
  try { sessionStorage.setItem('lunara_session', sessionId); } catch(e){}

  /* ─── 2. DISABLE TEXT SELECTION ─── */
  document.addEventListener('selectstart', function(e){ e.preventDefault(); });
  document.addEventListener('mousedown', function(e){ if(e.detail > 1) e.preventDefault(); });

  /* ─── 3. DISABLE RIGHT CLICK ─── */
  document.addEventListener('contextmenu', function(e){ e.preventDefault(); showSecurityNotice(); });

  /* ─── 4. DISABLE COPY SHORTCUTS ─── */
  document.addEventListener('keydown', function(e){
    var key = e.key ? e.key.toLowerCase() : '';
    var ctrl = e.ctrlKey || e.metaKey;
    // Block copy, select all, save, print, view source, find
    if(ctrl && ['c','a','s','p','u','f','g'].indexOf(key) > -1){ e.preventDefault(); }
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

  /* ─── 7. DEVTOOLS DETECTION (Tab focus anomaly method) ─── */
  var devtoolsOpen = false;
  var threshold = 160;
  setInterval(function(){
    if(window.outerWidth - window.innerWidth > threshold || window.outerHeight - window.innerHeight > threshold){
      if(!devtoolsOpen){
        devtoolsOpen = true;
        document.body.innerHTML = '<div style="background:#000;color:#C4A46B;font-family:monospace;display:flex;align-items:center;justify-content:center;height:100vh;text-align:center;padding:40px;"><div><p style="font-size:14px;letter-spacing:3px;text-transform:uppercase;margin-bottom:16px">LUNARA SOCIETY</p><p style="font-size:12px;color:rgba(255,255,255,0.4);letter-spacing:1px;">Institutional access only.<br>This session has been logged.<br>Session: ' + sessionId + '</p></div></div>';
      }
    } else {
      devtoolsOpen = false;
    }
  }, 1000);

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
