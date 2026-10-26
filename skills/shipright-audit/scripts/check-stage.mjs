#!/usr/bin/env node
// Check a pain map against the shipright-audit gate. Every failure names the row and the field to fix.
// Usage: node <skill>/scripts/check-stage.mjs <pain-map.md>
// When the audit folder holds visual/visual.json, every visual lead must be listed in "## Visual leads"
// as a pain or as Rejected with a reason. When screens/crawl.json marks a screen as still loading,
// a pain may not cite that screen's screenshot.
//        node <skill>/scripts/check-stage.mjs --self-test
// Exit 0 pass, 1 fail (fix and rerun), 2 usage. No dependencies.
import { readFileSync, existsSync, readdirSync, statSync, mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, basename, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const SECTIONS = ['Screens', 'Task walks', 'Keeps', 'Pains', 'Missing', 'Fix map', 'Themes', 'Not verified', 'Left behind'];
const CAUSES = ['layout', 'flow', 'copy', 'missing feature', 'data model', 'rules or prerequisites', 'performance', 'trust', 'access'];
const SEVERITY_WORDS = { blocker: 4, major: 3, minor: 2, polish: 1 };

// Split the file into "## Heading" sections and parse the first table in each.
function parse(md) {
  const sections = {};
  let current = '_header';
  for (const line of md.split('\n')) {
    const h = line.match(/^##\s+(.+?)\s*$/);
    if (h) { current = h[1].trim(); sections[current] = []; continue; }
    (sections[current] ??= []).push(line);
  }
  const table = lines => {
    const rows = lines.filter(l => l.trim().startsWith('|')).map(l => l.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim()));
    if (rows.length < 2) return { head: rows[0] || [], rows: [] };
    return { head: rows[0].map(h => h.toLowerCase()), rows: rows.slice(2).filter(r => r.some(c => c)) };
  };
  return { sections, table, header: (sections._header || []).join('\n') };
}

// dir: the pain map's folder. When given, every screenshot a pain cites must exist somewhere under it.
export function check(md, dir = null) {
  const errors = [];
  const { sections, table, header } = parse(md);
  const col = (t, name) => t.head.findIndex(h => h.includes(name));
  const cell = (t, row, name) => { const i = col(t, name); return i >= 0 ? (row[i] || '') : ''; };

  if (/<[a-z][^>]*>/i.test(md.replace(/```[\s\S]*?```/g, ''))) errors.push('Template placeholders like <app name> are still in the file. Replace every one.');
  for (const s of SECTIONS) if (!sections[s]) errors.push(`Missing section "## ${s}".`);
  for (const f of ['Scope:', 'Out of scope:', 'Reviewers:']) if (!header.includes(f)) errors.push(`Header is missing "${f}". State it under the title.`);

  const screens = table(sections['Screens'] || []);
  if (!screens.rows.length) errors.push('Screens: no rows. List every screen in scope.');

  const walks = table(sections['Task walks'] || []);
  if (walks.rows.length < 3) errors.push(`Task walks: ${walks.rows.length} row(s). Walk at least 3 core tasks.`);
  walks.rows.forEach((r, i) => { if (!/\d/.test(cell(walks, r, 'steps'))) errors.push(`Task walks row ${i + 1} ("${r[0]}"): Steps needs a count.`); });

  const keeps = table(sections['Keeps'] || []);
  if (keeps.rows.length < 3) errors.push(`Keeps: ${keeps.rows.length} row(s). Name at least 3 things that work.`);

  const pains = table(sections['Pains'] || []);
  if (!pains.rows.length) errors.push('Pains: no rows.');
  const ids = new Set();
  for (const r of pains.rows) {
    const id = r[0] || '(no ID)';
    if (ids.has(id)) errors.push(`Pains ${id}: duplicate ID. Merge duplicates into one pain.`);
    ids.add(id);
    const where = cell(pains, r, 'where');
    if (!where) errors.push(`Pains ${id}: Where is empty. Name the screen.`);
    else if (!/\.(png|jpe?g|webp)\b|screens\//i.test(where)) errors.push(`Pains ${id}: Where has no screenshot path. Add one, for example screens/home-390.png.`);
    if (!cell(pains, r, 'heuristic')) errors.push(`Pains ${id}: name the heuristic or lens it breaks.`);
    const sev = cell(pains, r, 'severity').toLowerCase();
    if (!/\b[1-4]\b/.test(sev) && !Object.keys(SEVERITY_WORDS).some(w => sev.includes(w))) errors.push(`Pains ${id}: severity "${sev || 'empty'}" must be 1 to 4 or Blocker, Major, Minor, Polish.`);
    const cause = cell(pains, r, 'cause').toLowerCase();
    if (!CAUSES.includes(cause)) errors.push(`Pains ${id}: cause "${cause || 'empty'}" must be one of: ${CAUSES.join(', ')}.`);
    if (!/^(found|reported)\b/i.test(cell(pains, r, 'source'))) errors.push(`Pains ${id}: source must start with Found or Reported.`);
    // One problem per row. Quotes, code and parentheses are ignored, so quoting the app's own text is fine.
    const what = cell(pains, r, 'what happens').replace(/"[^"]*"|\u201c[^\u201d]*\u201d|`[^`]*`|\([^)]*\)/g, ' ');
    if (what.includes(';')) errors.push(`Pains ${id}: "What happens" joins problems with ";". Give each problem its own row.`);
    const sentences = what.split(/[.!?]+(?:\s+|$)/).filter(x => x.trim().length > 2).length;
    if (sentences > 2) errors.push(`Pains ${id}: "What happens" has ${sentences} sentences. Describe one problem in one sentence (two at most); split the rest into new rows.`);
  }

  const missingRows = table(sections['Missing'] || []).rows;
  if (sections['Missing'] && !missingRows.length && !/none found/i.test((sections['Missing'] || []).join('\n'))) errors.push('Missing: no rows. Check the page inventory and list what is missing, or write "None found" with what you checked.');

  const fix = table(sections['Fix map'] || []);
  const nowIds = [];
  for (const r of fix.rows) {
    const id = r[0] || '(no ID)';
    const bucket = (r[r.length - 1] || '').toLowerCase();
    if (!['now', 'next', 'later'].includes(bucket)) errors.push(`Fix map ${id}: last column must be Now, Next or Later.`);
    if (bucket === 'now') {
      nowIds.push(id);
      for (const f of ['chosen', 'principle', 'test']) if (!cell(fix, r, f)) errors.push(`Fix map ${id}: Now pains need a ${f === 'chosen' ? 'chosen fix' : f}.`);
    }
    if (!ids.has(id)) errors.push(`Fix map ${id}: no pain with this ID in Pains.`);
  }
  if (!fix.rows.length && pains.rows.length) errors.push('Fix map: no rows. Rank the pains.');

  const themes = table(sections['Themes'] || []);
  if (nowIds.length && !themes.rows.length) errors.push('Themes: group the Now pains into 3 to 5 themes.');
  if (themes.rows.length && (themes.rows.length < 3 || themes.rows.length > 5) && nowIds.length >= 3) errors.push(`Themes: ${themes.rows.length} theme(s). Use 3 to 5.`);

  if (dir) {
    const walk = d => readdirSync(d).flatMap(n => { const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : [n]; });
    const onDisk = new Set(walk(dir));
    for (const r of pains.rows) {
      for (const shot of (cell(pains, r, 'where').match(/[\w./-]+\.(?:png|jpe?g|webp)\b/gi) || [])) {
        if (!onDisk.has(basename(shot))) errors.push(`Pains ${r[0]}: screenshot ${shot} does not exist. Cite a file you saved, or move the claim to Not verified.`);
      }
    }
  }

  if (dir) {
    const find = (d, name, depth = 0) => { if (depth > 3 || !existsSync(d)) return null; for (const n of readdirSync(d)) { const p = join(d, n); if (n === name) return p; if (statSync(p).isDirectory()) { const f = find(p, name, depth + 1); if (f) return f; } } return null; };
    // Visual leads ledger: no lead the script measured may vanish without a decision.
    const vj = find(dir, 'visual.json');
    if (vj) {
      let leads = [];
      try { const v = JSON.parse(readFileSync(vj, 'utf8')); leads = (v.leads || v.findings || []).map(l => l.id); } catch {}
      if (leads.length) {
        const ledger = table(sections['Visual leads'] || []);
        if (!sections['Visual leads']) errors.push(`Missing section "## Visual leads". visual.mjs found ${leads.length} lead(s); list each as a pain (P##) or Rejected with the reason.`);
        else {
          const rows = new Map(ledger.rows.map(r => [r[0], r]));
          const missingLeads = leads.filter(id => !rows.has(id));
          if (missingLeads.length) errors.push(`Visual leads: ${missingLeads.join(', ')} not decided. Add a row for each: the pain ID it became, or "Rejected: <what you saw on the crop>".`);
          for (const [id, r] of rows) {
            const decision = cell(ledger, r, 'decision') || r[r.length - 1] || '';
            const pain = decision.match(/\bP\d{2,}\b/);
            if (pain && !ids.has(pain[0])) errors.push(`Visual leads ${id}: ${pain[0]} is not in Pains.`);
            if (!pain && !(/^rejected\b/i.test(decision) && decision.replace(/^rejected\W*/i, '').split(/\s+/).length >= 3)) errors.push(`Visual leads ${id}: decision must be a pain ID, or "Rejected:" with a reason of 3 words or more.`);
          }
        }
      }
    }
    // Mid-load screenshots: a screen the crawl saw still changing cannot carry a claim on its own.
    const cj = find(dir, 'crawl.json');
    if (cj) {
      let unsettled = [];
      try { unsettled = JSON.parse(readFileSync(cj, 'utf8')).unsettled || []; } catch {}
      for (const r of pains.rows) for (const sid of unsettled) {
        if (new RegExp(`\\b${sid}-(desktop|phone)\\.png`).test(cell(pains, r, 'where'))) errors.push(`Pains ${r[0]}: ${sid} was still loading when the crawl saved it. Cite a screenshot taken after the page settled, unless the loading state is the pain.`);
      }
    }
  }

  const lb = sections['Left behind'] || [];
  if (sections['Left behind'] && !table(lb).rows.length && !/nothing/i.test(lb.join('\n'))) errors.push('Left behind: list what you created or changed in the app or folder, or write "Nothing".');

  const nv = (sections['Not verified'] || []).filter(l => /^\s*[-*]\s+\S/.test(l));
  if (!nv.length) errors.push('Not verified: list what you could not check (or write "- Nothing: every check ran").');
  return errors;
}

function selfTest() {
  const good = `# Pain map: Demo
Audited: 2026-10-23 · Screens in scope: 2 · Tasks walked: 3 · Reviewers: 1 · Method: crawl
Scope: booking
Out of scope: admin
Context used: none given

## Screens
| Screen | Job | Primary action | Actions | States seen | Screenshot |
|---|---|---|---|---|---|
| Home | Start | Book | 4 | default | screens/home-1280.png |

## Task walks
| Task | Business goal | Steps | Screens | Dead ends | Where it broke |
|---|---|---|---|---|---|
| Book a visit | Revenue | 9 | 4 | 1 | Step 4 |
| Find prices | Trust | 3 | 1 | 0 | none |
| Cancel | Retention | 5 | 2 | 1 | My bookings |

## Keeps
| ID | Keep | Why it works | Where |
|---|---|---|---|
| K1 | Price table | Clear | Services |
| K2 | Steps | Clear | Book |
| K3 | Hours | Clear | Contact |

## Pains
| ID | What happens | Where (screens + screenshot) | Who | Heuristic or lens | Severity (1-4) | Cause | Source |
|---|---|---|---|---|---|---|---|
| P01 | Rule shown late | Book step 4, screens/book-1280.png | Owners | H5 | 4 | rules or prerequisites | Found |
| P02 | No phone nav | Header, screens/home-390.png | Phone users | H3 | Blocker | layout | Found, by 2 of 2 reviewers |

## Missing
| Page or job | Why it matters | Pain ID (if it blocks a task) |
|---|---|---|
| 404 | Lost users | |

## Fix map
| ID | Fix A | Fix B | Chosen | Principle | Test that proves it | Impact | Confidence | Effort | Score | Now / Next / Later |
|---|---|---|---|---|---|---|---|---|---|---|
| P01 | Warn late | Block early | B | Prevent errors | Earliest slot is valid | 5 | 5 | 2 | 12.5 | Now |
| P02 | Menu | Tab bar | A | Exit always | Menu opens at 390 | 5 | 4 | 2 | 10 | Next |

## Themes
| Theme | Pain IDs |
|---|---|
| Book with confidence | P01 |

## Not verified
- Screen reader behavior

## Left behind
- Nothing: no test data was created
`;
  const bad = good
    .replace('| P02 | No phone nav | Header, screens/home-390.png | Phone users | H3 | Blocker | layout | Found, by 2 of 2 reviewers |', '| P01 | No phone nav | Header | Phone users |  | High | navigation | Guess |')
    .replace('| B | Prevent errors | Earliest slot is valid |', '| B |  |  |')
    .replace('Reviewers: 1', 'Reviewer count: 1')
    .replace('- Screen reader behavior', '')
    .replace('| P01 | Rule shown late |', '| P01 | Rule shown late; no Back button. Users lose work. Cancel wipes it. |')
    .replace('| 404 | Lost users | |', '')
    .replace('- Nothing: no test data was created', '');
  // Folder checks: an undecided visual lead, a lead pointing at a missing pain, a vague rejection,
  // and a pain that cites a screenshot the crawl saved mid-load.
  const d = mkdtempSync(join(tmpdir(), 'gate-'));
  for (const sub of ['screens', 'visual']) mkdirSync(join(d, sub));
  for (const f of ['screens/home-1280.png', 'screens/book-1280.png', 'screens/home-390.png', 'screens/s05-desktop.png']) writeFileSync(join(d, f), '');
  writeFileSync(join(d, 'visual/visual.json'), JSON.stringify({ leads: [{ id: 'V01' }, { id: 'V02' }, { id: 'V03' }, { id: 'V04' }] }));
  writeFileSync(join(d, 'screens/crawl.json'), JSON.stringify({ unsettled: ['s05'] }));
  const ledger = '\n## Visual leads\n| Lead | Check | Decision |\n|---|---|---|\n| V01 | pill | P01 |\n| V02 | gap | Rejected: the gap holds a chart that loads later |\n| V03 | menu | P09 |\n';
  const withDir = check(good.replace('Book step 4, screens/book-1280.png', 'Book step 4, screens/s05-desktop.png') + ledger.replace('| V02 | gap | Rejected: the gap holds a chart that loads later |', '| V02 | gap | Rejected: fine |'), d);
  const dirExpect = ['V04 not decided', 'P09 is not in Pains', 'V02: decision must be', 's05 was still loading'];
  const dirMissed = dirExpect.filter(e => !withDir.some(x => x.includes(e)));
  const dirGood = check(good + ledger.replace('| V03 | menu | P09 |', '| V03 | menu | P02 |\n| V04 | count | Rejected: the badge counts all drafts, as labeled |'), d);
  console.log(dirMissed.length === 0 ? `PASS  folder checks caught all ${dirExpect.length} problems` : `FAIL  folder checks missed: ${dirMissed.join(', ')}`);
  console.log(dirGood.length === 0 ? 'PASS  a complete ledger passes' : `FAIL  complete ledger: ${dirGood.join(' | ')}`);
  const g = check(good), b = check(bad);
  const expect = ['duplicate ID', 'no screenshot path', 'heuristic or lens', 'severity "high"', 'cause "navigation"', 'source must start', 'need a principle', 'need a test', 'Reviewers:', 'Not verified', 'joins problems', 'sentences', 'Missing: no rows', 'Left behind'];
  const missing = expect.filter(e => !b.some(x => x.includes(e)));
  console.log(g.length === 0 ? 'PASS  good pain map passes' : `FAIL  good pain map: ${g.join(' | ')}`);
  console.log(missing.length === 0 ? `PASS  bad pain map caught all ${expect.length} problems` : `FAIL  bad pain map missed: ${missing.join(', ')}`);
  process.exit(g.length === 0 && missing.length === 0 && dirMissed.length === 0 && dirGood.length === 0 ? 0 : 1);
}

// Compare as file URLs so this also runs on Windows (D:\\... vs file:///D:/...).
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const arg = process.argv[2];
  if (arg === '--self-test') selfTest();
  if (!arg || !existsSync(arg)) { console.error('usage: node <skill>/scripts/check-stage.mjs <pain-map.md> | --self-test'); process.exit(2); }
  const errors = check(readFileSync(arg, 'utf8'), dirname(arg));
  if (!errors.length) { console.log('PASS: the pain map meets the gate.'); process.exit(0); }
  console.log(`FAIL: ${errors.length} problem(s). Fix them and run this again.\n`);
  errors.forEach(e => console.log(`- ${e}`));
  process.exit(1);
}
