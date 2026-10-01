/* ═══════════════════════════════════════════════════════════════════
   MAZE — Supabase Edge Function
   ═══════════════════════════════════════════════════════════════════

   Everything of consequence lives in maze-core.mjs, which the tests run
   under Node. This file supplies the tables, the model call and alerts.

   A pg_cron job calls POST /sweep every five minutes with the key kept
   in maze_config, so the hunt never sleeps. Deployed with verify_jwt
   off: the public routes are read-only, the sweep checks its own key,
   and the desk checks the owner's lunara-auth session.

   Secrets (Supabase → Edge Functions → Secrets), all shared with
   lunara-lens:
     ANTHROPIC_API_KEY or GOOGLE_VERTEX_SERVICE_ACCOUNT   the model
     MAZE_MODEL            optional; default claude-sonnet-5
     MAZE_DAILY_USD        optional; daily spending cap, default 3
     MAZE_ALERT_SEVERITY   optional; alert from this severity, default 4
     RESEND_API_KEY        optional; emails each alert to the owner
     MAZE_ALERT_FROM         sender for those emails, on a domain
                             verified in Resend
     LENS_OWNER_EMAILS     optional; default lunarasociety@gmail.com
   ═══════════════════════════════════════════════════════════════════ */

// @ts-nocheck — maze-core.mjs is deliberately plain JS, shared with Node.
import Anthropic from 'npm:@anthropic-ai/sdk';
import { handleMaze, withCors, json } from './maze-core.mjs';

const env = Deno.env.toObject();
const REST = `${env.SUPABASE_URL}/rest/v1`;
const H = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, 'content-type': 'application/json' };

async function rest(path: string, init: RequestInit = {}) {
  const res = await fetch(REST + path, { ...init, headers: { ...H, ...(init.headers || {}) } });
  if (!res.ok) throw new Error(`${init.method || 'GET'} ${path.split('?')[0]} ${res.status}: ${await res.text()}`);
  const t = await res.text();
  return t ? JSON.parse(t) : null;
}
const q = encodeURIComponent;
const one = (r) => (Array.isArray(r) && r.length ? r[0] : null);
const inList = (xs: string[]) => `in.(${xs.map((x) => `"${x}"`).join(',')})`;
const CASE_COLS = 'id,status,severity,category,title,target,summary,next_step,notes,manipulation,evidence,public,outcome,captured_at,file,stamp,created_at,updated_at';

const db = {
  sourceState: async () => Object.fromEntries((await rest('/maze_sources?select=*') || []).map((s) => [s.id, s])),
  markSource: (id: string, p) => rest('/maze_sources?on_conflict=id', { method: 'POST', headers: { prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ id, ...p }) }),
  seenAmong: async (hashes: string[]) => {
    const out = new Set();
    for (let i = 0; i < hashes.length; i += 150) {
      const rows = await rest(`/maze_seen?select=hash&hash=${inList(hashes.slice(i, i + 150))}`);
      for (const r of rows || []) out.add(r.hash);
    }
    return out;
  },
  markSeen: async (rows) => {
    for (let i = 0; i < rows.length; i += 200) {
      await rest('/maze_seen?on_conflict=hash', { method: 'POST', headers: { prefer: 'resolution=ignore-duplicates,return=minimal' }, body: JSON.stringify(rows.slice(i, i + 200)) });
    }
  },
  unmarkSeen: async (hashes: string[]) => {
    for (let i = 0; i < hashes.length; i += 150) await rest(`/maze_seen?hash=${inList(hashes.slice(i, i + 150))}`, { method: 'DELETE' });
  },
  untriagedTips: () => rest('/maze_tips?verdict=is.null&order=created_at.asc&limit=24'),
  markTip: (id: number, verdict: string) => rest(`/maze_tips?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify({ verdict }) }),
  createTip: (row) => rest('/maze_tips', { method: 'POST', headers: { prefer: 'return=minimal' }, body: JSON.stringify(row) }),
  tipsFrom: async (ipHash: string) => (await rest(`/maze_tips?select=id&ip_hash=eq.${q(ipHash)}&created_at=gte.${q(new Date(Date.now() - 3600e3).toISOString())}`) || []).length,
  spentToday: async () => Number(await rest('/rpc/maze_spent_today', { method: 'POST', body: '{}' })),
  openCases: () => rest('/maze_cases?select=id,title,target,category,severity,manipulation&status=in.(watching,hunting,reported)&order=updated_at.desc&limit=60'),
  createCase: (row) => rest('/maze_cases', { method: 'POST', headers: { prefer: 'return=minimal' }, body: JSON.stringify(row) }),
  addEvidence: (id: string, ev, p) => rest('/rpc/maze_add_evidence', { method: 'POST', body: JSON.stringify({ p_id: id, p_ev: ev, p_severity: p.severity, p_manipulation: !!p.manipulation }) }),
  createAlert: (row) => rest('/maze_alerts', { method: 'POST', headers: { prefer: 'return=representation' }, body: JSON.stringify(row) }).then(one),
  markAlertSent: (id: number) => rest(`/maze_alerts?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify({ sent: true }) }),
  logRun: (r) => rest('/maze_runs', { method: 'POST', headers: { prefer: 'return=minimal' }, body: JSON.stringify({ ...r, errors: r.errors }) }),
  lastRun: () => rest('/maze_runs?select=at&order=at.desc&limit=1').then(one),
  recentRuns: () => rest('/maze_runs?select=*&order=at.desc&limit=30'),
  recentAlerts: () => rest('/maze_alerts?select=*&order=created_at.desc&limit=40'),
  readAlerts: () => rest('/maze_alerts?read_at=is.null', { method: 'PATCH', body: JSON.stringify({ read_at: new Date().toISOString() }) }),
  allCases: () => rest(`/maze_cases?select=${CASE_COLS}&order=updated_at.desc&limit=200`),
  publicCases: () => rest(`/maze_cases?select=${CASE_COLS}&public=eq.true&order=updated_at.desc&limit=200`),
  getCase: (id: string) => rest(`/maze_cases?select=${CASE_COLS}&id=eq.${q(id)}&limit=1`).then(one),
  updateCase: (id: string, p) => rest(`/maze_cases?id=eq.${q(id)}`, { method: 'PATCH', body: JSON.stringify({ ...p, updated_at: new Date().toISOString() }) }),
  getConfig: (key: string) => rest(`/maze_config?select=value&key=eq.${q(key)}`).then(one).then((r) => (r ? r.value : null)),
  setConfigOnce: (key: string, value: string) => rest('/maze_config?on_conflict=key', { method: 'POST', headers: { prefer: 'resolution=ignore-duplicates,return=representation' }, body: JSON.stringify({ key, value }) }).then((r) => Array.isArray(r) && r.length === 1)
};

