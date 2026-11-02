#!/usr/bin/env node
// Open every safe control on each page, the way a curious first-time user would, and record what happens.
// Audits miss what they never open: a dialog behind an icon, a button that does nothing, a feature that
// throws an error the moment you touch it. This finds them.
// Usage: node <skill>/scripts/explore.mjs <index.html|url> [--crawl crawl.json] [--routes "#/,/settings"]
//        [--session session.json] [--out dir] [--max 40] [--allow "Bookmark,Handoff"]
// For each control it records: its name, whether it is icon-only, the tooltip shown on hover, what opened
// (a dialog, menu, panel, new page, file picker, a change on the page, or nothing), console and network
// errors caused by the click, and a screenshot when something opened. Then it puts the page back.
// Safety on live apps (http/https): it only clicks controls that open something (menus, tabs, pop-ups) or
// whose name says so (open, menu, more, settings, filter, model, attach, add, new, create, search...),
// never risky words (delete, send, publish, generate, save, pay, like, pin, regenerate... see DANGER in
// browser.mjs) and never form submit buttons. Everything else is listed as "not clicked" for you to judge.
// --allow names extra controls the owner said yes to. Icon-only controls are always hovered, never
// clicked unless they have a safe name. File pickers and browser dialogs are cancelled.
// Writes explore.json, explore.md and E##-*.png to --out. Exit 0 ran, 2 usage or missing Playwright.
import { launch, loadPlaywright, settle, normUrl, DANGER } from './browser.mjs';
import { createServer } from 'node:http';
import { mkdirSync, writeFileSync, existsSync, readFileSync, statSync } from 'node:fs';
import { resolve, join, dirname, extname, sep } from 'node:path';

const args = process.argv.slice(2);
const valueFlags = ['--routes', '--crawl', '--session', '--out', '--max', '--allow'];
const target = args.find((a, i) => !a.startsWith('--') && !valueFlags.includes(args[i - 1]));
const flag = n => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
if (!target) { console.error('usage: node <skill>/scripts/explore.mjs <index.html|url> [--crawl crawl.json] [--routes ...] [--session file] [--out dir] [--max 40] [--allow "Label,Label"]'); process.exit(2); }
const outDir = resolve(flag('--out') || join('docs', 'shipright', 'audits', 'current', 'explore'));
mkdirSync(outDir, { recursive: true });
const session = flag('--session');
if (session && !existsSync(session)) { console.error(`explore: session file ${session} not found. Run login.mjs first.`); process.exit(2); }
const MAX = Number(flag('--max') || 40);
const allow = (flag('--allow') || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
const OPENER = /\b(open|menu|more|options|settings|preferences|filter|sort|view|show|details|info|help|select|choose|picker|model|attach|tools|add|new|create|expand|collapse|sidebar|panel|search|budget|usage|context|account|profile|switch|tab|history|notifications?|microphone|voice|dictat\w*|speech|help)\b/i;

const remote = /^https?:/.test(target);
const given = remote ? null : resolve(target);
if (!remote && !existsSync(given)) { console.error(`explore: ${target} not found`); process.exit(2); }
const pagePath = remote ? null : (statSync(given).isDirectory() ? join(given, 'index.html') : given);
const root = remote ? null : dirname(pagePath);
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2' };
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

// What is open right now: dialogs, menus, pop-overs, the URL and how much text the page shows.
const STATE = () => {
  const vis = el => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 20 && r.height > 20 && s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) > 0.05; };
  const open = [...document.querySelectorAll('[role=dialog], [role=alertdialog], [aria-modal=true], dialog[open], [role=menu], [role=listbox], [role=tooltip], [popover], [data-state=open]')]
    .filter(vis).map(el => (el.getAttribute('role') || el.tagName.toLowerCase()) + ':' + (el.getAttribute('aria-label') || (el.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 40)));
  return { url: location.href, open, text: (document.body?.innerText || '').length };
};

const { chromium } = loadPlaywright('explore');
const browser = await launch(chromium, {}, 'explore');
const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, ...(session ? { storageState: session } : {}) });
const page = await context.newPage();
let errs = [];
page.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 200)); });
page.on('pageerror', e => errs.push(e.message.slice(0, 200)));
page.on('response', r => { if (r.status() >= 400 && !/favicon/.test(r.url())) errs.push(`${r.status()} ${r.request().method()} ${r.url().replace(/^https?:\/\/[^/]+/, '').slice(0, 120)}`); });
page.on('requestfailed', r => errs.push(`failed ${r.method()} ${r.url().replace(/^https?:\/\/[^/]+/, '').slice(0, 120)}`));
let picker = false;
page.on('filechooser', () => { picker = true; }); // listening stops the real picker from opening
page.on('dialog', d => d.dismiss().catch(() => {}));

