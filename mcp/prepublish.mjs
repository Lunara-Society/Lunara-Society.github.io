#!/usr/bin/env node
/* Runs on `npm publish`, before anything leaves this machine.

   The install command for this package sat on the website, in llms.txt
   and in the corpus index for weeks while the package did not exist:
   `npx @lunara/mcp` answered 404 to everyone who followed our own
   instructions. That is the same failure as a form posting into nothing,
   aimed at the audience we most want to reach.

   So publishing is gated on the thing actually working. This boots the
   server exactly as a client would, against the live authority, and
   refuses to publish if the answer is wrong. */

import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(HERE, 'package.json'), 'utf8'));
const AUTHORITY = process.env.LUNARA_AUTHORITY || 'https://lunarasociety.com';

const fail = (m) => { console.error(`publish blocked: ${m}`); process.exit(1); };

for (const f of pkg.files) {
  try { readFileSync(join(HERE, f)); } catch { fail(`${f} is listed in package.json files but is not here`); }
}

const child = spawn(process.execPath, [join(HERE, 'server.mjs')], {
  stdio: ['pipe', 'pipe', 'inherit'],
  env: { ...process.env, LUNARA_AUTHORITY: AUTHORITY }
});

let buf = '';
const waiting = new Map();
child.stdout.on('data', (d) => {
  buf += d;
  let i;
  while ((i = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
    if (!line) continue;
    const msg = JSON.parse(line);
    if (waiting.has(msg.id)) { waiting.get(msg.id)(msg); waiting.delete(msg.id); }
  }
});
let seq = 0;
const rpc = (method, params) => new Promise((res, rej) => {
  const id = ++seq;
  waiting.set(id, res);
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
  setTimeout(() => rej(new Error(`${method} did not answer within 20s`)), 20000);
});

try {
  const init = await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'prepublish', version: pkg.version } });
  if (init.result?.serverInfo?.version !== pkg.version) {
    fail(`server reports version ${init.result?.serverInfo?.version}, package.json says ${pkg.version}`);
  }

  const tools = (await rpc('tools/list')).result?.tools ?? [];
  if (tools.length !== 5) fail(`expected five tools, got ${tools.length}`);

  const obligations = await rpc('tools/call', { name: 'lunara_obligations', arguments: {} });
  const count = obligations.result?.structuredContent?.count ?? 0;
  if (obligations.result?.isError || count < 1) {
    fail(`the corpus at ${AUTHORITY} did not answer: ${obligations.result?.content?.[0]?.text ?? 'no content'}`);
  }

  const integrity = obligations.result?.structuredContent?.evidence?.integrity?.state;
  if (integrity !== 'verified') fail(`the corpus signature did not verify (${integrity}) — do not ship a client that cannot check it`);

  console.log(`prepublish ok — ${count} obligations, ${tools.length} tools, signature verified against ${AUTHORITY}`);
  child.kill();
  process.exit(0);
} catch (e) {
  child.kill();
  fail(e.message);
}
