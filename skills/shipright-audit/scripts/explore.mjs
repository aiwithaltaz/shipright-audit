#!/usr/bin/env node
// Open every safe control on each page, the way a curious first-time user would, and record what happens.
// Audits miss what they never open: a dialog behind an icon, a button that does nothing, a feature that
// throws an error the moment you touch it. This finds them.
// Usage: node <skill>/scripts/explore.mjs <index.html|url> [--crawl crawl.json] [--routes "#/,/settings"]
//        [--widths 1280,390] [--profile dir] [--session session.json] [--out dir] [--max 40]
//        [--allow "Bookmark,Handoff"]
// --widths: both 1280 and 390 run by default. At the first width every control is explored. At the next
// widths it explores the controls that only exist there (a phone menu button, a bottom bar) and opens
// again whatever opened a dialog, menu or panel, so each one is also seen and screenshotted on phone.
// Text that is cut off inside an opened dialog, menu or panel is reported as a lead.
// --profile / --session: stay signed in (see crawl.mjs). The profile is tried first. If the app no longer
// knows us it stops with exit 3 and never explores signed out by accident.
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
import { openContext, signInFlags, openTarget, pagesToVisit, widthsFlag, viewportFor, analyzeScript, mergeLeads, settle, DANGER } from './browser.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';

const args = process.argv.slice(2);
const valueFlags = ['--routes', '--crawl', '--session', '--profile', '--out', '--max', '--allow', '--widths'];
const target = args.find((a, i) => !a.startsWith('--') && !valueFlags.includes(args[i - 1]));
const flag = n => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
if (!target) { console.error('usage: node <skill>/scripts/explore.mjs <index.html|url> [--crawl crawl.json] [--routes ...] [--widths 1280,390] [--profile dir] [--session file] [--out dir] [--max 40] [--allow "Label,Label"]'); process.exit(2); }
const outDir = resolve(flag('--out') || join('docs', 'shipright', 'audits', 'current', 'explore'));
mkdirSync(outDir, { recursive: true });
const { session, profile } = signInFlags(args, 'explore');
const MAX = Number(flag('--max') || 40);
const allow = (flag('--allow') || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
const widths = widthsFlag(args);
const OPENER = /\b(open|menu|more|options|settings|preferences|filter|sort|view|show|details|info|help|select|choose|picker|model|attach|tools|add|new|create|expand|collapse|sidebar|panel|search|budget|usage|context|account|profile|switch|tab|history|notifications?|microphone|voice|dictat\w*|speech|help)\b/i;
const CONTROLS = 'button, [role=button], [role=tab], summary, [aria-haspopup]:not(a)';
// Layers a control can open. Text checks after a click look only inside these.
const LAYERS = '[role=dialog], [role=alertdialog], [aria-modal=true], dialog[open], [role=menu], [role=listbox], [popover], [data-state=open]';

// What is open right now: dialogs, menus, pop-overs, the URL and how much text the page shows.
const STATE = () => {
  const vis = el => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 20 && r.height > 20 && s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) > 0.05; };
  const open = [...document.querySelectorAll('[role=dialog], [role=alertdialog], [aria-modal=true], dialog[open], [role=menu], [role=listbox], [role=tooltip], [popover], [data-state=open]')]
    .filter(vis).map(el => (el.getAttribute('role') || el.tagName.toLowerCase()) + ':' + (el.getAttribute('aria-label') || (el.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 40)));
  return { url: location.href, open, text: (document.body?.innerText || '').length };
};

const site = await openTarget(target, 'explore');
const remote = site.remote;
const ctx = await openContext({ session, profile, name: 'explore', url: site.startUrl, viewport: viewportFor(widths[0]) });
const page = ctx.page;
let errs = [];
page.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 200)); });
page.on('pageerror', e => errs.push(e.message.slice(0, 200)));
page.on('response', r => { if (r.status() >= 400 && !/favicon/.test(r.url())) errs.push(`${r.status()} ${r.request().method()} ${r.url().replace(/^https?:\/\/[^/]+/, '').slice(0, 120)}`); });
page.on('requestfailed', r => errs.push(`failed ${r.method()} ${r.url().replace(/^https?:\/\/[^/]+/, '').slice(0, 120)}`));
let picker = false;
page.on('filechooser', () => { picker = true; }); // listening stops the real picker from opening
page.on('dialog', d => d.dismiss().catch(() => {}));