let server, startUrl = target;
if (!remote) {
  server = await serve(root);
  const rel = pagePath.slice(root.length).split(sep).join('/');
  startUrl = `http://127.0.0.1:${server.address().port}${rel.startsWith('/') ? rel : '/' + rel}`;
}
const urls = [startUrl];
for (const r of (flag('--routes') || '').split(',').map(s => s.trim()).filter(Boolean)) urls.push(/^https?:/.test(r) ? r : new URL(r, startUrl).href);
if (flag('--crawl')) {
  try {
    for (const s of JSON.parse(readFileSync(flag('--crawl'), 'utf8')).screens || []) {
      const u = new URL(s.url); urls.push(remote ? s.url : new URL(u.pathname + u.search + u.hash, startUrl).href);
    }
  } catch (e) { console.error(`explore: could not read ${flag('--crawl')}: ${e.message}`); }
}

const local = u => u.replace(/^https?:\/\/127\.0\.0\.1:\d+/, '');
const rows = [], leads = [];
let shotN = 0, leadN = 0;
const seenControl = new Set();
const lead = (kind, what, pageUrl, shot) => leads.push({ id: `E${String(++leadN).padStart(2, '0')}`, kind, what, pages: [local(pageUrl)], shot: shot || null });

try {
  for (const url of [...new Set(urls.map(normUrl))]) {
    const routeId = (new URL(url).hash || new URL(url).pathname).replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').slice(0, 30) || 'home';
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => null);
    await settle(page);
    const controls = await page.evaluate((args) => {
      const [danger, opener, allow, isRemote] = args;
      const D = new RegExp(danger, 'i'), O = new RegExp(opener, 'i');
      const vis = el => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
      const out = [];
      document.querySelectorAll('button, [role=button], [role=tab], summary, [aria-haspopup]:not(a)').forEach((el, i) => {
        if (!vis(el) || el.disabled || el.getAttribute('aria-disabled') === 'true') return;
        const text = (el.innerText || '').replace(/\s+/g, ' ').trim();
        const aria = el.getAttribute('aria-label') || el.getAttribute('title') || '';
        // A glyph like "?" or an arrow is still an icon: only letters or numbers count as a visible label.
        const wordy = /[\p{L}\p{N}]/u.test(text);
        const name = (wordy ? text : (aria || text)).slice(0, 60);
        const iconOnly = !wordy;
        const submit = (el.type === 'submit' && !!el.closest('form')) || false;
        const opens = el.hasAttribute('aria-haspopup') || el.hasAttribute('aria-expanded') || el.getAttribute('role') === 'tab' || el.tagName === 'SUMMARY';
        const allowed = allow.some(a => name.toLowerCase().includes(a));
        let click = true, why = '';
        if (D.test(name) && !allowed) { click = false; why = 'risky word'; }
        else if (submit && !allowed) { click = false; why = 'submits a form'; }
        else if (isRemote && !allowed && !opens && !O.test(name)) { click = false; why = name ? 'could change data' : 'no name, unknown effect'; }
        el.dataset.sre = String(i);
        const r = el.getBoundingClientRect();
        out.push({ i, name: name || '(no name)', iconOnly, hasName: !!name, click, why, y: Math.round(r.top) });
      });
      return out;
    }, [DANGER.source, OPENER.source, allow, remote]);

    let clicked = 0;
    for (const c of controls) {
      const key = `${c.name}|${c.iconOnly}`;
      const first = !seenControl.has(key);
      seenControl.add(key);
      const row = { page: local(url), control: c.name, icon_only: c.iconOnly, tooltip: null, result: null, errors: [], shot: null };
      const sel = `[data-sre="${c.i}"]`;
      // Hover icon-only controls: what does a user learn before clicking?
      if (c.iconOnly && first) {
        await page.hover(sel, { timeout: 2000 }).catch(() => null);
        await page.waitForTimeout(700);
        row.tooltip = await page.evaluate(s => {
          const el = document.querySelector(s); if (!el) return null;
          const tip = [...document.querySelectorAll('[role=tooltip], [data-tooltip], .tooltip, [class*=tooltip i]')].find(t => { const r = t.getBoundingClientRect(); return r.width > 0 && r.height > 0 && (t.innerText || '').trim(); });
          return tip ? tip.innerText.trim().slice(0, 60) : (el.getAttribute('title') || null);
        }, sel).catch(() => null);
        await page.mouse.move(0, 0).catch(() => {});
        if (!row.tooltip) lead('no-tooltip', `Icon-only control "${c.name}" shows no tooltip on hover${c.hasName ? '' : ' and has no name for screen readers'}`, url);
      }
      if (!first) continue; // the same control on another page was already explored
      if (!c.click) { row.result = `not clicked: ${c.why}`; rows.push(row); continue; }
      if (clicked >= MAX) { row.result = 'not clicked: page limit reached'; rows.push(row); continue; }
      clicked++;
      const before = await page.evaluate(STATE);
      errs = []; picker = false;
      const ok = await page.click(sel, { timeout: 3000 }).then(() => true).catch(() => false);
      if (!ok) { row.result = 'could not click (covered or moved)'; rows.push(row); continue; }
      await settle(page, { timeout: 3000 });
      const after = await page.evaluate(STATE).catch(() => before);
      const newOpen = after.open.filter(o => !before.open.includes(o));
      row.errors = [...new Set(errs)].slice(0, 5);
      if (picker) row.result = 'opened a file picker (cancelled)';
      else if (after.url !== before.url) row.result = `went to ${local(after.url)}`;
      else if (newOpen.length) row.result = `opened ${newOpen.join('; ')}`;
      else if (Math.abs(after.text - before.text) > 20) row.result = 'changed the page';
      else row.result = 'nothing visible happened';
      if (/^opened|changed/.test(row.result)) {
        row.shot = `E${String(++shotN).padStart(3, '0')}-${routeId}-${c.name.replace(/[^a-z0-9]+/gi, '-').slice(0, 24)}.png`;
        await page.screenshot({ path: join(outDir, row.shot) }).catch(() => { row.shot = null; });
      }
      if (row.result === 'nothing visible happened' && !row.errors.length) lead('dead-control', `"${c.name}" did nothing visible when clicked`, url);
      if (row.errors.length) lead('error-on-click', `Clicking "${c.name}" caused ${row.errors.length} error(s): ${row.errors[0]}`, url, row.shot);
      rows.push(row);
      // Put the page back.
      await page.keyboard.press('Escape').catch(() => {});
      await page.waitForTimeout(200);
      const now = await page.evaluate(STATE).catch(() => before);
      if (now.url !== before.url || now.open.some(o => !before.open.includes(o))) {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => null);
        await settle(page, { timeout: 6000 });
        // data-sre marks are gone after a reload: mark again in the same order
        await page.evaluate(() => { document.querySelectorAll('button, [role=button], [role=tab], summary, [aria-haspopup]:not(a)').forEach((el, i) => { el.dataset.sre = String(i); }); }).catch(() => {});
      }
    }
  }
} finally {
  await browser.close();
  if (server) server.close();
}

