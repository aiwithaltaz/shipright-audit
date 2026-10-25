// Shared browser launcher for the audit scripts.
// Playwright's own Chromium does not start on every machine (for example some Windows preview builds),
// so this tries, in order: SHIPRIGHT_BROWSER if set, Playwright's Chromium, then the installed
// Microsoft Edge, then the installed Google Chrome. It prints which one it used when it had to fall back.
// SHIPRIGHT_BROWSER: chromium | msedge | chrome
import { createRequire } from 'node:module';
import { join } from 'node:path';

export function loadPlaywright(name) {
  const require = createRequire(import.meta.url);
  for (const mod of ['playwright', 'playwright-core']) { try { return require(mod); } catch {} }
  try { return createRequire(join(process.cwd(), 'package.json'))('playwright'); } catch {}
  console.error(`${name}: Playwright not found. Install it with: npm i -D playwright && npx playwright install chromium`);
  process.exit(2);
}

const LABEL = { chromium: "Playwright's Chromium", msedge: 'Microsoft Edge', chrome: 'Google Chrome' };

export async function launch(chromium, options = {}, name = 'audit') {
  const wanted = (process.env.SHIPRIGHT_BROWSER || '').trim().toLowerCase();
  const order = [...new Set([wanted, 'chromium', 'msedge', 'chrome'].filter(c => LABEL[c]))];
  const errors = [];
  for (const channel of order) {
    try {
      const browser = await chromium.launch(channel === 'chromium' ? options : { ...options, channel });
      if (channel !== order[0] || wanted) console.error(`${name}: using ${LABEL[channel]}${errors.length ? ` (could not start: ${errors.map(e => e.split(':')[0]).join(', ')})` : ''}`);
      return browser;
    } catch (e) {
      errors.push(`${LABEL[channel]}: ${String(e.message || e).split('\n')[0].slice(0, 160)}`);
    }
  }
  console.error(`${name}: no browser would start. Tried:\n${errors.map(e => '  - ' + e).join('\n')}\nInstall Microsoft Edge or Google Chrome, or run: npx playwright install chromium`);
  process.exit(2);
}
