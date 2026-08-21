#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   EXPOSURE SCAN
   ═══════════════════════════════════════════════════════════════════

   Reads a company's own public pages and records what they say about
   themselves, then maps that against the obligation corpus.

   The reason this exists rather than a spreadsheet: writing to someone
   about a deadline is only defensible if you have a specific reason to
   think it reaches them, and that reason has to be something they
   published themselves and can check. "You appear to generate images,
   you price in euro, and nothing on your site mentions content
   provenance" is a claim they can verify or refute in thirty seconds.
   A list of companies who might broadly care is not.

   WHAT THIS CANNOT DO — and the output says so on every record:

   A homepage does not establish a legal obligation. It cannot tell you
   when a system was placed on the market, which is the fact the entire
   2 December date turns on. It cannot tell you whether marking is
   implemented in the pipeline but undocumented on the marketing site.
   Findings here are marked `reported` and `hypothesis` under the
   evidence standard, never `verified`, and a scan is a reason to ask a
   question, never a basis for asserting non-compliance to anyone.

   Asserting non-compliance from a homepage scan would be exactly the
   error this institution has published four corrections about:
   overstating what is settled.

   Usage:  node tools/scan-exposure.mjs acme.com foo.io
           node tools/scan-exposure.mjs --file candidates.txt --json out.json
   ═══════════════════════════════════════════════════════════════════ */

import { readFileSync, writeFileSync } from 'node:fs';

const UA = 'LunaraExposureScan/1.0 (+https://lunarasociety.com/mcp.html; rosario@lunarasociety.com)';
const TIMEOUT = 20000;

/* Signals. Each is a claim the company makes about itself in its own
   words. Weighted by how strongly it implies the thing we care about. */
const SIGNALS = {
  generates_media: {
    label: 'Generates images, video or audio',
    // Art 50(2) marking bites hardest here — provenance on synthetic media.
    patterns: [/text[- ]to[- ](image|video|speech|audio)/i, /\bAI[- ](image|video|voice|audio|music)\b/i,
               /generate (images|videos|voice|audio|music|avatars)/i, /\b(voice|video) (cloning|generation)\b/i,
               /synthetic (media|voice|video)/i, /\bavatars?\b.{0,40}\bAI\b/i]
  },
  generates_text: {
    label: 'Generates text or written content',
    patterns: [/AI[- ](writer|writing|copywrit|content generat)/i, /generate (content|copy|text|articles|posts|emails)/i,
               /\b(draft|write)s? .{0,20}\bwith AI\b/i, /AI[- ]generated (content|text|copy)/i]
  },
  converses: {
    label: 'Converses with people',
    // Art 50(1) disclosure duty — in force since 2 August, no grace period.
    patterns: [/\b(chatbot|AI assistant|AI agent|conversational AI|virtual agent)\b/i,
               /\bAI[- ]powered (support|chat|helpdesk)\b/i, /\btalk to .{0,15}\bAI\b/i]
  },
  eu_exposure: {
    label: 'Sells into the EU',
    patterns: [/[€]\s?\d/, /\bEUR\b\s?\d|\d\s?\bEUR\b/, /\bGDPR\b/i, /data processing (agreement|addendum)/i,
               /\bDPA\b/, /\bEU\b.{0,25}\b(customers|clients|users|entity|subsidiary)\b/i,
               /\b(Germany|France|Netherlands|Ireland|Spain|Italy|Sweden|Poland|Belgium|Austria|Portugal|Denmark|Finland)\b/]
  },
  discloses_ai: {
    label: 'Already discloses AI to users',
    patterns: [/\bAI[- ]generated\b/i, /generated (by|with) AI/i, /\bpowered by AI\b/i,
               /you are (chatting|speaking) with an AI/i, /this (content|response) was generated/i]
  },
  marking_ready: {
    label: 'Mentions content provenance or marking',
    // The single most useful signal: absence is the whole conversation.
    patterns: [/\bC2PA\b/i, /content credentials/i, /content provenance/i, /\bSynthID\b/i,
               /\b(invisible|imperceptible|digital) watermark/i, /provenance metadata/i,
               /\bIPTC\b.{0,30}\b(digital source|AI)\b/i]
  }
};

const PATHS = ['/', '/pricing', '/about', '/legal', '/privacy', '/terms', '/trust', '/security', '/ai', '/docs'];

async function grab(url) {
  const ctl = AbortController ? new AbortController() : null;
  const t = ctl && setTimeout(() => ctl.abort(), TIMEOUT);
  try {
    const res = await fetch(url, {
      headers: { 'user-agent': UA, accept: 'text/html,application/xhtml+xml,application/json' },
      redirect: 'follow', signal: ctl?.signal
    });
    if (!res.ok) return null;
    const ct = res.headers.get('content-type') || '';
    if (!/text|json|xml/.test(ct)) return null;
    const body = await res.text();
    return body.slice(0, 400000);
  } catch {
    return null;
  } finally {
    if (t) clearTimeout(t);
  }
}

const strip = (html) =>
  html.replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ');

