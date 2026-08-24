/* ═══════════════════════════════════════════════════════════════════
   LUNARA INTELLIGENCE — the answers, without a transport
   ═══════════════════════════════════════════════════════════════════

   Two doors lead here: the npm package speaking JSON-RPC over stdio, and
   the hosted endpoint speaking it over HTTPS for clients that cannot run
   a local process. They must never disagree about a date, so neither of
   them owns any of the logic — this file does, and both import it.

   Nothing here touches process, stdin, Buffer or any Node built-in. It
   runs unchanged on Node and on Deno.
   ═══════════════════════════════════════════════════════════════════ */

/* Node sets it in process.env, Deno in Deno.env. This file is loaded by
   both — the npm package over stdio and the hosted endpoint over HTTPS —
   and neither transport is allowed to change a single answer. */
const env = (k) =>
  globalThis.process?.env?.[k] ??
  (typeof globalThis.Deno !== 'undefined' ? globalThis.Deno.env.get(k) : undefined);

export const AUTHORITY = env('LUNARA_AUTHORITY') || 'https://lunarasociety.com';
const REGISTRY  = 'https://base44.app/api/apps/6a46cea2687503d2d6d4ecd1/functions';
export const VERSION   = '1.0.0';
export const PROTOCOL  = '2025-06-18';
export const SUPPORTED = new Set(['2025-06-18', '2025-03-26', '2024-11-05']);
const UA        = `lunara-mcp/${VERSION} (+https://lunarasociety.com/mcp.html)`;

/* ── the authority ─────────────────────────────────────────────────
   Cached briefly so a burst of tool calls in one conversation does not
   hammer the origin, and never long enough for a correction published
   this morning to be invisible this afternoon. */

const TTL = 15 * 60 * 1000;
const cache = new Map();

async function authoritative(path) {
  const hit = cache.get(path);
  if (hit && Date.now() - hit.at < TTL) return hit.body;

  const url = `${AUTHORITY}${path}`;
  let res;
  try {
    res = await fetch(url, { headers: { accept: 'application/json', 'user-agent': UA } });
  } catch (cause) {
    throw new Error(
      `Could not reach the Lunara corpus at ${url} (${cause.message}). ` +
      `No answer is returned rather than a possibly stale one — the dates in this corpus have been amended before.`
    );
  }
  if (!res.ok) throw new Error(`The Lunara corpus at ${url} returned HTTP ${res.status}.`);

  /* The bytes, not a re-serialisation of them: the digest in the assertion
     covers the document exactly as served. */
  const text = await res.text();
  const body = JSON.parse(text);
  const integrity = await checkSignature(path, text);
  if (integrity.state === 'failed') {
    throw new Error(
      `The signature on ${url} does not verify (${integrity.detail}). No answer is returned. ` +
      `Either this copy has been altered, or the issuer published a document and its signature out of step. ` +
      `Check https://lunarasociety.com/.well-known/keys.json and https://lunarasociety.com/signing.html — deliberately the ` +
      `canonical origin and not ${AUTHORITY}, because a copy that fails its own signature is not the place to go for the key that checks it.`
    );
  }
  cache.set(path, { at: Date.now(), body, integrity });
  return body;
}

const integrityOf = (path) => cache.get(path)?.integrity ?? { state: 'unknown', line: 'not checked' };

const corpus        = () => authoritative('/corpus/obligations.json');
const applicability = () => authoritative('/corpus/applicability.json');

/* ── integrity ─────────────────────────────────────────────────────
   TLS proves these bytes came from whatever answered for the domain. It
   proves nothing about a copy — a mirror, a cached crawl, a vendor's
   snapshot — and copies are how a corpus like this actually travels. So
   each document is published with a detached Ed25519 assertion over its
   SHA-256, and this checks it rather than trusting the transport.

   Verification failing is fatal: a client that reports a bad signature and
   answers anyway has told the user something is wrong and then acted as
   though it were not. Verification being *unavailable* — an old runtime
   without Ed25519, an authority serving no assertion — is not fatal, and
   is reported as unverified rather than dressed up as verified. */

