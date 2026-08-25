/* ═══════════════════════════════════════════════════════════════════
   THE MEMBER MARK
   ═══════════════════════════════════════════════════════════════════

   Two things, on any page that includes this file.

   1. An indicator. If the visitor holds a session, the page says so —
      their Lunara ID, in the navigation, settling into place one
      character at a time. It is drawn only after the server confirms
      the session is real. A page that trusted localStorage would show
      a member badge to anyone who typed one into their own console,
      which on a site whose product is verified identity would be a
      poor joke.

   2. Google One Tap, for visitors who are not signed in. This is the
      only way the account list appears without being asked for, and
      it is as close to "the list arrives on its own" as the platform
      allows. It is Google's own card, drawn by Google in an iframe or
      by the browser under FedCM — its appearance is not ours to set,
      deliberately, because a page that could repaint an account
      chooser could forge one.

   Add data-lunara-onetap="off" to the script tag to load the
   indicator without the prompt.
   ═══════════════════════════════════════════════════════════════════ */

(function(){
  'use strict';

  var AUTH = 'https://xkriotfcoialxmqvherb.supabase.co/functions/v1/lunara-auth';
  var CLIENT_ID = '744926178467-645eltr29q4o3lo8msnlnuqsa782feca.apps.googleusercontent.com';
  var ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  var self = document.currentScript;
  var wantOneTap = !self || self.getAttribute('data-lunara-onetap') !== 'off';
  var still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function post(action, payload){
    return fetch(AUTH + '/' + action, {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify(payload)
    }).then(function(r){ return r.json(); });
  }

  /* ── styles ─────────────────────────────────────────────────── */
  var css = document.createElement('style');
  css.textContent = [
    '.lun-mark{display:inline-flex;align-items:center;gap:9px;text-decoration:none;',
      'padding:7px 15px 7px 12px;border:1px solid rgba(196,164,107,0.32);border-radius:999px;',
      'background:rgba(196,164,107,0.06);font-family:Inter,system-ui,sans-serif;',
      'opacity:0;transform:translateY(-4px);transition:opacity .6s ease,transform .6s ease,',
      'border-color .25s ease,background .25s ease;white-space:nowrap}',
    '.lun-mark.in{opacity:1;transform:none}',
    '.lun-mark:hover{border-color:rgba(196,164,107,0.7);background:rgba(196,164,107,0.11)}',
    '.lun-dot{width:6px;height:6px;border-radius:50%;background:#C4A46B;flex:none;',
      'box-shadow:0 0 0 0 rgba(196,164,107,0.5);animation:lunPulse 3.4s ease-out infinite}',
    '@keyframes lunPulse{0%{box-shadow:0 0 0 0 rgba(196,164,107,0.45)}',
      '70%{box-shadow:0 0 0 7px rgba(196,164,107,0)}100%{box-shadow:0 0 0 0 rgba(196,164,107,0)}}',
    '.lun-id{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11.5px;',
      'letter-spacing:0.09em;color:#D4B47B}',
    '.lun-id .s{color:rgba(196, 164, 107, 0.714);padding:0 .1em}',
    '.lun-who{font-size:10px;letter-spacing:0.16em;text-transform:uppercase;',
      'color:rgba(255, 255, 255, 0.472)}',
    '@media (max-width:900px){.lun-who{display:none}}',
    '@media (prefers-reduced-motion:reduce){.lun-mark{transition:none}.lun-dot{animation:none}}'
  ].join('');
  document.head.appendChild(css);

  /* Characters settle left to right, the order the id is read aloud.
     Separators are placed as the hyphens they are — an en dash would
     look better and would mean anyone who copied this got a string
     that is not their identifier. */
  function settle(host, id){
    host.textContent = '';
    var cells = id.split('').map(function(c){
      var s = document.createElement('span');
      if(c === '-'){ s.className = 's'; s.textContent = '-'; }
      else { s.textContent = still ? c : ALPHABET[(Math.random()*32)|0]; }
      host.appendChild(s);
      return { node:s, ch:c };
    });
    if(still) return;

    var spin = setInterval(function(){
      cells.forEach(function(c){
        if(c.ch !== '-' && !c.done) c.node.textContent = ALPHABET[(Math.random()*32)|0];
      });
    }, 50);

    var i = 0;
    (function step(){
      if(i >= cells.length){ clearInterval(spin); return; }
      var c = cells[i++];
      c.done = true; c.node.textContent = c.ch;
      setTimeout(step, c.ch === '-' ? 35 : 85);
    })();
  }

  function mount(data){
    var host = document.querySelector('[data-lunara-mark]')
            || document.querySelector('#top-nav .nav-cta')
            || document.querySelector('#top-nav');
    if(!host) return;

    var a = document.createElement('a');
    a.className = 'lun-mark';
    a.href = 'member.html';
    a.title = 'Signed in as ' + (data.email || data.lunara_id);
    a.innerHTML = '<span class="lun-dot"></span><span class="lun-who"></span><span class="lun-id"></span>';
    a.querySelector('.lun-who').textContent =
      data.full_name ? data.full_name.split(' ')[0] : 'Member';
    host.insertBefore(a, host.firstChild);

    requestAnimationFrame(function(){ a.classList.add('in'); });
    setTimeout(function(){ settle(a.querySelector('.lun-id'), data.lunara_id); }, still ? 0 : 260);
  }

  /* ── One Tap ────────────────────────────────────────────────── */

  function oneTap(){
    if(!wantOneTap) return;
    if(localStorage.getItem('lunara_onetap_dismissed') === '1') return;
    if(!window.google || !google.accounts || !google.accounts.id) return;

    google.accounts.id.initialize({
      client_id: CLIENT_ID,
      callback: function(res){
        post('google', { id_token: res.credential }).then(function(data){
          if(!data.success) return;
          try{
            localStorage.setItem('lunara_session_token', data.session_token);
            localStorage.setItem('lunara_id', data.lunara_id);
            localStorage.setItem('lunara_name', data.full_name || '');
            localStorage.setItem('lunara_tier', data.tier || '');
            if(data.email) localStorage.setItem('lunara_email', String(data.email).toLowerCase());
          } catch(e){}
          mount(data);
        });
      },
      auto_select: false,
      cancel_on_tap_outside: true,
      itp_support: true,
      use_fedcm_for_prompt: true
    });

    google.accounts.id.prompt(function(n){
      // Someone who closes it has answered. Asking again on the next
      // page view would be pestering, and the whole point of the card
      // is that it is offered rather than demanded.
      try{
        if(n && typeof n.isSkippedMoment === 'function' && n.isSkippedMoment()){
          localStorage.setItem('lunara_onetap_dismissed', '1');
        }
      } catch(e){}
    });
  }

  function loadGis(then){
    if(window.google && google.accounts && google.accounts.id) return then();
    var s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true; s.defer = true;
    s.onload = then;
    s.onerror = function(){ /* no Google, no prompt. The page is fine. */ };
    document.head.appendChild(s);
  }

  /* ── start ──────────────────────────────────────────────────── */

  function start(){
    var token = null;
    try { token = localStorage.getItem('lunara_session_token'); } catch(e){}

    if(!token){
      // Signed out. Offer the card, once the page has settled.
      setTimeout(function(){ loadGis(oneTap); }, 1400);
      return;
    }

    /* The badge is drawn from the server's answer, never from what is
       in localStorage. An expired or invented token gets the visitor
       treated as a stranger, which is what they are. */
    post('session', { session_token: token }).then(function(data){
      if(data && data.success){ mount(data); return; }
      try{
        ['lunara_session_token','lunara_id','lunara_name','lunara_tier']
          .forEach(function(k){ localStorage.removeItem(k); });
      } catch(e){}
      setTimeout(function(){ loadGis(oneTap); }, 1400);
    }).catch(function(){ /* offline: show nothing rather than a guess */ });
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', start);
  } else { start(); }
})();
