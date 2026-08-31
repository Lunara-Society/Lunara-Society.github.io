#!/usr/bin/env node
/* Fails the deploy when the registry contract disagrees with itself.
 *
 * The site once gave three answers to "what does the registry return"
 * — the page said lunara_id, the OpenAPI spec said public_id, and the
 * server said found. llms.txt points AI systems at that spec, so the
 * mismatch was aimed at machines. This is what stops it recurring.
 *
 * Checks, in order:
 *   1. corpus/registry-protocol.json matches registry-protocol.js
 *   2. the page blocks match what the generator would emit now
 *   3. openapi.yaml declares no response field the source does not
 *   4. every response carries an evidence mark, and every verified one
 *      carries the date it was observed
 *   5. nothing anywhere still says LUN-PROTO
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { PROTOCOL_VERSION, ENDPOINTS } from '../registry-protocol.js';
import { corpus, splice, PAGES } from './build-registry-protocol.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => readFileSync(join(root, f), 'utf8');
const fail = [];

/* 1 — the machine-readable emission */
{
  const on_disk = read('corpus/registry-protocol.json');
  const fresh = JSON.stringify(corpus(), null, 2) + '\n';
  if (on_disk !== fresh) {
    fail.push('corpus/registry-protocol.json is stale. Run: node tools/build-registry-protocol.mjs');
  }
}

/* 2 — the pages */
for (const { file, label } of PAGES) {
  const html = read(file);
  let fresh;
  try { fresh = splice(html, label); }
  catch (err) { fail.push(file + ': ' + err.message); continue; }
  if (html !== fresh) {
    fail.push(file + ' has drifted from registry-protocol.js. Run: node tools/build-registry-protocol.mjs');
  }
}

/* 3 — the spec AI systems actually read.
   Checked per endpoint rather than against one shared bag of names,
   because that is how public_id slipped through the first version of
   this check: it is a legitimate *request* field of the lookup, so a
   global set said yes while the spec was declaring it as something the
   server sends back. It never does.

   Both directions:
     · the spec may not declare a response property the endpoint has
       no record of returning
     · the spec must declare every field a VERIFIED response contains,
       so an observed key cannot quietly go undocumented              */
{
  const yaml = read('openapi.yaml');
  const bounds = [...yaml.matchAll(/^ {2}\/([A-Za-z]+):$/gm)]
    .map((m) => ({ name: m[1], at: m.index }));

  for (const e of ENDPOINTS) {
    const i = bounds.findIndex((b) => b.name === e.name);
    if (i === -1) { fail.push('openapi.yaml does not document /' + e.name); continue; }
    const section = yaml.slice(bounds[i].at,
      i + 1 < bounds.length ? bounds[i + 1].at : yaml.length);

    const responseAt = section.indexOf('      responses:');
    if (responseAt === -1) {
      fail.push('openapi.yaml /' + e.name + ' documents no response at all');
      continue;
    }
    const responses = section.slice(responseAt);

    /* Walks into arrays and nested objects: businesses[] carries its
       element's fields, and a flat Object.keys would miss every one of
       them while the spec declares them all. */
    const walk = (v, into) => {
      if (Array.isArray(v)) { v.forEach((x) => walk(x, into)); return; }
      if (v && typeof v === 'object') {
        for (const [k, x] of Object.entries(v)) { into.add(k); walk(x, into); }
      }
    };

    const mayReturn = new Set();
    const mustDocument = new Set();
    for (const r of e.responses) {
      walk(r.body, mayReturn);
      if (r.evidence === 'verified') walk(r.body, mustDocument);
    }

    const STRUCTURE = new Set(['type','properties','schema','description','example',
      'format','enum','items','required','summary','content','responses']);

    const declared = new Set();
    for (const m of responses.matchAll(/^ {16,}([a-z_]+):$/gm)) {
      const key = m[1];
      if (STRUCTURE.has(key)) continue;
      declared.add(key);
      if (!mayReturn.has(key)) {
        fail.push('openapi.yaml /' + e.name + ' declares response field "' + key +
          '", which registry-protocol.js has no record of the server returning');
      }
    }
    for (const key of mustDocument) {
      if (!declared.has(key)) {
        fail.push('openapi.yaml /' + e.name + ' omits "' + key +
          '", which is an observed field of a verified response');
      }
    }
  }
}

/* 4 — evidence marks */
for (const e of ENDPOINTS) {
  if (!e.responses.length) fail.push(e.name + ' documents no responses');
  for (const r of e.responses) {
    if (!['verified', 'unverified'].includes(r.evidence)) {
      fail.push(e.name + ': response "' + r.when + '" carries no evidence mark');
    }
    if (r.evidence === 'verified' && !/^\d{4}-\d{2}-\d{2}$/.test(r.observed || '')) {
      fail.push(e.name + ': "' + r.when + '" is marked verified with no observation date');
    }
    if (r.evidence === 'unverified' && !r.note) {
      fail.push(e.name + ': "' + r.when + '" is unverified and says nothing about why');
    }
  }
}

/* 5 — the retired name */
for (const f of ['registry.html','openapi.yaml','llms.txt',
                 'corpus/registry-protocol.json','ai.json','agent-manifest.json']) {
  let s; try { s = read(f); } catch { continue; }
  if (s.includes('LUN-PROTO')) fail.push(f + ' still carries LUN-PROTO; it is ' + PROTOCOL_VERSION);
}

if (fail.length) {
  console.error('\nRegistry protocol check failed:\n');
  for (const f of fail) console.error('  ✗ ' + f);
  console.error('');
  process.exit(1);
}
console.log('registry protocol: ' + ENDPOINTS.length + ' endpoints, ' +
  ENDPOINTS.reduce((n, e) => n + e.responses.length, 0) +
  ' responses, all marked; pages, corpus and openapi.yaml agree');