const KEYS_TTL = 6 * 3600 * 1000;
let keyringCache = null;

const b64u = (bytes) => {
  let s = '';
  const a = new Uint8Array(bytes);
  for (let i = 0; i < a.length; i++) s += String.fromCharCode(a[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const unb64u = (s) => Uint8Array.from(atob(String(s).replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

/* RFC 8785 canonical JSON, the same serialisation the issuer signs. */
function canonical(v) {
  if (v === null || typeof v === 'boolean' || typeof v === 'string') return JSON.stringify(v);
  if (typeof v === 'number') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
  if (typeof v === 'object') {
    return '{' + Object.keys(v).filter((k) => v[k] !== undefined).sort()
      .map((k) => JSON.stringify(k) + ':' + canonical(v[k])).join(',') + '}';
  }
  throw new Error('uncanonicalisable value');
}

async function keyring() {
  if (keyringCache && Date.now() - keyringCache.at < KEYS_TTL) return keyringCache.keys;
  const res = await fetch(`${AUTHORITY}/.well-known/keys.json`, { headers: { accept: 'application/json', 'user-agent': UA } });
  if (!res.ok) throw new Error(`key document returned HTTP ${res.status}`);
  const doc = await res.json();
  if (!Array.isArray(doc.keys)) throw new Error('key document has no keys');
  keyringCache = { at: Date.now(), keys: doc.keys };
  return doc.keys;
}

async function checkSignature(path, text) {
  const url = `${AUTHORITY}${path.replace(/\.json$/, '.assertion.json')}`;
  try {
    const res = await fetch(url, { headers: { accept: 'application/json', 'user-agent': UA } });
    if (res.status === 404) return { state: 'unsigned', line: 'no assertion published for this document', detail: '' };
    if (!res.ok) return { state: 'unverified', line: `assertion fetch returned HTTP ${res.status}`, detail: '' };
    const env = await res.json();
    const a = env.assertion;
    if (a?.version !== 'lunara-assertion-1') return { state: 'unverified', line: `unknown assertion version ${a?.version}`, detail: '' };
    if (env.signature?.key_id !== a.key_id) return { state: 'failed', line: 'key_id mismatch', detail: 'signature block names a different key than the signed body' };

    const keys = await keyring();
    const jwk = keys.find((k) => k.kid === a.key_id);
    if (!jwk) return { state: 'failed', line: `unknown key ${a.key_id}`, detail: 'the signing key is not in the published key document' };
    if (jwk.revoked) return { state: 'failed', line: `key ${a.key_id} revoked`, detail: String(jwk.revoked) };

    const key = await crypto.subtle.importKey(
      'jwk', { kty: jwk.kty, crv: jwk.crv, x: jwk.x, key_ops: ['verify'] }, { name: 'Ed25519' }, false, ['verify']
    );
    const good = await crypto.subtle.verify(
      { name: 'Ed25519' }, key, unb64u(env.signature.value), new TextEncoder().encode(canonical(a))
    );
    if (!good) return { state: 'failed', line: 'signature does not verify', detail: 'the assertion body was altered after signing' };

    const digest = b64u(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))));
    if (digest !== a.claims?.digest?.value) {
      return { state: 'failed', line: 'digest mismatch', detail: `document hashes to ${digest}, the assertion says ${a.claims?.digest?.value}` };
    }
    if (a.expires_at && new Date(a.expires_at) < new Date()) {
      return { state: 'unverified', line: `signature valid but the assertion expired ${a.expires_at.slice(0, 10)}`, detail: '' };
    }
    return {
      state: 'verified',
      line: `Ed25519 signature verified · key ${a.key_id}${jwk.status === 'development' ? ' (development key — see keys.json)' : ''} · issued ${a.issued_at.slice(0, 10)}`,
      detail: '',
      evidence: {
        algorithm: 'Ed25519',
        key_id: a.key_id,
        key_status: jwk.status,
        digest: a.claims?.digest,
        issued_at: a.issued_at,
        expires_at: a.expires_at,
        assertion: `${AUTHORITY}${path.replace(/\.json$/, '.assertion.json')}`,
        keys: `${AUTHORITY}/.well-known/keys.json`,
        method: 'Ed25519 over the RFC 8785 canonical form of the assertion body; SHA-256 over the document exactly as served.',
        verified_by: 'this MCP server, at the moment of the fetch'
      }
    };
  } catch (e) {
    /* No Ed25519 in this runtime, no network for the key document, no
       assertion served. None of these mean the document is bad, and
       saying so would be a lie in the other direction. */
    return { state: 'unverified', line: `signature could not be checked (${e.message})`, detail: '' };
  }
}

/* ── tense ─────────────────────────────────────────────────────────
   Computed here, at the moment of the call, for the same reason the
   site computes it at the moment of reading. Nothing stores it. */

const DAY = 86400000;
const MONTHS = ['January','February','March','April','May','June',
                'July','August','September','October','November','December'];

const todayUTC = () => {
  const n = new Date();
  return Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate());
};

const parseISO = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
};

