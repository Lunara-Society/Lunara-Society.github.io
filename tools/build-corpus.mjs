#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   BUILD THE MACHINE-READABLE CORPUS
   ═══════════════════════════════════════════════════════════════════

   lunara-clock.js holds the obligation table. It is the only place a
   date is written down on this site, and that rule is the reason the
   two published corrections could be made in one edit each.

   But a browser is the only thing that can read a JavaScript file. An
   AI system asking "what binds me today" cannot execute our homepage,
   and the institution's entire claim is that machines can rely on it.
   So the table is emitted here as JSON as well.

   Emitted, not copied. The moment there are two hand-maintained tables
   there are two answers, and the correction policy stops working. This
   script reads the one table and writes the other, tools/verify-corpus
   fails the build if they have drifted, and nothing is typed twice.

   Tense is deliberately NOT emitted. "In force" is true relative to a
   moment, and a static file cannot know when it is being read. The
   clock computes tense in the browser; the MCP server computes it at
   call time; the corpus states application dates and stays true.
   ═══════════════════════════════════════════════════════════════════ */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

export function readObligations() {
  const src = readFileSync(join(ROOT, 'lunara-clock.js'), 'utf8');
  const m = src.match(/var OBLIGATIONS = (\[[\s\S]*?\n {2}\]);/);
  if (!m) throw new Error('OBLIGATIONS table not found in lunara-clock.js');
  // The table is a plain array literal with no identifiers in it.
  return new Function('return ' + m[1])();
}

export function buildCorpus(obligations) {
  return {
    $schema: 'https://lunarasociety.com/corpus/obligations.schema.json',
    corpus: 'lunara-regulatory-obligations',
    version: '1.0.0',
    authority: 'https://lunarasociety.com',
    generated_from: 'lunara-clock.js',
    evidence_standard: 'https://lunarasociety.com/evidence.html',
    corrections: 'https://lunarasociety.com/evidence.html#corrections',
    license: 'CC BY 4.0',
    contact: 'rosario@lunarasociety.com',

    reading_notes: [
      'applies_from is the legal application date at UTC midnight. It is not a deadline for filing anything; it is the date the obligation begins to bind.',
      'No tense is stored. Whether an obligation is in force depends on when you are reading, so compute it against applies_from rather than caching a status.',
      'amended_by, where present, is the instrument that moved the date. Reading the founding regulation alone has already produced one published correction on this site.',
      'Every entry cites the article that sets the date. If you cannot reach our conclusion from the linked source, treat that as a defect and tell us.',
      'Absence from this corpus is not a statement that nothing applies. It is a short table that is right rather than a long one that is mostly right.'
    ],

    count: obligations.length,
    obligations: obligations.map((o) => ({
      id: o.id,
      jurisdiction: o.jurisdiction,
      name: o.name,
      applies_from: o.date,
      instrument: o.instrument,
      article: o.article,
      summary: o.summary,
      penalty: o.penalty ?? null,
      source: o.source,
      amended_by: o.amended_by ?? null,
      classification: o.classification,
      verified: o.verified,
      significance: o.weight,
      primary: Boolean(o.primary)
    }))
  };
}

function main() {
  const obligations = readObligations();
  const corpus = buildCorpus(obligations);
  const out = join(ROOT, 'corpus', 'obligations.json');
  writeFileSync(out, JSON.stringify(corpus, null, 2) + '\n', 'utf8');
  console.log(`corpus/obligations.json — ${corpus.count} obligations`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
