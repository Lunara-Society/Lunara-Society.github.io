#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   THE GATE ON THE REGULATORY RECORD PAGE
   ═══════════════════════════════════════════════════════════════════

   intelligence.html renders corpus/obligations.json. The corpus is
   signed; the page is not. So the only thing keeping the page honest
   is this check: regenerate the table from the corpus and refuse the
   deploy if what is committed differs by a single character.

   Without it the failure mode is quiet and bad. Someone corrects a
   date in the corpus, the signature is reissued over the corrected
   file, and the page keeps showing the old date underneath a green
   "Verified" badge computed from the new one. The badge would be
   telling the truth about a file the reader cannot see, on a page
   that is lying about what is in it.

   It also checks the two things the generator cannot: that the count
   in the prose matches the corpus, and that every id in the table is
   an id in the corpus.
   ═══════════════════════════════════════════════════════════════════ */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { build, OPEN, CLOSE } from './build-intelligence.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const page = readFileSync(join(ROOT, 'intelligence.html'), 'utf8');
const corpus = JSON.parse(readFileSync(join(ROOT, 'corpus', 'obligations.json'), 'utf8'));

const fail = [];

/* ── the generated region matches the corpus ───────────────────── */
const a = page.indexOf(OPEN);
const b = page.indexOf(CLOSE);
if (a < 0 || b < 0) {
  fail.push('intelligence.html has no generated region — the build markers are missing.');
} else {
  const have = page.slice(a, b + CLOSE.length);
  const want = build();
  if (have !== want) {
    /* Name the first differing line so the failure is actionable
       rather than "something changed". */
    const h = have.split('\n');
    const w = want.split('\n');
    let i = 0;
    while (i < Math.min(h.length, w.length) && h[i] === w[i]) i++;
    fail.push(
      'intelligence.html is out of date with corpus/obligations.json.\n' +
      `      first difference at generated line ${i + 1}\n` +
      `      committed: ${(h[i] ?? '(end of block)').trim().slice(0, 120)}\n` +
      `      corpus:    ${(w[i] ?? '(end of block)').trim().slice(0, 120)}\n` +
      '      fix: node tools/build-intelligence.mjs'
    );
  }
}

/* ── every id in the page is an id in the corpus ────────────────── */
const ids = [...page.matchAll(/<article class="ob"[^>]*\bid="([^"]+)"/g)].map((m) => m[1]);
const known = new Set(corpus.obligations.map((o) => o.id));
for (const id of ids) if (!known.has(id)) fail.push(`intelligence.html renders "${id}", which is not in the corpus.`);
for (const o of corpus.obligations) if (!ids.includes(o.id)) fail.push(`corpus entry "${o.id}" is missing from intelligence.html.`);

/* ── the prose does not contradict the count ────────────────────
   The headline says "Ten obligations". A corpus that grows to eleven
   should break this, loudly, rather than shipping a page whose first
   sentence is wrong. */
const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine',
  'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen',
  'eighteen', 'nineteen', 'twenty'];
const n = corpus.obligations.length;
const word = WORDS[n];
/* Prose means prose: strip the scripts and the HTML comments first,
   or the check reads the commentary explaining the check and fails on
   its own words. */
const prose = page
  .slice(page.indexOf('<main>'))
  .replace(/<script[\s\S]*?<\/script>/gi, ' ')
  .replace(/<!--[\s\S]*?-->/g, ' ');
const claims = [...prose.matchAll(/\b(zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty) obligations?\b/gi)];
for (const c of claims) {
  if (c[1].toLowerCase() !== word) {
    fail.push(`intelligence.html says "${c[0]}" but the corpus holds ${n}. ` +
      `Update the prose to "${word} obligations".`);
  }
}
if (!claims.length) {
  fail.push('intelligence.html no longer states how many obligations the record holds. ' +
    'That sentence is what this check anchors to — put it back or change this gate deliberately.');
}

/* ── the page still points at the signed source ─────────────────── */
for (const need of ['/corpus/obligations.json', '/corpus/obligations.assertion.json', '/.well-known/keys.json']) {
  if (!page.includes(need)) fail.push(`intelligence.html no longer references ${need} — the integrity panel cannot run without it.`);
}

if (fail.length) {
  console.error('\n  intelligence.html — FAILED\n');
  for (const f of fail) console.error('    · ' + f);
  console.error('');
  process.exit(1);
}
console.log(`intelligence.html — ${n} obligations, matches corpus/obligations.json v${corpus.version}`);