const longDate = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
};

function tense(o, now = todayUTC()) {
  const days = Math.round((parseISO(o.applies_from) - now) / DAY);
  const inForce = days <= 0;
  return {
    ...o,
    in_force: inForce,
    days_in_force: inForce ? Math.abs(days) : null,
    days_until: inForce ? null : days,
    status: inForce ? 'in force' : 'pending',
    phrase: inForce
      ? `in force since ${longDate(o.applies_from)}`
      : `applies from ${longDate(o.applies_from)}`,
    computed_at: new Date().toISOString()
  };
}

/* ── the answer block ──────────────────────────────────────────────
   Structured content is what a model consumes; this is what a person
   sees when the model shows its work. Every field is either from the
   corpus or computed here — none of it is prose we wrote per answer. */

function citation(o) {
  const t = tense(o);
  return [
    `OBLIGATION       ${o.name}`,
    `JURISDICTION     ${o.jurisdiction}`,
    `STATUS           ${t.status.toUpperCase()} — ${t.phrase}`,
    `EFFECTIVE        ${longDate(o.applies_from)}`,
    `INSTRUMENT       ${o.instrument}`,
    `ARTICLE          ${o.article}`,
    o.penalty ? `PENALTY          ${o.penalty}` : null,
    `REQUIRES         ${o.summary}`,
    `SOURCE           ${o.source}`,
    o.amended_by ? `AMENDED BY       ${o.amended_by}` : null,
    `CLASSIFICATION   ${o.classification} (Lunara evidence standard)`,
    `LAST VERIFIED    ${longDate(o.verified)}`,
    `COMPUTED         ${t.computed_at}`,
    `AUTHORITY        ${AUTHORITY}/corpus/obligations.json`,
    `INTEGRITY        ${integrityOf('/corpus/obligations.json').line}`
  ].filter(Boolean).join('\n');
}

/* ── the applicability model ───────────────────────────────────────
   The published model is data. This evaluates it rather than
   reimplementing it, so the site and this server cannot disagree about
   which rule fires. */

function evaluate(model, answers) {
  const a = (k) => answers[k] ?? 'unsure';
  const engages = a('interacts_with_people') === 'yes' || a('generates_content') === 'yes';

  /* Built from the model's own input list rather than a hardcoded one.
     An input added to the published model used to need a matching edit
     here, and a rule referring to an input this file had never heard of
     silently evaluated false — which reads exactly like "does not apply". */
  const ctx = { engages };
  for (const input of model.inputs) ctx[input.id] = a(input.id);

  // The `when` strings are a tiny fixed grammar: comparisons against
  // literals joined by AND. Parsed, never evaluated as code.
  const test = (expr) => expr.split(' AND ').every((clause) => {
    const m = clause.trim().match(/^(\w+)\s*(==|!=)\s*(?:'([^']*)'|(true|false))$/);
    if (!m) return false;
    const [, key, op, str, bool] = m;
    const want = bool !== undefined ? bool === 'true' : str;
    const got = ctx[key];
    return op === '==' ? got === want : got !== want;
  });

  const matched = model.rules.find((r) => test(r.when)) || null;
  const overlays = model.overlays.filter((o) => test(o.when));

  const ids = new Set(matched?.obligations ?? []);
  for (const o of overlays) for (const id of o.adds ?? []) ids.add(id);

  const unsure = Object.entries(ctx)
    .filter(([k, v]) => v === 'unsure' && k !== 'engages')
    .map(([k]) => k);

  return { rule: matched, overlays, obligationIds: [...ids], unsure, context: ctx };
}

