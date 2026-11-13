#!/usr/bin/env node
// Walk one core task like a first-time user: click, type and pick by visible words, screenshot every step.
// Usage: node <skill>/scripts/walk.mjs <index.html|url> <plan.json> [--out dir] [--profile dir] [--session session.json]
// --profile: the sign-in window's browser profile (login.mjs prints its path). Tried first.
// --session: a signed-in session file saved by login.mjs. The fallback.
// With either, it stops with exit 3 if the app no longer knows us.
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
// Live apps (http/https): the walk will not click risky words (publish, send, delete, generate, save...)
// and will not type into fields other than search boxes, unless that step has "owner_said_yes": true.
// A step it refuses is logged as "held back" and the walk stops there without counting it as a break.
// Using the app like a real user (only after the owner said yes): mark each such step
// "owner_said_yes": true, for example typing a short test message and pressing Send.
//   - Those steps run once, at 1280. The 390 walk stops there, so the app gets one test message, not two.
//   - After an owner-approved click or key press it waits for the result to settle (a streaming answer
//     included), then checks the result at 1280 and at 390: media that never loaded, clipped text, and
//     action buttons with no name. Each problem is a lead (W-...) to decide in the pain map's Script leads.
//   - walk.json and walk.md list every owner-approved action under "used_actions": copy them into
//     Left behind and count them in the header's "Used as a user: yes (N actions)".
// Writes <out>/<width>-NN.png per step, walk.json (full log) and walk.md (summary table).
// Needs Node 18+ and Playwright with Chromium. Exit 0 walk finished at both widths, 1 a width broke, 2 usage.
import { createRequire } from 'node:module';
import { openContext, signInFlags, settle, normUrl, analyzeScript, mergeLeads, DANGER } from './browser.mjs';
import { createServer } from 'node:http';
import { mkdirSync, writeFileSync, existsSync, readFileSync, statSync } from 'node:fs';
import { resolve, join, dirname, extname, sep, basename } from 'node:path';

const require = createRequire(import.meta.url);

const args = process.argv.slice(2);
const pos = args.filter((a, i) => !a.startsWith('--') && !['--out', '--session', '--profile'].includes(args[i - 1]));
const [target, planPath] = pos;
if (!target || !planPath || !existsSync(planPath)) {
  console.error('usage: node <skill>/scripts/walk.mjs <index.html|url> <plan.json> [--out dir] [--profile dir] [--session session.json]');
  process.exit(2);
}
let plan;
try { plan = JSON.parse(readFileSync(planPath, 'utf8')); } catch (e) { console.error(`walk: ${planPath} is not valid JSON: ${e.message}`); process.exit(2); }
if (!Array.isArray(plan.steps) || !plan.steps.length) { console.error('walk: the plan needs a "steps" list'); process.exit(2); }
const KNOWN = ['goto', 'click', 'fill', 'select', 'press', 'expect', 'note'];
const unknown = plan.steps.map((s, i) => [i + 1, s.do]).filter(([, d]) => !KNOWN.includes(d));
if (unknown.length) { console.error(`walk: unknown step type(s): ${unknown.map(([n, d]) => `step ${n} "${d}"`).join(', ')}. Use ${KNOWN.join(', ')}.`); process.exit(2); }

const { session, profile } = signInFlags(args, 'walk');
const oi = args.indexOf('--out');
const slug = String(plan.task || basename(planPath, '.json')).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'task';
const outDir = resolve(oi >= 0 ? args[oi + 1] : join('docs', 'shipright', 'audits', 'current', 'walks', slug));
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

