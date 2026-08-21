#!/usr/bin/env node
/* Fails the build when Rosario's published brain has drifted from the
   sources it is generated from.

   She is the address in llms.txt. If the corpus corrects a date and her
   briefing still carries the old one, the institution now has two answers
   and the one a prospect hears is the stale one. That is the failure mode
   behind all four published corrections, pointed at a person instead of a
   page. */

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { build } from './build-rosario-brain.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const fail = [];

const { files, obs, corr } = build();

for (const [name, expected] of Object.entries(files)) {
  const p = join(ROOT, 'rosario-brain', name);
  if (!existsSync(p)) { fail.push(`rosario-brain/${name} is missing`); continue; }
  if (readFileSync(p, 'utf8') !== expected) {
    fail.push(`rosario-brain/${name} has drifted — run: node tools/build-rosario-brain.mjs`);
  }
}

// The whole point of her is that she does not guess. If the doctrine that
// says so ever goes missing, she is just a chatbot with our name on it.
const doctrine = files['00-ROSARIO-OPERATING-DOCTRINE.md'];
for (const must of ['You do not guess', 'never say you are', 'the lookup failed',
                    'Never assert that a third party is non-compliant',
                    'Never claim to be human']) {
  if (!doctrine.includes(must)) fail.push(`doctrine no longer contains: "${must}"`);
}

// The trap file must carry the live date, not a date someone typed.
const legacy = obs.find((o) => o.id === 'eu-art50-legacy');
if (!files['07-FACTS-YOU-MUST-NEVER-GET-WRONG.md'].includes(legacy.date)) {
  fail.push(`trap file does not carry the corpus date ${legacy.date} for eu-art50-legacy`);
}

if (corr.length < 4) fail.push(`only ${corr.length} corrections parsed from evidence.html`);

if (fail.length) {
  console.error('\n  Rosario brain verification failed\n');
  for (const f of fail) console.error('  · ' + f);
  console.error('');
  process.exit(1);
}
console.log(`Rosario brain verified — ${Object.keys(files).length} files, ${corr.length} corrections, doctrine intact`);
