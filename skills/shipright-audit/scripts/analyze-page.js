// ShipRight Audit: in-page visual and style checks, one function shared by visual.mjs and by hand.
// visual.mjs runs it in each page. When the scripts cannot reach a site (for example an app only your own
// browser is signed in to), paste this whole file into a browser tool's JavaScript runner, add
// "JSON.stringify(SHIPRIGHT_ANALYZE())" on the next line, and read the result: it returns the same leads
// and style inventory visual.mjs writes (minus the crop screenshots, which you take yourself).
// Thresholds are CSS pixels at 1280 wide: 6px is the smallest misalignment people notice side by side;
// 40px is a gap that reads as "empty" in a card.
var SHIPRIGHT_ANALYZE = () => {
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
  return { findings, medianRadius, scale, counts, empty, style, title: document.title };
};
