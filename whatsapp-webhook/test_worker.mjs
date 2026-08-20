import worker from './worker.mjs';

const VERIFY = 'EXAMPLE_VERIFY_TOKEN_not_a_real_one';
const SECRET = 'test_app_secret_abc123';
const ctx = { waitUntil: (p) => p };
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

console.log('\nOther methods');
{
  const r = await worker.fetch(new Request('https://w.example/', { method: 'DELETE' }),
    { WHATSAPP_VERIFY_TOKEN: VERIFY }, ctx);
  check('DELETE is 405 with allow header', r.status === 405 && r.headers.get('allow') === 'GET, POST', 'status=' + r.status);
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
