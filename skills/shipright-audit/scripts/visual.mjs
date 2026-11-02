#!/usr/bin/env node
// Measure visual craft the eye misses or argues about: alignment and spacing inside repeated cards,
// sentence-length pills, crowded pills, too many labels per card, a main action buried at the bottom, corner drift, menus covered by other layers, and counts that
// promise items a page does not have. Every finding gets a cropped screenshot.
// Usage: node <skill>/scripts/visual.mjs <index.html|url> [--routes "#/,#/library"] [--crawl crawl.json]
//        [--session session.json] [--out dir] [--no-click]
// --routes   extra pages to check (hash routes, paths or URLs), in addition to the start page
// --crawl    take every screen URL from a crawl.json written by crawl.mjs
// --session  a signed-in session saved by login.mjs
// --no-click do not open menus (skips the layering check)
// Opens only menus and popovers (aria-haspopup or aria-expanded). Never clicks risky words
// (delete, publish, send, generate, save, sign out and the rest of DANGER in browser.mjs).
// Waits for each page to settle first, and groups the same problem on several pages into one lead.
// Writes visual.json, visual.md and V##-*.png crops to --out (the skill passes <audit>/visual).
// Findings are leads for the reviewer to confirm, not verdicts. Exit 0 ran, 2 usage or missing Playwright.
import { createRequire } from 'node:module';
import { launch, loadPlaywright, settle, normUrl, DANGER } from './browser.mjs';
import { createServer } from 'node:http';
import { mkdirSync, writeFileSync, existsSync, readFileSync, statSync } from 'node:fs';
import { resolve, join, dirname, extname, sep, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);

const args = process.argv.slice(2);
const valueFlags = ['--routes', '--crawl', '--session', '--out'];
const target = args.find((a, i) => !a.startsWith('--') && !valueFlags.includes(args[i - 1]));
const flag = n => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
if (!target) { console.error('usage: node <skill>/scripts/visual.mjs <index.html|url> [--routes ...] [--crawl crawl.json] [--session file] [--out dir] [--no-click]'); process.exit(2); }
const outDir = resolve(flag('--out') || join('docs', 'shipright', 'audits', 'current', 'visual'));
mkdirSync(outDir, { recursive: true });
const session = flag('--session');
if (session && !existsSync(session)) { console.error(`visual: session file ${session} not found. Run login.mjs first.`); process.exit(2); }
const noClick = args.includes('--no-click');

const remote = /^https?:/.test(target);
const given = remote ? null : resolve(target);
if (!remote && !existsSync(given)) { console.error(`visual: ${target} not found`); process.exit(2); }
const pagePath = remote ? null : (statSync(given).isDirectory() ? join(given, 'index.html') : given);
const root = remote ? null : dirname(pagePath);
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

// The in-page checks live in analyze-page.js, so an audit run by hand in a browser tool uses the same code.
const ANALYZE_SRC = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'analyze-page.js'), 'utf8');
const ANALYZE = `(() => { ${ANALYZE_SRC}\n return SHIPRIGHT_ANALYZE(); })()`;

// Find menus and popovers to open. Destructive or session-ending words are never clicked.
const TRIGGERS = `[aria-haspopup]:not([aria-haspopup="false"]), [aria-expanded="false"]`;

async function openMenus(page, routeId, startFinding) {
  const out = [];
  const triggers = await page.$$eval(TRIGGERS, (els, danger) => els.map((el, i) => {
    const r = el.getBoundingClientRect();
    const t = (el.innerText || el.getAttribute('aria-label') || el.title || '').replace(/\s+/g, ' ').trim();
    el.dataset.srvTrigger = String(i);
    return { i, label: t.slice(0, 60), visible: r.width > 0 && r.height > 0, danger: new RegExp(danger, 'i').test(t) };
  }), DANGER.source);
  let n = startFinding;
  for (const t of triggers.filter(t => t.visible && !t.danger).slice(0, 8)) {
    const before = await page.evaluate(() => new Set([...document.querySelectorAll('body *')].filter(el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; })).size);
    await page.click(`[data-srv-trigger="${t.i}"]`, { timeout: 3000 }).catch(() => null);
    await page.waitForTimeout(350);
    const overlay = await page.evaluate(() => {
      const vis = el => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 80 && r.height > 30 && s.visibility !== 'hidden' && s.display !== 'none'; };
      const cands = [...document.querySelectorAll('[role=menu], [role=dialog], [role=listbox], [data-state=open], [popover]')].filter(vis);
      const el = cands.sort((a, b) => b.getBoundingClientRect().width * b.getBoundingClientRect().height - a.getBoundingClientRect().width * a.getBoundingClientRect().height)[0];
      if (!el) return null;
      const r = el.getBoundingClientRect();
      // Sample a 3x3 grid inside the overlay: whatever is on top at each point should belong to it.
      const covered = [];
      for (const fx of [0.15, 0.5, 0.85]) for (const fy of [0.15, 0.5, 0.85]) {
        const x = r.left + r.width * fx, y = r.top + r.height * fy;
        if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) continue;
        const top = document.elementFromPoint(x, y);
        if (top && !el.contains(top) && !top.contains(el)) covered.push(`${top.tagName.toLowerCase()}${top.className && typeof top.className === 'string' ? '.' + top.className.trim().split(/\s+/)[0] : ''}`);
      }
      const offscreen = r.bottom > innerHeight + 1 || r.right > innerWidth + 1 || r.top < -1 || r.left < -1;
      return { box: { x: Math.max(0, r.left - 8), y: Math.max(0, r.top - 8), width: Math.min(innerWidth, r.width + 16), height: Math.min(innerHeight - Math.max(0, r.top - 8), r.height + 16) }, radius: parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0, covered: [...new Set(covered)], coveredShare: covered.length, offscreen, role: el.getAttribute('role') || el.tagName.toLowerCase() };
    });
    if (overlay) {
      const shot = `V${String(++n).padStart(2, '0')}-${routeId}-menu.png`;
      await page.screenshot({ path: join(outDir, shot), clip: overlay.box }).catch(() => null);
      out.push({ trigger: t.label, ...overlay, shot });
    }
    await page.keyboard.press('Escape');
    await page.waitForTimeout(150);
    const after = await page.evaluate(() => new Set([...document.querySelectorAll('body *')].filter(el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; })).size);
    if (after !== before) await page.reload({ waitUntil: 'domcontentloaded' }).then(() => settle(page, { timeout: 6000 })).catch(() => null);
  }
  return { menus: out, next: n };
}

