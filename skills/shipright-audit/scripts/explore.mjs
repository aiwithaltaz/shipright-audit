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
    const ruledOut = heldBy(limits, t.name);
    if (ruledOut) { row.skipped = `held: the owner ruled this out ("${ruledOut.action}")`; row.held_by = ruledOut.action; }
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
          // "Create", "Add" and "New" may open a form, or may make the item at once. On a live app only
          // the ones that show they open something are safe: a pop-up, or a link to a new page.
          const makes = /\b(create|add|new)\b/i.test(name);
          const link = el.closest('a[href]');
          const showsItOpens = (el.hasAttribute('aria-haspopup') && el.getAttribute('aria-haspopup') !== 'false') || el.hasAttribute('aria-expanded') || el.tagName === 'SUMMARY' || (!!link && !/^(#|javascript:|)$/i.test((link.getAttribute('href') || '').trim()));
          const allowed = allow.some(a => name.toLowerCase().includes(a));
          const toggle = el.matches('[role=switch], [role=checkbox], [role=menuitemcheckbox], [aria-pressed], [aria-checked]');
          let click = true, why = '';
          if (toggle) { click = false; why = 'a switch: flipped only with the owner\'s yes (--use)'; }
          else if (D.test(name) && !allowed) { click = false; why = 'risky word'; }
          else if (submit && !allowed) { click = false; why = 'submits a form'; }
          else if (isRemote && makes && !allowed && !showsItOpens) { click = false; why = 'could create an item'; }
          else if (isRemote && !allowed && !opens && !O.test(name)) { click = false; why = name ? 'could change data' : 'no name, unknown effect'; }
          const r = el.getBoundingClientRect();
          out.push({ i, name: name || '(no name)', iconOnly, hasName: !!name, click, why, y: Math.round(r.top) });
        });
        return out;
      }, [DANGER.source, OPENER.source, allow, remote, CONTROLS]);

      // Markers on list items (star, pin, bookmark...), read before anything is opened. Whether a
      // filter for them exists is decided after the menus on this page have been opened and read.
      const markers = firstWidth ? await page.evaluate(MARKERS).catch(() => []) : [];
      const layerTexts = [];
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
          layerTexts.push(await page.evaluate(sel => [...document.querySelectorAll(sel)].map(e => e.innerText || '').join('\n'), LAYERS).catch(() => ''));
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
      // A marker you can set should be filterable: a star with no "Starred" filter, tab, chip or sort option.
      for (const m of markers) {
        if (m.offer || layerTexts.some(t => new RegExp(m.filter, 'i').test(t))) continue;
        const shot = `E${String(++shotN).padStart(3, '0')}-${routeId}-marker-${m.family}.png`;
        const ok = await page.locator(`[data-srmark="${m.family}"]`).first().screenshot({ path: join(outDir, shot), timeout: 4000 }).then(() => true).catch(() => page.screenshot({ path: join(outDir, shot) }).then(() => true).catch(() => false));
        lead('marker-no-filter', `You can ${m.verb} items but not see only ${m.done} items. ${m.items} items on this screen carry a "${m.control}" control, and no filter, tab, chip or sort option on it uses that word`, url, width, ok ? shot : null, { group: `marker|${m.family}`, detail: { marker: m.control, items: m.items, family: m.family } });
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
    // Back goes back: follow the links between pages and try each in-app back control.
    await backPass(width, firstWidth ? 24 : 12);
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
const use = { enabled: USE, switches_found: toggles.length, switches_flipped: flipped.length, turned_back: flipped.filter(t => t.restored).length, not_turned_back: flipped.filter(t => !t.restored).map(t => t.switch),
  limits: limits ? { file: limits.file, owner_words: limits.owner_words, held_actions: limits.held.map(h => h.action), held_switches: heldSwitches.map(t => ({ switch: t.switch, page: t.page, held_by: t.held_by })) } : null };
const unique = [...explored.values()];
const wasClicked = r => !/^not clicked|^could not click/.test(r.result || '');
const openedCount = unique.filter(r => /^(opened|went|changed)/.test(r.result || '')).length;
const notClicked = unique.filter(r => /^not clicked/.test(r.result || ''));
const totals = { controls: unique.length, clicked: unique.filter(wasClicked).length, opened_something: openedCount, did_nothing: unique.filter(r => r.result === 'nothing visible happened').length, not_clicked: notClicked.length, caused_errors: unique.filter(r => r.errors.length).length };
writeFileSync(join(outDir, 'explore.json'), JSON.stringify({ target, widths, signed_in_with: ctx.mode !== 'none' ? ctx.label : null, totals, use, controls: rows, switches: toggles, back_controls: backs, leads: merged }, null, 2) + '\n');
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
  '', '## Back controls', '', ...(backs.length ? ['Each in-app back control was reached from another page and clicked. It should land on the page the user came from.', '', '| Back control | On page | Width | Came from | Landed on | Result |', '| --- | --- | --- | --- | --- | --- |',
    ...backs.flatMap(b => b.routes.map(r => `| ${b.control.replace(/\|/g, '/')} | ${r.went_to} | ${r.width} | ${r.came_from} | ${r.landed_on || ''} | ${r.result === 'went elsewhere' ? '**went elsewhere**' : r.result} |`))]
    : ['No in-app back control was found on a page reached from another page.']),
  '', '## Controls', '', '| Page | Width | Control | Icon only | Tooltip | What happened | Errors | Screenshot |', '| --- | --- | --- | --- | --- | --- | --- | --- |',
  ...rows.map(r => `| ${r.page} | ${r.width} | ${r.control.replace(/\|/g, '/')} | ${r.icon_only ? 'yes' : ''} | ${r.tooltip || (r.icon_only && r.width > 500 ? 'none' : '')} | ${(r.result || '').replace(/\|/g, '/')} | ${r.errors.join('; ').replace(/\|/g, '/')} | ${r.shot || ''} |`)];
writeFileSync(join(outDir, 'explore.md'), md.join('\n') + '\n');
console.log(`explore: ${totals.controls} control(s), ${totals.opened_something} opened something, ${merged.length} lead(s), ${totals.not_clicked} not clicked${USE ? `, ${use.switches_flipped} switch(es) flipped and ${use.turned_back} turned back` : ''}${limits ? `, ${heldSwitches.length} held by the owner's limits` : ''} · ${outDir}`);
