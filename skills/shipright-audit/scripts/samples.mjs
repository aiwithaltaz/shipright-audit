#!/usr/bin/env node
// Open existing results, read-only: past chats, library items, projects and files the owner already has.
// The owner's own data is the best test data. A generated image that never shows, a reply footer cut
// off on phone, an action row of unnamed icons: these only appear on a page that holds a real result.
// Usage: node <skill>/scripts/samples.mjs <index.html|url> [--crawl crawl.json] [--routes "#/,/library"]
//        [--samples 5] [--widths 1280,390] [--profile dir] [--session session.json] [--out dir]
// What it does, on the start page, --routes and every screen in --crawl:
//   1. Finds item lists: links inside nav, aside, lists and tables that share a pattern
//      ("/chat/abc" and "/chat/xyz" are both "/chat/*").
//   2. Looks at up to 3 x N items per list, and keeps the N (default 5) whose page holds the most to
//      check: images, video, files, code, artifacts, tool and connector results.
//   3. On each kept item, at 1280 and at 390 wide: scrolls through it, saves a full-page screenshot and
//      runs the page checks (analyze-page.js) plus the result checks: media that never loaded (a broken
//      image, a dead video, a "click to load image" placeholder), clipped text, and action buttons with
//      no name.
// Read-only: it opens a link by its address and scrolls. It never clicks or types anything, and it
// skips links whose words or address look risky (delete, sign out, export... see DANGER in browser.mjs).
// --profile / --session: stay signed in (see crawl.mjs). It stops with exit 3 if the app no longer knows us.
// Writes samples.json, samples.md, R-<list>-<item>-<width>.png page screenshots and R##-*.png crops to
// --out (the skill passes <audit>/samples). Leads are R##: decide each one in the pain map's Script leads.
// Exit 0 ran, 2 usage or missing Playwright, 3 the app signed us out.
import { openContext, signInFlags, openTarget, pagesToVisit, widthsFlag, viewportFor, analyzeScript, mergeLeads, linkPattern, settle, normUrl, DANGER } from './browser.mjs';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';

const args = process.argv.slice(2);
const valueFlags = ['--routes', '--crawl', '--session', '--profile', '--out', '--widths', '--samples'];
const target = args.find((a, i) => !a.startsWith('--') && !valueFlags.includes(args[i - 1]));
const flag = n => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
if (!target) { console.error('usage: node <skill>/scripts/samples.mjs <index.html|url> [--crawl crawl.json] [--routes ...] [--samples 5] [--widths 1280,390] [--profile dir] [--session file] [--out dir]'); process.exit(2); }
const outDir = resolve(flag('--out') || join('docs', 'shipright', 'audits', 'current', 'samples'));
mkdirSync(outDir, { recursive: true });
const { session, profile } = signInFlags(args, 'samples');
const N = Math.max(1, Number(flag('--samples') || 5));
const widths = widthsFlag(args);
const MAX_SHOT_PX = 6000, MAX_LISTS = 8;
const RISKY_HREF = /delete|remove|destroy|log-?out|sign-?out|archive|unsubscribe|export|download|revoke|disconnect|share|publish|duplicate/i;

const site = await openTarget(target, 'samples');
const opened = await openContext({ session, profile, name: 'samples', url: site.startUrl, viewport: viewportFor(widths[0]) });
const page = opened.page;
const urls = pagesToVisit({ startUrl: site.startUrl, remote: site.remote, routes: flag('--routes'), crawl: flag('--crawl'), name: 'samples' });
const local = u => u.replace(/^https?:\/\/127\.0\.0\.1:\d+/, '');

