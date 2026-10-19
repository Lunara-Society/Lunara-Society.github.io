#!/usr/bin/env node
/* Signs what is waiting for a signature, in one run:

     LUNARA_SIGNING_KEY=/secure/path/lunara-signing-key.json node tools/finish-registry-move.mjs

   1. Finishes moving the registry off Base44. Every page already calls
      lunara-registry on Lunara's own Supabase project; these signed files
      still name the old Base44 address, because changing them needs the
      private key, which is never in this repository:

        registry-protocol.js → corpus/registry-protocol.json (rebuilt)
        corpus/index.json
        .well-known/lunara-verify.json

   2. Signs mcp/core.mjs as it now stands: already moved to lunara-registry,
      with the passport scan and the Agent Network tools (version 1.1.0).

   Then commit the result (the deploy check passes) and redeploy the
   lunara-mcp function (mcp/DEPLOYING.md). */

import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

if (!process.env.LUNARA_SIGNING_KEY) {
  console.error('Set LUNARA_SIGNING_KEY to the path of the private key file first.');
  process.exit(2);
}
const OLD = 'https://base44.app/api/apps/6a46cea2687503d2d6d4ecd1/functions';
const NEW = 'https://luiqtimzcsoqnizybifs.supabase.co/functions/v1/lunara-registry';
for (const f of ['registry-protocol.js', 'corpus/index.json', 'mcp/core.mjs', '.well-known/lunara-verify.json']) {
  const s = readFileSync(f, 'utf8');
  if (s.includes(OLD)) { writeFileSync(f, s.split(OLD).join(NEW)); console.log('updated', f); }
}
execFileSync('node', ['tools/build-registry-protocol.mjs'], { stdio: 'inherit' });
execFileSync('node', ['tools/sign-assertions.mjs'], { stdio: 'inherit', env: process.env });
execFileSync('node', ['tools/verify-signatures.mjs'], { stdio: 'inherit' });
console.log('\nDone. Commit, push, and redeploy lunara-mcp (mcp/DEPLOYING.md).');
