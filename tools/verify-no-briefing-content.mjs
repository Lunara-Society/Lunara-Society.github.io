#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   NO BRIEFING CONTENT IN THE REPOSITORY
   ═══════════════════════════════════════════════════════════════════

   Briefings live in the database and nowhere else. This repository is
   published: every file in it is fetchable from lunarasociety.com by
   anyone who knows or guesses the path, with no link needed and no
   index required.

   A briefing names competitors and assesses them, assigns risks to
   people, records decisions the founder has not yet made, and repeats
   funding figures the briefing itself marks provisional. Publishing one
   would be a disclosure, not a leak of code.

   ingest-briefing.mjs already refuses a path inside the tree. This is
   the second lock, because that one only protects the ingest path: it
   does nothing about a file dropped here by an editor, a copy made
   while debugging, or an agent that decided a fixture would be handy.

   Detection is by shape rather than by keyword, so it cannot be dodged
   by renaming and does not fire on prose that merely discusses
   briefings. A file trips it when it parses as a briefing: an
   edition_date beside items carrying claim_type values from the schema.
   ═══════════════════════════════════════════════════════════════════ */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const SKIP = new Set(['node_modules', '.git', '.github']);
const TYPES = new Set(['verified_fact','observation','interpretation','recommendation',
                       'hypothesis','learning','doctrine_effect','brain_update']);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

const found = [];

for (const path of walk('.')) {
  const rel = relative('.', path);

  /* Named like a briefing, whatever is inside it. */
  if (/(^|\/)briefings?\//i.test(rel) || /briefing[^/]*\.(json|md|txt|csv)$/i.test(rel)) {
    if (!rel.startsWith('tools/')) {
      found.push([rel, 'named like briefing content']);
      continue;
    }
  }

  if (!/\.json$/i.test(rel)) continue;
  let doc;
  try { doc = JSON.parse(readFileSync(path, 'utf8')); } catch { continue; }
  if (!doc || typeof doc !== 'object') continue;

  const items = doc.items;
  const looksLikeBriefing =
    'edition_date' in doc &&
    Array.isArray(items) &&
    items.some((i) => i && typeof i === 'object' && TYPES.has(i.claim_type));

  if (looksLikeBriefing) found.push([rel, 'parses as a briefing: edition_date with classified items']);
}

if (found.length) {
  console.error('\n  ✗ briefing content found in the repository, which is published:\n');
  for (const [f, why] of found) console.error(`    · ${f}\n        ${why}`);
  console.error('\n    Briefings belong in the database. Move the file out of this tree and');
  console.error('    file it with:  SUPABASE_SERVICE_ROLE_KEY=... node tools/ingest-briefing.mjs <file>\n');
  process.exit(1);
}
console.log('  ✓ no briefing content in the published tree');
