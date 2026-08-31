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

   3. A way out. The mark opens a small menu carrying the member area
      and Sign out. Before this, the only sign-out on the whole site
      was a button in one sidebar on one page, so a member on any
      other page had no way to leave except clearing their own
      browser storage.

   4. An end. Sessions last twenty-four hours and the page enforces
      that itself rather than waiting for the next request to fail.
      A tab left open overnight ejects on its own, with a warning
      five minutes before, because being dropped mid-sentence is
      worse than being told it is coming.

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
    '@media (prefers-reduced-motion:reduce){.lun-mark{transition:none}.lun-dot{animation:none}}',
    /* the menu */
    '.lun-wrap{position:relative;display:inline-flex}',
    '.lun-mark{cursor:pointer}',
    '.lun-menu{position:absolute;top:calc(100% + 8px);right:0;z-index:2147483000;',
      'min-width:212px;padding:6px;border-radius:12px;border:1px solid rgba(214,222,234,0.14);',
      'background:rgba(10,12,16,0.97);-webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px);',
      'box-shadow:0 18px 44px -12px rgba(0,0,0,0.75);font-family:Inter,system-ui,sans-serif;',
      'opacity:0;transform:translateY(-6px);pointer-events:none;transition:opacity .18s ease,transform .18s ease}',
    '.lun-menu.on{opacity:1;transform:none;pointer-events:auto}',
    '.lun-menu .who{padding:9px 12px 10px;border-bottom:1px solid rgba(214,222,234,0.1);margin-bottom:5px}',
    '.lun-menu .who b{display:block;font-size:13px;font-weight:400;color:#EFEAE0;',
      'white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.lun-menu .who span{display:block;font-size:11px;color:#8D887F;margin-top:3px;',
      'white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.lun-menu a,.lun-menu button{display:block;width:100%;text-align:left;box-sizing:border-box;',
      'padding:9px 12px;border:none;border-radius:8px;background:none;cursor:pointer;',
      'font-family:inherit;font-size:13px;color:#A49E93;text-decoration:none;transition:background .15s ease,color .15s ease}',
    '.lun-menu a:hover,.lun-menu button:hover,.lun-menu a:focus-visible,.lun-menu button:focus-visible{',
      'background:rgba(255,255,255,0.06);color:#EFEAE0}',
    '.lun-menu .out{color:#D89B8C}',
    '.lun-menu .out:hover{background:rgba(216,155,140,0.1);color:#E8B4A6}',
    '.lun-menu .ends{padding:8px 12px 4px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;',
      'font-size:10px;letter-spacing:.05em;color:#6F6A62}',
    /* the warning */
    '.lun-warn{position:fixed;left:50%;bottom:22px;transform:translate(-50%,14px);z-index:2147483000;',
      'display:flex;align-items:center;gap:14px;padding:13px 18px;border-radius:12px;',
      'border:1px solid rgba(196,164,107,0.36);background:rgba(12,14,18,0.97);',
      '-webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px);',
      'box-shadow:0 18px 44px -14px rgba(0,0,0,0.8);font-family:Inter,system-ui,sans-serif;',
      'font-size:13px;color:#EFEAE0;max-width:calc(100vw - 32px);',
      'opacity:0;pointer-events:none;transition:opacity .3s ease,transform .3s ease}',
    '.lun-warn.on{opacity:1;transform:translate(-50%,0);pointer-events:auto}',
    '.lun-warn b{font-weight:400;color:#E2C47A}',
    '.lun-warn button{font-family:inherit;font-size:12.5px;font-weight:500;color:#141210;cursor:pointer;',
      'background:linear-gradient(180deg,#F0E6CE,#CBB07C);border:none;border-radius:100px;padding:8px 16px;flex:none}',
    '@media (max-width:520px){.lun-warn{flex-direction:column;align-items:flex-start;gap:10px}}'
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

  /* ── leaving ──────────────────────────────────────────────────
     One function, because there are now four ways a session ends —
     the menu, the expiry timer, a server 401, and another tab signing
     out — and four half-copies of this is how one of them ends up
     leaving the id behind for the next person at the machine. */
  var KEYS = ['lunara_session_token','lunara_id','lunara_name','lunara_tier',
              'lunara_email','lunara_expires_at'];

  function forget(){
    try { KEYS.forEach(function(k){ localStorage.removeItem(k); }); } catch(e){}
    /* Google remembers it picked an account for this site. Without
       this, One Tap silently signs the same person back in and the
       sign-out looks broken. */
    try {
      if(window.google && google.accounts && google.accounts.id){
        google.accounts.id.disableAutoSelect();
      }
    } catch(e){}
  }

  function signOut(reason){
    forget();
    var here = (location.pathname.split('/').pop() || 'index.html');
    var gated = ['member.html','dashboard.html','kit-access.html','compliance-report-access.html'];
    if (gated.indexOf(here) >= 0) {
      // Leaving a gated page means leaving it, not sitting on a shell
      // of it that still shows the last member's name.
      location.replace('/member.html?signed_out=' + encodeURIComponent(reason || 'you'));
    } else {
      /* Assigning location.href to the URL already showing is a
         same-document navigation in Chromium — nothing reloads and the
         badge stays on screen for a session that has ended. reload()
         is the only one of these that always repaints. */
      location.reload();
    }
  }
  window.lunaraSignOut = signOut;

  /* ── the clock ────────────────────────────────────────────────
     The server says when the session ends and the page holds itself
     to it. Waiting for the next request to fail would leave someone
     typing into a form that has already stopped being able to save. */
  var warnEl = null, timers = [];

  function clearTimers(){ timers.forEach(clearTimeout); timers = []; }

  function warn(minutes){
    if(warnEl) return;
    warnEl = document.createElement('div');
    warnEl.className = 'lun-warn';
    warnEl.setAttribute('role','status');
    warnEl.innerHTML = '<span>Your session ends in about <b></b>. ' +
      'Anything unsaved will be lost.</span><button type="button">Stay signed in</button>';
    warnEl.querySelector('b').textContent = minutes + (minutes === 1 ? ' minute' : ' minutes');
    warnEl.querySelector('button').addEventListener('click', function(){
      /* Renewing is just asking the server again: /session hands back a
         fresh token on every call, so a person who is still here keeps
         working and a laptop nobody is at does not. */
      var t = null; try { t = localStorage.getItem('lunara_session_token'); } catch(e){}
      if(!t) return signOut('expired');
      post('session', { session_token: t }).then(function(d){
        if(d && d.success){ remember(d); dismissWarn(); schedule(d.expires_at); }
        else signOut('expired');
      }).catch(function(){ /* offline: leave the warning up */ });
    });
    document.body.appendChild(warnEl);
    requestAnimationFrame(function(){ warnEl.classList.add('on'); });
  }

  function dismissWarn(){
    if(!warnEl) return;
    var el = warnEl; warnEl = null;
    el.classList.remove('on');
    setTimeout(function(){ if(el.parentNode) el.parentNode.removeChild(el); }, 320);
  }

  function schedule(expiresAt){
    clearTimers();
    if(!expiresAt) return;
    var left = expiresAt - Date.now();
    if(left <= 0) return signOut('expired');
    var WARN_AT = 5 * 60000;
    if(left > WARN_AT){
      timers.push(setTimeout(function(){ warn(5); }, left - WARN_AT));
    } else {
      warn(Math.max(1, Math.round(left / 60000)));
    }
    /* setTimeout does not fire reliably across a sleeping laptop, so
       the deadline is also checked whenever the tab is looked at
       again. Whichever notices first wins. */
    timers.push(setTimeout(function(){ signOut('expired'); }, left));
  }

  function checkDeadline(){
    var exp = 0;
    try { exp = Number(localStorage.getItem('lunara_expires_at') || 0); } catch(e){}
    if(exp && exp <= Date.now()) signOut('expired');
  }
  document.addEventListener('visibilitychange', function(){
    if(!document.hidden) checkDeadline();
  });

  /* Signing out in one tab signs out in all of them. */
  window.addEventListener('storage', function(e){
    if(e.key === 'lunara_session_token' && !e.newValue) location.reload();
  });

  function remember(data){
    try{
      localStorage.setItem('lunara_session_token', data.session_token);
      localStorage.setItem('lunara_id', data.lunara_id);
      localStorage.setItem('lunara_name', data.full_name || '');
      localStorage.setItem('lunara_tier', data.tier || '');
      if(data.expires_at) localStorage.setItem('lunara_expires_at', String(data.expires_at));
      if(data.email) localStorage.setItem('lunara_email', String(data.email).toLowerCase());
    } catch(e){}
  }

  function mount(data){
    var host = document.querySelector('[data-lunara-mark]')
            || document.querySelector('.lxn-end')
            || document.querySelector('#top-nav .nav-cta')
            || document.querySelector('#top-nav');
    if(!host) return;

    /* The shared nav offers "Sign in". Leaving that next to a badge
       showing who is already signed in is the site not knowing its own
       state, which is a poor look on a page about verified identity. */
    var ghost = document.querySelector('.lxn-ghost');
    if(ghost && /sign\s*in/i.test(ghost.textContent)) ghost.remove();

    var wrap = document.createElement('div');
    wrap.className = 'lun-wrap';

    var a = document.createElement('button');
    a.type = 'button';
    a.className = 'lun-mark';
    a.setAttribute('aria-haspopup', 'menu');
    a.setAttribute('aria-expanded', 'false');
    a.title = 'Signed in as ' + (data.email || data.lunara_id);
    a.innerHTML = '<span class="lun-dot"></span><span class="lun-who"></span><span class="lun-id"></span>';
    a.querySelector('.lun-who').textContent =
      data.full_name ? data.full_name.split(' ')[0] : 'Member';

    var menu = document.createElement('div');
    menu.className = 'lun-menu';
    menu.setAttribute('role', 'menu');
    var esc = function(t){ var d = document.createElement('div'); d.textContent = t || ''; return d.innerHTML; };
    menu.innerHTML =
      '<div class="who"><b>' + esc(data.full_name || 'Member') + '</b>' +
        '<span>' + esc(data.email || '') + '</span></div>' +
      '<a role="menuitem" href="/member.html">Member area</a>' +
      '<a role="menuitem" href="/member.html#profile">Edit profile</a>' +
      '<div class="ends"></div>' +
      '<button role="menuitem" type="button" class="out">Sign out</button>';

    // What "24 hours" actually means, in the reader's own clock.
    if(data.expires_at){
      try{
        menu.querySelector('.ends').textContent = 'Session ends ' +
          new Date(data.expires_at).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' });
      } catch(e){ menu.querySelector('.ends').remove(); }
    } else { menu.querySelector('.ends').remove(); }

    menu.querySelector('.out').addEventListener('click', function(){ signOut('you'); });

    function open(on){
      menu.classList.toggle('on', on);
      a.setAttribute('aria-expanded', on ? 'true' : 'false');
    }
    a.addEventListener('click', function(e){
      e.stopPropagation();
      open(!menu.classList.contains('on'));
    });
    document.addEventListener('click', function(e){
      if(!wrap.contains(e.target)) open(false);
    });
    document.addEventListener('keydown', function(e){
      if(e.key === 'Escape') open(false);
    });

    wrap.appendChild(a);
    wrap.appendChild(menu);
    host.insertBefore(wrap, host.firstChild);

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
          remember(data);
          mount(data);
          schedule(data.expires_at);
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

    /* If the stored deadline has already passed there is nothing to
       ask about — clear it here rather than showing a badge for the
       half second it takes the server to say the same thing. */
    var exp = 0;
    try { exp = Number(localStorage.getItem('lunara_expires_at') || 0); } catch(e){}
    if(token && exp && exp <= Date.now()){ forget(); token = null; }

    if(!token){
      // Signed out. Offer the card, once the page has settled.
      setTimeout(function(){ loadGis(oneTap); }, 1400);
      return;
    }

    /* The badge is drawn from the server's answer, never from what is
       in localStorage. An expired or invented token gets the visitor
       treated as a stranger, which is what they are. */
    post('session', { session_token: token }).then(function(data){
      if(data && data.success){
        remember(data);
        mount(data);
        schedule(data.expires_at);
        return;
      }
      /* The server says no. Whatever is in storage is stale or invented,
         and either way this visitor is a stranger. */
      forget();
      setTimeout(function(){ loadGis(oneTap); }, 1400);
    }).catch(function(){ /* offline: show nothing rather than a guess */ });
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', start);
  } else { start(); }
})();
