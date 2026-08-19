/* ═══════════════════════════════════════════════════════════════════
   LUNARA REGULATORY CLOCK
   ═══════════════════════════════════════════════════════════════════

   Every date on this site comes from the table below and nowhere else.

   The reason is not tidiness. Before this file existed the homepage
   carried a countdown to 2 August 2026 and, four blocks further down,
   a hardcoded sentence promising the window would close "in 4 days."
   Seventeen days after enforcement began, both were still on screen:
   one reading zero, the other still counting. A visitor whose job is
   compliance would have drawn the only available conclusion.

   An institution that sells the interpretation of deadlines cannot be
   wrong about a deadline on its own front page. So no page is allowed
   to state a date, a day count, or a tense again. Pages declare what
   they want and this file works out what is true at the moment of
   reading:

     <span data-lx-days="eu-art50"></span>     days since / until
     <span data-lx-phrase="eu-art50"></span>   "in force since 2 August 2026"
     <span data-lx-verb="eu-art50"></span>     "has applied" / "applies"
     <div  data-lx-clock></div>                the full instrument

   Add an obligation to OBLIGATIONS and it appears everywhere at once,
   correctly tensed, and it stays correct without anyone remembering to
   come back. That is the entire design.

   ───────────────────────────────────────────────────────────────────
   ON ADDING ENTRIES

   This table is a compliance claim. Treat it like one. Every entry
   carries the instrument that creates the obligation and the article
   that sets the date, so any reader can check it against primary law
   rather than trusting us. If you cannot cite the article, the entry
   does not go in. A short table that is right beats a long one that
   is mostly right.

   And check for amendments, not just for the founding text. This table
   shipped with Annex III high-risk shown as in force from 2 August
   2026, which is what Regulation (EU) 2024/1689 said when it was
   written. It was wrong by the time it went live: the Digital Omnibus
   on AI, Regulation (EU) 2026/1744, entered into force on 27 July 2026
   and deferred Annex III to 2 December 2027 and the Annex I products to
   2 August 2028, while deliberately leaving Article 50 exactly where it
   was. Reading the original regulation was not enough, and being right
   about four dates does not survive being wrong about the fifth.
   Overstating what is in force is the worst direction to be wrong in:
   it is the error a knowledgeable prospect catches first, and it
   discredits every accurate row beside it.
   ═══════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  /* Dates are the legal application dates, UTC midnight. The EU AI Act
     entries are all fixed by Article 113 of Regulation (EU) 2024/1689,
     which is why they cluster on 2 August. */
  var OBLIGATIONS = [
    {
      id: 'eu-prohibitions',
      date: '2025-02-02',
      jurisdiction: 'European Union',
      name: 'Prohibited AI practices and AI literacy',
      instrument: 'EU AI Act, Regulation (EU) 2024/1689',
      article: 'Art. 113(a) — Chapters I and II',
      summary: 'Unacceptable-risk systems banned outright. Staff operating AI must be demonstrably competent to do so.',
      weight: 2
    },
    {
      id: 'eu-gpai',
      date: '2025-08-02',
      jurisdiction: 'European Union',
      name: 'General-purpose AI obligations and penalties',
      instrument: 'EU AI Act, Regulation (EU) 2024/1689',
      article: 'Art. 113(b) — Chapters V, VII, XII',
      summary: 'Model documentation, training-data summaries and copyright policy. The penalty regime becomes enforceable.',
      weight: 2
    },
    {
      id: 'eu-art50',
      date: '2026-08-02',
      jurisdiction: 'European Union',
      name: 'Article 50 transparency obligations',
      instrument: 'EU AI Act, Regulation (EU) 2024/1689',
      article: 'Art. 113 — general application',
      summary: 'AI systems must disclose that they are AI. Synthetic content must be marked machine-readable.',
      penalty: 'Up to EUR 15,000,000 or 3% of worldwide annual turnover',
      weight: 3,
      primary: true
    },
    {
      id: 'eu-annex3',
      /* Was 2 August 2026 under the original Act. The Digital Omnibus on
         AI deferred it by sixteen months, five days before it would have
         bitten. Article 50 was deliberately left where it was, so the
         two must never be quoted as one date again. */
      date: '2027-12-02',
      jurisdiction: 'European Union',
      name: 'High-risk obligations, Annex III',
      instrument: 'EU AI Act 2024/1689, as amended by the Digital Omnibus on AI, Regulation (EU) 2026/1744',
      article: 'Art. 113, as amended — deferred from 2 August 2026',
      summary: 'Risk management, data governance, logging, human oversight and conformity assessment for listed high-risk uses. Deferred, not cancelled.',
      weight: 3
    },
    {
      id: 'ca-sb942',
      date: '2026-08-02',
      jurisdiction: 'California',
      name: 'AI Transparency Act',
      instrument: 'California SB 942, as amended by AB 853',
      article: 'Bus. & Prof. Code § 22757',
      summary: 'Covered providers must offer free AI-detection tooling and embed latent disclosure in generated content.',
      weight: 2
    },
    {
      id: 'eu-art50-legacy',
      date: '2027-02-02',
      jurisdiction: 'European Union',
      name: 'Article 50(2) for systems already on the market',
      instrument: 'EU AI Act 2024/1689, as amended by the Digital Omnibus on AI, Regulation (EU) 2026/1744',
      article: 'Art. 50(2), transitional',
      summary: 'Generative systems placed on the market before 2 August 2026 lose their transitional relief and must mark synthetic output machine-readably.',
      weight: 3
    },
    {
      id: 'eu-annex1',
      /* Deferred from 2 August 2027 by the same instrument. */
      date: '2028-08-02',
      jurisdiction: 'European Union',
      name: 'High-risk obligations, Annex I products',
      instrument: 'EU AI Act 2024/1689, as amended by the Digital Omnibus on AI, Regulation (EU) 2026/1744',
      article: 'Art. 6(1), as amended — deferred from 2 August 2027',
      summary: 'AI acting as a safety component of a regulated product falls under the full high-risk regime.',
      weight: 3
    },
    {
      id: 'eu-legacy-gpai',
      date: '2027-08-02',
      jurisdiction: 'European Union',
      name: 'Legacy general-purpose models',
      instrument: 'EU AI Act, Regulation (EU) 2024/1689',
      article: 'Art. 111(3)',
      summary: 'Models already on the market before August 2025 lose their grace period and must comply in full.',
      weight: 2
    }
  ];

  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
                'July', 'August', 'September', 'October', 'November', 'December'];

  var DAY = 86400000;

  /* Parsing as UTC and comparing against a UTC-floored "today" keeps the
     day count from drifting by one for readers west of Greenwich. A clock
     that says 16 days in California and 17 in Berlin is not a clock. */
  function parse(iso) {
    var p = iso.split('-');
    return Date.UTC(+p[0], +p[1] - 1, +p[2]);
  }

  function todayUTC() {
    var n = new Date();
    return Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate());
  }

  function longDate(iso) {
    var p = iso.split('-');
    return (+p[2]) + ' ' + MONTHS[+p[1] - 1] + ' ' + p[0];
  }

  function plural(n, word) {
    return n + ' ' + word + (n === 1 ? '' : 's');
  }

  /* Decorate each obligation with everything the page might ask of it,
     computed once per load. */
  function resolve() {
    var now = todayUTC();
    return OBLIGATIONS.map(function (o) {
      var t = parse(o.date);
      var days = Math.round((t - now) / DAY);
      var active = days <= 0;
      return {
        ref: o,
        days: Math.abs(days),
        active: active,
        longDate: longDate(o.date),
        /* Tense is derived, never written down. This is the whole point. */
        verb: active ? 'has applied' : 'applies',
        phrase: active
          ? 'in force since ' + longDate(o.date)
          : 'applies from ' + longDate(o.date),
        counter: active
          ? plural(Math.abs(days), 'day') + ' in force'
          : plural(Math.abs(days), 'day') + ' remaining'
      };
    });
  }

  function byId(list, id) {
    for (var i = 0; i < list.length; i++) {
      if (list[i].ref.id === id) return list[i];
    }
    return null;
  }

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /* ── inline slots ───────────────────────────────────────────────── */

  function fillSlots(list) {
    var map = {
      'data-lx-days':   function (r) { return String(r.days); },
      'data-lx-phrase': function (r) { return r.phrase; },
      'data-lx-verb':   function (r) { return r.verb; },
      'data-lx-date':   function (r) { return r.longDate; },
      'data-lx-counter':function (r) { return r.counter; }
    };
    Object.keys(map).forEach(function (attr) {
      var nodes = document.querySelectorAll('[' + attr + ']');
      for (var i = 0; i < nodes.length; i++) {
        var r = byId(list, nodes[i].getAttribute(attr));
        if (r) nodes[i].textContent = map[attr](r);
      }
    });
  }

  /* ── the instrument ─────────────────────────────────────────────── */

  function row(r) {
    var o = r.ref;
    return '<div class="lxc-row' + (r.active ? ' lxc-live' : '') + '">' +
             '<div class="lxc-mark">' +
               '<span class="lxc-dot"></span>' +
               '<span class="lxc-count">' + r.days + '</span>' +
               '<span class="lxc-unit">' + (r.active ? 'days in force' : 'days out') + '</span>' +
             '</div>' +
             '<div class="lxc-body">' +
               '<div class="lxc-jur">' + esc(o.jurisdiction) + '</div>' +
               '<h4 class="lxc-name">' + esc(o.name) + '</h4>' +
               '<p class="lxc-sum">' + esc(o.summary) + '</p>' +
               '<div class="lxc-cite">' + esc(o.instrument) + ' &middot; ' + esc(o.article) + '</div>' +
             '</div>' +
             '<div class="lxc-when">' +
               '<span class="lxc-state">' + (r.active ? 'In force' : 'Pending') + '</span>' +
               '<span class="lxc-date">' + r.longDate + '</span>' +
             '</div>' +
           '</div>';
  }

  function render(host, list) {
    var active = list.filter(function (r) { return r.active; })
                     .sort(function (a, b) { return a.days - b.days; });
    var pending = list.filter(function (r) { return !r.active; })
                      .sort(function (a, b) { return a.days - b.days; });

    var next = pending[0];
    var head = active.length +
      (active.length === 1 ? ' obligation is' : ' obligations are') + ' enforceable today';

    var lead = '<div class="lxc-head">' +
        '<div class="lxc-eyebrow">Regulatory Clock &middot; live</div>' +
        '<h3 class="lxc-title">' + head + '.</h3>' +
        (next
          ? '<p class="lxc-lede">The next lands in ' + plural(next.days, 'day') +
            ', on ' + next.longDate + '.</p>'
          : '') +
      '</div>';

    var body = '<div class="lxc-group"><div class="lxc-glabel">In force</div>' +
               active.map(row).join('') + '</div>';

    if (pending.length) {
      body += '<div class="lxc-group"><div class="lxc-glabel">Approaching</div>' +
              pending.map(row).join('') + '</div>';
    }

    var foot = '<div class="lxc-foot">Counts are computed at page load from the ' +
               'application dates set by each instrument. Nothing here is typed by hand.</div>';

    host.innerHTML = lead + body + foot;
    host.setAttribute('data-lx-clock-ready', '1');
  }

  function boot() {
    var list;
    try {
      list = resolve();
    } catch (e) {
      return; /* never let a date bug take the page down with it */
    }

    fillSlots(list);

    var hosts = document.querySelectorAll('[data-lx-clock]');
    for (var i = 0; i < hosts.length; i++) {
      try { render(hosts[i], list); } catch (e) {}
    }

    /* Expose for pages that want to reason about obligations themselves
       (the scorer, for one, should never carry its own copy of a date). */
    window.LunaraClock = {
      obligations: list,
      get: function (id) { return byId(list, id); }
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
