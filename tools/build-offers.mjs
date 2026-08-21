#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   BUILD THE STRUCTURED-DATA OFFERS
   ═══════════════════════════════════════════════════════════════════

   lunara-pricing.js opens by promising this:

     "Change a price here and it changes everywhere at once, including
      in the schema markup search engines read. There is no second
      place to forget."

   That was not true. The pricing table never touched structured data.
   Thirty-three files carried an identical hand-written JSON-LD offers
   block advertising a catalogue that no longer existed — Shield at $80
   when it is $75, the Compliance Intelligence Report at $299 when it is
   $390, AI Entity Verification at $899 when it is $540, and two
   products, "Strategic Registry Partner" at $2,599 and a $79 Readiness
   Kit, that are not in the catalogue at all.

   So the site told humans one price and told Google and every AI system
   another. For an institution whose entire claim is that machines can
   rely on what it publishes, advertising a price you do not charge to
   the exact audience you are courting is worse than getting a date
   wrong. A date can be a reading error. This is a commercial statement.

   This script does what the comment always claimed: reads the one table
   and writes the JSON-LD, everywhere, in one pass. tools/verify-corpus
   fails the deploy while any file disagrees.

   Invitational products are deliberately excluded. The pricing table's
   own rule is that they must never be given a public buy button, and
   publishing one in structured data is a public buy button with better
   distribution.
   ═══════════════════════════════════════════════════════════════════ */

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/* Where each product is actually sold. A JSON-LD offer whose url is a
   page that does not sell the thing is a broken offer. */
const PAGE = {
  disclose:  'article50.html',
  kit:       'readiness-kit.html',
  shield:    'certify.html',
  second:    'compliance-intelligence.html',
  cir:       'compliance-intelligence.html',
  cirplus:   'compliance-intelligence.html',
  watch:     'watch.html',
  agent:     'certify.html',
  clinical:  'healthcare-intelligence.html',
  evidence:  'article50.html',
  vendor:    'certify.html'
};

export function readProducts() {
  const src = readFileSync(join(ROOT, 'lunara-pricing.js'), 'utf8');
  const m = src.match(/var PRODUCTS = (\[[\s\S]*?\n {2}\]);/);
  if (!m) throw new Error('PRODUCTS table not found in lunara-pricing.js');
  return new Function('return ' + m[1])();
}

export function buildOffersBlock(products, indent = 6) {
  const pad = ' '.repeat(indent);
  const inner = ' '.repeat(indent + 2);
  const field = ' '.repeat(indent + 4);

  const sellable = products
    .filter((p) => !p.invitational)
    .sort((a, b) => a.price - b.price);

  const entries = sellable.map((p) => {
    const page = PAGE[p.id];
    if (!page) throw new Error(`no page mapped for product "${p.id}" — add it to PAGE in tools/build-offers.mjs`);
    return [
      `${inner}{`,
      `${field}"@type": "Offer",`,
      `${field}"name": ${JSON.stringify(p.name)},`,
      `${field}"price": ${JSON.stringify(String(p.price))},`,
      `${field}"priceCurrency": "USD",`,
      `${field}"url": ${JSON.stringify('https://lunarasociety.com/' + page)}`,
      `${inner}}`
    ].join('\n');
  });

  return `${pad}"offers": [\n${entries.join(',\n')}\n${pad}]`;
}

/* Match an offers array and capture its indentation, so a file that
   nests its JSON-LD differently is rewritten at its own depth. */
const OFFERS = /( *)"offers"\s*:\s*\[[\s\S]*?\n\1\]/g;

export function rewrite(text, products) {
  let changed = 0;
  const out = text.replace(OFFERS, (match, pad) => {
    const built = buildOffersBlock(products, pad.length);
    if (built !== match) changed++;
    return built;
  });
  return { out, changed };
}

export function targets() {
  return readdirSync(ROOT)
    .filter((f) => /\.(html|json)$/.test(f))
    .filter((f) => {
      try { return readFileSync(join(ROOT, f), 'utf8').includes('"@type": "Offer"'); }
      catch { return false; }
    });
}

function main() {
  const products = readProducts();
  const files = targets();
  let touched = 0;

  for (const f of files) {
    const p = join(ROOT, f);
    const text = readFileSync(p, 'utf8');
    const { out, changed } = rewrite(text, products);
    if (changed && out !== text) { writeFileSync(p, out, 'utf8'); touched++; }
  }

  const sellable = products.filter((x) => !x.invitational).length;
  console.log(`offers rebuilt — ${sellable} products across ${files.length} files (${touched} rewritten)`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
