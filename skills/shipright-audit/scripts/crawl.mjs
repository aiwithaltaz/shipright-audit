#!/usr/bin/env node
// Visit every reachable screen of a local app or URL.
// Usage: node <skill>/scripts/crawl.mjs <index.html|url> [--out dir] [--profile dir] [--session session.json] [--json]
// --profile: the sign-in window's browser profile (login.mjs prints its path). Use it first: it always
//            holds the newest sign-in, even when the app swaps its sign-in token on every refresh.
// --session: a signed-in session file saved by login.mjs. The fallback when the profile cannot be used.
// With either, the crawl first checks that the app still knows us. If not, it tries the other one once,
// then stops with exit 3 ("The app signed us out"). It never crawls on silently signed out.
// Run one script at a time on a profile.
// Also reports a login wall (every screen asks for a password) and empty screens (little or no data).
// <skill> is the folder that holds SKILL.md.
// Saves full-page shots at 390 and 1280 (capped at 6000px tall), the H1, actions, fields, and console errors.
// The top 800px (desktop) or 844px (phone) of each shot is the first screen a user sees.
// Signs in with a demo account when a login form is offered. Skips accounts that say unapproved or denied.
// Needs Node 18+ and Playwright with Chromium.
// If Playwright is missing: prints one install command and exits 2.
import { createRequire } from 'node:module';
import { openContext, signInFlags, settle, normUrl, linkPattern } from './browser.mjs';
import { createServer } from 'node:http';
import { mkdirSync, writeFileSync, existsSync, readFileSync, statSync } from 'node:fs';
import { resolve, join, dirname, extname, sep, basename } from 'node:path';

const require = createRequire(import.meta.url);

const args = process.argv.slice(2);
const target = args.find((a, i) => !a.startsWith('--') && !['--out', '--session', '--profile'].includes(args[i - 1]));
if (!target) {
  console.error('usage: node <skill>/scripts/crawl.mjs <index.html|url> [--out dir] [--profile dir] [--session session.json] [--json]');
  process.exit(2);
}
const flag = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const wantJson = args.includes('--json');
const { session, profile } = signInFlags(args, 'crawl');
const remote = /^https?:/.test(target);
const pagePath = remote ? null : resolve(target);
const root = remote ? null : (existsSync(pagePath) && statSync(pagePath).isDirectory() ? pagePath : dirname(pagePath));
const outDir = resolve(flag('--out') || join(root || '.', 'crawl-out'));
mkdirSync(outDir, { recursive: true });
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2' };

function serve(dir) {
  return new Promise(ok => {
    const server = createServer((req, res) => {
      const file = resolve(dir, '.' + decodeURIComponent(new URL(req.url, 'http://x').pathname));
      if (!(file + sep).startsWith(dir + sep) || !existsSync(file) || !statSync(file).isFile()) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' });
      res.end(readFileSync(file));
    }).listen(0, '127.0.0.1', () => ok(server));
  });
}

const errors = [];
function noteError(text) {
  const line = String(text || '').slice(0, 300);
  if (line && !errors.includes(line)) errors.push(line);
}

