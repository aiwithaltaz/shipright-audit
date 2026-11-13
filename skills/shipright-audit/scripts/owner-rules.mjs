#!/usr/bin/env node
// Read the owner's own design rules and history from the project folder, before the audit, without asking.
// A pain that breaks one of the owner's own rules is the strongest evidence there is. Something that
// differs from the leaders but matches a decision the owner wrote down is not a pain.
// Usage: node <skill>/scripts/owner-rules.mjs [folder] [--out <audit>/owner-rules.md] [--add file ...]
//   folder  the project folder (default: the current folder)
//   --add   a file the owner handed over later ("here are my design rules"). Read whatever its name is.
// It reads: DESIGN.md, design-system*, *taste*, style guides, brand and UI guidelines, CHANGELOG*,
// README* and every .md under docs/. It quotes each line that states a rule ("always", "never",
// "must", a size in px...) or a decision ("on purpose", "by design", "we decided") with its file and line.
// Benchmark fairness: a file whose name says it may list the owner's current complaints (*complaints*,
// *notes*, *issues*, *feedback*, and close words: *problems*, *bugs*, *gripes*, *todo*, *wishlist*) is
// never opened, even if it sits in the folder. It is listed as skipped.
// Design rules and changelogs are allowed. A list of what the owner dislikes today is not, until the gate passes.
// Writes owner-rules.md only when it found at least one file to read. Exit 0 ran, 2 usage. No dependencies.
import { readFileSync, readdirSync, statSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, join, relative, basename, dirname, extname, sep } from 'node:path';

const args = process.argv.slice(2);
const flag = n => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const added = args.flatMap((a, i) => a === '--add' && args[i + 1] ? [resolve(args[i + 1])] : []);
const folderArg = args.find((a, i) => !a.startsWith('--') && !['--out', '--add'].includes(args[i - 1]));
const folder = resolve(folderArg || '.');
if (!existsSync(folder) || !statSync(folder).isDirectory()) { console.error(`usage: node <skill>/scripts/owner-rules.mjs [folder] [--out file] [--add file]\nowner-rules: ${folder} is not a folder`); process.exit(2); }
const out = resolve(flag('--out') || join('docs', 'shipright', 'audits', 'current', 'owner-rules.md'));

const TEXT = ['.md', '.mdx', '.markdown', '.txt', '.rst', ''];
const SKIP_DIR = /^(node_modules|dist|build|out|vendor|coverage|target|tmp|temp|__pycache__)$/i;
// Never opened: the name says it may hold the owner's current complaints.
const COMPLAINTS = /complaints?|notes?|issues?|feedback|problems?|bugs?|gripes?|to-?do|wish-?list/i;
const WANTED = /^design\.|^design[-_ ]?(system|rules|principles|guide|tokens|language)|taste|style[-_ ]?guide|^brand|ui[-_ ]?guidelines|^changelog|^history\.|^readme/i;

const read = [], skipped = [];
function walk(dir, depth) {
  if (depth > 4) return;
  let names; try { names = readdirSync(dir).sort(); } catch { return; }
  for (const name of names) {
    const p = join(dir, name);
    let st; try { st = statSync(p); } catch { continue; }
    const rel = relative(folder, p).split(sep).join('/');
    if (st.isDirectory()) {
      // Never an earlier audit's own notes, and nothing hidden or generated.
      if (name.startsWith('.') || SKIP_DIR.test(name) || rel === 'docs/shipright') continue;
      walk(p, depth + 1);
      continue;
    }
    if (!TEXT.includes(extname(name).toLowerCase()) || st.size > 400000) continue;
    const inDocs = rel.startsWith('docs/') && extname(name).toLowerCase() !== '';
    if (!WANTED.test(name) && !inDocs) { if (COMPLAINTS.test(name)) skipped.push(rel); continue; }
    if (COMPLAINTS.test(name)) { skipped.push(rel); continue; }
    read.push({ path: p, rel });
  }
}
walk(folder, 0);
for (const f of added) if (existsSync(f) && !read.some(r => r.path === f)) read.push({ path: f, rel: relative(folder, f).split(sep).join('/').replace(/^(\.\.\/)+/, '') || basename(f), added: true });