// Links that sit in a navigation, a side panel, a list or a table.
const LINKS = () => {
  const text = el => (el.innerText || el.textContent || el.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim();
  return [...document.querySelectorAll('nav a[href], aside a[href], ul a[href], ol a[href], table a[href], [role=navigation] a[href], [role=list] a[href], [role=listbox] a[href], [role=grid] a[href], [role=tree] a[href]')]
    .filter(a => a.origin === location.origin && !a.hasAttribute('download'))
    .map(a => ({ href: a.href, text: text(a).slice(0, 80) }));
};
// How much a page holds that is worth checking. Higher is better.
const RICHNESS = () => {
  const main = document.querySelector('main') || document.body;
  const big = el => { const r = el.getBoundingClientRect(); return r.width >= 48 && r.height >= 48; };
  const n = sel => main.querySelectorAll(sel).length;
  const images = [...main.querySelectorAll('img')].filter(i => big(i) || (i.complete && i.naturalWidth === 0)).length;
  const media = n('video, audio, canvas, iframe, object, embed');
  const code = n('pre, code');
  const files = n('a[download], [class*=attachment i], [class*=artifact i], [class*=file i], [class*=document i], [data-file], [data-artifact]');
  const tools = n('[class*=tool i], [class*=connector i], [class*=source i], [class*=citation i], [data-tool], [data-connector], details');
  const loaders = [...main.querySelectorAll('button, [role=button]')].filter(b => /\b(load|show) (the |this )?(image|photo|picture|video|media|preview)|to load\b/i.test(b.innerText || '')).length;
  return { score: images * 3 + media * 3 + loaders * 5 + files * 2 + tools * 2 + Math.min(code, 5), images, media, code, files, tools, words: (main.innerText || '').split(/\s+/).length };
};
// Scroll through the whole page so lazy images get their chance to load, then go back to the top.
const SCROLL = async () => {
  const el = document.scrollingElement || document.documentElement;
  const boxes = [el, ...[...document.querySelectorAll('main, [class*=scroll i], [class*=messages i], [class*=thread i]')].filter(x => x.scrollHeight > x.clientHeight + 40 && /auto|scroll/.test(getComputedStyle(x).overflowY))];
  for (const box of boxes.slice(0, 4)) {
    for (let y = 0; y < Math.min(box.scrollHeight, 30000); y += Math.max(200, box.clientHeight * 0.8)) { box.scrollTop = y; await new Promise(r => setTimeout(r, 80)); }
    box.scrollTop = box.scrollHeight; await new Promise(r => setTimeout(r, 150)); box.scrollTop = 0;
  }
  scrollTo(0, 0);
};

const lists = [], items = [], findings = [];
let n = 0;
try {
  // 1. Find the item lists.
  await page.setViewportSize(viewportFor(widths[0]));
  const byPattern = new Map();
  for (const url of urls) {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => null);
    await settle(page);
    for (const l of await page.evaluate(LINKS).catch(() => [])) {
      const href = normUrl(l.href), pat = linkPattern(href);
      if (!pat || RISKY_HREF.test(new URL(href).pathname + new URL(href).hash) || DANGER.test(l.text)) continue;
      if (!byPattern.has(pat)) byPattern.set(pat, { pattern: pat, found_on: local(url), links: new Map() });
      const list = byPattern.get(pat);
      if (!list.links.has(href)) list.links.set(href, l.text);
    }
  }
  const found = [...byPattern.values()].filter(l => l.links.size >= 2).sort((a, b) => b.links.size - a.links.size);
  // 2. In each list, look at up to 3 x N items and keep the N with the most to check.
  let listNo = 0;
  for (const list of found.slice(0, MAX_LISTS)) {
    listNo++;
    const candidates = [...list.links].slice(0, Math.min(3 * N, 15));
    const scored = [];
    for (const [href, text] of candidates) {
      const ok = await page.goto(href, { waitUntil: 'domcontentloaded', timeout: 20000 }).then(r => !r || r.status() < 400).catch(() => false);
      if (!ok) continue;
      await settle(page, { timeout: 6000 });
      const rich = await page.evaluate(RICHNESS).catch(() => null);
      if (rich) scored.push({ href, text, ...rich });
    }
    const kept = scored.map((s, i) => ({ ...s, i })).sort((a, b) => b.score - a.score || a.i - b.i).slice(0, N).sort((a, b) => a.i - b.i);
    lists.push({ list: listNo, pattern: list.pattern, found_on: list.found_on, items_in_list: list.links.size, looked_at: scored.length, opened: kept.length });
    kept.forEach((k, j) => items.push({ list: listNo, item: j + 1, url: k.href, title: k.text, holds: { images: k.images, media: k.media, code: k.code, files: k.files, tool_results: k.tools, words: k.words }, shots: {}, settled: true }));
  }
  // 3. On each kept item, at each width: scroll, screenshot, check.
  for (const width of widths) {
    await page.setViewportSize(viewportFor(width));
    for (const it of items) {
      await page.goto(it.url, { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => null);
      if (!(await settle(page))) it.settled = false;
      await page.evaluate(SCROLL).catch(() => {});
      await settle(page, { timeout: 4000 });
      const file = `R-${it.list}-${it.item}-${width}.png`;
      const full = await page.evaluate(() => Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight || 0)).catch(() => 800);
      await page.screenshot({ path: join(outDir, file), fullPage: true, clip: { x: 0, y: 0, width, height: Math.min(full, MAX_SHOT_PX) } }).catch(() => page.screenshot({ path: join(outDir, file) }).catch(() => null));
      it.shots[width] = file;
      const a = await page.evaluate(analyzeScript({ results: true })).catch(() => ({ findings: [] }));
      const seenHere = new Set();
      for (const f of a.findings) {
        if (seenHere.has(f.kind + f.what)) continue;
        seenHere.add(f.kind + f.what);
        const id = `R${String(++n).padStart(2, '0')}`;
        const shot = `${id}-${f.kind}-${width}.png`;
        if (f.mark) await page.locator(`[data-srv="${f.mark}"]`).first().screenshot({ path: join(outDir, shot), timeout: 5000 }).catch(() => null);
        findings.push({ id, page: it.url, width, kind: f.kind, what: f.what, group: f.group, detail: f.detail, shot: existsSync(join(outDir, shot)) ? shot : file });
      }
    }
  }
} finally {
  await opened.close();
  site.stop();
}

