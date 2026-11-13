#!/usr/bin/env node
// Design-system drift: does the same kind of component look the same on every screen?
// Usage: node <skill>/scripts/consistency.mjs <index.html|url> [--crawl crawl.json] [--routes "#/,/settings"]
//        [--profile dir] [--session session.json] [--out dir] [--labels file.json] [--tokens tokens.css]
//
// With --out (how the audit runs it): it visits the start page, --routes and every screen in --crawl,
// signed in when --profile or --session is given, and measures each component of these kinds:
//   search inputs, text inputs, dropdowns, primary buttons, cards, list rows and side panels.
// For each kind it compares corner radius, background, border, height and font size across screens,
// with a small tolerance (2px radius, 4px height, 1px font size, close colors count as the same).
// When most screens share one look and a screen has a different one, that is a "component-drift" lead:
// one lead per kind, naming the odd one out, with a crop of the usual look and of the odd one.
// A kind with more than 3 looks has no system to drift from: it is listed in the inventory, not as a lead.
// Writes consistency.json, consistency.md and K##-*.png to --out (the skill passes <audit>/consistency).
// Leads are C##: decide each one in the pain map's Script leads. Exit 0 ran, 2 usage, 3 the app signed us out.
//
// Without --out (a quick check of one page, for a build): prints pass or fail and exits 0 or 1.
// It flags the same visible label with two background colors, off-scale margin or gap inside
// [data-measure], badge colors that are not a hex token from --tokens, and label-table misses.
// Labels file: { "remove": ["Remove"], "save": ["Save"] }. A data-action value must use one of those words.
//
// --profile / --session: stay signed in (see crawl.mjs). The profile is tried first.
import { openContext, signInFlags, openTarget, pagesToVisit, settle, DANGER } from './browser.mjs';
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';

