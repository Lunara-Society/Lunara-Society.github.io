// LUNARA VISITOR SIGNAL — v1.0
// Fires once per session. Notifies lunarasociety@gmail.com on every unique visit.
// Raven — 2026-06-26

(function LunaraVisitorSignal() {
  try {
    // Throttle: only fire once per session
    if (sessionStorage.getItem('lunara_signal_sent')) return;
    sessionStorage.setItem('lunara_signal_sent', '1');

    // Small delay so page loads first
    setTimeout(function() {
      var data = {
        page: window.location.pathname || '/',
        referrer: document.referrer || 'direct',
        agent: navigator.userAgent || 'unknown',
        time: new Date().toISOString(),
        title: document.title || 'Lunara Society',
        width: window.innerWidth,
        // Detect if likely an AI crawler
        is_bot: /bot|crawl|spider|GPTBot|ClaudeBot|Perplexity|Google|Bing|anthropic/i.test(navigator.userAgent)
      };

      // Use formspree endpoint — free tier, 50 submissions/month
      fetch('https://formspree.io/f/xrbzqwkj', {
        method: 'POST',
        headers: {'Content-Type': 'application/json', 'Accept': 'application/json'},
        body: JSON.stringify({
          _subject: '👁 Lunara Visitor: ' + (data.is_bot ? '[BOT] ' : '') + data.page,
          page: data.page,
          referrer: data.referrer,
          user_agent: data.agent,
          time_utc: data.time,
          viewport: data.width + 'px',
          likely_bot: data.is_bot ? 'YES' : 'no'
        })
      }).catch(function(){});
    }, 1500);
  } catch(e) {}
})();
