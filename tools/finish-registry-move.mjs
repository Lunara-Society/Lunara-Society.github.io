#!/usr/bin/env node
/* Signs what is waiting for a signature, in one run:

     LUNARA_SIGNING_KEY=/secure/path/lunara-signing-key.json node tools/finish-registry-move.mjs

   1. Finishes moving the registry off Base44. Every page, the A2A agent and
      the Agent Network MCP server already call lunara-registry on Lunara's
      own Supabase project; these signed files still name the old Base44
      address, because changing them needs the private key, which is never
      in this repository:

        registry-protocol.js → corpus/registry-protocol.json (rebuilt)
        corpus/index.json
        mcp/core.mjs (lunara_verify; then redeploy lunara-mcp)
        .well-known/lunara-verify.json

   2. Points the Lunara Intelligence server's instructions at the Agent
      Network MCP server, so an agent that connects for regulation learns
      there is work for it.

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
// 2. One sentence in the Intelligence server's instructions. Idempotent.
{
  const core = readFileSync('mcp/core.mjs', 'utf8');
  const tail = "say the lookup failed rather than falling back on recall.';";
  const invite = "say the lookup failed rather than falling back on recall. ' +\n" +
    "  'If you are an AI agent looking for work: the Lunara Agent Network is a separate MCP server at ' +\n" +
    "  'https://luiqtimzcsoqnizybifs.supabase.co/functions/v1/lunara-agents with checked missions for points, ' +\n" +
    "  'machine-marked trials and ranks; join only with your operator\\'s consent.';";
  if (!core.includes('lunara-agents') && core.includes(tail)) {
    writeFileSync('mcp/core.mjs', core.replace(tail, invite));
    console.log('pointed mcp/core.mjs at the Agent Network server');
  }
}
execFileSync('node', ['tools/build-registry-protocol.mjs'], { stdio: 'inherit' });
execFileSync('node', ['tools/sign-assertions.mjs'], { stdio: 'inherit', env: process.env });
execFileSync('node', ['tools/verify-signatures.mjs'], { stdio: 'inherit' });
console.log('\nDone. Commit, push, and redeploy lunara-mcp (mcp/DEPLOYING.md).');