// The same lead on several pages is one lead.
const merged = [];
for (const l of leads) {
  const have = merged.find(m => m.kind === l.kind && m.what === l.what);
  if (have) { for (const p of l.pages) if (!have.pages.includes(p)) have.pages.push(p); continue; }
  merged.push({ ...l });
}
merged.forEach((l, i) => { l.id = `E${String(i + 1).padStart(2, '0')}`; });
writeFileSync(join(outDir, 'explore.json'), JSON.stringify({ target, controls: rows, leads: merged }, null, 2) + '\n');
const opened = rows.filter(r => /^(opened|went|changed)/.test(r.result || '')).length;
const notClicked = rows.filter(r => /^not clicked/.test(r.result || ''));
const md = ['# Explore: every safe control', '',
  `${rows.length} control(s): ${opened} opened something, ${rows.filter(r => r.result === 'nothing visible happened').length} did nothing visible, ${notClicked.length} not clicked, ${rows.filter(r => r.errors.length).length} caused errors.`, '',
  'Open what you can of the **not clicked** list by hand when its name makes the effect clear and it cannot save, send or spend. Every lead below goes in the pain map\'s **Script leads** table.', '',
  '## Leads', '', '| Lead | Check | What it found | Pages |', '| --- | --- | --- | --- |',
  ...(merged.length ? merged.map(l => `| ${l.id} | ${l.kind} | ${l.what.replace(/\|/g, '/')} | ${l.pages.join(', ')} |`) : ['| none | | | |']),
  '', '## Controls', '', '| Page | Control | Icon only | Tooltip | What happened | Errors | Screenshot |', '| --- | --- | --- | --- | --- | --- | --- |',
  ...rows.map(r => `| ${r.page} | ${r.control.replace(/\|/g, '/')} | ${r.icon_only ? 'yes' : ''} | ${r.tooltip || (r.icon_only ? 'none' : '')} | ${(r.result || '').replace(/\|/g, '/')} | ${r.errors.join('; ').replace(/\|/g, '/')} | ${r.shot || ''} |`)];
writeFileSync(join(outDir, 'explore.md'), md.join('\n') + '\n');
console.log(`explore: ${rows.length} control(s), ${opened} opened something, ${merged.length} lead(s), ${notClicked.length} not clicked · ${outDir}`);
