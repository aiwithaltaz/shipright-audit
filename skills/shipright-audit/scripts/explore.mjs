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
// It also checks motion, at the first width:
//   - Layout shift on open: a menu or dialog should open over the page. If the page behind it jumps
//     (layout shift over 0.1), that is a lead.
//   - Reduced motion: once per page it switches the browser to "reduce motion", loads the page again
//     and opens one menu. Anything that still slides, zooms or spins without need is a lead.
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
// Switches (role=switch, checkboxes, aria-pressed buttons) are never flipped, unless you pass --use.
// --use: ONLY after the owner said yes to "use the app like a real user". It flips each switch in the
// menus it opens and on the page, waits for the page to settle, records what changed on screen (new
// chips or panels, text near the message box, the URL) with a screenshot before and after, then flips
// it back and checks it is back. A switch that adds something visible away from itself is a
// "toggle-side-effect" lead. It never flips switches on settings or account pages, or ones with risky
// or account-wide names (notifications, billing, privacy, sharing...), or ones that change one of the user's
// items (a checkbox on every row of a list, a bookmark): those need their own yes.
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
const USE = args.includes('--use');
const MAX_FLIPS = 12; // per page
const OPENER = /\b(open|menu|more|options|settings|preferences|filter|sort|view|show|details|info|help|select|choose|picker|model|attach|tools|add|new|create|expand|collapse|sidebar|panel|search|budget|usage|context|account|profile|switch|tab|history|notifications?|microphone|voice|dictat\w*|speech|help)\b/i;
const CONTROLS = 'button, [role=button], [role=tab], summary, [aria-haspopup]:not(a)';
// Layers a control can open. Text checks after a click look only inside these.
const LAYERS = '[role=dialog], [role=alertdialog], [aria-modal=true], dialog[open], [role=menu], [role=listbox], [popover], [data-state=open]';
const TOGGLES = '[role=switch], [role=menuitemcheckbox], [role=checkbox], input[type=checkbox], button[aria-pressed]';
// Switches that change the account, not the screen in front of the user. Never flipped.
const ACCOUNT_PLACE = /settings|preferences|account|billing|profile|admin|security|notification|privacy|team|members|integrations|workspace|organi[sz]ation/i;
const ACCOUNT_NAME = /notif|e-?mail|sms|billing|subscri|renew|two-factor|2fa|privacy|public|private|visib|sync|train|improve|telemetry|analytics|marketing|newsletter|cookie|backup|memory|remember|consent|terms|agree/i;
// Switches that change one of the user's items (a task ticked off, a bookmark), not how the screen works. Never flipped.
const ITEM_ACTION = /bookmark|mute|block|watch|up-?vote|down-?vote|react|complete|\bdone\b|resolve|\bhide\b|snooze|\bread\b|unread|\block\b|select (all|row|item)/i;

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
const toggles = [];
let flipN = 0;

