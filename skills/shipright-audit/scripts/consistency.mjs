#!/usr/bin/env node
// Scan a rendered page for inconsistent controls and off-scale spacing.
// Usage: node <skill>/scripts/consistency.mjs <page.html|url> [--labels file.json]
// Labels file: { "remove": ["Remove"], "save": ["Save"] }. A data-action value must use one of those words.
// Flags: same visible label with two background colors, off-scale margin or gap inside [data-measure],
// badge colors that are not a hex token from --tokens, and label-table misses.
// Exit 0 pass, 1 fail, 2 usage or missing Playwright.
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { resolve, join, dirname, extname, sep } from 'node:path';

const require = createRequire(import.meta.url);
function loadPlaywright() {
  const tries = ['playwright', 'playwright-core'];
  for (const name of tries) { try { return require(name); } catch {} }
  try { return createRequire(join(process.cwd(), 'package.json'))('playwright'); } catch {}
  console.error('consistency: Playwright not found. Install it with: npm i -D playwright && npx playwright install chromium');
  process.exit(2);
}
const args = process.argv.slice(2);
const target = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--labels' && args[i - 1] !== '--tokens');
if (!target) {
  console.error('usage: node <skill>/scripts/consistency.mjs <page.html|url> [--labels file.json] [--tokens tokens.css]');
  process.exit(2);
}
const flag = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const labels = flag('--labels') && existsSync(flag('--labels')) ? JSON.parse(readFileSync(flag('--labels'), 'utf8')) : {};
const tokenHex = new Set();
if (flag('--tokens') && existsSync(flag('--tokens'))) {
  for (const match of readFileSync(flag('--tokens'), 'utf8').matchAll(/#([0-9a-f]{6})\b/gi)) tokenHex.add(match[1].toLowerCase());
}
const SCALE = new Set([0, 4, 8, 16, 24, 32, 40, 48, 64]);
const remote = /^https?:/.test(target);
const pagePath = remote ? null : resolve(target);
const root = remote ? null : dirname(pagePath);

function serve(dir) {
  return new Promise(ok => {
    const server = createServer((req, res) => {
      // req.url is a path. A leading "//" is still a path, not a protocol-relative URL.
      const pathname = decodeURIComponent((req.url || '/').split('?')[0]).replace(/\/+/g, '/');
      const file = resolve(dir, '.' + pathname);
      if (!(file + sep).startsWith(dir + sep) || !existsSync(file) || !statSync(file).isFile()) {
        res.writeHead(404); return res.end();
      }
      const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript' };
      res.writeHead(200, { 'content-type': types[extname(file)] || 'application/octet-stream' });
      res.end(readFileSync(file));
    }).listen(0, '127.0.0.1', () => ok(server));
  });
}

const { chromium } = loadPlaywright();
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
let server;
try {
  let url = target;
  if (!remote) {
    server = await serve(root);
    const rel = pagePath.slice(root.length).split(sep).join('/').replace(/^\/+/, '');
    url = `http://127.0.0.1:${server.address().port}/${rel}`;
  }
  const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
  if (!response || response.status() >= 400) {
    console.error('consistency: fail');
    console.error(`page did not load (${response ? response.status() : 'no response'}): ${url}`);
    process.exit(1);
  }
  const facts = await page.evaluate(scale => {
    const rgb = value => {
      const m = value.match(/rgba?\(([^)]+)\)/);
      if (!m) return value;
      const parts = m[1].split(',').map(x => x.trim());
      const hex = parts.slice(0, 3).map(n => Number(n).toString(16).padStart(2, '0')).join('');
      return hex;
    };
    const buttons = [...document.querySelectorAll('button, [data-button]')].filter(el => el.offsetParent !== null).map(el => ({
      text: (el.innerText || '').replace(/\s+/g, ' ').trim(),
      bg: rgb(getComputedStyle(el).backgroundColor),
      action: el.getAttribute('data-action') || '',
    }));
    const badges = [...document.querySelectorAll('[data-badge]')].map(el => ({
      text: (el.innerText || '').replace(/\s+/g, ' ').trim(),
      bg: rgb(getComputedStyle(el).backgroundColor),
    }));
    const spaces = [];
    const rootEl = document.querySelector('[data-measure]') || document.body;
    rootEl.querySelectorAll('*').forEach(el => {
      const s = getComputedStyle(el);
      for (const prop of ['marginTop', 'marginBottom', 'rowGap', 'columnGap']) {
        const raw = s[prop];
        if (!raw || raw === 'normal') continue;
        for (const part of raw.split(' ')) {
          if (!part.endsWith('px')) continue;
          const n = Math.round(parseFloat(part));
          if (n !== 0 && !scale.includes(n)) spaces.push(`${prop} ${n}px`);
        }
      }
    });
    return { buttons, badges, spaces: [...new Set(spaces)].slice(0, 20) };
  }, [...SCALE]);
  const fails = [];
  const byText = new Map();
  for (const button of facts.buttons) {
    if (!button.text) continue;
    const set = byText.get(button.text) || new Set();
    set.add(button.bg);
    byText.set(button.text, set);
  }
  for (const [text, colors] of byText) {
    if (colors.size > 1) fails.push(`label "${text}" uses ${colors.size} backgrounds`);
  }
  for (const button of facts.buttons) {
    if (!button.action || !labels[button.action]) continue;
    const allowed = labels[button.action];
    if (!allowed.includes(button.text)) fails.push(`action ${button.action} says "${button.text}", expected ${allowed.join(' or ')}`);
  }
  if (tokenHex.size) {
    for (const badge of facts.badges) {
      if (!tokenHex.has(badge.bg)) fails.push(`badge "${badge.text}" color #${badge.bg} is not a token`);
    }
  }
  for (const space of facts.spaces) fails.push(`off-scale spacing ${space}`);
  if (fails.length) {
    console.error('consistency: fail');
    for (const line of fails) console.error(line);
    process.exit(1);
  }
  console.log('consistency: pass');
} finally {
  await browser.close();
  if (server) server.close();
}
