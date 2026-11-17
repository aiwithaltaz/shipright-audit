#!/usr/bin/env node
// Open existing results, read-only: past chats, library items, projects and files the owner already has.
// The owner's own data is the best test data. A generated image that never shows, a reply footer cut
// off on phone, an action row of unnamed icons: these only appear on a page that holds a real result.
// Usage: node <skill>/scripts/samples.mjs <index.html|url> --audit <audit> [--routes "#/,/library"]
//        [--samples 5] [--widths 1280,390]
//        (older form, still works: [--crawl crawl.json] [--profile dir] [--session session.json] [--out dir])
// --audit: this audit's folder. The sign-in comes from <audit>/signin.json, the screens from
// <audit>/screens/crawl.json, and the results go to <audit>/samples.
// What it does, on the start page, --routes and every screen in --crawl:
//   1. Finds item lists: links inside nav, aside, lists and tables that share a pattern
//      ("/chat/abc" and "/chat/xyz" are both "/chat/*").
//   2. Looks at up to 2 x N + 2 items per list, and keeps the N (default 5) whose page holds the most to
//      check: images, video, files, code, artifacts, tool and connector results.
//   3. On each kept item, at 1280 and at 390 wide: scrolls through it, saves a full-page screenshot and
//      runs the page checks (analyze-page.js) plus the result checks: media that never loaded (a broken
//      image, a dead video, a "click to load image" placeholder), clipped text, and action buttons with
//      no name.
//   4. Lists with no item links (cards that open through buttons): it opens up to N items per list
//      through a read-only button on each card: View, Open, Preview, Details, Review, Watch, or an icon
//      button whose name says so. After each click it records what opened (a dialog, a panel, a new
//      page, or nothing), screenshots it at 1280 and 390, runs the checks on what opened, then closes
//      it or goes back. A View or Review button that opens nothing is a lead ("nothing-opened").
//      It never clicks Edit (editors autosave) and never a risky word.
// Read-only: it opens a link by its address and scrolls. The only thing it clicks is a read-only button
// on a card, as above. It never types anything, and it skips links and buttons whose words or address
// look risky (delete, sign out, export... see DANGER in browser.mjs).
// --profile / --session: stay signed in (see crawl.mjs). It stops with exit 3 if the app no longer knows us.
// Writes samples.json, samples.md, R-<list>-<item>-<width>.png page screenshots and R##-*.png crops to
// --out (the skill passes <audit>/samples). Leads are R##: decide each one in the pain map's Script leads.
// Exit 0 ran, 2 usage or missing Playwright, 3 the app signed us out.
import { openContext, signInFlags, openTarget, pagesToVisit, widthsFlag, viewportFor, analyzeScript, mergeLeads, linkPattern, settle, normUrl, auditPaths, landedOn, shootFinding, DANGER } from './browser.mjs';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';

const args = process.argv.slice(2);
const valueFlags = ['--routes', '--crawl', '--session', '--profile', '--out', '--widths', '--samples', '--audit'];
const target = args.find((a, i) => !a.startsWith('--') && !valueFlags.includes(args[i - 1]));
const flag = n => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
if (!target) { console.error('usage: node <skill>/scripts/samples.mjs <index.html|url> --audit <audit folder> [--routes ...] [--samples 5] [--widths 1280,390] [--crawl crawl.json] [--profile dir] [--session file] [--out dir]'); process.exit(2); }
const paths = auditPaths(args, 'samples');
const outDir = paths.out;
mkdirSync(outDir, { recursive: true });
const { session, profile, landed } = signInFlags(args, 'samples');
const N = Math.max(1, Number(flag('--samples') || 5));
const widths = widthsFlag(args);
const MAX_SHOT_PX = 6000, MAX_LISTS = 6;
const RISKY_HREF = /delete|remove|destroy|log-?out|sign-?out|archive|unsubscribe|export|download|revoke|disconnect|share|publish|duplicate/i;
// Buttons that only show an item. Never Edit: editors autosave. Never a word that makes or removes something.
const OPEN_WORDS = /\b(view|open|preview|details?|review|watch)\b/i;
const NOT_READ_ONLY = /\bedit|\b(new|create|add|make|copy|move|import|upload|reply|comment|assign|start|run|apply|confirm|complete|close|cancel|reset|clear|undo|restore|renew|settings?)\b/i;
const MAX_BUTTON_LISTS = 3;
const LAYERS = '[role=dialog], [role=alertdialog], [aria-modal=true], dialog[open], [role=menu], [role=listbox], [popover], [data-state=open]';
const RESULT_KINDS = ['clipped-text', 'media-not-loaded', 'unnamed-action', 'template-text'];