// One page per width. A sign-in profile is one browser context, so both widths share it there (and the
// app's own state carries over, as it would for a real user). With a session file each width gets its own
// context that starts from the newest sign-in state (the app may have swapped its token during the last
// width). With no sign-in each width starts fresh.
let carried = null;
const WIDTHS = [1280, 390];
const usedActions = [], resultFindings = [];
const local = u => u.replace(/^https?:\/\/127\.0\.0\.1:\d+/, '');
// Wait for a result to finish: the page stops changing, twice in a row with a pause between (a streamed
// answer can pause while a tool runs), and no "Stop" button is left on screen.
async function settleResult(page) {
  const start = Date.now();
  await settle(page, { timeout: 60000 });
  while (Date.now() - start < 90000) {
    await page.waitForTimeout(1500);
    const busy = await page.evaluate(() => [...document.querySelectorAll('button, [role=button]')].some(b => { const r = b.getBoundingClientRect(); return r.width > 0 && r.height > 0 && /^stop( generating| responding| response)?$/i.test((b.innerText || b.getAttribute('aria-label') || '').trim()); })).catch(() => false);
    const calm = await settle(page, { timeout: 15000 });
    if (!busy && calm) return true;
  }
  return false;
}
// The checks from "open existing results", on the result an owner-approved action just produced.
async function checkResult(page, n, width) {
  for (const w of [width, ...WIDTHS.filter(x => x !== width)]) {
    if (w !== width) { await page.setViewportSize({ width: w, height: w === 390 ? 844 : 800 }); await settle(page, { timeout: 4000 }); }
    const file = `${w}-${String(n).padStart(2, '0')}-result.png`;
    await page.screenshot({ path: join(outDir, file), fullPage: true }).catch(() => null);
    const a = await page.evaluate(analyzeScript({ results: true, only: ['media-not-loaded', 'clipped-text', 'unnamed-action'] })).catch(() => ({ findings: [] }));
    for (const f of a.findings) {
      const shot = `${w}-${String(n).padStart(2, '0')}-result-${f.kind}-${resultFindings.length + 1}.png`;
      if (f.mark) await page.locator(`[data-srv="${f.mark}"]`).first().screenshot({ path: join(outDir, shot), timeout: 5000 }).catch(() => null);
      resultFindings.push({ id: `W${resultFindings.length + 1}`, page: page.url(), width: w, kind: f.kind, what: `After step ${n}: ${f.what}`, group: `${n}|${f.group || f.what}`, detail: f.detail, shot: existsSync(join(outDir, shot)) ? shot : file });
    }
  }
  await page.setViewportSize({ width, height: width === 390 ? 844 : 800 });
}
async function walkAt(opened, startUrl, width) {
  const viewport = { width, height: width === 390 ? 844 : 800 };
  const own = opened.mode === 'profile' ? null : await opened.browser.newContext({ viewport, ...(opened.mode === 'session' ? { storageState: carried || await opened.context.storageState() } : {}) });
  const page = await (own || opened.context).newPage();
  await page.setViewportSize(viewport);
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); });
  page.on('pageerror', e => errors.push(e.message.slice(0, 300)));
  await page.goto(startUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await settle(page);
  const log = [];
  let actions = 0, brokeAt = null, heldAt = null, onceAt = null;
  const shot = async n => { const file = `${width}-${String(n).padStart(2, '0')}.png`; await page.screenshot({ path: join(outDir, file) }); return file; };
  log.push({ n: 0, do: 'start', ok: true, url: page.url(), h1: await h1(page), shot: await shot(0) });
  for (let i = 0; i < plan.steps.length; i++) {
    const s = plan.steps[i], n = i + 1;
    const entry = { n, do: s.do, target: s.text || s.field || s.to || s.key || '', ok: true };
    const held = remote && !s.owner_said_yes && (
      (s.do === 'click' && DANGER.test(s.text || '')) ||
      ((s.do === 'fill' || s.do === 'select') && !/search|find|filter/i.test(s.field || '')));
    if (held) {
      entry.ok = false; entry.held = true;
      entry.error = s.do === 'click' ? `held back: "${s.text}" could change the live app. Needs the owner's yes.` : `held back: typing into "${s.field}" in a live app may autosave. Needs the owner's yes.`;
      log.push(entry); heldAt = n; break;
    }
    // Owner-approved actions run once, at the first width. Later widths stop here.
    if (s.owner_said_yes && width !== WIDTHS[0]) {
      entry.once = true; entry.note = `not repeated at ${width}: owner-approved actions run once, at ${WIDTHS[0]}. The result was checked at both widths there.`;
      log.push(entry); onceAt = n; break;
    }
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
    if (s.do !== 'note') await settle(page, { timeout: 6000 });
    if (s.owner_said_yes && entry.ok && ['click', 'fill', 'select', 'press'].includes(s.do)) {
      usedActions.push({ step: n, do: s.do, target: entry.target, ...(s.value !== undefined ? { value: String(s.value) } : {}), ...(s.option !== undefined ? { value: String(s.option) } : {}) });
      // A click or a key press is what sends: wait for the result, then check it at both widths.
      if (s.do === 'click' || s.do === 'press') { entry.result_settled = await settleResult(page); await checkResult(page, n, width); }
    }
    entry.url = page.url(); entry.h1 = await h1(page);
    if (s.do !== 'note') entry.shot = await shot(n);
    log.push(entry);
    if (!entry.ok && s.do !== 'expect') { brokeAt = n; break; }
  }
  if (own && opened.mode === 'session') carried = await own.storageState().catch(() => carried);
  if (own) await own.close(); else await page.close().catch(() => {});
  return { width, actions, broke_at: brokeAt, held_at: heldAt, once_at: onceAt, finished: brokeAt === null && heldAt === null && onceAt === null, steps: log, console_errors: [...new Set(errors)] };
}
const h1 = page => page.locator('h1').first().innerText({ timeout: 1000 }).then(t => t.replace(/\s+/g, ' ').trim().slice(0, 120)).catch(() => '');