/* ── tools ─────────────────────────────────────────────────────────── */

export const TOOLS = [
  {
    name: 'lunara_obligations',
    title: 'List regulatory obligations',
    description:
      'The regulatory obligations Lunara Society tracks, with tense computed at the moment of the call. ' +
      'Each carries the instrument, the article that sets the date, a link to primary law, and any amending act. ' +
      'Use this to answer "what is in force", "what is coming", or "what does instrument X require" rather than ' +
      'recalling dates from training data — several of these have been amended, one of them five days before it would have applied.',
    inputSchema: {
      type: 'object',
      properties: {
        jurisdiction: { type: 'string', description: 'Filter, e.g. "European Union" or "California". Case-insensitive substring.' },
        status: { type: 'string', enum: ['in_force', 'pending', 'all'], description: 'Default all.' },
        id: { type: 'string', description: 'Return a single obligation by corpus id, e.g. "eu-art50".' }
      }
    }
  },
  {
    name: 'lunara_applicability',
    title: 'Determine which obligations reach a deployment',
    description:
      'Runs Lunara\'s published applicability model against a description of an AI deployment and returns which ' +
      'obligations reach it, which do not, and why. Answer only what you actually know — every input accepts "unsure", ' +
      'and an unsure is never resolved in the direction that manufactures an obligation. ' +
      'The model can and does conclude that nothing binds the asker.',
    inputSchema: {
      type: 'object',
      properties: {
        interacts_with_people:       { type: 'string', enum: ['yes','no','unsure'], description: 'Does the system exchange words with a person?' },
        generates_content:           { type: 'string', enum: ['yes','no','unsure'], description: 'Does it produce text, images, audio or video?' },
        generates_images_audio_or_video: { type: 'string', enum: ['yes','no','unsure'], description: 'Does it produce images, audio or video, as opposed to only text? Decides whether the prohibition applying from 2 December 2026 can reach it at all.' },
        eu_exposure:                 { type: 'string', enum: ['yes','no','unsure'], description: 'Does anyone in the EU use it, or its output? The Act binds on output, not on where you are incorporated.' },
        on_market_before_art50:      { type: 'string', enum: ['yes','no','unsure'], description: 'Was it placed on the market before 2 August 2026?' },
        california_exposure:         { type: 'string', enum: ['yes','no','unsure'], description: 'Is it available to people in California?' },
        monthly_users_over_1m:       { type: 'string', enum: ['yes','no','unsure'], description: 'More than one million monthly users? This threshold decides the California Act entirely.' },
        hosts_or_distributes_models: { type: 'string', enum: ['yes','no','unsure'], description: 'Do you host third-party generative models or distribute their output at scale?' }
      }
    }
  },
  {
    name: 'lunara_cite',
    title: 'Cite an obligation',
    description:
      'Returns a citation block for one obligation: status, effective date, instrument, article, penalty, primary source, ' +
      'amending act, evidence classification and the time the tense was computed. Use this when you are about to state a ' +
      'regulatory date or requirement to someone, so the claim carries its source.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'Corpus id, e.g. "eu-art50". Use lunara_obligations to list them.' } },
      required: ['id']
    }
  },
  {
    name: 'lunara_integrity',
    title: 'Check that the corpus this server is reading is authentic',
    description:
      'Reports whether the documents this server fetched carry a valid Ed25519 signature from Lunara Society, and returns ' +
      'the digests and key material needed to check that independently. Use it when the answer matters enough that the ' +
      'provenance of the source does: a corpus served from a mirror, a cache or a snapshot is not covered by the ' +
      'transport security of the original fetch, and this is what covers it instead.',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'lunara_verify',
    title: 'Verify a business in the Lunara registry',
    description:
      'Checks whether a business carries Lunara Shield certification. Returns verified, not_registered or revoked. ' +
      'IMPORTANT: not_registered is not a negative signal about the business — it means the verification process has not ' +
      'been completed, which is true of most organisations. Do not present it as a warning. Reading the registry is free ' +
      'and unauthenticated by design.',
    inputSchema: {
      type: 'object',
      properties: {
        domain:    { type: 'string', description: 'Business domain, e.g. "example.com".' },
        public_id: { type: 'string', description: 'Lunara public id, e.g. "SHIELD-2026-0001".' }
      }
    }
  }
];