const leads = mergeLeads(findings, widths, local);
leads.forEach((l, i) => { l.id = `R${String(i + 1).padStart(2, '0')}`; });
const outItems = items.map(it => ({ ...it, url: local(it.url) }));
writeFileSync(join(outDir, 'samples.json'), JSON.stringify({ target, widths, samples_per_list: N, signed_in_with: opened.mode !== 'none' ? opened.label : null, lists, items: outItems, leads }, null, 2) + '\n');
const md = ['# Existing results, opened read-only', '',
  `${lists.length} item list(s), ${items.length} item(s) opened at ${widths.join(' and ')} wide${opened.mode !== 'none' ? `, signed in with ${opened.label}` : ''}, ${leads.length} lead(s).`, '',
  'Nothing was clicked or typed: each item was opened by its address and scrolled. Every lead below goes in the pain map\'s **Script leads** table (R##): a pain ID, or Rejected with what you saw. Look at each page screenshot too: the scripts cannot judge whether a result looks right.', ''];
if (!lists.length) md.push('> **No item lists found.** No links in a navigation, side panel, list or table share a pattern like "/chat/*". If past items are opened by buttons, open 3 to 5 of them by hand at 1280 and 390, run the page checks there, and say so in the header.', '');
const unsettled = outItems.filter(i => !i.settled).map(i => i.url);
if (unsettled.length) md.push(`> **Still loading:** ${unsettled.join(', ')} kept changing for 10 seconds. Leads there may describe the loading state.`, '');
md.push('## Leads', '', '| Lead | Check | What it found | Widths | Items | Screenshot |', '| --- | --- | --- | --- | --- | --- |',
  ...(leads.length ? leads.map(l => `| ${l.id} | ${l.kind} | ${l.what.replace(/\|/g, '/')} | ${l.widths.join(', ')} | ${l.pages.join(', ')} | ${l.shot || 'none'} |`) : ['| none | | No problems measured on the opened items | | | |']),
  '', '## Item lists', '', '| List | Pattern | Found on | Items in the list | Looked at | Opened |', '| --- | --- | --- | --- | --- | --- |',
  ...lists.map(l => `| ${l.list} | ${l.pattern} | ${l.found_on} | ${l.items_in_list} | ${l.looked_at} | ${l.opened} |`),
  '', '## Items opened', '', '| List | Item | Title | Holds | Screenshots |', '| --- | --- | --- | --- | --- |',
  ...outItems.map(i => `| ${i.list} | ${i.url} | ${(i.title || '').replace(/\|/g, '/')} | ${Object.entries(i.holds).filter(([k, v]) => v && k !== 'words').map(([k, v]) => `${v} ${k.replace('_', ' ')}`).join(', ') || 'text only'} | ${Object.values(i.shots).join(', ')} |`));
writeFileSync(join(outDir, 'samples.md'), md.join('\n') + '\n');
console.log(`samples: ${lists.length} item list(s), ${items.length} item(s) opened at ${widths.join(' and ')} wide, ${leads.length} lead(s) · ${outDir}`);