// ---- --use: flip a switch, see what changed, flip it back ------------------------------------
// The switches in scope (inside the open layers, or on the page outside any layer), with their state.
const FIND_TOGGLES = ([sel, layers, inLayer]) => {
  const vis = el => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
  const text = el => (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
  const state = el => el.getAttribute('aria-checked') ?? el.getAttribute('aria-pressed') ?? (typeof el.checked === 'boolean' ? String(el.checked) : null) ?? (/^(checked|on)$/.test(el.dataset.state || '') ? 'true' : 'false');
  const out = [];
  document.querySelectorAll(sel).forEach((el, i) => {
    el.dataset.srt = String(i);
    const within = el.closest(layers);
    if (!!within !== inLayer || el.disabled || el.getAttribute('aria-disabled') === 'true') return;
    // A checkbox may be drawn by its label: accept either as visible.
    const label = el.labels?.[0] || el.closest('label');
    if (!vis(el) && !(label && vis(label))) return;
    const name = (el.getAttribute('aria-label') || text(el) || (label && text(label)) || text(el.closest('li, [role=menuitem], tr, div') || el) || '').slice(0, 60);
    const place = within ? (within.getAttribute('aria-label') || text(within.querySelector('h1, h2, h3, [role=heading]') || { innerText: '' })) : '';
    // A checkbox on each row of a list (tick a task, pick a row) is the user's data, not a setting.
    const row = within ? null : el.closest('li, tr, [role=row], [role=listitem], [role=option]');
    const perItem = !!row && !!row.parentElement && [...row.parentElement.children].filter(r => r.querySelector(sel) || r.matches(sel)).length >= 3;
    out.push({ i, name: name || '(no name)', state: state(el), place: place.slice(0, 60), clickLabel: !vis(el), perItem });
  });
  return out;
};
const TOGGLE_STATE = ([sel, name]) => {
  const text = el => (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
  const state = el => el.getAttribute('aria-checked') ?? el.getAttribute('aria-pressed') ?? (typeof el.checked === 'boolean' ? String(el.checked) : null) ?? (/^(checked|on)$/.test(el.dataset.state || '') ? 'true' : 'false');
  const el = [...document.querySelectorAll(sel)].find(x => { const label = x.labels?.[0] || x.closest('label'); return (x.getAttribute('aria-label') || text(x) || (label && text(label)) || text(x.closest('li, [role=menuitem], tr, div') || x) || '').slice(0, 60) === name; });
  if (!el) return null;
  el.dataset.srt = 'again';
  return { state: state(el), clickLabel: !(el.getBoundingClientRect().width > 0) };
};
// Every piece of visible text on screen, with where it sits: inside a layer, near the message box, or elsewhere.
const SURFACE = (layers) => {
  const vis = el => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) > 0.05; };
  const own = el => [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join(' ').replace(/\s+/g, ' ').trim();
  const boxes = [...document.querySelectorAll('textarea, [contenteditable="true"], [role=textbox], input[type=text], input:not([type])')].filter(vis).sort((a, b) => b.getBoundingClientRect().width * b.getBoundingClientRect().height - a.getBoundingClientRect().width * a.getBoundingClientRect().height);
  const box = boxes[0] || null;
  const zone = box ? (box.closest('form') || box.parentElement?.parentElement || box.parentElement) : null;
  const br = box ? box.getBoundingClientRect() : null;
  const near = el => { if (!box) return false; if (zone && zone.contains(el)) return true; const r = el.getBoundingClientRect(); return r.bottom > br.top - 90 && r.top < br.bottom + 90 && r.right > br.left - 20 && r.left < br.right + 20; };
  const out = {};
  for (const el of document.querySelectorAll('body *')) {
    const t = own(el);
    if (!t || t.length > 80 || !vis(el)) continue;
    const key = el.tagName + '|' + t;
    (out[key] ??= { text: t, n: 0, layer: !!el.closest(layers), near: near(el), toggle: !!el.closest('[data-srt]') });
    out[key].n++;
  }
  return { url: location.href, items: out, hasBox: !!box };
};

// Flip every allowed switch in scope. reopen() brings the layer back when flipping closed it.
async function flipToggles({ url, width, routeId, opener, reopen }) {
  const inLayer = !!opener;
  const list = await page.evaluate(FIND_TOGGLES, [TOGGLES, LAYERS, inLayer]).catch(() => []);
  const where = new URL(url).pathname + new URL(url).hash;
  for (const t of list) {
    const row = { page: local(url), width, opener: opener || null, switch: t.name, before: t.state, after: null, final: null, restored: null, flipped: false, added: [], removed: [], url_changed: false, errors: [], shots: {}, skipped: null };
    toggles.push(row);
    if (DANGER.test(t.name)) row.skipped = 'risky word';
    else if (ACCOUNT_NAME.test(t.name)) row.skipped = 'an account-wide setting: needs its own yes';
    else if (t.perItem || ITEM_ACTION.test(t.name)) row.skipped = 'changes one of the user\'s items, not a setting: needs its own yes';
    else if (ACCOUNT_PLACE.test(where) || ACCOUNT_PLACE.test(t.place) || ACCOUNT_PLACE.test(opener || '')) row.skipped = 'on a settings or account screen: needs its own yes';
    else if (toggles.filter(x => x.flipped && x.page === row.page).length >= MAX_FLIPS) row.skipped = 'page limit reached';
    if (row.skipped) continue;
    const sel = `[data-srt="${t.i}"]`;
    const press = async (s2, viaLabel) => viaLabel
      ? page.evaluate(s3 => { const el = document.querySelector(s3); (el.labels?.[0] || el.closest('label'))?.click(); }, s2).then(() => true).catch(() => false)
      : page.click(s2, { timeout: 3000 }).then(() => true).catch(() => false);
    const id = `T${String(++flipN).padStart(2, '0')}-${routeId}-${t.name.replace(/[^a-z0-9]+/gi, '-').slice(0, 20)}`;
    const before = await page.evaluate(SURFACE, LAYERS).catch(() => null);
    if (!before) { row.skipped = 'could not read the page'; continue; }
    row.shots.before = `${id}-before.png`;
    await page.screenshot({ path: join(outDir, row.shots.before) }).catch(() => { delete row.shots.before; });
    errs = [];
    if (!(await press(sel, t.clickLabel))) { row.skipped = 'could not click (covered or moved)'; continue; }
    row.flipped = true;
    await settle(page, { timeout: 4000 });
    const after = await page.evaluate(SURFACE, LAYERS).catch(() => before);
    row.errors = [...new Set(errs)].slice(0, 5);
    row.shots.after = `${id}-after.png`;
    await page.screenshot({ path: join(outDir, row.shots.after) }).catch(() => { delete row.shots.after; });
    row.url_changed = after.url !== before.url;
    // What appeared or went away, away from the switch itself and the menu that holds it.
    const outside = (a, b) => Object.entries(a.items).filter(([k, v]) => !v.layer && !v.toggle && (b.items[k]?.n || 0) < v.n).map(([, v]) => ({ text: v.text, near_message_box: v.near }));
    row.added = outside(after, before).slice(0, 8);
    row.removed = outside(before, after).slice(0, 8);
    let now = await page.evaluate(TOGGLE_STATE, [TOGGLES, t.name]).catch(() => null);
    row.after = now ? now.state : 'unknown (the menu closed)';
    // Flip it back. If flipping closed the menu, open the menu again first.
    if (!now && reopen) { await reopen(); now = await page.evaluate(TOGGLE_STATE, [TOGGLES, t.name]).catch(() => null); if (now) row.after = now.state; }
    if (now && now.state !== t.state) {
      await press('[data-srt="again"]', now.clickLabel);
      await settle(page, { timeout: 4000 });
      now = await page.evaluate(TOGGLE_STATE, [TOGGLES, t.name]).catch(() => null);
      if (!now && reopen) { await reopen(); now = await page.evaluate(TOGGLE_STATE, [TOGGLES, t.name]).catch(() => null); }
    }
    row.final = now ? now.state : 'unknown';
    row.restored = !!now && now.state === t.state;
    if (!row.restored) lead('toggle-not-restored', `The switch "${t.name}"${opener ? ` in "${opener}"` : ''} could not be turned back: it was ${t.state === 'true' ? 'on' : 'off'} and is now ${row.final === 'true' ? 'on' : row.final === 'false' ? 'off' : 'in an unknown state'}. Tell the owner and list it in Left behind`, url, width, row.shots.after);
    if (row.errors.length) lead('error-on-click', `Flipping "${t.name}" caused ${row.errors.length} error(s): ${row.errors[0]}`, url, width, row.shots.after);
    // After a reopen the marks are stale: read the switches again so the next index still points right.
    if (opener) await page.evaluate(FIND_TOGGLES, [TOGGLES, LAYERS, inLayer]).catch(() => []);
  }
}
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
          const toggle = el.matches('[role=switch], [role=checkbox], [role=menuitemcheckbox], [aria-pressed], [aria-checked]');
          let click = true, why = '';
          if (toggle) { click = false; why = 'a switch: flipped only with the owner\'s yes (--use)'; }
          else if (D.test(name) && !allowed) { click = false; why = 'risky word'; }
          else if (submit && !allowed) { click = false; why = 'submits a form'; }
          else if (isRemote && !allowed && !opens && !O.test(name)) { click = false; why = name ? 'could change data' : 'no name, unknown effect'; }
          const r = el.getBoundingClientRect();
          out.push({ i, name: name || '(no name)', iconOnly, hasName: !!name, click, why, y: Math.round(r.top) });
        });
        return out;
      }, [DANGER.source, OPENER.source, allow, remote, CONTROLS]);

      let clicked = 0, motionOpener = null;
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
        await page.evaluate(() => { window.__srShiftFrom = performance.now(); }).catch(() => {});
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
        // Look inside what opened: is any of its text cut off at this width? And did the page behind a
        // menu or dialog jump when it opened? (An accordion or a tab is meant to move the page.)
        if (newOpen.length && !picker) {
          const overlay = newOpen.some(o => /^(dialog|alertdialog|menu|listbox):/.test(o));
          const inside = await page.evaluate(analyzeScript({ within: LAYERS, only: ['clipped-text', 'layout-shift'], shiftWithInput: true })).catch(() => ({ findings: [] }));
          for (const f of inside.findings) {
            if (f.kind === 'clipped-text') lead('clipped-text', `Inside "${c.name}": ${f.what}`, url, width, row.shot, { group: `${c.name}|${f.group}`, detail: f.detail });
            else if (overlay && firstWidth) lead('layout-shift', `Opening "${c.name}" makes the page behind it jump: layout shift ${f.detail.total.toFixed(2)} (over 0.1 is easy to notice). What moved most: ${f.detail.moved}`, url, width, row.shot, { group: `open|${c.name}`, detail: f.detail });
          }
          if (firstWidth && !motionOpener) motionOpener = c;
        }
        // With the owner's yes: flip the switches inside what just opened, and turn each one back.
        if (USE && firstWidth && newOpen.length && !picker) {
          await flipToggles({ url, width, routeId, opener: c.name, reopen: async () => {
            const open = await page.evaluate(STATE).catch(() => ({ open: [] }));
            if (open.open.some(o => newOpen.includes(o))) return;
            await page.click(sel, { timeout: 3000 }).catch(() => null);
            await settle(page, { timeout: 3000 });
          } });
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
      // With the owner's yes: the switches that sit on the page itself.
      if (USE && firstWidth) await flipToggles({ url, width, routeId, opener: null, reopen: null });
      // Reduced motion, once per page: ask for less motion, load the page again, and open one menu.
      if (firstWidth) {
        await page.emulateMedia({ reducedMotion: 'reduce' }).catch(() => {});
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => null);
        await page.reload({ waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => null);
        await settle(page, { timeout: 6000 });
        const still = await page.evaluate(analyzeScript({ only: ['reduced-motion'] })).catch(() => ({ findings: [] }));
        for (const f of still.findings) lead('reduced-motion', f.what, url, width, null, { group: f.group, detail: f.detail });
        if (motionOpener) {
          await markControls();
          if (await page.click(`[data-sre="${motionOpener.i}"]`, { timeout: 3000 }).then(() => true).catch(() => false)) {
            await page.waitForTimeout(60);
            const opening = await page.evaluate(analyzeScript({ only: ['reduced-motion'] })).catch(() => ({ findings: [] }));
            const shot = opening.findings.length ? `E${String(++shotN).padStart(3, '0')}-${routeId}-reduced-motion.png` : null;
            if (shot) await page.screenshot({ path: join(outDir, shot) }).catch(() => {});
            for (const f of opening.findings) lead('reduced-motion', `After opening "${motionOpener.name}": ${f.what}`, url, width, shot, { group: f.group, detail: f.detail });
            await page.keyboard.press('Escape').catch(() => {});
          }
        }
        await page.emulateMedia({ reducedMotion: null }).catch(() => {});
      }
    }
  }
} finally {
  await ctx.close();
  site.stop();
}

