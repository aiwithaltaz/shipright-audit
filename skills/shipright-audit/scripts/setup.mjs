#!/usr/bin/env node
// Installs Playwright for the audit scripts in the ShipRight tools folder (~/.shipright/tools),
// never in the app being audited. Safe to run again: it does nothing when Playwright is already found.
// Usage: node <skill>/scripts/setup.mjs [--check]
//   --check  only report whether Playwright is available (exit 0 yes, 1 no)
// Then it tries to download Playwright's Chromium. If that fails, the scripts still use the
// installed Microsoft Edge or Google Chrome, so a failed download is not an error.
import { spawnSync } from 'node:child_process';
import { mkdirSync, existsSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { TOOLS_DIR } from './browser.mjs';

const found = () => {
  for (const base of [import.meta.url, join(process.cwd(), 'package.json'), join(TOOLS_DIR, 'package.json')]) {
    try { createRequire(base)('playwright'); return true; } catch {}
  }
  return false;
};

if (process.argv.includes('--check')) {
  console.log(found() ? 'setup: Playwright is available' : 'setup: Playwright is missing');
  process.exit(found() ? 0 : 1);
}
if (found()) { console.log('setup: Playwright is already available. Nothing to do.'); process.exit(0); }

mkdirSync(TOOLS_DIR, { recursive: true });
const pkg = join(TOOLS_DIR, 'package.json');
if (!existsSync(pkg)) writeFileSync(pkg, JSON.stringify({ name: 'shipright-tools', private: true, description: 'Tools for ShipRight audits. Safe to delete.' }, null, 2));
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
console.log(`setup: installing Playwright in ${TOOLS_DIR} (not in your app)...`);
const r = spawnSync(npm, ['install', '--no-audit', '--no-fund', 'playwright'], { cwd: TOOLS_DIR, stdio: 'inherit', shell: process.platform === 'win32' });
if (r.status !== 0) { console.error('setup: npm install failed. Is Node 18+ with npm installed?'); process.exit(1); }
// On a Mac, also fetch WebKit (Safari's engine): the last fallback when Chromium, Edge and Chrome are all missing.
const engines = process.platform === 'darwin' ? ['chromium', 'webkit'] : ['chromium'];
const b = spawnSync(npx, ['playwright', 'install', ...engines], { cwd: TOOLS_DIR, stdio: 'inherit', shell: process.platform === 'win32' });
console.log(b.status === 0
  ? 'setup: done. Playwright and its Chromium are ready.'
  : 'setup: Playwright is installed. Its Chromium did not download, so the scripts will use Microsoft Edge or Google Chrome instead.');
