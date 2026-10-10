/* The lunara_passport MCP tool, waiting to be added to mcp/core.mjs.

   core.mjs is published with an Ed25519 signature, so it can only change
   together with a re-signing, which needs the private key that is never
   in this repository. tools/finish-registry-move.mjs applies this (with
   addPassportTool below) in the same run that re-signs, so the owner signs
   once for both changes. It is idempotent: a core.mjs that already has the
   tool is returned unchanged. */

const DEF = `,
  {
    name: 'lunara_passport',
    title: 'Scan a domain at Lunara passport control',
    description:
      'Scans a domain live on thirteen public security signals (HTTPS and its headers, DNSSEC, SPF, DMARC, CAA, llms.txt, ' +
      'an AI-crawler policy, security.txt) and reads its status in the Lunara register. Returns a 0-100 score with a grade, ' +
      'each check with its detail and fix, and the visa. Use it before paying, signing up to, or sending data to an ' +
      'unfamiliar domain. The score is hygiene, not identity: only the visa (verified) records a named human review, and ' +
      'not_registered is not a negative signal.',
    inputSchema: {
      type: 'object',
      properties: { domain: { type: 'string', description: 'The domain to scan, e.g. "example.com".' } },
      required: ['domain']
    }
  }`;

const CASE = `    case 'lunara_passport': {
      if (!args.domain) return ok('Give a domain to scan, for example example.com.');
      let p;
      try {
        const res = await fetch(\`\${REGISTRY}/passportScan\`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'user-agent': UA },
          body: JSON.stringify({ domain: args.domain })
        });
        p = await res.json();
        if (!res.ok || !p.success) throw new Error(p.error || \`HTTP \${res.status}\`);
      } catch (e) {
        return ok(\`Passport control could not scan that domain (\${e.message}). No score is returned rather than a guessed one.\`);
      }
      const failed = p.checks.filter((c) => !c.pass);
      return ok(
        \`PASSPORT        \${p.domain}\\n\` +
        \`SCORE           \${p.score}/100 (grade \${p.grade}), public signals only\\n\` +
        \`VISA            \${p.visa.toUpperCase()}\${p.visa === 'not_registered' ? ' (not a negative signal: no named review has been done)' : ''}\\n\` +
        \`FAILED          \${failed.length ? failed.map((c) => c.label).join('; ') : 'none'}\\n\` +
        \`FULL PASSPORT   \${AUTHORITY}/passport.html?d=\${encodeURIComponent(p.domain)}\`,
        p
      );
    }

`;

export function addPassportTool(src) {
  if (src.includes("name: 'lunara_passport'")) return src;
  const end = src.indexOf('\n];\n', src.indexOf('export const TOOLS = ['));
  const at = src.indexOf("    case 'lunara_verify': {");
  if (end < 0 || at < 0) throw new Error('core.mjs has changed shape; add lunara_passport by hand.');
  src = src.slice(0, end) + DEF + src.slice(end);
  const at2 = src.indexOf("    case 'lunara_verify': {");
  return src.slice(0, at2) + CASE + src.slice(at2);
}
