#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   THE GATE ON "DOES IT REACH YOU?"
   ═══════════════════════════════════════════════════════════════════

   lunara-applies.js asks a person the question lunara_applicability
   answers for an AI system, from the same published model. Two
   evaluators of one model are two answers waiting to happen, so this
   runs both over every possible set of answers (3^8 = 6,561) and stops
   the deploy on the first disagreement.

   mcp/core.mjs is covered by a published signature and does not export
   its evaluator, so the function is read out of the file as text rather
   than the file being edited to expose it.

   It also proves the claim the page makes about the questions it
   skips: asked in the page's order, skipping every question the page
   considers irrelevant never changes the rule that fires, the overlays,
   or the obligations that reach the deployment.
   ═══════════════════════════════════════════════════════════════════ */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const model = JSON.parse(readFileSync(join(ROOT, 'corpus', 'applicability.json'), 'utf8'));

/* The server's evaluator, lifted out by brace matching. */
const core = readFileSync(join(ROOT, 'mcp', 'core.mjs'), 'utf8');
const start = core.indexOf('function evaluate(model, answers)');
if (start < 0) { console.error('mcp/core.mjs: evaluate() not found'); process.exit(1); }
let depth = 0, end = -1;
for (let i = core.indexOf('{', start); i < core.length; i++) {
  if (core[i] === '{') depth++;
  else if (core[i] === '}' && --depth === 0) { end = i + 1; break; }
}
const serverEvaluate = new Function(core.slice(start, end) + '\nreturn evaluate;')();

/* The page's evaluator, run as the browser would run it. */
const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(readFileSync(join(ROOT, 'lunara-applies.js'), 'utf8'), sandbox);
const page = sandbox.window.LunaraApplies;
if (!page) { console.error('lunara-applies.js did not expose LunaraApplies'); process.exit(1); }

const ids = model.inputs.map((i) => i.id);
const missing = page.ORDER.filter((id) => !ids.includes(id)).concat(ids.filter((id) => !page.ORDER.includes(id)));
if (missing.length) {
  console.error('lunara-applies.js asks a different set of questions from the model: ' + missing.join(', '));
  process.exit(1);
}

const shape = (r) => JSON.stringify({
  rule: r.rule ? r.rule.id : null,
  overlays: r.overlays.map((o) => o.id),
  obligations: [...r.obligationIds].sort()
});

const VALUES = ['yes', 'no', 'unsure'];
const fail = [];
let n = 0;
const total = VALUES.length ** ids.length;
for (let k = 0; k < total; k++) {
  const answers = {};
  let x = k;
  for (const id of ids) { answers[id] = VALUES[x % 3]; x = Math.floor(x / 3); }
  n++;

  const s = serverEvaluate(model, answers);
  const p = page.evaluate(model, answers);
  if (shape(s) !== shape(p) || JSON.stringify(s.unsure) !== JSON.stringify([...p.unsure])) {
    fail.push(`disagree on ${JSON.stringify(answers)}\n  server ${shape(s)}\n  page   ${shape(p)}`);
  }

  /* The page's path through the questions. */
  const asked = {};
  for (const id of page.ORDER) if (page.relevant(id, asked)) asked[id] = answers[id];
  const viaPage = serverEvaluate(model, page.complete(asked));
  if (shape(viaPage) !== shape(s)) {
    fail.push(`skipping changed the outcome on ${JSON.stringify(answers)}\n  full    ${shape(s)}\n  skipped ${shape(viaPage)}`);
  }
  if (fail.length > 5) break;
}

if (fail.length) {
  console.error('✗ the page and the MCP server do not give the same answer:\n' + fail.join('\n'));
  process.exit(1);
}
console.log(`applicability check: page and MCP server agree on all ${n} answer sets; skipped questions never change an outcome`);
