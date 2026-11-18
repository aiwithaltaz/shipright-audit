// Shared helpers for the audit scripts: find Playwright, start a browser, and wait for a page to settle.
//
// Playwright is looked for next to these scripts, in the current folder, and in the ShipRight tools
// folder (~/.shipright/tools), which setup.mjs fills. It is never installed into the app.
//
// Browsers, in order: SHIPRIGHT_BROWSER if set, Playwright's Chromium, the installed Microsoft Edge,
// the installed Google Chrome, then Playwright's WebKit (Safari's engine). It says which one it used
// when it had to fall back. SHIPRIGHT_BROWSER: chromium | msedge | chrome | webkit
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

export const TOOLS_DIR = join(homedir(), '.shipright', 'tools');
export const PROFILES_DIR = join(homedir(), '.shipright', 'profiles');
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
// Also words that change data with one click: likes, pins, stars, feedback, regenerate, share.
export const DANGER = /delete|remove|publish|\bpost\b|post now|send|\bpay|sign ?out|log ?out|archive|connect|generate|schedule|invite|save|submit|approve|purchase|\bbuy\b|upgrade|cancel (plan|subscription)|regenerate|retry|resend|\blike\b|dislike|thumb|feedback|\bvote|\bpin\b|unpin|\bstar\b|favou?rite|follow|subscribe|\bshare\b|duplicate|rename|\bfork\b|branch|record|dismiss|accept|decline/i;