// A switch that adds something visible away from itself. In a menu, anything new on the page behind it
// counts. For a switch on the page, only something new next to the message box counts (a filter that
// shows more rows is doing its job). Several switches behind one opener that all do it are one lead.
const flipped = toggles.filter(t => t.flipped);
const sideEffects = new Map();
for (const t of flipped) {
  const added = t.before === 'true' ? [] : t.added.filter(a => t.opener ? true : a.near_message_box);
  if (!added.length) continue;
  const nearBox = added.some(a => a.near_message_box);
  const key = `${t.page}|${t.opener || '(page)'}|${nearBox}`;
  const g = sideEffects.get(key) || { t, nearBox, names: [], adds: [], shot: t.shots.after };
  g.names.push(t.switch); g.adds.push(added[0].text);
  sideEffects.set(key, g);
}
for (const g of sideEffects.values()) {
  const where = g.nearBox ? 'next to the message box' : 'on the page behind it';
  const inside = g.t.opener ? ` in "${g.t.opener}"` : '';
  const total = flipped.filter(t => t.page === g.t.page && t.opener === g.t.opener).length;
  const what = g.names.length === 1
    ? `Turning on the switch "${g.names[0]}"${inside} adds "${g.adds[0]}" ${where}`
    : `Each switch${inside} adds something ${where} when turned on (${g.names.length} of ${total} switches): ${g.names.map((n, i) => `"${n}" adds "${g.adds[i]}"`).join(', ')}`;
  found.push({ kind: 'toggle-side-effect', what, page: urls.find(u => local(u) === g.t.page) || g.t.page, width: g.t.width, shot: g.shot, group: `${g.t.opener || '(page)'}|${g.nearBox}`, detail: { switches: g.names, added: g.adds, near_message_box: g.nearBox } });
}

