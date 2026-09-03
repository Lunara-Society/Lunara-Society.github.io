#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   FILE A DAILY BRIEFING
   ═══════════════════════════════════════════════════════════════════

   Usage:
     SUPABASE_SERVICE_ROLE_KEY=... node tools/ingest-briefing.mjs <file.json>
     node tools/ingest-briefing.mjs --template > ~/briefings/2026-09-04.json
     SUPABASE_SERVICE_ROLE_KEY=... node tools/ingest-briefing.mjs <file> --dry-run

   ───────────────────────────────────────────────────────────────────
   WHY THE FILE MUST LIVE OUTSIDE THIS REPOSITORY

   Everything committed here is served by GitHub Pages at a public URL.
   A briefing carries competitor assessments, risk owners, unannounced
   decisions and figures the briefing itself marks provisional. None of
   that is a public document, and a .json file in this tree is a
   published one whether or not anything links to it.

   So this tool refuses a path inside the repository. That is not a
   suggestion enforced by a comment — it is checked, because the failure
   mode is silent: nothing looks wrong, the file simply becomes
   readable by anyone who guesses the name.

   ───────────────────────────────────────────────────────────────────
   WHY EVERY ITEM ARRIVES UNVERIFIED

   A briefing is a set of claims somebody made on a date. The author's
   own five-star confidence is their assessment of their sourcing, and
   it is worth keeping — but it is not verification, and collapsing the
   two is how an institution starts repeating its own guesses back to
   itself as fact.

   Verification is a separate column, it starts at 'unverified', and it
   moves only when a named person has opened the primary source. That is
   the rule the public register runs on. It should not be looser inward
   than it is outward.
   ═══════════════════════════════════════════════════════════════════ */

import { readFileSync } from 'node:fs';
import { resolve, relative, isAbsolute } from 'node:path';

const PROJECT  = 'xkriotfcoialxmqvherb';
const REST     = `https://${PROJECT}.supabase.co/rest/v1`;
const SECTIONS = ['executive_summary','critical_development','market','regulatory',
                  'competitive','opportunity','risk','decision','memory'];
const TYPES    = ['verified_fact','observation','interpretation','recommendation',
                  'hypothesis','learning','doctrine_effect','brain_update'];

const args = process.argv.slice(2);
const flag = (f) => args.includes(f);

if (flag('--template')) {
  console.log(JSON.stringify({
    edition_date: 'YYYY-MM-DD',
    edition_label: '',
    format_version: 'v2.0',
    title: 'Lunara Daily Intelligence Briefing',
    executive_summary: '',
    confidence_note: '',
    produced_by: '',
    items: [{
      section: SECTIONS[1], claim_type: TYPES[0], confidence: 5,
      headline: '', body: '',
      source_org: '', source_url: '', source_date: 'YYYY-MM-DD',
      corpus_conflict: false, corpus_note: ''
    }],
    opportunities: [{ name:'', rationale:'', revenue:'', trust:'', strategic:'',
                      difficulty:'', horizon:'', evidence:'' }],
    risks:      [{ name:'', likelihood:'', impact:'', mitigation:'', owner:'' }],
    decisions:  [{ decision:'', detail:'', owner:'' }],
    entities:   [{ name:'', kind:'company', role:'' }]
  }, null, 2));
  process.exit(0);
}

const file = args.find((a) => !a.startsWith('--'));
if (!file) {
  console.error('usage: ingest-briefing.mjs <file.json> [--dry-run]\n' +
                '       ingest-briefing.mjs --template');
  process.exit(1);
}

/* The repository check. resolve() first so ../ cannot walk back in. */
const abs = resolve(file);
const rel = relative(resolve('.'), abs);
if (rel && !rel.startsWith('..') && !isAbsolute(rel)) {
  console.error(
    `\n  ✗ ${rel} is inside this repository, and everything in it is served\n` +
    `    publicly by GitHub Pages. Keep briefings somewhere else — a\n` +
    `    briefing names competitors, risk owners and undecided decisions.\n\n` +
    `    Move it out of the tree and run this again.\n`);
  process.exit(1);
}

let doc;
try { doc = JSON.parse(readFileSync(abs, 'utf8')); }
catch (e) { console.error(`  ✗ could not read ${abs}: ${e.message}`); process.exit(1); }

/* ── validation ──────────────────────────────────────────────────────
   Refuse the whole file rather than filing part of it. A briefing that
   is half in the record is worse than one that is not in it, because
   nobody knows which half. */
const problems = [];
const need = (c, m) => { if (!c) problems.push(m); };

need(/^\d{4}-\d{2}-\d{2}$/.test(doc.edition_date || ''), 'edition_date must be YYYY-MM-DD');
need(Array.isArray(doc.items) && doc.items.length, 'items must be a non-empty array');