const urls = pagesToVisit({ startUrl: site.startUrl, remote, routes: flag('--routes'), crawl: flag('--crawl'), name: 'explore' });
const local = u => u.replace(/^https?:\/\/127\.0\.0\.1:\d+/, '');
const rows = [], found = [];
let shotN = 0;
// One entry per control (its name, and whether it is icon-only), with what it did at the first width it was seen.
const explored = new Map();
const lead = (kind, what, pageUrl, width, shot, extra = {}) => found.push({ kind, what, page: pageUrl, width, shot: shot || null, ...extra });
const markControls = () => page.evaluate(sel => { document.querySelectorAll(sel).forEach((el, i) => { el.dataset.sre = String(i); }); }, CONTROLS).catch(() => {});

try {
  for (const width of widths) {
    const firstWidth = width === widths[0];
    const phone = width <= 500;
    await page.setViewportSize(viewportFor(width));
    const seenHere = new Set();
    for (const url of urls) {
      const routeId = (new URL(url).hash || new URL(url).pathname).replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').slice(0, 30) || 'home';
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => null);
      await settle(page);
      const controls = await page.evaluate((args) => {
        const [danger, opener, allow, isRemote, sel] = args;
        const D = new RegExp(danger, 'i'), O = new RegExp(opener, 'i');
        const vis = el => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
        const out = [];
        document.querySelectorAll(sel).forEach((el, i) => {
          el.dataset.sre = String(i);
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
          const r = el.getBoundingClientRect();
          out.push({ i, name: name || '(no name)', iconOnly, hasName: !!name, click, why, y: Math.round(r.top) });
        });
        return out;
      }, [DANGER.source, OPENER.source, allow, remote, CONTROLS]);

      let clicked = 0;
      for (const c of controls) {
        const key = `${c.name}|${c.iconOnly}`;
        if (seenHere.has(key)) continue; // the same control on another page was already explored at this width
        seenHere.add(key);
        const earlier = explored.get(key);
        // At a later width, open again only what opened a layer before, to see that layer at this width too.
        if (earlier && !/^opened (?!a file picker)/.test(earlier.result || '')) continue;
        const row = { page: local(url), width, control: c.name, icon_only: c.iconOnly, tooltip: null, result: null, errors: [], shot: null };
        const sel = `[data-sre="${c.i}"]`;
        if (!earlier) {
          explored.set(key, row);
          // Hover icon-only controls: what does a user learn before clicking? A phone has no hover, so
          // there only the name for screen readers is checked.
          if (c.iconOnly && !phone) {
            await page.hover(sel, { timeout: 2000 }).catch(() => null);
            await page.waitForTimeout(700);
            row.tooltip = await page.evaluate(s => {
              const el = document.querySelector(s); if (!el) return null;
              const tip = [...document.querySelectorAll('[role=tooltip], [data-tooltip], .tooltip, [class*=tooltip i]')].find(t => { const r = t.getBoundingClientRect(); return r.width > 0 && r.height > 0 && (t.innerText || '').trim(); });
              return tip ? tip.innerText.trim().slice(0, 60) : (el.getAttribute('title') || null);
            }, sel).catch(() => null);
            await page.mouse.move(0, 0).catch(() => {});
            if (!row.tooltip) lead('no-tooltip', `Icon-only control "${c.name}" shows no tooltip on hover${c.hasName ? '' : ' and has no name for screen readers'}`, url, width);
          } else if (c.iconOnly && !c.hasName) lead('no-name', `An icon-only control has no name for screen readers`, url, width);
          if (!c.click) { row.result = `not clicked: ${c.why}`; rows.push(row); continue; }
        }
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
          row.shot = `E${String(++shotN).padStart(3, '0')}-${routeId}-${c.name.replace(/[^a-z0-9]+/gi, '-').slice(0, 24)}${firstWidth ? '' : `-${width}`}.png`;
          await page.screenshot({ path: join(outDir, row.shot) }).catch(() => { row.shot = null; });
        }
        // Look inside what opened: is any of its text cut off at this width?
        if (newOpen.length && !picker) {
          const inside = await page.evaluate(analyzeScript({ within: LAYERS, only: ['clipped-text'] })).catch(() => ({ findings: [] }));
          for (const f of inside.findings) lead('clipped-text', `Inside "${c.name}": ${f.what}`, url, width, row.shot, { group: `${c.name}|${f.group}`, detail: f.detail });
        }
        if (!earlier) {
          if (row.result === 'nothing visible happened' && !row.errors.length) lead('dead-control', `"${c.name}" did nothing visible when clicked`, url, width);
          if (row.errors.length) lead('error-on-click', `Clicking "${c.name}" caused ${row.errors.length} error(s): ${row.errors[0]}`, url, width, row.shot);
        }
        rows.push(row);
        // Put the page back.
        await page.keyboard.press('Escape').catch(() => {});
        await page.waitForTimeout(200);
        const now = await page.evaluate(STATE).catch(() => before);
        if (now.url !== before.url || now.open.some(o => !before.open.includes(o))) {
          await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => null);
          await settle(page, { timeout: 6000 });
          await markControls(); // data-sre marks are gone after a reload: mark again in the same order
        }
      }
    }
  }
} finally {
  await ctx.close();
  site.stop();
}

