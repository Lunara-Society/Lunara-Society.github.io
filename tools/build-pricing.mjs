#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   BUILD THE PRICING PAGE
   ═══════════════════════════════════════════════════════════════════

   node tools/build-pricing.mjs        rewrites pricing.html in place

   pricing.html shows every product and its price. Written by hand, it
   would be the thirty-fourth place a price could drift from the table,
   and the site has already lived through thirty-three. So everything
   between <!-- pricing:begin --> and <!-- pricing:end --> is generated
   here from lunara-pricing.js. tools/verify-prices.mjs regenerates it
   and fails the deploy if the committed page differs.

   The page is static on purpose. A crawler, an AI system reading the
   raw HTML and a reader with JavaScript off all get the full catalogue.
   Every figure still sits in a data-lx- slot, so lunara-pricing.js
   keeps it right in the browser too.

   What this file decides is only the arrangement: which group a product
   belongs to, the order, the words on its button, and which product a
   group recommends. A product the table sells but no group places stops
   the build, because a product nobody can find is not for sale.
   ═══════════════════════════════════════════════════════════════════ */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readProducts, PAGE } from './build-offers.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FILE = join(ROOT, 'pricing.html');
const BEGIN = '<!-- pricing:begin -->';
const END = '<!-- pricing:end -->';
const LBEGIN = '<!-- ladder:begin -->';
const LEND = '<!-- ladder:end -->';

/* The groups, in the order a buyer meets them: their domain and their
   business first, the deadline second, agents third, then the app and
   the Society. `pick` is the one each group recommends, an editorial
   choice and not a claim about what other people bought. */
export const GROUPS = [
  {
    id: 'business',
    kicker: 'Your domain and your business',
    title: 'Be <em>checkable</em> by anyone who asks',
    lede: 'The passport is free and it is a snapshot. These keep it current, and put a named person behind the business that runs the domain.',
    cards: ['monitor', 'shield', 'vendor'],
    pick: 'monitor',
    alt: { monitor: 'monitor_year' }
  },
  {
    id: 'deadline',
    kicker: 'The EU AI Act · from the 2 December deadline on',
    title: 'The deadline work, <em>done for you</em>',
    lede: 'Article 50 marking becomes mandatory for systems already on the market on 2 December 2026. Each of these is written for your system by a person, against the article that sets the duty.',
    cards: ['disclose', 'kit', 'second', 'cir', 'watch', 'cirplus', 'evidence', 'clinical'],
    pick: 'disclose'
  },
  {
    id: 'agents',
    kicker: 'AI agents',
    title: 'Identity and standing <em>for agents</em>',
    lede: 'An identity a third party can check, and the Agent Network, where an agent earns its tier by passing trials. Network purchases are made for an agent that has joined, so they open from its profile.',
    cards: ['agent'],
    rows: ['trial_pass', 'trial_pack', 'net_associate', 'net_fellow', 'net_warden'],
    rowsTitle: 'The Agent Network'
  },
  {
    id: 'lens',
    kicker: 'Lunara Lens',
    title: 'Is it real? <em>Ask Rosario.</em>',
    lede: 'The app is free. Its AI checks use credits, and plans and credits are paid inside the app, so they land on the account that paid.',
    rows: ['lens_starter', 'lens_pro', 'lens_max', 'lens_credits_500', 'lens_credits_1500', 'lens_credits_5000', 'lensapi'],
    rowsTitle: 'Plans, credits and the API'
  },
  {
    id: 'society',
    kicker: 'The Society',
    title: 'Membership, <em>by invitation</em>',
    lede: 'Membership of the Society is not a certification of your business, and it has no public buy button: it is offered to people the Society has accepted.',
    rows: ['member6', 'member12'],
    rowsTitle: 'Membership'
  }
];

/* The words on a buy button. Anything not here says "Buy". */
const CTA = {
  monitor: 'Start monitoring', shield: 'Get verified', vendor: 'Buy Vendor Certification',
  disclose: 'Get the pack', kit: 'Get the kit', second: 'Get a second opinion',
  cir: 'Order the report', watch: 'Start the watch', cirplus: 'Order with a session',
  evidence: 'Order the Evidence Pack', clinical: 'Order the assessment', agent: 'Verify an agent'
};

/* The ladder at the top of the page: the steps a business climbs, on a
   log scale from free to the most expensive, one tick per step rather
   than one per product, so the scale stays readable. */
const LADDER = ['monitor', 'shield', 'disclose', 'cir', 'agent', 'evidence', 'vendor'];
const SHORT = {
  monitor: 'Passport Monitor', shield: 'Shield Verification', disclose: 'Disclosure Pack', kit: 'Compliance Kit',
  second: 'Second Opinion', watch: 'Regulatory Watch', cir: 'Intelligence Report', agent: 'AI Entity Verification',
  cirplus: 'Report and session', clinical: 'Clinical AI', evidence: 'Evidence Pack', vendor: 'Vendor Certification'
};

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const money = (n) => '$' + String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

