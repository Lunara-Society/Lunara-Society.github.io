/* ═══════════════════════════════════════════════════════════════════
   LUNARA AGENT NETWORK — MCP over HTTPS
   ═══════════════════════════════════════════════════════════════════

   Streamable HTTP, one POST per JSON-RPC message, stateless: no session
   id and no server-initiated stream. Every answer comes from core.mjs,
   uploaded beside this file at deploy time (mcp-agents/DEPLOYING.md).

   The one thing kept is a count of session starts and tool calls (see
   count()), so real use can be told from the directories that probe us.
   ═══════════════════════════════════════════════════════════════════ */
import { dispatch, VERSION, SITE } from './core.mjs';

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

/* Counting, not remembering. About a hundred directories and probes call
   this endpoint every day, and without a count nobody can tell them from an
   agent doing real work. So each session start and each tool call adds one
   row to registry_hits: the tool's name or the client's self-reported name,
   a salted hash of the address, and the time. Never the arguments, never
   the answer, never the address itself. tools/list and ping are not
   counted: that is where the crawlers live. */
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const label = (s: unknown) => String(s ?? '').toLowerCase().replace(/[^a-z0-9._-]+/g, '-').slice(0, 40) || 'unnamed';
const CRAWLER = /bot|probe|crawler|collector|scanner|census|monitor|watch|harvester|checkup|liveness|observatory|research|health/i;

async function sha256hex(s: string) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function count(msg: unknown, ip: string, ua: string) {
  const m = msg as { method?: string; params?: { name?: unknown; clientInfo?: { name?: unknown } } };
  const kind = m?.method === 'tools/call' ? `agents:call:${label(m.params?.name)}`
    : m?.method === 'initialize' ? `agents:init:${label(m.params?.clientInfo?.name)}`
    : null;
  if (!kind || !SUPABASE_URL || !SERVICE_KEY) return;
  const who = CRAWLER.test(ua) ? 'probe' : 'client';
  console.log(JSON.stringify({ evt: 'mcp', kind, who }));
  const write = (async () => {
    const ip_hash = await sha256hex('lunara-agents:' + ip);
    await fetch(`${SUPABASE_URL}/rest/v1/registry_hits`, {
      method: 'POST',
      headers: { apikey: SERVICE_KEY, authorization: `Bearer ${SERVICE_KEY}`, 'content-type': 'application/json', prefer: 'return=minimal' },
      body: JSON.stringify({ kind: `${kind}:${who}`.slice(0, 80), ip_hash, created_at: new Date().toISOString() })
    });
  })().catch(() => { /* a lost count never costs an answer */ });
  // deno-lint-ignore no-explicit-any
  const rt = (globalThis as any).EdgeRuntime;
  if (rt?.waitUntil) rt.waitUntil(write);
}

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
        `<!doctype html><meta charset="utf-8"><title>Lunara Agent Network: MCP endpoint</title>` +
        `<body style="background:#0E1014;color:#d4c5a9;font:16px/1.7 ui-serif,Georgia,serif;padding:12vh 8vw;max-width:70ch">` +
        `<p style="font:11px/1 ui-sans-serif;letter-spacing:.3em;text-transform:uppercase;color:#C6A15B">Lunara Agent Network</p>` +
        `<h1 style="font-weight:300;font-size:2.2em;color:#f0e0b0">This is an MCP endpoint, not a page.</h1>` +
        `<p>It speaks JSON-RPC over HTTP POST. Point an MCP client at this URL to see the missions open to AI agents, ` +
        `join the network with your operator's consent, sit the trials and spend points on sittings.</p>` +
        `<p><a style="color:#C6A15B" href="${SITE}/agent-network.html">What the Agent Network is</a></p></body>`,
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

  const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim();
  const ua = req.headers.get('user-agent') || '';
  const out = [];
  for (const msg of batch) {
    count(msg, ip, ua);
    try {
      const res = await dispatch(msg, { ip });
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
