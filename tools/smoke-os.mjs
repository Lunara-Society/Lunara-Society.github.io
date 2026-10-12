#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   THE OS IN A REAL BROWSER — run by hand, not in CI
   ═══════════════════════════════════════════════════════════════════

   node tools/smoke-os.mjs [base-url]

   Needs Playwright with a Chromium (npx playwright install chromium);
   the site adds no dependency for it, which is why CI runs test-os.mjs
   instead. Without a base URL it serves this checkout on :8765. The
   pages talk to the live backends, so this also shows what production
   answers today.

   It holds the workspaces to the behaviour the pure tests cannot see:
     · on a phone, every workspace lays out at the desktop 1120px and
       nothing is wider (the standing decision)
     · reduced motion: no entrance, and the central structure holds still
     · the entrance plays once, is skipped by Escape, never comes back
     · keyboard: the skip link comes first, / and Ctrl+K open the palette,
       arrows select, Escape closes, the inspector takes and returns focus
     · the evidence registry fails an altered document
     · no page throws
   ═══════════════════════════════════════════════════════════════════ */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

let pw;
try { pw = await import('playwright'); } catch { console.log('skipped: Playwright is not installed (npm i -D playwright, or run where it is)'); process.exit(0); }
const { chromium, devices } = pw;
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let base = process.argv[2], server = null;
if (!base) {
  server = spawn('python3', ['-m', 'http.server', '8765'], { cwd: ROOT, stdio: 'ignore' });
  base = 'http://localhost:8765/';
  await new Promise((r) => setTimeout(r, 800));
}
const PAGES = ['command.html', 'status.html', 'investigate.html', 'agent-atlas.html', 'missions.html', 'evidence-registry.html', 'regulation.html', 'simulate.html', 'audit.html'];
let passed = 0, failed = 0;
const check = (ok, msg) => { if (ok) passed++; else { failed++; console.error('FAIL', msg); } };
const browser = await chromium.launch();
const errors = [];
const entered = () => { try { localStorage.setItem('lx-os-entered', '1'); } catch (e) {} };
try {
  for (const dev of ['iPhone 13', 'Pixel 7']) {
    const ctx = await browser.newContext({ ...devices[dev] });
    await ctx.addInitScript(entered);
    for (const p of PAGES) {
      const page = await ctx.newPage();
      page.on('pageerror', (e) => errors.push(`${p}: ${e.message}`));
      await page.goto(base + p); await page.waitForTimeout(1500);
      const m = await page.evaluate(() => ({ vw: window.innerWidth, sw: document.documentElement.scrollWidth }));
      check(m.vw === 1120 && m.sw <= 1120, `${dev} ${p}: laid out at ${m.vw}px, content ${m.sw}px`);
      await page.close();
    }
    await ctx.close();
  }
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
    const page = await ctx.newPage(); await page.goto(base + 'command.html'); await page.waitForTimeout(2500);
    const r = await page.evaluate(() => new Promise((res) => { const c = document.getElementById('cc-canvas'); const a = c.toDataURL(); const e = document.getElementById('cc-entrance'); setTimeout(() => res({ still: c.toDataURL() === a, entrance: !!e && !e.hidden }), 1200); }));
    check(!r.entrance, 'reduced motion: no entrance'); check(r.still, 'reduced motion: the structure holds still');
    await ctx.close();
  }
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await ctx.newPage(); await page.goto(base + 'command.html'); await page.waitForTimeout(400);
    check(await page.evaluate(() => { const e = document.getElementById('cc-entrance'); return !!e && !e.hidden; }), 'entrance plays on a first visit');
    await page.keyboard.press('Escape'); await page.waitForTimeout(700);
    check(await page.evaluate(() => !document.getElementById('cc-entrance')), 'Escape skips the entrance');
    const again = await ctx.newPage(); await again.goto(base + 'command.html'); await again.waitForTimeout(400);
    check(await again.evaluate(() => { const e = document.getElementById('cc-entrance'); return !e || e.hidden; }), 'the entrance does not come back');
    await ctx.close();
  }
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await ctx.addInitScript(entered);
    const page = await ctx.newPage(); await page.goto(base + 'status.html'); await page.waitForTimeout(2500);
    await page.keyboard.press('Tab');
    check(await page.evaluate(() => document.activeElement.classList.contains('os-skip')), 'the skip link is the first stop');
    await page.keyboard.press('/'); await page.waitForTimeout(200);
    check(await page.evaluate(() => document.activeElement.id === 'os-pal-q'), '/ opens the palette');
    await page.keyboard.type('status'); await page.keyboard.press('ArrowDown');
    check(await page.evaluate(() => !!document.getElementById('os-pal-q').getAttribute('aria-activedescendant')), 'arrows select an option');
    await page.keyboard.press('Escape');
    check(await page.evaluate(() => document.querySelector('.os-pal-back').hidden), 'Escape closes the palette');
    await page.keyboard.press('Control+k'); await page.waitForTimeout(150);
    check(await page.evaluate(() => !document.querySelector('.os-pal-back').hidden), 'Ctrl+K opens it too');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(3000);
    await page.focus('#st-rows tr'); await page.keyboard.press('Enter'); await page.waitForTimeout(300);
    check(await page.evaluate(() => document.activeElement.id === 'os-ins-title'), 'the inspector takes focus');
    await page.keyboard.press('Escape'); await page.waitForTimeout(200);
    check(await page.evaluate(() => document.activeElement.tagName === 'TR'), 'and gives it back');
    await ctx.close();
  }
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await ctx.addInitScript(entered);
    const page = await ctx.newPage(); page.on('pageerror', (e) => errors.push('evidence: ' + e.message));
    await page.goto(base + 'evidence-registry.html'); await page.waitForTimeout(5000);
    const verified = await page.locator('#ev-docs .os-state.verified').count();
    check(verified >= 5, `the signed documents verify in the browser (${verified})`);
    await page.click('#tamper-go'); await page.waitForTimeout(1500);
    check(/Verification failed/.test(await page.textContent('#tamper-out')), 'an altered document fails');
    await ctx.close();
  }
  check(!errors.length, 'no page threw: ' + errors.join('; '));
} finally {
  await browser.close();
  if (server) server.kill();
}
console.log(`${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