async function whoIs(token: unknown) {
  if (typeof token !== 'string' || token.length < 20) return null;
  const res = await fetch(`${env.SUPABASE_URL}/functions/v1/lunara-auth/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ session_token: token }) });
  if (!res.ok) return null;
  const s = await res.json();
  return s && s.email ? s : null;
}

// The model: Claude on Google Cloud Vertex AI when its key is set, as
// in lunara-lens, otherwise Anthropic's API.
const b64url = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
let gTok = { v: '', until: 0 };
async function vertexToken(sa) {
  if (Date.now() < gTok.until) return gTok.v;
  const now = Math.floor(Date.now() / 1000), te = new TextEncoder();
  const part = (o: unknown) => b64url(te.encode(JSON.stringify(o)));
  const unsigned = part({ alg: 'RS256', typ: 'JWT' }) + '.' + part({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/cloud-platform', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 });
  const der = Uint8Array.from(atob(String(sa.private_key).replace(/-----[^-]+-----/g, '').replace(/\s+/g, '')), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, te.encode(unsigned)));
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=' + unsigned + '.' + b64url(sig) });
  if (!r.ok) throw new Error('google token ' + r.status);
  const t = await r.json();
  gTok = { v: t.access_token, until: Date.now() + (t.expires_in - 120) * 1000 };
  return gTok.v;
}
const vertexSA = (() => { try { return env.GOOGLE_VERTEX_SERVICE_ACCOUNT ? JSON.parse(env.GOOGLE_VERTEX_SERVICE_ACCOUNT) : null; } catch { return null; } })();
const anthropic = vertexSA
  ? new (await import('npm:@anthropic-ai/vertex-sdk')).AnthropicVertex({
      region: env.VERTEX_REGION || 'global', projectId: vertexSA.project_id,
      authClient: { projectId: vertexSA.project_id, getRequestHeaders: async () => new Headers({ authorization: 'Bearer ' + await vertexToken(vertexSA) }) }
    })
  : env.ANTHROPIC_API_KEY ? new Anthropic({ apiKey: env.ANTHROPIC_API_KEY }) : null;

async function callModel({ model, system, max_tokens, effort, schema, content }) {
  const res = await anthropic.messages.create({
    model, max_tokens,
    // Maze's instructions are the same on every call: cached, they cost a
    // tenth after the first sweep in five minutes.
    system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
    output_config: { effort, format: { type: 'json_schema', schema } },
    messages: [{ role: 'user', content }]
  });
  const u = res.usage || {};
  const usage = { input_tokens: u.input_tokens || 0, output_tokens: u.output_tokens || 0, cache_write_tokens: u.cache_creation_input_tokens || 0, cache_read_tokens: u.cache_read_input_tokens || 0 };
  if (res.stop_reason === 'refusal') return { ...usage, result: null };
  const text = res.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  let result = null;
  try { result = JSON.parse(text); } catch { /* cut off */ }
  return { ...usage, result };
}

async function notify({ case_id, severity, message, url }) {
  if (!env.RESEND_API_KEY || !env.MAZE_ALERT_FROM) return false;
  const to = String(env.LENS_OWNER_EMAILS || 'lunarasociety@gmail.com').split(/[,\s]+/).filter(Boolean);
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST', headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from: env.MAZE_ALERT_FROM, to, subject: `Maze · severity ${severity} · ${case_id}`, text: `${message}\n\nOpen the desk: ${url}\n\n— Maze, Lunara Society` })
  });
  return r.ok;
}

const deps = {
  env, db, whoIs, callModel, notify, aiOn: !!anthropic,
  model: () => env.MAZE_MODEL || 'claude-sonnet-5',
  fetch: (url: string, init: RequestInit) => fetch(url, { ...init, signal: AbortSignal.timeout(12000) })
};

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('origin');
  if (req.method === 'OPTIONS') return withCors(new Response(null, { status: 204 }), origin);
  try {
    return withCors(await handleMaze(req, deps), origin);
  } catch (e) {
    console.error(e);
    return withCors(json({ error: 'Something went wrong on our side. Try again.' }, 500), origin);
  }
});
