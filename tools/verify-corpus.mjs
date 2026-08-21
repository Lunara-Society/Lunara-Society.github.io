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
