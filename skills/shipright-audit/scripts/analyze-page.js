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
