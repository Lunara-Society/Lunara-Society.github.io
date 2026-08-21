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
   one. It verified, it logged, and to anyone holding a phone it was
   indistinguishable from a broken endpoint. These cover the half that
   was missing. */
console.log('\nPOST — replying');
{
  const realFetch = globalThis.fetch;
  const calls = [];
  const mock = (rosarioReply, sendOk = true) => {
    globalThis.fetch = async (url, init) => {
      const u = String(url);
      calls.push({ url: u, body: init?.body ? JSON.parse(init.body) : null });
      if (u.includes('graph.facebook.com')) {
        return sendOk
          ? new Response('{"messages":[{"id":"wamid.OUT"}]}', { status: 200 })
          : new Response('{"error":{"message":"Re-engagement message outside 24 hour window"}}', { status: 400 });
      }
      if (rosarioReply === null) throw new Error('connection refused');
      return new Response(JSON.stringify({ reply: rosarioReply }), { status: 200 });
    };
  };

  const inbound = (text, type = 'text') => JSON.stringify({
    entry: [{ changes: [{ value: { messages: [{
      from: '50577659187', id: 'wamid.T' + calls.length, type,
      ...(type === 'text' ? { text: { body: text } } : {})
    }] } }] }]
  });

  const env = {
    ROSARIO_ENDPOINT: 'https://rosario.example/whatsapp',
    WHATSAPP_TOKEN: 'tok',
    WHATSAPP_PHONE_NUMBER_ID: '999',
    GRAPH_VERSION: 'v22.0'
  };

  // happy path
  calls.length = 0; mock('Marking falls due 2 December 2026.');
  await worker.fetch(P(inbound('when is the deadline?')), env, ctx); await settle();
  const asked = calls.find(c => c.url.includes('rosario.example'));
  const sent  = calls.find(c => c.url.includes('graph.facebook.com'));
  check('asks Rosario with sender and text',
    asked?.body?.sender === '50577659187' && asked?.body?.text === 'when is the deadline?',
    JSON.stringify(asked?.body));
  check('sends her answer back to the sender',
    sent?.body?.to === '50577659187' && sent?.body?.text?.body === 'Marking falls due 2 December 2026.',
    JSON.stringify(sent?.body));
  check('uses the configured graph version',
    sent?.url.includes('/v22.0/999/messages'), sent?.url);

  // Rosario unreachable — must still say something, and that something
  // must be that the lookup failed. Silence would let the sender assume
  // the last thing they were told still stands.
  calls.length = 0; mock(null);
  await worker.fetch(P(inbound('is Article 50 in force?')), env, ctx); await settle();
  const fallback = calls.find(c => c.url.includes('graph.facebook.com'));
  check('unreachable Rosario still gets a reply out', Boolean(fallback));
  check('and that reply refuses to answer from memory',
    /could not reach|not answer a regulatory question from memory/i.test(fallback?.body?.text?.body ?? ''),
    fallback?.body?.text?.body);

  // non-text
  calls.length = 0; mock('unused');
  await worker.fetch(P(inbound(null, 'image')), env, ctx); await settle();
  const img = calls.find(c => c.url.includes('graph.facebook.com'));
  check('an image gets told text only, not silence',
    /only read text/i.test(img?.body?.text?.body ?? ''), img?.body?.text?.body);
  check('an image does not wake Rosario', !calls.some(c => c.url.includes('rosario.example')));

  // over WhatsApp's 4096 limit — a body that long is rejected outright,
  // so an untrimmed long answer is lost entirely rather than cut short.
  calls.length = 0; mock('x'.repeat(9000));
  await worker.fetch(P(inbound('tell me everything')), env, ctx); await settle();
  const long = calls.find(c => c.url.includes('graph.facebook.com'));
  check('a long answer is trimmed below the 4096 limit',
    (long?.body?.text?.body?.length ?? 0) <= 4096, 'len=' + long?.body?.text?.body?.length);

  // send refused — must not throw, must log
  calls.length = 0; mock('anything', false);
  let threw = false;
  try { await worker.fetch(P(inbound('hello')), env, ctx); await settle(); } catch { threw = true; }
  check('a refused send does not take the Worker down', !threw);

  // no credentials — receives, cannot send, says so
  calls.length = 0; mock('hi');
  await worker.fetch(P(inbound('hello')), { ROSARIO_ENDPOINT: env.ROSARIO_ENDPOINT }, ctx); await settle();
  check('without a token nothing is sent to Meta',
    !calls.some(c => c.url.includes('graph.facebook.com')));

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
