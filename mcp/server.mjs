#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   LUNARA INTELLIGENCE — MCP server, stdio
   ═══════════════════════════════════════════════════════════════════

   The door a local client comes through: `npx @lunara/mcp`. It owns the
   transport and nothing else. Every answer comes from core.mjs, which
   the hosted HTTPS endpoint imports unchanged — one implementation, so
   the two doors cannot drift into giving different dates.
   ═══════════════════════════════════════════════════════════════════ */

import { createInterface } from 'node:readline';
import { dispatch } from './core.mjs';

const send = (msg) => process.stdout.write(JSON.stringify(msg) + '\n');

const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });

rl.on('line', (line) => {
  const text = line.trim();
  if (!text) return;
  let msg;
  try {
    msg = JSON.parse(text);
  } catch {
    return send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });
  }
  Promise.resolve(dispatch(msg))
    .then((out) => { if (out) send(out); })
    .catch((e) => {
      if (msg.id !== undefined && msg.id !== null) {
        send({ jsonrpc: '2.0', id: msg.id, error: { code: -32603, message: e.message } });
      }
    });
});

rl.on('close', () => process.exit(0));
