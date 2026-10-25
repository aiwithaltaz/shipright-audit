#!/usr/bin/env node
// Walk one core task like a first-time user: click, type and pick by visible words, screenshot every step.
// Usage: node <skill>/scripts/walk.mjs <index.html|url> <plan.json> [--out dir] [--session session.json]
// --session: a signed-in session saved by login.mjs.
// The walk runs twice, at 1280 and at 390 wide, so phone-only breaks show up.
// Plan file (write one per task):
// {
//   "task": "Book a groom for a large dog",
//   "steps": [
//     { "do": "goto",   "to": "#/book" },                       // a route, path or full URL
//     { "do": "click",  "text": "Large dog" },                  // button, link, label or any visible text
//     { "do": "fill",   "field": "Dog's name", "value": "Rex" },// by label, then placeholder, then name
//     { "do": "select", "field": "Account", "option": "Front desk" },
//     { "do": "press",  "key": "Enter" },
//     { "do": "expect", "text": "Step 2 of 4" },                // checks the words are visible; never stops the walk
//     { "do": "note",   "text": "Had to remember the price from Services" }
//   ]
// }
// A failed click, fill, select or goto stops that width's walk and records "broke at step N".
// Writes <out>/<width>-NN.png per step, walk.json (full log) and walk.md (summary table).
// Needs Node 18+ and Playwright with Chromium. Exit 0 walk finished at both widths, 1 a width broke, 2 usage.
import { createRequire } from 'node:module';
import { launch } from './browser.mjs';
import { createServer } from 'node:http';
import { mkdirSync, writeFileSync, existsSync, readFileSync, statSync } from 'node:fs';
import { resolve, join, dirname, extname, sep, basename } from 'node:path';

const require = createRequire(import.meta.url);
function loadPlaywright() {
  for (const name of ['playwright', 'playwright-core']) { try { return require(name); } catch {} }
  try { return createRequire(join(process.cwd(), 'package.json'))('playwright'); } catch {}
  console.error('walk: Playwright not found. Install it with: npm i -D playwright && npx playwright install chromium');
  process.exit(2);
}

const args = process.argv.slice(2);
const pos = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--out' && args[i - 1] !== '--session');
const [target, planPath] = pos;
if (!target || !planPath || !existsSync(planPath)) {
  console.error('usage: node <skill>/scripts/walk.mjs <index.html|url> <plan.json> [--out dir] [--session session.json]');
  process.exit(2);
}
let plan;
try { plan = JSON.parse(readFileSync(planPath, 'utf8')); } catch (e) { console.error(`walk: ${planPath} is not valid JSON: ${e.message}`); process.exit(2); }
if (!Array.isArray(plan.steps) || !plan.steps.length) { console.error('walk: the plan needs a "steps" list'); process.exit(2); }
const KNOWN = ['goto', 'click', 'fill', 'select', 'press', 'expect', 'note'];
const unknown = plan.steps.map((s, i) => [i + 1, s.do]).filter(([, d]) => !KNOWN.includes(d));
if (unknown.length) { console.error(`walk: unknown step type(s): ${unknown.map(([n, d]) => `step ${n} "${d}"`).join(', ')}. Use ${KNOWN.join(', ')}.`); process.exit(2); }

const si = args.indexOf('--session');
const session = si >= 0 ? args[si + 1] : null;
if (session && !existsSync(session)) { console.error(`walk: session file ${session} not found. Run login.mjs first.`); process.exit(2); }
const oi = args.indexOf('--out');
const slug = String(plan.task || basename(planPath, '.json')).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'task';
const outDir = resolve(oi >= 0 ? args[oi + 1] : join('docs', 'shipright', 'audit', 'walks', slug));
mkdirSync(outDir, { recursive: true });

const remote = /^https?:/.test(target);
const given = remote ? null : resolve(target);
if (!remote && !existsSync(given)) { console.error(`walk: ${target} not found`); process.exit(2); }
const pagePath = remote ? null : (statSync(given).isDirectory() ? join(given, 'index.html') : given);
const root = remote ? null : dirname(pagePath);
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2' };
// Serve local files over http, because many apps load ES modules that file:// blocks.
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

// Find a control the way a person would: by the words they see.
async function findClickable(page, text) {
  const tries = [
    () => page.getByRole('button', { name: text }),
    () => page.getByRole('link', { name: text }),
    () => page.getByLabel(text),
    () => page.getByRole('tab', { name: text }),
    () => page.getByText(text, { exact: false })
  ];
  for (const t of tries) {
    const loc = t();
    const n = await loc.count();
    for (let i = 0; i < n; i++) { const one = loc.nth(i); if (await one.isVisible()) return one; }
  }
  return null;
}
async function findField(page, field) {
  const tries = [() => page.getByLabel(field), () => page.getByPlaceholder(field), () => page.locator(`[name="${field.replace(/"/g, '\\"')}"]`), () => page.getByRole('textbox', { name: field })];
  for (const t of tries) {
    const loc = t();
    const n = await loc.count();
    for (let i = 0; i < n; i++) { const one = loc.nth(i); if (await one.isVisible()) return one; }
  }
  return null;
}

