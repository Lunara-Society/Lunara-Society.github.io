#!/usr/bin/env node
/* Signs every covered document.

     LUNARA_SIGNING_KEY=/secure/path/lunara-signing-key.json node tools/sign-assertions.mjs

   The private key is never read from this repository — the variable holds a
   path outside it, or the JSON itself. Without the key this exits non-zero
   and changes nothing: the deploy gate that checks signatures would rather
   stop than let a corpus change go out under a signature covering the
   previous version. That failure mode is the design, not an accident of it.

   Signatures are only rewritten when the document they cover has actually
   changed. Re-signing an unchanged document would move issued_at on every
   run and produce a diff that says nothing — and a diff that says nothing
   is one nobody reads. */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  ROOT, COVERED, ISSUER, digestOf, body, sign, envelope,
  importPrivateKey, readLocalKeyring, verifyEnvelope
} from './lunara-assertions.mjs';

const raw = process.env.LUNARA_SIGNING_KEY;
if (!raw) {
  console.error('LUNARA_SIGNING_KEY is not set. Give it the path to the private key file (or the JSON itself).');
  console.error('The key is not in this repository and must not be put in it: everything committed here is served publicly.');
  process.exit(2);
}
const keyDoc = JSON.parse(raw.trim().startsWith('{') ? raw : readFileSync(raw, 'utf8'));
const jwk = keyDoc.private_jwk ?? keyDoc;
const kid = keyDoc.kid ?? jwk.kid;
if (!kid) { console.error('the private key file carries no kid'); process.exit(2); }

const keyring = readLocalKeyring();
const published = keyring.find((k) => k.kid === kid);
if (!published) {
  console.error(`kid "${kid}" is not in .well-known/keys.json — a signature under an unpublished key verifies for nobody.`);
  process.exit(2);
}
if (published.x !== jwk.x) {
  console.error(`kid "${kid}" is published with different key material than the private key provides.`);
  process.exit(2);
}
if (published.revoked) {
  console.error(`kid "${kid}" is published as revoked (${published.revoked}). Mint a new key rather than signing under a dead one.`);
  process.exit(2);
}

const privateKey = await importPrivateKey(jwk);
const now = new Date();
/* A year. Long enough that a quiet corpus does not expire under a reader
   who cached it; short enough that an abandoned mirror stops looking
   current. Re-signing is one command. */
const expires = new Date(now.getTime() + 365 * 24 * 3600 * 1000);

let wrote = 0, kept = 0;
const index = [];

for (const doc of COVERED) {
  const bytes = readFileSync(join(ROOT, doc.path));
  const digest = await digestOf(bytes);
  const subject = `${ISSUER}/${doc.path}`;
  const assertionPath = join(ROOT, doc.assertion);

  if (existsSync(assertionPath)) {
    const existing = JSON.parse(readFileSync(assertionPath, 'utf8'));
    const check = await verifyEnvelope(existing, bytes, keyring, { now });
    if (check.ok && existing.assertion.key_id === kid && existing.assertion.statement === doc.statement) {
      kept++;
      index.push(entryFor(doc, existing.assertion));
      continue;
    }
  }

  const b = body({
    type: 'document-integrity',
    subject,
    statement: doc.statement,
    evidence: 'verified',
    claims: {
      digest: { alg: 'sha-256', encoding: 'base64url', value: digest },
      bytes: bytes.length,
      media_type: doc.media_type ?? 'application/json',
      /* The version the covered document declares for itself, when it
         declares one. It is a claim about the document, not about the
         signature, and it is here so a reader can tell "same bytes" from
         "same version" — two files can disagree while claiming one. */
      document_version: versionOf(bytes)
    },
    issued_at: now.toISOString(),
    expires_at: expires.toISOString(),
    kid
  });
  const signature = await sign(b, privateKey);
  writeFileSync(assertionPath, JSON.stringify(envelope(b, signature), null, 2) + '\n');
  wrote++;
  index.push(entryFor(doc, b));
}

function versionOf(bytes) {
  try { const d = JSON.parse(bytes.toString('utf8')); return d.version ?? d.protocol_version ?? null; }
  catch { return null; }
}

function entryFor(doc, a) {
  return {
    subject: a.subject,
    assertion: `${ISSUER}/${doc.assertion}`,
    type: a.type,
    key_id: a.key_id,
    issued_at: a.issued_at,
    expires_at: a.expires_at,
    digest: a.claims.digest.value
  };
}

writeFileSync(join(ROOT, '.well-known/assertions.json'), JSON.stringify({
  $schema: `${ISSUER}/.well-known/assertions.schema.json`,
  issuer: ISSUER,
  document: 'lunara-assertion-index-1',
  updated: now.toISOString(),
  description:
    'Every document Lunara Society publishes with a detached signature, and where that signature lives. This index is a ' +
    'convenience and is deliberately not itself the trust anchor: an assertion is checked against the key document and the ' +
    'document it covers, so a tampered index can only hide an assertion, never forge one.',
  keys: `${ISSUER}/.well-known/keys.json`,
  envelope_schema: `${ISSUER}/.well-known/assertion.schema.json`,
  human: `${ISSUER}/signing.html`,
  assertions: index
}, null, 2) + '\n');

console.log(`signed ${wrote}, unchanged ${kept}, index of ${index.length} written under ${kid}`);
