#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   THE PRIORITY SITEMAP
   ═══════════════════════════════════════════════════════════════════

   Search Console reports seven pages indexed and twenty-seven not, on
   a domain a few weeks old with almost no inbound links. Google is
   rationing crawl, and forty-six URLs of equal declared priority give
   it no way to tell which fifteen actually matter.

   So there are two sitemaps. sitemap.xml stays complete — every
   published page, because a sitemap that hides pages is a sitemap
   that lies. sitemap-priority.xml lists only the pages that would
   still be worth having if the rest vanished: the front door, the
   record, the register, the certification, the four answer pages, the
   glossary, the agent page, the entity page and the machine doorway.

   This is Google's own advice from the Page Indexing documentation,
   not a trick. A second sitemap changes nothing about what is served;
   it is a statement of which URLs to look at first, and it makes the
   indexing report filterable to the set that matters.

   Usage:  node tools/build-priority-sitemap.mjs
   ═══════════════════════════════════════════════════════════════════ */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://lunarasociety.com/';
const OUT = join(ROOT, 'sitemap-priority.xml');

/* Ordered by what a stranger most needs, not by what we most want to
   sell. If a page is not defensible on that basis it does not belong
   in a list whose whole purpose is to be short. */
export const PRIORITY = [
  ['', '1.0', 'weekly'],                                 // the front door
  ['intelligence.html', '1.0', 'daily'],                 // the record, and it changes
  ['registry.html', '0.9', 'daily'],
  ['what-is-shield-certification.html', '0.9', 'monthly'],
  ['verify-an-ai-business.html', '0.9', 'monthly'],
  ['ai-agent-verification.html', '0.9', 'monthly'],
  ['shield.html', '0.8', 'monthly'],
  ['ai-trust-standards.html', '0.8', 'monthly'],
  ['trust-badges.html', '0.8', 'monthly'],
  ['glossary.html', '0.8', 'monthly'],
  ['evidence.html', '0.8', 'monthly'],
  ['mcp.html', '0.8', 'monthly'],
  ['institution.html', '0.7', 'monthly'],
  ['scorer.html', '0.7', 'monthly']
];

export function build() {
  const today = new Date().toISOString().slice(0, 10);
  const rows = PRIORITY.map(([p, pri, freq]) =>
    `  <url>\n    <loc>${SITE}${p}</loc>\n    <lastmod>${today}</lastmod>\n` +
    `    <changefreq>${freq}</changefreq>\n    <priority>${pri}</priority>\n  </url>`);
  return '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<!--\n' +
    '  The short list. Every URL here is also in sitemap.xml, which stays\n' +
    '  complete. This one exists so the indexing report can be filtered to\n' +
    '  the pages that would still matter if the rest of the site vanished.\n' +
    '-->\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    rows.join('\n') + '\n</urlset>\n';
}

const direct = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (direct) {
  for (const [p] of PRIORITY) {
    const f = p === '' ? 'index.html' : p;
    if (!existsSync(join(ROOT, f))) { console.error(`priority sitemap names ${f}, which does not exist`); process.exit(1); }
  }
  const next = build();
  const before = existsSync(OUT) ? readFileSync(OUT, 'utf8') : '';
  /* lastmod moves every day; only rewrite when the URL set changed. */
  const strip = (s) => s.replace(/<lastmod>[^<]*<\/lastmod>/g, '');
  if (strip(before) === strip(next)) console.log('sitemap-priority.xml — already current');
  else { writeFileSync(OUT, next); console.log(`sitemap-priority.xml — ${PRIORITY.length} URLs`); }
}
