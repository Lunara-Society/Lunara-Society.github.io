#!/usr/bin/env node
/* Deploy gate for the signing layer.

   A signature covering the previous version of a document is worse than no
   signature: it invites a reader to check, tells them the check failed, and
   leaves them unable to tell an out-of-date build from an attack. So the
   deploy stops while any covered document and its assertion disagree, and
   the message says how to fix it.

   This gate needs no private key. It verifies exactly what any outside
   reader can verify, which is the only useful test of a scheme whose whole
   claim is that outsiders can check it. */

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { ROOT, COVERED, ISSUER, readLocalKeyring, verifyEnvelope } from './lunara-assertions.mjs';

const fail = [];
const warn = [];
const check = (cond, msg) => { if (!cond) fail.push(msg); };
const now = new Date();

/* --- the key document ------------------------------------------------ */
let keyring;
try {
  keyring = readLocalKeyring();
} catch (e) {
  console.error(`.well-known/keys.json: ${e.message}`);
  process.exit(1);
}
check(keyring.length > 0, '.well-known/keys.json publishes no keys');
const kids = new Set();
for (const k of keyring) {
  const at = `key "${k.kid}"`;
  check(!kids.has(k.kid), `${at}: duplicate kid`);
  kids.add(k.kid);
  check(k.kty === 'OKP' && k.crv === 'Ed25519', `${at}: expected an Ed25519 OKP key`);
  check(typeof k.x === 'string' && k.x.length >= 42, `${at}: no public key material`);
  check(!('d' in k), `${at}: PRIVATE KEY MATERIAL IN A PUBLISHED FILE — the "d" parameter is the secret half`);
  check(['development', 'production'].includes(k.status), `${at}: status must be development or production`);
  if (k.status === 'development') {
    check(Boolean(k.assurance), `${at}: a development key must say in the published document what it does not assure`);
  }
  if (k.not_after && new Date(k.not_after) < now && !k.revoked) {
    warn.push(`${at}: passed not_after (${k.not_after.slice(0, 10)}) and is not marked revoked`);
  }
}

/* --- every covered document ------------------------------------------ */
for (const doc of COVERED) {
  const at = doc.path;
  const docPath = join(ROOT, doc.path);
  const sigPath = join(ROOT, doc.assertion);

  if (!existsSync(docPath)) { fail.push(`${at}: covered document is missing`); continue; }
  if (!existsSync(sigPath)) {
    fail.push(`${at}: no assertion at ${doc.assertion} — run: LUNARA_SIGNING_KEY=<path> node tools/sign-assertions.mjs`);
    continue;
  }

  const bytes = readFileSync(docPath);
  let env;
  try { env = JSON.parse(readFileSync(sigPath, 'utf8')); }
  catch (e) { fail.push(`${doc.assertion}: does not parse (${e.message})`); continue; }

  const r = await verifyEnvelope(env, bytes, keyring, { now });
  if (!r.ok) {
    for (const p of r.problems) {
      fail.push(
        `${at}: ${p}` +
        (p.startsWith('DIGEST') ? ' — the document changed and was not re-signed. Run: LUNARA_SIGNING_KEY=<path> node tools/sign-assertions.mjs' : '')
      );
    }
  }
  check(env.assertion?.statement === doc.statement,
    `${at}: the signed statement no longer matches the one in tools/lunara-assertions.mjs — re-sign so the words and the signature agree`);

  const days = env.assertion?.expires_at ? (new Date(env.assertion.expires_at) - now) / 86400000 : 0;
  if (r.ok && days < 45) warn.push(`${at}: assertion expires in ${Math.round(days)} days — re-sign before it lapses`);
}

/* --- the index --------------------------------------------------------- */
const indexPath = join(ROOT, '.well-known/assertions.json');
if (!existsSync(indexPath)) {
  fail.push('.well-known/assertions.json is missing — run tools/sign-assertions.mjs');
} else {
  const idx = JSON.parse(readFileSync(indexPath, 'utf8'));
  const listed = new Map((idx.assertions ?? []).map((a) => [a.subject, a]));
  for (const doc of COVERED) {
    const subject = `${ISSUER}/${doc.path}`;
    const row = listed.get(subject);
    if (!row) { fail.push(`.well-known/assertions.json: ${doc.path} is not listed`); continue; }
    const env = existsSync(join(ROOT, doc.assertion)) ? JSON.parse(readFileSync(join(ROOT, doc.assertion), 'utf8')) : null;
    check(row.digest === env?.assertion?.claims?.digest?.value,
      `.well-known/assertions.json: the digest listed for ${doc.path} disagrees with its assertion`);
    check(row.assertion === `${ISSUER}/${doc.assertion}`,
      `.well-known/assertions.json: wrong assertion URL for ${doc.path}`);
  }
  check(listed.size === COVERED.length, '.well-known/assertions.json lists documents that are not covered — regenerate it');
}

/* --- nothing secret in the repository ---------------------------------- */
/* Everything committed here is served. That has been checked rather than
   assumed, so a private key landing in the tree is a live exposure and not
   a tidiness problem. */
const skip = new Set(['.git', 'node_modules', '.github']);
const suspects = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    if (skip.has(name)) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p);
    else if (/\.(json|mjs|js|txt|pem|key)$/.test(name) && st.size < 2_000_000) {
      const text = readFileSync(p, 'utf8');
      if (/"private_jwk"|BEGIN [A-Z ]*PRIVATE KEY/.test(text)) suspects.push(relative(ROOT, p));
      // an OKP JWK with a "d" member is a secret key, wherever it turns up
      if (/"crv"\s*:\s*"Ed25519"/.test(text) && /"d"\s*:\s*"[A-Za-z0-9_-]{40,}"/.test(text)) suspects.push(relative(ROOT, p));
    }
  }
})(ROOT);
for (const s of new Set(suspects)) {
  if (s === 'tools/verify-signatures.mjs') continue; // this file names the patterns it hunts for
  fail.push(`${s}: looks like it contains private key material, and this repository is served publicly`);
}

for (const w of warn) console.warn(`warning: ${w}`);
if (fail.length) {
  console.error(`\nSignature verification failed (${fail.length}):`);
  for (const f of fail) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`signatures verified: ${COVERED.length} documents, ${keyring.length} published key(s), ${warn.length} warning(s)`);
