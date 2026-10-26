#!/usr/bin/env node
// Let the owner sign in by hand, then save the session so crawl, walk and visual can work behind the login.
// Claude never sees or types the password: the owner signs in in a real browser window.
// Usage: node <skill>/scripts/login.mjs <url> [--out docs/shipright/audit/.session.json] [--timeout 300]
//        [--profile dir]  where the window keeps its browser profile (default ~/.shipright/profiles/<site>)
//        [--headless]     for automated tests only: no window, works only if the page signs in by itself
// The window is a normal browser profile in the installed Microsoft Edge or Google Chrome (Playwright's
// Chromium only if neither starts), without the "controlled by automated software" flag. Sign-in with
// Google and other pop-up logins refuse or loop in a throwaway automated window, so this matters.
// The profile is kept, so the next audit of the same site usually opens already signed in.
// It saves once the page looks signed in (no password field, not on a login URL) twice in a row.
// Closing the window saves only if it was signed in by then.
// The session file and the profile hold login cookies: delete them when you are done
// (the session file, and ~/.shipright/profiles).
// Exit 0 saved, 1 not signed in, 2 usage or no screen to open a window on.
import { loadPlaywright, TOOLS_DIR } from './browser.mjs';
import { writeFileSync, mkdirSync, chmodSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';

const args = process.argv.slice(2);
const url = args.find((a, i) => !a.startsWith('--') && !['--out', '--timeout', '--profile'].includes(args[i - 1]));
const flag = n => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
if (!url || !/^https?:/.test(url)) { console.error('usage: node <skill>/scripts/login.mjs <https://your-app> [--out file] [--timeout seconds] [--profile dir]'); process.exit(2); }
const out = resolve(flag('--out') || join('docs', 'shipright', 'audit', '.session.json'));
const timeoutMs = Number(flag('--timeout') || 300) * 1000;
const headless = args.includes('--headless');
if (!headless && process.platform === 'linux' && !process.env.DISPLAY && !process.env.WAYLAND_DISPLAY) {
  console.error('login: no screen here to open a browser window on. Run this on the computer you use, or ask the owner for another way in.');
  process.exit(2);
}
const site = new URL(url).hostname.replace(/[^a-z0-9.-]/gi, '_');
const profile = resolve(flag('--profile') || join(dirname(TOOLS_DIR), 'profiles', site));
mkdirSync(profile, { recursive: true });

const { chromium } = loadPlaywright('login');
const LABEL = { msedge: 'Microsoft Edge', chrome: 'Google Chrome', chromium: "Playwright's Chromium" };
const wanted = (process.env.SHIPRIGHT_BROWSER || '').trim().toLowerCase();
const order = [...new Set([wanted, 'msedge', 'chrome', 'chromium'].filter(c => LABEL[c]))];
let context = null;
const tried = [];
for (const channel of order) {
  try {
    context = await chromium.launchPersistentContext(profile, {
      headless,
      ...(channel === 'chromium' ? {} : { channel }),
      viewport: null,
      ignoreDefaultArgs: ['--enable-automation'],
      args: ['--disable-blink-features=AutomationControlled', '--no-first-run', '--no-default-browser-check'],
    });
    console.error(`login: using ${LABEL[channel]}${tried.length ? ` (could not start: ${tried.join(', ')})` : ''}`);
    break;
  } catch (e) {
    const msg = String(e.message || e);
    if (/already in use|ProcessSingleton|lock/i.test(msg)) { console.error(`login: the sign-in profile is open in another window. Close that window and run this again.`); process.exit(2); }
    tried.push(LABEL[channel]);
  }
}
if (!context) { console.error(`login: no browser would start (tried ${tried.join(', ')}). Install Microsoft Edge or Google Chrome.`); process.exit(2); }
const page = context.pages()[0] || await context.newPage();
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
console.log('login: a browser window is open. Sign in there as you normally would, Google sign-in included.');
console.log('login: it saves by itself once you are signed in. Leave the window open until it closes.');

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

let last = null, streak = 0, closed = false, signedIn = false, wasIn = false;
page.on('close', () => { closed = true; });
context.on('close', () => { closed = true; });
const started = Date.now();
while (Date.now() - started < timeoutMs) {
  if (closed) break;
  try { last = await context.storageState(); } catch { break; }
  const inNow = await looksSignedIn().catch(() => false);
  streak = inNow ? streak + 1 : 0;
  if (inNow) wasIn = true;
  if (streak >= 2) { signedIn = true; break; }
  await new Promise(r => setTimeout(r, 1500));
}
// A window closed before sign-in finished must not save a signed-out session.
const ok = !!last && (signedIn || (closed && wasIn));
if (ok) {
  await save(last);
  console.log(`login: saved the session to ${out}. Use it with --session ${out}`);
  console.log('login: this file holds your login cookies. Keep it out of git and delete it after the audit.');
}
await context.close().catch(() => {});
if (!ok) {
  console.error(closed
    ? 'login: the window was closed before sign-in finished, so nothing was saved. Run it again and leave the window open until it closes by itself.'
    : `login: not signed in within ${Math.round(timeoutMs / 1000)} seconds. Run it again when you are ready.`);
  process.exit(1);
}
