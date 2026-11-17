#!/usr/bin/env node
// Let the owner sign in by hand, then keep the sign-in so crawl, explore, visual, consistency, samples and
// walk can work behind the login.
// Claude never sees or types the password: the owner signs in in a real browser window.
// Usage: node <skill>/scripts/login.mjs <url> --audit <audit> [--timeout 300]
//        --audit dir      this audit's folder. The session file goes to <audit>/.session.json, and
//                         <audit>/signin.json records how to sign in: the profile path, the browser, the
//                         session file and where the app landed after sign-in (when that is not <url>).
//                         Every other script then needs only --audit <audit> to be signed in.
//        [--out file]     the session file, when not <audit>/.session.json
//        [--profile dir]  where the window keeps its browser profile (default ~/.shipright/profiles/<site>)
//        [--headless]     for automated tests only: no window, works only if the page signs in by itself
// The window is a normal browser profile in the installed Microsoft Edge or Google Chrome (Playwright's
// Chromium only if neither starts), without the "controlled by automated software" flag. Sign-in with
// Google and other pop-up logins refuse or loop in a throwaway automated window, so this matters.
// The profile is kept, so the next audit of the same site usually opens already signed in.
// It prints the profile path and the browser it used: the other scripts take that path as --profile and
// reopen the same profile in the same browser, so they are signed in even when the app swaps its
// sign-in token on every refresh. The saved session file (--session) is the fallback.
// It saves once the page looks signed in (no password field, not on a login URL) twice in a row.
// A public start page that still shows a "Sign in" or "Log in" link does not count: the owner has not
// signed in yet, and saving then would save a signed-out session.
// Closing the window saves only if it was signed in by then.
// The session file and the profile hold login cookies: delete them when you are done
// (the session file, and ~/.shipright/profiles).
// Exit 0 saved, 1 not signed in, 2 usage or no screen to open a window on.
import { loadPlaywright, looksSignedIn as signedInOn, profileFor, noteProfile, auditFolder, writeSignIn, normUrl } from './browser.mjs';
import { writeFileSync, mkdirSync, chmodSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';

const args = process.argv.slice(2);
const url = args.find((a, i) => !a.startsWith('--') && !['--out', '--timeout', '--profile', '--audit'].includes(args[i - 1]));
const flag = n => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
if (!url || !/^https?:/.test(url)) { console.error('usage: node <skill>/scripts/login.mjs <https://your-app> --audit <audit folder> [--timeout seconds] [--out file] [--profile dir]'); process.exit(2); }
const audit = auditFolder(args);
const out = resolve(flag('--out') || join(audit || join('docs', 'shipright', 'audits', 'current'), '.session.json'));
const timeoutMs = Number(flag('--timeout') || 300) * 1000;
const headless = args.includes('--headless');
if (!headless && process.platform === 'linux' && !process.env.DISPLAY && !process.env.WAYLAND_DISPLAY) {
  console.error('login: no screen here to open a browser window on. Run this on the computer you use, or ask the owner for another way in.');
  process.exit(2);
}
const profile = resolve(flag('--profile') || profileFor(url));
mkdirSync(profile, { recursive: true });

const { chromium } = loadPlaywright('login');
const LABEL = { msedge: 'Microsoft Edge', chrome: 'Google Chrome', chromium: "Playwright's Chromium" };
const wanted = (process.env.SHIPRIGHT_BROWSER || '').trim().toLowerCase();
const order = [...new Set([wanted, 'msedge', 'chrome', 'chromium'].filter(c => LABEL[c]))];
let context = null, used = null;
const tried = [];
for (const channel of order) {
  try {
    context = await chromium.launchPersistentContext(profile, {
      headless,
      // In --headless test mode, "chromium" must still be the full browser, not Playwright's headless
      // shell: the other scripts reopen this profile with the full browser, and the two cannot share cookies.
      ...(channel === 'chromium' && !headless ? {} : { channel }),
      viewport: null,
      ignoreDefaultArgs: ['--enable-automation'],
      args: ['--disable-blink-features=AutomationControlled', '--no-first-run', '--no-default-browser-check'],
    });
    used = channel;
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

// The other scripts reopen this profile in the same browser, so leave a note saying which one made it.
noteProfile(profile, { channel: used, site: new URL(url).hostname });
// Still on the start page, with a sign-in link in view: a public page, not a signed-in one.
const SIGN_IN_LINK = /^(sign in|log in|login|sign in with \w+|log in with \w+)$/i;
const stillPublic = async () => {
  if (normUrl(page.url()) !== normUrl(url)) return false;
  return page.evaluate(src => {
    const re = new RegExp(src, 'i');
    return [...document.querySelectorAll('a, button, [role=button], [role=link]')].some(el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && re.test((el.innerText || el.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim()); });
  }, SIGN_IN_LINK.source).catch(() => false);
};
const looksSignedIn = async () => (await signedInOn(page)) && !(await stillPublic());
const save = async state => {
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(state, null, 2));
  try { chmodSync(out, 0o600); } catch {}
};

let last = null, streak = 0, closed = false, signedIn = false, wasIn = false, landedAt = null;
page.on('close', () => { closed = true; });
context.on('close', () => { closed = true; });
const started = Date.now();
while (Date.now() - started < timeoutMs) {
  if (closed) break;
  const inNow = await looksSignedIn().catch(() => false);
  streak = inNow ? streak + 1 : 0;
  // Where the app took the owner after sign-in. The newest signed-in page wins, so a short stop on
  // the way (a callback page that forwards to the dashboard) is not kept.
  if (inNow) landedAt = page.url();
  // Read the cookies only once the page looks signed in. Reading storage opens a hidden tab for every site
  // the window has visited (Google's sign-in included); doing that every few seconds kept reloading and
  // broke "Sign in with Google" pop-ups.
  if (inNow) { try { last = await context.storageState(); wasIn = true; } catch { break; } }
  if (streak >= 2) { signedIn = true; break; }
  await new Promise(r => setTimeout(r, 1500));
}
// A window closed before sign-in finished must not save a signed-out session.
const ok = !!last && (signedIn || (closed && wasIn));
if (ok) {
  await save(last);
  console.log(`login: signed in. Profile: ${profile} · Browser: ${LABEL[used]} (${used})`);
  // One file says how to sign in, so the next scripts need only --audit <audit>.
  const landed = landedAt && normUrl(landedAt) !== normUrl(url) ? landedAt : null;
  if (audit) {
    const note = writeSignIn(audit, { site: new URL(url).hostname, start_url: url, landed_url: landed, profile, channel: used, browser: LABEL[used], session: out, signed_in_at: new Date().toISOString() });
    console.log(`login: wrote ${note}. Next scripts: --audit "${audit}" (no other sign-in flags needed).`);
    if (landed) console.log(`login: after sign-in the app landed on ${landed}. The crawl starts there too.`);
  } else console.log(`login: next scripts: --profile "${profile}" --session "${out}" (or run login.mjs with --audit <audit folder> and pass only --audit to them)`);
  console.log('login: the profile always holds the newest sign-in. The session file is the fallback: apps that swap their sign-in token make it stale within seconds.');
  console.log('login: both hold your login cookies. Keep them out of git and delete them after the audit.');
}
await context.close().catch(() => {});
if (!ok) {
  console.error(closed
    ? 'login: the window was closed before sign-in finished, so nothing was saved. Run it again and leave the window open until it closes by itself.'
    : `login: not signed in within ${Math.round(timeoutMs / 1000)} seconds. Run it again when you are ready.`);
  process.exit(1);
}
