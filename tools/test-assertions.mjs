#!/usr/bin/env node
/* Proves the signing layer rejects what it is supposed to reject.

   A verifier that always says yes passes every test that only feeds it
   good input, and there is no way to tell it apart from a real one by
   looking at green output. So each case below breaks exactly one thing and
   asserts on the specific complaint. */

import { webcrypto as crypto } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  ROOT, COVERED, canonical, verifyEnvelope, importPrivateKey, sign, body, envelope, b64u, readLocalKeyring
} from './lunara-assertions.mjs';

let pass = 0; const fails = [];
const t = (name, cond, detail = '') => { if (cond) pass++; else fails.push(`${name}${detail ? ' — ' + detail : ''}`); };
const clone = (o) => JSON.parse(JSON.stringify(o));

const keyring = readLocalKeyring();
const subject = COVERED[0];
const good = JSON.parse(readFileSync(join(ROOT, subject.assertion), 'utf8'));
const bytes = readFileSync(join(ROOT, subject.path));

/* the honest case */
let r = await verifyEnvelope(good, bytes, keyring);
t('a real assertion verifies', r.ok, r.problems.join('; '));

/* the document is altered after signing — the mirror-tampering case this
   whole layer exists for */
const altered = Buffer.from(bytes.toString('utf8').replace('2026-08-02', '2027-08-02'));
r = await verifyEnvelope(good, altered, keyring);
t('an altered document is caught', !r.ok && r.problems.some((p) => p.startsWith('DIGEST MISMATCH')), r.problems.join('; '));

/* the assertion body is altered — someone edits the digest to match their
   own copy and hopes nobody checks the signature */
const forged = clone(good);
forged.assertion.claims.digest.value = b64u(new Uint8Array(await crypto.subtle.digest('SHA-256', altered)));
r = await verifyEnvelope(forged, altered, keyring);
t('a re-digested assertion fails the signature', !r.ok && r.problems.some((p) => p.startsWith('SIGNATURE DOES NOT VERIFY')), r.problems.join('; '));

/* the statement is softened while the claims stay intact */
const reworded = clone(good);
reworded.assertion.statement = 'Lunara Society certifies this document as legally binding.';
r = await verifyEnvelope(reworded, bytes, keyring);
t('a reworded statement fails the signature', !r.ok && !r.signatureValid);

/* signed by a key nobody published */
const rogue = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
const rogueJwk = await crypto.subtle.exportKey('jwk', rogue.privateKey);
const rogueBody = body({ ...clone(good.assertion), claims: clone(good.assertion.claims), kid: good.assertion.key_id });
const rogueSig = await sign(rogueBody, await importPrivateKey(rogueJwk));
r = await verifyEnvelope(envelope(rogueBody, rogueSig), bytes, keyring);
t('a signature under unpublished key material is caught', !r.ok && !r.signatureValid);

/* signed by a rogue key that also publishes itself under a new kid: the
   kid is unknown, so it never reaches the maths */
const roguePub = await crypto.subtle.exportKey('jwk', rogue.publicKey);
const claimed = body({ ...clone(good.assertion), claims: clone(good.assertion.claims), kid: 'luna-2026-imposter' });
const claimedSig = await sign(claimed, await importPrivateKey(rogueJwk));
r = await verifyEnvelope(envelope(claimed, claimedSig), bytes, keyring);
t('an unknown kid is refused', !r.ok && r.problems.some((p) => p.includes('no published key')));

/* the outer signature block points at a different key than the signed body */
const swapped = clone(good);
swapped.signature.key_id = 'luna-2026-imposter';
r = await verifyEnvelope(swapped, bytes, keyring);
t('a key_id mismatch between body and signature block is caught',
  !r.ok && r.problems.some((p) => p.includes('does not match the signed body')));

/* a revoked key */
const revoked = keyring.map((k) => ({ ...k, revoked: '2026-01-01 — test' }));
r = await verifyEnvelope(good, bytes, revoked);
t('a revoked key is refused', !r.ok && r.problems.some((p) => p.includes('revoked')));

/* expiry */
r = await verifyEnvelope(good, bytes, keyring, { now: new Date('2099-01-01') });
t('an expired assertion is refused', !r.ok && r.problems.some((p) => p.includes('expired')));

/* an envelope version this code does not know */
const future = clone(good);
future.assertion.version = 'lunara-assertion-2';
r = await verifyEnvelope(future, bytes, keyring);
t('an unknown envelope version is refused rather than half-understood',
  !r.ok && r.problems.some((p) => p.includes('unknown envelope version')));

/* canonicalisation: key order and whitespace must not change the bytes
   signed, or two honest parties compute different signatures */
t('canonical form is independent of key order',
  canonical({ b: 1, a: 2 }) === canonical({ a: 2, b: 1 }));
t('canonical form of the signed body round-trips through parse',
  canonical(good.assertion) === canonical(JSON.parse(JSON.stringify(good.assertion))));

/* the deploy gate itself, end to end: change a covered document, and the
   build must stop. Restored immediately afterwards, whatever happens. */
const target = join(ROOT, subject.path);
const original = readFileSync(target);
let gateFailed = false, gateSaid = '';
try {
  writeFileSync(target, original.toString('utf8').replace('"version"', '"version" '));
  try {
    execFileSync(process.execPath, [join(ROOT, 'tools/verify-signatures.mjs')], { stdio: 'pipe' });
  } catch (e) {
    gateFailed = true;
    gateSaid = (e.stderr?.toString() ?? '') + (e.stdout?.toString() ?? '');
  }
} finally {
  writeFileSync(target, original);
}
t('the deploy gate stops on an unsigned change to a covered document', gateFailed);
t('the gate says how to fix it', /sign-assertions\.mjs/.test(gateSaid), gateSaid.slice(0, 200));

/* and the restored file passes again, so the test left nothing behind */
try {
  execFileSync(process.execPath, [join(ROOT, 'tools/verify-signatures.mjs')], { stdio: 'pipe' });
  t('the repository verifies again after the test', true);
} catch (e) {
  t('the repository verifies again after the test', false, e.stdout?.toString());
}

if (fails.length) {
  console.error(`\n${fails.length} assertion-layer test(s) failed:`);
  for (const f of fails) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`assertion layer: ${pass} checks passed`);
