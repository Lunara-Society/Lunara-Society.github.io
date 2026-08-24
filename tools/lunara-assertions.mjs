/* The signing layer.

   Everything this institution publishes for machines — the obligation
   corpus, the applicability model, the registry contract, the identity
   record — travels as JSON over HTTPS. TLS proves the bytes arrived
   unmodified from whatever server answered for the domain. It proves
   nothing once the file is copied: a mirror, a cached crawl, a vendor's
   snapshot, an AI system's training set. At that point a modified
   obligations.json with a wrong date is indistinguishable from ours, and
   the whole claim of this institution is that its dates are checkable.

   So each published document gets a detached assertion: a small signed
   statement naming the document, its SHA-256, when it was issued, and how
   long it should be trusted. The signature is Ed25519 over the RFC 8785
   canonical form of the assertion body. Verification needs the public key
   and nothing else — no call home, no network, no account.

   The envelope is deliberately not specific to documents. `type` selects
   what the assertion is about and `claims` carries it; a later assertion
   about an entity's identity, an agent's authority, or a permission's
   scope is the same envelope with a different type, verified by the same
   code. That is the point of building it now, while the only thing to
   sign is a JSON file. */

import { webcrypto as crypto } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const ISSUER = 'https://lunarasociety.com';
export const KEYS_URL = `${ISSUER}/.well-known/keys.json`;
export const ENVELOPE_VERSION = 'lunara-assertion-1';

/* The documents covered. `path` is the file in this repository, `url` is
   where it is served, `assertion` is where its detached signature goes.
   Adding a row here and re-signing is the whole cost of covering a new
   document. */
export const COVERED = [
  {
    path: 'corpus/obligations.json',
    assertion: 'corpus/obligations.assertion.json',
    statement:
      'Lunara Society published this obligation table. Each row cites the instrument and the article that sets the date; ' +
      'no tense is stored in the file, so a copy of it cannot go stale in the way a copy carrying "in force" would.'
  },
  {
    path: 'corpus/applicability.json',
    assertion: 'corpus/applicability.assertion.json',
    statement:
      'Lunara Society published this applicability model. The obligations it points at are verified; which of them reaches ' +
      'a given deployment is this institution\'s reading, and the model is marked interpretation for that reason.'
  },
  {
    path: 'corpus/registry-protocol.json',
    assertion: 'corpus/registry-protocol.assertion.json',
    statement:
      'Lunara Society published this registry contract. Every response shape in it carries an evidence mark: verified means ' +
      'observed from the live endpoint on the date given, unverified means expected and never observed.'
  },
  {
    path: 'corpus/index.json',
    assertion: 'corpus/index.assertion.json',
    statement: 'Lunara Society published this corpus index — the list of machine-readable documents this institution stands behind.'
  },
  {
    path: 'mcp/core.mjs',
    assertion: 'mcp/core.assertion.json',
    media_type: 'text/javascript',
    statement:
      'Lunara Society published this source file. It is the whole of the MCP server except its transport: the npm package ' +
      'runs these bytes over stdio and the hosted HTTPS endpoint imports this URL at boot, so an AI system can establish ' +
      'that the server answering it is running published, unaltered code rather than taking that on trust.'
  },
  {
    path: '.well-known/lunara-verify.json',
    assertion: '.well-known/lunara-verify.assertion.json',
    statement:
      'Lunara Society published this identity record. It states that this institution holds no Shield Certification, because ' +
      'an issuer that grants itself the credential it sells has certified nothing.'
  }
];

/* RFC 8785 (JCS). Object keys sorted by UTF-16 code unit, no insignificant
   whitespace, and JSON.stringify's own string and integer escaping, which
   already matches JCS for everything appearing in these documents.
   Non-integer numbers are refused rather than serialised wrongly: JCS
   requires ECMAScript Number::toString, which JSON.stringify gives, but
   the failure modes around precision are subtle enough that a document
   containing one should be looked at by a person. */
export function canonical(value) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error(`cannot canonicalise non-finite number: ${value}`);
    if (!Number.isInteger(value)) throw new Error(`cannot canonicalise non-integer number: ${value} — see tools/lunara-assertions.mjs`);
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (typeof value === 'object') {
    const keys = Object.keys(value).filter((k) => value[k] !== undefined).sort();
    return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
  }
  throw new Error(`cannot canonicalise value of type ${typeof value}`);
}

