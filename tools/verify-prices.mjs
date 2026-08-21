#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   PRICE DRIFT GUARD
   ═══════════════════════════════════════════════════════════════════

   Fails the build when a page states a product price that the pricing
   table does not contain.

   The table has existed for a while and its header comment promised the
   thing this file actually enforces. It did not hold. An audit found a
   $99 Shield next to a button charging $75, a "$2,599 initial" card
   above a button charging $7,400, AI Entity Verification at $890 when
   it is $540, a $15/month membership that is invitational and $150 for
   six, and thirty-three files advertising a superseded catalogue to
   search engines. None of those were caught by anything, because
   nothing was looking.

   A figure passes if any of these is true:

     · it is a current price in lunara-pricing.js
     · it sits inside a data-lx- slot, which the module fills at runtime
       and tools/build-offers keeps correct in the static HTML too
     · it carries an M / B / million / billion suffix, so it is a market
       statistic rather than something anyone is being charged
     · the file is on the allowlist below

   Everything else is a price somebody typed by hand, which is how all
   of the above happened.
   ═══════════════════════════════════════════════════════════════════ */

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readProducts } from './build-offers.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/* Not sales pages. dashboard is behind robots and keeps a dated log of
   what was charged when, which is a record rather than an offer;
   invoice-template carries worked examples with placeholder figures. */
const ALLOW_FILES = new Set(['dashboard.html', 'invoice-template.html']);

/* Figures that are commercial but are not a product price, so the pricing
   table is the wrong home for them. Each needs a reason, and each is a
   promise somebody has to honour — keep the list short and check it.

   The referral rate is a payout to a partner, not something a customer is
   charged. It has not been confirmed against anything, which is why it is
   written down here rather than quietly ignored. */
const ALLOW_SNIPPETS = [
  { file: 'join.html', amount: 15,
    why: 'Referral payout to Registry Partners, not a price. Unconfirmed — needs checking against what is actually paid.' }
];

/* Figures below this are not plausibly a product price on this site —
   percentages, counts, small illustrative sums in body copy. */
const FLOOR = 15;
const CEILING = 20000;

export function auditFile(rel, text, prices) {
  const findings = [];

  // Comments are not offers. Several of them document a price that was
  // wrong and how it was corrected, and that record is worth keeping
  // exactly where the mistake was made.
  let masked = text.replace(/<!--[\s\S]*?-->/g, (m) => ' '.repeat(m.length));

  // Blank out anything inside a pricing slot: the module owns those, and
  // build-offers keeps their static text correct.
  masked = masked.replace(
    /<([a-zA-Z][a-zA-Z0-9]*)\b[^>]*?data-lx-(?:amount|price|name|terms|lede)="[a-z0-9]+"[^>]*>[^<]*<\/\1>/g,
    (m) => ' '.repeat(m.length)
  );

  for (const m of masked.matchAll(/\$\s?([0-9][0-9,]{1,7})/g)) {
    const n = Number(m[1].replace(/,/g, ''));
    if (!Number.isFinite(n) || n < FLOOR || n > CEILING) continue;

    // Market statistic? "$300M", "$1.2 billion"
    const after = masked.slice(m.index + m[0].length, m.index + m[0].length + 12);
    if (/^\s*(M\b|B\b|million|billion|bn\b)/i.test(after)) continue;

    if (prices.has(n)) continue;
    if (ALLOW_SNIPPETS.some((a) => a.file === rel && a.amount === n)) continue;

    const from = Math.max(0, m.index - 90);
    findings.push({
      amount: n,
      context: masked.slice(from, m.index + m[0].length + 60).replace(/\s+/g, ' ').trim()
    });
  }
  return findings;
}

function main() {
  const products = readProducts();
  const prices = new Set(products.map((p) => p.price));

  const files = readdirSync(ROOT)
    .filter((f) => f.endsWith('.html'))
    .filter((f) => !f.startsWith('index-'))
    .filter((f) => !ALLOW_FILES.has(f));

  const bad = [];
  for (const f of files) {
    const found = auditFile(f, readFileSync(join(ROOT, f), 'utf8'), prices);
    for (const x of found) bad.push({ file: f, ...x });
  }

  if (bad.length) {
    console.error('\n  price drift — figures no page should be stating by hand\n');
    for (const b of bad) console.error(`  · ${b.file}  $${b.amount}\n      …${b.context}…`);
    console.error('\n  Fix by putting the figure in a data-lx- slot, or by correcting');
    console.error('  lunara-pricing.js if the price itself has changed.\n');
    process.exit(1);
  }

  console.log(`prices verified — ${files.length} pages, every figure from the table`);
  for (const a of ALLOW_SNIPPETS) {
    console.log(`  note: ${a.file} states $${a.amount} by hand — ${a.why}`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
