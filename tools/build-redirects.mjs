#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   CONSOLIDATION STUBS
   ═══════════════════════════════════════════════════════════════════

   Five pages, 150–210 words each, describing a product that does not
   exist: Gateway logging every AI-to-business interaction, a Trust
   Score that accumulates, an institutional memory that cannot be
   manipulated, a reputation layer built from verified interaction
   history. None of it is running. On a site whose entire argument is
   that a claim should be checkable, five pages of unbuilt roadmap
   written in the present tense is the worst content on the domain.

   Search Console reports 25 URLs "Discovered – currently not indexed":
   found, never fetched, because a domain with no inbound links gets a
   small crawl budget. Forty-six URLs of equal declared priority split
   that budget five ways too many. Consolidating removes the weakest
   pages from the split and folds the true parts into pages that are
   already strong.

   GitHub Pages serves no 301s, so each stub carries an immediate meta
   refresh plus a canonical at its target — which Google treats as a
   redirect — and a visible link for anyone whose browser does not.
   The URLs keep resolving; nothing that ever linked here breaks.

   Usage:  node tools/build-redirects.mjs
   ═══════════════════════════════════════════════════════════════════ */

import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://lunarasociety.com/';

/* from → [to, title, why]. The "why" is written for a person who
   followed an old link and deserves to know what happened. */
export const REDIRECTS = {
  'protocol.html': ['registry.html', 'The Lunara Protocol',
    'The protocol is the register. What a lookup returns, and which parts of that have actually been observed, is published with the register itself.'],
  'gateway.html': ['ai-agent-verification.html', 'Gateway',
    'This page described interaction logging that is not built. What a business can genuinely publish for agents to read — and what remains unsolved — is set out honestly on the agent verification page.'],
  'network.html': ['ai-agent-verification.html', 'The Reputation Layer',
    'This page described a trust score that does not exist. What can be established about a party today, and what cannot, is on the agent verification page.'],
  'signal.html': ['mcp.html', 'Signal & Visibility',
    'The machine-readable files this page listed are real and published. They are documented where the rest of the machine-facing surface lives.'],
  'doctrine.html': ['constitution.html', 'The Lunara Doctrine',
    'The doctrine is the constitution, in full, under CC BY 4.0.']
};

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function stub(from) {
  const [to, title, why] = REDIRECTS[from];
  return `<!DOCTYPE html>
<html lang="en">
<head>
<!-- A consolidation stub, not a page. This URL used to carry ${esc(title)};
     its content now lives at /${esc(to)}. GitHub Pages serves no 301s, so
     the redirect is a meta refresh plus a canonical, which Google treats
     as one. The URL keeps resolving so nothing that linked here breaks. -->
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="refresh" content="0; url=/${esc(to)}">
<link rel="canonical" href="${SITE}${esc(to)}">
<title>${esc(title)} — moved — Lunara Society</title>
<meta name="description" content="${esc(title)} has moved. ${esc(why)}">
<meta name="robots" content="noindex, follow">
<style>
  body{background:#07080A;color:#A49E93;font-family:'Inter',system-ui,sans-serif;font-weight:300;
       display:grid;place-items:center;min-height:100vh;margin:0;padding:30px;line-height:1.7}
  main{max-width:46ch;text-align:center}
  h1{font-family:'Cormorant Garamond',Georgia,serif;font-weight:300;font-size:29px;
     color:#EFEAE0;margin:0 0 14px;line-height:1.2}
  p{font-size:14.5px;margin:0 0 22px}
  a{color:#E2C47A;text-decoration:none;border-bottom:1px solid rgba(196,164,107,.45);padding-bottom:2px}
</style>
</head>
<body>
<main>
  <h1>${esc(title)} has moved</h1>
  <p>${esc(why)}</p>
  <p><a href="/${esc(to)}">Continue &rarr;</a></p>
</main>
</body>
</html>
`;
}

const direct = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (direct) {
  for (const [from, [to]] of Object.entries(REDIRECTS)) {
    if (!existsSync(join(ROOT, to))) { console.error(`${from} points at ${to}, which does not exist`); process.exit(1); }
    const next = stub(from);
    const path = join(ROOT, from);
    const before = existsSync(path) ? readFileSync(path, 'utf8') : '';
    if (before === next) console.log(`${from} — already a stub`);
    else { writeFileSync(path, next); console.log(`${from} -> ${to}`); }
  }
}
