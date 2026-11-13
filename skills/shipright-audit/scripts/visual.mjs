#!/usr/bin/env node
// Measure visual craft the eye misses or argues about: alignment and spacing inside repeated cards,
// sentence-length pills, crowded pills, too many labels per card, a main action buried at the bottom, corner drift, menus covered by other layers, text that is cut off, and counts that
// promise items a page does not have. Every finding gets a cropped screenshot.
// Usage: node <skill>/scripts/visual.mjs <index.html|url> [--routes "#/,#/library"] [--crawl crawl.json]
//        [--widths 1280,390] [--profile dir] [--session session.json] [--out dir] [--no-click]
// --routes   extra pages to check (hash routes, paths or URLs), in addition to the start page
// --crawl    take every screen URL from a crawl.json written by crawl.mjs
// --widths   screen widths to check. Both 1280 and 390 run by default: every page is checked on phone too
// --profile  the sign-in window's browser profile (login.mjs prints its path). Tried first.
// --session  a signed-in session file saved by login.mjs. The fallback.
//            With either, it stops with exit 3 if the app no longer knows us.
// --no-click do not open menus (skips the layering check)
// Opens only menus and popovers (aria-haspopup or aria-expanded). Never clicks risky words
// (delete, publish, send, generate, save, sign out and the rest of DANGER in browser.mjs).
// Waits for each page to settle first, and groups the same problem on several pages or widths into one
// lead. A lead that shows at one width only says so ("at 390 wide only").
// Writes visual.json, visual.md and V##-*.png crops to --out (the skill passes <audit>/visual).
// Findings are leads for the reviewer to confirm, not verdicts. Exit 0 ran, 2 usage or missing Playwright,
// 3 the app signed us out.
import { openContext, signInFlags, openTarget, pagesToVisit, widthsFlag, viewportFor, analyzeScript, mergeLeads, settle, DANGER } from './browser.mjs';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';

const args = process.argv.slice(2);
const valueFlags = ['--routes', '--crawl', '--session', '--profile', '--out', '--widths'];
const target = args.find((a, i) => !a.startsWith('--') && !valueFlags.includes(args[i - 1]));
const flag = n => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
if (!target) { console.error('usage: node <skill>/scripts/visual.mjs <index.html|url> [--routes ...] [--crawl crawl.json] [--widths 1280,390] [--profile dir] [--session file] [--out dir] [--no-click]'); process.exit(2); }
const outDir = resolve(flag('--out') || join('docs', 'shipright', 'audits', 'current', 'visual'));
mkdirSync(outDir, { recursive: true });
const { session, profile } = signInFlags(args, 'visual');
const noClick = args.includes('--no-click');
const widths = widthsFlag(args);

// Find menus and popovers to open. Destructive or session-ending words are never clicked.
const TRIGGERS = `[aria-haspopup]:not([aria-haspopup="false"]), [aria-expanded="false"]`;

async function openMenus(page, routeId, startFinding, suffix) {
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
      const shot = `V${String(++n).padStart(2, '0')}-${routeId}-menu${suffix}.png`;
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

const site = await openTarget(target, 'visual');
const opened = await openContext({ session, profile, name: 'visual', url: site.startUrl, viewport: viewportFor(widths[0]) });
const page = opened.page;
const urls = pagesToVisit({ startUrl: site.startUrl, remote: site.remote, routes: flag('--routes'), crawl: flag('--crawl'), name: 'visual' });

const pages = [];
const findings = [];
let n = 0;
try {
  for (const width of widths) {
    await page.setViewportSize(viewportFor(width));
    const suffix = width === widths[0] ? '' : `-${width}`;
    for (const url of urls) {
      const routeId = (new URL(url).hash || new URL(url).pathname).replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').slice(0, 40) || 'home';
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => null);
      const settled = await settle(page);
      await page.evaluate(() => scrollTo(0, 0)).catch(() => {}); // a crop on the last page may have scrolled this one
      const a = await page.evaluate(analyzeScript());
      a.settled = settled;
      const seenHere = new Set();
      for (const f of a.findings) {
        if (seenHere.has(f.kind + f.what)) continue; // the same lead twice on one page is one lead
        seenHere.add(f.kind + f.what);
        const id = `V${String(++n).padStart(2, '0')}`;
        const shot = `${id}-${routeId}-${f.kind}${suffix}.png`;
        if (f.mark) await page.locator(`[data-srv="${f.mark}"]`).first().screenshot({ path: join(outDir, shot) }).catch(() => null);
        findings.push({ id, page: url, width, kind: f.kind, what: f.what, group: f.group, detail: f.detail, shot: existsSync(join(outDir, shot)) ? shot : null });
      }
      let menus = [];
      if (!noClick) {
        const r = await openMenus(page, routeId, n, suffix);
        menus = r.menus;
        for (const m of menus) {
          const id = `V${String(++n).padStart(2, '0')}`;
          if (m.covered.length) findings.push({ id, page: url, width, kind: 'covered-menu', what: `The "${m.trigger}" ${m.role} is partly hidden behind ${m.covered.join(', ')} (${m.coveredShare} of 9 sample points)`, detail: { covered_by: m.covered }, shot: m.shot });
          if (m.offscreen) findings.push({ id: `V${String(++n).padStart(2, '0')}`, page: url, width, kind: 'offscreen-menu', what: `The "${m.trigger}" ${m.role} runs past the edge of the screen`, detail: {}, shot: m.shot });
          if (m.radius < 2 && a.medianRadius >= 6) findings.push({ id: `V${String(++n).padStart(2, '0')}`, page: url, width, kind: 'sharp-corners', what: `The "${m.trigger}" ${m.role} has square corners while cards and buttons use about ${a.medianRadius}px`, detail: { radius: m.radius, usual: a.medianRadius }, shot: m.shot });
        }
      }
      // The style inventory and the count check read each page once, at the first width.
      if (width === widths[0]) pages.push({ url, title: a.title, settled: a.settled, empty: a.empty, style: a.style, corner_scale: a.scale, median_radius: a.medianRadius, counts: a.counts, menus: menus.map(({ box, ...m }) => m) });
      else { const p = pages.find(x => x.url === url); if (p && !settled) p.settled = false; }
    }
  }
  // Count check: a number on a link should match what its page shows.
  await page.setViewportSize(viewportFor(widths[0]));
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
      findings.push({ id, page: url, width: widths[0], kind: 'count-mismatch', what: `"${c.label}" shows ${c.count}, but its page says there is nothing there`, detail: { label: c.label, count: c.count }, shot });
    }
  }
} finally {
  await opened.close();
  site.stop();
}

