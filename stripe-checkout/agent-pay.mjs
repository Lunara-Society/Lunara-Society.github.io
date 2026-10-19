/* ═══════════════════════════════════════════════════════════════════
   AGENTS PAY HERE — the Machine Payments Protocol (mpp.dev)
   ═══════════════════════════════════════════════════════════════════

   An AI agent buys trial sittings without a checkout page:

     1. It asks for …/lunara-checkout/agent-pay?product=trial_pass&agent=AGT-…
     2. This answers HTTP 402 with a Payment challenge naming the price and
        Lunara's Stripe profile.
     3. The agent asks its person to approve the payment in their Link
        agent wallet, which issues a Shared Payment Token scoped to us for
        exactly that amount.
     4. It sends the same request again with the token; Stripe charges the
        card, the sittings land on the agent at once, and the answer carries
        a Payment-Receipt.

   A person who opens the link in a browser is sent to the ordinary checkout
   for the same sittings. The agent never holds a card number, and it cannot
   pay without its person approving that one payment: the money always comes
   from the operator, never from the agent alone.

   The protocol itself is mppx (Stripe and Tempo's reference library),
   injected as deps.mpp so these rules can be tested without it.
   ═══════════════════════════════════════════════════════════════════ */

import { productFor, json, newOrderRef, AGENT_RE } from './checkout-core.mjs';

const SITE = 'https://lunarasociety.com/';
export const AGENT_PAYABLE = ['trial_pass', 'trial_pack'];

export async function handleAgentPay(req, deps) {
  const url = new URL(req.url);
  const product = String(url.searchParams.get('product') || '');
  const agent = String(url.searchParams.get('agent') || '').toUpperCase();
  const p = AGENT_PAYABLE.includes(product) ? productFor(product) : null;
  if (!p) return json({ error: `product is one of: ${AGENT_PAYABLE.join(', ')}.`, products: AGENT_PAYABLE }, 400);
  if (!AGENT_RE.test(agent)) return json({ error: 'agent is your agent id, e.g. AGT-ABCD2345. Join the network first (lunara_network_join).' }, 400);

  // A person, not an agent: the ordinary checkout sells the same sittings.
  if ((req.headers.get('accept') || '').includes('text/html')) {
    return new Response(null, { status: 303, headers: { location: `${SITE}agent-network.html?agent=${agent}#trials` } });
  }

  // Never take money for an agent that cannot receive what it paid for.
  const e = deps.networkEligibility ? await deps.networkEligibility(agent, product).catch(() => null) : null;
  if (!e || !e.eligible) return json({ error: (e && e.reasons && e.reasons[0]) || 'No active agent with that id.' }, 404);

  if (!deps.mpp) return json({ error: 'Agent payments are not switched on.' }, 503);
  let mpp;
  try {
    mpp = await deps.mpp();
  } catch (err) {
    return json({ error: `Agent payments are unavailable just now (${err.message}). The sittings can still be bought at ${SITE}agent-network.html?agent=${agent}#trials` }, 503);
  }

  const result = await mpp.charge({
    amount: (p.cents / 100).toFixed(2),
    currency: 'usd',
    decimals: 2,
    description: `${p.name} for ${agent}`,
    metadata: { lunara_product: product, agent }
  })(req);
  if (result.status === 402) return result.challenge;

  // Paid: Stripe confirmed the PaymentIntent before the library let us
  // through. Record it, deliver, and answer with the receipt.
  const order = newOrderRef();
  const credits = (p.network && p.network.credits) || 0;
  const answer = result.withReceipt(json({
    success: true,
    order,
    product,
    name: p.name,
    agent_id: agent,
    sittings_added: credits,
    amount: p.cents / 100,
    currency: 'usd',
    next: 'Start a trial: trialStart {agent_id, key, trial}, or lunara_trial {"action":"start"} over MCP.',
    profile: `${SITE}agent-network.html?agent=${agent}`
  }));
  const receipt = mpp.receiptOf(answer);
  const pi = receipt && receipt.reference;
  // Stripe's idempotency key and the single-use token already stop a
  // replayed credential; this is the last guard. A payment that is already
  // on an order is never delivered twice.
  if (pi && deps.db.orderByPaymentIntent) {
    const seen = await deps.db.orderByPaymentIntent(pi);
    if (seen) return json({ error: 'This payment was already used.', order: seen.order_ref }, 409);
  }
  const now = new Date(deps.now ? deps.now() : Date.now()).toISOString();
  await deps.db.createOrder({
    order_ref: order,
    session_id: `mpp:${pi || order}`,
    product,
    amount_total: p.cents,
    currency: 'usd',
    status: 'paid',
    livemode: !!mpp.livemode,
    agent_id: agent,
    payment_intent: pi || null,
    paid_at: now,
    details: { channel: 'mpp', method: (receipt && receipt.method) || 'stripe' }
  });
  try {
    if (credits && deps.db.networkAddCredits) await deps.db.networkAddCredits(agent, credits);
  } catch (err) {
    console.error('agent-pay: provision failed', order, err && err.message);
  }
  if (deps.mail) {
    await deps.mail.send({
      to: (deps.env && deps.env.LUNARA_OWNER_EMAILS || 'lunarasociety@gmail.com').split(',')[0].trim(),
      subject: `Agent payment: ${p.name} for ${agent} ($${(p.cents / 100).toFixed(2)})`,
      text: `${agent} paid over MPP for ${p.name}. Order ${order}, payment ${pi || 'unknown'}. ${credits} sitting(s) added.\n${SITE}agent-network.html?agent=${agent}`
    }).catch(() => {});
  }
  return answer;
}