// The same lead on several pages or widths is one lead. Hover and dead-control leads are found once, at
// the first width a control is seen, so they do not say "at 1280 only".
const merged = mergeLeads(found.map((f, i) => ({ ...f, id: `E${i}` })), widths, local);
merged.forEach((l, i) => { l.id = `E${String(i + 1).padStart(2, '0')}`; if (!['clipped-text', 'no-name'].includes(l.kind)) l.what = l.what.replace(/ \(at \d+ wide only\)$/, ''); });
const unique = [...explored.values()];
const wasClicked = r => !/^not clicked|^could not click/.test(r.result || '');
const openedCount = unique.filter(r => /^(opened|went|changed)/.test(r.result || '')).length;
const notClicked = unique.filter(r => /^not clicked/.test(r.result || ''));
const totals = { controls: unique.length, clicked: unique.filter(wasClicked).length, opened_something: openedCount, did_nothing: unique.filter(r => r.result === 'nothing visible happened').length, not_clicked: notClicked.length, caused_errors: unique.filter(r => r.errors.length).length };
writeFileSync(join(outDir, 'explore.json'), JSON.stringify({ target, widths, signed_in_with: ctx.mode !== 'none' ? ctx.label : null, totals, controls: rows, leads: merged }, null, 2) + '\n');
const md = ['# Explore: every safe control', '',
  `${totals.controls} control(s) at ${widths.join(' and ')} wide: ${totals.opened_something} opened something, ${totals.did_nothing} did nothing visible, ${totals.not_clicked} not clicked, ${totals.caused_errors} caused errors.`, '',
  `For the pain map header: **Controls opened: ${totals.clicked} of ${totals.controls}**`, '',
  'Open what you can of the **not clicked** list by hand when its name makes the effect clear and it cannot save, send or spend. Every lead below goes in the pain map\'s **Script leads** table.', '',
  '## Leads', '', '| Lead | Check | What it found | Widths | Pages |', '| --- | --- | --- | --- | --- |',
  ...(merged.length ? merged.map(l => `| ${l.id} | ${l.kind} | ${l.what.replace(/\|/g, '/')} | ${l.widths.join(', ')} | ${l.pages.join(', ')} |`) : ['| none | | | | |']),
  '', '## Controls', '', '| Page | Width | Control | Icon only | Tooltip | What happened | Errors | Screenshot |', '| --- | --- | --- | --- | --- | --- | --- | --- |',
  ...rows.map(r => `| ${r.page} | ${r.width} | ${r.control.replace(/\|/g, '/')} | ${r.icon_only ? 'yes' : ''} | ${r.tooltip || (r.icon_only && r.width > 500 ? 'none' : '')} | ${(r.result || '').replace(/\|/g, '/')} | ${r.errors.join('; ').replace(/\|/g, '/')} | ${r.shot || ''} |`)];
writeFileSync(join(outDir, 'explore.md'), md.join('\n') + '\n');
console.log(`explore: ${totals.controls} control(s), ${totals.opened_something} opened something, ${merged.length} lead(s), ${totals.not_clicked} not clicked · ${outDir}`);
