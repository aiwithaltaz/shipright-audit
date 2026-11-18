#!/usr/bin/env node
// Open every safe control on each page, the way a curious first-time user would, and record what happens.
// Audits miss what they never open: a dialog behind an icon, a button that does nothing, a feature that
// throws an error the moment you touch it. This finds them.
// Usage: node <skill>/scripts/explore.mjs <index.html|url> --audit <audit> [--use] [--routes "#/,/settings"]
//        [--widths 1280,390] [--max 40] [--allow "Bookmark,Handoff"]
//        (older form, still works: [--crawl crawl.json] [--profile dir] [--session session.json] [--out dir])
// --audit: this audit's folder. It reads the sign-in from <audit>/signin.json and the screens from
// <audit>/screens/crawl.json, and writes to <audit>/explore.
// --widths: both 1280 and 390 run by default. At the first width every control is explored. At the next
// widths it explores the controls that only exist there (a phone menu button, a bottom bar) and opens
// again whatever opened a dialog, menu or panel, so each one is also seen and screenshotted on phone.
// Text that is cut off inside an opened dialog, menu or panel is reported as a lead.
// It also checks motion, at the first width:
//   - Layout shift on open: a menu or dialog should open over the page. If the page behind it jumps
//     (layout shift over 0.1), that is a lead.
//   - Reduced motion: once per page it switches the browser to "reduce motion", loads the page again
//     and opens one menu. Anything that still slides, zooms or spins without need is a lead.
// It also checks, without clicking anything:
//   - Markers with no filter: when the items of a list carry a marker control (star, favorite, like,
//     pin, bookmark, save, flag), the same screen should offer a way to see only the marked items: a
//     filter, tab, chip, link or sort option using the same word ("Starred", "Favorites", "Pinned",
//     "Saved", "Flagged"). The menus this script opens count too. If there is none, that is a
//     "marker-no-filter" lead: "You can star items but not see only starred items."
// It also checks that Back goes back (new in 0.9), at every width:
//   - On each page it follows the links to other pages of the app, and on the page it lands on it looks
//     for an in-app back control: a button or link named Back, or an unnamed left-arrow icon button at
//     the top of the page or panel. It clicks it, waits, and compares where it landed with the page it
//     came from. Landing anywhere else is a "back-goes-elsewhere" lead that names the 3 pages: came
//     from, went to, landed on. Each back control is tried from up to 2 different pages, because the
//     bug often shows on one route only. Back is navigation, so this is read-only. A back control
//     with a risky word in its name is never clicked.
// And that sibling tabs do not move things (new in 0.9), at every width:
//   - For each group of tabs (a tablist) or sub-pages of one section (pages that share a parent route
//     and link to each other), it opens each tab and records where the first piece of content starts,
//     and whether a back control, a page title and a top action are there.
//   - "tab-shift": the content start moves by more than 4px between tabs.
//   - "tab-chrome-differs": a back control or a page title shows on some tabs and not on others. When
//     a sidebar or rail is in view the lead says so: a back arrow is not needed next to a sidebar.
// And that options do not vanish after use (new in 0.9). Only with --use (the owner said yes), or when
// the run is not signed in, where nothing is saved to an account:
//   - For a control that shows a short list of options or cycles through them (a theme switcher, a
//     view toggle, a segmented control) it records the options shown, picks each one in turn, and
//     records the options shown after each pick. An option seen before that can no longer be picked
//     is an "option-vanished" lead. Then it puts the control back to its first state, and says so
//     when it could not.
//   - Never picked: options with risky or account-wide words (plans, billing, roles, sharing, a
//     language or a model), anything the owner's limits hold, and, on settings and account screens,
//     anything that is not about the look of the app (theme, density, view).
// And for two controls that do the same job under different names (new in 0.9):
//   - The page check "duplicate-on-screen" only compares names and link targets inside navigations,
//     so it misses two buttons with different names and no link, like a model picker in the message
//     box and another in the top bar. This script knows what each control opens. Two controls on one
//     screen that open the same menu, or menus whose options are over 80% the same, are one
//     "duplicate-on-screen" lead: "Two controls do the same job here: A and B both open ...".
//     Menus on the rows of one list (the same menu on every row) are not duplicates.
// And two checks that stop false alarms (new in 0.9):
//   - Floating labels are labels. A field with no label beside or above it is focused and 1 character
//     is typed, then deleted: if its label (or the text that sat in the box) is still in view above
//     the typed text, the field has a visible label. Only when nothing names the field while typing is
//     it an "unlabeled-field" lead. On a live app it types only into sign-in and search fields,
//     never submits, and judges the other fields without typing. Search boxes and message boxes are
//     not reported: a lone box with a hint is the usual pattern there.
//   - A rail that opens on hover counts as labeled. When hovering an icon-only control makes its text
//     label appear (the rail grows, or the full sidebar opens), no "no-tooltip" lead is reported.
// --profile / --session: stay signed in (see crawl.mjs). The profile is tried first. If the app no longer
// knows us it stops with exit 3 and never explores signed out by accident.
// For each control it records: its name, whether it is icon-only, the tooltip shown on hover, what opened
// (a dialog, menu, panel, new page, file picker, a change on the page, or nothing), console and network
// errors caused by the click, and a screenshot when something opened. Then it puts the page back.
// Safety on live apps (http/https): it only clicks controls that open something (menus, tabs, pop-ups) or
// whose name says so (open, menu, more, settings, filter, model, attach, search...),
// never risky words (delete, send, publish, generate, save, pay, like, pin, regenerate... see DANGER in
// browser.mjs) and never form submit buttons. Everything else is listed as "not clicked" for you to judge.
// A button named create, add or new is clicked only when it shows that it opens something
// (aria-haspopup, aria-expanded, or it is a link to a new page) or the owner allowed it (--allow, or
// "allow_controls" in use-limits.json). Otherwise it is held: "could create an item".
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
// The owner's limits: when the owner said "yes, but ...", the audit writes <audit>/use-limits.json (the
// format is in browser.mjs). --use reads it (--limits <file>, or the nearest one above --out) and holds
// every switch whose name matches a held action: it is listed as held, with the owner's words, never flipped.
// Writes explore.json, explore.md and E##-*.png to --out. Exit 0 ran, 2 usage or missing Playwright.
import { openContext, signInFlags, openTarget, pagesToVisit, widthsFlag, viewportFor, analyzeScript, mergeLeads, settle, useLimits, heldBy, auditPaths, landedOn, normUrl, DANGER } from './browser.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';

const args = process.argv.slice(2);
const valueFlags = ['--routes', '--crawl', '--session', '--profile', '--out', '--max', '--allow', '--widths', '--limits', '--audit'];
const target = args.find((a, i) => !a.startsWith('--') && !valueFlags.includes(args[i - 1]));
const flag = n => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
if (!target) { console.error('usage: node <skill>/scripts/explore.mjs <index.html|url> --audit <audit folder> [--use] [--routes ...] [--widths 1280,390] [--max 40] [--allow "Label,Label"] [--crawl crawl.json] [--profile dir] [--session file] [--out dir]'); process.exit(2); }
const paths = auditPaths(args, 'explore');
const outDir = paths.out;
mkdirSync(outDir, { recursive: true });
const { session, profile, landed } = signInFlags(args, 'explore');
const MAX = Number(flag('--max') || 40);
const ownerLimits = useLimits(args, outDir, 'explore');
// Controls the owner said may be clicked: --allow, and "allow_controls" in use-limits.json.
const allow = [...(flag('--allow') || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean), ...(ownerLimits ? ownerLimits.allow_controls : [])];
const widths = widthsFlag(args);
const USE = args.includes('--use');
// What the owner ruled out when they said yes with limits. Only read with --use.
const limits = USE ? ownerLimits : null;
const MAX_FLIPS = 12; // per page
// Picking options (theme, view, segmented controls) needs the owner's yes too, except when the run is
// not signed in: there nothing is saved to an account. Set after the browser opens.
let PICK = USE;
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

