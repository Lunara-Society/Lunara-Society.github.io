/* ═══════════════════════════════════════════════════════════════════
   PASSPORT CONTROL — one scan of a domain's public trust signals
   ═══════════════════════════════════════════════════════════════════

   POST lunara-registry/passportScan { domain } runs this. Anyone may
   call it, people from /passport.html and AI systems before they
   transact, and it needs no account.

   Two answers come back and they are kept apart on purpose:

     score   0-100 from public signals anyone could check themselves:
             HTTPS and its headers, DNSSEC, SPF/DMARC/CAA, and whether
             the site tells AI systems and security researchers how to
             deal with it. It says nothing about who runs the domain.

     visa    the register's answer. Only a named reviewer can stamp it
             verified. A perfect score without a stamp is still
             not_registered, and a stamp is never bought with points.

   Network access arrives through deps, so the tests run offline:
     deps.resolve(name, type) -> { ad: bool, answers: [string] }
     deps.fetchPage(url)      -> { status, headers: {lowercase}, text }
                                 (throws when unreachable; index.ts
                                 refuses private addresses)
   ═══════════════════════════════════════════════════════════════════ */

export const AI_AGENTS = ['GPTBot', 'ChatGPT-User', 'OAI-SearchBot', 'ClaudeBot', 'Claude-User', 'anthropic-ai',
  'Google-Extended', 'PerplexityBot', 'CCBot', 'Applebot-Extended', 'Meta-ExternalAgent', 'Bytespider', 'Amazonbot'];

/* Weights sum to 100. Each check has the plain sentence a reader sees. */
export const CHECKS = [
  { id: 'https', group: 'transport', points: 15, label: 'Answers over HTTPS', fix: 'Serve the site over HTTPS with a valid certificate.' },
  { id: 'hsts', group: 'transport', points: 10, label: 'Forces HTTPS (HSTS)', fix: 'Send Strict-Transport-Security: max-age=31536000; includeSubDomains.' },
  { id: 'csp', group: 'transport', points: 8, label: 'Content Security Policy', fix: 'Send a Content-Security-Policy header that limits where scripts load from.' },
  { id: 'nosniff', group: 'transport', points: 4, label: 'No MIME sniffing', fix: 'Send X-Content-Type-Options: nosniff.' },
  { id: 'frame', group: 'transport', points: 4, label: 'Cannot be framed', fix: "Send X-Frame-Options: DENY or CSP frame-ancestors 'self'." },
  { id: 'referrer', group: 'transport', points: 3, label: 'Referrer policy', fix: 'Send Referrer-Policy: strict-origin-when-cross-origin.' },
  { id: 'dnssec', group: 'dns', points: 8, label: 'DNSSEC signed', fix: 'Turn on DNSSEC at your DNS host and registrar.' },
  { id: 'spf', group: 'dns', points: 8, label: 'SPF: who may send its email', fix: 'Publish a TXT record starting v=spf1 that ends in -all or ~all.' },
  { id: 'dmarc', group: 'dns', points: 10, label: 'DMARC: spoofed email rejected', fix: 'Publish _dmarc TXT v=DMARC1; p=quarantine (or p=reject).' },
  { id: 'caa', group: 'dns', points: 5, label: 'CAA: who may issue certificates', fix: 'Publish a CAA record naming your certificate authority.' },
  { id: 'llms', group: 'ai', points: 8, label: 'llms.txt for AI systems', fix: 'Publish /llms.txt: a plain-text summary of who you are for AI systems.' },
  { id: 'robots_ai', group: 'ai', points: 7, label: 'Declares a policy for AI crawlers', fix: 'Name AI crawlers (GPTBot, ClaudeBot, Google-Extended…) in robots.txt, allowed or not.' },
  { id: 'securitytxt', group: 'ai', points: 10, label: 'security.txt contact', fix: 'Publish /.well-known/security.txt with a Contact: line (RFC 9116).' }
];

