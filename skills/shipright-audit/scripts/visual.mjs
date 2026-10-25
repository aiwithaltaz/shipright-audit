#!/usr/bin/env node
// Measure visual craft the eye misses or argues about: alignment and spacing inside repeated cards,
// sentence-length pills, crowded pills, corner drift, menus covered by other layers, and counts that
// promise items a page does not have. Every finding gets a cropped screenshot.
// Usage: node <skill>/scripts/visual.mjs <index.html|url> [--routes "#/,#/library"] [--crawl crawl.json]
//        [--session session.json] [--out dir] [--no-click]
// --routes   extra pages to check (hash routes, paths or URLs), in addition to the start page
// --crawl    take every screen URL from a crawl.json written by crawl.mjs
// --session  a signed-in session saved by login.mjs
// --no-click do not open menus (skips the layering check)
// Opens only menus and popovers (aria-haspopup or aria-expanded). Never clicks anything that says
// delete, remove, publish, post, send, pay, sign out or log out.
// Writes visual.json, visual.md and V##-*.png crops to --out (default docs/shipright/audit/visual).
// Findings are leads for the reviewer to confirm, not verdicts. Exit 0 ran, 2 usage or missing Playwright.
import { createRequire } from 'node:module';
import { launch } from './browser.mjs';
import { createServer } from 'node:http';
import { mkdirSync, writeFileSync, existsSync, readFileSync, statSync } from 'node:fs';
import { resolve, join, dirname, extname, sep, basename } from 'node:path';

const require = createRequire(import.meta.url);
function loadPlaywright() {
  for (const name of ['playwright', 'playwright-core']) { try { return require(name); } catch {} }
  try { return createRequire(join(process.cwd(), 'package.json'))('playwright'); } catch {}
  console.error('visual: Playwright not found. Install it with: npm i -D playwright && npx playwright install chromium');
  process.exit(2);
}

const args = process.argv.slice(2);
const valueFlags = ['--routes', '--crawl', '--session', '--out'];
const target = args.find((a, i) => !a.startsWith('--') && !valueFlags.includes(args[i - 1]));
const flag = n => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
if (!target) { console.error('usage: node <skill>/scripts/visual.mjs <index.html|url> [--routes ...] [--crawl crawl.json] [--session file] [--out dir] [--no-click]'); process.exit(2); }
const outDir = resolve(flag('--out') || join('docs', 'shipright', 'audit', 'visual'));
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

