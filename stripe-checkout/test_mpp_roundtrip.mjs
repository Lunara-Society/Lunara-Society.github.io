/* Round trip of agent-pay.mjs with the real mppx library on both sides
   (server challenge, client credential) and Stripe replaced by a fake that
   honours idempotency keys as Stripe does. Nothing leaves this machine.

   Not run in CI, which installs nothing. To run it:
     cd stripe-checkout && npm i --no-save mppx@0.13.5 && node test_mpp_roundtrip.mjs */
import { Mppx as MppxServer, stripe as serverStripe } from 'mppx/server';
import { Mppx as MppxClient, stripe as clientStripe } from 'mppx/client';
import { Receipt } from 'mppx';
import { handleAgentPay } from './agent-pay.mjs';

const realFetch = globalThis.fetch;
const piCalls = [];
const seenKeys = new Set();
globalThis.fetch = async (url, init) => {
  if (String(url) === 'https://api.stripe.com/v1/payment_intents') {
    const body = new URLSearchParams(init.body);
    const key = init.headers['Idempotency-Key'];
    const replay = seenKeys.has(key);
    seenKeys.add(key);
    piCalls.push(Object.fromEntries(body));
    // Like Stripe: the same idempotency key returns the same PaymentIntent, marked replayed.
    return new Response(JSON.stringify({ id: 'pi_test_' + (replay ? seenKeys.size - 1 : seenKeys.size), status: 'succeeded' }), { status: 200, headers: { 'content-type': 'application/json', ...(replay ? { 'idempotent-replayed': 'true' } : {}) } });
  }
  return realFetch(url, init);
};

const server = MppxServer.create({ methods: [serverStripe.charge({ secretKey: 'sk_test_fake', networkId: 'profile_test_fake', paymentMethodTypes: ['card'] })], secretKey: 'k'.repeat(44) });
const mpp = async () => ({ charge: (o) => server.charge(o), receiptOf: (r) => { try { return Receipt.fromResponse(r); } catch { return null; } }, livemode: false });
const orders = [], credits = [], mails = [];
const deps = {
  mpp, env: {}, now: () => Date.parse('2026-10-19T08:00:00Z'),
  networkEligibility: async (a) => (a === 'AGT-ABCDEFGH' ? { success: true, eligible: true, reasons: [] } : { success: false, eligible: false, reasons: ['No agent with that id: join the network first.'] }),
  db: { createOrder: async (r) => orders.push(r), orderByPaymentIntent: async (pi) => orders.find((o) => o.payment_intent === pi) || null, networkAddCredits: async (a, n) => credits.push([a, n]) },
  mail: { send: async (m) => mails.push(m) }
};
const U = 'https://luiqtimzcsoqnizybifs.supabase.co/functions/v1/lunara-checkout/agent-pay';
let fails = 0; const ok = (n, c, d) => { console.log(`  ${c ? 'ok  ' : 'FAIL'} ${n}${c ? '' : ' — ' + d}`); if (!c) fails++; };

ok('unknown product refused', (await handleAgentPay(new Request(`${U}?product=shield&agent=AGT-ABCDEFGH`), deps)).status === 400);
ok('bad agent id refused', (await handleAgentPay(new Request(`${U}?product=trial_pass&agent=nobody`), deps)).status === 400);
ok('unknown agent gets no challenge', (await handleAgentPay(new Request(`${U}?product=trial_pass&agent=AGT-ZZZZZZZZ`), deps)).status === 404);
const html = await handleAgentPay(new Request(`${U}?product=trial_pass&agent=AGT-ABCDEFGH`, { headers: { accept: 'text/html' } }), deps);
ok('a browser is sent to the checkout', html.status === 303 && /agent-network\.html\?agent=AGT-ABCDEFGH#trials/.test(html.headers.get('location')));

const first = await handleAgentPay(new Request(`${U}?product=trial_pass&agent=AGT-ABCDEFGH`, { method: 'POST' }), deps);
ok('no credential: 402 challenge', first.status === 402 && /method="stripe"/.test(first.headers.get('www-authenticate') || ''), first.status);
ok('nothing recorded before payment', orders.length === 0 && credits.length === 0 && piCalls.length === 0);

let tokenAsk = null;
const client = MppxClient.create({ polyfill: false, methods: [clientStripe.charge({ paymentMethod: 'pm_card_visa', createToken: async (p) => { tokenAsk = p; return 'spt_test_abc'; } })] });
const credential = await client.createCredential(first);
ok('the token is asked for exactly $19 to our profile', tokenAsk && tokenAsk.amount === '1900' && tokenAsk.networkId === 'profile_test_fake' && tokenAsk.currency === 'usd', JSON.stringify(tokenAsk));

const paid = await handleAgentPay(new Request(`${U}?product=trial_pass&agent=AGT-ABCDEFGH`, { method: 'POST', headers: { authorization: credential } }), deps);
const body = await paid.clone().json();
ok('paid: 200 with a receipt', paid.status === 200 && !!paid.headers.get('payment-receipt'), paid.status);
ok('Stripe charged 1900 usd with the token', piCalls.length === 1 && piCalls[0].amount === '1900' && piCalls[0].currency === 'usd' && piCalls[0].shared_payment_granted_token === 'spt_test_abc', JSON.stringify(piCalls[0]));
ok('order recorded as paid with the PaymentIntent', orders.length === 1 && orders[0].status === 'paid' && orders[0].payment_intent === 'pi_test_1' && orders[0].session_id === 'mpp:pi_test_1' && orders[0].agent_id === 'AGT-ABCDEFGH', JSON.stringify(orders[0]));
ok('one sitting delivered', credits.length === 1 && credits[0][1] === 1, JSON.stringify(credits));
ok('the answer names the order', body.success === true && body.order === orders[0].order_ref && body.sittings_added === 1);
ok('the owner is told', mails.length === 1 && /AGT-ABCDEFGH/.test(mails[0].subject));

const again = await handleAgentPay(new Request(`${U}?product=trial_pass&agent=AGT-ABCDEFGH`, { method: 'POST', headers: { authorization: credential } }), deps);
ok('the same credential cannot buy twice', again.status !== 200 && credits.length === 1, again.status);

const pack = await handleAgentPay(new Request(`${U}?product=trial_pack&agent=AGT-ABCDEFGH`, { method: 'POST' }), deps);
const packCred = await MppxClient.create({ polyfill: false, methods: [clientStripe.charge({ paymentMethod: 'pm_card_visa', createToken: async (p) => { tokenAsk = p; return 'spt_test_pack'; } })] }).createCredential(pack);
ok('four sittings cost $59', tokenAsk.amount === '5900');
const crossed = await handleAgentPay(new Request(`${U}?product=trial_pass&agent=AGT-ABCDEFGH`, { method: 'POST', headers: { authorization: packCred } }), deps);
ok('a $59 credential is not accepted for a different route', crossed.status !== 200 || credits.length === 2, crossed.status);

console.log(fails ? `\n${fails} failed` : '\nall passed');
process.exit(fails ? 1 : 0);
