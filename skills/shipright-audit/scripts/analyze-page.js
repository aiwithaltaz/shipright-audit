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
// A finding may carry "crop": a box in page pixels to screenshot when the problem is wider than one element.
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
  return { findings: kept, medianRadius, scale, counts, empty, style, shift, motion, title: document.title, width: document.documentElement.clientWidth };
};
