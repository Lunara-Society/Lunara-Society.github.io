/* ═══════════════════════════════════════════════════════════════════
   THE AGENT PARTNER PROGRAM
   ═══════════════════════════════════════════════════════════════════

   For whoever brings Lunara its customers: agent builders, agent
   platforms, agencies, and AI agents applying on behalf of the person
   or company that operates them.

     partnerApply   name, website, email, type → a partner code at once
                    (P-XXXXXX) and the referral link. The code works from
                    the first minute; commission is paid once the owner
                    has approved the partner, so nothing is promised to
                    an application nobody has read.
     partnerStats   code + the email it was registered with → what the
                    code has brought in and the commission it has earned.
                    Both are needed: the code alone is in every link.

   How a referral is counted: a visitor arrives with ?ref=P-XXXXXX, the
   site remembers it for 90 days (lunara-pricing.js), and checkout
   writes it on the order (stripe_orders.partner_ref). Commission is
   COMMISSION_RATE of every payment Stripe confirms on that order during
   COMMISSION_MONTHS from the first one, renewals included, paid monthly
   by the owner. agents.html states the same terms; the tests hold the
   two to each other.

   shieldPartnerApply, the older form on join.html, now lands here too.
   ═══════════════════════════════════════════════════════════════════ */

export const COMMISSION_RATE = 0.2;
export const COMMISSION_MONTHS = 12;
// Months between charges of each renewing product (lunara-pricing.js renews).
const TERM_MONTHS = { monitor: 1, monitor_year: 12, shield: 6, watch: 6, agent: 6 };
export const PARTNER_TYPES =['agent_builder', 'agent_platform', 'agency', 'ai_agent', 'integrator', 'other'];
export const CODE_RE = /^P-[0-9A-HJKMNP-TV-Z]{6}$/;
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const SITE = 'https://lunarasociety.com/';
const EMAIL = /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[a-z]{2,}$/i;

export function newPartnerCode() {
  const b = crypto.getRandomValues(new Uint8Array(6));
  return 'P-' + Array.from(b, (x) => ALPHABET[x % 32]).join('');
}

export const referralLink = (code, page = '') => `${SITE}${page}?ref=${code}`;

export function terms() {
  return {
    commission: `${Math.round(COMMISSION_RATE * 100)}% of every payment from customers you refer, renewals included, for their first ${COMMISSION_MONTHS} months`,
    rate: COMMISSION_RATE,
    months: COMMISSION_MONTHS,
    tracking: 'Share any lunarasociety.com link with ?ref=YOUR_CODE, or send "ref" with a checkout request. A referral is remembered for 90 days.',
    payout: 'Paid monthly by bank transfer once your balance passes $50, after the owner has approved your application.',
    sells: ['Passport Monitor', 'Shield Verification', 'AI Entity Verification', 'Regulatory Watch', 'Article 50 packs and reports'],
    free_for_partners: ['Passport scans (REST, MCP, A2A)', 'Register lookups', 'Agent passport verification'],
    page: `${SITE}agents.html#partners`
  };
}

const clean = (s, max) => (typeof s === 'string' ? s.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max) : '');