const site = await openTarget(target, 'samples');
const opened = await openContext({ session, profile, name: 'samples', url: landedOn(landed, site.startUrl) || site.startUrl, viewport: viewportFor(widths[0]) });
const page = opened.page;
const urls = pagesToVisit({ startUrl: site.startUrl, remote: site.remote, routes: flag('--routes'), crawl: paths.crawl, landed, name: 'samples' });
const local = u => u.replace(/^https?:\/\/127\.0\.0\.1:\d+/, '');

// Links that sit in a navigation, a side panel, a list or a table.
const LINKS = () => {
  const text = el => (el.innerText || el.textContent || el.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim();
  return [...document.querySelectorAll('nav a[href], aside a[href], ul a[href], ol a[href], table a[href], [role=navigation] a[href], [role=list] a[href], [role=listbox] a[href], [role=grid] a[href], [role=tree] a[href]')]
    .filter(a => a.origin === location.origin && !a.hasAttribute('download'))
    .map(a => ({ href: a.href, text: text(a).slice(0, 80) }));
};
// Cards that open through a button, not a link: repeated items (2 or more side by side or in a list)
// that each hold a read-only button. Marks each button so it can be clicked, in page order, so the
// same mark means the same button after a reload.
const CARD_BUTTONS = ([openSrc, notSrc, dangerSrc]) => {
  const OPEN = new RegExp(openSrc, 'i'), NOT = new RegExp(notSrc, 'i'), D = new RegExp(dangerSrc, 'i');
  const vis = el => { const r = el.getBoundingClientRect(); const st = getComputedStyle(el); return r.width > 0 && r.height > 0 && st.visibility !== 'hidden' && st.display !== 'none'; };
  const text = el => (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
  const nameOf = el => { const t = text(el); return (/[\p{L}\p{N}]/u.test(t) ? t : (el.getAttribute('aria-label') || el.getAttribute('title') || (el.querySelector('svg title') || {}).textContent || '')).trim().slice(0, 60); };
  const isControl = el => el.matches('button, a, [role=button], input, select, textarea, label');
  document.querySelectorAll('[data-srb]').forEach(el => el.removeAttribute('data-srb'));
  // The card of a button: the nearest ancestor that is one of 2 or more same-tag siblings that each hold a button.
  const cardOf = b => {
    for (let el = b.parentElement; el && el !== document.body; el = el.parentElement) {
      if (isControl(el) || !el.parentElement) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 120 || r.height < 24) continue;
      const peers = [...el.parentElement.children].filter(x => x !== el && x.tagName === el.tagName && vis(x) && x.querySelector('button, [role=button]'));
      if (peers.length) return el;
    }
    return null;
  };
  const groups = new Map();
  for (const b of document.querySelectorAll('button, [role=button]')) {
    if (!vis(b) || b.disabled || b.getAttribute('aria-disabled') === 'true' || b.type === 'submit' && b.closest('form')) continue;
    if (b.closest('[role=dialog], [role=menu], dialog, nav, header, footer')) continue;
    const name = nameOf(b);
    if (!name || !OPEN.test(name) || NOT.test(name) || D.test(name)) continue;
    const card = cardOf(b);
    if (!card) continue;
    const g = groups.get(card.parentElement) || { parent: card.parentElement, cards: new Map() };
    groups.set(card.parentElement, g);
    if (!g.cards.has(card)) g.cards.set(card, { card, button: b, name });
  }
  const out = [];
  let gi = 0;
  for (const g of groups.values()) {
    if (g.cards.size < 2) continue;
    const order = [...g.parent.children];
    const cards = [...g.cards.values()].map(c => {
      const i = order.indexOf(c.card);
      c.button.dataset.srb = `${gi}-${i}`;
      const head = c.card.querySelector('h1, h2, h3, h4, h5, h6, [class*=title i], [class*=name i], strong, b, th');
      return { i, mark: `${gi}-${i}`, name: c.name, title: text(head || c.card).slice(0, 80), links: [...c.card.querySelectorAll('a[href]')].map(a => a.href), words: text(c.card).split(/\s+/).length };
    });
    out.push({ g: gi++, key: `${g.parent.tagName}|${cards.map(c => c.title).join('|').slice(0, 300)}`, cards });
  }
  return out;
};
// What is open right now: layers, the address and how much text the page shows.
const STATE = layers => {
  const vis = el => { const r = el.getBoundingClientRect(); const st = getComputedStyle(el); return r.width > 20 && r.height > 20 && st.visibility !== 'hidden' && st.display !== 'none' && Number(st.opacity) > 0.05; };
  const open = [...document.querySelectorAll(layers)].filter(vis).map(el => (el.getAttribute('role') || el.tagName.toLowerCase()) + ':' + (el.getAttribute('aria-label') || (el.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 40)));
  return { url: location.href, open, text: (document.body?.innerText || '').length };
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

// Open one card through its read-only button, look at what opened, then close it or go back.
async function openByButton(it, width) {
  await page.evaluate(CARD_BUTTONS, [OPEN_WORDS.source, NOT_READ_ONLY.source, DANGER.source]).catch(() => []);
  const sel = `[data-srb="${it.mark}"]`;
  const file = `R-${it.list}-${it.item}-${width}.png`;
  const shown = await page.locator(sel).first().isVisible().catch(() => false);
  if (!shown) { it.opened[width] = 'button not shown at this width'; return; }
  const base = await page.evaluate(analyzeScript({ results: true, only: RESULT_KINDS })).catch(() => ({ findings: [] }));
  const before = await page.evaluate(STATE, LAYERS).catch(() => ({ url: page.url(), open: [], text: 0 }));
  if (!(await page.click(sel, { timeout: 4000 }).then(() => true).catch(() => false))) { it.opened[width] = 'could not click (covered or moved)'; return; }
  await settle(page, { timeout: 6000 });
  const after = await page.evaluate(STATE, LAYERS).catch(() => before);
  const fresh = after.open.filter(o => !before.open.includes(o));
  const went = normUrl(after.url) !== normUrl(before.url);
  it.opened[width] = went ? `a new page: ${local(after.url)}`
    : fresh.some(o => /^(dialog|alertdialog)/.test(o)) || fresh.length && !fresh.some(o => /^(menu|listbox)/.test(o)) ? 'a dialog'
    : fresh.length ? 'a menu'
    : after.text - before.text > 40 ? 'a panel' : 'nothing';
  if (went) { await page.evaluate(SCROLL).catch(() => {}); await settle(page, { timeout: 4000 }); }
  const full = await page.evaluate(() => Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight || 0)).catch(() => 800);
  await page.screenshot({ path: join(outDir, file), fullPage: true, clip: { x: 0, y: 0, width, height: Math.min(full, MAX_SHOT_PX) } }).catch(() => page.screenshot({ path: join(outDir, file) }).catch(() => null));
  it.shots[width] = file;
  if (it.opened[width] === 'nothing') {
    // The same button doing nothing at both widths is one lead.
    findings.push({ id: `R${String(++n).padStart(2, '0')}`, page: it.url, width, kind: 'nothing-opened', what: `"${it.via_button}" on "${it.title.slice(0, 50)}" opened nothing: no dialog, no panel and no new page`, group: `nothing-opened|${it.list}|${it.item}`, detail: { button: it.via_button, item: it.title, list: it.list, item_no: it.item }, shot: file });
  } else {
    // Check what opened. On the same page (a dialog or a panel) only what is new counts: the list
    // behind it is checked by visual.mjs.
    const a = await page.evaluate(analyzeScript(went ? { results: true } : { results: true, only: RESULT_KINDS })).catch(() => ({ findings: [] }));
    const known = new Set(went ? [] : base.findings.map(f => f.kind + f.what));
    const seenHere = new Set();
    for (const f of a.findings) {
      if (known.has(f.kind + f.what) || seenHere.has(f.kind + f.what)) continue;
      seenHere.add(f.kind + f.what);
      const id = `R${String(++n).padStart(2, '0')}`;
      const shot = `${id}-${f.kind}-${width}.png`;
      await shootFinding(page, f, join(outDir, shot));
      findings.push({ id, page: it.url, width, kind: f.kind, what: `In what "${it.via_button}" opened on "${it.title.slice(0, 40)}": ${f.what}`, group: `${it.list}|${it.item}|${f.group || f.what}`, detail: f.detail, shot: existsSync(join(outDir, shot)) ? shot : file });
    }
  }
  // Close it or go back. The next item loads the list page again anyway.
  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(150);
}

const lists = [], items = [], findings = [], buttonLists = [];
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
    // Cards that open through a button on this page. Which of them also have an item link is decided below.
    for (const g of await page.evaluate(CARD_BUTTONS, [OPEN_WORDS.source, NOT_READ_ONLY.source, DANGER.source]).catch(() => [])) {
      if (!buttonLists.some(b => b.key === g.key)) buttonLists.push({ ...g, url });
    }
  }
  const found = [...byPattern.values()].filter(l => l.links.size >= 2).sort((a, b) => b.links.size - a.links.size);
  // 2. In each list, look at up to 2 x N + 2 items and keep the N with the most to check.
  let listNo = 0;
  for (const list of found.slice(0, MAX_LISTS)) {
    listNo++;
    const candidates = [...list.links].slice(0, Math.min(2 * N + 2, 12));
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
  // 4. Lists with no item links: open items through the read-only button on each card.
  const itemHrefs = new Set(found.flatMap(l => [...l.links.keys()]));
  const viaButtons = buttonLists.map(b => ({ ...b, cards: b.cards.filter(c => !c.links.some(h => itemHrefs.has(normUrl(h)))) })).filter(b => b.cards.length >= 2).slice(0, MAX_BUTTON_LISTS);
  for (const b of viaButtons) {
    listNo++;
    const kept = b.cards.slice(0, N);
    lists.push({ list: listNo, pattern: `cards opened by a button: ${[...new Set(b.cards.map(c => c.name))].slice(0, 4).join(', ')}`, found_on: local(b.url), items_in_list: b.cards.length, looked_at: kept.length, opened: kept.length, by: 'buttons' });
    kept.forEach((c, j) => items.push({ list: listNo, item: j + 1, url: b.url, title: c.title, via_button: c.name, mark: c.mark, opened: {}, holds: {}, shots: {}, settled: true }));
  }
  // 3. On each kept item, at each width: scroll, screenshot, check.
  for (const width of widths) {
    await page.setViewportSize(viewportFor(width));
    for (const it of items) {
      await page.goto(it.url, { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => null);
      if (!(await settle(page))) it.settled = false;
      if (it.via_button) { await openByButton(it, width); continue; }
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
        await shootFinding(page, f, join(outDir, shot));
        findings.push({ id, page: it.url, width, kind: f.kind, what: f.what, group: f.group, detail: f.detail, shot: existsSync(join(outDir, shot)) ? shot : file });
      }
    }
  }
} finally {
  await opened.close();
  site.stop();
}