// Everything below runs inside the page. Thresholds are in CSS pixels at 1280 wide:
// 6px is the smallest misalignment people notice side by side; 40px is a gap that reads as "empty" in a card.
const ANALYZE = () => {
  const ALIGN_PX = 6, GAP_MIN = 40, GAP_RATIO = 2.5, PILL_WORDS = 4, PILL_CHARS = 30, PILLS_PER_CARD = 4;
  const vis = el => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) > 0; };
  const box = el => { const r = el.getBoundingClientRect(); return { x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height, right: r.right + scrollX, bottom: r.bottom + scrollY }; };
  const text = el => (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
  const sig = el => el.tagName + '.' + [...el.classList].filter(c => !/^(odd|even|active|selected|is-|has-)/.test(c)).sort().join('.');
  const radius = el => parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0;
  let mark = 0;
  const tag = el => { if (!el.dataset.srv) el.dataset.srv = 'm' + (++mark); return el.dataset.srv; };
  const findings = [];
  const add = (f, el) => findings.push({ ...f, mark: el ? tag(el) : null });

  // Pills: small, fully rounded, filled or outlined chips with text.
  const isPill = el => {
    if (!vis(el) || el.children.length > 1) return false;
    const r = el.getBoundingClientRect(), s = getComputedStyle(el);
    if (r.height < 14 || r.height > 36 || r.width < 16) return false;
    const filled = s.backgroundColor !== 'rgba(0, 0, 0, 0)' || parseFloat(s.borderTopWidth) > 0;
    return filled && radius(el) >= r.height / 2 - 1 && text(el).length > 0 && !['BUTTON', 'INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName);
  };
  const pills = [...document.querySelectorAll('body *')].filter(isPill);
  for (const p of pills) {
    const t = text(p), words = t.split(' ').length;
    if (words > PILL_WORDS || t.length > PILL_CHARS) add({ kind: 'sentence-pill', what: `A pill holds a sentence (${words} words): "${t.slice(0, 80)}"`, detail: { words, chars: t.length } }, p);
  }

  // Repeated groups: a parent with 2+ visible children of the same shape and a card-like size.
  const groups = [];
  for (const parent of document.querySelectorAll('body *')) {
    const kids = [...parent.children].filter(vis);
    if (kids.length < 2) continue;
    const bySig = {};
    for (const k of kids) (bySig[sig(k)] ??= []).push(k);
    for (const [s, items] of Object.entries(bySig)) {
      if (items.length < 2) continue;
      const big = items.filter(i => { const b = i.getBoundingClientRect(); return b.width >= 120 && b.height >= 48 && !i.querySelector('table'); });
      // Same class is not enough: a list item repeats an inner structure. Keep the largest set of items
      // whose direct children have the same tags in the same order (after unwrapping single wrappers).
      const shape = el => { let x = el; while (x.children.length === 1) x = x.children[0]; return [...x.children].filter(vis).map(c => c.tagName).join(','); };
      const byShape = {};
      for (const i of big) (byShape[shape(i)] ??= []).push(i);
      const same = Object.values(byShape).sort((a, b) => b.length - a.length)[0] || [];
      if (same.length >= 2 && !groups.some(g => g.items.includes(same[0]))) groups.push({ parent, sig: s, items: same });
    }
  }
  const DATE = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.? \d{1,2}\b|\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}[\/.]\d{1,2}[\/.]\d{2,4}\b|\b\d+ (min|minute|hour|day|week|month)s? ago\b|\b(today|yesterday)\b|\bupdated\b/i;
  const ownText = el => [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join(' ').trim();
  // For text, measure where the letters are, not the element box: padding moves text without moving the box.
  const textBox = el => {
    const range = document.createRange();
    range.selectNodeContents(el);
    const r = range.getBoundingClientRect();
    return r.width ? { x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height, right: r.right + scrollX, bottom: r.bottom + scrollY } : box(el);
  };
  const partsOf = card => {
    const parts = [];
    const seen = { button: 0, date: 0, pill: 0 };
    for (const el of card.querySelectorAll('*')) {
      if (!vis(el)) continue;
      let role = null;
      if (el.matches('button, [role=button], a.btn, a[class*=button i]') && text(el)) role = 'button';
      else if (isPill(el)) role = 'pill';
      else if (DATE.test(ownText(el)) && ownText(el).length < 40) role = 'date';
      if (role) parts.push({ key: `${role}#${seen[role]++}`, role, el, b: role === 'date' ? textBox(el) : box(el) });
    }
    return parts;
  };
  const spread = xs => Math.max(...xs) - Math.min(...xs);
  for (const g of groups) {
    const cards = g.items.map(el => ({ el, b: box(el), parts: partsOf(el) }));
    // Horizontal: the same part should sit at the same distance from the card's left or right edge.
    const keys = [...new Set(cards.flatMap(c => c.parts.map(p => p.key)))];
    for (const key of keys) {
      const hits = cards.map(c => ({ c, p: c.parts.find(p => p.key === key) })).filter(h => h.p);
      if (hits.length < 2) continue;
      const left = spread(hits.map(h => h.p.b.x - h.c.b.x)), right = spread(hits.map(h => h.c.b.right - h.p.b.right));
      if (Math.min(left, right) > ALIGN_PX) add({ kind: 'misaligned', what: `The ${key.split('#')[0]} in repeated cards does not line up: it shifts by ${Math.round(Math.min(left, right))}px from card to card`, detail: { part: key, shift_px: Math.round(Math.min(left, right)), cards: hits.length } }, g.parent);
      // Vertical: cards side by side in one row should hold the part at the same height.
      const rows = {};
      for (const h of hits) (rows[Math.round(h.c.b.y / 4)] ??= []).push(h);
      for (const row of Object.values(rows)) {
        if (row.length < 2) continue;
        const top = spread(row.map(h => h.p.b.y - h.c.b.y)), bottom = spread(row.map(h => h.c.b.bottom - h.p.b.bottom));
        if (Math.min(top, bottom) > ALIGN_PX) add({ kind: 'misaligned', what: `Side-by-side cards hold the ${key.split('#')[0]} at different heights (${Math.round(Math.min(top, bottom))}px apart)`, detail: { part: key, shift_px: Math.round(Math.min(top, bottom)), cards: row.length } }, g.parent);
      }
    }
    // Inner spacing: one gap far bigger than the others reads as a hole in the card.
    for (const c of cards) {
      let inner = c.el;
      while (inner.children.length === 1) inner = inner.children[0];
      const blocks = [...inner.children].filter(vis).map(box).sort((a, b) => a.y - b.y);
      const gaps = [];
      for (let i = 1; i < blocks.length; i++) gaps.push(Math.max(0, blocks[i].y - Math.max(...blocks.slice(0, i).map(b => b.bottom))));
      if (!gaps.length) continue;
      const max = Math.max(...gaps), rest = gaps.filter(x => x !== max).sort((a, b) => a - b);
      const med = rest.length ? rest[Math.floor(rest.length / 2)] : 0;
      if (max >= GAP_MIN && (rest.length ? max >= GAP_RATIO * Math.max(med, 4) : max >= 56)) {
        add({ kind: 'big-gap', what: `A card has a ${Math.round(max)}px empty gap inside it (other gaps ${rest.length ? Math.round(med) + 'px' : 'none'})`, detail: { gap_px: Math.round(max), typical_px: Math.round(med) } }, c.el);
        break; // one card per group is enough evidence
      }
    }
    // Crowded pills: too many chips on one card stop working as labels.
    for (const c of cards) {
      const clusters = {};
      for (const p of c.parts.filter(p => p.role === 'pill')) { const k = tag(p.el.parentElement); clusters[k] = (clusters[k] || 0) + 1; }
      const n = Math.max(0, ...Object.values(clusters));
      if (n > PILLS_PER_CARD) { add({ kind: 'crowded-pills', what: `A card carries ${n} pills; past ${PILLS_PER_CARD} they stop being scannable labels`, detail: { pills: n } }, c.el); break; }
    }
  }

  // Corner scale: what radius do cards and buttons use?
  const rounded = [...groups.flatMap(g => g.items), ...document.querySelectorAll('button, input, select, textarea, [role=button]')]
    .filter(vis).map(el => ({ el, r: radius(el), h: el.getBoundingClientRect().height })).filter(x => x.r < x.h / 2 - 1);
  const radii = rounded.map(x => Math.round(x.r)).sort((a, b) => a - b);
  const medianRadius = radii.length ? radii[Math.floor(radii.length / 2)] : 0;
  const scale = {};
  for (const r of radii) scale[r] = (scale[r] || 0) + 1;

  // Numbers on navigation and tabs, for the count check.
  const counts = [];
  for (const el of document.querySelectorAll('nav *, header *, aside *, [role=tablist] *')) {
    if (!vis(el) || el.children.length || !/^\d{1,4}$/.test(text(el))) continue;
    const host = el.closest('a, button, [role=tab]');
    if (!host) continue;
    const label = text(host).replace(text(el), '').trim();
    if (label) counts.push({ label, count: Number(text(el)), href: host.getAttribute('href') || null, mark: tag(host) });
  }
  const main = document.querySelector('main') || document.body;
  const empty = /\b(no ([\w-]+ ){0,3}(yet|found)|nothing (here|yet)|get started|create your first|you (don't|do not) have any|is empty)\b/i.test(text(main));
  return { findings, medianRadius, scale, counts, empty, title: document.title };
};

// Find menus and popovers to open. Destructive or session-ending words are never clicked.
const DANGER = /delete|remove|publish|post\b|send|pay|sign ?out|log ?out|archive|disconnect/i;
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
    if (after !== before) await page.reload({ waitUntil: 'domcontentloaded' }).then(() => page.waitForTimeout(300)).catch(() => null);
  }
  return { menus: out, next: n };
}

const { chromium } = loadPlaywright();
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
  for (const url of [...new Set(urls)]) {
    const routeId = (new URL(url).hash || new URL(url).pathname).replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'home';
    await page.goto(url, { waitUntil: 'networkidle', timeout: 20000 }).catch(() => page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 }));
    await page.waitForTimeout(400);
    const a = await page.evaluate(ANALYZE);
    for (const f of a.findings) {
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
    pages.push({ url, title: a.title, empty: a.empty, corner_scale: a.scale, median_radius: a.medianRadius, counts: a.counts, menus: menus.map(({ box, ...m }) => m) });
  }
  // Count check: a number on a link should match what its page shows.
  const seenCount = new Set();
  for (const p of pages) for (const c of p.counts) {
    if (!c.href || c.count === 0 || seenCount.has(c.href + c.count)) continue;
    seenCount.add(c.href + c.count);
    const url = /^https?:/.test(c.href) ? c.href : new URL(c.href, p.url).href;
    if (new URL(url).origin !== new URL(p.url).origin) continue;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => null);
    await page.waitForTimeout(600);
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
writeFileSync(join(outDir, 'visual.json'), JSON.stringify({ target, pages: pages.map(p => ({ ...p, url: local(p.url) })), findings: findings.map(f => ({ ...f, page: local(f.page) })) }, null, 2) + '\n');
const KIND = { 'sentence-pill': 'Sentence used as a pill', 'crowded-pills': 'Too many pills', misaligned: 'Misaligned in repeated cards', 'big-gap': 'Big empty gap in a card', 'covered-menu': 'Menu covered by another layer', 'offscreen-menu': 'Menu runs off screen', 'sharp-corners': 'Corner shape drift', 'count-mismatch': 'Count with nothing behind it' };
const md = ['# Visual checks', '', `${pages.length} page(s) at 1280 wide${session ? ', signed in' : ''}. These are leads: confirm each on the screenshot before it becomes a pain.`, ''];
md.push('| ID | Check | What it measured | Page | Screenshot |', '| --- | --- | --- | --- | --- |');
for (const f of findings) md.push(`| ${f.id} | ${KIND[f.kind] || f.kind} | ${f.what.replace(/\|/g, '/')} | ${local(f.page)} | ${f.shot || 'none'} |`);
if (!findings.length) md.push('| none | | No visual problems measured | | |');
md.push('', '## Corner scale (px: how many cards, buttons and fields use it)', '');
for (const p of pages) md.push(`- ${local(p.url)}: ${Object.entries(p.corner_scale).map(([r, c]) => `${r}px x${c}`).join(', ') || 'none measured'}`);
const allCounts = pages.flatMap(p => p.counts.map(c => `${c.label} ${c.count}`));
if (allCounts.length) md.push('', '## Numbers on navigation', '', ...[...new Set(allCounts)].map(c => `- ${c}`), '', 'Check what each number counts. A number on a tab reads as "this many need you".');
const emptyPages = pages.filter(p => p.empty).length;
if (emptyPages) md.push('', `## Empty pages: ${emptyPages} of ${pages.length}`, '', 'Pages with little or no data hide density, pill and alignment problems. Prefer an account with realistic data.');
writeFileSync(join(outDir, 'visual.md'), md.join('\n') + '\n');
console.log(`visual: ${pages.length} page(s), ${findings.length} lead(s)${emptyPages ? `, ${emptyPages} empty page(s)` : ''} · ${outDir}`);