/* The same words lunara-pricing.js writes into data-lx-every. */
const COUNT_WORDS = ['', '', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
function every(p) {
  const r = p && p.renews;
  if (!r) return '';
  if ((r.count || 1) === 1) return 'a ' + r.interval;
  return 'every ' + (COUNT_WORDS[r.count] || r.count) + ' ' + r.interval + 's';
}

function cadence(p) {
  return p.renews
    ? `<span data-lx-every="${p.id}">${esc(every(p))}</span>`
    : '<span>one payment</span>';
}

function action(p, primary) {
  const cls = `x-btn ${primary ? 'x-btn--gold' : 'x-btn--line'}`;
  if (p.invitational) return `<a class="${cls}" href="/join.html">By invitation</a>`;
  if (p.id.startsWith('lens')) return `<a class="${cls}" href="/lens.html">In the app</a>`;
  if (p.network) return `<a class="${cls}" href="/agent-network.html#trials">Buy for your agent</a>`;
  const page = PAGE[p.id] || 'pricing.html';
  /* The payment line is said once, above the catalogue, not under every
     button; the empty note is where a failed checkout explains itself. */
  return `<a class="${cls}" href="/${page}" data-lx-buy="${p.id}" data-lx-nonote>${esc(CTA[p.id] || 'Buy')}</a><span class="lx-paynote" aria-live="polite"></span>`;
}

function card(p, g, products) {
  const pick = g.pick === p.id;
  const alt = g.alt && g.alt[p.id] && products.get(g.alt[p.id]);
  return [
    `      <article class="pc${pick ? ' pc--pick' : ''}" id="p-${p.id}">`,
    pick ? '        <span class="x-tag x-tag--gold pc-flag">Recommended</span>' : '',
    `        <h3 class="pc-name" data-lx-name="${p.id}">${esc(p.name)}</h3>`,
    `        <p class="pc-lede" data-lx-lede="${p.id}">${esc(p.lede)}</p>`,
    `        <div class="x-price"><b data-lx-amount="${p.id}">${money(p.price)}</b>${cadence(p)}</div>`,
    `        <p class="pc-terms" data-lx-terms="${p.id}">${esc(p.terms)}</p>`,
    (p.points && p.points.length)
      ? `        <ul class="x-checks">\n${p.points.map((t) => `          <li>${esc(t)}</li>`).join('\n')}\n        </ul>`
      : '',
    `        <div class="pc-act">${action(p, pick)}</div>`,
    alt
      ? `        <p class="pc-alt">Or yearly: <a href="/${PAGE[alt.id] || 'pricing.html'}" data-lx-buy="${alt.id}" data-lx-nonote><span data-lx-amount="${alt.id}">${money(alt.price)}</span> <span data-lx-every="${alt.id}">${esc(every(alt))}</span></a>, <span data-lx-lede="${alt.id}">${esc(alt.lede)}</span></p>`
      : '',
    '      </article>'
  ].filter(Boolean).join('\n');
}

function row(p) {
  return [
    `        <li class="pr" id="p-${p.id}">`,
    `          <span class="pr-name" data-lx-name="${p.id}">${esc(p.name)}</span>`,
    `          <span class="pr-lede" data-lx-lede="${p.id}">${esc(p.lede)}</span>`,
    `          <span class="pr-price"><b data-lx-amount="${p.id}">${money(p.price)}</b> ${p.renews ? `<i data-lx-every="${p.id}">${esc(every(p))}</i>` : '<i>one payment</i>'}</span>`,
    `          <span class="pr-act">${action(p, false).replace('x-btn x-btn--line', 'x-btn x-btn--line x-btn--sm')}</span>`,
    '        </li>'
  ].join('\n');
}

function ladder(products) {
  const items = LADDER.map((id) => products.get(id)).filter(Boolean).sort((a, b) => a.price - b.price);
  const max = Math.max(...items.map((p) => p.price));
  const W = 1000, LEFT = 120, FLOOR = 10;       // "Free" sits at the left edge, then the log scale from $10
  const x = (price) => LEFT + ((Math.log10(price) - Math.log10(FLOOR)) / (Math.log10(max) - Math.log10(FLOOR))) * (W - LEFT - 10);
  /* Products that cost the same share a tick. */
  const ticks = [];
  for (const p of items) {
    const t = ticks.find((k) => k.price === p.price);
    if (t) t.ps.push(p); else ticks.push({ price: p.price, ps: [p] });
  }
  /* Labels go on whichever of three rows has room, so none overlap.
     The first row starts after the "Free" label. */
  const FREE_LABEL = 'Checking, always';
  const rows = [(LEFT - 52) + FREE_LABEL.length * 7.2, -Infinity, -Infinity];
  const placed = ticks.map((t) => {
    const px = x(t.price);
    const label = t.ps.map((p) => SHORT[p.id] || p.name).join(' · ');
    const w = label.length * 7.2 + 20;
    /* Near an edge the label hangs inward instead of past the edge. */
    const align = px > W - w / 2 ? 'end' : 'mid';
    const from = align === 'end' ? px - w : px - w / 2, to = align === 'end' ? px : px + w / 2;
    let r = rows.findIndex((end) => from > end + 10);
    if (r < 0) r = rows.indexOf(Math.min(...rows));
    rows[r] = to;
    return { ...t, px, r, label, align };
  });
  const pct = (px) => (px / W * 100).toFixed(2) + '%';
  return [
    '    <div class="ladder" role="group" aria-label="Every step on one scale, from free to the most expensive">',
    '      <div class="ladder-rail" aria-hidden="true"></div>',
    `      <a class="ladder-tick ladder-free" style="left:${pct(LEFT - 46)}" href="#start"><b>Free</b><span>${FREE_LABEL}</span></a>`,
    ...placed.map((t) => {
      const id = t.ps[0].id;
      const amounts = `<b data-lx-amount="${id}">${money(t.price)}</b>`;
      return `      <a class="ladder-tick r${t.r}${t.align === 'end' ? ' end' : ''}" style="left:${pct(t.px)}" href="#p-${id}">${amounts}<span>${esc(t.label)}</span></a>`;
    }),
    '    </div>'
  ].join('\n');
}

export function renderLadder(products) {
  return ladder(new Map(products.map((p) => [p.id, p])));
}

export function renderBlock(products) {
  const byId = new Map(products.map((p) => [p.id, p]));
  const placed = new Set();
  const out = [];

  for (const g of GROUPS) {
    const cards = (g.cards || []).map((id) => {
      const p = byId.get(id);
      if (!p) throw new Error(`pricing.html: group "${g.id}" names "${id}", which is not in lunara-pricing.js`);
      placed.add(id);
      if (g.alt && g.alt[id]) placed.add(g.alt[id]);
      return card(p, g, byId);
    });
    const rows = (g.rows || []).map((id) => {
      const p = byId.get(id);
      if (!p) throw new Error(`pricing.html: group "${g.id}" names "${id}", which is not in lunara-pricing.js`);
      placed.add(id);
      return row(p);
    });
    out.push([
      `  <section class="x-section pg" id="${g.id}" aria-labelledby="${g.id}-h">`,
      '    <div class="x-wrap">',
      `      <p class="x-eyebrow">${esc(g.kicker)}</p>`,
      `      <h2 class="x-h2" id="${g.id}-h">${g.title}</h2>`,
      `      <p class="x-lede">${esc(g.lede)}</p>`,
      `      <div class="pg-body${cards.length && rows.length ? ' pg-split' : ''}">`,
      cards.length ? `      <div class="pg-cards pg-cards--${cards.length > 3 ? 4 : cards.length}">\n${cards.join('\n')}\n      </div>` : '',
      rows.length ? `      <div class="pg-rows">\n        <h3 class="x-h4">${esc(g.rowsTitle || '')}</h3>\n        <ul>\n${rows.join('\n')}\n        </ul>\n      </div>` : '',
      '      </div>',
      '    </div>',
      '  </section>'
    ].filter(Boolean).join('\n'));
  }

  const missing = products.filter((p) => !placed.has(p.id)).map((p) => p.id);
  if (missing.length) throw new Error(`pricing.html: no group places ${missing.join(', ')} — add them to GROUPS in tools/build-pricing.mjs`);
  return out.join('\n\n');
}

function between(html, begin, end, body, name) {
  const a = html.indexOf(begin), b = html.indexOf(end);
  if (a < 0 || b < a) throw new Error(`pricing.html: the ${name} markers are missing`);
  return html.slice(0, a + begin.length) + '\n' + body + '\n' + html.slice(b);
}

export function render(html, products = readProducts()) {
  const withLadder = between(html, LBEGIN, LEND, renderLadder(products), 'ladder:begin / ladder:end');
  return between(withLadder, BEGIN, END, renderBlock(products), 'pricing:begin / pricing:end');
}

function main() {
  const html = readFileSync(FILE, 'utf8');
  const out = render(html);
  if (out !== html) { writeFileSync(FILE, out, 'utf8'); console.log('pricing.html rebuilt from lunara-pricing.js'); }
  else console.log('pricing.html already matches lunara-pricing.js');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