// ---- The owner's limits on "use it like a real user" --------------------------------------------
// When the owner answers "yes, but ..." the audit writes <audit>/use-limits.json, in the owner's words:
//   { "answer": "yes with limits", "owner_words": "yes, but don't generate a video",
//     "allowed": ["flip switches and turn them back", "send up to 3 short test messages"],
//     "held": [{ "action": "generate a video", "match": ["generate", "render"] }],
//     "allow_controls": ["New project"] }
// held: what the owner ruled out. A switch or an owner-approved step is held when its name matches one:
//   with "match", when the name holds any of those words; without it, when the name holds every
//   meaningful word of the action ("generate a video" holds "Generate video", not "Video settings").
// allow_controls: buttons named create, add or new that the owner said may be clicked on a live app.
// The file is found from --limits <file>, then --audit <audit>, then the nearest one above --out.
const LIMIT_STOP = new Set('a an the any all to do dont don not no never but and or of in on for with my your our it its this that these those please anything nothing yes ok okay use using used touch make making create just only can may you i me we them at as be is are app test tests real user like up more than'.split(' '));
// A light stem, so "generating", "generated" and "generate" match, and "images" matches "image".
const stem = w => {
  if (w.length < 4) return w;
  const s = w.replace(/(ing|ed)$/, m => (w.length - m.length >= 4 ? '' : m)).replace(/s$/, '').replace(/e$/, '');
  return s.length >= 3 ? s : w;
};
const tokens = t => String(t || '').toLowerCase().replace(/[’']/g, '').split(/[^a-z0-9]+/).filter(Boolean);
export function useLimits(args, outDir = null, name = 'audit') {
  const flag = n => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
  const places = [];
  if (flag('--limits')) places.push(resolve(flag('--limits')));
  if (flag('--audit')) places.push(join(resolve(flag('--audit')), 'use-limits.json'));
  // --out is <audit>/explore or <audit>/walks/<task>: look in it and up to 2 folders above, no further.
  for (let d = outDir ? resolve(outDir) : null, i = 0; d && i < 3; i++) { places.push(join(d, 'use-limits.json')); const up = dirname(d); if (up === d) break; d = up; }
  const file = places.find(p => existsSync(p));
  if (flag('--limits') && file !== places[0]) { console.error(`${name}: limits file ${flag('--limits')} not found.`); process.exit(2); }
  if (!file) return null;
  let raw;
  try { raw = JSON.parse(readFileSync(file, 'utf8')); } catch (e) { console.error(`${name}: ${file} is not valid JSON: ${e.message}. Fix it before using the app: it holds the owner's limits.`); process.exit(2); }
  const held = (Array.isArray(raw.held) ? raw.held : []).map(h => typeof h === 'string' ? { action: h } : h).filter(h => h && h.action)
    .map(h => ({ action: String(h.action), any: Array.isArray(h.match) && h.match.length > 0, words: (Array.isArray(h.match) && h.match.length ? h.match.flatMap(tokens) : tokens(h.action).filter(w => !LIMIT_STOP.has(w))).map(stem) }))
    .filter(h => h.words.length);
  return { file, answer: String(raw.answer || ''), owner_words: String(raw.owner_words || ''), allowed: (raw.allowed || []).map(String), held, allow_controls: (raw.allow_controls || []).map(s => String(s).trim().toLowerCase()).filter(Boolean) };
}
// The held action a name matches, or null.
export function heldBy(limits, name) {
  if (!limits || !limits.held.length) return null;
  const have = tokens(name).map(stem);
  const has = w => have.some(t => t === w || (Math.min(t.length, w.length) >= 4 && (t.startsWith(w) || w.startsWith(t))));
  return limits.held.find(h => h.any ? h.words.some(has) : h.words.every(has)) || null;
}

// ---- Staying signed in -------------------------------------------------------------------------
// Many apps swap their sign-in token on every refresh, so a session file saved at sign-in goes stale
// within seconds. The sign-in window's own browser profile always holds the newest token, so the
// scripts reuse that profile first (--profile) and fall back to the saved session file (--session).

// Where login.mjs keeps the sign-in window's browser profile for a site.
export const profileFor = url => join(PROFILES_DIR, new URL(url).hostname.replace(/[^a-z0-9.-]/gi, '_'));

// login.mjs leaves a note in the profile saying which browser made it. A profile is only safe to
// reopen in that same browser.
const PROFILE_NOTE = 'shipright-profile.json';
export function noteProfile(profile, info) { try { writeFileSync(join(profile, PROFILE_NOTE), JSON.stringify(info, null, 2) + '\n'); } catch {} }
export function readProfileNote(profile) { try { return JSON.parse(readFileSync(join(profile, PROFILE_NOTE), 'utf8')); } catch { return null; } }

// Signed in means: no password field on screen, and not on a login URL.
const LOGIN_URL = /login|sign-?in|signin|auth|sso|oauth/i;
export async function looksSignedIn(page) {
  if (page.isClosed()) return false;
  const hasPassword = await page.locator('input[type=password]').first().isVisible().catch(() => false);
  return !hasPassword && !LOGIN_URL.test(new URL(page.url()).pathname);
}

// One file per audit says how to sign in: <audit>/signin.json, written by login.mjs --audit <audit>.
//   { "site", "start_url", "landed_url", "profile", "channel", "browser", "session", "signed_in_at" }
// Every script takes --audit <audit> and reads its sign-in from that file, so no command has to spell
// out --profile or --session (and nobody is tempted to keep them in a shell variable, which zsh passes
// as one word, so the script gets no flags at all and runs signed out).
// landed_url is where the app went after sign-in, when that is not the start URL: an app the landing
// page never links into is still reached, and the sign-in check runs on a page that needs the sign-in.
export const SIGNIN_NOTE = 'signin.json';
export const auditFolder = args => { const i = args.indexOf('--audit'); return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? resolve(args[i + 1]) : null; };
export function readSignIn(audit) { try { return JSON.parse(readFileSync(join(audit, SIGNIN_NOTE), 'utf8')); } catch { return null; } }
export function writeSignIn(audit, info) { mkdirSync(audit, { recursive: true }); writeFileSync(join(audit, SIGNIN_NOTE), JSON.stringify(info, null, 2) + '\n'); return join(audit, SIGNIN_NOTE); }

// Read the sign-in from a script's arguments: --profile and --session when given, the rest from
// <audit>/signin.json (--audit). --signed-out ignores them all, for the signed-out crawl.
// A path that does not exist is a usage error. Returns { session, profile, landed, audit }.
export function signInFlags(args, name = 'audit') {
  const flag = n => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
  const audit = auditFolder(args);
  if (args.includes('--signed-out')) return { session: undefined, profile: undefined, landed: null, audit };
  let session = flag('--session'), profile = flag('--profile'), landed = null;
  if (session && !existsSync(session)) { console.error(`${name}: session file ${session} not found. Run login.mjs first.`); process.exit(2); }
  if (profile && !(existsSync(profile) && statSync(profile).isDirectory())) { console.error(`${name}: profile folder ${profile} not found. Run login.mjs first: it prints the profile path to use.`); process.exit(2); }
  if (audit && existsSync(join(audit, SIGNIN_NOTE))) {
    const note = readSignIn(audit);
    if (!note) { console.error(`${name}: ${join(audit, SIGNIN_NOTE)} is not valid JSON. Run login.mjs again with --audit "${audit}".`); process.exit(2); }
    const given = !!(session || profile);
    const hasProfile = note.profile && existsSync(note.profile) && statSync(note.profile).isDirectory();
    const hasSession = note.session && existsSync(note.session);
    if (!profile && hasProfile) profile = note.profile;
    if (!session && hasSession) session = note.session;
    if (!given && !profile && !session) { console.error(`${name}: ${join(audit, SIGNIN_NOTE)} points to a sign-in profile and a session file that are gone. Run login.mjs again with --audit "${audit}".`); process.exit(2); }
    landed = note.landed_url || null;
  }
  return { session: session ? resolve(session) : undefined, profile: profile ? resolve(profile) : undefined, landed, audit };
}
// The page to check the sign-in on, and to visit first: where the app landed after sign-in, when that
// is on the same site as the start page. Otherwise null.
export function landedOn(landed, startUrl) {
  try { const a = new URL(landed), b = new URL(startUrl); return a.origin === b.origin && normUrl(a.href) !== normUrl(b.href) ? a.href : null; } catch { return null; }
}
// Defaults from --audit: where a script writes, and the crawl it reads.
export function auditPaths(args, sub) {
  const flag = n => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
  const audit = auditFolder(args);
  const crawl = flag('--crawl') || (audit && existsSync(join(audit, 'screens', 'crawl.json')) ? join(audit, 'screens', 'crawl.json') : undefined);
  return { audit, out: resolve(flag('--out') || (audit ? join(audit, sub) : join('docs', 'shipright', 'audits', 'current', sub))), crawl };
}

export const SIGNED_OUT_EXIT = 3;
const PROFILE_CHANNELS = ['msedge', 'chrome', 'chromium'];
const hasScreen = () => process.platform !== 'linux' || !!process.env.DISPLAY || !!process.env.WAYLAND_DISPLAY;

// Open the sign-in window's profile again, in the browser that made it.
async function openProfile(chromium, profile, { viewport, headed, name }) {
  const made = readProfileNote(profile)?.channel;
  const wanted = (process.env.SHIPRIGHT_BROWSER || '').trim().toLowerCase();
  // With a note, only that browser: opening a profile in an older browser can damage it.
  // Without one (a profile from an older ShipRight), try them in the order login.mjs does.
  const order = PROFILE_CHANNELS.includes(made) ? [made] : [...new Set([wanted, ...PROFILE_CHANNELS].filter(c => PROFILE_CHANNELS.includes(c)))];
  const errors = [];
  for (const channel of order) {
    try {
      const context = await chromium.launchPersistentContext(profile, {
        headless: !headed,
        // Always the full browser, never Playwright's separate headless shell: the shell cannot read the
        // cookies a windowed browser saved, and wipes them from the profile when it closes.
        channel,
        viewport,
        ignoreDefaultArgs: ['--enable-automation'],
        args: ['--disable-blink-features=AutomationControlled', '--no-first-run', '--no-default-browser-check',
          ...(headed ? ['--window-position=-2400,-2400', '--window-size=1280,900'] : [])],
      });
      return { context, channel };
    } catch (e) {
      const msg = String(e.message || e);
      if (/already in use|ProcessSingleton|SingletonLock|profile.*lock|lock.*profile/i.test(msg)) {
        console.error(`${name}: the sign-in profile is in use by another script or window. Run one script at a time: wait for it to finish (or close the sign-in window), then run this again.`);
        process.exit(2);
      }
      errors.push(`${LABEL[channel]}: ${msg.split('\n')[0].slice(0, 160)}`);
    }
  }
  throw new Error(`no browser would open the profile. Tried: ${errors.join(' · ')}`);
}

// Load the first page and see whether the app still knows us.
async function checkSignedIn(context, url) {
  const page = context.pages()[0] || await context.newPage();
  const unauthorized = [];
  const onResponse = r => { if (r.status() === 401) unauthorized.push(r.url().replace(/^https?:\/\/[^/]+/, '').split('?')[0].slice(0, 80)); };
  page.on('response', onResponse);
  let refused = null;
  try {
    const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
    if (resp && [401, 403, 429].includes(resp.status())) refused = `the page answered ${resp.status()}`;
  } catch (e) { refused = String(e.message || e).split('\n')[0].slice(0, 160); }
  if (!refused) await settle(page, { timeout: 8000 });
  const ok = !refused && await looksSignedIn(page).catch(() => false);
  page.off('response', onResponse);
  return { ok, page, refused, saw401: unauthorized[0] || null };
}

// One way to open a browser context for every script:
//   profile  reuse the sign-in window's browser profile (always holds the newest sign-in token)
//   session  a session file saved by login.mjs (goes stale on apps that swap their token)
//   neither  a fresh, signed-out context
// With a profile or a session it loads `url` and checks that the app still knows us. If not, it tries
// the next way once (profile, then the same profile in a window placed off screen in case the site
// refuses headless browsers, then the session file). If none is signed in it stops with exit 3:
// a script never runs on silently signed out.
// Returns { context, browser, page, mode, headed, channel, label, close }.
export async function openContext({ session, profile, viewport = { width: 1280, height: 800 }, name = 'audit', url, launchOptions = {} } = {}) {
  const { chromium } = loadPlaywright(name);
  const plans = [];
  if (profile) {
    plans.push({ mode: 'profile', headed: false });
    if (hasScreen() && process.env.SHIPRIGHT_NO_HEADED !== '1') plans.push({ mode: 'profile', headed: true });
  }
  if (session) plans.push({ mode: 'session', headed: false });
  if (!plans.length) plans.push({ mode: 'none', headed: false });
  const tried = [];
  for (const plan of plans) {
    let browser = null, context = null, channel = null;
    try {
      if (plan.mode === 'profile') ({ context, channel } = await openProfile(chromium, profile, { viewport, headed: plan.headed, name }));
      else {
        browser = await launch(chromium, launchOptions, name);
        context = await browser.newContext({ viewport, ...(plan.mode === 'session' ? { storageState: session } : {}) });
      }
    } catch (e) {
      if (browser) await browser.close().catch(() => {});
      tried.push({ label: plan.mode === 'profile' ? 'the sign-in profile' : 'the session file', refused: String(e.message || e).split('\n')[0].slice(0, 200), saw401: null });
      continue;
    }
    let closed = false;
    const close = async () => { if (closed) return; closed = true; await context.close().catch(() => {}); if (browser) await browser.close().catch(() => {}); };
    // A profile only keeps the newest sign-in token if the browser closes cleanly. If the script is
    // stopped or crashes, close the browser first, or the next script would find a stale token.
    if (plan.mode === 'profile') {
      const bail = code => err => { if (err instanceof Error) console.error(`${name}: ${err.stack || err.message}`); close().finally(() => process.exit(code)); };
      process.once('SIGINT', bail(130)); process.once('SIGTERM', bail(143));
      process.once('uncaughtException', bail(1)); process.once('unhandledRejection', bail(1));
    }
    const label = plan.mode === 'profile' ? `the sign-in profile (${LABEL[channel]}, ${plan.headed ? 'window off screen' : 'headless'})`
      : plan.mode === 'session' ? 'the session file (headless)' : 'no sign-in';
    const base = { context, browser, mode: plan.mode, headed: plan.headed, channel, label, close };
    if (plan.mode === 'none' || !url) return { ...base, page: context.pages()[0] || await context.newPage() };
    const res = await checkSignedIn(context, url);
    if (res.ok) {
      console.error(`${name}: signed in with ${label}${tried.length ? ` (after trying ${tried.map(t => t.label).join(', then ')})` : ''}`);
      return { ...base, page: res.page };
    }
    tried.push({ label, refused: res.refused, saw401: res.saw401 });
    await close();
    // A headed retry only helps when headless was the problem. If the next plan is that retry, say so.
    const next = plans[plans.indexOf(plan) + 1];
    if (next) console.error(`${name}: not signed in with ${label}${res.refused ? ` (${res.refused})` : ''}. Trying ${next.mode === 'profile' ? 'the same profile in a window placed off screen' : 'the session file'}.`);
  }
  const reached = tried.filter(t => !t.refused);
  if (!reached.length) {
    console.error(`${name}: could not open ${url}. ${tried.map(t => `${t.label}: ${t.refused}`).join(' · ')}`);
    process.exit(2);
  }
  const saw401 = tried.map(t => t.saw401).find(Boolean);
  console.error(`${name}: The app signed us out${saw401 ? ' (401)' : ''}. Run login.mjs again.`);
  console.error(`${name}: tried ${tried.map(t => t.label).join(', then ')}${saw401 ? `. The app answered 401 on ${saw401}` : ''}. Nothing was audited signed out.`);
  console.error(`${name}: node "${join(dirname(fileURLToPath(import.meta.url)), 'login.mjs')}" ${url}`);
  process.exit(SIGNED_OUT_EXIT);
}

// ---- Local apps --------------------------------------------------------------------------------
// Serve a local index.html (or its folder) over http, because many apps load ES modules that file://
// blocks. A URL is used as it is. Returns { remote, startUrl, root, stop }.
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2' };
export async function openTarget(target, name = 'audit') {
  if (/^https?:/.test(target)) return { remote: true, startUrl: target, root: null, stop: () => {} };
  const given = resolve(target);
  if (!existsSync(given)) { console.error(`${name}: ${target} not found`); process.exit(2); }
  const pagePath = statSync(given).isDirectory() ? join(given, 'index.html') : given;
  const root = dirname(pagePath);
  const server = await new Promise(ok => {
    const s = createServer((req, res) => {
      const file = resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://x').pathname));
      if (!(file + sep).startsWith(root + sep) || !existsSync(file) || !statSync(file).isFile()) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' });
      res.end(readFileSync(file));
    }).listen(0, '127.0.0.1', () => ok(s));
  });
  const rel = pagePath.slice(root.length).split(sep).join('/');
  return { remote: false, startUrl: `http://127.0.0.1:${server.address().port}${rel.startsWith('/') ? rel : '/' + rel}`, root, stop: () => server.close() };
}

// Every page a script should visit: the start page, where the app landed after sign-in (signin.json),
// --routes, and every screen in a crawl.json.
export function pagesToVisit({ startUrl, remote, routes, crawl, landed = null, name = 'audit' }) {
  const urls = [startUrl];
  if (landedOn(landed, startUrl)) urls.push(landedOn(landed, startUrl));
  for (const r of (routes || '').split(',').map(s => s.trim()).filter(Boolean)) urls.push(/^https?:/.test(r) ? r : new URL(r, startUrl).href);
  if (crawl) {
    try {
      // crawl.json holds the crawl's own local server address; keep only the path and hash for local apps.
      for (const s of JSON.parse(readFileSync(crawl, 'utf8')).screens || []) { const u = new URL(s.url); urls.push(remote ? s.url : new URL(u.pathname + u.search + u.hash, startUrl).href); }
    } catch (e) { console.error(`${name}: could not read ${crawl}: ${e.message}`); }
  }
  return [...new Set(urls.map(normUrl))];
}

// Read --widths "1280,390". Both run by default.
export function widthsFlag(args, fallback = [1280, 390]) {
  const i = args.indexOf('--widths');
  const list = i >= 0 ? String(args[i + 1] || '').split(',').map(n => Number(n.trim())).filter(n => n >= 240 && n <= 3840) : [];
  return list.length ? [...new Set(list)] : fallback;
}
export const viewportFor = width => ({ width, height: width <= 500 ? 844 : 800 });

// The in-page checks live in analyze-page.js, so an audit run by hand in a browser tool uses the same code.
// This returns the text to hand to page.evaluate().
let analyzeSrc = null;
export function analyzeScript(opts = {}) {
  analyzeSrc ??= readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'analyze-page.js'), 'utf8');
  return `(() => { ${analyzeSrc}\n return SHIPRIGHT_ANALYZE(${JSON.stringify(opts)}); })()`;
}