let server, startUrl = target;
if (!remote) {
  server = await serve(root);
  const rel = pagePath.startsWith(root) ? pagePath.slice(root.length).split(sep).join('/') : '/' + basename(pagePath);
  startUrl = `http://127.0.0.1:${server.address().port}${rel.startsWith('/') ? rel : '/' + rel}`;
}
const opened = await openContext({ session, profile, name: 'walk', url: startUrl });
let runs;
try { runs = [await walkAt(opened, startUrl, 1280), await walkAt(opened, startUrl, 390)]; }
finally { await opened.close(); if (server) server.close(); }

const leads = mergeLeads(resultFindings, WIDTHS, local);
leads.forEach((l, i) => { l.id = `W-${slug.slice(0, 20)}-${i + 1}`; });
const report = { task: plan.task || slug, target, signed_in_with: opened.mode !== 'none' ? opened.label : null, used_actions: usedActions, leads, widths: Object.fromEntries(runs.map(r => [r.width, r])) };
writeFileSync(join(outDir, 'walk.json'), JSON.stringify(report, null, 2) + '\n');
const [d, p] = runs;
const state = r => r.broke_at ? `broke at step ${r.broke_at}` : r.held_at ? `held back at step ${r.held_at} (needs the owner's yes)` : r.once_at ? `stopped at step ${r.once_at} (owner-approved actions run once, at ${WIDTHS[0]})` : 'finished';
const cell = (r, n) => { const e = r.steps.find(x => x.n === n); if (!e) return 'not reached'; if (e.once) return 'not repeated (done once at 1280)'; return `${e.ok ? 'ok' : (e.held ? 'HELD: ' : 'FAIL: ') + e.error}${e.shot ? ` (${e.shot})` : ''}`; };
const md = [`# Walk: ${report.task}`, '', `Desktop: ${state(d)}, ${d.actions} actions · Phone: ${state(p)}, ${p.actions} actions`, '',
  '| Step | Action | 1280 | 390 |', '| --- | --- | --- | --- |',
  ...plan.steps.map((s, i) => `| ${i + 1} | ${s.do} ${(s.text || s.field || s.to || s.key || '').replace(/\|/g, '/')} | ${cell(d, i + 1)} | ${cell(p, i + 1)} |`)];
if (usedActions.length) md.push('', '## Used as a user (the owner said yes)', '', `${usedActions.length} action(s). List each one in Left behind and count them in the header's "Used as a user: yes (N actions)".`, '', ...usedActions.map(a => `- Step ${a.step}: ${a.do} "${a.target}"${a.value !== undefined ? `, value "${a.value}"` : ''}`));
if (usedActions.length) md.push('', '## Result checks (decide each lead in Script leads)', '', '| Lead | Check | What it found | Widths | Screenshot |', '| --- | --- | --- | --- | --- |', ...(leads.length ? leads.map(l => `| ${l.id} | ${l.kind} | ${l.what.replace(/\|/g, '/')} | ${l.widths.join(', ')} | ${l.shot || 'none'} |`) : ['| none | | The result loaded its media, no text was cut off and every action had a name | | |']), '', 'Open the `*-result.png` screenshots too: the checks cannot judge whether the result is right.');
const notes = plan.steps.filter(s => s.do === 'note').map(s => `- ${s.text}`);
if (notes.length) md.push('', '## Notes', '', ...notes);
const errs = [...new Set([...d.console_errors, ...p.console_errors])];
if (errs.length) md.push('', '## Console errors', '', ...errs.map(e => `- ${e}`));
writeFileSync(join(outDir, 'walk.md'), md.join('\n') + '\n');
console.log(`walk: "${report.task}" · 1280 ${state(d)} (${d.actions} actions) · 390 ${state(p)} (${p.actions} actions)${usedActions.length ? ` · used as a user: ${usedActions.length} action(s), ${leads.length} result lead(s)` : ''} · ${outDir}`);
process.exit(d.broke_at || p.broke_at ? 1 : 0);
