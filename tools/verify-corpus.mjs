#!/usr/bin/env node
/* Fails if the published corpus has drifted from the obligation table,
   if a citation is missing, or if an entry is malformed.

   The point is narrow. Two tables mean two answers, and this institution
   has already published one correction caused by reading one source and
   not the other. A generated file that nobody regenerates is just a
   second hand-maintained table with extra steps, so the build refuses
   to pass while the two disagree. */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readObligations, buildCorpus } from './build-corpus.mjs';
import { readProducts, rewrite as rewriteOffers, targets as offerTargets } from './build-offers.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const fail = [];
const check = (cond, msg) => { if (!cond) fail.push(msg); };

const obligations = readObligations();
const expected = buildCorpus(obligations);

let published;
try {
  published = JSON.parse(readFileSync(join(ROOT, 'corpus/obligations.json'), 'utf8'));
} catch {
  fail.push('corpus/obligations.json is missing or unparseable — run: node tools/build-corpus.mjs');
}

if (published) {
  check(
    JSON.stringify(published) === JSON.stringify(expected),
    'corpus/obligations.json has drifted from lunara-clock.js — run: node tools/build-corpus.mjs'
  );
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const seen = new Set();

for (const o of expected.obligations) {
  const at = `obligation "${o.id}"`;
  check(!seen.has(o.id), `${at}: duplicate id`);
  seen.add(o.id);

  check(ISO.test(o.applies_from), `${at}: applies_from must be YYYY-MM-DD, got "${o.applies_from}"`);
  check(!Number.isNaN(Date.parse(o.applies_from)), `${at}: applies_from is not a real date`);

  // A row that states an obligation without citing the article that sets
  // the date is exactly the row the clock's own instructions forbid.
  check(Boolean(o.instrument), `${at}: no instrument named`);
  check(Boolean(o.article), `${at}: no article cited — the clock's own rule is that such an entry does not go in`);
  check(/^https:\/\//.test(o.source || ''), `${at}: no primary source URL`);
  check(o.amended_by === null || /^https:\/\//.test(o.amended_by), `${at}: amended_by must be a URL`);

  // An instrument that says it was amended must link the amending act.
  check(
    !/as amended by/i.test(o.instrument) || o.amended_by,
    `${at}: instrument says "as amended by" but no amended_by URL is given`
  );

  check(['verified', 'reported', 'interpretation', 'hypothesis'].includes(o.classification),
    `${at}: classification must be one of the four marks in the evidence standard`);
  check(ISO.test(o.verified || ''), `${at}: no verification date`);
}

// Prices told to machines must be the prices charged to people. These
// two disagreed across thirty-three files for long enough that the site
// advertised a Compliance Intelligence Report at $299 while selling it at
// $390, and offered two products that no longer existed. A date can be a
// reading error; a price is a commercial statement.
const products = readProducts();
for (const rel of offerTargets()) {
  const text = readFileSync(join(ROOT, rel), 'utf8');
  const { out } = rewriteOffers(text, products);
  check(out === text,
    `${rel}: JSON-LD offers have drifted from the pricing table — run: node tools/build-offers.mjs`);
}

// An invitational product must never carry a public buy button, and a
// structured-data offer is a buy button with better distribution.
for (const p of products.filter((x) => x.invitational)) {
  for (const rel of offerTargets()) {
    const text = readFileSync(join(ROOT, rel), 'utf8');
    check(!text.includes(`"name": ${JSON.stringify(p.name)}`) || !/"offers"/.test(text) ||
          !new RegExp(`"offers"[\\s\\S]*?${p.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*?\\n {6}\\]`).test(text),
      `${rel}: publishes invitational product "${p.name}" in structured data`);
  }
}

// Every JSON surface a machine is told to read must parse, and the issuer's
// own verification file must not claim a credential it does not hold. That
// file carried SHIELD-2026-0000 for months while the registry returned
// not_registered for it — the one contradiction guaranteed to be found by
// an agent following our own published protocol.
const SURFACES = [
  'ai.json', 'identity.json', 'agent-manifest.json', 'certification.json', 'schema-ld.json',
  'corpus/index.json', 'corpus/applicability.json', 'corpus/obligations.schema.json',
  '.well-known/ai.json', '.well-known/ai-plugin.json',
  '.well-known/lunara-verify.json', '.well-known/lunara-verify.schema.json'
];

for (const rel of SURFACES) {
  let doc;
  try {
    doc = JSON.parse(readFileSync(join(ROOT, rel), 'utf8'));
  } catch (e) {
    fail.push(`${rel}: does not parse as JSON (${e.message})`);
    continue;
  }
  if (rel === '.well-known/lunara-verify.json') {
    check(doc.record_type === 'issuing_authority',
      `${rel}: must declare record_type "issuing_authority" — this is the issuer's own file`);
    check(!('shield_id' in doc),
      `${rel}: claims a shield_id. The issuer holds no credential from itself, and an id that resolves to nothing is worse than none.`);
  }
}

// The site's rule is that no page states a date. These are the files that
// are allowed to, plus prose that quotes a correction rather than asserting
// a live deadline.
const ALLOWED_DATE_FILES = new Set(['lunara-clock.js', 'evidence.html', 'briefing.html']);

if (fail.length) {
  console.error('\n  corpus verification failed\n');
  for (const f of fail) console.error('  · ' + f);
  console.error('');
  process.exit(1);
}

console.log(`corpus verified — ${expected.count} obligations, every entry cited`);