const leads = mergeLeads(findings, widths, local);
leads.forEach((l, i) => {
  l.id = `R${String(i + 1).padStart(2, '0')}`;
  // "At 1280 wide only" is only true when the button was pressed at the other width and opened something there.
  if (l.kind !== 'nothing-opened') return;
  const it = items.find(x => x.list === l.detail.list && x.item === l.detail.item_no);
  if (it && !Object.values(it.opened).some(v => /^a /.test(v))) l.what = l.what.replace(/ \(at \d+ wide only\)$/, '');
});
const outItems = items.map(({ mark, ...it }) => ({ ...it, url: local(it.url) }));
const byButton = outItems.filter(i => i.via_button);
writeFileSync(join(outDir, 'samples.json'), JSON.stringify({ target, widths, samples_per_list: N, signed_in_with: opened.mode !== 'none' ? opened.label : null, lists, items: outItems, leads }, null, 2) + '\n');
const md = ['# Existing results, opened read-only', '',
  `${lists.length} item list(s), ${items.length} item(s) opened at ${widths.join(' and ')} wide${opened.mode !== 'none' ? `, signed in with ${opened.label}` : ''}, ${leads.length} lead(s).`, '',
  (byButton.length ? `Nothing was typed. ${outItems.length - byButton.length} item(s) were opened by their address and scrolled. ${byButton.length} item(s) have no link, so each was opened through the read-only button on its card (${[...new Set(byButton.map(i => `"${i.via_button}"`))].join(', ')}), then closed. No Edit button and no risky word was clicked.` : 'Nothing was clicked or typed: each item was opened by its address and scrolled.') + ' Every lead below goes in the pain map\'s **Script leads** table (R##): a pain ID, or Rejected with what you saw. Look at each page screenshot too: the scripts cannot judge whether a result looks right.', ''];
