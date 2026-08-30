#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   BUILD THE ANSWER PAGES
   ═══════════════════════════════════════════════════════════════════

   Four pages exist to answer a question somebody types into a search
   box or asks a model:

     what-is-shield-certification.html   what is it, what does it cost,
                                         who decides, can it be taken away
     verify-an-ai-business.html          how do I check a company is real
     ai-trust-standards.html             what should a standard require
     trust-badges.html                   what does a trust badge prove

   Pages like these rot faster than any others on a site, because the
   facts in them — the price, the steps, the statuses, the next
   deadline — live somewhere else and get corrected there. A page that
   says certification costs nothing to apply for, six months after
   that stopped being true, is worse than no page: it is the site
   arguing with itself in front of a prospect.

   So the factual blocks are emitted here from certification.json and
   corpus/obligations.json, between markers, and verify-answers.mjs
   fails the deploy when a page and its source disagree. The prose
   around them is written by hand; the facts inside them are not
   written at all.

   Usage:  node tools/build-answers.mjs
   ═══════════════════════════════════════════════════════════════════ */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CERT = JSON.parse(readFileSync(join(ROOT, 'certification.json'), 'utf8'));
const CORPUS = JSON.parse(readFileSync(join(ROOT, 'corpus', 'obligations.json'), 'utf8'));

const PAGES = [
  'what-is-shield-certification.html',
  'verify-an-ai-business.html',
  'ai-trust-standards.html',
  'trust-badges.html'
];

const esc = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const LONG = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];
const longDate = (iso) => { const p = iso.split('-').map(Number); return `${p[2]} ${LONG[p[1] - 1]} ${p[0]}`; };

const shield = CERT.programmes.find((p) => p.id === 'shield-certification');

/* ── block: the review process ─────────────────────────────────────
   Seven steps, in order, from the published specification. The one
   claim that matters most is step four, and it is the one a reader is
   least likely to believe, so it is not paraphrased. */
function blockProcess() {
  const steps = shield.evaluation.steps;
  return [
    '<ol class="steps">',
    ...steps.map((s) => {
      const extra = s.outcomes
        ? `<p class="step-extra">Outcomes: ${s.outcomes.map((o) => `<code>${esc(o)}</code>`).join(', ')}.${s.appeal ? ' ' + esc(s.appeal) : ''}</p>`
        : '';
      return `  <li><h3>${esc(s.name)}</h3><p>${esc(s.detail)}</p>${extra}</li>`;
    }),
    '</ol>',
    `<p class="src mono">Source: <a href="/certification.json">certification.json</a> &middot; ${esc(shield.evaluation.method)}</p>`
  ].join('\n');
}

/* ── block: what an application costs ──────────────────────────── */
function blockCost() {
  const c = shield.application.cost_to_apply;
  const free = Number(c.amount) === 0;
  return [
    '<div class="factbox">',
    `  <p class="fact-big">${free ? 'Free to apply' : esc(c.amount + ' ' + c.currency)}</p>`,
    `  <p>${esc(c.note)}</p>`,
    `  <p class="src mono">Source: <a href="/certification.json">certification.json</a> &middot; programmes[shield-certification].application.cost_to_apply</p>`,
    '</div>'
  ].join('\n');
}

/* ── block: the three registry answers ───────────────────────────
   Naming all three, including the one that is true of almost every
   business, because a register that can only say yes is a directory. */
const STATUS_MEANS = {
  verified: 'A named reviewer checked documentary evidence of who this business is and that it controls this domain, and signed the decision.',
  not_registered: 'Nobody has checked. This is the answer for almost every business on the internet and it is not a mark against them.',
  revoked: 'This entity held a credential and it was withdrawn. Find out why before relying on anything it claims.'
};
function blockStatuses() {
  return [
    '<dl class="statuses">',
    ...CERT.registry.statuses.map((s) =>
      `  <div><dt><code>${esc(s)}</code></dt><dd>${esc(STATUS_MEANS[s] || '')}</dd></div>`),
    '</dl>',
    `<p class="src mono">The register is ${CERT.registry.public ? 'public' : 'private'}, ` +
    `${CERT.registry.cost === 'free' ? 'costs nothing to query' : 'costs ' + esc(CERT.registry.cost)}, and ` +
    `${CERT.registry.requires_authentication ? 'requires authentication' : 'needs no account'}. ${esc(CERT.registry.note)}</p>`
  ].join('\n');
}

/* ── block: what is coming, from the signed corpus ───────────────
   Three entries, no more. A deadline list long enough to skim is a
   deadline list nobody skims. */
function blockDeadlines() {
  const ahead = CORPUS.obligations
    .filter((o) => o.applies_from > new Date().toISOString().slice(0, 10))
    .sort((a, b) => a.applies_from.localeCompare(b.applies_from) || a.id.localeCompare(b.id))
    .slice(0, 3);
  return [
    '<ul class="deadlines">',
    ...ahead.map((o) =>
      `  <li><time datetime="${esc(o.applies_from)}">${esc(longDate(o.applies_from))}</time> ` +
      `<strong>${esc(o.name)}</strong> <span>${esc(o.jurisdiction)} &middot; ${esc(o.article)}</span></li>`),
    '</ul>',
    '<p class="src mono">From the signed corpus at <a href="/corpus/obligations.json">corpus/obligations.json</a>. ' +
    'The whole record, with every citation, is on <a href="/intelligence.html">the regulatory record</a>.</p>'
  ].join('\n');
}

/* ── block: what certification cannot do ─────────────────────────
   Straight from the machine-readable file, because the limits of a
   credential belong on the page selling it. */
function blockLimits() {
  return [
    '<ul class="limits">',
    ...CERT.for_autonomous_agents.what_you_cannot_do_autonomously.map((l) => `  <li>${esc(l)}</li>`),
    '</ul>'
  ].join('\n');
}

const BLOCKS = {
  process: blockProcess,
  cost: blockCost,
  statuses: blockStatuses,
  deadlines: blockDeadlines,
  limits: blockLimits
};

const open = (k) => `<!-- BEGIN GENERATED ${k} — tools/build-answers.mjs -->`;
const close = (k) => `<!-- END GENERATED ${k} -->`;

/** Replace every generated region in `html`. Returns the new text. */
export function render(html) {
  let out = html;
  for (const key of Object.keys(BLOCKS)) {
    const o = open(key), c = close(key);
    let from = 0;
    for (;;) {
      const a = out.indexOf(o, from);
      if (a < 0) break;
      const b = out.indexOf(c, a);
      if (b < 0) throw new Error(`unclosed generated region "${key}"`);
      const block = o + '\n' + BLOCKS[key]() + '\n' + c;
      out = out.slice(0, a) + block + out.slice(b + c.length);
      from = a + block.length;
    }
  }
  return out;
}

export { PAGES, ROOT };

const direct = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (direct) {
  for (const p of PAGES) {
    const path = join(ROOT, p);
    if (!existsSync(path)) { console.error(`missing: ${p}`); process.exitCode = 1; continue; }
    const before = readFileSync(path, 'utf8');
    const after = render(before);
    if (before === after) console.log(`${p} — already current`);
    else { writeFileSync(path, after); console.log(`${p} — regenerated`); }
  }
}
