#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   THE DESKTOP VIEWPORT IS NOT NEGOTIABLE
   ═══════════════════════════════════════════════════════════════════

   Every page carrying the shell must declare a fixed desktop viewport,
   so a phone renders the desktop layout without being asked to. This
   was a deliberate decision and it is a standing one: a reader who
   prefers the mobile layout can switch in their own browser, and that
   is their choice to make rather than ours to make for them.

   The reason this is a gate rather than a comment is that
   width=device-width is what nearly every tool, template, snippet and
   habit will reach for. It is the correct default almost everywhere,
   which is exactly why it will come back by accident — one page copied
   from another, one editor's autocomplete, one well-meaning fix for a
   "mobile bug" — and nobody would notice, because a page reverting to
   device-width does not look broken. It looks normal. It just quietly
   stops doing the thing that was asked for.

   The zoom check is not the same rule and is not decorative. Laying a
   1120px page out on a 400px screen scales the text to roughly a third
   of its size. That is readable, but only just, and the reader's escape
   hatch is pinch-zoom. A page that both forces a desktop width and sets
   user-scalable=no leaves them with small text and no recourse, which
   is a genuine accessibility failure rather than a preference. So the
   two are checked together: force the width, never block the zoom.

   Applications are exempt. shield-os/, rosario-app/ and wren/ are not
   pages of this site, and an app UI pinned to a desktop width is not
   the same improvement — the rule is about the website.
   ═══════════════════════════════════════════════════════════════════ */

import { readFileSync, readdirSync } from 'node:fs';

const WIDTH = 1120;
const VIEWPORT = /<meta[^>]*name=["']viewport["'][^>]*>/gi;

const pages = readdirSync('.')
  .filter((f) => f.endsWith('.html'))
  .filter((f) => !/-backup|-old/.test(f))
  .filter((f) => readFileSync(f, 'utf8').includes('lunara-shell.js'))
  .sort();

let bad = 0;
const fail = (f, m) => { bad++; console.error(`  ✗ ${f}\n      ${m}`); };

if (!pages.length) {
  console.error('  ✗ no shell pages found — has the shell been renamed?');
  process.exit(1);
}

for (const f of pages) {
  const html = readFileSync(f, 'utf8');
  const tags = html.match(VIEWPORT) || [];

  if (tags.length === 0) {
    fail(f, 'no viewport meta at all. Expected content="width=1120".');
    continue;
  }
  if (tags.length > 1) {
    fail(f, `${tags.length} viewport metas. The last one wins, which makes the`
          + ' first a lie to anyone reading the file.');
  }

  for (const tag of tags) {
    const content = (tag.match(/content=["']([^"']*)["']/i) || [, ''])[1];
    const width = (content.match(/width\s*=\s*([^,\s]+)/i) || [, ''])[1];

    if (/device-width/i.test(width)) {
      fail(f, 'viewport reverted to width=device-width. Automatic desktop mode'
            + ' is a standing decision — a reader who wants the mobile layout'
            + ' switches in their own browser. Expected width=1120.');
    } else if (Number(width) !== WIDTH) {
      fail(f, `viewport width is ${JSON.stringify(width)}, expected ${WIDTH}.`
            + ' 1120 is the narrowest width that still yields the full desktop'
            + ' navigation — the shell collapses to a burger at 960.');
    }

    if (/user-scalable\s*=\s*no/i.test(content) || /minimum-ui/i.test(content)) {
      fail(f, 'user-scalable=no. At a forced desktop width the text renders at'
            + ' about a third of its size, and pinch-zoom is the reader\'s only'
            + ' way back. Blocking it is an accessibility failure.');
    }
    const maxScale = Number((content.match(/maximum-scale\s*=\s*([\d.]+)/i) || [, ''])[1]);
    if (maxScale && maxScale < 2) {
      fail(f, `maximum-scale=${maxScale} caps zoom below 2x, for the same reason`
            + ' as above. Remove it or raise it to at least 2.');
    }
  }
}

if (bad) {
  console.error(`\n  ${bad} problem${bad === 1 ? '' : 's'} across ${pages.length} pages.\n`);
  process.exit(1);
}
console.log(`  ✓ all ${pages.length} shell pages force width=${WIDTH} and allow zoom`);