export const b64u = (bytes) =>
  Buffer.from(bytes).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export const unb64u = (s) => new Uint8Array(Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64'));

/* The digest covers the bytes as served, not a re-serialisation of them.
   A verifier that parsed and re-printed the JSON first would accept a file
   whose formatting had been changed, and formatting is where a
   whitespace-smuggled second document hides. */
export async function digestOf(bytes) {
  const d = await crypto.subtle.digest('SHA-256', bytes);
  return b64u(new Uint8Array(d));
}

const normaliseJwk = (jwk) => ({ ...jwk, alg: undefined, key_ops: undefined, ext: undefined });

export async function importPublicKey(jwk) {
  return crypto.subtle.importKey('jwk', { ...normaliseJwk(jwk), key_ops: ['verify'] }, { name: 'Ed25519' }, true, ['verify']);
}
export async function importPrivateKey(jwk) {
  return crypto.subtle.importKey('jwk', { ...normaliseJwk(jwk), key_ops: ['sign'] }, { name: 'Ed25519' }, false, ['sign']);
}

/* The body that gets signed. Everything a verifier needs to decide what
   was asserted is inside it — including the key id, so a signature cannot
   be replayed under a different key's authority, and the expiry, so an
   assertion cannot be stripped of its lifetime. */
export function body({ type, subject, statement, evidence, claims, issued_at, expires_at, kid }) {
  return {
    version: ENVELOPE_VERSION,
    type,
    issuer: ISSUER,
    subject,
    statement,
    evidence,
    claims,
    issued_at,
    expires_at,
    key_id: kid
  };
}

export async function sign(assertionBody, privateKey) {
  const bytes = new TextEncoder().encode(canonical(assertionBody));
  const sig = await crypto.subtle.sign({ name: 'Ed25519' }, privateKey, bytes);
  return b64u(new Uint8Array(sig));
}

export function envelope(assertionBody, signature) {
  return {
    $schema: `${ISSUER}/.well-known/assertion.schema.json`,
    assertion: assertionBody,
    signature: { alg: 'EdDSA', curve: 'Ed25519', key_id: assertionBody.key_id, keys: KEYS_URL, value: signature },
    how_to_verify:
      'Take assertion, serialise it as RFC 8785 canonical JSON, and verify signature.value as Ed25519 over those bytes ' +
      `using the key whose kid is signature.key_id from ${KEYS_URL}. Then SHA-256 the subject document as served and ` +
      'compare it to assertion.claims.digest.value. Both must hold. Nothing needs to be fetched from this institution to check the maths.'
  };
}

/* One verification path, used by the deploy gate, by the MCP server and by
   anyone else. It returns findings rather than throwing, so a caller can
   decide whether a stale-but-valid assertion is fatal for its purpose. */
export async function verifyEnvelope(env, documentBytes, keyring, { now = new Date() } = {}) {
  const problems = [];
  const a = env?.assertion;
  if (!a || typeof a !== 'object') return { ok: false, problems: ['no assertion body in envelope'] };
  if (a.version !== ENVELOPE_VERSION) problems.push(`unknown envelope version "${a.version}"`);
  if (a.issuer !== ISSUER) problems.push(`assertion issuer is "${a.issuer}", expected ${ISSUER}`);

  const sigBlock = env.signature || {};
  if (sigBlock.alg !== 'EdDSA' || sigBlock.curve !== 'Ed25519') problems.push(`unexpected algorithm ${sigBlock.alg}/${sigBlock.curve}`);
  if (sigBlock.key_id !== a.key_id) problems.push('signature key_id does not match the signed body key_id');

  const jwk = keyring.find((k) => k.kid === a.key_id);
  if (!jwk) {
    problems.push(`no published key with kid "${a.key_id}"`);
    return { ok: false, problems };
  }
  if (jwk.revoked) problems.push(`key "${jwk.kid}" is published as revoked: ${jwk.revoked}`);

  let signatureValid = false;
  try {
    const key = await importPublicKey(jwk);
    signatureValid = await crypto.subtle.verify(
      { name: 'Ed25519' },
      key,
      unb64u(sigBlock.value),
      new TextEncoder().encode(canonical(a))
    );
  } catch (e) {
    problems.push(`signature could not be checked: ${e.message}`);
  }
  if (!signatureValid) problems.push('SIGNATURE DOES NOT VERIFY — the assertion body has been altered since it was signed');

  let digestMatches = null;
  if (documentBytes) {
    const actual = await digestOf(documentBytes);
    digestMatches = actual === a.claims?.digest?.value;
    if (!digestMatches) problems.push(`DIGEST MISMATCH — document hashes to ${actual}, assertion says ${a.claims?.digest?.value}`);
  }

  const expired = a.expires_at ? new Date(a.expires_at) < now : false;
  if (expired) problems.push(`assertion expired ${a.expires_at}`);
  const notYet = a.issued_at ? new Date(a.issued_at) > now : false;
  if (notYet) problems.push(`assertion is dated in the future (${a.issued_at})`);

  return { ok: problems.length === 0, problems, signatureValid, digestMatches, expired, assertion: a };
}

export function readKeyring(text) {
  const doc = typeof text === 'string' ? JSON.parse(text) : text;
  if (!Array.isArray(doc?.keys)) throw new Error('key document has no keys array');
  return doc.keys;
}

export const readLocalKeyring = () => readKeyring(readFileSync(join(ROOT, '.well-known/keys.json'), 'utf8'));