export function grade(score) {
  return score >= 90 ? 'A+' : score >= 80 ? 'A' : score >= 65 ? 'B' : score >= 50 ? 'C' : score >= 35 ? 'D' : 'F';
}

const notHtml = (p) => p && p.status === 200 && !/text\/html/i.test(p.headers['content-type'] || '') && !/^\s*</.test(p.text || '');
const txt = (s) => String(s).replace(/^"|"$/g, '').replace(/"\s*"/g, '');

async function quiet(p) { try { return await p; } catch { return null; } }

export async function passportScan(domain, deps) {
  const R = (name, type) => quiet(deps.resolve(name, type));
  const F = (url) => quiet(deps.fetchPage(url));

  // The home page decides which host the path checks use.
  let base = `https://${domain}`, home = await F(base + '/');
  if (!home) { const w = await F(`https://www.${domain}/`); if (w) { base = `https://www.${domain}`; home = w; } }

  const [txtRec, dmarcRec, caaRec, soa, llms, robots, sectxt, entry] = await Promise.all([
    R(domain, 'TXT'), R('_dmarc.' + domain, 'TXT'), R(domain, 'CAA'), R(domain, 'SOA'),
    home ? F(base + '/llms.txt') : null,
    home ? F(base + '/robots.txt') : null,
    home ? F(base + '/.well-known/security.txt') : null,
    quiet(deps.db.getPublishedByDomain(domain))
  ]);
  const proof = await R('_lunara-verify.' + domain, 'TXT');

  const h = (home && home.headers) || {};
  // A policy in the page's own <meta> is enforced by browsers just the
  // same (frame-ancestors excepted), so it counts; the header wins.
  const meta = (attr, value) => {
    const tag = ((home && home.text) || '').match(new RegExp(`<meta[^>]+${attr}\\s*=\\s*["']?${value}["']?[^>]*>`, 'i'));
    return tag ? ((tag[0].match(/content\s*=\s*"([^"]*)"|content\s*=\s*'([^']*)'/i) || []).slice(1).find(Boolean) || '') : '';
  };
  const csp = h['content-security-policy'] || meta('http-equiv', 'content-security-policy');
  const referrer = h['referrer-policy'] || meta('name', 'referrer');
  const headerCsp = h['content-security-policy'] || '';
  const hstsAge = Number((String(h['strict-transport-security'] || '').match(/max-age=\s*"?(\d+)/i) || [])[1] || 0);
  const spf = ((txtRec && txtRec.answers) || []).map(txt).find((t) => /^v=spf1\b/i.test(t)) || '';
  const dmarc = ((dmarcRec && dmarcRec.answers) || []).map(txt).find((t) => /^v=DMARC1/i.test(t)) || '';
  const dmarcPolicy = (dmarc.match(/;\s*p=(\w+)/i) || [])[1]?.toLowerCase() || '';
  const robotsText = robots && robots.status === 200 ? robots.text || '' : '';
  const named = AI_AGENTS.filter((a) => new RegExp('user-agent:\\s*' + a.replace(/-/g, '\\-') + '\\b', 'i').test(robotsText));

  const result = {
    https: home ? (home.status < 500 ? 1 : 0) : 0,
    hsts: hstsAge >= 15552000 ? 1 : h['strict-transport-security'] ? 0.5 : 0,
    csp: csp ? 1 : 0,
    nosniff: /nosniff/i.test(h['x-content-type-options'] || '') ? 1 : 0,
    frame: h['x-frame-options'] || /frame-ancestors/i.test(headerCsp) ? 1 : 0,
    referrer: referrer ? 1 : 0,
    dnssec: soa && soa.ad ? 1 : 0,
    spf: /[-~]all\b/i.test(spf) ? 1 : spf ? 0.5 : 0,
    dmarc: ['reject', 'quarantine'].includes(dmarcPolicy) ? 1 : dmarc ? 0.4 : 0,
    caa: caaRec && caaRec.answers.length ? 1 : 0,
    llms: notHtml(llms) && (llms.text || '').trim().length > 20 ? 1 : 0,
    robots_ai: named.length ? 1 : 0,
    securitytxt: notHtml(sectxt) && /^\s*contact:/im.test(sectxt.text || '') ? 1 : 0
  };
  const detail = {
    https: home ? `${base}/ answered ${home.status}` : 'No answer over HTTPS',
    hsts: h['strict-transport-security'] || 'Not sent',
    csp: csp ? (headerCsp ? '' : '<meta> ') + csp.slice(0, 120) : 'Not sent',
    nosniff: h['x-content-type-options'] || 'Not sent',
    frame: h['x-frame-options'] || (/frame-ancestors/i.test(headerCsp) ? 'CSP frame-ancestors' : 'Not sent'),
    referrer: h['referrer-policy'] || (referrer ? '<meta> ' + referrer : 'Not sent'),
    dnssec: soa ? (soa.ad ? 'Validated by the resolver' : 'Not validated') : 'No answer',
    spf: spf || 'No SPF record',
    dmarc: dmarc ? `policy ${dmarcPolicy || 'missing'}` : 'No DMARC record',
    caa: caaRec && caaRec.answers.length ? caaRec.answers.slice(0, 3).join(' · ') : 'No CAA record',
    llms: result.llms ? 'Published' : 'Not found',
    robots_ai: named.length ? 'Names ' + named.slice(0, 5).join(', ') : robotsText ? 'robots.txt names no AI crawler' : 'No robots.txt',
    securitytxt: result.securitytxt ? 'Published' : 'Not found'
  };

  const checks = CHECKS.map((c) => ({
    id: c.id, group: c.group, label: c.label, points: c.points,
    earned: Math.round(c.points * result[c.id] * 10) / 10,
    pass: result[c.id] === 1, partial: result[c.id] > 0 && result[c.id] < 1,
    detail: detail[c.id], fix: result[c.id] === 1 ? null : c.fix
  }));
  const score = Math.round(checks.reduce((s, c) => s + c.earned, 0));

  const now = deps.now();
  const reg = entry && ['approved', 'revoked'].includes(entry.status) ? entry : null;
  const expired = reg && reg.status === 'approved' && reg.expires_at && Date.parse(reg.expires_at) < now;
  const visa = !reg ? 'not_registered' : reg.status === 'revoked' ? 'revoked' : expired ? 'expired' : 'verified';
  const proofs = ((proof && proof.answers) || []).map(txt).filter((t) => /^lunara-verify=/.test(t));

  return {
    success: true,
    domain,
    scanned_at: new Date(now).toISOString(),
    score, grade: grade(score),
    visa,
    register: reg ? {
      public_id: reg.public_id, status: visa, business_name: reg.business_name || null,
      verified_at: reg.verified_at || null, expires_at: reg.expires_at || null,
      record: `https://lunarasociety.com/registry.html?id=${encodeURIComponent(reg.public_id)}`
    } : null,
    dns_proof: proofs.length > 0,
    checks,
    note: 'The score reads public signals only and says nothing about who runs the domain. Only the register (visa) records a named human review.',
    next: visa === 'verified' ? null : 'https://lunarasociety.com/shield.html'
  };
}

/* An address no scan may reach: loopback, private, link-local, CGNAT,
   multicast and reserved ranges, in v4 and v6. index.ts resolves the
   host first and refuses any of these. */
export function isPrivateAddress(ip) {
  ip = String(ip).toLowerCase();
  if (ip.includes(':')) {
    const v4 = ip.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (v4) return isPrivateAddress(v4[1]);
    return ip === '::' || ip === '::1' || /^f[cd]/.test(ip) || /^fe[89ab]/.test(ip) || /^ff/.test(ip) || /^64:ff9b:/.test(ip) || /^2001:db8/.test(ip);
  }
  const p = ip.split('.').map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b] = p;
  return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19));
}
