/* ═══════════════════════════════════════════════════════════════════
   LUNARA INTELLIGENCE — MCP over HTTPS
   ═══════════════════════════════════════════════════════════════════

   The second door. `npx @lunara/mcp` needs a local process, which rules
   out every client that runs somewhere we do not — hosted assistants,
   connector directories, anything speaking to us from a server rather
   than from a laptop. This is the same server for those clients:
   Streamable HTTP, one POST per JSON-RPC message.

   It owns the transport and nothing else. Every answer comes from
   core.mjs, byte for byte the file the npm package runs, because two
   implementations of one corpus is how an institution ends up telling
   two people two different dates.

   Stateless on purpose. No session id, no server-initiated stream, no
   subscription: every request carries everything needed to answer it.
   There is nothing here to log a client into and nothing to remember
   about them — reading this corpus is free and unauthenticated, and a
   session store would quietly make that untrue.
   ═══════════════════════════════════════════════════════════════════ */

/* Imported over the network, from the canonical origin, rather than
   vendored beside this file. Two copies of a corpus reader is how the two
   doors end up disagreeing, and a copy uploaded by hand is a copy nobody
   re-uploads. The module this fetches is itself published with a detached
   Ed25519 assertion, so what runs here is checkable from outside:

     https://lunarasociety.com/mcp/core.assertion.json

   The cost is a boot-time dependency on the same origin that serves the
   corpus — which this server is useless without anyway. */
import { dispatch, VERSION, AUTHORITY } from 'https://lunarasociety.com/mcp/core.mjs';

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, GET, OPTIONS',
  'access-control-allow-headers': 'content-type, authorization, accept, mcp-session-id, mcp-protocol-version, last-event-id',
  'access-control-expose-headers': 'mcp-session-id, mcp-protocol-version',
  'access-control-max-age': '86400'
};

const json = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...CORS, ...extra }
  });

const rpcError = (code: number, message: string, status: number) =>
  json({ jsonrpc: '2.0', id: null, error: { code, message } }, status);

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

  /* A GET is either a client asking to open the server-initiated stream —
     which this server does not offer — or a person pasting the URL into a
     browser. The first gets the 405 the specification calls for; the
     second gets told what this is, because a bare 405 teaches nobody
     anything. */
  if (req.method === 'GET') {
    const wantsHtml = (req.headers.get('accept') || '').includes('text/html');
    if (wantsHtml) {
      return new Response(
        `<!doctype html><meta charset="utf-8"><title>Lunara Intelligence — MCP endpoint</title>` +
        `<body style="background:#000;color:#d4c5a9;font:16px/1.7 ui-serif,Georgia,serif;padding:12vh 8vw;max-width:70ch">` +
        `<p style="font:11px/1 ui-sans-serif;letter-spacing:.3em;text-transform:uppercase;color:#C4A46B">Lunara Intelligence</p>` +
        `<h1 style="font-weight:300;font-size:2.2em;color:#f0e0b0">This is an MCP endpoint, not a page.</h1>` +
        `<p>It speaks JSON-RPC over HTTP POST. Point an MCP client at this URL, or run the local server with ` +
        `<code style="color:#E2C47A">npx @lunara/mcp</code>.</p>` +
        `<p>The regulatory record it serves is at <a style="color:#C4A46B" href="${AUTHORITY}/corpus/obligations.json">${AUTHORITY}/corpus/obligations.json</a>, ` +
        `signed and independently verifiable — <a style="color:#C4A46B" href="${AUTHORITY}/signing.html">how to check it</a>.</p>` +
        `<p><a style="color:#C4A46B" href="${AUTHORITY}/mcp.html">What this server does</a></p></body>`,
        { status: 200, headers: { 'content-type': 'text/html; charset=utf-8', ...CORS } }
      );
    }
    return rpcError(-32601, 'This server does not offer a server-initiated event stream. Send JSON-RPC by POST.', 405);
  }

  if (req.method !== 'POST') return rpcError(-32601, `${req.method} is not supported. Send JSON-RPC by POST.`, 405);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return rpcError(-32700, 'Parse error', 400);
  }

  const batch = Array.isArray(body) ? body : [body];
  if (batch.length === 0) return rpcError(-32600, 'Empty batch', 400);
  if (batch.length > 32) return rpcError(-32600, 'Batch too large', 413);

  const out = [];
  for (const msg of batch) {
    try {
      const res = await dispatch(msg);
      if (res) out.push(res);
    } catch (e) {
      const id = (msg as { id?: unknown })?.id;
      if (id !== undefined && id !== null) {
        out.push({ jsonrpc: '2.0', id, error: { code: -32603, message: String((e as Error).message ?? e) } });
      }
    }
  }

  /* Notifications only: there is nothing to say back, and the
     specification is explicit that saying something anyway is wrong. */
  if (out.length === 0) return new Response(null, { status: 202, headers: CORS });

  return json(Array.isArray(body) ? out : out[0], 200, { 'mcp-protocol-version': '2025-06-18', 'x-lunara-mcp': VERSION });
});
