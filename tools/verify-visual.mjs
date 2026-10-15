#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   THE VISUAL RULES, HELD
   ═══════════════════════════════════════════════════════════════════

   node tools/verify-visual.mjs

   The visual system has a few rules that are decisions, not taste, and
   each of them was broken at least once before it was written down:

     1. No particles, stars or embers as a background. Particles belong
        to a moment when something is made (the intro, a verdict stamp),
        never to the page behind the reading.
     2. Sound is off until the visitor switches it on (lx-sound = '1').
     3. Moving between pages is not a security check and is not dressed
        as one: no "access granted" on an ordinary navigation, and no
        register row lit "as though somebody just queried it".
     4. The intro keeps its contract: at most once every twelve hours,
        never for crawlers or a #link, ?intro=1 replays it, Skip and
        Escape leave, reduced motion is honoured, and the seal is the
        official artwork, not a redrawing.
     5. Every page that carries the shell or the OS links the shared
        materials first, so tokens cannot drift between pages.
   ═══════════════════════════════════════════════════════════════════ */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
let failed = 0;
const fail = (m) => { failed++; console.error('  ✗ ' + m); };
const ok = (m) => console.log('  ✓ ' + m);

// The published tree: what CI uploads (shield-os/ and the backups are removed before upload).
const SKIP_DIRS = new Set(['.git', 'node_modules', 'shield-os', 'registry-backend', 'stripe-checkout', 'member-auth', 'lens-backend', 'mcp', 'tools', 'corpus', 'docs', 'whatsapp-webhook']);
function walk(dir, out = []) {
  for (const e of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
    if (e.name.startsWith('.') || SKIP_DIRS.has(e.name)) continue;
    const p = dir ? dir + '/' + e.name : e.name;
    if (e.isDirectory()) walk(p, out); else if (/\.(html|js|css)$/.test(e.name)) out.push(p);
  }
  return out;
}
const files = walk('').filter((p) => !/^(index-old-backup|index-backup-june25|email_)/.test(p));

/* 1. no background particles */
{
  const imm = read('lunara-immersive.js'), home = read('lunara-home.js'), cos = read('lunara-cosmos.js'), eng = read('lunara-engine.js');
  if (/el\('canvas',\s*'lx-dust'\)/.test(imm) || /function buildDust/.test(imm)) fail('lunara-immersive.js still builds the dust canvas');
  if (/stars\.push/.test(home)) fail('lunara-home.js still draws a starfield');
  if (/safe\('sky'/.test(cos)) fail('lunara-cosmos.js starts the starfield');
  if (/id = 'lxe-cur'|lxe-dot/.test(eng)) fail('lunara-engine.js still draws a cursor trail');
  if (!failed) ok('no starfield, dust or cursor trail behind any page');
}

/* 2. sound is opt-in */
{
  const before = failed;
  for (const p of files.filter((f) => f.endsWith('.js'))) {
    const s = read(p);
    if (/getItem\(\s*'lx-sound'\s*\)\s*[!=]==\s*'0'/.test(s)) fail(`${p}: sound treated as on unless switched off (compare with '1')`);
  }
  if (failed === before) ok('sound is off until the visitor switches it on');
}

/* 3. no dressed-up security on navigation, no invented activity */
{
  const before = failed;
  for (const p of files) {
    const s = read(p);
    if (/access granted/i.test(s)) fail(`${p}: says "access granted"`);
  }
  if (/function ledger\(|\bledger\]/.test(read('lunara-immersive.js'))) fail('lunara-immersive.js lights register rows nobody queried');
  if (failed === before) ok('navigation claims no check, and no row lights up without a query');
}

/* 4. the intro's contract */
{
  const before = failed;
  const idx = read('index.html'), js = read('lunara-intro.js'), css = read('lunara-intro.css');
  const head = idx.slice(0, idx.indexOf('</head>'));
  if (!/12 \* 3600e3/.test(head)) fail('index.html: the twelve-hour gate is gone');
  if (!/intro=1/.test(head) || !/nointro/.test(head)) fail('index.html: ?intro=1 / ?nointro are not honoured');
  if (!/bot\|crawl/.test(head) || !/location\.hash/.test(head)) fail('index.html: crawlers or #links would see the intro');
  if (!/lx-intro-at/.test(head) || !/setItem\('lx-intro-at'/.test(js)) fail('the intro does not record when it played');
  if (!/id="lxi-skip"/.test(idx)) fail('index.html: the intro has no Skip');
  if (!/'Escape'/.test(js)) fail('lunara-intro.js: Escape does not leave');
  if (!/prefers-reduced-motion/.test(js) || !/prefers-reduced-motion/.test(css)) fail('the intro ignores reduced motion');
  if (!/src="\/lunara_emblem_512\.png"/.test(idx.slice(idx.indexOf('id="lx-intro"')))) fail('the intro seal is not the official emblem artwork');
  if (/ARMED|SECURE|UNVERIFIED|AWAITING TOUCH/.test(js)) fail('lunara-intro.js shows a status read-out it has not checked');
  if (failed === before) ok('intro: twelve hours, ?intro=1, Skip, Escape, reduced motion, official seal, no invented status');
}

/* 5. one set of materials everywhere */
{
  const before = failed;
  let n = 0;
  for (const p of files.filter((f) => f.endsWith('.html'))) {
    const s = read(p);
    const m = s.match(/href="[^"]*lunara-(shell|os)\.css"/);
    if (!m) continue;
    n++;
    const at = s.indexOf('lunara-materials.css');
    if (at < 0) fail(`${p}: links lunara-${m[1]}.css but not lunara-materials.css`);
    else if (at > s.indexOf(m[0])) fail(`${p}: lunara-materials.css comes after lunara-${m[1]}.css`);
  }
  if (!existsSync(join(ROOT, 'lunara-materials.css'))) fail('lunara-materials.css is missing');
  if (failed === before) ok(`all ${n} shell and OS pages link the shared materials first`);
}

if (failed) { console.error(`\n${failed} visual rule(s) broken`); process.exit(1); }
console.log('visual rules held');