(doc.items || []).forEach((it, i) => {
  const at = `items[${i}]`;
  need(SECTIONS.includes(it.section), `${at}.section must be one of: ${SECTIONS.join(', ')}`);
  need(TYPES.includes(it.claim_type), `${at}.claim_type must be one of: ${TYPES.join(', ')}`);
  need(typeof it.body === 'string' && it.body.trim().length > 0, `${at}.body is required`);
  if (it.confidence !== undefined && it.confidence !== null) {
    need(Number.isInteger(it.confidence) && it.confidence >= 1 && it.confidence <= 5,
         `${at}.confidence must be a whole number from 1 to 5`);
  }
  if (it.source_url) need(/^https:\/\//.test(it.source_url), `${at}.source_url must be https`);
  if (it.corpus_conflict) need((it.corpus_note || '').trim().length > 20,
    `${at} is flagged as conflicting with the corpus but corpus_note does not say how. ` +
    'Record the disagreement or do not flag it.');
  /* A claim typed as a verified fact with no organisation behind it is
     an opinion wearing a badge. */
  if (it.claim_type === 'verified_fact') {
    need((it.source_org || '').trim() || (it.source_url || '').trim(),
      `${at} is a verified_fact with no source_org and no source_url. Name who said it.`);
  }
});

if (problems.length) {
  console.error(`\n  ✗ ${problems.length} problem${problems.length === 1 ? '' : 's'}; nothing was filed.\n`);
  problems.forEach((p) => console.error('    · ' + p));
  console.error('');
  process.exit(1);
}

const counts = {
  items: doc.items.length,
  opportunities: (doc.opportunities || []).length,
  risks: (doc.risks || []).length,
  decisions: (doc.decisions || []).length,
  entities: (doc.entities || []).length,
  conflicts: doc.items.filter((i) => i.corpus_conflict).length
};

if (flag('--dry-run')) {
  console.log(`  ✓ ${doc.edition_date} validates. Would file:`);
  Object.entries(counts).forEach(([k, v]) => console.log(`      ${String(v).padStart(3)}  ${k}`));
  console.log('\n  Nothing was written. Drop --dry-run to file it.\n');
  process.exit(0);
}

const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!KEY) {
  console.error('\n  ✗ SUPABASE_SERVICE_ROLE_KEY is not set.\n' +
                '    These tables are sealed with row level security and no policies,\n' +
                '    so the publishable key cannot reach them. That is deliberate.\n');
  process.exit(1);
}

const head = { apikey: KEY, authorization: `Bearer ${KEY}`, 'content-type': 'application/json' };

async function post(table, rows, representation = false) {
  if (!rows || !rows.length) return [];
  const res = await fetch(`${REST}/${table}`, {
    method: 'POST',
    headers: representation ? { ...head, prefer: 'return=representation' } : head,
    body: JSON.stringify(rows)
  });
  if (!res.ok) throw new Error(`${table} ${res.status}: ${await res.text()}`);
  return representation ? res.json() : [];
}

try {
  const [row] = await post('briefings', [{
    edition_date: doc.edition_date,
    edition_label: doc.edition_label ?? null,
    format_version: doc.format_version ?? null,
    title: doc.title ?? null,
    executive_summary: doc.executive_summary ?? null,
    confidence_note: doc.confidence_note ?? null,
    produced_by: doc.produced_by ?? null,
    ingest_note: doc.ingest_note ?? null
  }], true);

  const id = row.id;
  await post('briefing_items', doc.items.map((it, n) => ({
    briefing_id: id, section: it.section, claim_type: it.claim_type,
    confidence: it.confidence ?? null, headline: it.headline ?? null, body: it.body,
    source_org: it.source_org ?? null, source_url: it.source_url ?? null,
    source_date: it.source_date ?? null,
    corpus_conflict: !!it.corpus_conflict, corpus_note: it.corpus_note ?? null,
    ordinal: n + 1
  })));
  await post('briefing_opportunities', (doc.opportunities || []).map((o) => ({ briefing_id: id, ...o })));
  await post('briefing_risks',         (doc.risks || []).map((r) => ({ briefing_id: id, ...r })));
  await post('briefing_decisions',     (doc.decisions || []).map((d) => ({ briefing_id: id, ...d })));
  await post('briefing_entities',      (doc.entities || []).map((e) => ({ briefing_id: id, ...e })));

  console.log(`\n  ✓ filed ${doc.edition_date}`);
  Object.entries(counts).forEach(([k, v]) => console.log(`      ${String(v).padStart(3)}  ${k}`));
  console.log(`\n  Every item is 'unverified'. It stays that way until a person opens\n` +
              `  the primary source and says otherwise.\n`);
} catch (e) {
  console.error(`\n  ✗ ${e.message}\n`);
  process.exit(1);
}