const MAX_SHOT_PX = 6000;
async function snapshot(page, id, signedIn) {
  // Read every screen at desktop width; the phone screenshot below would otherwise leave the next read at 390.
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.waitForTimeout(100);
  const facts = await page.evaluate(() => {
    const vis = el => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
    };
    const text = el => (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
    const h1 = text(document.querySelector('h1') || document.body).slice(0, 180);
    const h2 = text(document.querySelector('h2') || { innerText: '' }).slice(0, 180);
    const actions = [...document.querySelectorAll('a,button')].filter(vis).map(el => text(el)).filter(Boolean).slice(0, 40);
    const fields = [...document.querySelectorAll('input,select,textarea')].filter(vis).map(el => el.getAttribute('name') || el.getAttribute('aria-label') || el.id || el.type || 'field').slice(0, 40);
    const links = [...document.querySelectorAll('a[href]')].map(a => a.getAttribute('href')).filter(Boolean);
    const linkLabels = [...document.querySelectorAll('a[href]')].filter(vis).map(a => ({ text: text(a), href: a.href })).filter(x => x.text);
    const password = [...document.querySelectorAll('input[type=password]')].some(vis);
    const main = document.querySelector('main') || document.body;
    const empty = /\b(no ([\w-]+ ){0,3}(yet|found)|nothing (here|yet)|get started|create your first|you (don't|do not) have any|is empty)\b/i.test(text(main));
    return { h1, h2, actions, fields, links, linkLabels, password, empty, title: document.title };
  });
  const route = new URL(page.url()).hash || '(no hash)';
  const shot = {};
  for (const vp of [{ name: 'desktop', width: 1280, height: 800 }, { name: 'phone', width: 390, height: 844 }]) {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    const file = `${id}-${vp.name}.png`;
    // The whole page, not just the first screen: long pages (landing pages, lists) hide most of their
    // problems below the fold. Capped at 6000px so a 20,000px list does not make a 3 MB image.
    // The top ${vp.height}px of each image is what a user sees before scrolling.
    await page.waitForTimeout(150);
    const full = await page.evaluate(() => Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight || 0)).catch(() => vp.height);
    const height = Math.min(full, MAX_SHOT_PX);
    await page.screenshot({ path: join(outDir, file), fullPage: true, clip: { x: 0, y: 0, width: vp.width, height } }).catch(() => page.screenshot({ path: join(outDir, file) }));
    shot[vp.name] = file;
    shot[`${vp.name}_page_height`] = full;
  }
  return { id, url: page.url(), route, signed_in: signedIn || usingSignIn, title: facts.title, h1: facts.h1, h2: facts.h2, actions: facts.actions, fields: facts.fields, links: facts.links, link_labels: facts.linkLabels, asks_password: facts.password, looks_empty: facts.empty, shots: shot, console_errors: errors.slice() };
}

async function signIn(page) {
  const has = await page.locator('form[data-form="login"], form').count();
  if (!has) return false;
  const select = page.locator('select[name="account"]');
  if (await select.count()) {
    const options = await select.locator('option').evaluateAll(nodes => nodes.map(n => ({ value: n.value, text: n.textContent || '' })));
    const pick = options.find(o => !/unapproved|denied|not approved/i.test(o.text)) || options[0];
    if (pick) await select.selectOption(pick.value);
  }
  const button = page.locator('form[data-form="login"] button, form button[type="submit"]').first();
  if (!(await button.count())) return false;
  await button.click();
  await page.waitForTimeout(400);
  return true;
}

function sameApp(href, base) {
  if (!href || href.startsWith('mailto:') || href.startsWith('javascript:')) return false;
  if (href.startsWith('#')) return true;
  try {
    const url = new URL(href, base);
    const origin = new URL(base);
    return url.origin === origin.origin;
  } catch { return false; }
}

let server;
let startUrl = target;
if (!remote) {
  server = await serve(root);
  const port = server.address().port;
  const rel = pagePath.startsWith(root) ? pagePath.slice(root.length).split(sep).join('/') : '/' + basename(pagePath);
  startUrl = `http://127.0.0.1:${port}${rel.startsWith('/') ? rel : '/' + rel}`;
}
// Opens the browser and, with --profile or --session, checks that the app still knows us (exit 3 if not).
const opened = await openContext({ session, profile, name: 'crawl', url: startUrl,
  launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] } });
const usingSignIn = opened.mode !== 'none';
const page = opened.page;
page.on('console', msg => { if (msg.type() === 'error') noteError(msg.text()); });
page.on('pageerror', err => noteError(err.message));