async function walkAt(browser, startUrl, width) {
  const context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 800 }, ...(session ? { storageState: session } : {}) });
  const page = await context.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); });
  page.on('pageerror', e => errors.push(e.message.slice(0, 300)));
  await page.goto(startUrl, { waitUntil: 'networkidle', timeout: 20000 });
  await page.waitForTimeout(250);
  const log = [];
  let actions = 0, brokeAt = null;
  const shot = async n => { const file = `${width}-${String(n).padStart(2, '0')}.png`; await page.screenshot({ path: join(outDir, file) }); return file; };
  log.push({ n: 0, do: 'start', ok: true, url: page.url(), h1: await h1(page), shot: await shot(0) });
  for (let i = 0; i < plan.steps.length; i++) {
    const s = plan.steps[i], n = i + 1;
    const entry = { n, do: s.do, target: s.text || s.field || s.to || s.key || '', ok: true };
    try {
      if (s.do === 'goto') {
        const url = /^https?:/.test(s.to) ? s.to : new URL(s.to, startUrl).href;
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 }); actions++;
      } else if (s.do === 'click') {
        const el = await findClickable(page, s.text);
        if (!el) throw new Error(`nothing visible says "${s.text}"`);
        await el.click({ timeout: 5000 }); actions++;
      } else if (s.do === 'fill') {
        const el = await findField(page, s.field);
        if (!el) throw new Error(`no visible field labeled "${s.field}"`);
        await el.fill(String(s.value ?? ''), { timeout: 5000 }); actions++;
      } else if (s.do === 'select') {
        const el = await findField(page, s.field);
        if (!el) throw new Error(`no visible field labeled "${s.field}"`);
        await el.selectOption({ label: s.option }, { timeout: 5000 }); actions++;
      } else if (s.do === 'press') {
        await page.keyboard.press(s.key); actions++;
      } else if (s.do === 'expect') {
        entry.ok = await page.getByText(s.text, { exact: false }).first().isVisible().catch(() => false);
        if (!entry.ok) entry.error = `expected to see "${s.text}"`;
      } else if (s.do === 'note') {
        entry.note = s.text;
      }
    } catch (e) {
      entry.ok = false; entry.error = String(e.message || e).split('\n')[0].slice(0, 200);
    }
    await page.waitForTimeout(200);
    entry.url = page.url(); entry.h1 = await h1(page);
    if (s.do !== 'note') entry.shot = await shot(n);
    log.push(entry);
    if (!entry.ok && s.do !== 'expect') { brokeAt = n; break; }
  }
  await context.close();
  return { width, actions, broke_at: brokeAt, finished: brokeAt === null, steps: log, console_errors: [...new Set(errors)] };
}
const h1 = page => page.locator('h1').first().innerText({ timeout: 1000 }).then(t => t.replace(/\s+/g, ' ').trim().slice(0, 120)).catch(() => '');

const { chromium } = loadPlaywright();
const browser = await launch(chromium, {}, 'walk');
let server, startUrl = target;
if (!remote) {
  server = await serve(root);
  const rel = pagePath.startsWith(root) ? pagePath.slice(root.length).split(sep).join('/') : '/' + basename(pagePath);
  startUrl = `http://127.0.0.1:${server.address().port}${rel.startsWith('/') ? rel : '/' + rel}`;
}
let runs;
try { runs = [await walkAt(browser, startUrl, 1280), await walkAt(browser, startUrl, 390)]; }
finally { await browser.close(); if (server) server.close(); }

const report = { task: plan.task || slug, target, widths: Object.fromEntries(runs.map(r => [r.width, r])) };
writeFileSync(join(outDir, 'walk.json'), JSON.stringify(report, null, 2) + '\n');
const [d, p] = runs;
const cell = (r, n) => { const e = r.steps.find(x => x.n === n); if (!e) return 'not reached'; return `${e.ok ? 'ok' : 'FAIL: ' + e.error}${e.shot ? ` (${e.shot})` : ''}`; };
const md = [`# Walk: ${report.task}`, '', `Desktop: ${d.finished ? 'finished' : `broke at step ${d.broke_at}`}, ${d.actions} actions · Phone: ${p.finished ? 'finished' : `broke at step ${p.broke_at}`}, ${p.actions} actions`, '',
  '| Step | Action | 1280 | 390 |', '| --- | --- | --- | --- |',
  ...plan.steps.map((s, i) => `| ${i + 1} | ${s.do} ${(s.text || s.field || s.to || s.key || '').replace(/\|/g, '/')} | ${cell(d, i + 1)} | ${cell(p, i + 1)} |`)];
const notes = plan.steps.filter(s => s.do === 'note').map(s => `- ${s.text}`);
if (notes.length) md.push('', '## Notes', '', ...notes);
const errs = [...new Set([...d.console_errors, ...p.console_errors])];
if (errs.length) md.push('', '## Console errors', '', ...errs.map(e => `- ${e}`));
writeFileSync(join(outDir, 'walk.md'), md.join('\n') + '\n');
console.log(`walk: "${report.task}" · 1280 ${d.finished ? 'finished' : 'broke at step ' + d.broke_at} (${d.actions} actions) · 390 ${p.finished ? 'finished' : 'broke at step ' + p.broke_at} (${p.actions} actions) · ${outDir}`);
process.exit(d.finished && p.finished ? 0 : 1);