// Markers on list items, and whether the screen offers a way to see only the marked ones. No clicking.
const MARKERS = () => {
  const vis = el => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
  const text = el => (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
  // A marker and the words a filter for it would use. Star, favorite and like are one family: an app
  // that stars items and has a "Favorites" tab is fine.
  const FAMILIES = [
    { id: 'star', mark: /\b(un)?star(red|s)?\b|\b(un)?favou?rite[sd]?\b|\bfaves?\b|\bheart\b|\b(un)?like[sd]?\b/i, filter: /\bstarred\b|\bstars\b|\bfavou?rite[sd]?\b|\bfaves?\b|\bliked?\b|\blikes\b|\bloved\b/i,
      words: n => /favou?rite|fave/i.test(n) ? ['favorite', 'favorite'] : /like/i.test(n) ? ['like', 'liked'] : /heart/i.test(n) && !/star/i.test(n) ? ['favorite', 'favorite'] : ['star', 'starred'] },
    { id: 'pin', mark: /\b(un)?pin(ned|s)?\b/i, filter: /\bpinned\b|\bpins\b/i, words: () => ['pin', 'pinned'] },
    { id: 'bookmark', mark: /\b(un)?bookmark(ed|s)?\b|\bsave for later\b|\b(read|watch) later\b|^(un)?saved?$/i, filter: /\bbookmark(ed|s)?\b|\bsaved\b|\breading list\b|\b(read|watch) later\b/i, words: n => /bookmark/i.test(n) ? ['bookmark', 'bookmarked'] : ['save', 'saved'] },
    { id: 'flag', mark: /\b(un)?flag(ged|s)?\b/i, filter: /\bflagged\b|\bflags\b/i, words: () => ['flag', 'flagged'] },
  ];
  // What a control says it is: its words, its label for screen readers, or the name of its icon.
  const nameOf = el => {
    const said = (el.getAttribute('aria-label') || el.getAttribute('title') || text(el) || '').trim();
    if (said) return said.slice(0, 40);
    const icon = el.querySelector('svg, i, use, [data-icon]');
    const hint = [el.getAttribute('data-icon'), icon && icon.getAttribute('data-icon'), icon && (icon.getAttribute('class') || ''), icon && (icon.getAttribute('href') || icon.getAttribute('xlink:href') || ''), el.querySelector('use') && (el.querySelector('use').getAttribute('href') || '')].filter(Boolean).join(' ');
    return hint.replace(/[#_.-]+/g, ' ').replace(/\b(icon|icons|lucide|fa|fas|far|bi|ri|mdi|feather|outline|solid|fill|line)\b/gi, ' ').replace(/\s+/g, ' ').trim().slice(0, 40);
  };
  const controls = [...document.querySelectorAll('button, [role=button], [role=switch], [role=checkbox], input[type=checkbox]')].filter(el => vis(el) && !(el.type === 'submit' && el.closest('form')) && !el.closest('nav, header, footer, [role=menu], [role=dialog], dialog, [role=toolbar]'));
  const out = [];
  for (const fam of FAMILIES) {
    const marked = controls.map(el => ({ el, name: nameOf(el) })).filter(c => c.name && fam.mark.test(c.name) && !/\b(all|changes|draft|settings|as|and|new|filter|show|only)\b/i.test(c.name));
    if (marked.length < 2) continue;
    // The item each marker sits on: the nearest ancestor with a same-tag sibling that also holds one.
    const holds = el => marked.some(m => el.contains(m.el));
    const items = new Set();
    for (const m of marked) {
      for (let x = m.el.parentElement; x && x !== document.body; x = x.parentElement) {
        if (!x.parentElement) break;
        if ([...x.parentElement.children].some(sib => sib !== x && sib.tagName === x.tagName && holds(sib))) { items.add(x); break; }
      }
    }
    if (items.size < 2) continue;
    const inItem = el => [...items].some(i => i.contains(el));
    const offers = [...document.querySelectorAll('[role=tab], [role=option], option, [role=menuitem], [role=menuitemradio], [role=menuitemcheckbox], [role=radio], a, button, [role=button], label, summary, h1, h2, h3, h4, h5, h6, [class*=chip i], [class*=filter i]')]
      .filter(el => !inItem(el) && (el.tagName === 'OPTION' || vis(el)))
      .map(el => (el.getAttribute('aria-label') || text(el) || '').slice(0, 60)).filter(Boolean);
    const offer = offers.find(t => fam.filter.test(t)) || null;
    const [verb, done] = fam.words(marked[0].name);
    const first = [...items][0];
    first.parentElement.dataset.srmark = fam.id;
    out.push({ family: fam.id, verb, done, filter: fam.filter.source, items: items.size, control: marked[0].name, offer });
  }
  return out;
};

// What is open right now: dialogs, menus, pop-overs, the URL and how much text the page shows.
const STATE = () => {
  const vis = el => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 20 && r.height > 20 && s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) > 0.05; };
  const open = [...document.querySelectorAll('[role=dialog], [role=alertdialog], [aria-modal=true], dialog[open], [role=menu], [role=listbox], [role=tooltip], [popover], [data-state=open]')]
    .filter(vis).map(el => (el.getAttribute('role') || el.tagName.toLowerCase()) + ':' + (el.getAttribute('aria-label') || (el.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 40)));
  return { url: location.href, open, text: (document.body?.innerText || '').length };
};

const site = await openTarget(target, 'explore');
const remote = site.remote;
const ctx = await openContext({ session, profile, name: 'explore', url: landedOn(landed, site.startUrl) || site.startUrl, viewport: viewportFor(widths[0]) });
const page = ctx.page;
if (ctx.mode === 'none') PICK = true;
let errs = [];
page.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 200)); });
page.on('pageerror', e => errs.push(e.message.slice(0, 200)));
page.on('response', r => { if (r.status() >= 400 && !/favicon/.test(r.url())) errs.push(`${r.status()} ${r.request().method()} ${r.url().replace(/^https?:\/\/[^/]+/, '').slice(0, 120)}`); });
page.on('requestfailed', r => errs.push(`failed ${r.method()} ${r.url().replace(/^https?:\/\/[^/]+/, '').slice(0, 120)}`));
let picker = false;
page.on('filechooser', () => { picker = true; }); // listening stops the real picker from opening
page.on('dialog', d => d.dismiss().catch(() => {}));