export async function scan(domain) {
  const host = domain.replace(/^https?:\/\//, '').replace(/\/.*$/, '').trim();
  const record = {
    domain: host,
    scanned_at: new Date().toISOString(),
    reachable: false,
    pages_read: [],
    signals: {},
    evidence: {},
    lunara_registry: null,
    lunara_verify_file: false
  };

  let corpusText = '';
  for (const path of PATHS) {
    const body = await grab(`https://${host}${path}`);
    if (!body) continue;
    record.reachable = true;
    record.pages_read.push(path);
    corpusText += ' ' + strip(body);
    if (corpusText.length > 600000) break;
  }

  if (!record.reachable) return record;

  for (const [key, sig] of Object.entries(SIGNALS)) {
    const hits = [];
    for (const re of sig.patterns) {
      const m = corpusText.match(re);
      if (m) {
        const i = Math.max(0, m.index - 90);
        hits.push(corpusText.slice(i, m.index + m[0].length + 90).trim());
        if (hits.length >= 2) break;
      }
    }
    record.signals[key] = hits.length > 0;
    if (hits.length) record.evidence[key] = hits;
  }

  // Does the company already carry a Lunara credential?
  const vf = await grab(`https://${host}/.well-known/lunara-verify.json`);
  record.lunara_verify_file = Boolean(vf);
  try {
    const res = await fetch('https://base44.app/api/apps/6a46cea2687503d2d6d4ecd1/functions/shieldRegistryLookup', {
      method: 'POST', headers: { 'content-type': 'application/json', 'user-agent': UA },
      body: JSON.stringify({ domain: host })
    });
    if (res.ok) record.lunara_registry = (await res.json()).status ?? null;
  } catch { /* registry down is not the company's problem */ }

  return record;
}

/* Map signals to obligations. Deliberately conservative: this proposes
   which questions to ask, and refuses to conclude anything a homepage
   cannot support. */
export function assess(r) {
  const s = r.signals;
  const generative = s.generates_media || s.generates_text;
  const findings = [];

  if (!r.reachable) return { verdict: 'unreachable', findings: [], priority: 0 };

  if (s.converses && s.eu_exposure) {
    findings.push({
      obligation: 'eu-art50',
      article: 'Art. 50(1)',
      classification: 'hypothesis',
      finding: 'Appears to run a conversational system reaching EU users. The disclosure duty has applied since 2 August 2026 with no transitional relief.',
      resolved_by: s.discloses_ai
        ? 'Site does disclose AI somewhere, so this may already be handled. Worth confirming the disclosure appears in the interaction itself, not only in marketing copy.'
        : 'Nothing on the pages read discloses AI to the user. This is a question to ask, not a conclusion.'
    });
  }

  if (generative && s.eu_exposure) {
    findings.push({
      obligation: 'eu-art50-legacy',
      article: 'Art. 50(2)',
      classification: 'hypothesis',
      finding: 'Appears to generate content and reach EU users, which puts the machine-readable marking duty in play.',
      turns_on: 'When the system was placed on the market. Before 2 August 2026 → four months of relief, expiring 2 December 2026. On or after → the duty applied from day one and there was never any relief. A homepage cannot establish which, and this is the single fact the whole question turns on.',
      resolved_by: s.marking_ready
        ? 'Site mentions provenance or watermarking, so this may already be in hand.'
        : 'Nothing on the pages read mentions C2PA, Content Credentials, provenance or watermarking. That is an absence of published evidence, not evidence of absence — it may be implemented and undocumented.'
    });
  }

  // Priority is about who it is most useful to talk to, not who is most
  // at fault. Generative + EU + no published provenance is the sharpest
  // case because the deadline is nearest and the gap is most likely real.
  let priority = 0;
  if (generative && s.eu_exposure) priority += 3;
  if (generative && s.eu_exposure && !s.marking_ready) priority += 3;
  if (s.converses && s.eu_exposure && !s.discloses_ai) priority += 2;
  if (s.generates_media) priority += 1;
  if (r.lunara_registry === 'verified') priority = 0;

  return {
    verdict: findings.length ? 'questions_to_ask' : 'no_indication',
    findings,
    priority,
    caveat: 'Every finding above is marked hypothesis under the Lunara evidence standard. It is drawn from what this company published about itself and is a reason to ask a question. It is not an assessment, and it is not a statement that anyone is non-compliant.'
  };
}

async function main() {
  const args = process.argv.slice(2);
  let domains = [], out = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--file') domains.push(...readFileSync(args[++i], 'utf8').split('\n').map(x => x.trim()).filter(x => x && !x.startsWith('#')));
    else if (args[i] === '--json') out = args[++i];
    else domains.push(args[i]);
  }
  if (!domains.length) {
    console.error('usage: node tools/scan-exposure.mjs <domain>... [--file list.txt] [--json out.json]');
    process.exit(1);
  }

  const results = [];
  for (const d of domains) {
    const rec = await scan(d);
    const a = assess(rec);
    results.push({ ...rec, assessment: a });
    const flags = Object.entries(rec.signals).filter(([, v]) => v).map(([k]) => k).join(' ');
    console.log(
      `${String(a.priority).padStart(2)}  ${rec.domain.padEnd(28)} ` +
      `${rec.reachable ? rec.pages_read.length + 'p' : 'DOWN'}  ${flags || '—'}`
    );
  }
  results.sort((a, b) => b.assessment.priority - a.assessment.priority);
  if (out) { writeFileSync(out, JSON.stringify(results, null, 2)); console.log(`\nwrote ${out}`); }
}

if (import.meta.url === `file://${process.argv[1]}`) main();