const local = u => u.replace(/^https?:\/\/127\.0\.0\.1:\d+/, '');
const leads = mergeLeads(findings, widths, local);
writeFileSync(join(outDir, 'visual.json'), JSON.stringify({ target, widths, signed_in_with: opened.mode !== 'none' ? opened.label : null, pages: pages.map(p => ({ ...p, url: local(p.url) })), leads, findings: findings.map(({ group, ...f }) => ({ ...f, page: local(f.page) })) }, null, 2) + '\n');
const KIND = { 'sentence-pill': 'Sentence used as a pill', 'crowded-pills': 'Too many pills', misaligned: 'Misaligned in repeated cards', 'big-gap': 'Big empty gap in a card', 'covered-menu': 'Menu covered by another layer', 'offscreen-menu': 'Menu runs off screen', 'sharp-corners': 'Corner shape drift', 'count-mismatch': 'Count with nothing behind it', 'buried-action': 'Main action buried at the bottom', 'label-overload': 'Too many labels on a card', 'clipped-text': 'Text cut off' };
const md = ['# Visual checks', '', `${pages.length} page(s) at ${widths.join(' and ')} wide${opened.mode !== 'none' ? `, signed in with ${opened.label}` : ''}, ${leads.length} lead(s).`, '',
  'Every lead below must appear in the pain map\'s **Script leads** table: as a pain (P##), or as Rejected with the reason you saw on the crop. The gate checks this.', ''];
const unsettledPages = pages.filter(p => p.settled === false).map(p => local(p.url));
if (unsettledPages.length) md.push(`> **Still loading:** ${unsettledPages.join(', ')} kept changing for 10 seconds. Leads there may describe the loading state.`, '');
md.push('| Lead | Check | What it measured | Widths | Pages | Screenshot |', '| --- | --- | --- | --- | --- | --- |');
for (const l of leads) md.push(`| ${l.id} | ${KIND[l.kind] || l.kind} | ${l.what.replace(/\|/g, '/')} | ${l.widths.join(', ')} | ${l.pages.join(', ')} | ${l.shot || 'none'} |`);
if (!leads.length) md.push('| none | | No visual problems measured | | | |');
md.push('', '## Style inventory (for the taste pass)', '', 'Signals, not verdicts. Read them with `references/taste.md`: 1 or 2 families, about 5 to 7 sizes, one accent, lines of 45 to 75 characters.', '', '| Page | Font families | Font sizes | Accent colors | Line length (median / max chars) | Long all-caps text | Emoji as icons |', '| --- | --- | --- | --- | --- | --- | --- |');
for (const p of pages) { const st = p.style || {}; md.push(`| ${local(p.url)} | ${(st.font_families || []).join(', ').replace(/\|/g, '/') || 'none'} (${(st.font_families || []).length}) | ${(st.font_sizes || []).length}: ${(st.font_sizes || []).join(' ')} | ${st.accent_colors ?? 0} | ${st.line_length_chars ? `${st.line_length_chars.median} / ${st.line_length_chars.max}` : 'no long text'} | ${st.all_caps_long || 0} | ${st.emoji_icons || 0} |`); }
md.push('', `## Corner scale (px: how many cards, buttons and fields use it, at ${widths[0]} wide)`, '');
for (const p of pages) md.push(`- ${local(p.url)}: ${Object.entries(p.corner_scale).map(([r, c]) => `${r}px x${c}`).join(', ') || 'none measured'}`);
const allCounts = pages.flatMap(p => p.counts.map(c => `${c.label} ${c.count}`));
if (allCounts.length) md.push('', '## Numbers on navigation', '', ...[...new Set(allCounts)].map(c => `- ${c}`), '', 'Check what each number counts. A number on a tab reads as "this many need you".');
const emptyPages = pages.filter(p => p.empty).length;
if (emptyPages) md.push('', `## Empty pages: ${emptyPages} of ${pages.length}`, '', 'Pages with little or no data hide density, pill and alignment problems. Prefer an account with realistic data.');
writeFileSync(join(outDir, 'visual.md'), md.join('\n') + '\n');
console.log(`visual: ${pages.length} page(s) at ${widths.join(' and ')} wide, ${leads.length} lead(s)${emptyPages ? `, ${emptyPages} empty page(s)` : ''} · ${outDir}`);
