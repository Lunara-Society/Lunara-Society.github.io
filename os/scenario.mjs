/* ═══════════════════════════════════════════════════════════════════
   THE SCENARIO LAB — a passport, with fixes it has not made yet
   ═══════════════════════════════════════════════════════════════════

   One simulation, kept small enough to test: start from a domain's
   recorded passport scan, assume some of its failing checks were fixed,
   and compute what the same scoring code would give. Pure: no fetch, no
   write. The page (simulate.html) feeds it the stored scan and the
   scoring weights imported from registry-backend/passport.mjs, so the
   lab cannot disagree with the scanner about what a check is worth.

   Four kinds of number, never mixed:
     observed   what the recorded scan measured, and when
     assumed    the fixes the user chose
     simulated  the score those assumptions would produce
     actual     the next real scan, which only the scanner records
   ═══════════════════════════════════════════════════════════════════ */

export function simulate(observed, fixes, checks, grade) {
  const earned = observed && observed.earned ? observed.earned : null;
  if (!earned) throw new Error('the recorded scan carries no per-check results');
  const fix = new Set(fixes || []);
  const rows = checks.map((c) => {
    const was = Number(earned[c.id] || 0);
    const assumed = fix.has(c.id) && was < c.points;
    const now = assumed ? c.points : was;
    return { id: c.id, group: c.group, label: c.label, points: c.points, observed: was, simulated: now, gain: Math.round((now - was) * 10) / 10, assumed, fix: c.fix };
  });
  const baseline = Math.round(rows.reduce((s, r) => s + r.observed, 0));
  const projected = Math.round(rows.reduce((s, r) => s + r.simulated, 0));
  return {
    baseline, projected, delta: projected - baseline,
    baseline_grade: grade(baseline), projected_grade: grade(projected),
    matches_record: observed.score == null || baseline === observed.score,
    rows
  };
}

/* Plans named by what they touch, not by an invented effort estimate. */
export function plans(checks, earned) {
  const open = (pred) => checks.filter((c) => pred(c) && Number(earned[c.id] || 0) < c.points).map((c) => c.id);
  return [
    { id: 'headers', title: 'Web server headers', about: 'HTTPS, HSTS, CSP, nosniff, framing and referrer policy: changes to how the site answers.', fixes: open((c) => c.group === 'transport') },
    { id: 'dns', title: 'DNS records', about: 'DNSSEC, SPF, DMARC and CAA: changes at the DNS host and registrar.', fixes: open((c) => c.group === 'dns') },
    { id: 'ai', title: 'Disclosure files', about: 'llms.txt, an AI-crawler policy in robots.txt and security.txt: three small files.', fixes: open((c) => c.group === 'ai') },
    { id: 'all', title: 'Everything', about: 'Every check the scan did not award in full.', fixes: open(() => true) }
  ];
}
