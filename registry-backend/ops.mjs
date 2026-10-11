/* ═══════════════════════════════════════════════════════════════════
   OPS — the numbers, read from where they actually live
   ═══════════════════════════════════════════════════════════════════

   POST lunara-registry/opsStats answers "how is Lunara doing" from the
   live tables: Stripe orders as Stripe confirmed them, register
   applications, passport scans, watchers. It exists because the weekly
   operations reports were being written from the retired Base44 app,
   whose prices and applications stopped being true in October.

   Two ways in:
     - the owner's session (desk.html): everything, buyers' names and
       emails included, because the owner delivers the orders;
     - header x-lunara-ops-key matching the LUNARA_OPS_KEY secret: for
       the owner's own reporting agents. Same figures, no names and no
       email addresses: an agent needs counts, not people.
   Without either it answers 403. With no LUNARA_OPS_KEY set, only the
   owner's session works.
   ═══════════════════════════════════════════════════════════════════ */

function sameKey(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length || a.length < 24) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

export async function opsStats(req, body, deps, h) {
  const { json, isOwner } = h;
  const who = deps.whoIs ? await deps.whoIs(body.session_token) : null;
  const owner = !!(who && isOwner(who.email, deps.env));
  const key = req.headers.get('x-lunara-ops-key') || '';
  const agent = !owner && sameKey(key, String((deps.env && deps.env.LUNARA_OPS_KEY) || ''));
  if (!owner && !agent) return json({ success: false, error: 'Owner sign-in or the ops key required.' }, 403);

  const now = deps.now(), day = 86400e3;
  const iso = (ms) => new Date(ms).toISOString();
  const [orders, apps, scans7, scans30, stored, watchers, subs, leads] = await Promise.all([
    deps.db.listOrders().catch(() => []),
    deps.db.listApplications().catch(() => []),
    deps.db.countHits('passport', null, iso(now - 7 * day)).catch(() => null),
    deps.db.countHits('passport', null, iso(now - 30 * day)).catch(() => null),
    deps.db.countPassports().catch(() => null),
    deps.db.countWatchers().catch(() => null),
    deps.db.countSubscribers().catch(() => null),
    deps.db.listLeads ? deps.db.listLeads().catch(() => []) : []
  ]);

  const live = (orders || []).filter((o) => o.livemode !== false);
  const paid = live.filter((o) => o.status === 'paid');
  const cents = (n) => Math.round(n) / 100;
  const byProduct = {};
  paid.forEach((o) => {
    const p = byProduct[o.product] = byProduct[o.product] || { orders: 0, gross_usd: 0, delivered: 0 };
    p.orders++; p.gross_usd = cents(p.gross_usd * 100 + o.amount_total); if (o.delivered_at) p.delivered++;
  });
  const gross = paid.reduce((s, o) => s + o.amount_total, 0), refunded = paid.reduce((s, o) => s + (o.refunded_amount || 0), 0);
  const recent = (o) => Date.parse(o.created_at) > now - 7 * day;

  const row = (o) => {
    const r = { order_ref: o.order_ref, product: o.product, amount_usd: cents(o.amount_total), status: o.status, country: o.country || null,
      created_at: o.created_at, paid_at: o.paid_at || null, delivered: !!o.delivered_at,
      sub_status: o.sub_status || null, cancel_at_period_end: !!o.cancel_at_period_end, renewals: o.renewals || 0, period_end: o.period_end || null };
    if (owner) { r.name = o.name || null; r.email = o.email || null; }
    return r;
  };
  const appRow = (a) => {
    const r = { public_id: a.public_id, kind: a.kind, business_name: a.business_name, domain: a.domain, status: a.status,
      domain_verified: !!a.domain_verified_at, paid: !!a.order_ref, created_at: a.created_at };
    if (owner) r.contact_email = a.contact_email || null;
    return r;
  };
  const by = (s) => (apps || []).filter((a) => a.status === s).length;

  /* Recurring revenue: subscriptions Stripe still holds as live, each
     priced per month. The term lengths are lunara-pricing.js's renews. */
  const TERM_MONTHS = { monitor: 1, monitor_year: 12, shield: 6, watch: 6, agent: 6 };
  const isLive = (o) => o.status === 'paid' && o.sub_status && ['active', 'trialing', 'past_due'].includes(o.sub_status);
  const subsLive = paid.filter((o) => o.subscription_id && isLive(o));
  const mrrCents = subsLive.filter((o) => !o.cancel_at_period_end).reduce((sum, o) => sum + o.amount_total / (TERM_MONTHS[o.product] || 1), 0);
  const leadRows = (leads || []).filter((l) => Date.parse(l.created_at) > now - 30 * day);
  const leadRow = (l) => {
    const r = { product: l.product || null, organization: l.organization || null, grade: l.grade || null, score: l.score ?? null, gaps: l.gaps || [], contacted: !!l.contacted, created_at: l.created_at };
    if (owner) r.email = l.email || null;
    return r;
  };

  return json({
    success: true,
    generated_at: iso(now),
    source: 'Live: Supabase tables written by lunara-checkout (Stripe-confirmed) and lunara-registry. The Base44 app is retired and no longer authoritative.',
    access: owner ? 'owner' : 'agent (names and emails withheld)',
    revenue: {
      paid_orders: paid.length, gross_usd: cents(gross), refunded_usd: cents(refunded), net_usd: cents(gross - refunded),
      paid_last_7_days: paid.filter((o) => Date.parse(o.paid_at || o.created_at) > now - 7 * day).length,
      awaiting_delivery: paid.filter((o) => !o.delivered_at).length,
      by_product: byProduct,
      unfinished_checkouts_7_days: live.filter((o) => o.status !== 'paid' && recent(o)).length
    },
    subscriptions: {
      active: subsLive.length,
      cancelling: subsLive.filter((o) => o.cancel_at_period_end).length,
      monitors: subsLive.filter((o) => o.product === 'monitor' || o.product === 'monitor_year').length,
      mrr_usd: cents(mrrCents),
      renewals_total: paid.reduce((n, o) => n + (o.renewals || 0), 0)
    },
    leads: { last_7_days: leadRows.filter((l) => Date.parse(l.created_at) > now - 7 * day).length, last_30_days: leadRows.length, recent: leadRows.slice(0, 25).map(leadRow) },
    orders: live.slice(0, 50).map(row),
    register: {
      total: (apps || []).length, pending: by('pending'), returned: by('returned'), approved: by('approved'), rejected: by('rejected'), revoked: by('revoked'),
      applications: (apps || []).slice(0, 25).map(appRow)
    },
    passport: { scans_7_days: scans7, scans_30_days: scans30, domains_on_record: stored, watchers_confirmed: watchers },
    newsletter_subscribers: subs,
    prices: 'https://lunarasociety.com/lunara-pricing.js is the only price list; checkout charges exactly what it says.'
  });
}