// The same lead on several pages or widths is one lead. Hover and dead-control leads are found once, at
// the first width a control is seen, so they do not say "at 1280 only".
const merged = mergeLeads(found.map((f, i) => ({ ...f, id: `E${i}` })), widths, local);
merged.forEach((l, i) => { l.id = `E${String(i + 1).padStart(2, '0')}`; if (!['clipped-text', 'no-name'].includes(l.kind)) l.what = l.what.replace(/ \(at \d+ wide only\)$/, ''); });
const use = { enabled: USE, switches_found: toggles.length, switches_flipped: flipped.length, turned_back: flipped.filter(t => t.restored).length, not_turned_back: flipped.filter(t => !t.restored).map(t => t.switch) };
const unique = [...explored.values()];
const wasClicked = r => !/^not clicked|^could not click/.test(r.result || '');
const openedCount = unique.filter(r => /^(opened|went|changed)/.test(r.result || '')).length;
const notClicked = unique.filter(r => /^not clicked/.test(r.result || ''));
const totals = { controls: unique.length, clicked: unique.filter(wasClicked).length, opened_something: openedCount, did_nothing: unique.filter(r => r.result === 'nothing visible happened').length, not_clicked: notClicked.length, caused_errors: unique.filter(r => r.errors.length).length };
writeFileSync(join(outDir, 'explore.json'), JSON.stringify({ target, widths, signed_in_with: ctx.mode !== 'none' ? ctx.label : null, totals, use, controls: rows, switches: toggles, leads: merged }, null, 2) + '\n');
const md = ['# Explore: every safe control', '',
  `${totals.controls} control(s) at ${widths.join(' and ')} wide: ${totals.opened_something} opened something, ${totals.did_nothing} did nothing visible, ${totals.not_clicked} not clicked, ${totals.caused_errors} caused errors.`, '',
  `For the pain map header: **Controls opened: ${totals.clicked} of ${totals.controls}**`, '',
  'Open what you can of the **not clicked** list by hand when its name makes the effect clear and it cannot save, send or spend. Every lead below goes in the pain map\'s **Script leads** table.', '',
  '## Leads', '', '| Lead | Check | What it found | Widths | Pages |', '| --- | --- | --- | --- | --- |',
  ...(merged.length ? merged.map(l => `| ${l.id} | ${l.kind} | ${l.what.replace(/\|/g, '/')} | ${l.widths.join(', ')} | ${l.pages.join(', ')} |`) : ['| none | | | | |']),
  ...(USE ? ['', '## Used as a user: switches flipped and turned back', '',
    `${use.switches_flipped} of ${use.switches_found} switch(es) flipped, ${use.turned_back} turned back.${use.not_turned_back.length ? ` **Not turned back: ${use.not_turned_back.join(', ')}. Tell the owner and list it in Left behind.**` : ''} Count each flipped switch as one action in the header's "Used as a user: yes (N actions)".`, '',
    '| Page | Opened from | Switch | Was | Flipped to | Ends | What appeared away from the switch | Before | After |', '| --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    ...(toggles.length ? toggles.map(t => `| ${t.page} | ${t.opener || '(on the page)'} | ${t.switch.replace(/\|/g, '/')} | ${t.before === 'true' ? 'on' : 'off'} | ${t.skipped ? `not flipped: ${t.skipped}` : (t.after === 'true' ? 'on' : t.after === 'false' ? 'off' : t.after)} | ${t.skipped ? '' : (t.restored ? 'back as it was' : `NOT RESTORED (${t.final})`)} | ${t.added.map(a => `"${a.text}"${a.near_message_box ? ' (near the message box)' : ''}`).join(', ').replace(/\|/g, '/')}${t.url_changed ? ' · the URL changed' : ''} | ${t.shots.before || ''} | ${t.shots.after || ''} |`) : ['| none | | No switches found | | | | | | |'])]
    : ['', '## Switches', '', 'Not flipped. Flipping switches needs the owner\'s yes to "use the app like a real user" (then run this again with `--use`). Until then, write in Not verified: "How features behave when used (switches, sending, results)".']),
  '', '## Controls', '', '| Page | Width | Control | Icon only | Tooltip | What happened | Errors | Screenshot |', '| --- | --- | --- | --- | --- | --- | --- | --- |',
  ...rows.map(r => `| ${r.page} | ${r.width} | ${r.control.replace(/\|/g, '/')} | ${r.icon_only ? 'yes' : ''} | ${r.tooltip || (r.icon_only && r.width > 500 ? 'none' : '')} | ${(r.result || '').replace(/\|/g, '/')} | ${r.errors.join('; ').replace(/\|/g, '/')} | ${r.shot || ''} |`)];
writeFileSync(join(outDir, 'explore.md'), md.join('\n') + '\n');
console.log(`explore: ${totals.controls} control(s), ${totals.opened_something} opened something, ${merged.length} lead(s), ${totals.not_clicked} not clicked${USE ? `, ${use.switches_flipped} switch(es) flipped and ${use.turned_back} turned back` : ''} · ${outDir}`);
