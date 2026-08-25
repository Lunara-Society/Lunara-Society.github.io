#!/usr/bin/env node
/* Emits the registry protocol from registry-protocol.js.
 *
 *   corpus/registry-protocol.json   for machines
 *   registry.html, protocol.html    the example block on each page
 *
 * Run after editing registry-protocol.js. CI runs the verifier, which
 * fails the deploy if these have drifted from the source.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { PROTOCOL_VERSION, API_BASE, ENDPOINTS, entryExample }
  from '../registry-protocol.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/* ── the machine-readable emission ───────────────────────────────── */

export function corpus() {
  return {
    protocol_version: PROTOCOL_VERSION,
    api_base: API_BASE,
    generated_from: 'registry-protocol.js',
    evidence_standard: {
      verified: 'Observed from the live endpoint on the date given.',
      unverified: 'Expected, never observed. Do not build against it.'
    },
    authentication: 'none',
    endpoints: ENDPOINTS.map((e) => ({
      name: e.name,
      method: e.method,
      url: API_BASE + '/' + e.name,
      summary: e.summary,
      request: e.request,
      responses: e.responses
    }))
  };
}

/* ── the block each page prints ──────────────────────────────────── */

const MARK = {
  start: '<!-- registry-protocol:start -->',
  end: '<!-- registry-protocol:end -->'
};

const esc = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function block(label) {
  const { body, evidence } = entryExample();
  const width = Math.max(...Object.keys(body).map((k) => k.length)) + 3;
  const lines = Object.entries(body).map(([k, v], i, all) =>
    '  ' + ('"' + k + '":').padEnd(width) + ' ' +
    JSON.stringify(v) + (i < all.length - 1 ? ',' : ''));

  /* The mark travels with the block. A schema on a page with no
     provenance is exactly how "Live registry entry format" came to sit
     above a shape the server has never returned. */
  const note = evidence === 'verified'
    ? 'Observed from the live endpoint.'
    : 'Expected shape &mdash; not yet observed, because no entity has '
      + 'been certified. The registry answers every lookup today with '
      + '<code>not_registered</code>.';

  return [
    MARK.start,
    '<div class="registry-block">',
    '<div class="registry-label">' + esc(label) + ' &middot; ' +
      PROTOCOL_VERSION + '</div>{',
    ...lines.map(esc),
    '}</div>',
    '<p class="registry-provenance" style="font-size:11.5px;line-height:1.7;' +
      'color:rgba(255,255,255,0.62);margin-top:10px;letter-spacing:0.02em">' +
      '<strong style="color:#C4A46B;font-weight:500;text-transform:uppercase;' +
      'letter-spacing:0.14em;font-size:11px">' + evidence + '</strong> &mdash; ' +
      note + '</p>',
    MARK.end
  ].join('\n');
}

/* ── writing ─────────────────────────────────────────────────────── */

export function splice(html, label) {
  const a = html.indexOf(MARK.start);
  const b = html.indexOf(MARK.end);
  if (a === -1 || b === -1) {
    throw new Error('markers missing — add ' + MARK.start + ' … ' + MARK.end);
  }
  return html.slice(0, a) + block(label) + html.slice(b + MARK.end.length);
}

export const PAGES = [
  { file: 'registry.html', label: 'Registry entry format' },
  { file: 'protocol.html', label: 'Registry entry format' }
];

if (import.meta.url === 'file://' + process.argv[1]) {
  const out = join(root, 'corpus', 'registry-protocol.json');
  writeFileSync(out, JSON.stringify(corpus(), null, 2) + '\n');
  console.log('wrote corpus/registry-protocol.json');

  for (const { file, label } of PAGES) {
    const p = join(root, file);
    writeFileSync(p, splice(readFileSync(p, 'utf8'), label));
    console.log('wrote ' + file);
  }
}
