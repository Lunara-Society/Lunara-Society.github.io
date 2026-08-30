#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   BUILD THE GLOSSARY
   ═══════════════════════════════════════════════════════════════════

   glossary.json is the source. glossary.html is the human reading of
   it, and the DefinedTermSet structured data at the bottom of the page
   is a third emission of the same definitions.

   Three copies of a definition is exactly the arrangement that
   produces a site defining "AI certification" one way in its prose,
   another in its schema, and a third on the page that sells it. So
   two of the three are generated and gated, and the vocabulary has
   one source.

   Usage:  node tools/build-glossary.mjs
   ═══════════════════════════════════════════════════════════════════ */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'glossary.json');
const PAGE = join(ROOT, 'glossary.html');
const URL_ = 'https://lunarasociety.com/glossary.html';

const esc = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/* Who says so. A definition the field uses, a definition that comes
   from an instrument, and a definition of our own are three different
   kinds of claim, and the page should not print them identically. */
const AUTHORITY = {
  field: ['the field', 'Common usage in the AI assurance field, defined as neutrally as we can manage.'],
  legal: ['from the law', 'A legal term of art. The instrument it comes from is linked.'],
  lunara: ['Lunara’s own', 'A term this institution defines and is therefore accountable for.']
};

function markup(g) {
  const terms = g.terms.slice().sort((a, b) => a.term.localeCompare(b.term));
  const byId = new Map(terms.map((t) => [t.id, t.term]));

  const index = '<nav class="gl-index" aria-label="All terms">' +
    terms.map((t) => `<a href="#${esc(t.id)}">${esc(t.term)}</a>`).join('') +
    '</nav>';

  const body = terms.map((t) => {
    const [label, title] = AUTHORITY[t.authority] || ['', ''];
    const bits = [];
    bits.push(`      <article class="gl" id="${esc(t.id)}">`);
    bits.push('        <div class="gl-top">');
    bits.push(`          <h2>${esc(t.term)}</h2>`);
    bits.push(`          <span class="gl-auth" title="${esc(title)}">${esc(label)}</span>`);
    bits.push('        </div>');
    bits.push(`        <p class="gl-def">${esc(t.short)}</p>`);
    if (t.note) bits.push(`        <p class="gl-note">${esc(t.note)}</p>`);
    if (t.confused_with) {
      bits.push(`        <p class="gl-warn"><b>Not the same as</b> ${esc(t.confused_with)}</p>`);
    }
    const foot = [];
    if (t.source) foot.push(`<a href="${esc(t.source)}" rel="noopener">The instrument</a>`);
    if (t.see && t.see.length) {
      foot.push('See also ' + t.see
        .filter((s) => byId.has(s))
        .map((s) => `<a href="#${esc(s)}">${esc(byId.get(s))}</a>`).join(', '));
    }
    if (foot.length) bits.push(`        <p class="gl-see">${foot.join(' &middot; ')}</p>`);
    bits.push('      </article>');
    return bits.join('\n');
  }).join('\n');

  return [
    OPEN,
    index,
    '    <div class="gl-list">',
    body,
    '    </div>',
    `    <p class="src mono">${terms.length} terms &middot; source <a href="/glossary.json">glossary.json</a> v${esc(g.version)} &middot; CC BY 4.0 &mdash; quote them, with attribution</p>`,
    CLOSE
  ].join('\n');
}

/* The same definitions again, as DefinedTerm. Not decoration: this is
   the form a search engine and a model can lift a definition from
   without parsing prose, and it must not be allowed to say something
   the visible page does not. */
function schema(g) {
  const terms = g.terms.slice().sort((a, b) => a.term.localeCompare(b.term));
  const doc = {
    '@context': 'https://schema.org',
    '@type': 'DefinedTermSet',
    '@id': URL_ + '#glossary',
    name: 'The Lunara glossary of AI trust and verification',
    description: 'The vocabulary of AI trust, verification, certification, assurance, governance and agent identity, defined once and used consistently across lunarasociety.com.',
    inLanguage: 'en',
    license: g.license,
    isAccessibleForFree: true,
    publisher: { '@type': 'Organization', name: 'Lunara Society', url: 'https://lunarasociety.com' },
    hasDefinedTerm: terms.map((t) => ({
      '@type': 'DefinedTerm',
      '@id': `${URL_}#${t.id}`,
      name: t.term,
      description: t.short,
      inDefinedTermSet: URL_ + '#glossary'
    }))
  };
  return SOPEN + '\n<script type="application/ld+json">\n' +
    JSON.stringify(doc, null, 2) + '\n</script>\n' + SCLOSE;
}

const OPEN = '<!-- BEGIN GENERATED glossary — tools/build-glossary.mjs -->';
const CLOSE = '<!-- END GENERATED glossary -->';
const SOPEN = '<!-- BEGIN GENERATED glossary-schema — tools/build-glossary.mjs -->';
const SCLOSE = '<!-- END GENERATED glossary-schema -->';

export function render(html) {
  const g = JSON.parse(readFileSync(SRC, 'utf8'));
  let out = html;
  for (const [o, c, make] of [[OPEN, CLOSE, markup], [SOPEN, SCLOSE, schema]]) {
    const a = out.indexOf(o);
    const b = out.indexOf(c);
    if (a < 0 || b < 0) throw new Error(`glossary.html is missing the ${o} region`);
    out = out.slice(0, a) + make(g) + out.slice(b + c.length);
  }
  return out;
}

export { OPEN, CLOSE, SOPEN, SCLOSE };

const direct = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (direct) {
  const before = readFileSync(PAGE, 'utf8');
  const after = render(before);
  if (before === after) console.log('glossary.html — already current');
  else { writeFileSync(PAGE, after); console.log('glossary.html — regenerated from glossary.json'); }
}
