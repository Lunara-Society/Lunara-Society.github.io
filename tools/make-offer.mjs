#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   ISSUE A PRIVATE OFFER
   ═══════════════════════════════════════════════════════════════════

   Prints the SQL for one offer addressed to one member, open for a
   fixed window, redeemable once. It prints rather than executes: an
   offer is a commercial commitment to a named person, and the last
   thing between writing one and it being live should be a human
   reading it.

   Usage:
     node tools/make-offer.mjs \
       --to LUNA-6C2S-D7QF \
       --code founder-shield-test \
       --name "Small Business Shield" \
       --cents 200 \
       --hours 3 \
       --pay "https://paypal.me/lunarasociety/2" \
       --product shield \
       --lede "..." \
       --note "internal end-to-end test of the purchase path"

   Every argument is required except --lede and --note. There is no
   default target and no default price, because a default target is
   how an offer ends up addressed to whoever was last in the file.
   ═══════════════════════════════════════════════════════════════════ */

const LUNARA_ID = /^LUNA-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/;

const args = {};
for (let i = 2; i < process.argv.length; i += 2) {
  const k = process.argv[i];
  if (!k.startsWith('--')) { console.error(`unexpected argument: ${k}`); process.exit(1); }
  args[k.slice(2)] = process.argv[i + 1];
}

const fail = (m) => { console.error('  ✗ ' + m); process.exitCode = 1; };

const to = String(args.to || '').toUpperCase();
if (!LUNARA_ID.test(to)) {
  fail('--to must be a Lunara id like LUNA-6C2S-D7QF. Got: ' + JSON.stringify(args.to || ''));
}
const code = String(args.code || '');
if (!/^[a-z0-9][a-z0-9-]{2,48}$/.test(code)) {
  fail('--code must be lowercase letters, digits and hyphens, 3–49 characters.');
}
const name = String(args.name || '').trim();
if (!name) fail('--name is required — the member sees it.');

const cents = Number(args.cents);
if (!Number.isInteger(cents) || cents <= 0 || cents > 500000) {
  fail('--cents must be a whole number of minor units, 1 to 500000. $2 is 200.');
}
const hours = Number(args.hours);
if (!Number.isFinite(hours) || hours <= 0 || hours > 720) {
  fail('--hours must be between 0 and 720.');
}
const pay = String(args.pay || '');
if (!/^https:\/\/[^\s"']+$/.test(pay)) {
  fail('--pay must be an https URL where the money is actually taken.');
}
if (process.exitCode) {
  console.error('\nNothing was generated.\n');
  process.exit(1);
}

const opens = new Date();
const expires = new Date(opens.getTime() + hours * 3600000);
const q = (v) => (v === null || v === undefined || v === '' ? 'null' : `'${String(v).replace(/'/g, "''")}'`);

const money = (cents / 100).toFixed(2);

console.log(`
-- ═══════════════════════════════════════════════════════════════════
--  ${name} — ${money} ${(args.currency || 'USD').toUpperCase()}
--  addressed to ${to}, and to nobody else
--  opens  ${opens.toISOString()}
--  closes ${expires.toISOString()}   (${hours}h)
--  redeemable once. Redemption records a claim; it does not confirm
--  a payment. Reconcile against PayPal by hand before granting.
-- ═══════════════════════════════════════════════════════════════════

insert into public.member_offers
  (code, lunara_id, name, lede, amount_cents, currency, pay_url, product_id,
   opens_at, expires_at, note)
values
  (${q(code)},
   ${q(to)},
   ${q(name)},
   ${q(args.lede || null)},
   ${cents},
   ${q((args.currency || 'USD').toUpperCase())},
   ${q(pay)},
   ${q(args.product || null)},
   ${q(opens.toISOString())},
   ${q(expires.toISOString())},
   ${q(args.note || null)})
on conflict (code) do update set
  lunara_id    = excluded.lunara_id,
  name         = excluded.name,
  lede         = excluded.lede,
  amount_cents = excluded.amount_cents,
  currency     = excluded.currency,
  pay_url      = excluded.pay_url,
  product_id   = excluded.product_id,
  opens_at     = excluded.opens_at,
  expires_at   = excluded.expires_at,
  note         = excluded.note
-- Never silently reopen something already paid for.
where member_offers.redeemed_at is null
returning code, lunara_id, amount_cents, expires_at;

-- To pull it early:
--   update public.member_offers set expires_at = now() where code = ${q(code)};
`);