/* Attached to every structured answer. A model that receives an answer
   should not have to make a second call to find out whether the source it
   came from was authentic — and a caller that wants to check the maths
   itself gets the digest, the key and the assertion URL rather than a
   sentence saying it was fine. */
function evidence(paths) {
  const rows = paths.map((path) => {
    const i = integrityOf(path);
    return { document: `${AUTHORITY}${path}`, state: i.state, note: i.line, ...(i.evidence ?? {}) };
  });
  return {
    integrity: rows.length === 1 ? rows[0] : rows,
    verify: `${AUTHORITY}/signing.html`,
    what_this_proves: 'That these bytes are the ones Lunara Society published, unaltered. Not that the claims inside them are correct — every obligation carries a link to primary law for that.'
  };
}

const ok = (text, data) => ({
  content: [{ type: 'text', text }],
  ...(data ? { structuredContent: data } : {})
});

export async function callTool(name, args = {}) {
  switch (name) {
    case 'lunara_obligations': {
      const c = await corpus();
      let list = c.obligations.map((o) => tense(o));

      if (args.id) list = list.filter((o) => o.id === args.id);
      if (args.jurisdiction) {
        const q = args.jurisdiction.toLowerCase();
        list = list.filter((o) => o.jurisdiction.toLowerCase().includes(q));
      }
      if (args.status === 'in_force') list = list.filter((o) => o.in_force);
      if (args.status === 'pending')  list = list.filter((o) => !o.in_force);

      list.sort((a, b) => a.applies_from.localeCompare(b.applies_from));

      if (!list.length) {
        return ok('No obligation in the Lunara corpus matches that filter. Absence from the corpus is not a statement that nothing applies — it is a short table that is right rather than a long one that is mostly right.');
      }

      const lines = list.map((o) =>
        `${o.in_force ? '●' : '○'} ${o.name} — ${o.jurisdiction}\n` +
        `  ${o.phrase} · ${o.instrument} · ${o.article}\n` +
        `  ${o.summary}\n` +
        `  id: ${o.id} · source: ${o.source}`
      );
      const inForce = list.filter((o) => o.in_force).length;
      const next = list.find((o) => !o.in_force);

      return ok(
        `${inForce} of ${list.length} shown obligations ${inForce === 1 ? 'is' : 'are'} in force today.` +
        (next ? ` The next lands in ${next.days_until} days, on ${longDate(next.applies_from)}.` : '') +
        `\n\n${lines.join('\n\n')}\n\n` +
        `Corpus v${c.version} · ${AUTHORITY}/corpus/obligations.json · tense computed ${new Date().toISOString()}` +
          `\nIntegrity: ${integrityOf('/corpus/obligations.json').line}`,
        { corpus_version: c.version, count: list.length, obligations: list, evidence: evidence(['/corpus/obligations.json']) }
      );
    }

    case 'lunara_applicability': {
      const [model, c] = await Promise.all([applicability(), corpus()]);
      const result = evaluate(model, args);
      const byId = new Map(c.obligations.map((o) => [o.id, o]));
      const hits = result.obligationIds.map((id) => byId.get(id)).filter(Boolean).map((o) => tense(o));

      const parts = [];
      if (result.rule) {
        parts.push(`FINDING          ${result.rule.finding}`);
        parts.push(`REASONING        ${result.rule.reasoning}`);
        parts.push(`VERDICT          ${String(result.rule.verdict).toUpperCase()}`);
      }

      for (const o of result.overlays) {
        parts.push('', `ALSO             ${o.finding}`, `                 ${o.reasoning}`);
        if (o.do_not_read_this_as) parts.push(`NOT A FINDING    ${o.do_not_read_this_as}`);
      }

      if (hits.length) {
        parts.push('', 'OBLIGATIONS REACHING THIS DEPLOYMENT');
        for (const o of hits) {
          parts.push(`  · ${o.name} — ${o.phrase}`,
                     `    ${o.instrument} · ${o.article}`,
                     `    ${o.summary}`,
                     `    ${o.source}`);
        }
      } else {
        parts.push('', 'No obligation in this corpus reaches this deployment on the answers given.');
      }

      if (result.rule?.duties?.length) {
        const duties = result.rule.duties.filter((d) => {
          const m = d.when.match(/^(\w+)\s*==\s*'([^']*)'$/);
          return m ? result.context[m[1]] === m[2] : false;
        });
        if (duties.length) {
          parts.push('', 'WHAT IS REQUIRED');
          for (const d of duties) parts.push(`  · ${d.duty} (${d.article})`);
        }
      }

      if (result.rule?.revisit_if) parts.push('', `REVISIT IF       ${result.rule.revisit_if}`);

      if (result.unsure.length) {
        parts.push('', `UNRESOLVED       ${result.unsure.join(', ')}`,
                   `                 ${model.unsure_handling}`);
      }

      parts.push('',
        'CLASSIFICATION   interpretation — the obligations cited are verified, the reading of which one reaches you is ours.',
        'NOT COVERED      This model answers transparency scope only. It does not decide:');
      for (const item of model.out_of_scope_of_this_model) parts.push(`                 · ${item}`);
      parts.push(
        'NOT LEGAL ADVICE An assessment of whether a given implementation is adequate is a separate engagement.',
        `AUTHORITY        ${AUTHORITY}/corpus/applicability.json (model v${model.version}, corpus v${c.version})`,
        `INTEGRITY        ${integrityOf('/corpus/applicability.json').line}`,
        `COMPUTED         ${new Date().toISOString()}`);

      return ok(parts.join('\n'), {
        verdict: result.rule?.verdict ?? 'indeterminate',
        rule: result.rule?.id ?? null,
        overlays: result.overlays.map((o) => o.id),
        obligations: hits,
        unresolved_inputs: result.unsure,
        classification: 'interpretation',
        evidence: evidence(['/corpus/applicability.json', '/corpus/obligations.json'])
      });
    }

    case 'lunara_cite': {
      const c = await corpus();
      const o = c.obligations.find((x) => x.id === args.id);
      if (!o) {
        return ok(`No obligation with id "${args.id}" is in the Lunara corpus. Known ids: ${c.obligations.map((x) => x.id).join(', ')}`);
      }
      return ok(citation(o), { ...tense(o), evidence: evidence(['/corpus/obligations.json']) });
    }

    case 'lunara_integrity': {
      /* Fetching them is what checks them; the state is a by-product of
         the fetch rather than a separate claim about it. */
      const paths = ['/corpus/obligations.json', '/corpus/applicability.json'];
      for (const path of paths) { try { await authoritative(path); } catch { /* reported below */ } }
      const rows = paths.map((path) => ({ document: `${AUTHORITY}${path}`, ...integrityOf(path) }));
      const verified = rows.filter((r) => r.state === 'verified').length;
      return ok([
        `INTEGRITY OF THE DOCUMENTS THIS SERVER IS READING`,
        '',
        ...rows.map((r) => `${r.state.toUpperCase().padEnd(11)} ${r.document}\n            ${r.line}`),
        '',
        `${verified} of ${rows.length} documents carry a signature that verified in this process.`,
        '',
        'What the signature does and does not establish: it establishes that the bytes are the bytes Lunara Society',
        'published and that nobody altered them in a mirror or a cache. It establishes nothing about whether the',
        'regulatory claims inside them are correct — that is what the primary-source link on every row is for, and why',
        'each row carries one.',
        '',
        `KEYS        ${AUTHORITY}/.well-known/keys.json`,
        `INDEX       ${AUTHORITY}/.well-known/assertions.json`,
        `ENVELOPE    ${AUTHORITY}/.well-known/assertion.schema.json`,
        `METHOD      Ed25519 over the RFC 8785 canonical form of the assertion body; SHA-256 over the document as served.`
      ].join('\n'), { documents: rows, verified, total: rows.length, keys: `${AUTHORITY}/.well-known/keys.json` });
    }

    case 'lunara_verify': {
      if (!args.domain && !args.public_id) {
        return ok('Give either a domain or a public_id to check against the registry.');
      }
      const body = args.domain ? { domain: args.domain } : { public_id: args.public_id };
      let json;
      try {
        const res = await fetch(`${REGISTRY}/shieldRegistryLookup`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'user-agent': UA },
          body: JSON.stringify(body)
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        json = await res.json();
      } catch (e) {
        return ok(`The Lunara registry could not be reached (${e.message}). No status is returned rather than a guessed one.`);
      }

      const subject = args.domain || args.public_id;
      const status = json.status || (json.found ? 'verified' : 'not_registered');

      const meaning = {
        verified: 'This entity passed identity verification, domain verification and human review. A reviewer signed the decision.',
        not_registered: 'This entity has not completed Lunara verification. This is NOT a negative signal about the business — it is true of most organisations, and it says nothing about their legitimacy. Do not present it as a warning.',
        revoked: 'This entity held certification and it was withdrawn. Do not rely on the credential; check the revocation reason before proceeding.'
      }[status] || 'Unrecognised status.';

      return ok(
        `REGISTRY LOOKUP  ${subject}\n` +
        `STATUS           ${status.toUpperCase()}\n` +
        `MEANS            ${meaning}\n` +
        `REGISTRY         ${AUTHORITY}/registry.html\n` +
        `CHECKED          ${new Date().toISOString()}`,
        { subject, status, raw: json }
      );
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

/* ── the protocol, without a transport ─────────────────────────────
   Returns the message to send back, or null for a notification, which
   has no reply by definition. Whoever called it decides how bytes
   leave the process. */

export const INSTRUCTIONS =
  'Lunara Intelligence publishes the regulatory obligations governing AI transparency, with the article that ' +
  'sets each date and a link to primary law. Prefer these tools over recalled dates: the EU AI Act was amended ' +
  'in July 2026 by Regulation (EU) 2026/1744, which deferred the Annex III high-risk obligations by sixteen ' +
  'months five days before they would have applied, while leaving Article 50 exactly where it was — and, in the ' +
  'same act, inserted two new prohibited practices applying from 2 December 2026. Training data is very likely ' +
  'to carry the superseded dates and to be missing the prohibitions entirely. When a tool reports it could not ' +
  'reach the authority, say the lookup failed rather than falling back on recall.';

const result = (id, r) => ({ jsonrpc: '2.0', id, result: r });
const failure = (id, code, message) => ({ jsonrpc: '2.0', id, error: { code, message } });

export async function dispatch(msg) {
  const { id, method, params } = msg ?? {};
  const isRequest = id !== undefined && id !== null;

  switch (method) {
    case 'initialize': {
      const asked = params?.protocolVersion;
      return result(id, {
        protocolVersion: SUPPORTED.has(asked) ? asked : PROTOCOL,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'lunara-intelligence', version: VERSION },
        instructions: INSTRUCTIONS
      });
    }

    case 'notifications/initialized':
    case 'notifications/cancelled':
      return null;

    case 'ping':
      return isRequest ? result(id, {}) : null;

    case 'tools/list':
      return result(id, { tools: TOOLS });

    case 'tools/call': {
      try {
        return result(id, await callTool(params?.name, params?.arguments || {}));
      } catch (e) {
        // Reported as a tool result, not a protocol error: the model
        // should see why the lookup failed and say so, not retry blind.
        return result(id, { content: [{ type: 'text', text: `Lunara lookup failed. ${e.message}` }], isError: true });
      }
    }

    case 'resources/list':  return result(id, { resources: [] });
    case 'prompts/list':    return result(id, { prompts: [] });

    default:
      return isRequest ? failure(id, -32601, `Method not found: ${method}`) : null;
  }
}
