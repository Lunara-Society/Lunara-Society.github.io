#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   BUILD THE REGULATORY RECORD PAGE
   ═══════════════════════════════════════════════════════════════════

   intelligence.html is the human reading of corpus/obligations.json.
   The corpus is the source; the page is an emission. Writing the
   obligations into the HTML by hand would create a second copy that
   drifts from the signed one, and a page that disagrees with the
   signature it displays is worse than no page.

   So the table is generated here, between markers, and
   verify-intelligence.mjs re-runs this and fails the deploy if what
   is committed is not what the corpus produces. Same pattern as the
   prices, the corpus itself, Rosario's brain and the registry
   protocol: one source, several emissions, a gate in between.

   What is deliberately NOT generated: whether an obligation is in
   force. No tense is stored in the corpus and none is baked in here,
   because the answer depends on when the page is being read. The
   markup carries the date; the browser computes the tense.

   Usage:  node tools/build-intelligence.mjs         (writes)
           node tools/build-intelligence.mjs --check (prints, no write)
   ═══════════════════════════════════════════════════════════════════ */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CORPUS = join(ROOT, 'corpus', 'obligations.json');
const PAGE = join(ROOT, 'intelligence.html');

const OPEN = '<!-- BEGIN GENERATED obligations — tools/build-intelligence.mjs -->';
const CLOSE = '<!-- END GENERATED obligations -->';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const LONG = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

const esc = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

const shortDate = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
};
const longDate = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${LONG[m - 1]} ${y}`;
};

/* The four marks. The corpus stores one per entry; the page has to
   show it, because an evidence standard nobody can see on the page
   is a policy document rather than a practice. */
const MARK = {
  verified: 'Read from the cited instrument',
  reported: 'Reported by a source we name',
  interpretation: 'Our reading, not the text',
  hypothesis: 'Unconfirmed'
};

/* A jurisdiction slug for filtering, derived rather than stored so a
   new jurisdiction in the corpus needs no change here. */
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function row(o) {
  const marks = MARK[o.classification] || o.classification;
  const links = [];
  links.push(`<a href="${esc(o.source)}" rel="noopener">The instrument</a>`);
  if (o.amended_by) links.push(`<a href="${esc(o.amended_by)}" rel="noopener">The amendment that moved it</a>`);

  return `      <article class="ob" data-from="${esc(o.applies_from)}" data-jur="${esc(slug(o.jurisdiction))}" id="${esc(o.id)}">
        <div class="ob-when">
          <time class="ob-date" datetime="${esc(o.applies_from)}">${esc(shortDate(o.applies_from))}</time>
          <span class="ob-rel mono" data-rel>&nbsp;</span>
        </div>
        <div class="ob-body">
          <div class="ob-top">
            <span class="ob-jur">${esc(o.jurisdiction)}</span>
            <span class="ob-mark" title="${esc(marks)}">${esc(o.classification)}</span>
            <a class="ob-id mono" href="#${esc(o.id)}" aria-label="Permanent link to ${esc(o.id)}">${esc(o.id)}</a>
          </div>
          <h3>${esc(o.name)}</h3>
          <p class="ob-sum">${esc(o.summary)}</p>
          <dl class="ob-meta">
            <div><dt>Instrument</dt><dd>${esc(o.instrument)}</dd></div>
            <div><dt>Article setting the date</dt><dd class="mono">${esc(o.article)}</dd></div>
${o.penalty ? `            <div class="ob-pen"><dt>Penalty</dt><dd>${esc(o.penalty)}</dd></div>\n` : ''}          </dl>
          <div class="ob-foot">
            <span class="ob-links">${links.join('')}</span>
            <span class="ob-check mono">Last read against the source ${esc(shortDate(o.verified))}</span>
          </div>
        </div>
      </article>`;
}

function build() {
  const corpus = JSON.parse(readFileSync(CORPUS, 'utf8'));
  const rows = corpus.obligations
    .slice()
    .sort((a, b) => a.applies_from.localeCompare(b.applies_from) || a.id.localeCompare(b.id));

  const jurisdictions = [...new Set(rows.map((o) => o.jurisdiction))].sort();
  const filters = [
    '<button type="button" class="fil on" data-fil="all">All ' + rows.length + '</button>',
    '<button type="button" class="fil" data-fil="ahead">Still ahead</button>',
    '<button type="button" class="fil" data-fil="inforce">Already in force</button>'
  ].concat(jurisdictions.map((j) =>
    `<button type="button" class="fil" data-fil="jur:${esc(slug(j))}">${esc(j)}</button>`));

  /* Written into the markup rather than fetched, so a reader with no
     JavaScript — and a crawler — still gets the whole record. */
  return [
    OPEN,
    `    <div class="fils" role="group" aria-label="Filter the record">`,
    '      ' + filters.join('\n      '),
    '    </div>',
    `    <p class="fil-count mono" data-count>Showing all ${rows.length} obligations.</p>`,
    '    <div class="obs">',
    rows.map(row).join('\n'),
    '    </div>',
    `    <p class="corpus-stamp mono">corpus/obligations.json &middot; version ${esc(corpus.version)} &middot; ${rows.length} entries &middot; generated from the signed corpus</p>`,
    CLOSE
  ].join('\n');
}

/* Only when run directly. verify-intelligence.mjs imports build() and
   must not trigger a write as a side effect of importing it. */
const direct = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (direct && process.argv.includes('--check')) {
  process.stdout.write(build());
} else if (direct) {
  const block = build();
  const page = readFileSync(PAGE, 'utf8');
  const a = page.indexOf(OPEN);
  const b = page.indexOf(CLOSE);
  if (a < 0 || b < 0) {
    console.error('intelligence.html has no generated region. Expected:\n  ' + OPEN + '\n  ' + CLOSE);
    process.exit(1);
  }
  const next = page.slice(0, a) + block + page.slice(b + CLOSE.length);
  if (next === page) {
    console.log('intelligence.html — already current');
  } else {
    writeFileSync(PAGE, next);
    console.log('intelligence.html — regenerated from corpus/obligations.json');
  }
}

export { build, OPEN, CLOSE, longDate };