// A decision: the owner says a thing is the way it is on purpose.
const DECISION = /\bon purpose\b|\bby design\b|\bdeliberate(ly)?\b|\bintentional(ly)?\b|\bwe (chose|decided|kept|keep|want|prefer)\b|\bdecision\b|\b(do not|don't|never) (change|touch|soften|remove)\b|\bkeep it\b|\bnot a bug\b|\bstays?\b|\bour (voice|tone|style)\b/i;
// A rule: a design subject, said as something that holds.
const SUBJECT = /\b(\d+ ?px|\d+ ?rem|spacing|space[ds]?|gap|padding|margin|radius|corner|rounded|colou?rs?|palette|fonts?|typeface|type scale|sizes?|weight|buttons?|cards?|icons?|borders?|shadows?|backgrounds?|surface|tone|voice|copy|wording|greeting|labels?|headings?|titles?|grid|columns?|accent|primary|secondary|contrast|animations?|motion|dark mode|light mode|theme|inputs?|fields?|search|lists?|rows?|panels?|sidebar|modal|dialogs?|menus?|chips?|pills?|badges?|tokens?|scale|line height|emoji|capitali[sz]|sentence case|tables?|empty states?|toasts?|tooltips?|navigation|nav|logo|brand)\b/i;
const HOLDS = /\b(always|never|must|should|shall|only|do not|don't|avoid|no more than|at most|at least|every|each|all|use|uses|using|is|are|sit|sits|stay|stays|keep|keeps|one|single|same)\b/i;
const clean = l => l.replace(/^\s*(?:[-*+]|\d+[.)])\s+/, '').replace(/^#+\s*/, '').replace(/^>\s*/, '').replace(/\*\*|__|`/g, '').replace(/\s+/g, ' ').trim();

const quotes = [];
const perFile = [];
for (const f of read) {
  let lines; try { lines = readFileSync(f.path, 'utf8').split('\n'); } catch { continue; }
  const isHistory = /^(changelog|history)/i.test(basename(f.path)), isReadme = /^readme/i.test(basename(f.path));
  const cap = isHistory ? 40 : isReadme ? 20 : 80;
  let fence = false, n = 0;
  lines.forEach((raw, i) => {
    if (/^\s*(```|~~~)/.test(raw)) { fence = !fence; return; }
    if (fence || n >= cap || /^\s*\|?\s*-{3,}/.test(raw)) return;
    const isHeading = /^\s*#/.test(raw);
    const text = clean(raw);
    if (text.length < 12 || text.length > 320 || isHeading) return;
    const decision = DECISION.test(text);
    const rule = SUBJECT.test(text) && HOLDS.test(text);
    // A changelog or README is mostly not rules: keep only stated decisions and plain design rules.
    if (!decision && !rule) return;
    if ((isHistory || isReadme) && !decision && !/\b(always|never|must|only|do not|don't)\b/i.test(text)) return;
    quotes.push({ kind: decision ? 'decision' : 'rule', text, where: `${f.rel}:${i + 1}` });
    n++;
  });
  perFile.push({ rel: f.rel, quotes: n, added: !!f.added });
}

if (!read.length) {
  console.log(`owner-rules: no design rules or changelog found in ${folder}.${skipped.length ? ` Skipped without opening (may list current complaints): ${skipped.join(', ')}. Note that in the pain map's "Context used".` : ''} Tell the owner in one line: "If you have design rules or a changelog, drop the file here any time."`);
  process.exit(0);
}
const md = ['# Owner rules', '',
  'Read from the project folder before the audit, without asking. These are the owner\'s own words.', '',
  '- A pain that breaks one of these rules gets the lens `Owner rule: "<quote>"`. That is the strongest evidence there is.',
  '- Something that differs from the leaders or from good practice but matches an owner decision is **not a pain**. It goes in the pain map\'s **Owner decisions respected**, with the quote.',
  '- When unsure whether something is on purpose (a brand or vendor name, a style), ask it in **Decisions for the owner**. Do not make it a pain.', '',
  `Folder: ${folder}`, '',
  '## Rules and decisions (quoted)', '',
  'Found by keyword, so read the files below yourself too. Add any rule this table missed as a new row, quoted word for word with its file and line.', '',
  '| # | Kind | Quote | File and line |', '| --- | --- | --- | --- |',
  ...(quotes.length ? quotes.map((q, i) => `| O${String(i + 1).padStart(2, '0')} | ${q.kind} | "${q.text.replace(/\|/g, '/')}" | ${q.where} |`) : ['| none | | No rule or decision lines found by keyword. Read the files below. | |']),
  '', '## Files read', '', ...perFile.map(f => `- ${f.rel}: ${f.quotes} quote(s)${f.added ? ' (handed over by the owner)' : ''}`),
  '', '## Skipped on purpose (benchmark fairness)', '',
  ...(skipped.length ? [...skipped.map(f => `- ${f}: its name says it may list the owner's current complaints. Not opened.`), '', 'Do not open these before the gate passes. Name each one in the pain map\'s "Context used" line as skipped.'] : ['- Nothing skipped.'])];
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, md.join('\n') + '\n');
console.log(`owner-rules: ${quotes.length} quote(s) from ${perFile.length} file(s)${skipped.length ? `, ${skipped.length} file(s) skipped without opening (${skipped.join(', ')})` : ''} · ${out}`);
