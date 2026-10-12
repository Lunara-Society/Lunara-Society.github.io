/* ═══════════════════════════════════════════════════════════════════
   EVIDENCE — what a record's verification actually establishes
   ═══════════════════════════════════════════════════════════════════

   Pure functions over bytes, keys and a clock, shared by the Evidence
   Registry (evidence-registry.html) and the tests (tools/test-os.mjs),
   which run them under Node against the repository's real assertions.

   Every result carries its state, each step it took, what the check
   establishes and what it does not. The states:

     verified      every step passed under the named method
     partial       the signature holds but something else could not be
                   checked (the subject could not be fetched)
     failed        a signature or a digest did not match: do not rely
     expired       the signature holds but the assertion's term is over
     revoked       the signature holds but the key has been revoked
     unavailable   the check could not be run here (no Ed25519 in this
                   browser, a key that is not published, a fetch failure)
     unverified    not checked yet

   A hash shows that bytes match a digest; it does not show that what
   the bytes say is true. A signature shows that a key signed a
   statement; it does not show who holds the key or that they had any
   authority. The results say both, every time.
   ═══════════════════════════════════════════════════════════════════ */

const enc = new TextEncoder();
const subtle = () => globalThis.crypto.subtle;

/* RFC 8785 canonical JSON, the form the assertions are signed over. */
export function canon(v) {
  if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']';
  if (v && typeof v === 'object') return '{' + Object.keys(v).filter((k) => v[k] !== undefined).sort().map((k) => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}';
  return JSON.stringify(v);
}
export const b64u = (bytes) => {
  let s = ''; const b = new Uint8Array(bytes);
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
export const unb64u = (s) => Uint8Array.from(atob(String(s).replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((String(s).length + 3) % 4)), (c) => c.charCodeAt(0));

async function ed25519(jwk, sig, data) {
  const key = await subtle().importKey('jwk', { kty: jwk.kty, crv: jwk.crv, x: jwk.x, key_ops: ['verify'] }, { name: 'Ed25519' }, false, ['verify']);
  return subtle().verify({ name: 'Ed25519' }, key, sig, data);
}

export const ASSERTION_LIMITS = [
  'The digest shows that the document you were served is byte for byte the one that was signed. It does not show that what the document says is true.',
  'The signature shows that the holder of this key signed this statement. It does not show who holds the key: that rests on the key being published at lunarasociety.com over HTTPS.',
  'The key is marked "development" in the key document: generated in a build container, not on hardware in anyone\'s custody. Enough to tell copies apart; not enough to rest a legal conclusion on.',
  'The issue time is the signer\'s own clock. No independent timestamping authority has countersigned it.'
];

/* One detached assertion: the envelope, the published keys, the subject
   as served (bytes, or null when it could not be fetched), and now. */
export async function verifyAssertion(envelope, keysDoc, subjectBytes, now = Date.now()) {
  const steps = [];
  const out = (state, summary) => ({ state, summary, steps, limits: ASSERTION_LIMITS, checked_at: new Date(now).toISOString() });
  const a = envelope && envelope.assertion;
  if (!a || !envelope.signature) { steps.push({ name: 'Read the assertion', ok: false, detail: 'not an assertion envelope' }); return out('failed', 'This is not a Lunara assertion envelope.'); }
  steps.push({ name: 'Read the assertion', ok: true, detail: `${a.type} · ${a.subject} · issued ${a.issued_at}` });

  const jwk = ((keysDoc && keysDoc.keys) || []).find((k) => k.kid === a.key_id);
  if (!jwk) { steps.push({ name: 'Find the signing key', ok: false, detail: `key ${a.key_id} is not in the key document` }); return out('unavailable', 'The key that signed this is not published, so the signature cannot be checked.'); }
  steps.push({ name: 'Find the signing key', ok: true, detail: `${jwk.kid} · ${jwk.crv} · status ${jwk.status}${jwk.revoked ? ' · REVOKED ' + jwk.revoked : ''}` });

  let sigOk;
  try { sigOk = await ed25519(jwk, unb64u(envelope.signature.value), enc.encode(canon(a))); }
  catch { steps.push({ name: 'Verify the Ed25519 signature', ok: null, detail: 'this browser has no Ed25519 in WebCrypto' }); return out('unavailable', 'This browser cannot check Ed25519 signatures. The terminal command on the "How to verify us" page performs the same check.'); }
  steps.push({ name: 'Verify the Ed25519 signature', ok: sigOk, detail: sigOk ? 'valid over the canonical statement' : 'INVALID: the statement is not what was signed' });
  if (!sigOk) return out('failed', 'The signature does not match the statement. Do not rely on this assertion.');

  let digestOk = null;
  if (subjectBytes == null) steps.push({ name: 'Hash the document as served', ok: null, detail: 'the document could not be fetched' });
  else {
    const digest = b64u(await subtle().digest('SHA-256', subjectBytes));
    digestOk = digest === a.claims.digest.value;
    steps.push({ name: 'Hash the document as served', ok: digestOk, detail: digestOk ? `SHA-256 ${digest} matches` : `SHA-256 ${digest}, but the assertion covers ${a.claims.digest.value}` });
    if (!digestOk) return out('failed', 'The document served now is not the document that was signed. Do not rely on this copy.');
  }

  const revoked = jwk.revoked && Date.parse(jwk.revoked) <= now;
  steps.push({ name: 'Check the key is not revoked', ok: !revoked, detail: revoked ? `revoked ${jwk.revoked}` : 'not revoked' });
  if (revoked) return out('revoked', `The signature is genuine, but its key was revoked on ${String(jwk.revoked).slice(0, 10)}.`);
  const expired = Date.parse(a.expires_at) <= now || (jwk.not_after && Date.parse(jwk.not_after) <= now);
  steps.push({ name: 'Check the term', ok: !expired, detail: `valid until ${a.expires_at}` });
  if (expired) return out('expired', `The signature is genuine, but the assertion's term ended on ${String(a.expires_at).slice(0, 10)}.`);
  if (digestOk === null) return out('partial', 'The signature is genuine, but the document itself could not be fetched to compare its hash.');
  return out('verified', 'Verified under Ed25519 and SHA-256: this is the document Lunara Society signed, unaltered, within its term.');
}

export const PASSPORT_LIMITS = [
  'The signature shows that Lunara\'s passport key signed these claims. It does not show that the agent presenting the passport is the agent named in it: a passport can be copied, so the relying party must bind it to the connection.',
  'The registry status is read live from the register; the signature alone cannot tell you whether the credential was revoked after issue.'
];

/* An agent passport: base64url(payload) "." base64url(Ed25519 signature
   over the first part). jwks is the list agentPassportKeys returns. */
export async function verifyPassport(token, jwks, now = Date.now()) {
  const steps = [];
  const out = (state, summary, payload) => ({ state, summary, steps, payload: payload || null, limits: PASSPORT_LIMITS, checked_at: new Date(now).toISOString() });
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token.trim())) { steps.push({ name: 'Read the passport', ok: false, detail: 'two base64url parts expected' }); return out('failed', 'That is not a Lunara agent passport.'); }
  const [head, sig] = token.trim().split('.');
  let p;
  try { p = JSON.parse(new TextDecoder().decode(unb64u(head))); } catch { steps.push({ name: 'Read the passport', ok: false, detail: 'the payload is not JSON' }); return out('failed', 'That is not a Lunara agent passport.'); }
  if (p.typ !== 'lunara-agent-passport') { steps.push({ name: 'Read the passport', ok: false, detail: 'wrong type' }); return out('failed', 'That is not a Lunara agent passport.', p); }
  steps.push({ name: 'Read the passport', ok: true, detail: `${p.agent} · operated by ${p.operator} · ${p.sub}` });
  const jwk = (jwks || []).find((k) => k.kid === p.kid);
  if (!jwk) { steps.push({ name: 'Find the signing key', ok: false, detail: `key ${p.kid} is not published` }); return out('unavailable', 'The key that signed this passport is not published.', p); }
  steps.push({ name: 'Find the signing key', ok: true, detail: jwk.kid });
  let ok;
  try { ok = await ed25519(jwk, unb64u(sig), enc.encode(head)); }
  catch { steps.push({ name: 'Verify the Ed25519 signature', ok: null, detail: 'this browser has no Ed25519 in WebCrypto' }); return out('unavailable', 'This browser cannot check Ed25519 signatures.', p); }
  steps.push({ name: 'Verify the Ed25519 signature', ok, detail: ok ? 'valid' : 'INVALID' });
  if (!ok) return out('failed', 'The signature does not match. Do not rely on this passport.', p);
  const exp = (p.exp || 0) * 1000;
  steps.push({ name: 'Check the term', ok: exp > now, detail: `valid until ${new Date(exp).toISOString()}` });
  if (exp <= now) return out('expired', 'The signature is genuine, but the passport has expired.', p);
  return out('verified', 'Signature verified in this browser. Check the registry status below for revocation.', p);
}

export const STATE_TEXT = {
  verified: 'Verified', partial: 'Partially verified', failed: 'Verification failed', expired: 'Expired',
  revoked: 'Revoked', unavailable: 'Verification unavailable', unverified: 'Unverified'
};
