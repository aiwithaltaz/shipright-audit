// Shared helpers for the audit scripts: find Playwright, start a browser, and wait for a page to settle.
//
// Playwright is looked for next to these scripts, in the current folder, and in the ShipRight tools
// folder (~/.shipright/tools), which setup.mjs fills. It is never installed into the app.
//
// Browsers, in order: SHIPRIGHT_BROWSER if set, Playwright's Chromium, the installed Microsoft Edge,
// the installed Google Chrome, then Playwright's WebKit (Safari's engine). It says which one it used
// when it had to fall back. SHIPRIGHT_BROWSER: chromium | msedge | chrome | webkit
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

export const TOOLS_DIR = join(homedir(), '.shipright', 'tools');
let pw = null;

export function loadPlaywright(name = 'audit') {
  if (pw) return pw;
  const here = createRequire(import.meta.url);
  const places = [
    () => here('playwright'),
    () => here('playwright-core'),
    () => createRequire(join(process.cwd(), 'package.json'))('playwright'),
    () => createRequire(join(TOOLS_DIR, 'package.json'))('playwright'),
    () => here('/opt/node22/lib/node_modules/playwright'),
  ];
  for (const p of places) { try { pw = p(); return pw; } catch {} }
  console.error(`${name}: Playwright not found. Run: node "${join(dirname(fileURLToPath(import.meta.url)), 'setup.mjs')}" (installs it in ${TOOLS_DIR}, never in your app)`);
  process.exit(2);
}

const LABEL = { chromium: "Playwright's Chromium", msedge: 'Microsoft Edge', chrome: 'Google Chrome', webkit: "Playwright's WebKit" };

export async function launch(chromium, options = {}, name = 'audit') {
  const wanted = (process.env.SHIPRIGHT_BROWSER || '').trim().toLowerCase();
  const order = [...new Set([wanted, 'chromium', 'msedge', 'chrome', 'webkit'].filter(c => LABEL[c]))];
  const errors = [];
  for (const channel of order) {
    try {
      let browser;
      if (channel === 'webkit') {
        const webkit = (pw || loadPlaywright(name)).webkit;
        const { args, ...rest } = options; // Chromium flags mean nothing to WebKit
        browser = await webkit.launch(rest);
      } else {
        browser = await chromium.launch(channel === 'chromium' ? options : { ...options, channel });
      }
      if (channel !== order[0] || wanted) console.error(`${name}: using ${LABEL[channel]}${errors.length ? ` (could not start: ${errors.map(e => e.split(':')[0]).join(', ')})` : ''}`);
      return browser;
    } catch (e) {
      errors.push(`${LABEL[channel]}: ${String(e.message || e).split('\n')[0].slice(0, 160)}`);
    }
  }
  console.error(`${name}: no browser would start. Tried:\n${errors.map(e => '  - ' + e).join('\n')}\nInstall Microsoft Edge or Google Chrome, or run: npx playwright install chromium`);
  process.exit(2);
}

// Wait until the page stops changing: network quiet, no visible spinner or skeleton, and the
// visible text and numbers the same on two reads in a row. Pages that show "0" or "Nothing here"
// for a second before their data arrives would otherwise be measured in that false state.
// Returns true when settled, false when it gave up (the caller should say the page may be mid-load).
export async function settle(page, { timeout = 10000 } = {}) {
  const start = Date.now();
  try { await page.waitForLoadState('networkidle', { timeout: Math.min(4000, timeout) }); } catch {}
  let last = null, same = 0;
  while (Date.now() - start < timeout) {
    const snap = await page.evaluate(() => {
      const shown = el => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) > 0.05; };
      const busy = [...document.querySelectorAll('[aria-busy="true"], [role="progressbar"], [class*="spinner" i], [class*="skeleton" i], [class*="shimmer" i], [data-loading="true"]')].some(shown);
      const text = (document.body?.innerText || '').replace(/\s+/g, ' ');
      return { busy, key: text.length + '|' + (text.match(/\d+/g) || []).join(',').slice(0, 3000) };
    }).catch(() => null);
    if (snap && !snap.busy && snap.key === last) { if (++same >= 2) return true; }
    else same = 0;
    last = snap?.key ?? null;
    await page.waitForTimeout(500);
  }
  return false;
}

// One spelling per page, so "https://app.com" and "https://app.com/" are not audited twice.
export function normUrl(u) {
  try { const x = new URL(u); if (x.pathname.length > 1) x.pathname = x.pathname.replace(/\/+$/, ''); return x.href; } catch { return u; }
}

// Words on buttons a guest in a live app must not click without the owner's yes.
export const DANGER = /delete|remove|publish|\bpost\b|post now|send|\bpay|sign ?out|log ?out|archive|connect|generate|schedule|invite|save|submit|approve|purchase|\bbuy\b|upgrade|cancel (plan|subscription)/i;