const screens = [];
const seen = new Set();
const itemLists = new Map();
const PER_LIST = 6;
try {
  await page.goto(startUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
  let settled = await settle(page);
  screens.push({ ...(await snapshot(page, 's01', false)), settled });
  // The demo sign-in is for local sample apps. Never press a form's button when we came in signed in.
  const did = usingSignIn ? false : await signIn(page);
  if (did) { settled = await settle(page); screens.push({ ...(await snapshot(page, 's02', true)), settled }); }
  const queue = [];
  // A list of items ("/chat/abc", "/chat/xyz", 40 more) is one kind of screen. Places (Settings,
  // Library) are visited first, then up to PER_LIST items of each list, so a long history does not use
  // up the crawl before it reaches Settings. samples.mjs opens more of each list.
  const itemQueue = [];
  const pushLinks = links => {
    for (const href of links || []) {
      if (!sameApp(href, page.url())) continue;
      const abs = normUrl(new URL(href, page.url()).href);
      if (seen.has(abs) || queue.includes(abs) || itemQueue.includes(abs)) continue;
      const pat = linkPattern(abs);
      if (!pat) { queue.push(abs); continue; }
      const list = itemLists.get(pat) || { pattern: pat.replace(/^https?:\/\/[^/]+/, ''), links: new Set(), crawled: 0 };
      itemLists.set(pat, list);
      if (list.links.has(abs)) continue;
      list.links.add(abs);
      if (list.crawled >= PER_LIST) continue;
      list.crawled++;
      itemQueue.push(abs);
    }
  };
  seen.add(normUrl(page.url()));
  for (const s of screens) { seen.add(normUrl(s.url)); pushLinks(s.links); }
  let n = screens.length;
  while ((queue.length || itemQueue.length) && n < 12) {
    const next = queue.length ? queue.shift() : itemQueue.shift();
    if (seen.has(next)) continue;
    seen.add(next);
    await page.goto(next, { waitUntil: 'domcontentloaded', timeout: 15000 });
    settled = await settle(page);
    n += 1;
    const id = `s${String(n).padStart(2, '0')}`;
    const shot = { ...(await snapshot(page, id, true)), settled };
    screens.push(shot);
    pushLinks(shot.links);
  }
} finally {
  await opened.close();
  if (server) server.close();
}

// Label drift: links that go to the same place under different words ("Reserve", "Book now", "Schedule").
// The home route is skipped, because a logo and a "Home" link sharing it is a normal pattern.
const byTarget = new Map();
for (const s of screens) for (const l of s.link_labels || []) {
  const t = l.href.replace(/\/$/, '');
  if (/(#\/?|\/index\.html)$/.test(t) || /^[a-z]+:\/\/[^/]+$/.test(t)) continue;
  if (!byTarget.has(t)) byTarget.set(t, new Map());
  const key = l.text.toLowerCase();
  if (!byTarget.get(t).has(key)) byTarget.get(t).set(key, { label: l.text, screens: new Set() });
  byTarget.get(t).get(key).screens.add(s.id);
}
const labelDrift = [...byTarget].filter(([, m]) => m.size > 1).map(([t, m]) => ({ target: t, labels: [...m.values()].map(v => v.label), where: Object.fromEntries([...m.values()].map(v => [v.label, [...v.screens]])) }));
const loginWall = screens.length > 0 && screens.every(s => s.asks_password || /login|sign-?in|signup|sign-?up|register|auth/i.test(s.route + s.url));
const emptyScreens = screens.filter(s => s.looks_empty).length;
const unsettled = screens.filter(s => s.settled === false).map(s => s.id);
// A screen that asks for a password after we came in signed in may mean the app signed us out mid-crawl.
const askedLater = usingSignIn ? screens.filter((s, i) => i > 0 && s.asks_password).map(s => s.id) : [];
const lists = [...itemLists.values()].map(l => ({ pattern: l.pattern, links: l.links.size, crawled: [...l.links].filter(u => seen.has(u)).length })).filter(l => l.links > l.crawled);
const report = { target, signed_in_session: usingSignIn, signed_in_with: usingSignIn ? opened.label : null, login_wall: loginWall, empty_screens: emptyScreens, unsettled, item_lists: lists, screens: screens.map(({ links, link_labels, ...rest }) => rest), label_drift: labelDrift };
writeFileSync(join(outDir, 'crawl.json'), JSON.stringify(report, null, 2));
const md = ['# Crawl', '', `| Screen | Route | Signed in | H1 | Actions | Fields | Errors |`, `| --- | --- | --- | --- | --- | --- | --- |`];
for (const s of report.screens) {
  md.push(`| ${s.id}${s.settled === false ? ' (may be mid-load)' : ''} | ${s.route} | ${s.signed_in ? 'yes' : 'no'} | ${s.h1.replace(/\|/g, '/')} | ${s.actions.length} | ${s.fields.length} | ${s.console_errors.length} |`);
}
if (loginWall) md.splice(1, 0, '', '> **Login wall:** every screen reached asks for a password. Stop and ask the owner for a way in (login.mjs), or audit only the sign-in screens and say so.');
if (emptyScreens && emptyScreens * 2 >= screens.length) md.splice(1, 0, '', `> **Mostly empty:** ${emptyScreens} of ${screens.length} screens show little or no data. Density, pill and alignment problems hide on empty screens. Ask for an account with realistic data.`);
if (askedLater.length) md.splice(1, 0, '', `> **Check the sign-in:** ${askedLater.join(', ')} ask for a password although the crawl started signed in. If that is the sign-in page, the app signed us out mid-crawl: run login.mjs again and crawl again.`);
if (usingSignIn) md.splice(1, 0, '', `Signed in with ${opened.label}.`);
if (unsettled.length) md.splice(1, 0, '', `> **Still loading:** ${unsettled.join(', ')} kept changing for 10 seconds. Their counts and empty messages may be the loading state, not the real data. Check them before citing.`);
if (labelDrift.length) {
  md.push('', '## Label drift (same destination, different words)', '', '| Goes to | Labels used | Screens |', '| --- | --- | --- |');
  for (const d of labelDrift) md.push(`| ${d.target.replace(/^https?:\/\/[^/]+/, '')} | ${d.labels.join(' / ')} | ${Object.entries(d.where).map(([l, ss]) => `${l}: ${ss.join(', ')}`).join('; ')} |`);
}
if (lists.length) md.push('', '## Item lists (only the first few of each were crawled)', '', '| Pattern | Links found | Crawled |', '| --- | --- | --- |', ...lists.map(l => `| ${l.pattern} | ${l.links} | ${l.crawled} |`), '', 'Each list is one kind of screen. `samples.mjs` opens more of them, read-only, and checks what they hold.');
writeFileSync(join(outDir, 'crawl.md'), md.join('\n') + '\n');
if (wantJson) console.log(JSON.stringify(report));
else console.log(`crawl: ${report.screens.length} screens in ${outDir}${usingSignIn ? ` (signed in with ${opened.label})` : ''}${loginWall ? ' · LOGIN WALL: every screen asks for a password' : ''}${emptyScreens ? ` · ${emptyScreens} empty screen(s)` : ''}${labelDrift.length ? ` · label drift on ${labelDrift.length} destination(s), see crawl.md` : ''}`);
