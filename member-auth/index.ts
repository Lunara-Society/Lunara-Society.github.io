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
    }).then(one),

  /* Private offers. Read with the service key and never exposed to the
     browser: the table has row level security on with no policies, so
     the anon key in the page cannot see one offer, never mind somebody
     else's. The newest live row for this member wins. */
  getOffer: async (lunaraId: string) => {
    const rows = await fetch(
      `${SUPABASE_URL}/rest/v1/member_offers` +
      `?lunara_id=eq.${encodeURIComponent(lunaraId)}` +
      `&order=created_at.desc&limit=1`,
      { headers }
    ).then((r) => (r.ok ? r.json() : Promise.reject(new Error('offers ' + r.status))));
    return one(rows);
  },

  /* Conditional on redeemed_at still being null, so two clicks a
     hundred milliseconds apart cannot both succeed. The database
     decides, not the order two requests happen to arrive in. */
  redeemOffer: async (id: string, txn: string) => {
    const rows = await fetch(
      `${SUPABASE_URL}/rest/v1/member_offers?id=eq.${encodeURIComponent(id)}&redeemed_at=is.null`,
      {
        method: 'PATCH',
        headers: { ...headers, prefer: 'return=representation' },
        body: JSON.stringify({ redeemed_at: new Date().toISOString(), redeemed_txn: txn })
      }
    ).then((r) => (r.ok ? r.json() : Promise.reject(new Error('redeem ' + r.status))));
    const row = one(rows);
    if (!row) throw new Error('offer was already redeemed');
    return row;
  },

  /* The avatar sink. Uploaded with the service key, which is why the
     bucket has no insert policy at all: the anon key in the page
     cannot write here, only this function can. upsert is off — every
     upload gets a fresh timestamped path, so a stale CDN copy can
     never be served in place of a new photo. */
  putAvatar: async (path: string, bytes: Uint8Array, contentType: string) => {
    const res = await fetch(
      `${SUPABASE_URL}/storage/v1/object/member-avatars/${path}`,
      {
        method: 'POST',
        headers: {
          apikey: SERVICE_KEY!,
          authorization: `Bearer ${SERVICE_KEY}`,
          'content-type': contentType,
          'cache-control': 'public, max-age=31536000, immutable',
          'x-upsert': 'false'
        },
        body: bytes
      }
    );
    if (!res.ok) throw new Error(`avatar upload ${res.status}: ${await res.text()}`);
    return `${SUPABASE_URL}/storage/v1/object/public/member-avatars/${path}`;
  }
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