const args = process.argv.slice(2);
const valueFlags = ['--labels', '--tokens', '--profile', '--session', '--out', '--crawl', '--routes'];
const target = args.find((a, i) => !a.startsWith('--') && !valueFlags.includes(args[i - 1]));
if (!target) {
  console.error('usage: node <skill>/scripts/consistency.mjs <index.html|url> [--crawl crawl.json] [--routes ...] [--profile dir] [--session file] [--out dir] [--labels file.json] [--tokens tokens.css]');
  process.exit(2);
}
const flag = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const { session, profile } = signInFlags(args, 'consistency');
const outDir = flag('--out') ? resolve(flag('--out')) : null;
const labels = flag('--labels') && existsSync(flag('--labels')) ? JSON.parse(readFileSync(flag('--labels'), 'utf8')) : {};
const tokenHex = new Set();
if (flag('--tokens') && existsSync(flag('--tokens'))) {
  for (const match of readFileSync(flag('--tokens'), 'utf8').matchAll(/#([0-9a-f]{6})\b/gi)) tokenHex.add(match[1].toLowerCase());
}
const SCALE = new Set([0, 4, 8, 16, 24, 32, 40, 48, 64]);

// One page, for a build check: label colors, the spacing scale, badge tokens and the label table.
const QUICK = scale => {
  const rgb = value => {
    const m = value.match(/rgba?\(([^)]+)\)/);
    if (!m) return value;
    const parts = m[1].split(',').map(x => x.trim());
    return parts.slice(0, 3).map(n => Number(n).toString(16).padStart(2, '0')).join('');
  };
  const buttons = [...document.querySelectorAll('button, [data-button]')].filter(el => el.offsetParent !== null).map(el => ({
    text: (el.innerText || '').replace(/\s+/g, ' ').trim(),
    bg: rgb(getComputedStyle(el).backgroundColor),
    action: el.getAttribute('data-action') || '',
  }));
  const badges = [...document.querySelectorAll('[data-badge]')].map(el => ({
    text: (el.innerText || '').replace(/\s+/g, ' ').trim(),
    bg: rgb(getComputedStyle(el).backgroundColor),
  }));
  const spaces = [];
  const rootEl = document.querySelector('[data-measure]') || document.body;
  rootEl.querySelectorAll('*').forEach(el => {
    const s = getComputedStyle(el);
    for (const prop of ['marginTop', 'marginBottom', 'rowGap', 'columnGap']) {
      const raw = s[prop];
      if (!raw || raw === 'normal') continue;
      for (const part of raw.split(' ')) {
        if (!part.endsWith('px')) continue;
        const n = Math.round(parseFloat(part));
        if (n !== 0 && !scale.includes(n)) spaces.push(`${prop} ${n}px`);
      }
    }
  });
  return { buttons, badges, spaces: [...new Set(spaces)].slice(0, 20) };
};

// Every component of a kind on this page, with the look a person sees.
const COMPONENTS = (danger) => {
  const D = new RegExp(danger, 'i');
  const vis = el => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
  const shown = el => vis(el) && (!el.checkVisibility || el.checkVisibility({ opacityProperty: true, visibilityProperty: true, checkOpacity: true, checkVisibilityCSS: true }));
  const text = el => (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
  const rgba = c => { const m = (c || '').match(/[\d.]+/g) || [0, 0, 0, 0]; return { r: +m[0], g: +m[1], b: +m[2], a: m[3] === undefined ? 1 : +m[3] }; };
  const hex = c => { const x = rgba(c); return '#' + [x.r, x.g, x.b].map(n => Math.round(n).toString(16).padStart(2, '0')).join(''); };
  const drawn = el => { const s = getComputedStyle(el); return rgba(s.backgroundColor).a > 0.05 || parseFloat(s.borderTopWidth) > 0 || parseFloat(s.borderBottomWidth) > 0 || s.boxShadow !== 'none'; };
  // The colour a person sees behind something: the nearest ancestor that paints a background.
  const behind = el => { for (let x = el; x; x = x.parentElement) { const c = getComputedStyle(x).backgroundColor; if (rgba(c).a > 0.5) return hex(c); } return '#ffffff'; };
  // The box a person sees as "the field": the input itself, or the wrapper that draws its border.
  const fieldBox = el => {
    let x = el;
    for (let i = 0; i < 3 && x; i++) {
      if (drawn(x)) return x;
      const p = x.parentElement; if (!p) break;
      const pr = p.getBoundingClientRect(), r = el.getBoundingClientRect();
      if (pr.height > r.height + 28 || pr.width > r.width * 2.5 + 80) break;
      x = p;
    }
    return el;
  };
  if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur(); // a focus ring is not drift
  let n = 0;
  const out = [];
  const look = (kind, el, label, props, textEl = el) => {
    const s = getComputedStyle(el), r = el.getBoundingClientRect(), bg = rgba(s.backgroundColor), bw = parseFloat(s.borderTopWidth) || 0;
    const all = {
      radius: Math.round(Math.min(parseFloat(s.borderTopLeftRadius) || 0, r.height / 2)),
      background: bg.a > 0.05 ? hex(s.backgroundColor) : `none on ${behind(el)}`,
      border: bw > 0 ? `${Math.round(bw * 2) / 2}px ${hex(s.borderTopColor)}` : 'none',
      height: Math.round(r.height),
      font: Math.round(parseFloat(getComputedStyle(textEl).fontSize)),
    };
    el.dataset.src = 'k' + (++n);
    out.push({ kind, label: String(label || '').slice(0, 50), mark: el.dataset.src, look: Object.fromEntries(props.map(p => [p, all[p]])) });
  };
  const SEARCH = 'input[type=search], [role=searchbox], input[placeholder*="search" i], input[aria-label*="search" i], input[name*="search" i], input[id*="search" i]';
  const FIELD = ['radius', 'background', 'border', 'height', 'font'];
  for (const el of document.querySelectorAll(SEARCH)) if (shown(el) && !el.disabled) look('search input', fieldBox(el), el.getAttribute('placeholder') || el.getAttribute('aria-label') || 'search', FIELD, el);
  for (const el of document.querySelectorAll('input:not([type]), input[type=text], input[type=email], input[type=url], input[type=tel], input[type=number], input[type=password], select, textarea')) {
    if (!shown(el) || el.disabled || el.matches(SEARCH) || el.getBoundingClientRect().width < 60) continue;
    // A dropdown is its own kind: browsers draw it differently from a text field.
    look(el.tagName === 'SELECT' ? 'dropdown' : 'text input', fieldBox(el), el.getAttribute('placeholder') || el.getAttribute('aria-label') || el.name || el.tagName.toLowerCase(), el.tagName === 'TEXTAREA' ? ['radius', 'background', 'border', 'font'] : FIELD, el);
  }
  // Primary buttons: filled with a real colour (not grey or near-black), with words on them.
  // Tabs, switches and chips that fill in when picked are not primary buttons.
  const accent = c => { const x = rgba(c); if (x.a < 0.5) return false; const mx = Math.max(x.r, x.g, x.b), mn = Math.min(x.r, x.g, x.b); return mx > 80 && (mx - mn) / mx > 0.25; };
  for (const el of document.querySelectorAll('button, [role=button], a[class*=btn i], a[class*=button i], input[type=submit]')) {
    const t = text(el) || el.value || '';
    if (!shown(el) || el.disabled || !/[\p{L}]/u.test(t) || D.test(t) || !accent(getComputedStyle(el).backgroundColor)) continue;
    if (el.matches('[role=tab], [aria-pressed], [aria-selected], [aria-current], [role=switch]') || el.closest('[role=tablist], nav') || el.getBoundingClientRect().height < 28) continue;
    look('primary button', el, t, ['radius', 'background', 'height', 'font']);
  }
  // Cards and list rows: repeated siblings of one shape. One entry per group, taken from its first item.
  const sig = el => el.tagName + '.' + [...el.classList].filter(c => !/^(odd|even|active|selected|current|is-|has-)/.test(c)).sort().join('.');
  const chrome = el => !!el.closest('nav, aside, header, footer, [role=navigation], [role=dialog], [role=menu]');
  const seen = new Set();
  for (const parent of document.querySelectorAll('body *')) {
    const kids = [...parent.children].filter(shown);
    if (kids.length < 2) continue;
    const groups = {};
    for (const k of kids) (groups[sig(k)] = groups[sig(k)] || []).push(k);
    for (const items of Object.values(groups)) {
      if (items.length < 2 || seen.has(items[0]) || chrome(items[0])) continue;
      const r = items[0].getBoundingClientRect();
      const row = items.length >= 3 && r.width >= 200 && r.height >= 24 && r.height <= 96 && items[0].matches('li, tr, [role=row], [role=listitem], [role=option], a, div');
      const card = r.width >= 120 && r.height >= 96 && drawn(items[0]) && !items[0].querySelector('table');
      if (card) { seen.add(items[0]); look('card', items[0], text(items[0].querySelector('h1, h2, h3, h4, [class*=title i]') || items[0]), ['radius', 'background', 'border']); }
      else if (row && text(items[0])) { seen.add(items[0]); look('list row', items[0], text(items[0]), ['radius', 'background', 'font']); }
    }
  }
  // Side panels, by the side they sit on.
  for (const el of document.querySelectorAll('aside, [role=complementary], [class*=sidebar i], [class*=side-panel i], [class*=sidepanel i]')) {
    const r = el.getBoundingClientRect();
    if (!shown(el) || r.width < 160 || r.height < 240 || r.width > innerWidth * 0.5 || el.parentElement?.closest('[data-src]')) continue;
    look(r.left + r.width / 2 < innerWidth / 2 ? 'left panel' : 'right panel', el, el.getAttribute('aria-label') || text(el.querySelector('h1, h2, h3') || { innerText: '' }) || 'panel', ['radius', 'background', 'border']);
  }
  return out;
};

const site = await openTarget(target, 'consistency');
const opened = await openContext({ session, profile, name: 'consistency', url: site.startUrl, launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] } });
const page = opened.page;
const local = u => u.replace(/^https?:\/\/127\.0\.0\.1:\d+/, '');
// The exit code is set here and used after the browser has closed: a sign-in profile only keeps the
// newest token when the browser closes cleanly.
let exitCode = 0;
try {
  if (!outDir) {
    const response = await page.goto(site.startUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
    if (!response || response.status() >= 400) {
      console.error('consistency: fail');
      console.error(`page did not load (${response ? response.status() : 'no response'}): ${site.startUrl}`);
      exitCode = 1;
    } else {
      const facts = await page.evaluate(QUICK, [...SCALE]);
      const fails = [];
      const byText = new Map();
      for (const button of facts.buttons) {
        if (!button.text) continue;
        const set = byText.get(button.text) || new Set();
        set.add(button.bg);
        byText.set(button.text, set);
      }
      for (const [text, colors] of byText) if (colors.size > 1) fails.push(`label "${text}" uses ${colors.size} backgrounds`);
      for (const button of facts.buttons) {
        if (!button.action || !labels[button.action]) continue;
        const allowed = labels[button.action];
        if (!allowed.includes(button.text)) fails.push(`action ${button.action} says "${button.text}", expected ${allowed.join(' or ')}`);
      }
      if (tokenHex.size) for (const badge of facts.badges) if (!tokenHex.has(badge.bg)) fails.push(`badge "${badge.text}" color #${badge.bg} is not a token`);
      for (const space of facts.spaces) fails.push(`off-scale spacing ${space}`);
      if (fails.length) {
        console.error('consistency: fail');
        for (const line of fails) console.error(line);
        exitCode = 1;
      } else console.log('consistency: pass');
    }
  } else {
    mkdirSync(outDir, { recursive: true });
    const urls = pagesToVisit({ startUrl: site.startUrl, remote: site.remote, routes: flag('--routes'), crawl: flag('--crawl'), name: 'consistency' });
    // Two looks are the same when every measured property is within tolerance.
    const TOL = { radius: 2, height: 4, font: 1 };
    const tolFor = (kind, k) => kind === 'primary button' && k === 'height' ? 8 : TOL[k]; // a main call to action may be a size up
    const rgb = c => { const m = String(c).match(/#([0-9a-f]{6})\s*$/i); return m ? [0, 2, 4].map(i => parseInt(m[1].slice(i, i + 2), 16)) : null; };
    const sameColor = (a, b) => { if (a === b) return true; if (/^none/.test(a) !== /^none/.test(b)) return false; const x = rgb(a), y = rgb(b); return !!x && !!y && x.every((v, i) => Math.abs(v - y[i]) <= 12) && (parseFloat(a) || 0) === (parseFloat(b) || 0); };
    const differs = (a, b, kind) => Object.keys(a).filter(k => k in TOL ? Math.abs(a[k] - b[k]) > tolFor(kind, k) : !sameColor(String(a[k]), String(b[k])));
    const kinds = new Map(); // kind -> [{ look, screens:Set, count, label, screen, shot }]
    let shotN = 0;
    for (const url of urls) {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => null);
      await settle(page);
      await page.mouse.move(0, 0).catch(() => {});
      const found = await page.evaluate(COMPONENTS, DANGER.source).catch(() => []);
      for (const c of found) {
        const variants = kinds.get(c.kind) || [];
        kinds.set(c.kind, variants);
        let v = variants.find(x => differs(x.look, c.look, c.kind).length === 0);
        if (!v) {
          v = { look: c.look, screens: new Set(), count: 0, label: c.label, screen: local(url), shot: `K${String(++shotN).padStart(2, '0')}-${c.kind.replace(/\s+/g, '-')}.png` };
          await page.locator(`[data-src="${c.mark}"]`).first().screenshot({ path: join(outDir, v.shot), timeout: 5000 }).catch(() => { v.shot = null; });
          variants.push(v);
        }
        v.screens.add(local(url)); v.count++;
      }
    }
    const NAME = { radius: 'corner radius', background: 'background', border: 'border', height: 'height', font: 'font size' };
    const say = look => Object.entries(look).map(([k, v]) => `${NAME[k]} ${typeof v === 'number' ? v + 'px' : v}`).join(', ');
    const leads = [], inventory = [];
    for (const [kind, variants] of kinds) {
      const onScreens = new Set(variants.flatMap(v => [...v.screens]));
      // The usual look: the one on the most screens. Ties go to the one seen first.
      const usual = variants.slice().sort((a, b) => b.screens.size - a.screens.size || b.count - a.count)[0];
      inventory.push({ kind, looks: variants.length, screens: onScreens.size, variants: variants.map(v => ({ look: v.look, screens: [...v.screens], count: v.count, example: v.label, shot: v.shot })) });
      if (variants.length < 2 || variants.length > 3 || usual.screens.size * 2 < onScreens.size) continue;
      const odd = variants.filter(v => v !== usual);
      const plural = { 'search input': 'Search inputs', 'text input': 'Text inputs', dropdown: 'Dropdowns', 'primary button': 'Primary buttons', card: 'Cards', 'list row': 'List rows', 'left panel': 'Left panels', 'right panel': 'Right panels' }[kind] || kind;
      const where = v => [...v.screens].slice(0, 3).join(', ') + (v.screens.size > 3 ? ` and ${v.screens.size - 3} more` : '');
      leads.push({
        id: `C${String(leads.length + 1).padStart(2, '0')}`, kind: 'component-drift', component: kind,
        what: `${plural} do not match across screens. Usual (${usual.screens.size} screen${usual.screens.size === 1 ? '' : 's'}: ${where(usual)}): ${say(usual.look)}. ${odd.map(v => `Odd one out on ${where(v)} ("${v.label}"): ${say(v.look)}, differs in ${differs(usual.look, v.look, kind).map(k => NAME[k]).join(' and ')}`).join('. ')}`,
        pages: [...new Set(odd.flatMap(v => [...v.screens]))], widths: [1280],
        detail: { usual: { look: usual.look, screens: [...usual.screens], shot: usual.shot }, odd: odd.map(v => ({ look: v.look, screens: [...v.screens], example: v.label, differs_in: differs(usual.look, v.look, kind), shot: v.shot })) },
        shot: odd[0].shot, shots: [usual.shot, ...odd.map(v => v.shot)].filter(Boolean),
      });
    }
    writeFileSync(join(outDir, 'consistency.json'), JSON.stringify({ target, screens: urls.map(local), signed_in_with: opened.mode !== 'none' ? opened.label : null, leads, inventory }, null, 2) + '\n');
    const md = ['# Design-system drift', '',
      `${urls.length} screen(s) at 1280 wide${opened.mode !== 'none' ? `, signed in with ${opened.label}` : ''}, ${leads.length} lead(s).`, '',
      'The same kind of component should look the same on every screen. Every lead below goes in the pain map\'s **Script leads** table (C##): a pain ID (lens "L5 Consistency"), or Rejected with what you saw on the two crops. A different look can be on purpose (a search box on a dark panel): look before you decide.', '',
      '## Leads', '', '| Lead | Component | What differs | Odd one out on | Usual look | Odd look |', '| --- | --- | --- | --- | --- | --- |',
      ...(leads.length ? leads.map(l => `| ${l.id} | ${l.component} | ${l.what.replace(/\|/g, '/')} | ${l.pages.join(', ')} | ${l.detail.usual.shot || 'none'} | ${l.detail.odd.map(o => o.shot || 'none').join(', ')} |`) : ['| none | | Every component kind looks the same on every screen it appears on | | | |']),
      '', '## Inventory (signals for the taste pass, not leads)', '', '| Component | Looks | Screens | Each look |', '| --- | --- | --- | --- |',
      ...inventory.map(i => `| ${i.kind} | ${i.looks} | ${i.screens} | ${i.variants.map(v => `${say(v.look)} (${v.screens.length} screen${v.screens.length === 1 ? '' : 's'})`).join(' · ').replace(/\|/g, '/')} |`),
      '', 'A kind with more than 3 looks has no shared style to drift from. Judge it in the taste pass (T6 Surfaces, T9 Polish).'];
    writeFileSync(join(outDir, 'consistency.md'), md.join('\n') + '\n');
    console.log(`consistency: ${urls.length} screen(s), ${inventory.length} component kind(s), ${leads.length} lead(s) · ${outDir}`);
  }
} finally {
  await opened.close();
  site.stop();
}
process.exit(exitCode);
