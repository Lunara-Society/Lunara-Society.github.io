import worker from './worker.mjs';

const VERIFY = 'EXAMPLE_VERIFY_TOKEN_not_a_real_one';
const SECRET = 'test_app_secret_abc123';
/* The Worker acknowledges Meta first and answers inside ctx.waitUntil, so
   worker.fetch() returns before any reply has been sent. A test that does
   not await that background work asserts on nothing — and worse, one case's
   fetches land in the middle of the next one. `settle()` drains it. */
const pending = [];
const ctx = { waitUntil: (p) => { pending.push(p); return p; } };
const settle = async () => { await Promise.allSettled(pending.splice(0)); };
let pass = 0, fail = 0;

function check(name, cond, detail = '') {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (detail ? '  ' + detail : '')); }
}

async function sign(secret, body) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
  return 'sha256=' + [...new Uint8Array(mac)].map(b => b.toString(16).padStart(2, '0')).join('');
}

const G = (qs) => new Request('https://w.example/?' + qs, { method: 'GET' });
const P = (body, sig) => new Request('https://w.example/', {
  method: 'POST', body,
  headers: sig ? { 'x-hub-signature-256': sig } : {}
});

console.log('\nGET — Meta verification handshake');
{
  const env = { WHATSAPP_VERIFY_TOKEN: VERIFY };
  let r = await worker.fetch(G('hub.mode=subscribe&hub.verify_token=' + VERIFY + '&hub.challenge=1158201444'), env, ctx);
  check('correct token echoes challenge', r.status === 200 && (await r.clone().text()) === '1158201444', 'status=' + r.status);
  check('content-type is text/plain', /text\/plain/.test(r.headers.get('content-type')), r.headers.get('content-type'));

  r = await worker.fetch(G('hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=1158201444'), env, ctx);
  check('wrong token is 403', r.status === 403, 'status=' + r.status);

  r = await worker.fetch(G('hub.mode=unsubscribe&hub.verify_token=' + VERIFY + '&hub.challenge=x'), env, ctx);
  check('wrong mode is 403', r.status === 403, 'status=' + r.status);

  // near-miss: correct prefix, wrong length — must not pass
  r = await worker.fetch(G('hub.mode=subscribe&hub.verify_token=' + VERIFY.slice(0, -1) + '&hub.challenge=x'), env, ctx);
  check('truncated token is 403', r.status === 403, 'status=' + r.status);

  r = await worker.fetch(G('hub.mode=subscribe&hub.verify_token=x&hub.challenge=y'), {}, ctx);
  check('unconfigured worker is 500 not 403', r.status === 500, 'status=' + r.status);
}

console.log('\nPOST — signature enforcement');
{
  const body = JSON.stringify({ entry: [{ changes: [{ value: { messages: [
    { from: '46700000000', type: 'text', id: 'wamid.TEST1', text: { body: 'Hola' } }] } }] }] });
  const env = { WHATSAPP_VERIFY_TOKEN: VERIFY, WHATSAPP_APP_SECRET: SECRET };

  let r = await worker.fetch(P(body, await sign(SECRET, body)), env, ctx);
  check('valid signature accepted', r.status === 200 && (await r.clone().text()) === 'EVENT_RECEIVED', 'status=' + r.status);

  r = await worker.fetch(P(body, await sign('wrong_secret', body)), env, ctx);
  check('signature from wrong secret rejected', r.status === 403, 'status=' + r.status);

  r = await worker.fetch(P(body, null), env, ctx);
  check('missing signature rejected', r.status === 403, 'status=' + r.status);

  // tampered body, original signature
  r = await worker.fetch(P(body.replace('Hola', 'Adios'), await sign(SECRET, body)), env, ctx);
  check('tampered body rejected', r.status === 403, 'status=' + r.status);

  // no secret configured -> accept (setup mode)
  r = await worker.fetch(P(body, null), { WHATSAPP_VERIFY_TOKEN: VERIFY }, ctx);
  check('accepts unsigned when no secret set', r.status === 200, 'status=' + r.status);
}

console.log('\nPOST — payload handling');
{
  const env = { WHATSAPP_VERIFY_TOKEN: VERIFY };
  let r = await worker.fetch(P('not json{{', null), env, ctx);
  check('malformed JSON still returns 200', r.status === 200, 'status=' + r.status);

  r = await worker.fetch(P(JSON.stringify({}), null), env, ctx);
  check('empty payload survives', r.status === 200, 'status=' + r.status);

  r = await worker.fetch(P(JSON.stringify({ entry: [{ changes: [{ value: {
    statuses: [{ id: 'wamid.S', status: 'delivered' }] } }] }] }), null), env, ctx);
  check('status update survives', r.status === 200, 'status=' + r.status);

  // KV write path
  const store = {};
  const kv = { put: async (k, v) => { store[k] = v; } };
  await worker.fetch(P(JSON.stringify({ entry: [{ changes: [{ value: { messages: [
    { from: '46700000000', type: 'text', id: 'wamid.KV1', text: { body: 'saved?' } }] } }] }] }), null),
    { WHATSAPP_VERIFY_TOKEN: VERIFY, MESSAGES: kv }, ctx);
  check('writes to KV when bound', JSON.parse(store['msg:wamid.KV1'] || '{}').text === 'saved?', JSON.stringify(store));
}

