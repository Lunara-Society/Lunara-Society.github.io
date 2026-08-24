#!/usr/bin/env node
/* An install instruction that resolves to nothing is a form posting into
   nothing, aimed at the audience this institution most wants to reach.

   `npx @lunara/mcp` was printed on the homepage, on the MCP page, in
   llms.txt, in the corpus index and in Rosario's briefing for weeks. The
   package did not exist. Nothing was watching, because nothing was
   looking — the same shape as the $99 Shield beside a button charging
   $75, and as the four auth functions answering 404.

   So: while the registry does not answer for a package, this repository
   may not print its install command except where it says, in the same
   breath, that it is not published. When the registry does answer, the
   rule inverts and this gate says to take the warnings back out. */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PACKAGE = '@lunara/mcp';
const REGISTRY = `https://registry.npmjs.org/${PACKAGE.replace('/', '%2F')}`;

/* Words that turn an occurrence from an instruction into a disclosure. */
const DISCLOSED = /not published|not yet published|NOT YET PUBLISHED|never tell anyone|answered 404|resolved to nothing|does not exist|did not exist|will follow|status.*not_published/i;

/* Surfaces that instruct a reader. Source files are not scanned: code
   naming the package it belongs to is not telling anybody to install it,
   and mcp/package.json has to carry the name to be publishable at all. */
const SKIP_DIRS = new Set(['.git', 'node_modules', '.github', 'outreach']);
const LOOK_AT = /\.(html|md)$|^llms\.txt$|^index\.json$|^ai\.json$/;
const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p);
    else if (LOOK_AT.test(name) && st.size < 4_000_000) files.push(p);
    else if (name === 'llms.txt') files.push(p);
  }
})(ROOT);

const SELF = ['tools/verify-install-commands.mjs'];
const hits = [];
for (const p of files) {
  const rel = relative(ROOT, p);
  if (SELF.includes(rel)) continue;
  const text = readFileSync(p, 'utf8');
  let i = -1;
  while ((i = text.indexOf(PACKAGE, i + 1)) >= 0) {
    const context = text.slice(Math.max(0, i - 900), i + 500);
    hits.push({ rel, disclosed: DISCLOSED.test(context), line: text.slice(0, i).split('\n').length });
  }
}

let published = null;
try {
  const res = await fetch(REGISTRY, { signal: AbortSignal.timeout(8000) });
  published = res.status === 200 ? true : res.status === 404 ? false : null;
} catch {
  published = null; // the registry, not us. Do not fail a deploy over it.
}

if (published === null) {
  console.log(`install commands: could not reach the npm registry — ${hits.length} mention(s) of ${PACKAGE} left unchecked`);
  process.exit(0);
}

if (published) {
  const stale = hits.filter((h) => h.disclosed);
  if (stale.length) {
    console.log(`${PACKAGE} is published now. Remove the "not published yet" wording from:`);
    for (const h of stale) console.log(`  - ${h.rel}:${h.line}`);
    console.log('(not fatal — but the site is now understating what works)');
  }
  console.log(`install commands: ${PACKAGE} resolves, ${hits.length} mention(s) fine`);
  process.exit(0);
}

const undisclosed = hits.filter((h) => !h.disclosed);
if (undisclosed.length) {
  console.error(`\n${PACKAGE} does not resolve on the npm registry, and these print it as though it does:`);
  for (const h of undisclosed) console.error(`  - ${h.rel}:${h.line}`);
  console.error('\nEither publish it (see mcp/DEPLOYING.md) or say in the same breath that it is not published yet.');
  process.exit(1);
}
console.log(`install commands: ${PACKAGE} is unpublished and all ${hits.length} mention(s) say so`);
