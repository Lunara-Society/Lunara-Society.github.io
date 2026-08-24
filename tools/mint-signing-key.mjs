#!/usr/bin/env node
/* Generates a signing key and the public key document that goes with it.

   Run once, and again only to rotate:

     node tools/mint-signing-key.mjs --out /secure/path/lunara-signing-key.json

   The private half is written to the path given and is never written into
   this repository — everything committed here is served publicly, which
   has already been checked rather than assumed. The public half is written
   into .well-known/keys.json, keeping any existing keys so that assertions
   signed under an old kid keep verifying until they expire.

   Rotation, when it happens: mint a new key, re-sign with it, and mark the
   old entry revoked with a reason rather than deleting it. A key that
   vanishes from the document turns every assertion it ever signed into
   "no published key with that kid", which is indistinguishable from a
   forgery. A key marked revoked, with a date, tells a verifier which of
   those two it is looking at. */

import { webcrypto as crypto } from 'node:crypto';
import { writeFileSync, readFileSync, existsSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, ISSUER, b64u } from './lunara-assertions.mjs';

const args = process.argv.slice(2);
const outIdx = args.indexOf('--out');
const out = outIdx >= 0 ? args[outIdx + 1] : null;
const status = args.includes('--production') ? 'production' : 'development';
if (!out) {
  console.error('usage: node tools/mint-signing-key.mjs --out <path-to-private-key.json> [--production]');
  process.exit(2);
}

const kp = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
const pubJwk = await crypto.subtle.exportKey('jwk', kp.publicKey);
const prvJwk = await crypto.subtle.exportKey('jwk', kp.privateKey);

const now = new Date();
const stamp = now.toISOString().slice(0, 10);
/* The kid is derived from the key itself, so two keys can never collide
   and a kid cannot be silently pointed at different key material. */
const thumb = b64u(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(
  JSON.stringify({ crv: 'Ed25519', kty: 'OKP', x: pubJwk.x })  // RFC 8037 thumbprint input
)))).slice(0, 16);
const kid = `luna-${stamp.slice(0, 4)}-${thumb}`;

const notAfter = new Date(Date.UTC(now.getUTCFullYear() + 2, now.getUTCMonth(), now.getUTCDate())).toISOString();

const entry = {
  kid,
  kty: 'OKP',
  crv: 'Ed25519',
  x: pubJwk.x,
  use: 'sig',
  alg: 'EdDSA',
  status,
  created: now.toISOString(),
  not_after: notAfter,
  revoked: null,
  purpose: 'Signs the assertions Lunara Society publishes about its own machine-readable documents.',
  ...(status === 'development'
    ? {
        assurance:
          'This key was generated in an ephemeral build container and handed to the operator over a chat channel. It ' +
          'establishes that two copies of a document are the same document and that the copy you hold is the one this ' +
          'institution published. It does not carry hardware-backed assurance, and nothing that matters legally should ' +
          'rest on it alone until it has been replaced by a key generated on trusted hardware and rotated in as production.'
      }
    : {})
};

const keysPath = join(ROOT, '.well-known/keys.json');
const existing = existsSync(keysPath) ? JSON.parse(readFileSync(keysPath, 'utf8')) : null;
const priorKeys = (existing?.keys ?? []).filter((k) => k.kid !== kid);

const doc = {
  $schema: `${ISSUER}/.well-known/keys.schema.json`,
  issuer: ISSUER,
  document: 'lunara-signing-keys-1',
  updated: now.toISOString(),
  description:
    'The public keys Lunara Society signs published assertions with. Ed25519, RFC 8037 JWK. Fetch this once, keep it, and ' +
    'verify every assertion offline against it — no request to this institution is needed to check a signature, which is the point.',
  keys: [entry, ...priorKeys],
  rotation: {
    policy:
      'Keys are valid for two years from creation. A superseded key is marked revoked with a date and a reason and stays ' +
      'published, because a key that disappears makes every assertion it signed look forged.',
    on_compromise:
      'The compromised entry is marked revoked immediately, every covered document is re-signed under a new kid, and the ' +
      'revocation reason states the date from which signatures under the old key should be disbelieved.',
    procedure: `${ISSUER}/signing.html`
  },
  verification: {
    envelope: `${ISSUER}/.well-known/assertion.schema.json`,
    index: `${ISSUER}/.well-known/assertions.json`,
    steps: [
      'Fetch the assertion for the document you hold.',
      'Serialise assertion (the inner object) as RFC 8785 canonical JSON — sorted keys, no whitespace.',
      'Verify signature.value as an Ed25519 signature over those bytes, using the key here whose kid matches signature.key_id.',
      'SHA-256 the document exactly as served, base64url it, and compare to assertion.claims.digest.value.',
      'Check issued_at is in the past and expires_at is in the future.'
    ]
  }
};

writeFileSync(keysPath, JSON.stringify(doc, null, 2) + '\n');

writeFileSync(out, JSON.stringify({
  warning: 'PRIVATE KEY. Never commit this file. Everything in the Lunara repository is served publicly.',
  kid,
  issuer: ISSUER,
  created: now.toISOString(),
  private_jwk: prvJwk
}, null, 2) + '\n', { mode: 0o600 });
try { chmodSync(out, 0o600); } catch {}

console.log(`minted ${kid} (${status})`);
console.log(`  public  -> .well-known/keys.json`);
console.log(`  private -> ${out}   (mode 600, do not commit)`);
