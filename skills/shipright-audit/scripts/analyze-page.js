// ShipRight Audit: in-page visual and style checks, one function shared by visual.mjs and by hand.
// visual.mjs runs it in each page. When the scripts cannot reach a site (for example an app only your own
// browser is signed in to), paste this whole file into a browser tool's JavaScript runner, add
// "JSON.stringify(SHIPRIGHT_ANALYZE())" on the next line, and read the result: it returns the same leads
// and style inventory visual.mjs writes (minus the crop screenshots, which you take yourself).
// Thresholds are CSS pixels at 1280 wide: 6px is the smallest misalignment people notice side by side;
// 40px is a gap that reads as "empty" in a card.
// Run it at 1280 wide and again at 390 wide: clipped text and sideways overflow mostly show on phone.
// Options (all optional), for the scripts:
//   within  a CSS selector: the text checks only look inside matching elements (an open menu or dialog)
//   only    a list of lead kinds to keep, for example ['clipped-text']
//   results true on a page that shows a result (a past chat, a file, a reply to a test message): also
//           counts action buttons that have no name at all
//   shiftWithInput  true to count layout shifts that follow a click too (the scripts use it to see
//           whether opening a menu makes the page behind it jump)
// Layout shift: it sums how far things moved from the moment the page finished loading until now (or
// since window.__srShiftFrom, a performance.now() time you can set). The first render does not count
// (anything up to 300ms after the load event): only jumps a person sees after the page looked ready.
// Run it after the page has settled. Over 0.1 is a lead.
// Five checks added in 0.8, each a lead at every width (see references/visual-craft.md, V9 to V13):
//   template-text        placeholder text left in view: "[topic]", "{name}", "{{ title }}", "%s", "${x}",
//                        "lorem ipsum", "undefined", "null", "NaN", "[object Object]", "TODO: ..."
//   faint-icon           icons in controls or next to labels with under 3:1 contrast against their real
//                        background (WCAG 1.4.11), measured from the SVG stroke or fill or the icon font
//                        color, with opacity included
//   overflow-box         a chip, pill, badge or button that sticks out of its card by more than 2px
//   duplicate-on-screen  the same text block (40 characters or more) in two sections, or the same
//                        control in two navigations
//   stacked-controls     2 rows of controls above one list, each under half the width: could be one row
// Two checks added in 0.9 (V14 and V15 in references/visual-craft.md):
//   faint-border         an input, dropdown, checkbox, radio button or outline button whose only boundary
//                        is its border, with under 3:1 between that border and the surface behind it
//                        (WCAG 1.4.11), and so close to it that the eye cannot find it (a lightness
//                        contrast under 8 on the APCA scale: a dark gray border on a dark surface. A light
//                        gray border on white scores 13 or more and is not a lead). Reported with the
//                        colors: "#3A3C39 on #2A2C29, 1.3:1". A component whose fill contrasts at 3:1 or
//                        more with the surface needs no visible border.
//   tight-padding        one card, notice or row whose inner padding is under 60% of what the others
//                        like it use, or under 8px while they use 12px or more
// One more check lives in a second function at the end of this file, SHIPRIGHT_LAYERS (V16):
//   see-through-layer    a sticky or fixed layer (top bar, chip, message box, bottom bar) with no solid
//                        background, while page content sits under it. It looks at the page as it is
//                        scrolled right now, so visual.mjs and samples.mjs scroll the content under each
//                        layer first. By hand: scroll until content is under the bar, then run
//                        "JSON.stringify(SHIPRIGHT_LAYERS())" after pasting this file.
// A finding may carry "crop": a box in page pixels to screenshot when the problem is wider than one element.
// It also returns "item_states": the status labels seen on repeated items ("Editing", "Rendering", "Ready").
// Not a lead: an item type with 3 or more states needs an Item lifecycles table in the pain map (Step 2b).
// Reduced motion: switch the browser to "reduce motion" (in DevTools: Rendering, Emulate CSS media
// feature prefers-reduced-motion), reload, open a menu and run it at once. Anything still moving is a lead.
var SHIPRIGHT_ANALYZE = (opts = {}) => {
  const ALIGN_PX = 6, GAP_MIN = 40, GAP_RATIO = 2.5, PILL_WORDS = 4, PILL_CHARS = 30, PILLS_PER_CARD = 4;
  // A card's only worded action is buried when 10+ lines of text sit between the title and it.
  // A card is overloaded when it carries more than 7 small labels and pills to read.
  const BURIED_BLOCKS = 10, BURIED_MIN_H = 280, LABELS_PER_CARD = 7;
  const vis = el => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) > 0; };
  const box = el => { const r = el.getBoundingClientRect(); return { x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height, right: r.right + scrollX, bottom: r.bottom + scrollY }; };
  const text = el => (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
  const sig = el => el.tagName + '.' + [...el.classList].filter(c => !/^(odd|even|active|selected|is-|has-)/.test(c)).sort().join('.');
  const radius = el => parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0;
  let mark = 0;
  const tag = el => { if (!el.dataset.srv) el.dataset.srv = 'm' + (++mark); return el.dataset.srv; };
  const findings = [];
  const add = (f, el) => findings.push({ ...f, mark: el ? tag(el) : null });
  // Visible to a person: also false when an ancestor is faded out (opacity does not inherit).
  const shown = el => {
    if (!vis(el)) return false;
    if (el.checkVisibility) return el.checkVisibility({ opacityProperty: true, visibilityProperty: true, checkOpacity: true, checkVisibilityCSS: true });
    for (let x = el; x && x !== document.documentElement; x = x.parentElement) if (Number(getComputedStyle(x).opacity) < 0.05) return false;
    return true;
  };
  const inScope = el => !opts.within || !!el.closest(opts.within);

  // Colors, for the contrast checks. A 1px canvas turns any CSS color (rgb, hsl, oklch, color-mix) into
  // red, green, blue and alpha. null means "cannot tell" (a gradient, an image, a pattern).
  const colorCache = new Map();
  let colorCtx = null;
  const rgba = value => {
    if (!value || value === 'none' || /^url\(|gradient|^var\(/i.test(value)) return null;
    if (colorCache.has(value)) return colorCache.get(value);
    let out = null;
    const m = String(value).match(/^rgba?\(\s*([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/);
    if (m) out = { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : (m[4].endsWith('%') ? parseFloat(m[4]) / 100 : +m[4]) };
    else {
      try {
        if (!colorCtx) { const cv = document.createElement('canvas'); cv.width = cv.height = 1; colorCtx = cv.getContext('2d', { willReadFrequently: true }); }
        colorCtx.clearRect(0, 0, 1, 1); colorCtx.fillStyle = '#000'; colorCtx.fillStyle = value;
        colorCtx.fillRect(0, 0, 1, 1);
        const d = colorCtx.getImageData(0, 0, 1, 1).data;
        out = { r: d[0], g: d[1], b: d[2], a: d[3] / 255 };
      } catch (e) { out = null; }
    }
    colorCache.set(value, out);
    return out;
  };
  const over = (top, under) => { const a = top.a; return { r: top.r * a + under.r * (1 - a), g: top.g * a + under.g * (1 - a), b: top.b * a + under.b * (1 - a), a: 1 }; };
  const lum = c => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
  const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  // The color really behind an element: its ancestors' backgrounds, stacked until one is solid.
  // null when a background image or gradient sits in between, because then it cannot be measured.
  const backdrop = el => {
    const layers = [];
    for (let x = el.parentElement; x; x = x.parentElement) {
      const cs = getComputedStyle(x);
      if (cs.backgroundImage && cs.backgroundImage !== 'none') return null;
      const c = rgba(cs.backgroundColor);
      if (!c) return null;
      if (c.a > 0.01) layers.push(c);
      if (c.a >= 0.99) break;
    }
    let base = { r: 255, g: 255, b: 255, a: 1 };
    for (const c of layers.reverse()) base = over(c, base);
    return base;
  };
  const hex = c => '#' + [c.r, c.g, c.b].map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
  const pageBox = (rects, pad = 8) => {
    const x0 = Math.max(0, Math.min(...rects.map(r => r.left)) + scrollX - pad), y0 = Math.max(0, Math.min(...rects.map(r => r.top)) + scrollY - pad);
    const x1 = Math.max(...rects.map(r => r.right)) + scrollX + pad, y1 = Math.max(...rects.map(r => r.bottom)) + scrollY + pad;
    return { x: Math.round(x0), y: Math.round(y0), width: Math.round(Math.min(x1 - x0, 1400)), height: Math.round(Math.min(y1 - y0, 1200)) };
  };

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
    // Leaf text pieces of a card, top to bottom: what the eye has to read.
    const leaves = el => [...el.querySelectorAll('*')].filter(x => vis(x) && ownText(x).length > 0 && !x.closest('button, [role=button]')).map(x => ({ x, b: box(x), t: ownText(x) }));
    // Buried main action: the only worded action sits at the bottom of a tall card, after a long read.
    for (const c of cards) {
      if (c.b.h < BURIED_MIN_H) continue;
      const worded = [...c.el.querySelectorAll('button, [role=button], a')].filter(x => vis(x) && text(x).length > 1 && text(x).length < 40);
      if (worded.length !== 1) continue;
      const act = worded[0], ab = box(act);
      if (ab.y - c.b.y < c.b.h * 0.7) continue;
      const head = c.el.querySelector('h1, h2, h3, h4, [class*=title i]');
      const from = head ? box(head).bottom : c.b.y;
      const between = leaves(c.el).filter(l => l.b.y >= from - 1 && l.b.bottom <= ab.y + 1).length;
      if (between >= BURIED_BLOCKS) { add({ kind: 'buried-action', what: `"${text(act)}" is the card's only worded action and sits at its bottom, after ${between} pieces of text`, detail: { action: text(act), text_pieces_before: between, card_height: Math.round(c.b.h) } }, c.el); break; }
    }
    // Label overload: small all-caps labels and pills each ask to be read; past about 7 a card stops scanning.
    for (const c of cards) {
      const small = leaves(c.el).filter(l => { const st = getComputedStyle(l.x); const caps = st.textTransform === 'uppercase' || (l.t === l.t.toUpperCase() && /[A-Z]/.test(l.t)); return caps && parseFloat(st.fontSize) <= 13 && l.t.split(' ').length <= 4; });
      const pillCount = c.parts.filter(p => p.role === 'pill').length;
      const labels = new Set([...small.map(l => l.x), ...c.parts.filter(p => p.role === 'pill').map(p => p.el)]).size;
      if (labels > LABELS_PER_CARD) { add({ kind: 'label-overload', what: `A card asks the eye to read ${labels} small labels and pills (${pillCount} pill${pillCount === 1 ? "" : "s"})`, detail: { labels, pills: pillCount } }, c.el); break; }
    }
    // Crowded pills: too many chips on one card stop working as labels.
    for (const c of cards) {
      const clusters = {};
      for (const p of c.parts.filter(p => p.role === 'pill')) { const k = tag(p.el.parentElement); clusters[k] = (clusters[k] || 0) + 1; }
      const n = Math.max(0, ...Object.values(clusters));
      if (n > PILLS_PER_CARD) { add({ kind: 'crowded-pills', what: `A card carries ${n} pills; past ${PILLS_PER_CARD} they stop being scannable labels`, detail: { pills: n } }, c.el); break; }
    }
  }

  // Clipped text: words a person cannot read in full. Either the box that holds them hides what
  // overflows it (overflow hidden, with or without "..."), or they run past the edge of the screen.
  // Text counts as cut when at least 12px of it shows and more than 2px of it is hidden: fully hidden
  // text (the next slide, a closed drawer, screen-reader-only labels) is not "cut off".
  // Not flagged: rows that are meant to scroll sideways (code, tables, tab rows, any row of buttons or
  // links, anything with a visible scrollbar or a fade mask), and long titles shortened with "..." in a
  // list of links (chat history, file lists), which is a normal pattern.
  {
    const CLIP_PX = 2, CLIP_SEEN = 12;
    const vw = document.documentElement.clientWidth;
    // The nearest ancestor that clips what overflows it sideways. Fixed boxes escape every ancestor;
    // absolute boxes escape ancestors that are not positioned.
    const clipHost = node => {
      let skip = false;
      for (let el = node.parentElement; el && el !== document.body && el !== document.documentElement; el = el.parentElement) {
        const cs = getComputedStyle(el);
        if (!skip || cs.position !== 'static') {
          skip = false;
          if (cs.overflowX !== 'visible') return { el, cs, scrolls: cs.overflowX === 'auto' || cs.overflowX === 'scroll' };
        }
        if (cs.position === 'fixed') return null;
        if (cs.position === 'absolute') skip = true;
      }
      return null;
    };
    const meantToScroll = (host, p) => {
      if (host.el.scrollWidth - host.el.clientWidth <= CLIP_PX) return false;
      if (host.el.matches('pre, code, table, [role=tablist], [role=table], [role=grid]') || p.closest('pre, code, table, [role=tablist]')) return true;
      const bar = host.el.offsetHeight - host.el.clientHeight - parseFloat(host.cs.borderTopWidth) - parseFloat(host.cs.borderBottomWidth);
      if (bar > 2) return true;
      if ((host.cs.maskImage && host.cs.maskImage !== 'none') || (host.cs.webkitMaskImage && host.cs.webkitMaskImage !== 'none')) return true;
      return !!host.el.querySelector('a[href], button, input, [role=button], [role=tab], [role=option], [role=link]');
    };
    const moving = el => { try { return el.getAnimations({ subtree: true }).some(a => a.playState === 'running'); } catch { return false; } };
    const groups = new Map();
    const range = document.createRange();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const t = n.textContent.replace(/\s+/g, ' ').trim();
      if (t.length < 2) continue;
      const p = n.parentElement;
      if (!p || p.closest('script, style, noscript, template, select, textarea, [aria-hidden="true"]') || !inScope(p) || !shown(p)) continue;
      range.selectNodeContents(n);
      const r = range.getBoundingClientRect();
      if (r.width < 4 || r.height < 6) continue;
      const host = clipHost(n);
      // With no clipping ancestor the screen is the edge. Measure from the page's left edge, so a page
      // that happens to be scrolled sideways gives the same answer.
      let left = -scrollX, right = vw - scrollX, how = 'screen';
      if (host) {
        const hr = host.el.getBoundingClientRect();
        if (hr.width < 24 || hr.height < 8 || hr.right <= 0 || hr.left >= vw) continue;
        left = hr.left + parseFloat(host.cs.borderLeftWidth); right = left + host.el.clientWidth;
        if (host.scrolls) { if (meantToScroll(host, p)) continue; how = 'scroll'; }
        else how = host.cs.textOverflow === 'ellipsis' ? 'dots' : 'box';
      }
      const hidden = Math.max(r.right - right, left - r.left);
      const seen = Math.min(r.right, right) - Math.max(r.left, left);
      if (hidden <= CLIP_PX || seen < CLIP_SEEN) continue;
      if (host && moving(host.el)) continue; // a ticker or a slide in motion
      if (how === 'dots') {
        const item = p.closest('a, button, [role=option], [role=menuitem], [role=tab], [role=link], [role=treeitem]');
        const scope = item && (item.parentElement?.parentElement || item.parentElement);
        if (scope && [...scope.querySelectorAll(item.tagName)].filter(x => sig(x) === sig(item)).length >= 3) continue;
      }
      let el = host && !host.scrolls && host.el.getBoundingClientRect().height <= 400 ? host.el : p;
      // Past the screen edge: crop the widest thing that sticks out (the table, not one cell), and
      // report one lead per page, because it is one problem: the page is wider than the screen.
      if (how === 'screen') while (el.parentElement && el.parentElement !== document.body && el.parentElement.getBoundingClientRect().right > right + CLIP_PX && el.parentElement.getBoundingClientRect().height <= 1200) el = el.parentElement;
      const key = how === 'screen' ? 'screen' : how + '|' + sig(host ? host.el : p);
      const g = groups.get(key) || { how, el, texts: [], hidden: 0 };
      if (!g.texts.includes(t)) g.texts.push(t);
      g.hidden = Math.max(g.hidden, Math.round(hidden));
      groups.set(key, g);
    }
    const HOW = { dots: 'Text is shortened with "..."', box: 'Text is cut off at the edge of its box', scroll: 'Text is cut off, and nothing shows that the line scrolls sideways', screen: 'Text runs past the edge of the screen' };
    for (const [key, g] of groups) {
      const more = g.texts.length - 1;
      add({ kind: 'clipped-text', group: key, what: `${HOW[g.how]}: "${g.texts[0].slice(0, 90)}"${more ? ` (and ${more} more like it)` : ''}`, detail: { how: g.how, hidden_px: g.hidden, texts: g.texts.slice(0, 5), count: g.texts.length, screen_width: vw } }, g.el);
    }
  }

  // Media that never loaded: an image the browser gave up on, a video with nothing to play, or a
  // placeholder that makes the user press "load image" before anything shows.
  {
    const TRACKER = /pixel|track|beacon|analytics|collect|\.gif\?/i, SVG = /\.svg(\?|#|$)|^data:image\/svg/i;
    const hiddenBy = el => { const st = getComputedStyle(el); return st.display === 'none' || st.visibility === 'hidden'; };
    const label = el => (el.getAttribute('alt') || '').trim() || ((el.currentSrc || el.getAttribute('src') || '').split(/[?#]/)[0].split('/').pop() || 'no name').slice(0, 60);
    const broken = [...document.querySelectorAll('img')].filter(img => {
      const src = img.currentSrc || img.getAttribute('src') || '';
      if (!src || SVG.test(src) || TRACKER.test(src) || !inScope(img) || hiddenBy(img)) return false;
      if (Number(img.getAttribute('width')) === 1 || Number(img.getAttribute('height')) === 1) return false;
      return img.complete && img.naturalWidth === 0;
    });
    if (broken.length) add({ kind: 'media-not-loaded', group: 'broken-image', what: `An image did not load: "${label(broken[0])}"${broken.length > 1 ? ` (and ${broken.length - 1} more)` : ''}`, detail: { how: 'broken image', images: broken.slice(0, 5).map(label), count: broken.length } }, broken[0].getBoundingClientRect().width > 8 ? broken[0] : broken[0].parentElement);
    const dead = [...document.querySelectorAll('video')].filter(v => inScope(v) && !hiddenBy(v) && (v.error || (v.networkState === 3 && (v.getAttribute('src') || v.querySelector('source')))));
    if (dead.length) add({ kind: 'media-not-loaded', group: 'broken-video', what: `A video did not load${dead.length > 1 ? ` (${dead.length} on this page)` : ''}`, detail: { how: 'broken video', count: dead.length } }, dead[0]);
    const LOAD = /\b(click|tap|press)( here)? to load\b|\b(click|tap|press)( here)? to (show|see|reveal|display) (the |this )?(image|photo|picture|video|media|preview|attachment)|^(load|show|reveal|display) (the |this )?(image|images|photo|picture|video|media|preview|attachment)s?$/i;
    const loaders = [...document.querySelectorAll('button, [role=button], a')].filter(b => inScope(b) && shown(b) && LOAD.test((text(b) || b.getAttribute('aria-label') || '').slice(0, 60)));
    if (loaders.length) { const name = text(loaders[0]) || loaders[0].getAttribute('aria-label'); add({ kind: 'media-not-loaded', group: 'load-button|' + name.toLowerCase(), what: `Media does not show until the user presses "${name}"${loaders.length > 1 ? ` (${loaders.length} on this page)` : ''}`, detail: { how: 'load button', button: name, count: loaders.length } }, loaders[0].parentElement && loaders[0].parentElement.getBoundingClientRect().height <= 500 ? loaders[0].parentElement : loaders[0]); }
  }

  // On a result page: action buttons with no name at all. No visible words, no label for screen
  // readers, no tooltip text and no named icon inside, so nobody can tell what they do before pressing.
  if (opts.results) {
    const named = el => {
      if (/[\p{L}\p{N}]/u.test(text(el))) return true;
      if ((el.getAttribute('aria-label') || el.getAttribute('title') || '').trim()) return true;
      const by = el.getAttribute('aria-labelledby');
      if (by && by.split(/\s+/).some(id => text(document.getElementById(id) || { innerText: '' }))) return true;
      return [...el.querySelectorAll('img[alt], svg title, [aria-label], [title]')].some(x => (x.getAttribute('alt') || x.getAttribute('aria-label') || x.getAttribute('title') || x.textContent || '').trim());
    };
    const nameless = [...document.querySelectorAll('button, [role=button], a[href]')].filter(el => inScope(el) && shown(el) && !named(el));
    if (nameless.length) add({ kind: 'unnamed-action', group: 'unnamed-action', what: `${nameless.length} action button${nameless.length === 1 ? ' has' : 's have'} no name: no words, no label for screen readers and no tooltip text`, detail: { count: nameless.length } }, nameless[0].parentElement || nameless[0]);
  }

  const describe = el => { if (!el || !el.tagName) return 'the page'; const t = text(el).slice(0, 50); const cls = typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\s+/)[0] : ''; return `${el.tagName.toLowerCase()}${cls}${t ? ` "${t}"` : ''}`; };

  // ---- Template text: placeholder patterns left in view ------------------------------------------
  // "[topic]", "{name}", "{{ title }}", "%s", "${count}", "lorem ipsum", "undefined", "null", "NaN",
  // "[object Object]", "TODO: ...". Not checked: code, keyboard keys, inputs, text areas and editors.
  {
    const SKIP = 'script, style, noscript, template, code, pre, kbd, samp, var, textarea, input, select, option, [contenteditable=""], [contenteditable="true"], [contenteditable="plaintext-only"], [role=textbox], [class*=editor i], .CodeMirror, .ProseMirror, [aria-hidden="true"]';
    // Words people do put in brackets on purpose: stage notes in a transcript, a tag, an editor's note.
    const BRACKET_OK = /^(optional|required|beta|new|sic|draft|deleted|removed|redacted|edited|link|citation needed|more|ok|n\/?a|tbd|video|image|photo|audio|music|applause|laughter|laughs|inaudible|crosstalk|silence|pause|pdf|note|update|updated|solved|closed|resolved|wip|nsfw|oc|sponsored|ad|pinned|locked|archived)$/i;
    const BRACKET_FILL = /^(your|my|insert|enter|add|company|first|last|full|user|client|customer|product|brand|business)\b/i;
    const short = t => t.length <= 60;
    const TESTS = [
      ['curly braces', t => /\{\{\s*[\w.$ |-]{1,40}\s*\}\}|\{\s*[a-z_$][\w.$]{0,30}\s*\}|\{\d{1,2}\}/i.test(t)],
      ['${...}', t => /\$\{[^}]{0,40}\}/.test(t)],
      ['square brackets', t => [...t.matchAll(/\[([a-z][a-z0-9 _-]{1,30})\]/gi)].some(m => {
        const inner = m[1].trim();
        if (BRACKET_OK.test(inner)) return false;
        // A stage note like "[Hook]" or "[Verse 2]" is written on purpose. A slot is lowercase ("[topic]"),
        // all capitals ("[NAME]") or starts with a fill-in word ("[Your name]").
        const slot = inner === inner.toLowerCase() || (inner === inner.toUpperCase() && /[A-Z]/.test(inner)) || BRACKET_FILL.test(inner);
        return slot && (/[\p{L}]/u.test(t.replace(m[0], '')) || BRACKET_FILL.test(inner) || inner === inner.toUpperCase());
      })],
      ['%s', t => /(^|[\s"'(>:])%(\d+\$)?[sd](?=$|[\s"'.,;:!?)<])/.test(t)],
      ['lorem ipsum', t => /lorem ipsum/i.test(t)],
      ['[object Object]', t => /\[object \w+\]/.test(t)],
      ['NaN', t => /(^|[^\w])NaN(?![\w])/.test(t)],
      ['undefined', t => short(t) && /(^|[^\w.])undefined(?![\w(])/.test(t)],
      ['null', t => short(t) && /(^|[\s:,(])null(?=$|[\s,.)%!?])/.test(t) && !/null and void/i.test(t)],
      ['TODO', t => /\b(TODO|FIXME)\b\s*[:(-]|\b(TODO|FIXME)\b\s+[a-z]/.test(t)],
    ];
    const hits = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const t = n.textContent.replace(/\s+/g, ' ').trim();
      if (t.length < 2 || t.length > 400) continue;
      const p = n.parentElement;
      if (!p || p.closest(SKIP) || !inScope(p) || !shown(p)) continue;
      const how = TESTS.filter(([, test]) => test(t)).map(([name]) => name);
      if (how.length && !hits.some(h => h.text === t)) hits.push({ text: t, how, el: p });
    }
    if (hits.length) {
      let el = hits[0].el;
      while (el.parentElement && el.parentElement !== document.body && (getComputedStyle(el).display.startsWith('inline') || el.getBoundingClientRect().height < 20) && el.parentElement.getBoundingClientRect().height <= 300) el = el.parentElement;
      add({ kind: 'template-text', group: 'template-text', what: `Template text is showing: "${hits[0].text.slice(0, 90)}"${hits.length > 1 ? ` (and ${hits.length - 1} more like it)` : ''}`, detail: { count: hits.length, texts: hits.slice(0, 8).map(h => h.text.slice(0, 120)), patterns: [...new Set(hits.flatMap(h => h.how))] } }, el);
    }
  }

  // ---- Faint icons: under 3:1 against their real background (WCAG 1.4.11, non-text contrast) --------
  // Icons inside a control, or sitting next to a short label. The color comes from the SVG's stroke or
  // fill (or the icon font's color) with every opacity on the way multiplied in. An icon with several
  // paints is judged by its strongest one. Disabled controls are exempt, and an icon over a picture
  // or a gradient is skipped because its background cannot be measured.
  {
    const MIN = 3;
    const CONTROL = 'button, a[href], [role=button], [role=tab], [role=menuitem], [role=link], [role=switch], [role=option], summary, label';
    const ICON_FONT = /(^|[\s_-])(icon|icons|fa|fas|far|fal|fab|bi|ri|ti|mdi|glyphicon|material-icons|lucide|feather|ph|bx|bxs|ion)([\s_-]|$)|material-symbols/i;
    const fade = (from, to) => { let o = 1; for (let x = from; x && x !== to; x = x.parentElement) o *= Number(getComputedStyle(x).opacity); return o; };
    const faint = [];
    const judge = (icon, paints) => {
      const r = icon.getBoundingClientRect();
      if (r.width < 8 || r.height < 8 || r.width > 40 || r.height > 40 || !inScope(icon) || !shown(icon)) return;
      const control = icon.closest(CONTROL);
      const host = control || icon.parentElement;
      if (!host) return;
      if (!control && !(text(host).length > 0 && text(host).length <= 40)) return; // decoration, not a control or a label's icon
      if (control && (control.disabled || control.getAttribute('aria-disabled') === 'true' || control.closest('[aria-disabled="true"], fieldset[disabled]'))) return;
      const bg = backdrop(icon);
      if (!bg) return;
      const outer = fade(icon.parentElement, null);
      if (outer < 0.05) return;
      const colors = paints();
      if (!colors || !colors.length) return;
      const best = Math.max(...colors.map(c => contrast(over({ ...c, a: Math.min(1, c.a * outer) }, bg), bg)));
      if (best >= MIN) return;
      const strongest = colors.slice().sort((a, b) => contrast(over(b, bg), bg) - contrast(over(a, bg), bg))[0];
      const name = (control && (control.getAttribute('aria-label') || control.getAttribute('title') || text(control))) || icon.getAttribute('aria-label') || (icon.querySelector && (icon.querySelector('title') || {}).textContent) || text(host) || 'an icon with no name';
      faint.push({ icon, host, name: String(name).replace(/\s+/g, ' ').trim().slice(0, 40), ratio: Math.round(best * 100) / 100, color: hex(over({ ...strongest, a: Math.min(1, strongest.a * outer) }, bg)), background: hex(bg) });
    };
    for (const svg of document.querySelectorAll('svg')) {
      if (svg.parentElement && svg.parentElement.closest('svg')) continue; // an svg inside an svg is part of the outer icon
      judge(svg, () => {
        const shapes = [...svg.querySelectorAll('path, circle, rect, line, polyline, polygon, ellipse, use, text')];
        const out = [];
        for (const sh of shapes.length ? shapes : [svg]) {
          const cs = getComputedStyle(sh);
          if (cs.display === 'none' || cs.visibility === 'hidden') continue;
          const own = sh === svg ? Number(cs.opacity) : fade(sh, svg.parentElement);
          if (cs.fill && cs.fill !== 'none') { const c = rgba(cs.fill); if (!c) return null; if (c.a > 0) out.push({ ...c, a: c.a * own * Number(cs.fillOpacity || 1) }); }
          if (cs.stroke && cs.stroke !== 'none' && parseFloat(cs.strokeWidth) > 0) { const c = rgba(cs.stroke); if (!c) return null; if (c.a > 0) out.push({ ...c, a: c.a * own * Number(cs.strokeOpacity || 1) }); }
        }
        return out.filter(c => c.a > 0.01);
      });
    }
    for (const el of document.querySelectorAll('i, span')) {
      if (el.children.length || !ICON_FONT.test(typeof el.className === 'string' ? el.className : '')) continue;
      const glyph = getComputedStyle(el, '::before').content;
      if (!(el.textContent || '').trim() && (!glyph || glyph === 'none' || glyph === 'normal')) continue;
      judge(el, () => { const c = rgba(getComputedStyle(el).color); return c ? [{ ...c, a: c.a * Number(getComputedStyle(el).opacity) }] : null; });
    }
    if (faint.length) {
      faint.sort((a, b) => a.ratio - b.ratio);
      const names = [...new Set(faint.map(f => f.name))];
      const first = faint[0];
      const crop = first.host.getBoundingClientRect().height <= 120 ? first.host : first.icon.parentElement;
      add({ kind: 'faint-icon', group: 'faint-icon', what: `${faint.length === 1 ? 'An icon is' : `${faint.length} icons are`} hard to see: contrast ${first.ratio.toFixed(1)}:1 against the background (icons need 3:1). ${names.length === 1 ? `It is "${names[0]}"` : `For example ${names.slice(0, 3).map(n => `"${n}"`).join(', ')}`}`, detail: { count: faint.length, lowest: first.ratio, icons: faint.slice(0, 8).map(f => ({ name: f.name, contrast: f.ratio, color: f.color, background: f.background })) } }, crop);
    }
  }

  // ---- Overflowing its box: a chip, pill, badge or button that sticks out of its card ---------------
  // More than 2px outside the nearest boxed container (a border, a shadow or its own background), with
  // nothing clipping it. Not flagged: menus, tooltips and pop-overs, and anything placed out of the
  // flow on purpose (absolute, fixed or sticky: a corner badge, a ribbon).
  {
    const OUT = 2;
    const POPUP = '[role=menu], [role=tooltip], [role=listbox], [popover], dialog, [class*=tooltip i], [class*=popover i], [class*=dropdown i]';
    const cands = new Set([...pills, ...document.querySelectorAll('button, [role=button], a[class*=btn i], a[class*=button i], [class*=chip i], [class*=badge i], [class*=pill i]')]);
    const boxed = el => {
      const r = el.getBoundingClientRect();
      if (r.width < 100 || r.height < 40) return false;
      const cs = getComputedStyle(el);
      const sides = ['Top', 'Right', 'Bottom', 'Left'].filter(sd => parseFloat(cs[`border${sd}Width`]) > 0 && cs[`border${sd}Style`] !== 'none' && ((rgba(cs[`border${sd}Color`]) || { a: 0 }).a > 0.05)).length;
      if (sides >= 3 || (cs.boxShadow && cs.boxShadow !== 'none')) return true;
      const own = rgba(cs.backgroundColor), behind = backdrop(el);
      if (!own || own.a < 0.05 || !behind) return false;
      const seen = over(own, behind);
      return Math.abs(seen.r - behind.r) + Math.abs(seen.g - behind.g) + Math.abs(seen.b - behind.b) > 12;
    };
    const hits = new Map();
    for (const c of cands) {
      if (!inScope(c) || !shown(c) || c.closest(POPUP) || !text(c)) continue;
      let r = c.getBoundingClientRect();
      if (r.width < 12 || r.height < 10) continue;
      r = { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
      let box = null, floats = false;
      for (let x = c; x && x !== document.body && x !== document.documentElement; x = x.parentElement) {
        const cs = getComputedStyle(x);
        if (x !== c && boxed(x) && !x.matches('button, [role=button], a')) { box = x; break; }
        if (cs.position === 'absolute' || cs.position === 'fixed' || cs.position === 'sticky' || cs.float !== 'none' && x === c) { floats = true; break; }
        if (x !== c && (cs.overflowX !== 'visible' || cs.overflowY !== 'visible')) {
          // A clipping box between the chip and its card hides what sticks out: only the visible part counts.
          const k = x.getBoundingClientRect();
          r = { left: Math.max(r.left, k.left), right: Math.min(r.right, k.right), top: Math.max(r.top, k.top), bottom: Math.min(r.bottom, k.bottom) };
        }
      }
      if (!box || floats || r.right - r.left < 4 || r.bottom - r.top < 4) continue;
      // Past the edge of the screen (a table wider than a phone): the clipped-text check reports that.
      if (r.right > document.documentElement.clientWidth + OUT || r.left < -OUT) continue;
      const boxCs = getComputedStyle(box);
      if (boxCs.overflowX !== 'visible' || boxCs.overflowY !== 'visible') continue; // the card clips it: clipped-text reports that
      const b = box.getBoundingClientRect();
      const out = Math.max(r.right - b.right, b.left - r.left, r.bottom - b.bottom, b.top - r.top);
      if (out <= OUT) continue;
      const have = hits.get(box);
      if (!have || out > have.out) hits.set(box, { el: c, box, out: Math.round(out), text: text(c).slice(0, 40), n: (have ? have.n : 0) + 1 });
      else have.n++;
    }
    if (hits.size) {
      const all = [...hits.values()].sort((a, b) => b.out - a.out), h = all[0];
      const total = all.reduce((a, x) => a + x.n, 0);
      const word = h.el.matches('button, [role=button], a') ? 'button' : 'chip';
      add({ kind: 'overflow-box', group: 'overflow-box', what: `A ${word} sticks out of its box by ${h.out}px: "${h.text}"${total > 1 ? ` (and ${total - 1} more like it)` : ''}`, detail: { count: total, out_px: h.out, items: all.slice(0, 8).map(x => ({ text: x.text, out_px: x.out, in: describe(x.box) })) }, crop: pageBox([h.box.getBoundingClientRect(), h.el.getBoundingClientRect()], 12) }, h.box);
    }
  }

  // ---- Duplicates on one screen ----------------------------------------------------------------------
  // (a) The same block of text, 40 characters or more, shown in two different sections. Repeated items
  //     (cards, rows, messages) may share text, in one list or across lists: that is data, not a duplicate.
  // (b) The same control twice in the navigation: the same name in two navigations ("Calendar" in the
  //     side panel and as a tab), or two navigations with a link to the same place under other words.
  //     Footers, breadcrumbs, logos and Home links are normal repeats and are not flagged.
  {
    const NOT_TEXT = 'script, style, noscript, template, code, pre, textarea, select, option, [aria-hidden="true"], [role=tooltip]';
    const SECTION = 'section, article, aside, nav, header, footer, li, tr, [role=region], [role=tabpanel], [role=dialog], [role=complementary], [class*=card i], [class*=panel i], [class*=summary i], [class*=banner i]';
    const byText = new Map();
    for (const el of document.querySelectorAll('p, li, blockquote, dd, figcaption, td, div, span, h1, h2, h3, h4, h5, h6')) {
      if (el.closest(NOT_TEXT) || !inScope(el)) continue;
      if (![...el.children].every(c => getComputedStyle(c).display.startsWith('inline') || !text(c))) continue;
      const t = text(el);
      if (t.length < 40 || t.length > 600 || !shown(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 40 || r.height < 10) continue;
      const key = t.toLowerCase();
      const list = byText.get(key) || [];
      if (list.some(x => x.contains(el) || el.contains(x))) continue;
      list.push(el); byText.set(key, list);
    }
    const sectionOf = el => el.closest(SECTION) || el.parentElement;
    const repeats = (a, b) => a === b || (a.parentElement === b.parentElement && a.tagName === b.tagName);
    // One of several like items (a card in a grid, a row in a list): its text is data, and two items
    // may well say the same thing, in the same list or in two lists.
    const isItem = el => !!el.parentElement && [...el.parentElement.children].some(x => x !== el && x.tagName === el.tagName && sig(x) === sig(el));
    const dupText = [];
    for (const [, els] of byText) {
      if (els.length < 2) continue;
      for (let i = 1; i < els.length; i++) {
        const a = sectionOf(els[0]), b = sectionOf(els[i]);
        if (repeats(a, b) || a.contains(b) || b.contains(a) || (isItem(a) && isItem(b))) continue;
        dupText.push({ a: els[0], b: els[i], text: text(els[0]), places: [describe(a).slice(0, 60), describe(b).slice(0, 60)] });
        break;
      }
    }
    if (dupText.length) {
      const d = dupText[0];
      const box = pageBox([d.a.getBoundingClientRect(), d.b.getBoundingClientRect()], 12);
      add({ kind: 'duplicate-on-screen', group: 'duplicate-text', what: `The same text shows twice on this screen: "${d.text.slice(0, 80)}"${dupText.length > 1 ? ` (and ${dupText.length - 1} more repeated block${dupText.length > 2 ? 's' : ''})` : ''}`, detail: { how: 'text', count: dupText.length, blocks: dupText.slice(0, 5).map(x => ({ text: x.text.slice(0, 160), places: x.places })) }, ...(box.height < 1200 ? { crop: box } : {}) }, d.b);
    }

    const NAVS = 'nav, [role=navigation], [role=tablist], [role=menubar], [role=toolbar], aside, header, [class*=sidebar i], [class*=navbar i], [class*=topbar i], [class*=tabs i], [class*=tablist i]';
    const NORMAL = 'footer, [role=contentinfo], [aria-label*=breadcrumb i], [class*=breadcrumb i], [aria-label*=pagination i], [class*=pagination i], [class*=pager i], [role=menu], [role=dialog], dialog';
    const GENERIC = /^(home|back|close|menu|more|next|previous|prev|open|cancel|ok|skip|help|search)$/i;
    const placeOf = nav => {
      const label = nav.getAttribute('aria-label');
      if (nav.matches('[role=tablist], [class*=tabs i], [class*=tablist i]')) return label ? `the "${label}" tabs` : 'the tabs';
      if (nav.matches('aside, [class*=sidebar i]') || nav.closest('aside, [class*=sidebar i]')) return label ? `the "${label}" side navigation` : 'the side panel';
      if (nav.matches('header, [class*=topbar i], [class*=navbar i]') || nav.closest('header, [class*=topbar i], [class*=navbar i]')) return label ? `the "${label}" navigation in the top bar` : 'the top bar';
      return label ? `the "${label}" navigation` : 'the navigation';
    };
    const home = u => { try { const x = new URL(u, location.href); return /^\/?(index\.html?)?$/.test(x.pathname.replace(/\/+$/, '')) && /^#?\/?$/.test(x.hash) && !x.search; } catch { return true; } };
    const controls = [];
    for (const el of document.querySelectorAll('a[href], button, [role=tab], [role=menuitem], [role=link], [role=button]')) {
      const nav = el.closest(NAVS);
      if (!nav || el.closest(NORMAL) || !inScope(el) || !shown(el)) continue;
      if (el.parentElement && el.parentElement.closest('a[href], button, [role=tab], [role=button]')) continue;
      const words = text(el).replace(/\b\d+\b/g, '').replace(/\s+/g, ' ').trim();
      const name = (/[\p{L}]/u.test(words) ? words : (el.getAttribute('aria-label') || el.getAttribute('title') || '')).trim();
      if (/logo/i.test((typeof el.className === 'string' ? el.className : '') + ' ' + (el.getAttribute('aria-label') || '')) || (!words && el.querySelector('img') && el.matches('a[href]') && home(el.href))) continue;
      const href = el.matches('a[href]') ? el.getAttribute('href') : null;
      let target = null;
      if (href && !/^(#|javascript:|mailto:|tel:)$|^(javascript:|mailto:|tel:)/i.test(href) && !home(el.href)) { try { const x = new URL(el.href); target = x.origin + x.pathname.replace(/\/+$/, '') + x.search + x.hash; } catch {} }
      controls.push({ el, nav, name, key: name.toLowerCase(), target });
    }
    const dupCtl = [], used = new Set();
    const pair = (a, b, how) => { if (used.has(a.el) || used.has(b.el)) return; used.add(a.el); used.add(b.el); dupCtl.push({ a, b, how }); };
    for (let i = 0; i < controls.length; i++) for (let j = i + 1; j < controls.length; j++) {
      const a = controls[i], b = controls[j];
      const named = a.key && a.key === b.key && a.key.length >= 3 && a.key.split(' ').length <= 3 && !GENERIC.test(a.key);
      // The same name: in two navigations, or twice in one (two entries of one list only when they also
      // go to the same place: two chats may share a title). The same place under two different names:
      // only across two navigations.
      const sameItemList = a.nav === b.nav && repeats(a.el.closest('li') || a.el, b.el.closest('li') || b.el);
      if (named && (!sameItemList || (a.target && a.target === b.target))) pair(a, b, 'name');
      else if (!named && a.key && b.key && a.target && a.target === b.target && a.nav !== b.nav && !a.nav.contains(b.nav) && !b.nav.contains(a.nav)) pair(a, b, 'target');
    }
    if (dupCtl.length) {
      const d = dupCtl[0];
      const where = [placeOf(d.a.nav), placeOf(d.b.nav)];
      const said = d.how === 'name' ? `"${d.a.name}" is on this screen twice: in ${where[0]} and in ${where[1] === where[0] ? 'the same place again' : where[1]}`
        : `"${d.a.name || 'An unnamed control'}" in ${where[0]} and "${d.b.name || 'an unnamed control'}" in ${where[1]} go to the same place (${d.a.target.replace(/^https?:\/\/[^/]+/, '')})`;
      const box = pageBox([d.a.el.getBoundingClientRect(), d.b.el.getBoundingClientRect()], 16);
      add({ kind: 'duplicate-on-screen', group: 'duplicate-control', what: `${said}${dupCtl.length > 1 ? ` (and ${dupCtl.length - 1} more repeated control${dupCtl.length > 2 ? 's' : ''})` : ''}`, detail: { how: 'control', count: dupCtl.length, controls: dupCtl.slice(0, 5).map(x => ({ name: x.a.name, other_name: x.b.name, same: x.how, places: [placeOf(x.a.nav), placeOf(x.b.nav)], target: x.a.target || x.b.target || null })) }, ...(box.height < 1200 ? { crop: box } : {}) }, d.b.el);
    }
  }

  // ---- Stacked control rows: could these be one row? -------------------------------------------------
  // 2 rows of controls (search, sort, filters, tabs, view toggles) sitting directly above the same
  // list, each using less than half of the list's width. A judgment lead, not a rule.
  {
    const CTRL = 'input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=file]), select, [role=combobox], [role=searchbox], [role=tablist], [role=radiogroup], button, [role=button], [role=tab]';
    const AWAY = 'nav, header, aside, footer, [role=dialog], dialog, [role=menu], [role=navigation]';
    const nameOf = el => (el.getAttribute('aria-label') || el.getAttribute('placeholder') || text(el) || el.getAttribute('title') || el.getAttribute('name') || el.tagName.toLowerCase()).replace(/\s+/g, ' ').trim().slice(0, 24);
    const sorts = el => el.matches('input, select, [role=combobox], [role=searchbox], [role=tablist], [role=tab], [role=radiogroup], [aria-pressed], [aria-haspopup]') || /\b(sort|filter|view|grid|list|search)\b/i.test(nameOf(el));
    // How wide a control really is: a tab strip is as wide as its tabs, not as its container.
    const widthOf = el => { if (!el.matches('[role=tablist], [role=radiogroup]')) return el.getBoundingClientRect().width; const kids = [...el.children].filter(vis).map(k => k.getBoundingClientRect()); return kids.length ? Math.max(...kids.map(k => k.right)) - Math.min(...kids.map(k => k.left)) : el.getBoundingClientRect().width; };
    const lists = [...new Set([...groups.map(g => g.parent), ...[...document.querySelectorAll('table, [role=table], [role=grid], ul, ol, [role=list]')].filter(l => [...l.children].filter(vis).length >= 3 || l.matches('table, [role=table], [role=grid]'))])]
      .filter(l => inScope(l) && shown(l) && !l.closest(AWAY) && l.getBoundingClientRect().width >= 300 && l.getBoundingClientRect().height >= 80);
    const all = [...document.querySelectorAll(CTRL)].filter(c => vis(c) && inScope(c) && !c.closest(AWAY) && !(c.parentElement && c.parentElement.closest(CTRL)));
    let found = null;
    for (const list of lists) {
      const L = list.getBoundingClientRect();
      const above = all.filter(c => !list.contains(c)).map(c => ({ c, r: c.getBoundingClientRect() }))
        .filter(x => x.r.bottom <= L.top + 4 && L.top - x.r.bottom <= 220 && x.r.left < L.right && x.r.right > L.left && x.r.height <= 72);
      if (above.length < 2) continue;
      const rows = [];
      for (const x of above.sort((a, b) => a.r.top - b.r.top)) {
        const mid = (x.r.top + x.r.bottom) / 2;
        const row = rows.find(w => mid > w.top && mid < w.bottom);
        if (row) { row.els.push(x); row.top = Math.min(row.top, x.r.top); row.bottom = Math.max(row.bottom, x.r.bottom); }
        else rows.push({ top: x.r.top, bottom: x.r.bottom, els: [x] });
      }
      if (rows.length < 2) continue;
      rows.sort((a, b) => b.bottom - a.bottom);
      const [low, high] = rows;
      if (L.top - low.bottom > 64 || low.top - high.bottom > 32 || low.top - high.bottom < -2) continue;
      if (![low, high].every(w => w.els.some(x => sorts(x.c)))) continue;
      const share = w => w.els.reduce((a, x) => a + widthOf(x.c), 0) / L.width;
      if (share(low) >= 0.5 || share(high) >= 0.5) continue;
      // A heading between the rows means they belong to two different things.
      const between = [...document.querySelectorAll('h1, h2, h3, h4, h5, h6')].some(h => { const r = h.getBoundingClientRect(); return vis(h) && r.top >= high.bottom - 2 && r.bottom <= L.top + 2 && r.left < L.right && r.right > L.left; });
      if (between) continue;
      found = { list, L, low, high, share };
      break;
    }
    if (found) {
      const { L, low, high, share } = found;
      const names = w => w.els.sort((a, b) => a.r.left - b.r.left).map(x => nameOf(x.c)).filter(Boolean).slice(0, 4).join(', ');
      const pct = w => Math.round(share(w) * 100);
      const rects = [...high.els, ...low.els].map(x => x.r);
      add({ kind: 'stacked-controls', group: 'stacked-controls', what: `Two rows of controls sit above the same list (${names(high)} / ${names(low)}), and each uses less than half the width (${pct(high)}% and ${pct(low)}%). Could these be one row?`, detail: { rows: [{ controls: names(high), width_share: pct(high) }, { controls: names(low), width_share: pct(low) }], list_width: Math.round(L.width) }, crop: pageBox([...rects, { left: L.left, right: L.right, top: Math.min(...rects.map(r => r.top)), bottom: L.top + 60 }], 8) }, found.list);
    }
  }

  // ---- Faint borders: a component whose outline cannot be seen (WCAG 1.4.11) ------------------------
  // Inputs, text areas, dropdowns, dropdown triggers, checkboxes, radio buttons and outline buttons.
  // When the fill is close to the surface behind it, the border is the only thing that shows where the
  // component is, so the border needs 3:1 against that surface. The WCAG ratio alone would flag the
  // light gray borders that most light themes use (1.3:1 to 1.9:1 on white), which people do see. So a
  // lead also needs the border to be lost to the eye: a perceived lightness contrast under 8 (APCA Lc,
  // which rates dark pairs far lower than the WCAG ratio does). "#3A3C39 on #2A2C29" scores 5.5 and is
  // a lead. "#DDE1E8 on #FFFFFF" scores 18 and is not. Skipped: a component whose fill
  // contrasts at 3:1 or more (it needs no border), a filled button (its fill and its words show where it
  // is), disabled controls, native checkboxes and radio buttons (the browser draws them), and anything
  // over a picture or a gradient, which cannot be measured.
  {
    const MIN = 3, LOST = 8;
    // Perceived lightness contrast (APCA 0.0.98G), 0 to about 106. The sign (dark on light, or light on dark) is dropped.
    const apca = (fg, bg) => {
      const y = c => { const v = 0.2126729 * Math.pow(c.r / 255, 2.4) + 0.7151522 * Math.pow(c.g / 255, 2.4) + 0.072175 * Math.pow(c.b / 255, 2.4); return v > 0.022 ? v : v + Math.pow(0.022 - v, 1.414); };
      const t = y(fg), b = y(bg);
      return Math.abs(b > t ? (Math.pow(b, 0.56) - Math.pow(t, 0.57)) * 114 : (Math.pow(b, 0.65) - Math.pow(t, 0.62)) * 114);
    };
    const FIELD = 'input:not([type=hidden]):not([type=range]):not([type=file]):not([type=color]):not([type=image]):not([type=submit]):not([type=button]):not([type=reset]), textarea, select, [role=combobox], [role=textbox], [role=searchbox], [role=checkbox], [role=radio]';
    const TRIGGER = 'button[aria-haspopup], [role=button][aria-haspopup]';
    const BUTTON = 'button, [role=button], a[class*=btn i], a[class*=button i], input[type=submit], input[type=button]';
    const HEX = c => hex(c).toUpperCase();
    const fadeOf = el => { let o = 1; for (let x = el; x && x !== document.documentElement; x = x.parentElement) o *= Number(getComputedStyle(x).opacity); return o; };
    // The colors that draw an element's edge: its border sides, or a ring made with a box shadow
    // (no blur, spread of 1px or more). null: it has no edge. false: it has one that cannot be measured.
    const edges = el => {
      const cs = getComputedStyle(el), out = [];
      for (const sd of ['Top', 'Right', 'Bottom', 'Left']) {
        if (!(parseFloat(cs[`border${sd}Width`]) > 0) || ['none', 'hidden'].includes(cs[`border${sd}Style`])) continue;
        const c = rgba(cs[`border${sd}Color`]);
        if (!c) return false;
        if (c.a > 0.02) out.push(c);
      }
      if (cs.boxShadow && cs.boxShadow !== 'none') {
        for (const part of cs.boxShadow.split(/,(?![^(]*\))/)) {
          const m = part.trim().match(/^(.+?)\s+(-?[\d.]+)px\s+(-?[\d.]+)px\s+([\d.]+)px(?:\s+(-?[\d.]+)px)?(\s+inset)?$/i);
          if (!m || parseFloat(m[4]) > 1 || parseFloat(m[5] || 0) < 1 || Math.abs(parseFloat(m[2])) >= 1 || Math.abs(parseFloat(m[3])) >= 1) continue;
          const c = rgba(m[1]);
          if (c && c.a > 0.02) out.push(c);
        }
      }
      return out.length ? out : null;
    };
    // What a person sees of one box: its fill over the surface, and its strongest edge against that surface.
    const look = el => {
      const cs = getComputedStyle(el);
      if (cs.backgroundImage && cs.backgroundImage !== 'none') return null;
      const surface = backdrop(el), fill = rgba(cs.backgroundColor);
      if (!surface || !fill) return null;
      const fade = fadeOf(el);
      const fillSeen = fill.a > 0.01 ? over({ ...fill, a: Math.min(1, fill.a * fade) }, surface) : surface;
      const e = edges(el);
      if (e === false) return null;
      const seen = (e || []).map(c => over({ ...c, a: Math.min(1, c.a * fade) }, fillSeen)).sort((a, b) => contrast(b, surface) - contrast(a, surface))[0] || null;
      return { surface, fill: contrast(fillSeen, surface), edge: seen, ratio: seen ? contrast(seen, surface) : null, lc: seen ? apca(seen, surface) : null };
    };
    const nameOf = el => {
      const lab = (el.labels && el.labels[0]) || el.closest('label');
      return (el.getAttribute('aria-label') || el.getAttribute('placeholder') || (lab && (ownText(lab) || text(lab))) || (el.matches(BUTTON) && (text(el) || el.value)) || el.getAttribute('title') || el.getAttribute('name') || '').replace(/\s+/g, ' ').trim().slice(0, 40);
    };
    const faint = [], judged = new Set();
    const judge = (el, word, outlineOnly) => {
      if (judged.has(el) || !inScope(el) || !shown(el)) return;
      judged.add(el);
      if (el.disabled || el.readOnly || el.getAttribute('aria-disabled') === 'true' || el.closest('[aria-disabled="true"], fieldset[disabled], [aria-hidden="true"]')) return;
      const r = el.getBoundingClientRect();
      if (r.width < 12 || r.height < 12 || r.height > 400) return;
      if (el.matches('input[type=checkbox], input[type=radio]') && getComputedStyle(el).appearance !== 'none') return;
      let box = el, l = look(el);
      if (!l) return;
      // A field with no border of its own is often drawn by its wrapper (an icon and an input inside
      // one rounded box). Judge the nearest wrapper that hugs it and has an edge or a fill.
      if (!l.edge && !outlineOnly) {
        for (let x = el.parentElement, i = 0; x && i < 3 && x !== document.body; x = x.parentElement, i++) {
          const w = x.getBoundingClientRect();
          if (w.width > r.width + 140 || w.height > r.height + 48) break;
          const lw = look(x);
          if (!lw) return;
          if (lw.edge || lw.fill >= 1.1) { box = x; l = lw; break; }
        }
      }
      if (!l.edge || l.fill >= MIN || l.ratio >= MIN || l.lc >= LOST) return;
      if (outlineOnly && l.fill >= 1.1) return; // a filled button, not an outline button
      faint.push({ el: box, word, name: nameOf(el), ratio: Math.round(l.ratio * 10) / 10, lc: Math.round(l.lc * 10) / 10, border: HEX(l.edge), surface: HEX(l.surface) });
    };
    for (const el of document.querySelectorAll(FIELD)) judge(el, el.matches('select, [role=combobox]') ? 'dropdown' : el.matches('[type=checkbox], [role=checkbox]') ? 'checkbox' : el.matches('[type=radio], [role=radio]') ? 'radio button' : 'input', false);
    for (const el of document.querySelectorAll(TRIGGER)) judge(el, 'dropdown', false);
    for (const el of document.querySelectorAll(BUTTON)) judge(el, 'button', true);
    if (faint.length) {
      faint.sort((a, b) => a.ratio - b.ratio);
      const f = faint[0];
      const kinds = [...new Set(faint.map(x => x.word))];
      const others = faint.slice(1, 4).map(x => `${x.word}${x.name ? ` "${x.name}"` : ''} ${x.border} on ${x.surface}, ${x.ratio.toFixed(1)}:1`);
      add({ kind: 'faint-border', group: 'faint-border', what: `${faint.length === 1 ? `The outline of ${/^[aeiou]/.test(f.word) ? 'an' : 'a'} ${f.word} is` : `The outlines of ${faint.length} controls (${kinds.join(', ')}) are`} hard to see: the border of the ${f.word}${f.name ? ` "${f.name}"` : ''} is ${f.border} on ${f.surface}, ${f.ratio.toFixed(1)}:1 (component borders need 3:1)${others.length ? `. Also: ${others.join('; ')}` : ''}`,
        detail: { count: faint.length, lowest: f.ratio, items: faint.slice(0, 10).map(x => ({ kind: x.word, name: x.name, border: x.border, background: x.surface, contrast: x.ratio, lightness_contrast: x.lc })) }, crop: pageBox([f.el.getBoundingClientRect()], 24) }, f.el);
    }
  }

  // ---- Tight padding: one surface with much less inner padding than the others like it ---------------
  // Surfaces of one kind (cards, notices, list rows, settings rows: the same tag, fill, border, corner
  // and shadow, side by side) should keep their content the same distance from the edge. The padding
  // is measured: from the box edge to the nearest text, control or small image, on the left and on the
  // top. A picture that fills the box edge to edge does not count. A lead when one surface's padding
  // is under 60% of the median of the others, or under 8px while the others use 12px or more.
  {
    const AWAY = 'nav, header, footer, table, [role=tablist], [role=menu], [role=listbox], [role=tooltip], [role=dialog], dialog, button, [role=button], select, textarea, label, svg';
    const TAGS = new Set(['DIV', 'LI', 'SECTION', 'ARTICLE', 'A', 'ASIDE', 'DETAILS', 'FIELDSET', 'P', 'DL', 'BLOCKQUOTE']);
    const look = el => {
      const cs = getComputedStyle(el);
      const sides = ['Top', 'Right', 'Bottom', 'Left'].filter(sd => parseFloat(cs[`border${sd}Width`]) > 0 && cs[`border${sd}Style`] !== 'none' && ((rgba(cs[`border${sd}Color`]) || { a: 0 }).a > 0.05)).length;
      const own = rgba(cs.backgroundColor), behind = backdrop(el);
      const shadow = !!cs.boxShadow && cs.boxShadow !== 'none';
      let filled = false;
      if (own && own.a >= 0.05 && behind) { const seen = over(own, behind); filled = Math.abs(seen.r - behind.r) + Math.abs(seen.g - behind.g) + Math.abs(seen.b - behind.b) > 12; }
      if (!(sides >= 3 || shadow || filled)) return null;
      return `${el.tagName}|${cs.backgroundColor}|${sides}|${cs.borderTopWidth} ${cs.borderTopColor}|${Math.round(radius(el))}|${shadow}`;
    };
    const bySig = new Map();
    for (const el of document.querySelectorAll('body *')) {
      if (!TAGS.has(el.tagName) || el.closest(AWAY) || !inScope(el) || !shown(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 120 || r.height < 40 || r.height > 900 || isPill(el)) continue;
      const k = look(el);
      if (k) (bySig.get(k) || bySig.set(k, []).get(k)).push(el);
    }
    // Sets of 3 or more: siblings first, then cousins (cards in the columns of one grid).
    const sets = [];
    for (const els of bySig.values()) {
      const cluster = (list, up) => { const m = new Map(); for (const el of list) { const k = up(el); if (k) (m.get(k) || m.set(k, []).get(k)).push(el); } return [...m.values()]; };
      const loose = [];
      for (const list of cluster(els, el => el.parentElement)) (list.length >= 3 ? sets.push(list) : loose.push(...list));
      for (const list of cluster(loose, el => el.parentElement && el.parentElement.parentElement)) if (list.length >= 3) sets.push(list);
    }
    // Inner padding: how far the nearest content sits from the left and top edges.
    const inset = el => {
      const b = el.getBoundingClientRect(), cs = getComputedStyle(el);
      const x0 = b.left + (parseFloat(cs.borderLeftWidth) || 0), y0 = b.top + (parseFloat(cs.borderTopWidth) || 0);
      const lifted = n => { for (let x = n; x && x !== el; x = x.parentElement) { const p = getComputedStyle(x).position; if (p === 'absolute' || p === 'fixed') return true; } return false; };
      let left = Infinity, top = Infinity, n = 0;
      const take = r => { if (r.width < 2 || r.height < 2) return; left = Math.min(left, r.left - x0); top = Math.min(top, r.top - y0); n++; };
      const range = document.createRange();
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let t = walker.nextNode(); t; t = walker.nextNode()) {
        if (!t.textContent.trim() || !t.parentElement || !vis(t.parentElement) || lifted(t.parentElement)) continue;
        range.selectNodeContents(t);
        take(range.getBoundingClientRect());
      }
      for (const x of el.querySelectorAll('input:not([type=hidden]), select, textarea, button, img, svg, video, canvas')) {
        if (!vis(x) || lifted(x)) continue;
        const r = x.getBoundingClientRect();
        // A picture that runs edge to edge is not padded content.
        if (x.matches('img, video, canvas, svg') && (r.width >= b.width * 0.9 || (r.left - x0 <= 1 && r.top - y0 <= 1))) continue;
        take(r);
      }
      return n ? Math.max(0, Math.round(Math.min(left, top))) : null;
    };
    const median = xs => { const a = xs.slice().sort((p, q) => p - q); return a.length % 2 ? a[(a.length - 1) / 2] : (a[a.length / 2 - 1] + a[a.length / 2]) / 2; };
    const tight = [];
    for (const set of sets) {
      const pads = set.map(el => ({ el, pad: inset(el) })).filter(x => x.pad !== null);
      if (pads.length < 3) continue;
      const odd = [];
      for (const m of pads) {
        const rest = pads.filter(x => x !== m).map(x => x.pad), med = median(rest);
        // The others must agree with each other, or there is no usual padding to compare with.
        if (rest.filter(v => Math.abs(v - med) <= Math.max(3, med * 0.25)).length < Math.ceil(rest.length * 0.6)) continue;
        if ((med >= 8 && m.pad < med * 0.6 && med - m.pad >= 4) || (m.pad < 8 && med >= 12)) odd.push({ ...m, med: Math.round(med), others: rest.length });
      }
      if (odd.length && odd.length <= Math.max(1, Math.floor(pads.length / 3))) for (const o of odd) tight.push({ ...o, normal: pads.filter(x => !odd.some(y => y.el === x.el)).sort((p, q) => Math.abs(p.el.getBoundingClientRect().top - o.el.getBoundingClientRect().top) - Math.abs(q.el.getBoundingClientRect().top - o.el.getBoundingClientRect().top))[0] });
    }
    if (tight.length) {
      tight.sort((a, b) => (a.pad / a.med) - (b.pad / b.med));
      const t = tight[0], r = t.el.getBoundingClientRect();
      const word = t.el.matches('[role=alert], [role=status], [role=note], [class*=notice i], [class*=alert i], [class*=banner i], [class*=callout i]') ? 'notice' : (t.el.tagName === 'LI' || r.width >= r.height * 5) ? 'row' : 'card';
      const both = t.normal ? pageBox([r, t.normal.el.getBoundingClientRect()], 12) : null;
      add({ kind: 'tight-padding', group: 'tight-padding', what: `One ${word} has much tighter padding than the others like it: ${t.pad}px, where the ${t.others} others use ${t.med}px${describe(t.el).includes('"') ? ` (${describe(t.el).slice(0, 70)})` : ''}${tight.length > 1 ? ` (and ${tight.length - 1} more like it)` : ''}`,
        detail: { count: tight.length, items: tight.slice(0, 5).map(x => ({ what: describe(x.el).slice(0, 80), padding_px: x.pad, others_px: x.med, others: x.others })) }, crop: both && both.height <= 1000 ? both : pageBox([r], 12) }, t.el);
    }
  }

  // ---- Item states: the life of the things this app makes -------------------------------------------
  // Not a lead. Lists the status labels seen on repeated items (cards, rows): "Editing", "Rendering",
  // "Ready", "Posted". An item type with 3 or more states needs its life mapped before its buttons are
  // judged (Step 2b, Item lifecycles). One status label per item: an item with several is tagged, not staged.
  const itemStates = [];
  {
    const STATUS = /^(draft|drafts|editing|edited|in progress|in review|review|needs review|reviewing|rendering|rendered|processing|generating|generated|queued|pending|waiting|ready|done|complete|completed|finished|scheduled|published|posted|live|sent|sending|delivered|shipped|shipping|packing|paid|unpaid|overdue|failed|error|cancell?ed|archived|approved|rejected|declined|open|closed|resolved|confirmed|unconfirmed|booked|active|inactive|paused|expired|new|on hold|blocked|backlog|to ?do|doing|in transit|returned|refunded|submitted|accepted|uploading|uploaded|exporting|exported|syncing|synced|building|deployed|stopped|running|succeeded|upcoming|filled|unfilled|assigned|unassigned|checked in|no show)\b/i;
    const labels = new Set([...pills, ...document.querySelectorAll('[class*=status i], [class*=badge i], [class*=state i], [class*=chip i], [class*=tag i], [class*=pill i], td')]);
    const byList = new Map();
    for (const el of labels) {
      const t = text(el).replace(/^[^\p{L}]+/u, '');
      if (!t || t.length > 24 || t.split(' ').length > 3 || !STATUS.test(t) || !shown(el) || !inScope(el) || el.closest('nav, header, footer, [role=tablist], [role=menu], select, button, a')) continue;
      // The item this label sits on: the nearest ancestor with 2 or more same-tag siblings.
      let item = null;
      for (let x = el.parentElement; x && x !== document.body; x = x.parentElement) {
        if (x.parentElement && [...x.parentElement.children].filter(k => k.tagName === x.tagName && vis(k)).length >= 3) { item = x; break; }
      }
      if (!item) continue;
      const list = byList.get(item.parentElement) || { parent: item.parentElement, perItem: new Map() };
      byList.set(item.parentElement, list);
      const have = list.perItem.get(item) || new Set();
      have.add(t.replace(/\s+\d+%?$/, '').toLowerCase());
      list.perItem.set(item, have);
    }
    for (const list of byList.values()) {
      const states = new Set();
      for (const set of list.perItem.values()) if (set.size === 1) states.add([...set][0]);
      if (states.size < 2) continue;
      // What these items are: the nearest heading above the list, else the page title.
      let head = null;
      for (let x = list.parent; x && !head; x = x.parentElement) { let p = x.previousElementSibling; while (p && !head) { head = p.matches('h1, h2, h3, h4') ? p : p.querySelector('h1, h2, h3, h4'); p = p.previousElementSibling; } }
      itemStates.push({ item: (head ? text(head) : document.title || 'Items').slice(0, 60), states: [...states].map(st => st.charAt(0).toUpperCase() + st.slice(1)).sort(), items: list.perItem.size, mark: tag(list.parent) });
    }
  }

  // Layout shift: content that jumps after it was first shown (a banner that arrives late, an image
  // with no size, a font swap). The browser reports each jump; over 0.1 in total is easy to notice.
  const shift = { total: 0, count: 0 };
  try {
    if (typeof PerformanceObserver !== 'undefined' && (PerformanceObserver.supportedEntryTypes || []).includes('layout-shift')) {
      const S = (window.__srShift = window.__srShift || { log: [], po: null });
      if (!S.po) { S.po = new PerformanceObserver(l => S.log.push(...l.getEntries())); S.po.observe({ type: 'layout-shift', buffered: true }); }
      S.log.push(...S.po.takeRecords());
      const nav = (performance.getEntriesByType('navigation') || [])[0];
      // 300ms of grace after the load event: many apps draw their first screen right at load, and
      // that first draw is not a jump anyone sees.
      const from = Math.max(window.__srShiftFrom || 0, nav ? (nav.loadEventStart || nav.domContentLoadedEventEnd || 0) + 300 : 0);
      const mine = S.log.filter(e => e.startTime >= from && (opts.shiftWithInput || !e.hadRecentInput));
      shift.count = mine.length;
      shift.total = Math.round(mine.reduce((a, e) => a + e.value, 0) * 1000) / 1000;
      if (shift.total > 0.1) {
        const worst = mine.slice().sort((a, b) => b.value - a.value)[0];
        const node = ((worst.sources || []).map(x => x.node).filter(n => n && n.nodeType === 1 && n.isConnected).sort((a, b) => a.getBoundingClientRect().height - b.getBoundingClientRect().height)[0]) || null;
        add({ kind: 'layout-shift', group: 'layout-shift', what: `The page jumps after it has loaded: layout shift ${shift.total.toFixed(2)} (over 0.1 is easy to notice). What moved most: ${describe(node)}`, detail: { total: shift.total, shifts: shift.count, moved: describe(node) } }, node && node !== document.body ? node : null);
      }
    }
  } catch (e) {}

  // Reduced motion: people who ask their device for less motion should not get things sliding and
  // zooming. Only checked when the page is in "reduce motion" mode. Fades are fine; spinners and
  // progress bars are essential. Anything else that still moves is a lead.
  const motion = { reduced: false, moving: [] };
  try {
    motion.reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const MOVES = /transform|translate|scale|rotate|^(top|left|right|bottom|inset|width|height|max-?height|max-?width|margin|padding)/i;
    for (const a of document.getAnimations()) {
      if (a.playState !== 'running' || !a.effect || !a.effect.target) continue;
      const el = a.effect.target, timing = a.effect.getTiming();
      if (Number(timing.duration) < 50 || !vis(el)) continue;
      if (el.closest('[role=progressbar], [aria-busy="true"], [class*=spinner i], [class*=loading i], [class*=loader i], [class*=skeleton i], [class*=progress i]')) continue;
      const props = [...new Set(a.effect.getKeyframes().flatMap(k => Object.keys(k)))].filter(k => MOVES.test(k));
      if (props.length) motion.moving.push({ el, what: describe(el), props, ms: Math.round(Number(timing.duration)), forever: timing.iterations === Infinity });
    }
    if (motion.reduced && motion.moving.length) {
      const m = motion.moving[0];
      add({ kind: 'reduced-motion', group: 'reduced-motion|' + sig(m.el), what: `With "reduce motion" on, ${motion.moving.length === 1 ? 'something still moves' : `${motion.moving.length} things still move`}: ${m.what} animates ${m.props.join(', ')} ${m.forever ? 'without end' : `for ${m.ms}ms`}`, detail: { moving: motion.moving.slice(0, 5).map(x => ({ what: x.what, props: x.props, ms: x.ms, forever: x.forever })) } }, m.el);
    }
    motion.moving = motion.moving.map(x => ({ what: x.what, props: x.props, ms: x.ms, forever: x.forever }));
  } catch (e) {}

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
  // Style inventory for the taste pass: signals, not verdicts.
  const textEls = [...document.querySelectorAll('body *')].filter(el => vis(el) && ownText(el).length > 1);
  const weight = el => ownText(el).length;
  const tally = (f) => { const m = {}; for (const el of textEls) { const k = f(el); if (k) m[k] = (m[k] || 0) + weight(el); } return m; };
  const families = tally(el => getComputedStyle(el).fontFamily.split(',')[0].replace(/["']/g, '').trim());
  const sizes = tally(el => Math.round(parseFloat(getComputedStyle(el).fontSize)) + 'px');
  const rgb = c => (c.match(/[\d.]+/g) || []).map(Number);
  const isAccent = c => { const [r, g, b, a = 1] = rgb(c); if (a < 0.5) return false; const mx = Math.max(r, g, b), mn = Math.min(r, g, b); return mx > 40 && (mx - mn) / mx > 0.25; };
  const accents = new Set();
  for (const el of document.querySelectorAll('body *')) { if (!vis(el)) continue; const st = getComputedStyle(el); for (const c of [st.color, st.backgroundColor]) if (isAccent(c)) { const [r, g, b] = rgb(c); accents.add([r, g, b].map(v => Math.round(v / 32)).join(',')); } }
  const lines = [...document.querySelectorAll('p, li, dd, blockquote')].filter(el => vis(el) && text(el).length > 120).map(el => { const fs = parseFloat(getComputedStyle(el).fontSize) || 16; return Math.round(el.getBoundingClientRect().width / (fs * 0.5)); });
  const sortedLines = lines.sort((a, b) => a - b);
  const top = m => Object.entries(m).sort((a, b) => b[1] - a[1]);
  const style = {
    font_families: top(families).filter(([, n]) => n >= 20).map(([f]) => f),
    font_sizes: top(sizes).filter(([, n]) => n >= 10).map(([z]) => z),
    accent_colors: accents.size,
    line_length_chars: sortedLines.length ? { median: sortedLines[Math.floor(sortedLines.length / 2)], max: sortedLines[sortedLines.length - 1] } : null,
    all_caps_long: textEls.filter(el => { const t = ownText(el); return t.length > 40 && t === t.toUpperCase() && /[A-Z]/.test(t) || (getComputedStyle(el).textTransform === 'uppercase' && t.length > 40); }).length,
    emoji_icons: [...document.querySelectorAll('button, a, [role=button], nav *')].filter(el => vis(el) && /\p{Extended_Pictographic}/u.test(ownText(el))).length,
  };
  const main = document.querySelector('main') || document.body;
  const empty = /\b(no ([\w-]+ ){0,3}(yet|found)|nothing (here|yet)|get started|create your first|you (don't|do not) have any|is empty)\b/i.test(text(main));
  const kept = opts.only ? findings.filter(f => opts.only.includes(f.kind)) : findings;
  return { findings: kept, medianRadius, scale, counts, empty, style, shift, motion, item_states: itemStates, title: document.title, width: document.documentElement.clientWidth };
};

// ---- Sticky and fixed layers need a solid background (new in 0.9) -----------------------------------
// Looks at the page as it is scrolled right now. For every element with position sticky or fixed that
// sits over the page (a top bar, a chip, a message box, a bottom bar) it asks: is page content painted
// inside its box with nothing solid in between?
//   - The layer has a background that is not solid (under 90% opaque): any page text inside its box
//     shows through.
//   - The layer has no background at all, and holds words or controls with nothing solid behind them:
//     page text inside its box shows, and prints over those words when it passes behind them.
//     (A bare wrapper around solid parts is not a lead: a floating button with its own fill is fine.)
// Skipped: a layer with a picture or gradient behind it (a fade is drawn on purpose), a blur of 4px
// or more (frosted glass: the text underneath cannot be read), dialogs, menus, tooltips, toasts, a
// layer that covers most of the screen, and side panels (content sits beside them, not under).
// Returns { layers, open, scrollers, findings }. "scrollers" lists what can be scrolled, so a script
// can move content under each layer and ask again. Each finding carries "box": the layer's place on
// screen, for a screenshot taken while the content is under it.
var SHIPRIGHT_LAYERS = () => {
  const vw = innerWidth, vh = innerHeight;
  const vis = el => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) > 0.02; };
  const text = el => (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
  let ctx = null;
  const cache = new Map();
  const rgba = value => {
    if (!value) return null;
    if (cache.has(value)) return cache.get(value);
    let out = null;
    const m = String(value).match(/^rgba?\(\s*([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/);
    if (m) out = { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : (m[4].endsWith('%') ? parseFloat(m[4]) / 100 : +m[4]) };
    else { try { if (!ctx) { const cv = document.createElement('canvas'); cv.width = cv.height = 1; ctx = cv.getContext('2d', { willReadFrequently: true }); } ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = '#000'; ctx.fillStyle = value; ctx.fillRect(0, 0, 1, 1); const d = ctx.getImageData(0, 0, 1, 1).data; out = { r: d[0], g: d[1], b: d[2], a: d[3] / 255 }; } catch (e) { out = null; } }
    cache.set(value, out);
    return out;
  };
  const blurOf = cs => { const m = String(cs.backdropFilter || cs.webkitBackdropFilter || '').match(/blur\(([\d.]+)px\)/); return m ? parseFloat(m[1]) : 0; };
  const AWAY = '[role=dialog], dialog, [aria-modal=true], [role=tooltip], [role=menu], [role=listbox], [popover], [role=alert], [class*=toast i], [class*=snackbar i], [class*=tooltip i]';
  const mark = el => { if (!el.dataset.srlayer) { window.__srLayerN = (window.__srLayerN || 0) + 1; el.dataset.srlayer = 'L' + window.__srLayerN; } return el.dataset.srlayer; };

  // 1. The layers.
  const layers = [];
  const lifted = new WeakMap(); // element -> is it inside a fixed or sticky element?
  const isLifted = el => {
    if (!el || el === document.body || el === document.documentElement) return false;
    if (lifted.has(el)) return lifted.get(el);
    const p = getComputedStyle(el).position;
    const v = p === 'fixed' || p === 'sticky' || isLifted(el.parentElement);
    lifted.set(el, v);
    return v;
  };
  for (const el of document.querySelectorAll('body *')) {
    const cs = getComputedStyle(el);
    if (cs.position !== 'fixed' && cs.position !== 'sticky') continue;
    if (!vis(el) || el.closest(AWAY) || parseInt(cs.zIndex, 10) < 0) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 40 || r.height < 16 || r.bottom <= 0 || r.top >= vh || r.right <= 0 || r.left >= vw) continue;
    if (r.width * r.height > vw * vh * 0.5 || (r.height > vh * 0.7 && r.width < vw * 0.5)) continue;
    if (layers.some(l => l.el.contains(el))) continue;
    layers.push({ el, r, cs, sticky: cs.position === 'sticky' });
  }

  // 2. What can scroll: the page, and boxes that scroll inside it.
  const scrollers = [];
  const doc = document.scrollingElement || document.documentElement;
  if (doc.scrollHeight - doc.clientHeight > 40) scrollers.push({ mark: 'document', max: doc.scrollHeight - doc.clientHeight, top: Math.round(doc.scrollTop), area: vw * vh });
  for (const el of document.querySelectorAll('body *')) {
    if (el.scrollHeight - el.clientHeight <= 40 || el.clientHeight < 120) continue;
    const oy = getComputedStyle(el).overflowY;
    if ((oy !== 'auto' && oy !== 'scroll') || !vis(el) || el.closest(AWAY)) continue;
    if (!el.dataset.srs) { window.__srScrollN = (window.__srScrollN || 0) + 1; el.dataset.srs = 'S' + window.__srScrollN; }
    scrollers.push({ mark: el.dataset.srs, max: el.scrollHeight - el.clientHeight, top: Math.round(el.scrollTop), area: el.clientWidth * el.clientHeight });
  }
  scrollers.sort((a, b) => b.area - a.area);

  // 3. For each layer: is it solid? If not, where is it open?
  const fadeTo = (node, root) => { let o = 1; for (let x = node; x; x = x.parentElement) { o *= Number(getComputedStyle(x).opacity); if (x === root) break; } return o; };
  // What sits between a node inside the layer and the page behind it: 'solid', 'image', 'blur' or null.
  const cover = (node, root) => {
    for (let x = node; x; x = x.parentElement) {
      const cs = getComputedStyle(x);
      if (cs.backgroundImage && cs.backgroundImage !== 'none') return 'image';
      const c = rgba(cs.backgroundColor);
      if (c && c.a * fadeTo(x, root) >= 0.9) return 'solid';
      if (blurOf(cs) >= 4) return 'blur';
      if (x === root) break;
    }
    return null;
  };
  const open = [];
  for (const l of layers) {
    const c = rgba(l.cs.backgroundColor) || { a: 0 };
    const alpha = c.a * Number(l.cs.opacity);
    if ((l.cs.backgroundImage && l.cs.backgroundImage !== 'none') || alpha >= 0.9 || blurOf(l.cs) >= 4) continue;
    const edged = ['Top', 'Right', 'Bottom', 'Left'].some(sd => parseFloat(l.cs[`border${sd}Width`]) > 0 && l.cs[`border${sd}Style`] !== 'none' && ((rgba(l.cs[`border${sd}Color`]) || { a: 0 }).a > 0.05)) || (l.cs.boxShadow && l.cs.boxShadow !== 'none');
    // The layer's own words and controls that have nothing solid behind them.
    const ink = [];
    const range = document.createRange();
    const walker = document.createTreeWalker(l.el, NodeFilter.SHOW_TEXT);
    for (let t = walker.nextNode(); t; t = walker.nextNode()) {
      if (!t.textContent.trim() || !t.parentElement || !vis(t.parentElement) || cover(t.parentElement, l.el)) continue;
      range.selectNodeContents(t);
      const r = range.getBoundingClientRect();
      if (r.width >= 4 && r.height >= 4) ink.push(r);
    }
    for (const x of l.el.querySelectorAll('input:not([type=hidden]), textarea, select, button, [role=button], [contenteditable="true"], [role=textbox]')) if (vis(x) && !cover(x, l.el)) ink.push(x.getBoundingClientRect());
    // Parts of the layer that are solid by themselves (a filled button inside a bare wrapper).
    const solids = [...l.el.querySelectorAll('*')].filter(x => vis(x) && cover(x, x) === 'solid').map(x => x.getBoundingClientRect());
    // A bar with a see-through fill, an edge, or words of its own is a box: page text anywhere inside
    // it shows. A bare wrapper around solid parts (a floating button) is not.
    if (alpha > 0.02 || edged || ink.length) open.push({ ...l, alpha, box: true, ink, solids });
  }

  // 4. Page text that is on screen right now, cut to what its scrolling boxes let through.
  const findings = [];
  if (open.length) {
    const seen = r => { for (const l of open) if (r.right > l.r.left && r.left < l.r.right && r.bottom > l.r.top && r.top < l.r.bottom) return true; return false; };
    const clip = (el, r) => {
      let left = r.left, top = r.top, right = r.right, bottom = r.bottom;
      for (let x = el; x && x !== document.documentElement && x !== document.body; x = x.parentElement) {
        const cs = getComputedStyle(x);
        if (cs.overflowX !== 'visible' || cs.overflowY !== 'visible') { const k = x.getBoundingClientRect(); left = Math.max(left, k.left); top = Math.max(top, k.top); right = Math.min(right, k.right); bottom = Math.min(bottom, k.bottom); }
        if (Number(cs.opacity) < 0.1 || cs.visibility === 'hidden') return null;
      }
      return right - left > 0 && bottom - top > 0 ? { left, top, right, bottom } : null;
    };
    const content = [];
    const range = document.createRange();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let t = walker.nextNode(); t; t = walker.nextNode()) {
      const words = t.textContent.replace(/\s+/g, ' ').trim();
      const p = t.parentElement;
      if (words.length < 2 || !p || p.closest('script, style, noscript, template, [aria-hidden="true"]')) continue;
      range.selectNodeContents(t);
      const r0 = range.getBoundingClientRect();
      if (r0.width < 4 || r0.height < 4 || r0.bottom <= 0 || r0.top >= vh || !seen(r0)) continue;
      if (isLifted(p) || p.closest(AWAY) || !vis(p)) continue;
      const r = clip(p, r0);
      if (r) content.push({ r, words });
    }
    for (const l of open) {
      let area = 0;
      const texts = [];
      let how = null;
      for (const c of content) {
        const hit = b => { const w = Math.min(c.r.right, b.right) - Math.max(c.r.left, b.left), h = Math.min(c.r.bottom, b.bottom) - Math.max(c.r.top, b.top); return w >= 8 && h >= 4 ? { w, h, x: Math.max(c.r.left, b.left) + w / 2, y: Math.max(c.r.top, b.top) + h / 2 } : null; };
        let got = null;
        for (const i of l.ink) { const h = hit(i); if (h) { got = h; how = 'prints over'; break; } }
        if (!got && l.box) { const h = hit(l.r); if (h && h.w >= 12 && h.h >= 6 && !l.solids.some(s => h.x >= s.left && h.x <= s.right && h.y >= s.top && h.y <= s.bottom)) { got = h; how = how || 'shows through'; } }
        if (!got) continue;
        area += got.w * got.h;
        if (!texts.includes(c.words)) texts.push(c.words);
      }
      if (!texts.length || area < 150) continue;
      const wide = l.r.width >= vw * 0.6;
      const word = l.el.querySelector('textarea, [contenteditable="true"], [role=textbox]') || l.el.matches('textarea, form') ? 'message box'
        : l.el.matches('th, thead, tr') ? 'table header'
        : wide && l.r.top <= 12 ? 'top bar' : wide && l.r.bottom >= vh - 12 ? 'bottom bar'
        : /^H[1-6]$/.test(l.el.tagName) ? 'sticky heading' : l.r.width < 240 ? 'floating chip' : l.sticky ? 'sticky bar' : 'fixed bar';
      const bg = l.alpha <= 0.02 ? 'no background' : `a see-through background (${Math.round(l.alpha * 100)}% opaque)`;
      findings.push({ kind: 'see-through-layer', group: `see-through|${word}`, mark: mark(l.el),
        what: `Content scrolls under the ${word} and ${how === 'prints over' ? 'prints over it' : 'shows through it'}: "${texts[0].slice(0, 60)}" can be read inside it, because the ${word} has ${bg}`,
        detail: { layer: word, name: text(l.el).slice(0, 60), position: l.sticky ? 'sticky' : 'fixed', background: l.alpha <= 0.02 ? 'none' : `${Math.round(l.alpha * 100)}% opaque`, how, overlap_px: Math.round(area), texts: texts.slice(0, 4).map(t => t.slice(0, 80)) },
        box: { x: Math.round(l.r.left), y: Math.round(l.r.top), width: Math.round(l.r.width), height: Math.round(l.r.height) } });
    }
  }
  return { layers: layers.length, open: open.length, scrollers: scrollers.slice(0, 4).map(({ area, ...x }) => x), findings };
};
