/* The Intelligence workspace (investigate.html). Records come from the
   same sources as the command palette (lunara-os.js); the AI answer comes
   from the registry's public chat route and is kept in its own column. */
(function () {
  'use strict';
  var OS = window.LunaraOS; if (!OS) return;
  var esc = OS.esc, $ = function (id) { return document.getElementById(id); };
  var S = OS.searchSources, keys = Object.keys(S), on = {}, results = [], lastQ = '', convo = null;
  keys.forEach(function (k) { on[k] = true; });

  function hist(add) {
    var h = []; try { h = JSON.parse(OS.store('lx-os-history') || '[]'); } catch (e) {}
    if (add) { h = [add].concat(h.filter(function (x) { return x !== add; })).slice(0, 20); OS.store('lx-os-history', JSON.stringify(h)); }
    return h;
  }
  function paintHist() {
    var saved = []; try { saved = JSON.parse(OS.store('lx-os-saved') || '[]'); } catch (e) {}
    var h = hist();
    $('iv-hist').innerHTML = (saved.length ? '<span class="os-label">Saved in this browser</span>' + saved.map(function (s, i) { return '<button type="button" data-saved="' + i + '">★ ' + esc(s.q) + ' <span class="os-note">(' + s.n + ', ' + esc(OS.day(s.at)) + ')</span></button>'; }).join('') + '<div style="height:10px"></div>' : '') +
      (h.length ? h.map(function (q) { return '<button type="button" data-q="' + esc(q) + '">' + esc(q) + '</button>'; }).join('') : '<p class="os-note">Searches you run are kept here, in this browser only.</p>');
    [].forEach.call($('iv-hist').querySelectorAll('[data-q]'), function (b) { b.addEventListener('click', function () { $('iv-in').value = b.dataset.q; run(); }); });
    [].forEach.call($('iv-hist').querySelectorAll('[data-saved]'), function (b) { b.addEventListener('click', function () { $('iv-in').value = saved[+b.dataset.saved].q; run(); }); });
  }
  function paintSources() {
    $('iv-src').innerHTML = keys.map(function (k) {
      var st = OS.loadSource ? null : null;
      return '<label><input type="checkbox" data-k="' + k + '"' + (on[k] ? ' checked' : '') + '> ' + esc(S[k].label) + '<span class="st" id="st-' + k + '"></span></label>';
    }).join('');
    [].forEach.call($('iv-src').querySelectorAll('[data-k]'), function (c) { c.addEventListener('change', function () { on[c.dataset.k] = c.checked; if (lastQ) run(true); }); });
  }

  var STOP = /^(the|a|an|of|to|in|on|is|are|and|or|for|from|which|what|who|does|do|my|it|its|be|by|with|about|how|when|any|this|that|me|i)$/;
  var MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
  /* Words to match. "December 2026" becomes 2026-12, the form the records'
     dates are written in, so a month finds its dates and not every 2026. */
  function terms(q) {
    q = q.toLowerCase().replace(/\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{4})\b/g, function (m, mo, y) { return y + '-' + ('0' + (MONTHS.indexOf(mo) + 1)).slice(-2); });
    return q.replace(/[^\p{L}\p{N}.\- ]+/gu, ' ').split(/\s+/).filter(function (t) { return t.length > 1 && !STOP.test(t); });
  }
  /* A record must contain most of the words, not just one of them. */
  function score(ts, it) {
    var hay = (it.title + ' ' + it.sub + ' ' + (it.keys || '') + ' ' + (it.text || '') + ' ' + (it.date || '')).toLowerCase(), s = 0, hit = 0;
    ts.forEach(function (t) { var i = hay.indexOf(t); if (i >= 0) { hit++; s += (it.title.toLowerCase().indexOf(t) >= 0 ? 3 : 1); } });
    return hit >= Math.ceil(ts.length * 0.6) ? s * hit / ts.length : 0;
  }

  function run(quiet) {
    var q = $('iv-in').value.trim(); if (!q) { $('iv-in').focus(); return; }
    lastQ = q; if (!quiet) { hist(q); paintHist(); history.replaceState(null, '', '?q=' + encodeURIComponent(q)); }
    var ts = terms(q);
    var chosen = keys.filter(function (k) { return on[k]; });
    $('iv-mode').textContent = chosen.length === keys.length ? 'Global search · ' + ts.length + ' terms' : 'Filtered search · ' + chosen.map(function (k) { return S[k].label; }).join(', ');
    $('iv-res').innerHTML = '<div class="os-plate-b"><div class="os-skel"></div><div class="os-skel"></div></div>';
    OS.track(Promise.all(chosen.map(function (k) { return OS.loadSource(k).then(function (s) { return { k: k, s: s }; }); }))).then(function (all) {
      results = [];
      var groups = all.map(function (g) {
        var el = $('st-' + g.k); if (el) el.textContent = g.s.state === 'ok' ? g.s.items.length + ' read ' + OS.utc(g.s.at).replace(' UTC', '') : 'unavailable';
        if (g.s.state !== 'ok') return { k: g.k, failed: true, hits: [] };
        var hits = g.s.items.map(function (it) { return { it: it, s: ts.length ? score(ts, it) : 0 }; }).filter(function (x) { return x.s > 0; })
          .filter(function (x) { return (!$('iv-verified').checked || x.it.mark === 'verified') && (!$('iv-dated').checked || x.it.date); })
          .sort(function (a, b) { return b.s - a.s; }).slice(0, 12);
        hits.forEach(function (h) { results.push({ source: S[g.k].label, route: S[g.k].route, read_at: g.s.at, title: h.it.title, detail: h.it.sub, date: h.it.date || null, mark: h.it.mark, href: location.origin + h.it.href, official_source: h.it.source || null }); });
        return { k: g.k, hits: hits, at: g.s.at, best: hits[0] ? hits[0].s : 0 };
      }).sort(function (a, b) { return b.best - a.best; });
      var html = groups.map(function (g) {
        if (g.failed) return '<div class="iv-hit"><span class="os-label">' + esc(S[g.k].label) + '</span> ' + OS.stateTag('unavailable', 'Source did not answer') + '</div>';
        if (!g.hits.length) return '';
        return '<div class="os-plate-h" style="background:rgba(8,9,12,.35)"><span class="os-eyebrow">' + esc(S[g.k].label) + '</span><span class="r os-src">' + esc(S[g.k].route) + ' · read ' + esc(OS.utc(g.at)) + '</span></div>' +
          g.hits.map(function (h) {
            var it = h.it;
            return '<div class="iv-hit"><a class="t" href="' + esc(it.href) + '">' + esc(it.title) + '</a><div class="os-note">' + esc(it.sub) + '</div>' + (it.text && it.text !== it.sub ? '<p style="margin:6px 0 0;font-size:12.5px;color:var(--os-muted-2)">' + esc(it.text.slice(0, 220)) + (it.text.length > 220 ? '…' : '') + '</p>' : '') +
              '<div class="m">' + OS.trust(it.mark || 'unverified', it.mark || 'unmarked', it.markWhy || '') + (it.date ? '<span class="os-src">dated ' + esc(String(it.date).slice(0, 10)) + '</span>' : '') + (it.checked ? '<span class="os-src">checked ' + esc(it.checked) + '</span>' : '') + (it.source ? '<a class="os-src" href="' + esc(it.source) + '" target="_blank" rel="noopener">official source</a>' : '') + '</div></div>';
          }).join('');
      }).join('');
      $('iv-res').innerHTML = html && results.length ? html : '<div class="os-empty"><strong>No record matches</strong><p>None of the selected sources contains those words. Nothing is invented to fill this space. Try fewer words, or ask the AI on the right, whose answer is marked as generated.</p></div>';
      $('iv-save').disabled = $('iv-export').disabled = !results.length;
    });
  }

  function ask() {
    var q = $('iv-in').value.trim(); if (!q) { $('iv-in').focus(); return; }
    var box = $('iv-ai-b');
    box.innerHTML = '<p class="os-note">Asking… (' + esc(OS.utc(new Date())) + ')</p><p style="margin-top:8px">' + esc(q) + '</p>';
    var btn = $('iv-ask'); btn.disabled = true;
    OS.track(OS.reg('rosarioWebChat', { message: q, conversation_id: convo || undefined })).then(function (r) {
      btn.disabled = false;
      if (r.ok && r.json && r.json.reply) {
        convo = r.json.conversation_id || convo;
        box.innerHTML = '<div class="os-callout warn" style="margin-bottom:12px">Generated by a language model at ' + esc(OS.utc(r.at)) + '. It is not a sourced record, it can be wrong, and it is not legal advice.</div><div class="ans">' + esc(r.json.reply) + '</div>';
      } else {
        // The question is kept in the box; nothing is lost and nothing is faked.
        box.innerHTML = '<div class="os-callout bad">The AI service did not answer (' + esc(r.status === 429 || (r.json && /too many/i.test(r.json.error || '')) ? 'rate limited' : r.status || r.error || 'no connection') + '). Your question is still in the search box, and the records on the left are unaffected.</div>';
      }
    });
  }

  $('iv-form').addEventListener('submit', function (e) { e.preventDefault(); run(); });
  $('iv-ask').addEventListener('click', function () { if ($('iv-in').value.trim() !== lastQ) run(); ask(); });
  $('iv-verified').addEventListener('change', function () { if (lastQ) run(true); });
  $('iv-dated').addEventListener('change', function () { if (lastQ) run(true); });
  $('iv-clear').addEventListener('click', function () { OS.store('lx-os-history', null); paintHist(); });
  $('iv-save').addEventListener('click', function () {
    var saved = []; try { saved = JSON.parse(OS.store('lx-os-saved') || '[]'); } catch (e) {}
    saved = [{ q: lastQ, n: results.length, at: new Date().toISOString() }].concat(saved.filter(function (s) { return s.q !== lastQ; })).slice(0, 12);
    OS.store('lx-os-saved', JSON.stringify(saved)); paintHist(); OS.toast('Saved in this browser. Accounts do not store investigations yet.', 'ok');
  });
  $('iv-export').addEventListener('click', function () {
    var blob = new Blob([JSON.stringify({ query: lastQ, exported_at: new Date().toISOString(), note: 'Records only. Any AI answer is excluded because it is not a sourced record.', results: results }, null, 2)], { type: 'application/json' });
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'lunara-investigation.json'; a.click();
  });
  OS.on('ready', function () {
    paintSources(); paintHist();
    var p = new URLSearchParams(location.search);
    if (p.get('q')) { $('iv-in').value = p.get('q'); run(true); }
    else if (p.get('ask')) { $('iv-in').value = p.get('ask'); run(true); ask(); }
  });
})();
