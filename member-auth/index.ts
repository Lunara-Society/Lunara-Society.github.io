/* ═══════════════════════════════════════════════════════════════════
   LUNARA MEMBER AUTH — Supabase Edge Function
   ═══════════════════════════════════════════════════════════════════

   Everything of consequence lives in auth-core.mjs, which is plain
   JavaScript and is what the test suite runs. This file is only the
   two things that cannot be tested off-platform: where the members
   are kept, and where the secret comes from.

   Deployed with verify_jwt disabled, which is correct and not an
   oversight. This function is how a person obtains a token in the
   first place; demanding one to reach it would be a closed loop.
   It authenticates its callers itself — Google signatures, PBKDF2
   passwords, HMAC sessions — and the table it reads is sealed behind
   row level security with no policies, so the key in the page cannot
   reach it.
   ═══════════════════════════════════════════════════════════════════ */

// @ts-nocheck — auth-core.mjs is deliberately plain JS, shared with Node.
import { handleAuth, withCors } from './auth-core.mjs';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const REST = `${SUPABASE_URL}/rest/v1/members`;

const headers = {
  apikey: SERVICE_KEY,
  authorization: `Bearer ${SERVICE_KEY}`,
  'content-type': 'application/json'
};

async function rest(path: string, init: RequestInit = {}) {
  const res = await fetch(REST + path, {
    ...init,
    headers: { ...headers, ...(init.headers || {}) }
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`members ${init.method || 'GET'} ${res.status}: ${text}`);
  }
  return res.status === 204 ? null : res.json();
}

const one = (rows: unknown) => (Array.isArray(rows) && rows.length ? rows[0] : null);

const store = {
  getByEmail: (email: string) =>
    rest(`?email=eq.${encodeURIComponent(email)}&limit=1`).then(one),

  getById: (lunaraId: string) =>
    rest(`?lunara_id=eq.${encodeURIComponent(lunaraId)}&limit=1`).then(one),

  create: (member: Record<string, unknown>) =>
    rest('', {
      method: 'POST',
      headers: { prefer: 'return=representation' },
      body: JSON.stringify(member)
    }).then(one),

  update: (email: string, patch: Record<string, unknown>) =>
    rest(`?email=eq.${encodeURIComponent(email)}`, {
      method: 'PATCH',
      headers: { prefer: 'return=representation' },
      body: JSON.stringify(patch)
    }).then(one)
};

/* The signing key. If LUNARA_SESSION_SECRET is set it wins; otherwise
   one is derived from the service role key, which is already a high
   entropy secret that exists here and nowhere a browser can see.
   HKDF with a label keeps it a separate key rather than a second use
   of the same one, and a session token reveals nothing about either.
   Rotating the service key invalidates every session, which is the
   behaviour you would want anyway. */
async function sessionSecret(): Promise<string> {
  const explicit = Deno.env.get('LUNARA_SESSION_SECRET');
  if (explicit) return explicit;
  if (!SERVICE_KEY) throw new Error('no service role key and no LUNARA_SESSION_SECRET');
  const base = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(SERVICE_KEY), 'HKDF', false, ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits({
    name: 'HKDF',
    hash: 'SHA-256',
    salt: new TextEncoder().encode('lunara.members.v1'),
    info: new TextEncoder().encode('session-hmac')
  }, base, 256);
  return [...new Uint8Array(bits)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

let cachedSecret: string | null = null;

Deno.serve((req: Request) =>
  withCors(req, async () => {
    if (!SUPABASE_URL || !SERVICE_KEY) {
      console.error('SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing');
      return new Response(
        JSON.stringify({ success: false, error: 'Member storage is not configured.' }),
        { status: 500, headers: { 'content-type': 'application/json' } }
      );
    }
    cachedSecret ??= await sessionSecret();
    return handleAuth(req, new URL(req.url), {
      store,
      sessionSecret: cachedSecret,
      googleClientId: Deno.env.get('GOOGLE_CLIENT_ID') || undefined
    });
  })
);
