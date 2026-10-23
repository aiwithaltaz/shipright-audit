#!/usr/bin/env node
// Visit every reachable screen of a local app or URL.
// Usage: node <skill>/scripts/crawl.mjs <index.html|url> [--out dir] [--json]
// <skill> is the folder that holds SKILL.md.
// Saves shots at 390 and 1280, the H1, actions, fields, and console errors.
// Signs in with a demo account when a login form is offered. Skips accounts that say unapproved or denied.
// Needs Node 18+ and Playwright with Chromium.
// If Playwright is missing: prints one install command and exits 2.
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { mkdirSync, writeFileSync, existsSync, readFileSync, statSync } from 'node:fs';
import { resolve, join, dirname, extname, sep, basename } from 'node:path';

const require = createRequire(import.meta.url);
function loadPlaywright() {
  const tries = ['playwright', 'playwright-core', '/opt/node22/lib/node_modules/playwright'];
  for (const name of tries) { try { return require(name); } catch {} }
  console.error('crawl: Playwright not found. Install it with: npm i -D playwright && npx playwright install chromium');
  process.exit(2);
}

const args = process.argv.slice(2);
const target = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--out');
if (!target) {
  console.error('usage: node <skill>/scripts/crawl.mjs <index.html|url> [--out dir] [--json]');
  process.exit(2);
}
const flag = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const wantJson = args.includes('--json');
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

async function snapshot(page, id, signedIn) {
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
    return { h1, h2, actions, fields, links, title: document.title };
  });
  const route = new URL(page.url()).hash || '(no hash)';
  const shot = {};
  for (const vp of [{ name: 'desktop', width: 1280, height: 800 }, { name: 'phone', width: 390, height: 844 }]) {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    const file = `${id}-${vp.name}.png`;
    await page.screenshot({ path: join(outDir, file), fullPage: false });
    shot[vp.name] = file;
  }
  return { id, url: page.url(), route, signed_in: signedIn, title: facts.title, h1: facts.h1, h2: facts.h2, actions: facts.actions, fields: facts.fields, links: facts.links, shots: shot, console_errors: errors.slice() };
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

const { chromium } = loadPlaywright();
const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage();
page.on('console', msg => { if (msg.type() === 'error') noteError(msg.text()); });
page.on('pageerror', err => noteError(err.message));

let server;
let startUrl = target;
if (!remote) {
  server = await serve(root);
  const port = server.address().port;
  const rel = pagePath.startsWith(root) ? pagePath.slice(root.length).split(sep).join('/') : '/' + basename(pagePath);
  startUrl = `http://127.0.0.1:${port}${rel.startsWith('/') ? rel : '/' + rel}`;
}

const screens = [];
const seen = new Set();
try {
  await page.goto(startUrl, { waitUntil: 'networkidle', timeout: 20000 });
  await page.waitForTimeout(300);
  screens.push(await snapshot(page, 's01', false));
  const did = await signIn(page);
  if (did) screens.push(await snapshot(page, 's02', true));
  const queue = [];
  const pushLinks = links => {
    for (const href of links || []) {
      if (!sameApp(href, page.url())) continue;
      const abs = new URL(href, page.url()).href;
      if (!seen.has(abs)) queue.push(abs);
    }
  };
  seen.add(page.url());
  for (const s of screens) { seen.add(s.url); pushLinks(s.links); }
  let n = screens.length;
  while (queue.length && n < 12) {
    const next = queue.shift();
    if (seen.has(next)) continue;
    seen.add(next);
    await page.goto(next, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(250);
    n += 1;
    const id = `s${String(n).padStart(2, '0')}`;
    const shot = await snapshot(page, id, true);
    screens.push(shot);
    pushLinks(shot.links);
  }
} finally {
  await browser.close();
  if (server) server.close();
}

const report = { target, screens: screens.map(({ links, ...rest }) => rest) };
writeFileSync(join(outDir, 'crawl.json'), JSON.stringify(report, null, 2));
const md = ['# Crawl', '', `| Screen | Route | Signed in | H1 | Actions | Fields | Errors |`, `| --- | --- | --- | --- | --- | --- | --- |`];
for (const s of report.screens) {
  md.push(`| ${s.id} | ${s.route} | ${s.signed_in ? 'yes' : 'no'} | ${s.h1.replace(/\|/g, '/')} | ${s.actions.length} | ${s.fields.length} | ${s.console_errors.length} |`);
}
writeFileSync(join(outDir, 'crawl.md'), md.join('\n') + '\n');
if (wantJson) console.log(JSON.stringify(report));
else console.log(`crawl: ${report.screens.length} screens in ${outDir}`);
