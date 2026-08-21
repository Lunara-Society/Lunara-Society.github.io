/* End-to-end exercise of the server over real stdio. Spawns it the way a
   client does, speaks JSON-RPC at it, and asserts on what comes back. */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const AUTHORITY = process.env.LUNARA_AUTHORITY || 'https://lunarasociety.com';

const child = spawn(process.execPath, [join(HERE, '..', 'server.mjs')], {
  stdio: ['pipe', 'pipe', 'inherit'],
  env: { ...process.env, LUNARA_AUTHORITY: AUTHORITY }
});

let buf = '';
const waiting = new Map();
child.stdout.on('data', (d) => {
  buf += d;
  let i;
  while ((i = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, i).trim();
    buf = buf.slice(i + 1);
    if (!line) continue;
    const msg = JSON.parse(line);
    if (msg.id != null && waiting.has(msg.id)) { waiting.get(msg.id)(msg); waiting.delete(msg.id); }
  }
});

let seq = 0;
const rpc = (method, params) => new Promise((res) => {
  const id = ++seq;
  waiting.set(id, res);
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
});
const notify = (method) => child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method }) + '\n');

let failures = 0;
const check = (name, cond, detail) => {
  if (cond) { console.log(`  ok   ${name}`); }
  else { failures++; console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`); }
};

const init = await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'smoke', version: '0' } });
check('initialize returns protocol version', init.result?.protocolVersion === '2025-06-18', JSON.stringify(init));
check('initialize names the server', init.result?.serverInfo?.name === 'lunara-intelligence');
check('initialize warns about superseded training data', /2026\/1744/.test(init.result?.instructions || ''));
notify('notifications/initialized');

const list = await rpc('tools/list');
const names = (list.result?.tools || []).map((t) => t.name);
check('four tools advertised', names.length === 4, names.join(','));
check('tools have input schemas', (list.result.tools || []).every((t) => t.inputSchema?.type === 'object'));

const all = await rpc('tools/call', { name: 'lunara_obligations', arguments: {} });
const allText = all.result?.content?.[0]?.text || '';
check('obligations returns all nine', all.result?.structuredContent?.count === 9, allText.slice(0, 200));
check('obligations computes tense', /in force today/.test(allText));
check('obligations cites primary law', /eur-lex\.europa\.eu/.test(allText));
check('obligations is not an error', !all.result?.isError, allText.slice(0, 300));

const eu = await rpc('tools/call', { name: 'lunara_obligations', arguments: { jurisdiction: 'European Union', status: 'pending' } });
const euList = eu.result?.structuredContent?.obligations || [];
check('pending filter returns only future dates', euList.length > 0 && euList.every((o) => !o.in_force), JSON.stringify(euList.map(o=>o.id)));

const cite = await rpc('tools/call', { name: 'lunara_cite', arguments: { id: 'eu-annex3' } });
const citeText = cite.result?.content?.[0]?.text || '';
check('cite names the amending instrument', /2026\/1744/.test(citeText), citeText);
check('cite links the amending act', /AMENDED BY/.test(citeText));
check('cite carries the evidence classification', /CLASSIFICATION\s+verified/.test(citeText));

const bad = await rpc('tools/call', { name: 'lunara_cite', arguments: { id: 'nope' } });
check('unknown id lists known ids instead of failing', /eu-art50/.test(bad.result?.content?.[0]?.text || ''));

// The verdict that matters most: the model must be willing to say no.
const clear = await rpc('tools/call', { name: 'lunara_applicability', arguments: { interacts_with_people: 'no', generates_content: 'no', eu_exposure: 'no' } });
const clearText = clear.result?.content?.[0]?.text || '';
check('applicability can conclude nothing binds', clear.result?.structuredContent?.verdict === 'no_obligation', clearText.slice(0, 300));
check('no-obligation answer cites no obligations', (clear.result?.structuredContent?.obligations || []).length === 0);

const caught = await rpc('tools/call', { name: 'lunara_applicability', arguments: { interacts_with_people: 'yes', generates_content: 'yes', eu_exposure: 'yes', on_market_before_art50: 'yes' } });
const caughtText = caught.result?.content?.[0]?.text || '';
const caughtIds = (caught.result?.structuredContent?.obligations || []).map((o) => o.id);
check('applicability catches Article 50', caughtIds.includes('eu-art50'), caughtIds.join(','));
check('legacy overlay adds the 50(2) transitional date', caughtIds.includes('eu-art50-legacy'), caughtIds.join(','));
check('states both duties', /Disclosure\./.test(caughtText) && /Marking\./.test(caughtText));
check('marks itself interpretation', /interpretation/.test(caughtText));

// The published correction, encoded: below the threshold, the CA Act binds nothing.
const below = await rpc('tools/call', { name: 'lunara_applicability', arguments: { generates_content: 'yes', eu_exposure: 'no', california_exposure: 'yes', monthly_users_over_1m: 'no' } });
const belowIds = (below.result?.structuredContent?.obligations || []).map((o) => o.id);
check('California Act does not attach below one million users', !belowIds.includes('ca-sb942'), belowIds.join(','));

const above = await rpc('tools/call', { name: 'lunara_applicability', arguments: { generates_content: 'yes', california_exposure: 'yes', monthly_users_over_1m: 'yes', eu_exposure: 'no' } });
check('California Act attaches above the threshold',
  (above.result?.structuredContent?.obligations || []).map((o) => o.id).includes('ca-sb942'));

const unsure = await rpc('tools/call', { name: 'lunara_applicability', arguments: { interacts_with_people: 'yes' } });
check('unsure inputs are reported, not resolved', /UNRESOLVED/.test(unsure.result?.content?.[0]?.text || ''));

const ver = await rpc('tools/call', { name: 'lunara_verify', arguments: { domain: 'example.com' } });
const verText = ver.result?.content?.[0]?.text || '';
check('verify returns a status', /STATUS\s+NOT_REGISTERED/.test(verText), verText.slice(0, 200));
check('verify refuses to smear the unregistered', /NOT a negative signal/.test(verText));

const unknown = await rpc('tools/call', { name: 'lunara_nope', arguments: {} });
check('unknown tool is an error result', unknown.result?.isError === true);

// A down authority must produce a refusal, never a remembered date.
const offline = spawn(process.execPath, [join(HERE, '..', 'server.mjs')], {
  stdio: ['pipe', 'pipe', 'inherit'],
  env: { ...process.env, LUNARA_AUTHORITY: 'http://127.0.0.1:9' }
});
let obuf = '';
const offlineDone = new Promise((res) => {
  offline.stdout.on('data', (d) => {
    obuf += d;
    for (const l of obuf.split('\n')) {
      if (!l.trim()) continue;
      const m = JSON.parse(l);
      if (m.id === 2) res(m);
    }
  });
});
offline.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } }) + '\n');
offline.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'lunara_obligations', arguments: {} } }) + '\n');
const off = await offlineDone;
const offText = off.result?.content?.[0]?.text || '';
check('unreachable authority returns an error, not a guess', off.result?.isError === true, offText.slice(0, 160));
check('unreachable authority explains why it will not guess', /stale|amended/.test(offText), offText.slice(0, 200));
offline.kill();

child.kill();
console.log(failures ? `\n${failures} check(s) failed\n` : '\nall checks passed\n');
process.exit(failures ? 1 : 0);