/* ─── Replying ──────────────────────────────────────────────────────
   The first version of this Worker received messages and never sent
   one. Rosario now runs inside it, so these cover both halves: that she
   is asked correctly, and that every failure still produces a message
   rather than silence. */
console.log('\nPOST — Rosario replying');
{
  const realFetch = globalThis.fetch;
  const calls = [];

  const CORPUS = {
    version: '1.0.0',
    obligations: [
      { id: 'eu-art50', name: 'Article 50 transparency obligations',
        jurisdiction: 'European Union', applies_from: '2026-08-02',
        instrument: 'EU AI Act, Regulation (EU) 2024/1689',
        article: 'Art. 113 — general application',
        summary: 'AI systems must disclose that they are AI.',
        penalty: 'Up to EUR 15,000,000 or 3% of worldwide annual turnover',
        source: 'https://eur-lex.europa.eu/eli/reg/2024/1689/oj/eng', amended_by: null },
      { id: 'eu-art50-legacy', name: 'Article 50(2) marking for systems already on the market',
        jurisdiction: 'European Union', applies_from: '2026-12-02',
        instrument: 'EU AI Act 2024/1689, as amended by Regulation (EU) 2026/1744',
        article: 'Art. 50(2), four-month transitional period',
        summary: 'Relief expires and marking becomes mandatory.', penalty: null,
        source: 'https://eur-lex.europa.eu/eli/reg/2024/1689/oj/eng',
        amended_by: 'https://eur-lex.europa.eu/eli/reg/2026/1744/oj/eng' }
    ]
  };

  const mock = ({ corpusOk = true, claude = 'Marking falls due 2 December 2026.',
                  claudeStatus = 200, sendOk = true, stopReason = 'end_turn' } = {}) => {
    globalThis.fetch = async (url, init) => {
      const u = String(url);
      calls.push({ url: u, init, body: init?.body ? JSON.parse(init.body) : null });
      if (u.includes('/corpus/obligations.json')) {
        return corpusOk
          ? new Response(JSON.stringify(CORPUS), { status: 200 })
          : new Response('nope', { status: 503 });
      }
      if (u.includes('api.anthropic.com')) {
        if (claudeStatus !== 200) return new Response('{"error":{"message":"bad"}}', { status: claudeStatus });
        return new Response(JSON.stringify({
          stop_reason: stopReason,
          stop_details: stopReason === 'refusal' ? { category: 'cyber' } : null,
          content: stopReason === 'refusal' ? [] : [{ type: 'text', text: claude }]
        }), { status: 200 });
      }
      if (u.includes('graph.facebook.com')) {
        return sendOk
          ? new Response('{"messages":[{"id":"wamid.OUT"}]}', { status: 200 })
          : new Response('{"error":{"message":"Re-engagement message outside 24 hour window"}}', { status: 400 });
      }
      throw new Error('unexpected fetch: ' + u);
    };
  };

  const inbound = (text, type = 'text') => JSON.stringify({
    entry: [{ changes: [{ value: { messages: [{
      from: '50577659187', id: 'wamid.T' + calls.length, type,
      ...(type === 'text' ? { text: { body: text } } : {})
    }] } }] }]
  });

  const env = { ANTHROPIC_API_KEY: 'sk-test', WHATSAPP_TOKEN: 'tok', GRAPH_VERSION: 'v22.0' };
  const sent = () => calls.filter(c => c.url.includes('graph.facebook.com')).pop();
  const asked = () => calls.filter(c => c.url.includes('api.anthropic.com')).pop();

  // happy path
  calls.length = 0; mock();
  await worker.fetch(P(inbound('when is the marking deadline?')), env, ctx); await settle();
  check('fetches the corpus before answering',
    calls.some(c => c.url.includes('/corpus/obligations.json')));
  check('sends her answer to the sender',
    sent()?.body?.to === '50577659187' &&
    sent()?.body?.text?.body === 'Marking falls due 2 December 2026.',
    JSON.stringify(sent()?.body));
  check('uses the phone number ID for +505 5836 5522',
    sent()?.url.includes('/1299096859948214/messages'), sent()?.url);

  // request shape — the things that 400 on Opus 5 if got wrong
  const req = asked();
  check('calls Claude with the api key header', req?.init?.headers?.['x-api-key'] === 'sk-test');
  check('sends anthropic-version', Boolean(req?.init?.headers?.['anthropic-version']));
  check('model defaults to claude-opus-5', req?.body?.model === 'claude-opus-5', req?.body?.model);
  check('does NOT send temperature or top_p — both are rejected on Opus 5',
    !('temperature' in (req?.body ?? {})) && !('top_p' in (req?.body ?? {})));
  check('does NOT send budget_tokens — removed on Opus 5',
    !JSON.stringify(req?.body?.thinking ?? {}).includes('budget_tokens'));
  check('passes the user text through', req?.body?.messages?.at(-1)?.content === 'when is the marking deadline?');

  // the system prompt has to carry the live corpus and the traps
  const sys = req?.body?.system ?? '';
  check('system prompt carries the live corpus dates', /2 December 2026/.test(sys));
  check('system prompt computes tense', /IN FORCE since|PENDING/.test(sys));
  check('system prompt warns off February 2027', /not February 2027/.test(sys));
  check('system prompt forbids claiming infallibility', /never make mistakes/i.test(sys));
  check('system prompt states the California threshold', /ONE MILLION monthly/.test(sys));
  check('system prompt requires disclosing she is an AI', /Never claim to be human/.test(sys));

  // corpus down — must refuse rather than answer from memory
  calls.length = 0; mock({ corpusOk: false });
  await worker.fetch(P(inbound('what binds us?')), env, ctx); await settle();
  check('corpus down still sends a message', Boolean(sent()));
  check('and that message refuses to answer from memory',
    /not answer from memory|could not reach the obligation corpus/i.test(sent()?.body?.text?.body ?? ''),
    sent()?.body?.text?.body);
  check('corpus down never reaches Claude', !calls.some(c => c.url.includes('api.anthropic.com')));

  // Claude erroring — still a message, never silence
  calls.length = 0; mock({ claudeStatus: 500 });
  await worker.fetch(P(inbound('hello')), env, ctx); await settle();
  check('a failed model call still sends something', Boolean(sent()));
  check('and says so rather than guessing',
    /went wrong|rather say that/i.test(sent()?.body?.text?.body ?? ''), sent()?.body?.text?.body);

  // refusal is a 200, not an exception
  calls.length = 0; mock({ stopReason: 'refusal' });
  await worker.fetch(P(inbound('something disallowed')), env, ctx); await settle();
  check('a refusal is handled as a normal reply',
    /not able to answer that one/i.test(sent()?.body?.text?.body ?? ''), sent()?.body?.text?.body);

  // no key
  calls.length = 0; mock();
  await worker.fetch(P(inbound('hello')), { WHATSAPP_TOKEN: 'tok' }, ctx); await settle();
  check('without a key she says she cannot think, not nothing',
    /not yet able to think/i.test(sent()?.body?.text?.body ?? ''), sent()?.body?.text?.body);

  // non-text
  calls.length = 0; mock();
  await worker.fetch(P(inbound(null, 'image')), env, ctx); await settle();
  check('an image gets told text only', /only read text/i.test(sent()?.body?.text?.body ?? ''));
  check('an image never reaches Claude', !calls.some(c => c.url.includes('api.anthropic.com')));

  // long answers
  calls.length = 0; mock({ claude: 'x'.repeat(9000) });
  await worker.fetch(P(inbound('everything')), env, ctx); await settle();
  check('a long answer is trimmed below WhatsApp\'s 4096 limit',
    (sent()?.body?.text?.body?.length ?? 0) <= 4096, 'len=' + sent()?.body?.text?.body?.length);

  // send refused
  calls.length = 0; mock({ sendOk: false });
  let threw = false;
  try { await worker.fetch(P(inbound('hi')), env, ctx); await settle(); } catch { threw = true; }
  check('a refused send does not take the Worker down', !threw);

  // conversation memory when KV is bound
  const store = new Map();
  const kvEnv = { ...env, MESSAGES: {
    get: async (k) => store.get(k) ?? null,
    put: async (k, v) => { store.set(k, v); }
  } };
  calls.length = 0; mock({ claude: 'First answer.' });
  await worker.fetch(P(inbound('first question')), kvEnv, ctx); await settle();
  mock({ claude: 'Second answer.' });
  await worker.fetch(P(inbound('and the follow up?')), kvEnv, ctx); await settle();
  const second = asked();
  check('remembers the earlier turn when KV is bound',
    (second?.body?.messages?.length ?? 0) >= 3,
    'turns=' + (second?.body?.messages?.length ?? 0));

  globalThis.fetch = realFetch;
}

console.log('\nOther methods');
{
  const r = await worker.fetch(new Request('https://w.example/', { method: 'DELETE' }),
    { WHATSAPP_VERIFY_TOKEN: VERIFY }, ctx);
  check('DELETE is 405 with allow header', r.status === 405 && r.headers.get('allow') === 'GET, POST', 'status=' + r.status);
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
