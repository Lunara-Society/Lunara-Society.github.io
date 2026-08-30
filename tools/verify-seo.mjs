#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   THE GATE ON DISCOVERABILITY
   ═══════════════════════════════════════════════════════════════════

   Two jobs.

   ONE — the answer pages must agree with their sources. The price, the
   seven steps, the three registry statuses and the next deadlines are
   emitted from certification.json and corpus/obligations.json. A page
   that tells a prospect certification is free to apply for, six months
   after that stopped being true, is the site arguing with itself in
   front of the customer. Regenerate and diff.

   TWO — the things that decide whether a page can be found at all are
   the things nobody notices breaking. A title silently reverting to a
   template placeholder, a missing description, two <h1>s, a canonical
   pointing at the wrong URL, a page in the sitemap that no longer
   exists, a page that exists and is in no sitemap. Every one of those
   was true of this site at some point, and none of them broke a test,
   because nothing was testing them.

   Warnings are printed but do not fail. Errors fail the deploy.
   ═══════════════════════════════════════════════════════════════════ */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { render, PAGES as ANSWER_PAGES } from './build-answers.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://lunarasociety.com/';

const errors = [];
const warnings = [];
const err = (f, m) => errors.push(`${f}: ${m}`);
const warn = (f, m) => warnings.push(`${f}: ${m}`);

/* Pages deliberately kept out of the index: gated thank-you and access
   pages, the Search Console token, the invoice template. They are
   exempt from the checks below, and robots.txt is the record of why. */
const robots = readFileSync(join(ROOT, 'robots.txt'), 'utf8');
const disallowed = new Set(
  [...robots.matchAll(/^Disallow:\s*\/([^\s]+)$/gm)].map((m) => m[1]).filter((p) => p.endsWith('.html'))
);
const EXEMPT = new Set([...disallowed, 'googlelgGP5VBX0LX-h5iTGYuTMYFNKbhzvdVHzl8gc2R20b4.html']);

const files = readdirSync(ROOT).filter((f) => f.endsWith('.html') && !EXEMPT.has(f));

/* ═══ ONE: the answer pages match their sources ═══════════════════ */
for (const p of ANSWER_PAGES) {
  const path = join(ROOT, p);
  if (!existsSync(path)) { err(p, 'answer page is missing'); continue; }
  const have = readFileSync(path, 'utf8');
  let want;
  try { want = render(have); }
  catch (e) { err(p, String(e.message)); continue; }
  if (have !== want) {
    const h = have.split('\n'), w = want.split('\n');
    let i = 0;
    while (i < Math.min(h.length, w.length) && h[i] === w[i]) i++;
    err(p, 'a generated block no longer matches its source.\n' +
      `        line ${i + 1}\n` +
      `        committed: ${(h[i] ?? '(end)').trim().slice(0, 110)}\n` +
      `        source:    ${(w[i] ?? '(end)').trim().slice(0, 110)}\n` +
      '        fix: node tools/build-answers.mjs');
  }
}

/* ═══ TWO: every published page can be found ══════════════════════ */

/* Placeholder titles that have actually shipped here. "Legacy Lunara
   Society" reached the browser tab, the share card and the page's own
   eyebrow on the registry page and nothing objected. */
const PLACEHOLDER = /^(legacy|untitled|new page|document|home|page|test|index|initiation)\b/i;

const seenTitle = new Map();
const seenDesc = new Map();
const present = new Set(files);

for (const f of files) {
  const s = readFileSync(join(ROOT, f), 'utf8');
  const head = s.slice(0, s.indexOf('</head>') + 7 || s.length);

  const title = (head.match(/<title>([^<]*)<\/title>/) || [])[1] || '';
  const desc = (head.match(/<meta\s+name="description"\s+content="([^"]*)"/i) || [])[1] || '';
  const canon = (head.match(/<link\s+rel="canonical"\s+href="([^"]*)"/i) || [])[1] || '';
  const h1s = [...s.matchAll(/<h1[\s>]/gi)].length;

  if (!title) err(f, 'no <title>');
  else {
    if (PLACEHOLDER.test(title)) err(f, `title looks like a placeholder: ${JSON.stringify(title)}`);
    if (!/lunara/i.test(title)) warn(f, `title does not name the institution: ${JSON.stringify(title)}`);
    if (title.length > 65) warn(f, `title is ${title.length} chars and will be truncated in results`);
    (seenTitle.get(title) ?? seenTitle.set(title, []).get(title)).push(f);
  }

  if (!desc) err(f, 'no meta description');
  else {
    if (desc.length < 60) warn(f, `description is only ${desc.length} chars`);
    if (desc.length > 170) warn(f, `description is ${desc.length} chars and will be truncated`);
    (seenDesc.get(desc) ?? seenDesc.set(desc, []).get(desc)).push(f);
  }

  if (!canon) err(f, 'no canonical link');
  else if (canon !== SITE + f && !(f === 'index.html' && canon === SITE)) {
    err(f, `canonical points at ${canon}, expected ${f === 'index.html' ? SITE : SITE + f}`);
  }

  if (h1s === 0) err(f, 'no <h1>');
  else if (h1s > 1) err(f, `${h1s} <h1> elements — exactly one is the heading of the page`);
}

for (const [t, fs] of seenTitle) if (fs.length > 1) err(fs.join(' + '), `share the title ${JSON.stringify(t)} and will compete for the same query`);
for (const [, fs] of seenDesc) if (fs.length > 1) warn(fs.join(' + '), 'share a meta description');

/* ═══ the sitemap and the site agree ══════════════════════════════ */
const sitemap = readFileSync(join(ROOT, 'sitemap.xml'), 'utf8');
const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);

if (new Set(locs).size !== locs.length) err('sitemap.xml', 'contains duplicate <loc> entries');
if (!locs.includes(SITE)) err('sitemap.xml', 'does not list the homepage');

for (const loc of locs) {
  if (!loc.startsWith(SITE)) { err('sitemap.xml', `${loc} is not on this site`); continue; }
  const rel = loc.slice(SITE.length);
  if (rel === '') continue;
  if (!existsSync(join(ROOT, rel))) err('sitemap.xml', `lists ${rel}, which does not exist`);
  if (EXEMPT.has(rel)) err('sitemap.xml', `lists ${rel}, which robots.txt disallows — pick one`);
}

const listed = new Set(locs.map((l) => l.slice(SITE.length)).map((r) => (r === '' ? 'index.html' : r)));
for (const f of files) if (!listed.has(f)) warn('sitemap.xml', `does not list ${f}`);

/* ═══ structured data parses ══════════════════════════════════════ */
for (const f of files) {
  const s = readFileSync(join(ROOT, f), 'utf8');
  for (const m of s.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try { JSON.parse(m[1]); }
    catch (e) { err(f, `has JSON-LD that does not parse: ${e.message.slice(0, 80)}`); }
  }
}

/* ═══ report ══════════════════════════════════════════════════════ */
if (warnings.length) {
  console.log(`\n  discoverability — ${warnings.length} warning${warnings.length === 1 ? '' : 's'}\n`);
  for (const w of warnings) console.log('    · ' + w);
  console.log('');
}
if (errors.length) {
  console.error(`\n  discoverability — FAILED with ${errors.length} error${errors.length === 1 ? '' : 's'}\n`);
  for (const e of errors) console.error('    · ' + e);
  console.error('');
  process.exit(1);
}
console.log(`discoverability — ${files.length} indexable pages, ${locs.length} sitemap entries, all consistent`);
