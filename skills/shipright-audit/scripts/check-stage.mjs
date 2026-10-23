#!/usr/bin/env node
// Check a pain map against the shipright-audit gate. Every failure names the row and the field to fix.
// Usage: node <skill>/scripts/check-stage.mjs <pain-map.md>
//        node <skill>/scripts/check-stage.mjs --self-test
// Exit 0 pass, 1 fail (fix and rerun), 2 usage. No dependencies.
import { readFileSync, existsSync } from 'node:fs';

const SECTIONS = ['Screens', 'Task walks', 'Keeps', 'Pains', 'Missing', 'Fix map', 'Themes', 'Not verified'];
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

export function check(md) {
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
  }

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
`;
  const bad = good
    .replace('| P02 | No phone nav | Header, screens/home-390.png | Phone users | H3 | Blocker | layout | Found, by 2 of 2 reviewers |', '| P01 | No phone nav | Header | Phone users |  | High | navigation | Guess |')
    .replace('| B | Prevent errors | Earliest slot is valid |', '| B |  |  |')
    .replace('Reviewers: 1', 'Reviewer count: 1')
    .replace('- Screen reader behavior', '');
  const g = check(good), b = check(bad);
  const expect = ['duplicate ID', 'no screenshot path', 'heuristic or lens', 'severity "high"', 'cause "navigation"', 'source must start', 'need a principle', 'need a test', 'Reviewers:', 'Not verified'];
  const missing = expect.filter(e => !b.some(x => x.includes(e)));
  console.log(g.length === 0 ? 'PASS  good pain map passes' : `FAIL  good pain map: ${g.join(' | ')}`);
  console.log(missing.length === 0 ? `PASS  bad pain map caught all ${expect.length} problems` : `FAIL  bad pain map missed: ${missing.join(', ')}`);
  process.exit(g.length === 0 && missing.length === 0 ? 0 : 1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = process.argv[2];
  if (arg === '--self-test') selfTest();
  if (!arg || !existsSync(arg)) { console.error('usage: node <skill>/scripts/check-stage.mjs <pain-map.md> | --self-test'); process.exit(2); }
  const errors = check(readFileSync(arg, 'utf8'));
  if (!errors.length) { console.log('PASS: the pain map meets the gate.'); process.exit(0); }
  console.log(`FAIL: ${errors.length} problem(s). Fix them and run this again.\n`);
  errors.forEach(e => console.log(`- ${e}`));
  process.exit(1);
}