// The crop for a finding: its own box when the check gave one (a problem wider than one element, like
// a chip outside its card), else the element it marked. Returns true when a file was written.
export async function shootFinding(page, f, file) {
  if (f.crop) {
    const size = await page.evaluate(() => ({ w: Math.max(document.documentElement.scrollWidth, innerWidth), h: Math.max(document.documentElement.scrollHeight, innerHeight) })).catch(() => null);
    if (size) {
      const x = Math.max(0, Math.min(f.crop.x, size.w - 2)), y = Math.max(0, Math.min(f.crop.y, size.h - 2));
      const clip = { x, y, width: Math.max(2, Math.min(f.crop.width, size.w - x)), height: Math.max(2, Math.min(f.crop.height, size.h - y)) };
      if (await page.screenshot({ path: file, fullPage: true, clip }).then(() => true).catch(() => false)) return true;
    }
  }
  if (!f.mark) return false;
  return page.locator(`[data-srv="${f.mark}"]`).first().screenshot({ path: file, timeout: 5000 }).then(() => true).catch(() => false);
}

// One lead per problem: the same check with the same words (numbers aside) on several pages or widths
// is one lead that lists them all. A lead seen at only one of the widths says so.
export function mergeLeads(findings, widths, local = u => u) {
  const leads = [];
  for (const f of findings) {
    const key = f.kind + '|' + (f.group || String(f.what).replace(/\d+/g, '#'));
    const have = leads.find(l => l.key === key);
    const where = local(f.page);
    if (have) {
      if (!have.pages.includes(where)) have.pages.push(where);
      if (f.width && !have.widths.includes(f.width)) have.widths.push(f.width);
      if (f.shot) have.shots.push(f.shot);
      continue;
    }
    leads.push({ key, id: f.id, kind: f.kind, what: f.what, detail: f.detail, pages: [where], widths: f.width ? [f.width] : [], shots: f.shot ? [f.shot] : [], shot: f.shot || null });
  }
  for (const l of leads) {
    l.widths.sort((a, b) => b - a);
    if (widths.length > 1 && l.widths.length === 1) l.what += ` (at ${l.widths[0]} wide only)`;
    if (!l.shot && l.shots.length) l.shot = l.shots[0];
  }
  return leads.map(({ key, ...l }) => l);
}

// The pattern a link shares with its siblings in a list of items: "/chat/abc" and "/chat/xyz" are both
// "/chat/*". Works for paths, hash routes ("#/chat/abc") and id queries ("?id=7"). Top-level pages
// ("/settings") have no pattern: they are places, not items.
export function linkPattern(u) {
  let x; try { x = new URL(u); } catch { return null; }
  const hashRoute = x.hash.startsWith('#/');
  const segs = (hashRoute ? x.hash.slice(1) : x.pathname).split('/').filter(Boolean);
  if (segs.length >= 2) return `${hashRoute ? x.pathname + '#' : ''}/${segs.slice(0, -1).join('/')}/*`;
  const idKey = [...x.searchParams.keys()].find(k => /^(id|c|chat|conversation|thread|item|file|doc|document|project|p|q)$/i.test(k));
  return idKey ? `${x.pathname}?${idKey}=*` : null;
}