export async function partnerRoute(name, body, deps, ipHash, h) {
  const { json, normDomain, limited, send, ownerEmail } = h;

  if (name === 'partnerApply' || name === 'shieldPartnerApply') {
    const row = {
      partner_name: clean(body.partner_name || body.name, 200),
      website_url: clean(body.website_url || body.website, 300),
      contact_email: clean(body.contact_email || body.email, 254).toLowerCase(),
      partner_type: PARTNER_TYPES.includes(body.partner_type) ? body.partner_type : 'other',
      embed_domain: normDomain(body.embed_domain || body.website_url || body.website) || null,
      notes: clean(body.notes || body.message, 1000) || null
    };
    if (row.partner_name.length < 2 || !EMAIL.test(row.contact_email)) {
      return json({ success: false, error: 'Send partner_name (your organisation, or the operator an agent acts for) and a valid contact_email.' }, 400);
    }
    if (await limited('partner', ipHash, 5, deps)) return json({ success: false, error: 'Too many applications from here. Try again later.' }, 429);
    const existing = deps.db.findPartnerByEmail ? await deps.db.findPartnerByEmail(row.contact_email) : null;
    if (existing && existing.code) {
      return json({ success: true, code: existing.code, status: existing.status, referral_link: referralLink(existing.code), terms: terms(),
        message: `This email already has partner code ${existing.code}.` });
    }
    let code = null;
    for (let i = 0; i < 5 && !code; i++) {
      const c = newPartnerCode();
      if (!(await deps.db.findPartnerByCode(c))) code = c;
    }
    if (!code) throw new Error('could not mint a partner code');
    await deps.db.createPartner({ ...row, code, status: 'pending' });
    const link = referralLink(code);
    await send(deps, { to: ownerEmail(deps.env), subject: `Partner application: ${row.partner_name} (${code}, ${row.partner_type})`,
      text: `${row.partner_name} · ${row.website_url || 'no website'} · ${row.contact_email}\nType: ${row.partner_type}\nCode: ${code}\n${row.notes ? 'Notes: ' + row.notes + '\n' : ''}\nApprove before paying any commission. Every partner: ${SITE}desk.html` });
    await send(deps, { to: row.contact_email, subject: `Your Lunara partner code: ${code}`,
      text: [`Welcome. ${row.partner_name} is registered in the Lunara Agent Partner Program.`, '',
        `Your partner code: ${code}`, `Your referral link: ${link}`, '',
        `Terms: ${terms().commission}. ${terms().payout}`,
        'Your code works from now. We review every application and write within two working days; commission is paid once you are approved.', '',
        `Your numbers, any time: ${SITE}agents.html#stats (your code and this email address).`, '', 'Lunara Society · lunarasociety.com'].join('\n') });
    return json({ success: true, code, status: 'pending', referral_link: link, terms: terms(),
      message: `Partner code ${code} is live. Commission is paid once the application is approved; we reply within two working days.` });
  }

  if (name === 'partnerStats') {
    const code = clean(body.code, 12).toUpperCase();
    const email = clean(body.email, 254).toLowerCase();
    if (!CODE_RE.test(code) || !EMAIL.test(email)) return json({ success: false, error: 'Send your partner code (P-XXXXXX) and the email it was registered with.' }, 400);
    if (await limited('partnerstats', ipHash, 30, deps)) return json({ success: false, error: 'Too many requests from here. Try again later.' }, 429);
    const p = await deps.db.findPartnerByCode(code);
    if (!p || p.contact_email !== email) return json({ success: false, error: 'No partner with that code and email.' }, 404);
    const orders = ((await deps.db.ordersByPartner(code)) || []).filter((o) => o.livemode !== false);
    const paid = orders.filter((o) => o.status === 'paid');
    // Each paid order's payments inside the commission window: the first,
    // plus the renewals Stripe has confirmed (stripe_orders.renewals) that
    // fall inside COMMISSION_MONTHS of it.
    const earned = paid.reduce((sum, o) => {
      const term = TERM_MONTHS[o.product];
      const renewals = term ? Math.min(o.renewals || 0, Math.ceil(COMMISSION_MONTHS / term) - 1) : 0;
      return sum + o.amount_total * (1 + renewals);
    }, 0);
    return json({
      success: true, code, partner_name: p.partner_name, status: p.status,
      referral_link: referralLink(code),
      referred_checkouts: orders.length, referred_paid: paid.length,
      active_subscriptions: paid.filter((o) => o.sub_status === 'active' && !o.cancel_at_period_end).length,
      referred_revenue_usd: Math.round(earned) / 100,
      commission_usd: Math.round(earned * COMMISSION_RATE) / 100,
      payable: p.status === 'approved',
      note: p.status === 'approved' ? 'Paid monthly by bank transfer once the balance passes $50.' : 'Commission accrues now and is paid once your application is approved.'
    });
  }
  return null;
}
