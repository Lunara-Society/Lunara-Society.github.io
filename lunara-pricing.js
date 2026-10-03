/* ═══════════════════════════════════════════════════════════════════
   LUNARA PRICING
   ═══════════════════════════════════════════════════════════════════

   Every price on this site comes from the table below and nowhere
   else, for exactly the reason the dates do.

   Before this file existed, prices were written by hand into whichever
   page happened to sell the thing. The result was measurable: the same
   payment button served both the Compliance Kit and Shield Certification,
   so a completed payment could not tell you which product had been
   bought; the whitepaper quoted five different figures; and certify.html
   promised a "permanent registry entry" while the rest of the site sold
   revocability as the whole point of the register.

   A page now declares what it wants and this file answers:

     <span data-lx-price="cir"></span>        390
     <span data-lx-amount="cir"></span>       $390
     <span data-lx-name="cir"></span>         Compliance Intelligence Report
     <span data-lx-terms="cir"></span>        Delivered within 24 hours
     <a data-lx-buy="cir">Buy</a>             opens Stripe Checkout

   Change a price here and it changes everywhere at once, including in
   the schema markup search engines read. There is no second place to
   forget.

   ───────────────────────────────────────────────────────────────────
   ON PAYMENT AND DELIVERY

   Every product is paid through Stripe Checkout (stripe-checkout/):
   card, Apple Pay or Google Pay, from any country. The server charges
   its own copy of this table, generated from it, never an amount from
   the page. Everything is a one-time charge: a term that ends is
   renewed by paying again, never automatically, and the terms text says
   so because a customer who thinks they have subscribed and has not is
   a dispute waiting to happen.

   `delivery` is what the buyer is told they will receive and how. It is
   shown on the confirmation page (paid.html), and the same words go to
   Stripe, so the checkout page and the confirmation can never describe
   two different things. Change what a product delivers here, and only
   here. `access` names the page that delivers it at once, opened with
   the buyer's order reference; `ask` is what checkout collects so the
   work can start without a round of email.

   ───────────────────────────────────────────────────────────────────
   ON TERM LENGTHS

   Verification runs six months rather than twelve, and that is a
   feature rather than a billing trick. A verification nobody has
   rechecked in a year is not much of a verification, and the whole
   claim this institution makes is that its register is current.

   Vendor Certification is the deliberate exception at twelve months.
   It exists to be handed to a procurement panel, and European tender
   evaluations routinely run six months or longer. A certificate that
   expires in the middle of one is worse than useless to the customer
   holding it, so this term is set by the buyer's calendar and not by
   ours.

   ───────────────────────────────────────────────────────────────────
   ON CHANGING A PRICE

   Change it here, and only here. If a page shows a figure this table
   does not contain, that page is wrong, not the table.
   ═══════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  /* The checkout function. It creates the Stripe session for a product
     and answers the confirmation page about an order. */
  var CHECKOUT = 'https://luiqtimzcsoqnizybifs.supabase.co/functions/v1/lunara-checkout';
  var CONTACT = 'lunarasociety@gmail.com';

  /* What the website sells through Stripe Checkout. lunara-checkout
     enforces the same rule: invitational products go only to accepted
     people, and Lens plans are paid inside the app so the credits reach
     the account that paid. */
  function sellable(p) {
    return !p.invitational && p.id.indexOf('lens') !== 0;
  }

  /* Grouped roughly by who the product is for rather than strictly by
     price, since tier is what pages actually filter on. Do not trust
     array order for anything: sort on price at the point of display if
     a page needs a ladder.

     invitational marks a product that must never be given a public
     buy button. It is paid through a Stripe payment link sent only to
     someone who has been accepted; publishing one would destroy the
     only thing that makes it worth having. */
  var PRODUCTS = [
    {
      id: 'disclose',
      name: 'Article 50 Disclosure Pack',
      price: 75,
      tier: 'entry',
      lede: 'The obligation that is in force today, solved.',
      terms: 'Delivered within 24 hours',
      ask: ['website',  'system'],
      delivery: [
        "Within 24 hours we email your Disclosure Pack to the address you paid with.",
        "It holds disclosure wording drafted for your system, the machine-readable marking specification for its output, and a one page record of what you did and when.",
        "Reply to that email if anything about your system has changed."
      ],
      points: [
        'Disclosure wording drafted for your specific system',
        'Machine-readable marking specification for generated output',
        'A one page record of what you did and when'
      ]
    },
    {
      id: 'kit',
      name: 'Compliance Kit',
      price: 95,
      tier: 'entry',
      lede: 'Start without an assessment.',
      terms: 'Immediate download',
      access: 'kit-access.html',
      delivery: [
        "Your kit opens at once: use the button on the confirmation page.",
        "Keep the link to that page. It opens your kit again whenever you need it.",
        "Inside: the Article 50 and SB 942 obligation checklist, disclosure and synthetic-marking templates, and the evidence log an auditor would ask to see."
      ],
      points: [
        'Obligation checklist for Article 50 and SB 942',
        'Disclosure and synthetic-marking templates',
        'The evidence log an auditor would ask to see'
      ]
    },
    {
      id: 'shield',
      name: 'Shield Verification',
      price: 75,
      tier: 'business',
      lede: 'Be checkable by anyone who asks, including a machine.',
      terms: 'Six months. Renewed only when you choose to pay again.',
      ask: ['website',  'legal'],
      delivery: [
        "Within 24 hours we email you your verification reference and a DNS record that proves you control your domain.",
        "A person reviews your business identity and your domain.",
        "When it passes, your entry goes live on the public register and we send your trust badge and machine-readable identity files.",
        "Verification lasts six months. We remind you before it ends; nothing is charged automatically."
      ],
      points: [
        'Identity and domain ownership verified by human review',
        'Public register entry anyone can query without an account',
        'Trust badge and machine-readable identity files',
        'Revocable, and revocations are published'
      ]
    },
    {
      id: 'second',
      name: 'Second Opinion',
      price: 240,
      tier: 'entry',
      lede: 'You were probably told the AI Act was postponed.',
      terms: 'Returned within 48 hours',
      ask: ['website'],
      delivery: [
        "Within 24 hours we email you asking for the advice you were given. Reply with it attached or pasted in.",
        "Our written opinion comes back within 48 hours of receiving it: which parts still hold, every correction cited to the article that governs it."
      ],
      points: [
        'Send us the advice you were given',
        'We tell you in writing which parts still hold',
        'Every correction cited to the article that governs it'
      ]
    },
    {
      id: 'member6',
      name: 'Lunara Society Membership',
      price: 150,
      tier: 'society',
      invitational: true,
      lede: 'Membership of the Society, not a certification of your business.',
      terms: 'Six months, at the equivalent of $25 a month. By invitation.',
      points: [
        'Intelligence briefings with provenance marked on every claim',
        'Competitive sweeps as they are written, not months later',
        'First sight of standards work before it is published'
      ]
    },
    {
      id: 'member12',
      name: 'Lunara Society Membership, twelve months',
      price: 270,
      tier: 'society',
      invitational: true,
      lede: 'Twelve months, which is two months less than paying six at a time.',
      terms: 'Twelve months. By invitation.',
      points: [
        'Everything in the six month term',
        'Two months lighter than renewing twice'
      ]
    },
    {
      id: 'cir',
      name: 'Compliance Intelligence Report',
      price: 390,
      tier: 'org',
      lede: 'What actually binds this system, and what to do about it.',
      terms: 'Delivered within 24 hours',
      access: 'compliance-report-access.html',
      ask: ['website',  'system'],
      delivery: [
        "Start at once: describe your deployment on the report page and get your score straight away.",
        "Your full written report follows by email within 24 hours: every finding cited to its article, with gap analysis and prioritised remediation."
      ],
      points: [
        'Scored against the obligations in force today',
        'Every finding cited to its article',
        'Gap analysis and prioritised remediation',
        'The Digital Omnibus corrections most advisors are still missing'
      ]
    },
    /* Lunara Lens (Rosario). The app is free; AI actions use credits.
       These are bought inside the app (Stripe on the web, Google Play in
       the Android app), so the credits land on the account that paid; a
       buy button here keeps the href its page wrote, which opens the app.
       Prices must match PLANS and PACKS in lens-backend/lens-core.mjs,
       which the server charges. */
    {
      id: 'lens_starter',
      name: 'Rosario Starter, 1 month',
      price: 7.99,
      tier: 'entry',
      lede: '800 credits a month for Rosario’s AI.',
      terms: 'One month per payment on the web. Renewed by you, never auto-charged.',
      points: ['800 credits every month (about 80 AI checks or 400 questions)', 'Every Rosario feature', 'Unused monthly credits do not roll over']
    },
    {
      id: 'lens_pro',
      name: 'Rosario Pro, 1 month',
      price: 19.99,
      tier: 'entry',
      lede: '2,500 credits a month and Rosario’s natural voice.',
      terms: 'One month per payment on the web. Renewed by you, never auto-charged.',
      points: ['2,500 credits every month', 'Rosario’s natural voice (Caty)', 'Every Rosario feature']
    },
    {
      id: 'lens_max',
      name: 'Rosario Luna Max, 1 month',
      price: 49.99,
      tier: 'entry',
      lede: '7,000 credits a month, the deepest AI checks, new features first.',
      terms: 'One month per payment on the web. Renewed by you, never auto-charged.',
      points: ['7,000 credits every month', 'Deepest AI checks', 'Rosario’s natural voice', 'New features first']
    },
    {
      id: 'lens_credits_500',
      name: 'Rosario credits, 500',
      price: 6.99,
      tier: 'entry',
      lede: '500 credits that never expire.',
      terms: 'One payment. Credits never expire.',
      points: ['500 credits', 'Never expire', 'Work with any plan, including Free']
    },
    {
      id: 'lens_credits_1500',
      name: 'Rosario credits, 1,500',
      price: 17.99,
      tier: 'entry',
      lede: '1,500 credits that never expire.',
      terms: 'One payment. Credits never expire.',
      points: ['1,500 credits', 'Never expire', 'Work with any plan, including Free']
    },
    {
      id: 'lens_credits_5000',
      name: 'Rosario credits, 5,000',
      price: 49.99,
      tier: 'entry',
      lede: '5,000 credits that never expire.',
      terms: 'One payment. Credits never expire.',
      points: ['5,000 credits', 'Never expire', 'Work with any plan, including Free']
    },
    {
      id: 'lensapi',
      name: 'Lunara Detection API, 1 month',
      price: 199,
      tier: 'business',
      lede: 'The same evidence-first answers, as JSON.',
      terms: 'One month per payment. Renewed by you, never auto-charged.',
      points: [
        'Image, video-frame and text detection',
        'Keys created in the app, stored only as a fingerprint',
        'Includes Rosario with a monthly AI allowance'
      ]
    },
    {
      id: 'watch',
      name: 'Regulatory Watch',
      price: 290,
      tier: 'org',
      lede: 'We tell you when something that binds you changes, and only then.',
      terms: 'Six months. Renewed only when you choose to pay again.',
      ask: ['website',  'system'],
      delivery: [
        "Within 24 hours we email you to confirm the systems, sectors and jurisdictions we watch for you.",
        "For six months we write to you whenever something that binds you changes, and only then.",
        "We remind you before the six months end; nothing is charged automatically."
      ],
      points: [
        'Monitoring across the EU AI Act, SB 942 and your sector rules',
        'A written note whenever a date moves or an obligation lands',
        'No newsletter, no digest, nothing you did not ask for'
      ]
    },
    {
      id: 'cirplus',
      name: 'Report with Governance Session',
      price: 740,
      tier: 'org',
      lede: 'The report, and an hour with the people who wrote it.',
      terms: 'Scheduled within 48 hours',
      access: 'compliance-report-access.html',
      ask: ['website',  'system'],
      delivery: [
        "Start at once: describe your deployment on the report page and get your score straight away.",
        "Your full written report follows by email within 24 hours.",
        "Within 48 hours we email you to schedule your sixty minute governance session with the people who wrote it."
      ],
      points: [
        'Everything in the Compliance Intelligence Report',
        'Sixty minutes on your specific deployment',
        'Who owns each obligation, and what evidence satisfies it'
      ]
    },
    {
      id: 'agent',
      name: 'AI Entity Verification',
      price: 540,
      tier: 'vendor',
      lede: 'An identity for your agent that a third party can check.',
      terms: 'Six months. Renewed only when you choose to pay again.',
      ask: ['website',  'system'],
      delivery: [
        "Within 24 hours we email you your verification reference and ask who operates the agent and which governance framework it runs under.",
        "A person verifies the agent and its operator.",
        "When it passes, its register entry with AI designation goes live, queryable by any system.",
        "Verification lasts six months. We remind you before it ends; nothing is charged automatically."
      ],
      points: [
        'Agent verified and its operator named',
        'Declared governance framework recorded',
        'Register entry with AI designation, queryable by any system',
        'Revocable, and revocations are published'
      ]
    },
    {
      id: 'clinical',
      name: 'Clinical AI Governance Assessment',
      price: 1950,
      tier: 'health',
      lede: 'Four regimes land on the same deployment at once.',
      terms: 'Per deployment. Delivered within five working days.',
      ask: ['website',  'system'],
      delivery: [
        "Within one working day we email you to collect what we need about the deployment.",
        "Your written assessment, mapping HIPAA, Article 50, SB 942 and Joint Commission together, is delivered within five working days of receiving it."
      ],
      points: [
        'HIPAA, Article 50, SB 942 and Joint Commission, mapped together',
        'The pillar that answers each obligation',
        'Provider versus deployer determination, which decides your duties',
        'Written for an accreditation file, not for a slide'
      ]
    },
    {
      id: 'evidence',
      name: 'Article 50 Evidence Pack',
      price: 2450,
      tier: 'vendor',
      lede: 'For companies whose output reaches the European Union.',
      terms: 'Per system. Delivered within five working days.',
      ask: ['website',  'system'],
      delivery: [
        "Within one working day we email you to collect what we need about the system.",
        "Your Evidence Pack, with the duties assessed, the accountable party named and the articles cited, is delivered within five working days of receiving it."
      ],
      points: [
        'Assessed against disclosure and synthetic-marking duties',
        'The accountable party named, the articles cited',
        'The written record a procurement panel would ask for',
        'Applies whether or not you hold an EU entity'
      ]
    },
    {
      id: 'vendor',
      name: 'Vendor Certification',
      price: 7400,
      tier: 'vendor',
      lede: 'Evidence a buyer can verify without taking your word.',
      terms: 'Up to three systems. Twelve months, so it cannot lapse mid-tender. Renewed only when you choose to pay again.',
      ask: ['website',  'system'],
      delivery: [
        "Within one working day we email you to schedule the assessment of up to three systems.",
        "After review: certification against the seven constitutional pillars, a public register entry and your tender evidence dossier.",
        "Certification lasts twelve months. We remind you before it ends; nothing is charged automatically."
      ],
      points: [
        'Certified against the seven constitutional pillars',
        'Public register entry a procurement panel can query directly',
        'Tender evidence dossier',
        'Re-assessment on material change',
        'Revocable, and revocations are published as openly as certifications'
      ]
    }
  ];

  function byId(id) {
    for (var i = 0; i < PRODUCTS.length; i++) {
      if (PRODUCTS[i].id === id) return PRODUCTS[i];
    }
    return null;
  }

  /* Thousands separated, no trailing zeros: $7,400 rather than
     $7400.00, which reads like a software licence. */
  function money(n) {
    return '$' + String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  /* A buy button asks lunara-checkout for a Stripe session and sends
     the buyer there. Nothing on this page decides the amount. If the
     function cannot be reached, the buyer is told so and given the
     address to write to, rather than being sent anywhere uncertain. */
  function payByCard(ev) {
    var a = ev.currentTarget;
    if (ev.metaKey || ev.ctrlKey || ev.shiftKey) return;
    ev.preventDefault();
    if (a.getAttribute('aria-busy') === 'true') return;
    a.setAttribute('aria-busy', 'true');
    a.style.opacity = '.6';
    var fail = function () {
      a.removeAttribute('aria-busy');
      a.style.opacity = '';
      var note = a.parentNode && a.parentNode.querySelector('.lx-paynote');
      var msg = 'Checkout could not be opened just now. Please try again, or write to ' + CONTACT + '.';
      if (note) { note.textContent = msg; note.setAttribute('role', 'alert'); } else { window.alert(msg); }
    };
    if (typeof window.fetch !== 'function') return fail();
    fetch(CHECKOUT + '/checkout', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ product: a.getAttribute('data-lx-buy'), return_to: window.location.href })
    }).then(function (r) { return r.json(); }).then(function (b) {
      if (b && b.url && b.url.indexOf('https://checkout.stripe.com/') === 0) {
        window.location.href = b.url;
        return;
      }
      fail();
    }).catch(fail);
  }

  function fill() {
    var slots = {
      'data-lx-price': function (p) { return String(p.price); },
      'data-lx-amount': function (p) { return money(p.price); },
      'data-lx-name':  function (p) { return p.name; },
      'data-lx-terms': function (p) { return p.terms; },
      'data-lx-lede':  function (p) { return p.lede; }
    };

    Object.keys(slots).forEach(function (attr) {
      var nodes = document.querySelectorAll('[' + attr + ']');
      for (var i = 0; i < nodes.length; i++) {
        var p = byId(nodes[i].getAttribute(attr));
        if (p) nodes[i].textContent = slots[attr](p);
      }
    });

    /* Buy controls. Clicking one opens Stripe Checkout for that product.
       Lens plans keep the href their page wrote, which opens the app,
       because those are bought inside it. */
    var buys = document.querySelectorAll('[data-lx-buy]');
    for (var j = 0; j < buys.length; j++) {
      var prod = byId(buys[j].getAttribute('data-lx-buy'));
      if (!prod || !sellable(prod)) continue;
      if (!buys[j].hasAttribute('aria-label')) {
        buys[j].setAttribute('aria-label', prod.name + ', ' + money(prod.price) + ', pay securely with Stripe');
      }
      /* Once per control, not once per fill(): refresh() re-runs this
         loop, and a second listener would open two checkouts. */
      if (buys[j].hasAttribute('data-lx-card')) continue;
      buys[j].setAttribute('data-lx-card', '');
      buys[j].addEventListener('click', payByCard);
      if (buys[j].hasAttribute('data-lx-nonote')) continue;

      var note = document.createElement('span');
      note.className = 'lx-paynote';
      note.textContent = 'Card, Apple Pay or Google Pay · secure checkout by Stripe';
      note.style.cssText = 'display:block;margin-top:10px;font-size:12px;line-height:1.5;opacity:.72;';
      buys[j].insertAdjacentElement('afterend', note);
    }
  }

  function boot() {
    try { fill(); } catch (e) { /* never let pricing markup break a page */ }
    window.LunaraPricing = {
      products: PRODUCTS,
      get: byId,
      money: money,
      sellable: function (id) { var p = byId(id); return !!(p && sellable(p)); },
      /* Sends the buyer to Stripe Checkout for a product, for a page that
         places its own control rather than using data-lx-buy. */
      checkout: function (id, el) {
        var a = el || document.createElement('a');
        if (!a.getAttribute('data-lx-buy')) a.setAttribute('data-lx-buy', id);
        payByCard({ currentTarget: a, preventDefault: function () {} });
      },
      /* fill() runs once, at boot. A page that writes price slots into
         the DOM afterwards — the scorer builds its recommendations from
         the result — would otherwise render them empty, which is how a
         page ends up quoting a price of nothing. Call this after any
         innerHTML that contains a data-lx- slot. */
      refresh: function () { try { fill(); } catch (e) {} }
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