const { chromium } = loadPlaywright('visual');
const browser = await launch(chromium, {}, 'visual');
const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, ...(session ? { storageState: session } : {}) });
const page = await context.newPage();
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
      // crawl.json holds the crawl's own local server address; keep only the path and hash for local apps.
      const u = new URL(s.url); urls.push(remote ? s.url : new URL(u.pathname + u.search + u.hash, startUrl).href);
    }
  } catch (e) { console.error(`visual: could not read ${flag('--crawl')}: ${e.message}`); }
}

const pages = [];
const findings = [];
let n = 0;
try {
  for (const url of [...new Set(urls.map(normUrl))]) {
    const routeId = (new URL(url).hash || new URL(url).pathname).replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').slice(0, 40) || 'home';
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => null);
    const settled = await settle(page);
    const a = await page.evaluate(ANALYZE);
    a.settled = settled;
    const seenHere = new Set();
    for (const f of a.findings) {
      if (seenHere.has(f.kind + f.what)) continue; // the same lead twice on one page is one lead
      seenHere.add(f.kind + f.what);
      const id = `V${String(++n).padStart(2, '0')}`;
      const shot = `${id}-${routeId}-${f.kind}.png`;
      if (f.mark) await page.locator(`[data-srv="${f.mark}"]`).first().screenshot({ path: join(outDir, shot) }).catch(() => null);
      findings.push({ id, page: url, kind: f.kind, what: f.what, detail: f.detail, shot: existsSync(join(outDir, shot)) ? shot : null });
    }
    let menus = [];
    if (!noClick) {
      const r = await openMenus(page, routeId, n);
      menus = r.menus;
      for (const m of menus) {
        const id = `V${String(++n).padStart(2, '0')}`;
        if (m.covered.length) findings.push({ id, page: url, kind: 'covered-menu', what: `The "${m.trigger}" ${m.role} is partly hidden behind ${m.covered.join(', ')} (${m.coveredShare} of 9 sample points)`, detail: { covered_by: m.covered }, shot: m.shot });
        if (m.offscreen) findings.push({ id: `V${String(++n).padStart(2, '0')}`, page: url, kind: 'offscreen-menu', what: `The "${m.trigger}" ${m.role} runs past the edge of the screen`, detail: {}, shot: m.shot });
        if (m.radius < 2 && a.medianRadius >= 6) findings.push({ id: `V${String(++n).padStart(2, '0')}`, page: url, kind: 'sharp-corners', what: `The "${m.trigger}" ${m.role} has square corners while cards and buttons use about ${a.medianRadius}px`, detail: { radius: m.radius, usual: a.medianRadius }, shot: m.shot });
      }
    }
    pages.push({ url, title: a.title, settled: a.settled, empty: a.empty, style: a.style, corner_scale: a.scale, median_radius: a.medianRadius, counts: a.counts, menus: menus.map(({ box, ...m }) => m) });
  }
  // Count check: a number on a link should match what its page shows.
  const seenCount = new Set();
  for (const p of pages) for (const c of p.counts) {
    if (!c.href || c.count === 0 || seenCount.has(c.href + c.count)) continue;
    seenCount.add(c.href + c.count);
    const url = /^https?:/.test(c.href) ? c.href : new URL(c.href, p.url).href;
    if (new URL(url).origin !== new URL(p.url).origin) continue;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => null);
    await settle(page);
    const empty = await page.evaluate(() => /\b(no ([\w-]+ ){0,3}(yet|found)|nothing (here|yet)|get started|create your first|you (don't|do not) have any|is empty)\b/i.test((document.querySelector('main') || document.body).innerText));
    if (empty) {
      const id = `V${String(++n).padStart(2, '0')}`, shot = `${id}-count.png`;
      await page.screenshot({ path: join(outDir, shot) }).catch(() => null);
      findings.push({ id, page: url, kind: 'count-mismatch', what: `"${c.label}" shows ${c.count}, but its page says there is nothing there`, detail: { label: c.label, count: c.count }, shot });
    }
  }
} finally {
  await browser.close();
  if (server) server.close();
}

const local = u => u.replace(/^https?:\/\/127\.0\.0\.1:\d+/, '');
// One lead per problem: the same check with the same words on several pages is one lead that lists them all.
const leads = [];
for (const f of findings) {
  const key = f.kind + '|' + f.what;
  const have = leads.find(l => l.key === key);
  if (have) { if (!have.pages.includes(local(f.page))) have.pages.push(local(f.page)); if (f.shot) have.shots.push(f.shot); continue; }
  leads.push({ key, id: f.id, kind: f.kind, what: f.what, detail: f.detail, pages: [local(f.page)], shots: f.shot ? [f.shot] : [], shot: f.shot });
}
writeFileSync(join(outDir, 'visual.json'), JSON.stringify({ target, pages: pages.map(p => ({ ...p, url: local(p.url) })), leads: leads.map(({ key, ...l }) => l), findings: findings.map(f => ({ ...f, page: local(f.page) })) }, null, 2) + '\n');
const KIND = { 'sentence-pill': 'Sentence used as a pill', 'crowded-pills': 'Too many pills', misaligned: 'Misaligned in repeated cards', 'big-gap': 'Big empty gap in a card', 'covered-menu': 'Menu covered by another layer', 'offscreen-menu': 'Menu runs off screen', 'sharp-corners': 'Corner shape drift', 'count-mismatch': 'Count with nothing behind it', 'buried-action': 'Main action buried at the bottom', 'label-overload': 'Too many labels on a card' };
const md = ['# Visual checks', '', `${pages.length} page(s) at 1280 wide${session ? ', signed in' : ''}, ${leads.length} lead(s).`, '',
  'Every lead below must appear in the pain map\'s **Script leads** table: as a pain (P##), or as Rejected with the reason you saw on the crop. The gate checks this.', ''];
const unsettledPages = pages.filter(p => p.settled === false).map(p => local(p.url));
if (unsettledPages.length) md.push(`> **Still loading:** ${unsettledPages.join(', ')} kept changing for 10 seconds. Leads there may describe the loading state.`, '');
md.push('| Lead | Check | What it measured | Pages | Screenshot |', '| --- | --- | --- | --- | --- |');
for (const l of leads) md.push(`| ${l.id} | ${KIND[l.kind] || l.kind} | ${l.what.replace(/\|/g, '/')} | ${l.pages.join(', ')} | ${l.shot || 'none'} |`);
if (!leads.length) md.push('| none | | No visual problems measured | | |');
md.push('', '## Style inventory (for the taste pass)', '', 'Signals, not verdicts. Read them with `references/taste.md`: 1 or 2 families, about 5 to 7 sizes, one accent, lines of 45 to 75 characters.', '', '| Page | Font families | Font sizes | Accent colors | Line length (median / max chars) | Long all-caps text | Emoji as icons |', '| --- | --- | --- | --- | --- | --- | --- |');
for (const p of pages) { const st = p.style || {}; md.push(`| ${local(p.url)} | ${(st.font_families || []).join(', ').replace(/\|/g, '/') || 'none'} (${(st.font_families || []).length}) | ${(st.font_sizes || []).length}: ${(st.font_sizes || []).join(' ')} | ${st.accent_colors ?? 0} | ${st.line_length_chars ? `${st.line_length_chars.median} / ${st.line_length_chars.max}` : 'no long text'} | ${st.all_caps_long || 0} | ${st.emoji_icons || 0} |`); }
md.push('', '## Corner scale (px: how many cards, buttons and fields use it)', '');
for (const p of pages) md.push(`- ${local(p.url)}: ${Object.entries(p.corner_scale).map(([r, c]) => `${r}px x${c}`).join(', ') || 'none measured'}`);
const allCounts = pages.flatMap(p => p.counts.map(c => `${c.label} ${c.count}`));
if (allCounts.length) md.push('', '## Numbers on navigation', '', ...[...new Set(allCounts)].map(c => `- ${c}`), '', 'Check what each number counts. A number on a tab reads as "this many need you".');
const emptyPages = pages.filter(p => p.empty).length;
if (emptyPages) md.push('', `## Empty pages: ${emptyPages} of ${pages.length}`, '', 'Pages with little or no data hide density, pill and alignment problems. Prefer an account with realistic data.');
writeFileSync(join(outDir, 'visual.md'), md.join('\n') + '\n');
console.log(`visual: ${pages.length} page(s), ${leads.length} lead(s)${emptyPages ? `, ${emptyPages} empty page(s)` : ''} · ${outDir}`);