if (!lists.length) md.push('> **No item lists found.** No links in a navigation, side panel, list or table share a pattern like "/chat/*", and no repeated cards hold a View, Open, Preview, Details, Review or Watch button. If past items open another way, open 3 to 5 of them by hand at 1280 and 390, run the page checks there, and say so in the header.', '');
const unsettled = outItems.filter(i => !i.settled).map(i => i.url);
if (unsettled.length) md.push(`> **Still loading:** ${unsettled.join(', ')} kept changing for 10 seconds. Leads there may describe the loading state.`, '');
md.push('## Leads', '', '| Lead | Check | What it found | Widths | Items | Screenshot |', '| --- | --- | --- | --- | --- | --- |',
  ...(leads.length ? leads.map(l => `| ${l.id} | ${l.kind} | ${l.what.replace(/\|/g, '/')} | ${l.widths.join(', ')} | ${l.pages.join(', ')} | ${l.shot || 'none'} |`) : ['| none | | No problems measured on the opened items | | | |']),
  '', '## Item lists', '', '| List | Pattern | Found on | Items in the list | Looked at | Opened |', '| --- | --- | --- | --- | --- | --- |',
  ...lists.map(l => `| ${l.list} | ${l.pattern} | ${l.found_on} | ${l.items_in_list} | ${l.looked_at} | ${l.opened} |`),
  '', '## Items opened', '', '| List | Item | Title | Holds, or what the button opened | Screenshots |', '| --- | --- | --- | --- | --- |',
  ...outItems.map(i => `| ${i.list} | ${i.url} | ${(i.title || '').replace(/\|/g, '/')}${i.via_button ? ` (button "${i.via_button}")` : ''} | ${i.via_button ? Object.entries(i.opened).map(([w, v]) => `at ${w}: ${v}`).join(', ') : Object.entries(i.holds).filter(([k, v]) => v && k !== 'words').map(([k, v]) => `${v} ${k.replace('_', ' ')}`).join(', ') || 'text only'} | ${Object.values(i.shots).join(', ')} |`));
writeFileSync(join(outDir, 'samples.md'), md.join('\n') + '\n');
console.log(`samples: ${lists.length} item list(s), ${items.length} item(s) opened at ${widths.join(' and ')} wide, ${leads.length} lead(s) · ${outDir}`);
