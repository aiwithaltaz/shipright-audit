#!/usr/bin/env node
// Let the owner sign in by hand, then save the session so crawl, walk and visual can work behind the login.
// Claude never sees or types the password: the owner signs in in a real browser window.
// Usage: node <skill>/scripts/login.mjs <url> [--out docs/shipright/audit/.session.json] [--timeout 300]
//        [--headless]   for automated tests only: no window, works only if the page signs in by itself
// It saves as soon as the page looks signed in (no password field and not on a login URL) twice in a row,
// or when the owner closes the window. Pass the file to the other scripts with --session.
// The file holds login cookies: keep it out of git, and delete it when the audit is done.
// Exit 0 saved, 1 not signed in before the timeout, 2 usage or no screen to open a window on.
import { createRequire } from 'node:module';
import { launch, loadPlaywright, settle, normUrl } from './browser.mjs';
import { writeFileSync, mkdirSync, chmodSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';

const require = createRequire(import.meta.url);
const args = process.argv.slice(2);
const url = args.find((a, i) => !a.startsWith('--') && !['--out', '--timeout'].includes(args[i - 1]));
const flag = n => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
if (!url || !/^https?:/.test(url)) { console.error('usage: node <skill>/scripts/login.mjs <https://your-app> [--out file] [--timeout seconds]'); process.exit(2); }
const out = resolve(flag('--out') || join('docs', 'shipright', 'audit', '.session.json'));
const timeoutMs = Number(flag('--timeout') || 300) * 1000;
const headless = args.includes('--headless');
if (!headless && process.platform === 'linux' && !process.env.DISPLAY && !process.env.WAYLAND_DISPLAY) {
  console.error('login: no screen here to open a browser window on. Run this on the computer you use, or ask the owner for another way in.');
  process.exit(2);
}

const { chromium } = loadPlaywright('login');
const browser = await launch(chromium, { headless }, 'login');
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await context.newPage();
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
console.log('login: a browser window is open. Sign in there as you normally would.');
console.log('login: it saves by itself once you are signed in. You can also just close the window when you are in.');

const LOGIN_URL = /login|sign-?in|signin|auth|sso|oauth/i;
const looksSignedIn = async () => {
  if (page.isClosed()) return false;
  const hasPassword = await page.locator('input[type=password]').first().isVisible().catch(() => false);
  return !hasPassword && !LOGIN_URL.test(new URL(page.url()).pathname);
};
const save = async state => {
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(state, null, 2));
  try { chmodSync(out, 0o600); } catch {}
};

let last = null, streak = 0, closed = false, signedIn = false;
page.on('close', () => { closed = true; });
browser.on('disconnected', () => { closed = true; });
const started = Date.now();
while (Date.now() - started < timeoutMs) {
  if (closed) break;
  try { last = await context.storageState(); } catch { break; }
  streak = (await looksSignedIn().catch(() => false)) ? streak + 1 : 0;
  if (streak >= 2) { signedIn = true; break; }
  await new Promise(r => setTimeout(r, 1500));
}
// Decide before we close the browser ourselves, or our own close would look like the owner closing it.
const userClosed = closed;
const ok = !!last && (signedIn || userClosed);
if (ok) {
  await save(last);
  console.log(`login: saved the session to ${out}`);
  console.log(`login: ${signedIn ? 'you look signed in' : 'the window was closed, so I saved what it had'}. Use it with --session ${out}`);
  console.log('login: this file holds your login cookies. Keep it out of git and delete it after the audit.');
}
await browser.close().catch(() => {});
if (!ok) { console.error(`login: not signed in within ${Math.round(timeoutMs / 1000)} seconds. Run it again when you are ready.`); process.exit(1); }
