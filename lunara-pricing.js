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

  var LINK = 'https://www.paypal.com/ncp/payment/';

  /* Where a buyer the payment link cannot serve goes instead.

     PayPal's no-code payment links collect a shipping address for
     products that do not ship, and the country list on that step is
     the merchant's, not the buyer's. A customer outside it reaches
     the card form and finds the country fixed and unchangeable, which
     is indistinguishable from the card being declined. There is no
     API setting that turns this off; collect_shipping_address is
     accepted and then ignored.

     An invoice has no shipping step and asks for a billing country
     the payer chooses, so it is the route for anyone the link blocks.
     It cannot replace the link, because an invoice is a document with
     a balance and is payable exactly once — thirteen invoice URLs on
     thirteen buy buttons would sell each product once and show the
     next customer somebody else's receipt. So the link stays, and
     this sits underneath it for the people it fails.

     The invoice is raised by Stripe, not by hand: the form below asks
     lunara-invoice (stripe-invoicing/) for one, and the buyer is sent
     to Stripe's hosted invoice page, which takes cards and wallets with
     the payer's own country. Each request makes a fresh invoice for that
     buyer, so the objection above does not apply to it. If the function
     cannot be reached, the prefilled email below is still offered. */
  var INVOICE_TO = 'lunarasociety@gmail.com';
  var INVOICE_API = 'https://luiqtimzcsoqnizybifs.supabase.co/functions/v1/lunara-invoice/request';

  /* Grouped roughly by who the product is for rather than strictly by
     price, since tier is what pages actually filter on. Do not trust
     array order for anything: sort on price at the point of display if
     a page needs a ladder.

     invitational marks a product that must never be given a public
     buy button. Its link exists so it can be sent to someone who has
     been accepted, and publishing it would destroy the only thing
     that makes it worth having. */
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
      price: 75,
      link: 'PLB-2JHHAZAFM8MB',
      tier: 'business',
      lede: 'Be checkable by anyone who asks, including a machine.',
      terms: 'Six months. Renewed by invoice, never auto-charged.',
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
      id: 'member6',
      name: 'Lunara Society Membership',
      price: 150,
      link: 'PLB-PWN3EKP7WB75',
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
      link: 'PLB-R859WBPH6XBA',
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
    /* Lunara Lens (Rosario). The app is free; AI actions use credits.
       On the web a plan is one month per payment (PayPal links cannot
       subscribe); in the Google Play app the same plans renew monthly
       through Google Play. Links are empty until each PayPal payment
       link exists; until then a buy button keeps the href its page
       wrote, never a broken PayPal URL. Prices must match TIERS and
       PACKS in lens-backend/lens-core.mjs, which the server checks
       payments against. */
    {
      id: 'lens_starter',
      name: 'Rosario Starter, 1 month',
      price: 7.99,
      link: '',
      tier: 'entry',
      lede: '800 credits a month for Rosario’s AI.',
      terms: 'One month per payment on the web. Renewed by you, never auto-charged.',
      points: ['800 credits every month (about 80 AI checks or 400 questions)', 'Every Rosario feature', 'Unused monthly credits do not roll over']
    },
    {
      id: 'lens_pro',
      name: 'Rosario Pro, 1 month',
      price: 19.99,
      link: '',
      tier: 'entry',
      lede: '2,500 credits a month and Rosario’s natural voice.',
      terms: 'One month per payment on the web. Renewed by you, never auto-charged.',
      points: ['2,500 credits every month', 'Rosario’s natural voice (Caty)', 'Every Rosario feature']
    },
    {
      id: 'lens_max',
      name: 'Rosario Luna Max, 1 month',
      price: 49.99,
      link: '',
      tier: 'entry',
      lede: '7,000 credits a month, the deepest AI checks, new features first.',
      terms: 'One month per payment on the web. Renewed by you, never auto-charged.',
      points: ['7,000 credits every month', 'Deepest AI checks', 'Rosario’s natural voice', 'New features first']
    },
    {
      id: 'lens_credits_500',
      name: 'Rosario credits, 500',
      price: 6.99,
      link: '',
      tier: 'entry',
      lede: '500 credits that never expire.',
      terms: 'One payment. Credits never expire.',
      points: ['500 credits', 'Never expire', 'Work with any plan, including Free']
    },
    {
      id: 'lens_credits_1500',
      name: 'Rosario credits, 1,500',
      price: 17.99,
      link: '',
      tier: 'entry',
      lede: '1,500 credits that never expire.',
      terms: 'One payment. Credits never expire.',
      points: ['1,500 credits', 'Never expire', 'Work with any plan, including Free']
    },
    {
      id: 'lens_credits_5000',
      name: 'Rosario credits, 5,000',
      price: 49.99,
      link: '',
      tier: 'entry',
      lede: '5,000 credits that never expire.',
      terms: 'One payment. Credits never expire.',
      points: ['5,000 credits', 'Never expire', 'Work with any plan, including Free']
    },
    {
      id: 'lensapi',
      name: 'Lunara Detection API, 1 month',
      price: 199,
      link: '',
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
      link: 'PLB-496LK32RZPMW',
      tier: 'org',
      lede: 'We tell you when something that binds you changes, and only then.',
      terms: 'Six months. Renewed by invoice, never auto-charged.',
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
      price: 540,
      link: 'PLB-HUGJW52C2Q4Q',
      tier: 'vendor',
      lede: 'An identity for your agent that a third party can check.',
      terms: 'Six months. Renewed by invoice, never auto-charged.',
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
      terms: 'Up to three systems. Twelve months, so it cannot lapse mid-tender. Renewed by invoice.',
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

  /* A prefilled request rather than a bare address: the reply has to
     say which product, at which price, or the invoice gets raised for
     the wrong thing. Country is asked for because it is the field
     that caused this. */
  function invoiceHref(p) {
    var subject = 'Invoice request — ' + p.name + ' (' + money(p.price) + ')';
    var body = [
      'Please send a PayPal invoice for:',
      '',
      'Product:   ' + p.name,
      'Reference: ' + p.id,
      'Amount:    ' + money(p.price) + ' USD',
      '',
      'Business name:',
      'Country:',
      'Company or VAT number (if any):',
      '',
      'I am requesting an invoice because the card checkout would not',
      'let me select my country.'
    ].join('\n');
    return 'mailto:' + INVOICE_TO +
      '?subject=' + encodeURIComponent(subject) +
      '&body=' + encodeURIComponent(body);
  }

  /* Products the website may invoice. lunara-invoice enforces the same
     rule from Stripe's product metadata; this only decides which form
     to offer. Invitational products are sent to accepted people, and
     Lens plans are paid in the app so the credits reach the account. */
  function invoiceable(p) {
    return !p.invitational && p.id.indexOf('lens') !== 0;
  }

  var dialog = null;

  function countryOptions() {
    var names = null;
    try { names = new Intl.DisplayNames(['en'], { type: 'region' }); } catch (e) {}
    var A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', list = [];
    for (var i = 0; i < 26; i++) for (var j = 0; j < 26; j++) {
      var code = A[i] + A[j], name = names ? names.of(code) : code;
      if (names && (!name || name === code || /unknown/i.test(name))) continue;
      list.push([code, name]);
    }
    list.sort(function (a, b) { return a[1].localeCompare(b[1]); });
    return '<option value="">Choose…</option>' + list.map(function (c) {
      return '<option value="' + c[0] + '">' + c[1].replace(/&/g, '&amp;').replace(/</g, '&lt;') + '</option>';
    }).join('');
  }

  function openInvoiceForm(p) {
    if (!dialog) {
      dialog = document.createElement('dialog');
      dialog.className = 'lx-invoice-dialog';
      dialog.setAttribute('aria-labelledby', 'lx-inv-title');
      dialog.style.cssText =
        'max-width:440px;width:calc(100% - 32px);padding:28px;border:1px solid rgba(201,168,76,.35);' +
        'border-radius:12px;background:#0d0d14;color:#ece8de;font-family:inherit;font-size:15px;line-height:1.5;';
      var field = 'display:block;width:100%;box-sizing:border-box;margin:4px 0 14px;padding:10px 12px;' +
        'border:1px solid rgba(236,232,222,.25);border-radius:8px;background:#15151f;color:inherit;font:inherit;';
      dialog.innerHTML =
        '<form method="dialog" novalidate>' +
        '<h2 id="lx-inv-title" style="margin:0 0 4px;font-size:20px;font-weight:400"></h2>' +
        '<p class="lx-inv-amount" style="margin:0 0 18px;opacity:.75"></p>' +
        '<label>Email<input name="email" type="email" autocomplete="email" required style="' + field + '"></label>' +
        '<label>Name or business on the invoice<input name="name" autocomplete="organization" required style="' + field + '"></label>' +
        '<label>Billing country<select name="country" required style="' + field + '">' + countryOptions() + '</select></label>' +
        '<label>VAT or company number <span style="opacity:.6">(optional)</span><input name="tax_id" style="' + field + '"></label>' +
        '<input name="website" tabindex="-1" autocomplete="off" aria-hidden="true" style="position:absolute;left:-9999px">' +
        '<p class="lx-inv-error" role="alert" style="color:#f0a3a3;min-height:1.5em;margin:0 0 10px"></p>' +
        '<div style="display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap">' +
        '<button type="button" value="cancel" class="lx-inv-cancel" style="padding:10px 16px;border-radius:8px;border:1px solid rgba(236,232,222,.3);background:none;color:inherit;font:inherit;cursor:pointer">Cancel</button>' +
        '<button type="submit" class="lx-inv-go" style="padding:10px 18px;border-radius:8px;border:0;background:#c9a84c;color:#0d0d14;font:inherit;cursor:pointer">Continue to invoice</button>' +
        '</div>' +
        '<p style="margin:16px 0 0;font-size:12px;opacity:.6">Payment is taken by Stripe on its hosted invoice page. ' +
        'Card or wallet, from any country. <a class="lx-inv-mail" style="color:inherit">Prefer email?</a></p>' +
        '</form>';
      document.body.appendChild(dialog);
      dialog.querySelector('.lx-inv-cancel').addEventListener('click', function () { dialog.close(); });
      dialog.querySelector('form').addEventListener('submit', function (ev) {
        ev.preventDefault();
        submitInvoice(dialog._product);
      });
    }
    dialog._product = p;
    dialog.querySelector('#lx-inv-title').textContent = p.name;
    dialog.querySelector('.lx-inv-amount').textContent = money(p.price) + ' USD · ' + p.terms;
    dialog.querySelector('.lx-inv-error').textContent = '';
    dialog.querySelector('.lx-inv-mail').setAttribute('href', invoiceHref(p));
    var go = dialog.querySelector('.lx-inv-go');
    go.disabled = false; go.textContent = 'Continue to invoice';
    if (dialog.showModal) dialog.showModal(); else dialog.setAttribute('open', '');
    dialog.querySelector('input[name=email]').focus();
  }

  function submitInvoice(p) {
    var f = dialog.querySelector('form');
    var err = dialog.querySelector('.lx-inv-error');
    var go = dialog.querySelector('.lx-inv-go');
    var data = {
      product: p.id,
      email: f.email.value.trim(),
      name: f.name.value.trim(),
      country: f.country.value,
      tax_id: f.tax_id.value.trim(),
      website: f.website.value
    };
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) { err.textContent = 'Enter a valid email address.'; return; }
    if (data.name.length < 2) { err.textContent = 'Enter the name to put on the invoice.'; return; }
    if (!data.country) { err.textContent = 'Choose a country.'; return; }
    err.textContent = '';
    go.disabled = true; go.textContent = 'Preparing invoice…';
    fetch(INVOICE_API, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(data)
    }).then(function (r) {
      return r.json().then(function (body) { return { ok: r.ok, body: body }; });
    }).then(function (res) {
      if (res.ok && res.body.url && res.body.url.indexOf('https://invoice.stripe.com/') === 0) {
        go.textContent = 'Opening invoice…';
        window.location.href = res.body.url;
        return;
      }
      throw new Error(res.body && res.body.error);
    }).catch(function (e) {
      go.disabled = false; go.textContent = 'Continue to invoice';
      err.textContent = e && e.message && e.message !== 'Failed to fetch' ? e.message
        : 'The invoice could not be prepared. You can also request one by email.';
    });
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
      if (prod.link) buys[j].setAttribute('href', LINK + prod.link);
      buys[j].setAttribute('rel', 'noopener');
      if (!buys[j].hasAttribute('aria-label')) {
        buys[j].setAttribute('aria-label',
          prod.name + ', ' + money(prod.price) + ' — pay with PayPal');
      }

      /* Once per control, not once per fill(): refresh() re-runs this
         whole loop and a page that calls it twice would otherwise
         stack duplicate links under every button. A page that has
         placed its own can opt out with data-lx-noinvoice. */
      if (buys[j].hasAttribute('data-lx-invoiced') ||
          buys[j].hasAttribute('data-lx-noinvoice')) continue;
      buys[j].setAttribute('data-lx-invoiced', '');

      var alt = document.createElement('a');
      alt.className = 'lx-invoice';
      alt.setAttribute('href', invoiceHref(prod));
      alt.textContent = 'Card declined your country? Request an invoice →';
      if (invoiceable(prod)) {
        alt.textContent = 'Pay by invoice instead (any country) →';
        alt.addEventListener('click', (function (p) {
          return function (ev) {
            if (typeof window.fetch !== 'function') return; // the email still works
            ev.preventDefault();
            openInvoiceForm(p);
          };
        })(prod));
      }
      alt.style.cssText =
        'display:block;margin-top:10px;font-size:12px;line-height:1.5;' +
        'opacity:.72;text-decoration:underline;text-underline-offset:2px;';
      buys[j].insertAdjacentElement('afterend', alt);
    }
  }

  function boot() {
    try { fill(); } catch (e) { /* never let pricing markup break a page */ }
    window.LunaraPricing = {
      products: PRODUCTS,
      get: byId,
      money: money,
      url: function (id) { var p = byId(id); return p ? LINK + p.link : null; },
      invoiceUrl: function (id) { var p = byId(id); return p ? invoiceHref(p) : null; },
      /* Opens the Stripe invoice form for a product, for a page that
         places its own control rather than using data-lx-buy. */
      requestInvoice: function (id) { var p = byId(id); if (p && invoiceable(p)) openInvoiceForm(p); },
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
