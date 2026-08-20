/* ═══════════════════════════════════════════════════════════════════
   LUNARA PRICING
   ═══════════════════════════════════════════════════════════════════

   Every price on this site comes from the table below and nowhere
   else, for exactly the reason the dates do.

   Before this file existed, prices were written by hand into whichever
   page happened to sell the thing. The result was measurable: the same
   PayPal button served both the Compliance Kit and Shield Certification,
   so a completed payment could not tell you which product had been
   bought; the whitepaper quoted five different figures; and certify.html
   promised a "permanent registry entry" while the rest of the site sold
   revocability as the whole point of the register.

   A page now declares what it wants and this file answers:

     <span data-lx-price="cir"></span>        390
     <span data-lx-amount="cir"></span>       $390
     <span data-lx-name="cir"></span>         Compliance Intelligence Report
     <span data-lx-terms="cir"></span>        Delivered within 24 hours
     <a data-lx-buy="cir">Buy</a>             href set to the live link

   Change a price here and it changes everywhere at once, including in
   the schema markup search engines read. There is no second place to
   forget.

   ───────────────────────────────────────────────────────────────────
   ON THE PAYMENT LINKS

   These are PayPal payment links, not the old hosted buttons. The old
   buttons required the PayPal SDK on every page that sold anything,
   which meant a third-party script on pages that had no business
   loading one, and they carried no product identity into the
   transaction record. A payment link is an ordinary anchor: no script,
   no SDK, and the product name and SKU travel with the payment.

   They are one-time charges. PayPal payment links do not support
   subscriptions, so anything sold as a twelve month term is charged
   once and renewed by invoice. That is stated in the terms text rather
   than implied, because a customer who thinks they have subscribed and
   has not is a dispute waiting to happen.

   ───────────────────────────────────────────────────────────────────
   ON CHANGING A PRICE

   Change it here, and only here. If a page shows a figure this table
   does not contain, that page is wrong, not the table.
   ═══════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  var LINK = 'https://www.paypal.com/ncp/payment/';

  /* Ordered by price, because that is the order the ladder is meant to
     be read in. tier marks who the product is for, so a page can pull
     just the ones relevant to its reader. */
  var PRODUCTS = [
    {
      id: 'disclose',
      name: 'Article 50 Disclosure Pack',
      price: 75,
      link: 'PLB-3KCGATN8WPZA',
      tier: 'entry',
      lede: 'The obligation that is in force today, solved.',
      terms: 'Delivered within 24 hours',
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
      link: 'PLB-T7PWSDX3THU6',
      tier: 'entry',
      lede: 'Start without an assessment.',
      terms: 'Immediate download',
      points: [
        'Obligation checklist for Article 50 and SB 942',
        'Disclosure and synthetic-marking templates',
        'The evidence log an auditor would ask to see'
      ]
    },
    {
      id: 'shield',
      name: 'Shield Verification',
      price: 120,
      link: 'PLB-QK4AP629MJCQ',
      tier: 'business',
      lede: 'Be checkable by anyone who asks, including a machine.',
      terms: 'Twelve months. Renewed by invoice, not auto-charged.',
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
      link: 'PLB-ZMDTF644SVXM',
      tier: 'entry',
      lede: 'You were probably told the AI Act was postponed.',
      terms: 'Returned within 48 hours',
      points: [
        'Send us the advice you were given',
        'We tell you in writing which parts still hold',
        'Every correction cited to the article that governs it'
      ]
    },
    {
      id: 'cir',
      name: 'Compliance Intelligence Report',
      price: 390,
      link: 'PLB-VZDQXF2JE24S',
      tier: 'org',
      lede: 'What actually binds this system, and what to do about it.',
      terms: 'Delivered within 24 hours',
      points: [
        'Scored against the obligations in force today',
        'Every finding cited to its article',
        'Gap analysis and prioritised remediation',
        'The Digital Omnibus corrections most advisors are still missing'
      ]
    },
    {
      id: 'watch',
      name: 'Regulatory Watch',
      price: 490,
      link: 'PLB-R5U9JRTFTF79',
      tier: 'org',
      lede: 'We tell you when something that binds you changes, and only then.',
      terms: 'Twelve months. Renewed by invoice, not auto-charged.',
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
      link: 'PLB-WSFVDXHTFTVB',
      tier: 'org',
      lede: 'The report, and an hour with the people who wrote it.',
      terms: 'Scheduled within 48 hours',
      points: [
        'Everything in the Compliance Intelligence Report',
        'Sixty minutes on your specific deployment',
        'Who owns each obligation, and what evidence satisfies it'
      ]
    },
    {
      id: 'agent',
      name: 'AI Entity Verification',
      price: 890,
      link: 'PLB-HSBLP4UY9H7K',
      tier: 'vendor',
      lede: 'An identity for your agent that a third party can check.',
      terms: 'Twelve months. Renewed by invoice, not auto-charged.',
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
      link: 'PLB-P3U5CT5N7RYJ',
      tier: 'health',
      lede: 'Four regimes land on the same deployment at once.',
      terms: 'Per deployment. Delivered within five working days.',
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
      link: 'PLB-DC49ALA9VWLF',
      tier: 'vendor',
      lede: 'For companies whose output reaches the European Union.',
      terms: 'Per system. Delivered within five working days.',
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
      link: 'PLB-6UQ48PDCWXEY',
      tier: 'vendor',
      lede: 'Evidence a buyer can verify without taking your word.',
      terms: 'Up to three systems. Twelve months. Renewed by invoice.',
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

    /* Buy controls. The href is set here rather than written into the
       markup so a link can never point at a product whose price the
       page is quoting from somewhere else. */
    var buys = document.querySelectorAll('[data-lx-buy]');
    for (var j = 0; j < buys.length; j++) {
      var prod = byId(buys[j].getAttribute('data-lx-buy'));
      if (!prod) continue;
      buys[j].setAttribute('href', LINK + prod.link);
      buys[j].setAttribute('rel', 'noopener');
      if (!buys[j].hasAttribute('aria-label')) {
        buys[j].setAttribute('aria-label',
          prod.name + ', ' + money(prod.price) + ' — pay with PayPal');
      }
    }
  }

  function boot() {
    try { fill(); } catch (e) { /* never let pricing markup break a page */ }
    window.LunaraPricing = {
      products: PRODUCTS,
      get: byId,
      money: money,
      url: function (id) { var p = byId(id); return p ? LINK + p.link : null; }
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