const urls = pagesToVisit({ startUrl: site.startUrl, remote, routes: flag('--routes'), crawl: paths.crawl, landed, name: 'explore' });
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
    // One of a row of buttons where exactly one is pressed (a segmented control): an option, not a
    // switch. Clicking it again does not turn it off. The option check picks and restores those.
    const sibs = el.hasAttribute('aria-pressed') && el.parentElement ? [...el.parentElement.children].filter(vis) : [];
    const option = sibs.length >= 2 && sibs.length <= 6 && sibs.every(k => k.hasAttribute('aria-pressed')) && sibs.filter(k => k.getAttribute('aria-pressed') === 'true').length === 1;
    out.push({ i, name: name || '(no name)', state: state(el), place: place.slice(0, 60), clickLabel: !vis(el), perItem, option });
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
    const ruledOut = heldBy(limits, t.name);
    if (ruledOut) { row.skipped = `held: the owner ruled this out ("${ruledOut.action}")`; row.held_by = ruledOut.action; }
    else if (t.option) row.skipped = 'one option of a segmented control, not a switch: see Option controls';
    else if (DANGER.test(t.name)) row.skipped = 'risky word';
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
// ---- Back goes back ----------------------------------------------------------------------------
// In-app back controls on this page: a button or link named Back ("Back", "Go back", "Back to
// projects"), or an icon button with no name that shows a left arrow at the top of the page or panel.
// Not a back control: the left arrow of a pair (previous and next in a carousel, a calendar, a pager),
// a breadcrumb, a tab, or anything with a risky word in its name.
const FIND_BACKS = (danger) => {
  const D = new RegExp(danger, 'i');
  const vis = el => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) > 0.05; };
  const NAMED = /^\W*((go|navigate|take me)\s+)?back(\s+to\b.{0,30})?\W*$/i;
  const GLYPH = /^\s*[←‹❮⟵«<⬅↩◀⭠\u{1F519}]️?\s*$/u;
  const LEFT = /(arrow|chevron|caret|angle)[-_ ]?(left|back)|left[-_ ]?(arrow|chevron|caret)|(^|[\s_:#/.-])back([\s_.-]|$)|arrow_back|chevron_left|navigate_before/i;
  const RIGHT = /(arrow|chevron|caret|angle)[-_ ]?(right|forward|next)|right[-_ ]?(arrow|chevron|caret)|arrow_forward|chevron_right|navigate_next|^\s*[→›❯⟶»>➡▶]️?\s*$/iu;
  const AWAY = '[class*=carousel i], [class*=slider i], [class*=swiper i], [class*=pagination i], [class*=pager i], [class*=calendar i], [class*=datepicker i], [role=tablist], [class*=breadcrumb i], [aria-label*=breadcrumb i], footer, [role=menu], [role=listbox]';
  const hintOf = el => { const icon = el.querySelector('svg, i, use, img, [data-icon], [class*=icon i]'); const use = el.querySelector('use'); return [el.getAttribute('data-icon'), typeof el.className === 'string' ? el.className : '', icon && icon.getAttribute('data-icon'), icon && (icon.getAttribute('class') || ''), icon && (icon.getAttribute('alt') || ''), icon && (icon.getAttribute('src') || '').split('/').pop(), use && (use.getAttribute('href') || use.getAttribute('xlink:href') || ''), el.querySelector('title') && el.querySelector('title').textContent].filter(Boolean).join(' '); };
  document.querySelectorAll('[data-srb]').forEach(el => { delete el.dataset.srb; });
  const out = [];
  for (const el of document.querySelectorAll('a[href], button, [role=button], [role=link]')) {
    if (!vis(el) || el.disabled || el.getAttribute('aria-disabled') === 'true' || el.closest(AWAY)) continue;
    const text = (el.innerText || '').replace(/\s+/g, ' ').trim();
    const said = (el.getAttribute('aria-label') || el.getAttribute('title') || '').trim();
    const wordy = /[\p{L}\p{N}]/u.test(text);
    const name = (wordy ? text : (said || text)).slice(0, 60);
    let how = null;
    if (wordy || said) { if (name.length <= 40 && NAMED.test(wordy ? text : said)) how = 'name'; }
    else if (GLYPH.test(text) || LEFT.test(hintOf(el))) how = 'arrow';
    if (!how || D.test(name)) continue;
    const r = el.getBoundingClientRect();
    if (how === 'arrow') {
      // At the top of the page or of its panel, on the left, and not half of a previous / next pair.
      const panel = el.closest('[role=dialog], dialog, aside, section, article, main, [class*=panel i], [class*=drawer i]');
      const top = Math.min(r.top, panel ? r.top - panel.getBoundingClientRect().top : r.top);
      if (top > 160 || r.left > innerWidth * 0.6 || r.width > 64 || r.height > 64) continue;
      const row = el.parentElement;
      if (row && [...row.querySelectorAll('a[href], button, [role=button]')].some(x => x !== el && vis(x) && RIGHT.test(((x.innerText || '').trim() || '') + ' ' + hintOf(x)) && !/[\p{L}]{3,}/u.test((x.innerText || '').trim()))) continue;
    }
    el.dataset.srb = String(out.length);
    out.push({ i: out.length, name: how === 'arrow' ? 'the left arrow' : name, how, top: Math.round(r.top) });
  }
  return out;
};
// Links on this page to other pages of the same app: one per destination, never a risky word.
const FIND_LINKS = (danger) => {
  const D = new RegExp(danger, 'i');
  const vis = el => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) > 0.05; };
  const page = u => u.origin + u.pathname.replace(/\/+$/, '') + ((u.hash.startsWith('#/') || u.hash.startsWith('#!')) && u.hash !== '#/' ? u.hash : '');
  const here = page(new URL(location.href));
  document.querySelectorAll('[data-srl]').forEach(el => { delete el.dataset.srl; });
  const out = [], seen = new Set();
  for (const el of document.querySelectorAll('a[href]')) {
    const raw = (el.getAttribute('href') || '').trim();
    if (!raw || /^(javascript:|mailto:|tel:|data:|blob:)/i.test(raw) || (el.target && el.target !== '_self') || el.hasAttribute('download') || !vis(el)) continue;
    let u; try { u = new URL(el.href); } catch { continue; }
    if (u.origin !== location.origin || page(u) === here || seen.has(page(u))) continue;
    const name = ((el.innerText || '').replace(/\s+/g, ' ').trim() || el.getAttribute('aria-label') || el.getAttribute('title') || '').slice(0, 60);
    if (D.test(name) || /log-?out|sign-?out|signout|delete|remove|unsubscribe|\/auth\/|\/oauth|\.(pdf|zip|csv|png|jpe?g|docx?|xlsx?)$/i.test(u.pathname + u.search)) continue;
    seen.add(page(u));
    el.dataset.srl = String(out.length);
    out.push({ i: out.length, name: name || u.pathname, href: u.href });
  }
  return out;
};
// One page, whatever its query string: "/projects?tab=2" and "/projects" are the same place to come back to.
const pageKey = u => { try { const x = new URL(u); return x.origin + x.pathname.replace(/\/+$/, '') + (/^#\/?$/.test(x.hash) ? '' : x.hash); } catch { return u; } };
const backControls = new Map(); // "page|control" -> { page, control, how, routes: [{ width, came_from, went_to, landed_on, result, shot }] }
async function backPass(width, budget) {
  const routesTo = new Map(), noBack = new Set();
  const load = async u => { await page.goto(u, { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => null); await settle(page, { timeout: 6000 }); };
  // Start from every page in scope, then from the pages their links lead to (a few), so a back control
  // is reached from 2 different pages even when no crawl was given.
  const starts = [...urls];
  for (let n = 0; n < starts.length; n++) {
    const url = starts[n];
    if (budget <= 0) break;
    await load(url);
    const from = page.url();
    const links = await page.evaluate(FIND_LINKS, DANGER.source).catch(() => []);
    for (const l of links) if (starts.length < urls.length + 6 && !starts.some(u => pageKey(u) === pageKey(l.href))) starts.push(l.href);
    for (const l of links) {
      if (budget <= 0) break;
      const dest = pageKey(l.href);
      if (noBack.has(dest) || (routesTo.get(dest) || 0) >= 2) continue;
      if (pageKey(page.url()) !== pageKey(from)) { await load(url); await page.evaluate(FIND_LINKS, DANGER.source).catch(() => []); }
      if (!(await page.click(`[data-srl="${l.i}"]`, { timeout: 3000 }).then(() => true).catch(() => false))) continue;
      await settle(page, { timeout: 4000 });
      const went = page.url();
      if (pageKey(went) === pageKey(from) || new URL(went).origin !== new URL(from).origin) continue;
      const backs = await page.evaluate(FIND_BACKS, DANGER.source).catch(() => []);
      if (!backs.length) { noBack.add(dest); if (pageKey(went) !== dest) noBack.add(pageKey(went)); continue; }
      const b = backs[0];
      budget--;
      routesTo.set(dest, (routesTo.get(dest) || 0) + 1);
      const key = `${pageKey(went)}|${b.name}`;
      const entry = backControls.get(key) || { page: local(went), control: b.name, how: b.how, routes: [] };
      backControls.set(key, entry);
      // The same route at another width was already tried when both ends match: try it again anyway,
      // because a phone layout often has its own back arrow.
      const route = { width, came_from: local(from), went_to: local(went), landed_on: null, result: null, shot: null, url: went };
      entry.routes.push(route);
      if (!(await page.click(`[data-srb="${b.i}"]`, { timeout: 3000 }).then(() => true).catch(() => false))) { route.result = 'could not click (covered or moved)'; continue; }
      await settle(page, { timeout: 4000 });
      const landed = page.url();
      route.landed_on = local(landed);
      if (pageKey(landed) === pageKey(from)) route.result = 'went back';
      else if (pageKey(landed) === pageKey(went)) route.result = 'stayed on the page';
      else {
        route.result = 'went elsewhere';
        route.shot = `E${String(++shotN).padStart(3, '0')}-back-${(new URL(went).hash || new URL(went).pathname).replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').slice(0, 24) || 'home'}${width === widths[0] ? '' : `-${width}`}.png`;
        await page.screenshot({ path: join(outDir, route.shot) }).catch(() => { route.shot = null; });
      }
    }
  }
}
// ---- Sibling tabs must not move things ---------------------------------------------------------
// The tab strips on this page: 2 to 8 visible tabs each. Marks every tab so it can be clicked.
const FIND_TABLISTS = (danger) => {
  const D = new RegExp(danger, 'i');
  const vis = el => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
  const text = el => (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
  document.querySelectorAll('[data-srtab]').forEach(el => { delete el.dataset.srtab; });
  const out = [];
  document.querySelectorAll('[role=tablist]').forEach(list => {
    if (!vis(list) || list.closest('[role=dialog], dialog, [role=menu]')) return;
    const tabs = [...list.querySelectorAll('[role=tab]')].filter(t => vis(t) && !t.disabled && t.getAttribute('aria-disabled') !== 'true');
    if (tabs.length < 2 || tabs.length > 8) return;
    const names = tabs.map(t => (text(t) || t.getAttribute('aria-label') || '').replace(/\s*\d+$/, '').slice(0, 40));
    if (names.some(n => !n || D.test(n))) return;
    const gi = out.length;
    tabs.forEach((t, ti) => { t.dataset.srtab = `${gi}-${ti}`; });
    out.push({ gi, label: list.getAttribute('aria-label') || '', key: names.join('|'), tabs: names.map((name, ti) => ({ ti, name, selected: tabs[ti].getAttribute('aria-selected') === 'true' })) });
  });
  return out;
};
// Which of these pages does the current page link to, the way a sub-navigation does? A long list of
// item links (40 chats) is not a set of tabs.
const SIBLING_LINKS = (members) => {
  const vis = el => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
  const key = u => { try { const x = new URL(u, location.href); return x.origin + x.pathname.replace(/\/+$/, '') + (/^#\/?$/.test(x.hash) ? '' : x.hash); } catch { return ''; } };
  const want = new Map(members.map(m => [key(m), m]));
  const found = {};
  for (const a of document.querySelectorAll('a[href]')) {
    const k = key(a.href);
    if (!want.has(k) || !vis(a) || found[want.get(k)]) continue;
    // The link and its siblings: how many links sit in the same strip?
    const strip = a.closest('nav, ul, ol, [role=tablist], [role=navigation], [class*=tabs i], [class*=subnav i]') || a.parentElement;
    found[want.get(k)] = { name: ((a.innerText || '').replace(/\s+/g, ' ').trim() || a.getAttribute('aria-label') || '').replace(/\s*\d+$/, '').slice(0, 40), strip: strip ? [...strip.querySelectorAll('a[href]')].filter(vis).length : 1 };
  }
  return found;
};
// What the top of this page holds. Run FIND_BACKS first: it marks the back controls.
const TAB_FACTS = () => {
  const vis = el => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) > 0.05; };
  const text = el => (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
  const own = el => [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join(' ').replace(/\s+/g, ' ').trim();
  const root = [...document.querySelectorAll('main, [role=main]')].find(vis) || document.body;
  const CHROME = 'nav, header, aside, footer, [role=navigation], [role=tablist], [role=banner], [class*=sidebar i], [class*=breadcrumb i], [role=dialog], dialog, [role=tooltip], [role=menu], [data-srb], script, style, noscript, template';
  const back = [...document.querySelectorAll('[data-srb]')].find(b => vis(b) && !b.closest('[role=dialog], dialog')) || null;
  const title = [...root.querySelectorAll('h1, [role=heading][aria-level="1"]')].find(h => vis(h) && !h.closest(CHROME)) || null;
  const tr = title ? title.getBoundingClientRect() : null;
  // A top action: a button on the same line as the page title (or, with no title, in the top right corner).
  const rr = root.getBoundingClientRect();
  const action = [...root.querySelectorAll('button, [role=button], a[class*=btn i], a[class*=button i]')].find(b => {
    if (!vis(b) || b.closest(CHROME) || b.hasAttribute('data-srb') || !text(b)) return false;
    const r = b.getBoundingClientRect();
    return tr ? (r.top < tr.bottom && r.bottom > tr.top && r.left >= tr.right - 4) : (r.top - Math.max(rr.top, 0) < 96 && r.left > rr.left + rr.width * 0.6);
  }) || null;
  let top = null, first = null;
  for (const el of root.querySelectorAll('*')) {
    if (el === title || (title && title.contains(el)) || el === action || (action && action.contains(el)) || el.closest(CHROME) || !vis(el)) continue;
    const holds = own(el).length >= 2 || el.matches('img, video, canvas, input:not([type=hidden]), select, textarea, button, table, [role=img]');
    if (!holds) continue;
    const y = el.getBoundingClientRect().top + scrollY;
    if (top === null || y < top) { top = y; first = el; }
  }
  const side = [...document.querySelectorAll('aside, nav, [role=navigation], [class*=sidebar i], [class*=rail i]')].some(el => { if (!vis(el)) return false; const r = el.getBoundingClientRect(); return r.height >= innerHeight * 0.6 && r.width >= 40 && r.width <= 420 && (r.left <= 8 || r.right >= innerWidth - 8); });
  return { content_top: top === null ? null : Math.round(top), first: first ? `${first.tagName.toLowerCase()} "${(text(first) || first.getAttribute('aria-label') || first.getAttribute('placeholder') || '').slice(0, 40)}"` : null,
    back: !!back, title: title ? text(title).slice(0, 60) : null, top_action: action ? text(action).slice(0, 40) : null, sidebar: side };
};
const tabGroups = []; // { group, page, width, tabs: [{ name, content_top, back, title, top_action, sidebar }] }
// The section a page belongs to. Top-level pages have none: they are sections, not tabs of one section.
const parentOf = u => { try { const x = new URL(u); const hash = x.hash.startsWith('#/'); const segs = (hash ? x.hash.slice(1) : x.pathname).split('/').filter(Boolean); if (segs.length < 2) return null; return x.origin + (hash ? x.pathname + '#' : '') + '/' + segs.slice(0, -1).join('/'); } catch { return null; } };
async function tabPass(width) {
  const seen = new Set();
  const facts = async () => {
    await page.evaluate(() => scrollTo(0, 0)).catch(() => {});
    await page.evaluate(FIND_BACKS, DANGER.source).catch(() => []);
    const f = await page.evaluate(TAB_FACTS).catch(() => null);
    return f ? { ...f, png: await page.screenshot().catch(() => null) } : null;
  };
  const judge = (label, pageUrl, tabs) => {
    const usable = tabs.filter(t => t && t.content_top !== null);
    if (usable.length < 2) return;
    const list = names => names.map(n => `"${n}"`).join(', ');
    const g = { group: label, page: local(pageUrl), width, tabs: tabs.map(({ png, ...t }) => t) };
    tabGroups.push(g);
    const save = t => { if (!t.png) return null; const f = `E${String(++shotN).padStart(3, '0')}-tabs-${t.name.replace(/[^a-z0-9]+/gi, '-').slice(0, 24)}${width === widths[0] ? '' : `-${width}`}.png`; try { writeFileSync(join(outDir, f), t.png); return f; } catch { return null; } };
    // The usual start is the one most tabs share (the smaller one on a tie).
    const count = new Map();
    for (const t of usable) count.set(t.content_top, (count.get(t.content_top) || 0) + 1);
    const usual = [...count].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
    const moved = usable.filter(t => Math.abs(t.content_top - usual) > 4);
    if (moved.length) {
      const worst = moved.slice().sort((a, b) => Math.abs(b.content_top - usual) - Math.abs(a.content_top - usual))[0];
      const shot = save(worst), normal = save(usable.find(t => t.content_top === usual));
      lead('tab-shift', `Switching between the tabs of ${label} moves the content: it starts ${usual}px from the top on ${list(usable.filter(t => !moved.includes(t)).map(t => t.name))}, and ${moved.map(t => `${t.content_top}px on "${t.name}" (${Math.abs(t.content_top - usual)}px ${t.content_top > usual ? 'lower' : 'higher'})`).join(', ')}`, pageUrl, width, shot,
        { group: `tab-shift|${label}`, detail: { tabs: g.tabs, usual_top: usual, shots: [shot, normal].filter(Boolean) } });
    }
    const parts = [];
    const withBack = usable.filter(t => t.back), noBack = usable.filter(t => !t.back);
    if (withBack.length && noBack.length) parts.push(`a back control shows on ${list(withBack.map(t => t.name))} but not on ${list(noBack.map(t => t.name))}${withBack.some(t => t.sidebar) ? '. A sidebar is in view on these tabs, so a back arrow is not needed there' : ''}`);
    const withTitle = usable.filter(t => t.title), noTitle = usable.filter(t => !t.title);
    if (withTitle.length && noTitle.length) parts.push(`a page title shows on ${list(withTitle.map(t => t.name))} but not on ${list(noTitle.map(t => t.name))}`);
    if (parts.length) {
      const odd = (withBack.length && noBack.length ? (withBack.length <= noBack.length ? withBack : noBack) : (withTitle.length <= noTitle.length ? withTitle : noTitle))[0];
      const shot = save(odd);
      lead('tab-chrome-differs', `The tabs of ${label} do not share the same top: ${parts.join('. Also, ')}`, pageUrl, width, shot,
        { group: `tab-chrome|${label}`, detail: { tabs: g.tabs, back_on: withBack.map(t => t.name), title_on: withTitle.map(t => t.name), sidebar_in_view: usable.some(t => t.sidebar), shots: [shot].filter(Boolean) } });
    }
  };
  // (a) Sub-pages of one section: pages in scope that share a parent route and link to each other.
  const byParent = new Map();
  for (const u of urls) { const p = parentOf(u); if (!p) continue; (byParent.get(p) || byParent.set(p, []).get(p)).push(u); }
  for (const [parent, members] of byParent) {
    const withParent = urls.find(u => pageKey(u) === pageKey(parent)) ? [urls.find(u => pageKey(u) === pageKey(parent)), ...members] : members;
    if (withParent.length < 2) continue;
    await page.goto(withParent[0], { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => null);
    await settle(page, { timeout: 6000 });
    const linked = await page.evaluate(SIBLING_LINKS, withParent).catch(() => ({}));
    const set = withParent.filter(u => linked[u] && linked[u].strip <= 8).slice(0, 8);
    if (!set.includes(withParent[0])) set.unshift(withParent[0]);
    if (set.length < 2) continue;
    const key = set.map(pageKey).sort().join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    const tabs = [];
    for (const u of set) {
      if (u !== withParent[0] || tabs.length) { await page.goto(u, { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => null); await settle(page, { timeout: 6000 }); }
      const f = await facts();
      const name = (linked[u] && linked[u].name) || (f && f.title) || decodeURIComponent((new URL(u).hash || new URL(u).pathname).split('/').filter(Boolean).pop() || 'home');
      tabs.push(f ? { name, ...f } : null);
    }
    judge(`${local(parent).replace(/^\/index\.html#/, '') || '/'} (${set.length} sub-pages)`, set[0], tabs.filter(Boolean));
  }
  // (b) Tab strips on each page.
  for (const url of urls) {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => null);
    await settle(page, { timeout: 6000 });
    const lists = await page.evaluate(FIND_TABLISTS, DANGER.source).catch(() => []);
    for (const tl of lists.slice(0, 4)) {
      if (seen.has(tl.key)) continue;
      seen.add(tl.key);
      const tabs = [];
      for (const t of tl.tabs) {
        // Find the strip again each time: a tab that is a link loads a new page and the marks are gone.
        const now = (await page.evaluate(FIND_TABLISTS, DANGER.source).catch(() => [])).find(x => x.key === tl.key);
        if (!now) break;
        if (!(await page.click(`[data-srtab="${now.gi}-${t.ti}"]`, { timeout: 3000 }).then(() => true).catch(() => false))) continue;
        await settle(page, { timeout: 3000 });
        const f = await facts();
        if (f) tabs.push({ name: t.name, ...f });
      }
      judge(tl.label ? `"${tl.label}"` : `${tl.tabs.map(t => t.name).slice(0, 4).join(' / ')}`, url, tabs);
      // Put the first tab back.
      const was = tl.tabs.find(t => t.selected);
      const now = (await page.evaluate(FIND_TABLISTS, DANGER.source).catch(() => [])).find(x => x.key === tl.key);
      if (was && now) { await page.click(`[data-srtab="${now.gi}-${was.ti}"]`, { timeout: 3000 }).catch(() => null); await settle(page, { timeout: 2000 }); }
      else { await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => null); await settle(page, { timeout: 6000 }); }
    }
  }
}
// ---- Options must not vanish after use ---------------------------------------------------------
// Words that make an option control unsafe to pick, even with a yes.
const OPTION_RISK = /\b(plan|plans|billing|upgrade|premium|enterprise|pro|team|role|permission|owner|admin|member|currency|language|locale|region|country|time ?zone|model|workspace|organi[sz]ation|account)\b/i;
// A control about the look of the app, by its name or by what it offers.
const LOOK_NAME = /\b(theme|appearance|dark mode|light mode|night mode|colou?r (scheme|mode))\b/i;
// A button that opens a list may also be named for the view it changes ("View", "Layout", "Density").
const LOOK_MENU = /^(view|layout|display|density)( mode| options?| settings)?$/i;
const LOOK_OPTION = /^(system|auto|automatic|device|os default|use system setting|system default|match system|light|dark|dim|default|grid|list|table|board|cards?|gallery|kanban|compact|comfortable|cozy|spacious|dense|day|week|month|year)( mode| theme| view)?$/i;
// The option controls on this page, with the options each one shows right now.
//   group: a radio group, or a row of 2 to 6 buttons where one is pressed (a segmented control)
//   button: one button named like a theme or view switcher. Clicking shows whether it cycles or opens a list.
const FIND_OPTIONS = ([lookName, lookMenu]) => {
  const LOOK = new RegExp(lookName, 'i'), MENU = new RegExp(lookMenu, 'i');
  const vis = el => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
  const text = el => (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
  const nameOf = el => (text(el) || el.getAttribute('aria-label') || el.getAttribute('title') || '').slice(0, 40);
  const on = el => el.getAttribute('aria-checked') === 'true' || el.getAttribute('aria-pressed') === 'true' || el.getAttribute('aria-selected') === 'true' || /^(on|checked|active)$/.test(el.dataset.state || '');
  const mark = el => { if (!el.dataset.sro) { window.__srOptN = (window.__srOptN || 0) + 1; el.dataset.sro = 'o' + window.__srOptN; } return el.dataset.sro; };
  const labelOf = box => {
    const by = (box.getAttribute('aria-labelledby') || '').split(/\s+/).map(id => document.getElementById(id)).filter(Boolean).map(text).join(' ');
    const near = box.previousElementSibling && /^(LABEL|LEGEND|H[1-6]|SPAN|P|DT)$/.test(box.previousElementSibling.tagName) ? text(box.previousElementSibling) : '';
    const legend = box.closest('fieldset') && box.closest('fieldset').querySelector('legend') ? text(box.closest('fieldset').querySelector('legend')) : '';
    return (box.getAttribute('aria-label') || by || legend || (near.length <= 40 ? near : '')).slice(0, 40);
  };
  document.querySelectorAll('[data-sropt]').forEach(el => { delete el.dataset.sropt; });
  const out = [], taken = new Set();
  const group = (box, items) => {
    items = items.filter(vis);
    if (items.length < 2 || items.length > 6 || box.closest('[role=dialog], dialog, [role=menu], [role=tablist], form[action]')) return;
    if (items.some(i => i.disabled || i.getAttribute('aria-disabled') === 'true' || !nameOf(i))) return;
    const m = mark(box);
    items.forEach((el, i) => { el.dataset.sropt = `${m}:${i}`; taken.add(el); });
    const act = items.find(on);
    const sec = box.closest('section, article, aside, main, [class*=settings i], [class*=preferences i]');
    out.push({ mark: m, form: 'group', name: labelOf(box), options: items.map(nameOf), active: act ? nameOf(act) : null, place: sec ? text(sec.querySelector('h1, h2, h3, [role=heading]') || { innerText: '' }).slice(0, 60) : '' });
  };
  document.querySelectorAll('[role=radiogroup]').forEach(box => { if (vis(box)) group(box, [...box.querySelectorAll('[role=radio]')]); });
  const parents = new Set([...document.querySelectorAll('button[aria-pressed], [role=button][aria-pressed]')].filter(b => vis(b) && !taken.has(b)).map(b => b.parentElement));
  for (const box of parents) {
    const kids = [...box.children].filter(vis);
    const pressed = kids.filter(k => k.hasAttribute('aria-pressed'));
    // A segmented control: every button in the row can be pressed, and exactly one is.
    // (A row this check already marked stays one, even when a pick left nothing pressed.)
    if (pressed.length === kids.length && (pressed.filter(on).length === 1 || box.dataset.sro)) group(box, pressed);
  }
  for (const el of document.querySelectorAll('button, [role=button]')) {
    if (!vis(el) || taken.has(el) || el.disabled || el.hasAttribute('aria-pressed') || el.closest('[role=dialog], dialog, [role=menu], [role=radiogroup]')) continue;
    const said = (el.getAttribute('aria-label') || el.getAttribute('title') || text(el) || '').slice(0, 40);
    const pops = (el.hasAttribute('aria-haspopup') && el.getAttribute('aria-haspopup') !== 'false') || el.hasAttribute('aria-expanded');
    if (!said || !(LOOK.test(said) || (pops && MENU.test(said)))) continue;
    out.push({ mark: mark(el), form: 'button', name: said, options: [], active: null, place: '', pops });
  }
  return out;
};
// What a look switcher is set to right now: its own name, and the theme the page carries.
const LOOK_STATE = (m) => {
  const el = document.querySelector(`[data-sro="${m}"]`);
  const text = x => (x.innerText || x.textContent || '').replace(/\s+/g, ' ').trim();
  const html = document.documentElement;
  const theme = [html.dataset.theme, html.dataset.mode, html.dataset.colorScheme, [...html.classList].filter(c => /^(light|dark|system|auto|dim)$/i.test(c)).join(' '), document.body && document.body.dataset.theme, html.style.colorScheme].filter(Boolean).join(' ');
  const name = el ? ((el.getAttribute('aria-label') || el.getAttribute('title') || text(el) || '').slice(0, 40)) : null;
  const icon = el ? ((el.querySelector('svg, i, use, [data-icon]') || { getAttribute: () => '' }).getAttribute('class') || '') + ((el.querySelector('use') || { getAttribute: () => '' }).getAttribute('href') || '') + (el.dataset.icon || '') : '';
  return { name, theme, key: `${name}|${theme}|${icon}` };
};
// The items of the menu or list that is open right now.
const OPEN_ITEMS = (layers) => {
  const vis = el => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
  const text = el => (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
  document.querySelectorAll('[data-sritem]').forEach(el => { delete el.dataset.sritem; });
  const layer = [...document.querySelectorAll(layers)].filter(vis).pop();
  if (!layer) return null;
  const items = [...layer.querySelectorAll('[role=menuitemradio], [role=menuitem], [role=option], [role=radio]')].filter(vis);
  items.forEach((el, i) => { el.dataset.sritem = String(i); });
  const on = el => el.getAttribute('aria-checked') === 'true' || el.getAttribute('aria-selected') === 'true' || /^(on|checked|active)$/.test(el.dataset.state || '');
  const act = items.find(on);
  return { options: items.map(el => (text(el) || el.getAttribute('aria-label') || '').slice(0, 40)), active: act ? text(act).slice(0, 40) : null, links: items.some(el => el.matches('a[href]') || el.querySelector('a[href]')) };
};
const optionRows = [];
const seenOptions = new Set();
async function optionPass(url, width) {
  const where = new URL(url).pathname + new URL(url).hash;
  const found = await page.evaluate(FIND_OPTIONS, [LOOK_NAME.source, LOOK_MENU.source]).catch(() => []);
  const again = async c => (await page.evaluate(FIND_OPTIONS, [LOOK_NAME.source, LOOK_MENU.source]).catch(() => [])).find(x => x.mark === c.mark) || null;
  const reload = async () => { await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => null); await settle(page, { timeout: 6000 }); };
  for (const c of found) {
    const key = `${c.form}|${c.name}|${c.options.join(',')}`;
    if (seenOptions.has(key)) continue;
    seenOptions.add(key);
    const label = c.name || c.options.join(' / ');
    const row = { page: local(url), width, control: label, form: c.form, options_before: c.options, was: c.active, picks: [], vanished: [], ends_on: null, restored: null, skipped: null };
    optionRows.push(row);
    const words = `${c.name} ${c.options.join(' ')}`;
    const look = LOOK_NAME.test(c.name) || LOOK_MENU.test(c.name) || (c.options.length > 0 && c.options.every(o => LOOK_OPTION.test(o)));
    const ruledOut = heldBy(limits, c.name) || c.options.map(o => heldBy(limits, o)).find(Boolean);
    if (ruledOut) { row.skipped = `held: the owner ruled this out ("${ruledOut.action}")`; row.held_by = ruledOut.action; }
    else if (DANGER.test(words) || ACCOUNT_NAME.test(words) || OPTION_RISK.test(words)) row.skipped = 'risky or account-wide words: needs its own yes';
    else if (!look && (ACCOUNT_PLACE.test(where) || ACCOUNT_PLACE.test(c.place))) row.skipped = 'on a settings or account screen, and not about the look of the app: needs its own yes';
    else if (optionRows.filter(r => !r.skipped && r.page === row.page).length > 6) row.skipped = 'page limit reached';
    if (row.skipped) continue;
    errs = [];
    let s0 = null;
    if (c.form === 'group') {
      // The selected option goes last: picking it again puts the control back as it was.
      for (const o of [...c.options.filter(x => x !== c.active), ...c.options.filter(x => x === c.active)]) {
        const now = await again(c);
        if (!now) { row.note = 'the control went away after a pick'; break; }
        const i = now.options.indexOf(o);
        if (i < 0) continue; // already gone: reported below
        if (!(await page.click(`[data-sropt="${c.mark}:${i}"]`, { timeout: 3000 }).then(() => true).catch(() => false))) continue;
        await settle(page, { timeout: 3000 });
        const after = await again(c);
        if (!after) { row.picks.push({ picked: o, shows: [] }); row.note = 'the control went away after a pick'; break; }
        const shown = after.options;
        row.picks.push({ picked: o, shows: shown });
        for (const gone of c.options.filter(x => !shown.includes(x) && !row.vanished.some(v => v.option === x))) row.vanished.push({ option: gone, after_picking: o, shows: shown });
      }
      // Put it back: pick what was selected before.
      let now = await again(c);
      if (c.active && now && now.active !== c.active && now.options.includes(c.active)) { await page.click(`[data-sropt="${c.mark}:${now.options.indexOf(c.active)}"]`, { timeout: 3000 }).catch(() => null); await settle(page, { timeout: 3000 }); now = await again(c); }
      row.ends_on = now ? now.active : null;
      row.restored = !c.active ? null : (!!now && now.active === c.active);
    } else {
      // One button: does it open a list, or step through the options itself?
      s0 = await page.evaluate(LOOK_STATE, c.mark).catch(() => null);
      const sel = `[data-sro="${c.mark}"]`;
      const before = await page.evaluate(STATE).catch(() => ({ open: [] }));
      if (!s0 || !(await page.click(sel, { timeout: 3000 }).then(() => true).catch(() => false))) { row.skipped = 'could not click (covered or moved)'; continue; }
      await settle(page, { timeout: 2500 });
      const opened = (await page.evaluate(STATE).catch(() => ({ open: [] }))).open.filter(o => !before.open.includes(o));
      if (opened.length) {
        row.form = 'menu';
        const first = await page.evaluate(OPEN_ITEMS, LAYERS).catch(() => null);
        const safe = first && first.options.length >= 2 && first.options.length <= 6 && !first.links && first.options.every(o => o && LOOK_OPTION.test(o));
        if (!safe) { row.skipped = 'opens a list that is not a short set of look options'; await page.keyboard.press('Escape').catch(() => {}); await page.waitForTimeout(200); continue; }
        row.options_before = first.options; row.was = first.active;
        const openMenu = async () => { let it = await page.evaluate(OPEN_ITEMS, LAYERS).catch(() => null); if (!it) { await page.click(sel, { timeout: 3000 }).catch(() => null); await settle(page, { timeout: 2000 }); it = await page.evaluate(OPEN_ITEMS, LAYERS).catch(() => null); } return it; };
        const pick = async o => { const it = await openMenu(); const i = it ? it.options.indexOf(o) : -1; if (i < 0) return false; const ok = await page.click(`[data-sritem="${i}"]`, { timeout: 3000 }).then(() => true).catch(() => false); await settle(page, { timeout: 2500 }); return ok; };
        for (const o of first.options) {
          if (!(await pick(o))) continue;
          const it = await openMenu();
          const shown = it ? it.options : [];
          row.picks.push({ picked: o, shows: shown });
          for (const gone of first.options.filter(x => !shown.includes(x) && !row.vanished.some(v => v.option === x))) row.vanished.push({ option: gone, after_picking: o, shows: shown });
        }
        // Put it back: the option that was checked, or the one that brings the first state back.
        let back = false;
        for (const o of (first.active ? [first.active] : first.options)) {
          if (!(await pick(o))) continue;
          const s = await page.evaluate(LOOK_STATE, c.mark).catch(() => null);
          if (first.active || (s && s.key === s0.key)) { back = !!s && (s.key === s0.key || !!first.active); row.ends_on = o; break; }
        }
        row.restored = back;
        await page.keyboard.press('Escape').catch(() => {});
        await page.waitForTimeout(200);
      } else {
        row.form = 'cycle';
        const states = [s0];
        let closedAt = -1;
        let s = await page.evaluate(LOOK_STATE, c.mark).catch(() => null);
        for (let n = 0; s && n < 7; n++) {
          const j = states.findIndex(x => x.key === s.key);
          if (j >= 0) { closedAt = j; break; }
          states.push(s);
          row.picks.push({ picked: `click ${n + 1}`, shows: [s.name !== s0.name || !s.theme ? s.name : s.theme] });
          if (!(await page.click(sel, { timeout: 3000 }).then(() => true).catch(() => false))) break;
          await settle(page, { timeout: 2500 });
          s = await page.evaluate(LOOK_STATE, c.mark).catch(() => null);
        }
        const names = states.some(x => x.name !== s0.name) || !s0.theme ? states.map(x => x.name) : states.map(x => x.theme);
        row.options_before = names; row.was = names[0];
        if (states.length === 1) { row.skipped = 'clicking it changed nothing that could be read'; continue; }
        if (closedAt > 0) for (const gone of names.slice(0, closedAt)) row.vanished.push({ option: gone, after_picking: 'one click', shows: names.slice(closedAt) });
        row.ends_on = s ? (names[states.findIndex(x => x.key === s.key)] || s.name) : null;
        row.restored = closedAt === 0;
      }
    }
    row.errors = [...new Set(errs)].slice(0, 5);
    // Not back by clicking: does a reload bring the first state back?
    if (row.restored === false) {
      await reload();
      if (c.form === 'group') { const now = (await page.evaluate(FIND_OPTIONS, [LOOK_NAME.source, LOOK_MENU.source]).catch(() => [])).find(x => x.name === c.name && x.form === 'group'); row.back_after_reload = !!now && now.active === c.active; }
      else {
        const now = (await page.evaluate(FIND_OPTIONS, [LOOK_NAME.source, LOOK_MENU.source]).catch(() => [])).find(x => x.form === 'button' && x.name === c.name);
        const s = now ? await page.evaluate(LOOK_STATE, now.mark).catch(() => null) : null;
        row.back_after_reload = !!s && !!s0 && s.key === s0.key;
      }
    }
    if (row.vanished.length) {
      const v = row.vanished[0];
      const shot = `E${String(++shotN).padStart(3, '0')}-option-${label.replace(/[^a-z0-9]+/gi, '-').slice(0, 24)}.png`;
      const ok = await page.screenshot({ path: join(outDir, shot) }).then(() => true).catch(() => false);
      const left = row.restored === false ? `. It was on "${row.was}" before this check and ${row.back_after_reload ? 'only a reload put it back' : `could not be put back (it is now on "${row.ends_on || 'another option'}")`}: tell the owner and list it in Left behind` : '';
      lead('option-vanished', `The "${label}" control loses an option after use: it offered ${row.options_before.join(', ')}. After ${row.form === 'cycle' ? v.after_picking : `picking "${v.after_picking}"`} it only offers ${v.shows.join(', ') || 'nothing'}, so ${row.vanished.map(x => `"${x.option}"`).join(' and ')} can no longer be picked${left}`, url, width, ok ? shot : null,
        { group: `option|${label}`, detail: { control: label, form: row.form, options: row.options_before, vanished: row.vanished, restored: row.restored, back_after_reload: row.back_after_reload || false } });
    } else if (row.restored === false) lead('option-not-restored', `The "${label}" control could not be put back to "${row.was}"${row.back_after_reload ? ' by clicking: only a reload put it back' : `: it is now on "${row.ends_on || 'another option'}". Tell the owner and list it in Left behind`}`, url, width, null, { group: `option-left|${label}` });
    if ((row.errors || []).length) lead('error-on-click', `Picking an option of "${label}" caused ${row.errors.length} error(s): ${row.errors[0]}`, url, width);
    // After a reload or a menu, mark the page's controls again for whatever runs next.
    await markControls();
  }
}
// ---- Two controls that open the same thing ------------------------------------------------------
// The menu or list that is open right now: its label and the names of its options. Dialogs do not
// count: two ways into one dialog (a button and an empty-state link) are normal.
const MENU_OF = (layers) => {
  const vis = el => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
  const text = el => (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
  const layer = [...document.querySelectorAll(layers)].filter(l => vis(l) && !l.matches('[role=dialog], [role=alertdialog], dialog, [aria-modal=true]')).pop();
  if (!layer) return null;
  let items = [...layer.querySelectorAll('[role=menuitem], [role=menuitemradio], [role=menuitemcheckbox], [role=option], [role=radio]')].filter(vis);
  if (items.length < 2 && layer.matches('[role=menu], [role=listbox]')) items = [...layer.querySelectorAll('li, button, a')].filter(x => vis(x) && !x.querySelector('li, button, a'));
  const options = [...new Set(items.map(i => (text(i) || i.getAttribute('aria-label') || '').replace(/\s+/g, ' ').slice(0, 40).toLowerCase()).filter(Boolean))];
  if (options.length < 2) return null;
  if (!layer.dataset.srmenu) { window.__srMenuN = (window.__srMenuN || 0) + 1; layer.dataset.srmenu = 'u' + window.__srMenuN; }
  const by = (layer.getAttribute('aria-labelledby') || '').split(/\s+/).map(id => document.getElementById(id)).filter(Boolean).map(text).join(' ');
  return { id: layer.dataset.srmenu, label: (layer.getAttribute('aria-label') || by || '').slice(0, 40), options, shown: items.slice(0, 5).map(i => text(i).slice(0, 30)) };
};
// The list a control repeats in, if any: a row menu on every row of a table is one control, not many.
const ROW_OF = (sel) => {
  const el = document.querySelector(sel);
  if (!el) return null;
  const sig = x => x.tagName + '.' + [...x.classList].sort().join('.');
  for (let x = el.parentElement, d = 0; x && x.parentElement && d < 5; x = x.parentElement, d++) {
    const sibs = [...x.parentElement.children].filter(k => k !== x && sig(k) === sig(x) && [...k.querySelectorAll(el.tagName)].some(b => sig(b) === sig(el)));
    if (sibs.length >= 2) { if (!x.parentElement.dataset.srrow) { window.__srRowN = (window.__srRowN || 0) + 1; x.parentElement.dataset.srrow = 'r' + window.__srRowN; } return x.parentElement.dataset.srrow; }
  }
  return null;
};
// ---- Fields with no visible label ---------------------------------------------------------------
// Every text field on the page, with what names it for a sighted user right now.
const FIND_FIELDS = () => {
  const vis = el => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) > 0.05; };
  const text = el => (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
  const FIELD = 'input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=file]):not([type=submit]):not([type=button]):not([type=reset]):not([type=image]):not([type=range]):not([type=color]), textarea';
  const all = [...document.querySelectorAll(FIELD)].filter(el => vis(el) && !el.disabled && !el.readOnly && !el.closest('[role=dialog], dialog, [aria-hidden="true"]'));
  document.querySelectorAll('[data-srf]').forEach(el => { delete el.dataset.srf; });
  const out = [];
  all.forEach((el, i) => {
    el.dataset.srf = String(i);
    const r = el.getBoundingClientRect();
    const hint = (el.getAttribute('placeholder') || el.getAttribute('aria-label') || el.getAttribute('title') || el.getAttribute('name') || '').replace(/\s+/g, ' ').trim().slice(0, 40);
    const form = el.closest('form') || el.parentElement.parentElement || el.parentElement;
    const peers = [...form.querySelectorAll(FIELD)].filter(vis);
    const search = el.type === 'search' || el.getAttribute('role') === 'searchbox' || !!el.closest('[role=search]') || /search|find|filter/i.test(`${hint} ${el.id} ${el.name || ''}`);
    // A lone box with a send button (a message box, a subscribe box) is named by that button.
    const lone = peers.length === 1 && (el.tagName === 'TEXTAREA' || !!form.querySelector('button, [role=button], input[type=submit]'));
    const signIn = !!form.querySelector('input[type=password]') || el.type === 'password' || /login|sign-?in|signin|log-?in/i.test(location.pathname + location.hash);
    // A label next to the field: its own <label>, the text it is labelled by, or plain text that sits
    // right above it or to its left. Text that lies over the box (a floating label) is noted apart.
    const lab = (el.labels && [...el.labels].find(l => vis(l) && text(l))) || null;
    const by = (el.getAttribute('aria-labelledby') || '').split(/\s+/).map(id => document.getElementById(id)).filter(x => x && vis(x) && text(x))[0] || null;
    const over = b => b.left < r.right - 4 && b.right > r.left + 4 && b.top < r.bottom - 2 && b.bottom > r.top + 2;
    let beside = false, floating = null;
    for (const cand of [lab, by].filter(Boolean)) {
      // The label's own words, not the field it wraps.
      const range = document.createRange();
      const node = [...cand.childNodes].find(n => n.nodeType === 3 && n.textContent.trim()) || [...cand.querySelectorAll('*')].find(x => !x.contains(el) && x !== el && vis(x) && text(x)) || cand;
      range.selectNodeContents(node);
      const b = range.getBoundingClientRect();
      if (b.width < 2) continue;
      if (over(b)) floating = text(node.nodeType === 3 ? node.parentElement : node).replace(el.value || '\u0000', '').slice(0, 40) || 'label'; else beside = true;
    }
    if (!beside && !floating) {
      // Plain text near the field that is not tied to it in the code.
      const scope = el.closest('form, fieldset, section, main, [class*=field i], [class*=form i]') || document.body;
      const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
      const range = document.createRange();
      for (let t = walker.nextNode(); t; t = walker.nextNode()) {
        const words = t.textContent.replace(/\s+/g, ' ').trim();
        const p = t.parentElement;
        if (words.length < 2 || !p || !vis(p) || p === el || p.closest('button, [role=button], a, option, script, style')) continue;
        range.selectNodeContents(t);
        const b = range.getBoundingClientRect();
        if (b.width < 2) continue;
        if (over(b)) { floating = words.slice(0, 40); break; }
        const above = b.bottom <= r.top + 2 && r.top - b.bottom <= 28 && b.left < r.right && b.right > r.left - 4 && b.left >= r.left - 12;
        const left = b.right <= r.left + 2 && r.left - b.right <= 160 && b.top < r.bottom && b.bottom > r.top;
        if (above || left) { beside = true; break; }
      }
    }
    out.push({ i, hint, kind: el.tagName === 'TEXTAREA' ? 'text area' : el.type || 'text', beside, floating, search, lone, signIn, empty: !el.value });
  });
  return out;
};
// After 1 character was typed into the field: is anything still naming it? Words above the typed
// text inside the box, or right above the box, that are not the typed text itself.
const LABEL_WHILE_TYPING = (i) => {
  const el = document.querySelector(`[data-srf="${i}"]`);
  if (!el) return null;
  const vis = x => { const r = x.getBoundingClientRect(); const s = getComputedStyle(x); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
  const seen = x => { for (let y = x; y && y !== document.documentElement; y = y.parentElement) if (Number(getComputedStyle(y).opacity) < 0.3) return false; return true; };
  const r = el.getBoundingClientRect();
  const scope = el.closest('form, fieldset, section, main, [class*=field i], [class*=form i]') || document.body;
  const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  for (let t = walker.nextNode(); t; t = walker.nextNode()) {
    const words = t.textContent.replace(/\s+/g, ' ').trim();
    const p = t.parentElement;
    if (words.length < 2 || !p || !vis(p) || !seen(p) || p.closest('button, [role=button], a, option, script, style, [role=alert], [class*=error i], [class*=hint i], [class*=help i]')) continue;
    range.selectNodeContents(t);
    const b = range.getBoundingClientRect();
    if (b.width < 2 || b.height < 4) continue;
    // In the upper part of the box or just above it, and lined up with it.
    if (b.left < r.right && b.right > r.left && b.left >= r.left - 12 && b.bottom > r.top - 28 && b.top < r.top + r.height * 0.6) return words.slice(0, 40);
  }
  return null;
};
const fieldRows = [];
async function labelPass(url, width) {
  const fields = await page.evaluate(FIND_FIELDS).catch(() => []);
  const unlabeled = [];
  for (const f of fields) {
    f.hint = f.hint || f.floating || '';
    const row = { page: local(url), field: f.hint || f.kind, kind: f.kind, label: null, typed: false };
    fieldRows.push(row);
    if (f.beside) { row.label = 'a label next to the field'; continue; }
    if (f.search || f.lone) { row.label = f.search ? 'a search box: a hint is enough' : 'a lone box named by its button'; continue; }
    // Type 1 character and look. On a live app only into sign-in fields that are empty (search
    // fields were handled above), and Enter is never pressed.
    const mayType = f.empty && f.kind !== 'date' && f.kind !== 'time' && f.kind !== 'number' && (!remote || f.signIn);
    if (mayType) {
      const sel = `[data-srf="${f.i}"]`;
      const ok = await page.focus(sel, { timeout: 2000 }).then(() => true).catch(() => false);
      if (ok) {
        await page.keyboard.type('a').catch(() => {});
        await page.waitForTimeout(350);
        const still = await page.evaluate(LABEL_WHILE_TYPING, f.i).catch(() => null);
        await page.keyboard.press('Backspace').catch(() => {});
        await page.evaluate(s2 => { const el = document.querySelector(s2); if (el) { if (el.value) el.value = ''; el.blur(); } }, sel).catch(() => {});
        await page.waitForTimeout(150);
        row.typed = true;
        if (still) { row.label = `a floating label: "${still}" stays in view while typing`; continue; }
        row.label = null;
        unlabeled.push({ ...f, why: f.floating ? `"${f.floating}" goes away once something is typed` : 'only a hint inside the box, which goes away once something is typed' });
        continue;
      }
    }
    // Not typed into: text lying over the box is taken as a floating label, and said so.
    if (f.floating) { row.label = `text over the box ("${f.floating}"), taken as a floating label: not checked by typing`; continue; }
    unlabeled.push({ ...f, why: 'only a hint inside the box, which goes away once something is typed' });
  }
  if (!unlabeled.length) return;
  const names = unlabeled.map(f => `"${f.hint || f.kind}"`);
  const shot = `E${String(++shotN).padStart(3, '0')}-unlabeled-field.png`;
  const ok = await page.locator(`[data-srf="${unlabeled[0].i}"]`).first().evaluate(el => (el.closest('form') || el.parentElement).scrollIntoView({ block: 'center' })).then(() => page.screenshot({ path: join(outDir, shot) })).then(() => true).catch(() => false);
  lead('unlabeled-field', `${unlabeled.length === 1 ? 'A field has' : `${unlabeled.length} fields have`} no visible label: ${names.slice(0, 4).join(', ')}${names.length > 4 ? ` and ${names.length - 4} more` : ''}. ${unlabeled[0].why.charAt(0).toUpperCase() + unlabeled[0].why.slice(1)}`, url, width, ok ? shot : null,
    { group: 'unlabeled-field', detail: { count: unlabeled.length, fields: unlabeled.slice(0, 8).map(f => ({ field: f.hint || f.kind, kind: f.kind, why: f.why })) } });
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
        const [danger, opener, allow, isRemote, sel, lookName] = args;
        const D = new RegExp(danger, 'i'), O = new RegExp(opener, 'i'), L = new RegExp(lookName, 'i');
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
          // "Create", "Add" and "New" may open a form, or may make the item at once. On a live app only
          // the ones that show they open something are safe: a pop-up, or a link to a new page.
          const makes = /\b(create|add|new)\b/i.test(name);
          const link = el.closest('a[href]');
          const showsItOpens = (el.hasAttribute('aria-haspopup') && el.getAttribute('aria-haspopup') !== 'false') || el.hasAttribute('aria-expanded') || el.tagName === 'SUMMARY' || (!!link && !/^(#|javascript:|)$/i.test((link.getAttribute('href') || '').trim()));
          const allowed = allow.some(a => name.toLowerCase().includes(a));
          const toggle = el.matches('[role=switch], [role=checkbox], [role=menuitemcheckbox], [aria-pressed], [aria-checked]');
          // A theme switcher that steps through its options on each click changes a preference.
          const look = L.test(aria || text) && !opens;
          let click = true, why = '';
          if (toggle) { click = false; why = 'a switch: flipped only with the owner\'s yes (--use)'; }
          else if (look) { click = false; why = 'a theme switcher: its options are picked only with the owner\'s yes, or when not signed in (see Option controls)'; }
          else if (D.test(name) && !allowed) { click = false; why = 'risky word'; }
          else if (submit && !allowed) { click = false; why = 'submits a form'; }
          else if (isRemote && makes && !allowed && !showsItOpens) { click = false; why = 'could create an item'; }
          else if (isRemote && !allowed && !opens && !O.test(name)) { click = false; why = name ? 'could change data' : 'no name, unknown effect'; }
          const r = el.getBoundingClientRect();
          out.push({ i, name: name || '(no name)', iconOnly, hasName: !!name, click, why, y: Math.round(r.top) });
        });
        return out;
      }, [DANGER.source, OPENER.source, allow, remote, CONTROLS, LOOK_NAME.source]);

      // Markers on list items (star, pin, bookmark...), read before anything is opened. Whether a
      // filter for them exists is decided after the menus on this page have been opened and read.
      const markers = firstWidth ? await page.evaluate(MARKERS).catch(() => []) : [];
      const layerTexts = [];
      const menus = []; // what each control on this page opened, to find two controls that do the same job
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
            // Before the hover: how wide is the rail or bar this icon sits in?
            const railBefore = await page.evaluate(s => { const el = document.querySelector(s); const rail = el && el.closest('nav, aside, [role=navigation], [class*=rail i], [class*=sidebar i], [class*=sidenav i]'); return rail ? Math.round(rail.getBoundingClientRect().width) : null; }, sel).catch(() => null);
            await page.hover(sel, { timeout: 2000 }).catch(() => null);
            await page.waitForTimeout(700);
            row.tooltip = await page.evaluate(([s, was]) => {
              const el = document.querySelector(s); if (!el) return null;
              const tip = [...document.querySelectorAll('[role=tooltip], [data-tooltip], .tooltip, [class*=tooltip i]')].find(t => { const r = t.getBoundingClientRect(); return r.width > 0 && r.height > 0 && (t.innerText || '').trim(); });
              if (tip) return tip.innerText.trim().slice(0, 60);
              if (el.getAttribute('title')) return el.getAttribute('title');
              // A rail that opens on hover: the icon now shows its words, or the rail grew and shows them beside it.
              const vis = x => { const r = x.getBoundingClientRect(); const st = getComputedStyle(x); return r.width > 4 && r.height > 4 && st.visibility !== 'hidden' && st.display !== 'none' && Number(st.opacity) > 0.3; };
              const words = (el.innerText || '').replace(/\s+/g, ' ').trim();
              const own = [...el.querySelectorAll('*')].find(x => vis(x) && /[\p{L}]{2,}/u.test([...x.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join('')));
              if (/[\p{L}]{2,}/u.test(words) && own) return `label shown on hover: "${words.slice(0, 40)}"`;
              const rail = el.closest('nav, aside, [role=navigation], [class*=rail i], [class*=sidebar i], [class*=sidenav i]');
              const name = (el.getAttribute('aria-label') || '').trim().toLowerCase();
              if (rail && was !== null && rail.getBoundingClientRect().width - was >= 40 && name && [...rail.querySelectorAll('*')].some(x => !el.contains(x) && vis(x) && (x.innerText || '').replace(/\s+/g, ' ').trim().toLowerCase() === name)) return `label shown on hover: the rail opens and shows "${name}"`;
              return null;
            }, [sel, railBefore]).catch(() => null);
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
        else if (await page.evaluate(s2 => { const el = document.querySelector(s2); return !!el && el.getAttribute('role') === 'tab' && el.getAttribute('aria-selected') === 'true'; }, sel).catch(() => false)) row.result = 'changed the page (the tab is selected)';
        else row.result = 'nothing visible happened';
        if (/^opened|changed/.test(row.result)) {
          row.shot = `E${String(++shotN).padStart(3, '0')}-${routeId}-${c.name.replace(/[^a-z0-9]+/gi, '-').slice(0, 24)}${firstWidth ? '' : `-${width}`}.png`;
          await page.screenshot({ path: join(outDir, row.shot) }).catch(() => { row.shot = null; });
        }
        // Look inside what opened: is any of its text cut off at this width? And did the page behind a
        // menu or dialog jump when it opened? (An accordion or a tab is meant to move the page.)
        if (newOpen.length && !picker) {
          layerTexts.push(await page.evaluate(sel => [...document.querySelectorAll(sel)].map(e => e.innerText || '').join('\n'), LAYERS).catch(() => ''));
          if (!earlier) {
            const menu = await page.evaluate(MENU_OF, LAYERS).catch(() => null);
            if (menu) menus.push({ name: c.name, shot: row.shot, row: await page.evaluate(ROW_OF, sel).catch(() => null), ...menu });
          }
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
      // Two controls with different names that open the same menu, or menus with the same options.
      const paired = new Set();
      for (let i = 0; i < menus.length; i++) for (let j = i + 1; j < menus.length; j++) {
        const a = menus[i], b = menus[j];
        if (paired.has(i) || paired.has(j) || a.name === b.name || (a.row && a.row === b.row)) continue;
        const common = a.options.filter(o => b.options.includes(o)).length;
        if (a.id !== b.id && common / Math.max(a.options.length, b.options.length) <= 0.8) continue;
        paired.add(i); paired.add(j);
        const what = a.label ? `the "${a.label}" menu` : `${a.id === b.id ? 'the same menu' : 'a menu with the same options'} (${a.shown.slice(0, 4).join(', ')})`;
        lead('duplicate-on-screen', `Two controls do the same job here: "${a.name}" and "${b.name}" both open ${what}`, url, width, a.shot || b.shot, { group: `duplicate-opens|${a.name}|${b.name}`, detail: { how: 'opens', controls: [a.name, b.name], menu: a.label || null, options: a.shown, same_menu: a.id === b.id, options_in_common: common, of: Math.max(a.options.length, b.options.length) } });
      }
      // A marker you can set should be filterable: a star with no "Starred" filter, tab, chip or sort option.
      for (const m of markers) {
        if (m.offer || layerTexts.some(t => new RegExp(m.filter, 'i').test(t))) continue;
        const shot = `E${String(++shotN).padStart(3, '0')}-${routeId}-marker-${m.family}.png`;
        const ok = await page.locator(`[data-srmark="${m.family}"]`).first().screenshot({ path: join(outDir, shot), timeout: 4000 }).then(() => true).catch(() => page.screenshot({ path: join(outDir, shot) }).then(() => true).catch(() => false));
        lead('marker-no-filter', `You can ${m.verb} items but not see only ${m.done} items. ${m.items} items on this screen carry a "${m.control}" control, and no filter, tab, chip or sort option on it uses that word`, url, width, ok ? shot : null, { group: `marker|${m.family}`, detail: { marker: m.control, items: m.items, family: m.family } });
      }
      // Fields with no visible label. A floating label counts as one: typed into to find out.
      if (firstWidth) await labelPass(url, width);
      // With the owner's yes: the switches that sit on the page itself.
      if (USE && firstWidth) await flipToggles({ url, width, routeId, opener: null, reopen: null });
      // With the owner's yes, or when not signed in: pick each option of the theme switchers, view
      // toggles and segmented controls, and see whether an option vanishes.
      if (PICK && firstWidth) await optionPass(url, width);
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
    // Back goes back: follow the links between pages and try each in-app back control.
    await backPass(width, firstWidth ? 24 : 12);
    // Sibling tabs: open each tab of a section and compare where the content starts and what sits on top.
    await tabPass(width);
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

// A back control that lands somewhere other than the page the user came from. One lead per control,
// with the 3 pages of the first route that went wrong, and what the other routes did.
for (const b of backControls.values()) {
  const wrong = b.routes.filter(r => r.result === 'went elsewhere');
  if (!wrong.length) continue;
  const first = wrong[0];
  const others = [...new Map(wrong.slice(1).filter(r => r.came_from !== first.came_from).map(r => [r.came_from, r])).values()];
  const right = [...new Set(b.routes.filter(r => r.result === 'went back').map(r => r.came_from))];
  const what = `Back does not go back: ${b.how === 'arrow' ? 'the left arrow' : `"${b.control}"`} on ${first.went_to} lands on ${first.landed_on}, not on the page the user came from. Came from ${first.came_from}, went to ${first.went_to}, landed on ${first.landed_on}`
    + (others.length ? `. Also from ${others.map(r => `${r.came_from} (landed on ${r.landed_on})`).join(', ')}` : '')
    + (right.length ? `. From ${right.join(', ')} it went back correctly` : '');
  for (const w of [...new Set(wrong.map(r => r.width))]) {
    const r = wrong.find(x => x.width === w);
    found.push({ kind: 'back-goes-elsewhere', what, page: r.url, width: w, shot: r.shot, group: `back|${b.page}|${b.control}`, detail: { control: b.control, came_from: first.came_from, went_to: first.went_to, landed_on: first.landed_on, routes: b.routes.map(({ url, ...x }) => x) } });
  }
}
const backs = [...backControls.values()].map(b => ({ ...b, routes: b.routes.map(({ url, ...x }) => x) }));

// The same lead on several pages or widths is one lead. Hover and dead-control leads are found once, at
// the first width a control is seen, so they do not say "at 1280 only".
const merged = mergeLeads(found.map((f, i) => ({ ...f, id: `E${i}` })), widths, local);
merged.forEach((l, i) => { l.id = `E${String(i + 1).padStart(2, '0')}`; if (!['clipped-text', 'no-name', 'back-goes-elsewhere'].includes(l.kind)) l.what = l.what.replace(/ \(at \d+ wide only\)$/, ''); });
const heldSwitches = toggles.filter(t => t.held_by);
const picked = optionRows.filter(r => r.picks.length);
const use = { enabled: USE, switches_found: toggles.length, switches_flipped: flipped.length, turned_back: flipped.filter(t => t.restored).length, not_turned_back: flipped.filter(t => !t.restored).map(t => t.switch),
  // Option picks count as actions only when they ran on the owner's yes (--use). Without it they ran signed out.
  option_controls_used: picked.length, option_picks: USE ? picked.reduce((a, r) => a + r.picks.length, 0) : 0, options_not_put_back: picked.filter(r => r.restored === false && !r.back_after_reload).map(r => r.control), options_back_after_reload: picked.filter(r => r.restored === false && r.back_after_reload).map(r => r.control),
  limits: limits ? { file: limits.file, owner_words: limits.owner_words, held_actions: limits.held.map(h => h.action), held_switches: heldSwitches.map(t => ({ switch: t.switch, page: t.page, held_by: t.held_by })) } : null };
const unique = [...explored.values()];
const wasClicked = r => !/^not clicked|^could not click/.test(r.result || '');
const openedCount = unique.filter(r => /^(opened|went|changed)/.test(r.result || '')).length;
const notClicked = unique.filter(r => /^not clicked/.test(r.result || ''));
const totals = { controls: unique.length, clicked: unique.filter(wasClicked).length, opened_something: openedCount, did_nothing: unique.filter(r => r.result === 'nothing visible happened').length, not_clicked: notClicked.length, caused_errors: unique.filter(r => r.errors.length).length };
writeFileSync(join(outDir, 'explore.json'), JSON.stringify({ target, widths, signed_in_with: ctx.mode !== 'none' ? ctx.label : null, totals, use, controls: rows, switches: toggles, options: optionRows, fields: fieldRows, back_controls: backs, tab_groups: tabGroups, leads: merged }, null, 2) + '\n');
const md = ['# Explore: every safe control', '',
  `${totals.controls} control(s) at ${widths.join(' and ')} wide: ${totals.opened_something} opened something, ${totals.did_nothing} did nothing visible, ${totals.not_clicked} not clicked, ${totals.caused_errors} caused errors.`, '',
  `For the pain map header: **Controls opened: ${totals.clicked} of ${totals.controls}**`, '',
  'Open what you can of the **not clicked** list by hand when its name makes the effect clear and it cannot save, send or spend. Every lead below goes in the pain map\'s **Script leads** table.', '',
  '## Leads', '', '| Lead | Check | What it found | Widths | Pages |', '| --- | --- | --- | --- | --- |',
  ...(merged.length ? merged.map(l => `| ${l.id} | ${l.kind} | ${l.what.replace(/\|/g, '/')} | ${l.widths.join(', ')} | ${l.pages.join(', ')} |`) : ['| none | | | | |']),
  ...(USE ? ['', '## Used as a user: switches flipped and turned back', '',
    `${use.switches_flipped} of ${use.switches_found} switch(es) flipped, ${use.turned_back} turned back.${use.not_turned_back.length ? ` **Not turned back: ${use.not_turned_back.join(', ')}. Tell the owner and list it in Left behind.**` : ''} Count each flipped switch as one action in the header's "Used as a user: yes (N actions)".`, '',
    ...(limits ? [`The owner's limits (${limits.file}): "${limits.owner_words}". Held and not flipped: ${heldSwitches.length ? [...new Set(heldSwitches.map(t => `"${t.switch}" (${t.held_by})`))].join(', ') : 'no switch matched a held action'}. Name what was held in Not verified.`, ''] : []),
    '| Page | Opened from | Switch | Was | Flipped to | Ends | What appeared away from the switch | Before | After |', '| --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    ...(toggles.length ? toggles.map(t => `| ${t.page} | ${t.opener || '(on the page)'} | ${t.switch.replace(/\|/g, '/')} | ${t.before === 'true' ? 'on' : 'off'} | ${t.skipped ? `not flipped: ${t.skipped}` : (t.after === 'true' ? 'on' : t.after === 'false' ? 'off' : t.after)} | ${t.skipped ? '' : (t.restored ? 'back as it was' : `NOT RESTORED (${t.final})`)} | ${t.added.map(a => `"${a.text}"${a.near_message_box ? ' (near the message box)' : ''}`).join(', ').replace(/\|/g, '/')}${t.url_changed ? ' · the URL changed' : ''} | ${t.shots.before || ''} | ${t.shots.after || ''} |`) : ['| none | | No switches found | | | | | | |'])]
    : ['', '## Switches', '', 'Not flipped. Flipping switches needs the owner\'s yes to "use the app like a real user" (then run this again with `--use`). Until then, write in Not verified: "How features behave when used (switches, sending, results)".']),
  '', '## Option controls', '', ...(optionRows.length ? [`${PICK ? (USE ? 'Picked with the owner\'s yes' : 'Picked because the run was not signed in (nothing is saved to an account)') : 'Not picked'}: each option of a theme switcher, view toggle or segmented control in turn, then the first state again. An option that can no longer be picked afterwards is an option-vanished lead.${USE && picked.length ? ` Count each pick as one action in the header's "Used as a user" count (${use.option_picks} picks).` : ''}${use.options_not_put_back.length ? ` **Not put back: ${use.options_not_put_back.join(', ')}. Tell the owner and list it in Left behind.**` : ''}${use.options_back_after_reload.length ? ` Back only after a reload: ${use.options_back_after_reload.join(', ')}.` : ''}`, '',
    '| Page | Control | Kind | Options at first | Was on | After each pick | Vanished | Ends |', '| --- | --- | --- | --- | --- | --- | --- | --- |',
    ...optionRows.map(r => `| ${r.page} | ${r.control.replace(/\|/g, '/')} | ${r.form} | ${r.options_before.join(', ').replace(/\|/g, '/')} | ${r.was || ''} | ${r.skipped ? `not picked: ${r.skipped}` : r.picks.map(p => `${p.picked}: ${p.shows.join(', ')}`).join(' · ').replace(/\|/g, '/')} | ${r.vanished.map(v => v.option).join(', ')} | ${r.skipped ? '' : r.restored === false ? (r.back_after_reload ? 'back after a reload' : `NOT PUT BACK (${r.ends_on || 'unknown'})`) : r.restored ? 'back as it was' : 'nothing was selected before'} |`)]
    : [PICK ? 'No theme switcher, view toggle or segmented control was found.' : 'Not checked. Picking options needs the owner\'s yes (run this again with `--use`).']),
  '', '## Back controls', '', ...(backs.length ? ['Each in-app back control was reached from another page and clicked. It should land on the page the user came from.', '', '| Back control | On page | Width | Came from | Landed on | Result |', '| --- | --- | --- | --- | --- | --- |',
    ...backs.flatMap(b => b.routes.map(r => `| ${b.control.replace(/\|/g, '/')} | ${r.went_to} | ${r.width} | ${r.came_from} | ${r.landed_on || ''} | ${r.result === 'went elsewhere' ? '**went elsewhere**' : r.result} |`))]
    : ['No in-app back control was found on a page reached from another page.']),
  '', '## Sibling tabs', '', ...(tabGroups.length ? ['Each tab of a section was opened. The content should start at the same height on every tab, with the same back control and title.', '', '| Tabs | Width | Tab | Content starts at | Back control | Page title | Top action |', '| --- | --- | --- | --- | --- | --- | --- |',
    ...tabGroups.flatMap(g => g.tabs.map(t => `| ${g.group.replace(/\|/g, '/')} | ${g.width} | ${t.name.replace(/\|/g, '/')} | ${t.content_top === null ? 'no content' : t.content_top + 'px'} | ${t.back ? 'yes' : 'no'} | ${(t.title || 'none').replace(/\|/g, '/')} | ${(t.top_action || 'none').replace(/\|/g, '/')} |`))]
    : ['No group of tabs or linked sub-pages was found.']),
  '', '## Controls', '', '| Page | Width | Control | Icon only | Tooltip | What happened | Errors | Screenshot |', '| --- | --- | --- | --- | --- | --- | --- | --- |',
  ...rows.map(r => `| ${r.page} | ${r.width} | ${r.control.replace(/\|/g, '/')} | ${r.icon_only ? 'yes' : ''} | ${r.tooltip || (r.icon_only && r.width > 500 ? 'none' : '')} | ${(r.result || '').replace(/\|/g, '/')} | ${r.errors.join('; ').replace(/\|/g, '/')} | ${r.shot || ''} |`)];
writeFileSync(join(outDir, 'explore.md'), md.join('\n') + '\n');
console.log(`explore: ${totals.controls} control(s), ${totals.opened_something} opened something, ${merged.length} lead(s), ${totals.not_clicked} not clicked${USE ? `, ${use.switches_flipped} switch(es) flipped and ${use.turned_back} turned back` : ''}${limits ? `, ${heldSwitches.length} held by the owner's limits` : ''} · ${outDir}`);
