#!/usr/bin/env node
// Check a pain map against the shipright-audit gate. Every failure names the row and the field to fix.
// Usage: node <skill>/scripts/check-stage.mjs <pain-map.md>
// When the audit folder holds visual/visual.json, explore/explore.json or samples/samples.json, every lead must be listed in "## Script leads"
// as a pain or as Rejected with a reason. When screens/crawl.json marks a screen as still loading,
// a pain may not cite that screen's screenshot.
//        node <skill>/scripts/check-stage.mjs --self-test
// Exit 0 pass, 1 fail (fix and rerun), 2 usage. No dependencies.
import { readFileSync, existsSync, readdirSync, statSync, mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, basename, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const SECTIONS = ['First impression', 'Category conventions', 'Screens', 'Task walks', 'Keeps', 'Pains', 'Missing', 'Fix map', 'Themes', 'Not verified', 'Left behind'];
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
  for (const f of ['Scope:', 'Out of scope:', 'Reviewers:', 'Controls opened:', 'Phone coverage:', 'Used as a user:']) if (!header.includes(f)) errors.push(`Header is missing "${f}". State it under the title.`);

  // Taste pass: a score and a reason for each of T1 to T9, and a short verdict above the table.
  if (sections['First impression']) {
    const fi = table(sections['First impression']);
    for (let t = 1; t <= 9; t++) {
      const row = fi.rows.find(r => new RegExp(`^T${t}\\b`).test(r[0]));
      if (!row) { errors.push(`First impression: add a row for T${t} (see references/taste.md).`); continue; }
      if (!/^[1-5]$/.test(cell(fi, row, 'score').trim())) errors.push(`First impression T${t}: score must be 1 to 5.`);
      if (cell(fi, row, 'why').split(/\s+/).filter(Boolean).length < 3) errors.push(`First impression T${t}: say why in a few words.`);
    }
    const verdict = sections['First impression'].filter(l => l.trim() && !l.trim().startsWith('|')).join(' ');
    if (verdict.split(/\s+/).filter(Boolean).length < 12) errors.push('First impression: write a 2 or 3 sentence verdict above the table.');
  }

  const convIds = [];
  // Category conventions: the app compared with the leaders its users already know.
  if (sections['Category conventions']) {
    const cc = table(sections['Category conventions']);
    if (cc.rows.length < 6) errors.push(`Category conventions: ${cc.rows.length} row(s). Compare at least 6 areas with the category leaders (references/conventions.md).`);
    cc.rows.forEach((r, i) => {
      const v = (cell(cc, r, 'verdict') || r[r.length - 1] || '').trim();
      if (!/^matches\b/i.test(v) && !/\bP\d{2,}\b/.test(v) && !/^differs on purpose\W+\w+/i.test(v)) errors.push(`Category conventions row ${i + 1} ("${r[0]}"): verdict must be Matches, a pain ID, or "Differs on purpose:" with the reason.`);
      const pid = v.match(/\bP\d{2,}\b/);
      if (pid) convIds.push(pid[0]);
    });
    if (!/leaders compared:/i.test(sections['Category conventions'].join('\n'))) errors.push('Category conventions: name the leaders on a "Leaders compared:" line.');
  }

  const screens = table(sections['Screens'] || []);
  if (!screens.rows.length) errors.push('Screens: no rows. List every screen in scope.');
  // Phone coverage: every screen in scope was seen at 390 wide, or Not verified names it.
  const PHONE_SHOT = /[\w./-]*(?:phone|390)[\w.-]*\.(?:png|jpe?g|webp)\b/i;
  const notVerifiedText = (sections['Not verified'] || []).join('\n').toLowerCase();
  const phoneShots = [];
  let onPhone = 0;
  for (const r of screens.rows) {
    const shot = r.join(' | ').match(PHONE_SHOT);
    if (shot) { onPhone++; phoneShots.push([r[0], shot[0]]); }
    else if (!r[0] || !notVerifiedText.includes(r[0].toLowerCase())) errors.push(`Screens "${r[0]}": has no 390 screenshot. Add its phone screenshot (for example screens/s03-phone.png), or name the screen in Not verified.`);
  }
  const coverage = header.match(/Phone coverage:\s*(\d+)\s+of\s+(\d+)/i);
  if (header.includes('Phone coverage:')) {
    if (!coverage) errors.push('Header "Phone coverage:" must read "X of Y in-scope screens".');
    else if (screens.rows.length && (Number(coverage[1]) !== onPhone || Number(coverage[2]) !== screens.rows.length)) errors.push(`Header says "Phone coverage: ${coverage[1]} of ${coverage[2]}", but Screens lists ${screens.rows.length} screen(s) and ${onPhone} with a 390 screenshot. Write "Phone coverage: ${onPhone} of ${screens.rows.length} in-scope screens".`);
  }

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

  for (const pid of convIds) if (!ids.has(pid)) errors.push(`Category conventions: ${pid} is not in Pains.`);

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

  // Used as a user: "yes (N actions)" needs every action listed in Left behind. "no" needs the Not verified line.
  const usedLine = header.match(/Used as a user:\s*(yes|no)\b([^\n·|]*)/i);
  let usedYes = false, usedCount = 0;
  if (header.includes('Used as a user:')) {
    if (!usedLine) errors.push('Header "Used as a user:" must read "yes (N actions)" or "no".');
    else if (/yes/i.test(usedLine[1])) {
      usedYes = true;
      const n = usedLine[2].match(/\(\s*(\d+)\s+actions?\s*\)/i);
      if (!n) errors.push('Header "Used as a user: yes" must give the count: "yes (N actions)".');
      else usedCount = Number(n[1]);
      const lbLines = sections['Left behind'] || [];
      const listed = table(lbLines).rows.length + lbLines.filter(l => /^\s*[-*]\s+\S/.test(l) && !/^\s*[-*]\s+nothing\b/i.test(l)).length;
      if (!listed) errors.push('Used as a user: yes, but Left behind lists nothing. List every switch flipped, every test message and every test item, so the owner can delete them.');
    } else if (!/how features behave when used/i.test(notVerifiedText)) errors.push('Used as a user: no. Add this line to Not verified: "How features behave when used (switches, sending, results)".');
  }

  if (dir) {
    const walk = d => readdirSync(d).flatMap(n => { const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : [n]; });
    const onDisk = new Set(walk(dir));
    for (const r of pains.rows) {
      for (const shot of (cell(pains, r, 'where').match(/[\w./-]+\.(?:png|jpe?g|webp)\b/gi) || [])) {
        if (!onDisk.has(basename(shot))) errors.push(`Pains ${r[0]}: screenshot ${shot} does not exist. Cite a file you saved, or move the claim to Not verified.`);
      }
    }
    for (const [screen, shot] of phoneShots) if (!onDisk.has(basename(shot))) errors.push(`Screens "${screen}": 390 screenshot ${shot} does not exist. Cite a file you saved, or name the screen in Not verified.`);
  }

  if (dir) {
    const find = (d, name, depth = 0) => { if (depth > 3 || !existsSync(d)) return null; for (const n of readdirSync(d)) { const p = join(d, n); if (n === name) return p; if (statSync(p).isDirectory()) { const f = find(p, name, depth + 1); if (f) return f; } } return null; };
    // Script leads ledger: no lead a script measured may vanish without a decision.
    let leads = [];
    const findAll = (d, name, depth = 0) => { if (depth > 4 || !existsSync(d)) return []; return readdirSync(d).flatMap(n => { const p = join(d, n); return n === name ? [p] : (statSync(p).isDirectory() ? findAll(p, name, depth + 1) : []); }); };
    for (const name of ['visual.json', 'explore.json', 'samples.json']) {
      const f = find(dir, name);
      if (!f) continue;
      try { const v = JSON.parse(readFileSync(f, 'utf8')); leads.push(...(v.leads || v.findings || []).map(l => l.id)); } catch {}
    }
    // Every task walk has its own walk.json. Result checks after owner-approved actions are leads too.
    let scriptActions = 0;
    for (const f of findAll(dir, 'walk.json')) {
      try { const v = JSON.parse(readFileSync(f, 'utf8')); leads.push(...(v.leads || []).map(l => l.id)); scriptActions += (v.used_actions || []).length; } catch {}
    }
    try { const ex = find(dir, 'explore.json'); if (ex) scriptActions += JSON.parse(readFileSync(ex, 'utf8')).use?.switches_flipped || 0; } catch {}
    if (scriptActions && !usedYes) errors.push(`Header says "Used as a user: no", but the scripts flipped switches or ran owner-approved steps (${scriptActions} action(s)). Write "Used as a user: yes (${scriptActions} actions)" and list them in Left behind.`);
    else if (scriptActions && usedCount < scriptActions) errors.push(`Header says "Used as a user: yes (${usedCount} actions)", but the scripts recorded ${scriptActions}. Count every flipped switch and every owner-approved step.`);
    leads = [...new Set(leads)];
    if (leads.length) {
      const heading = sections['Script leads'] ? 'Script leads' : (sections['Visual leads'] ? 'Visual leads' : null);
      if (!heading) errors.push(`Missing section "## Script leads". The scripts found ${leads.length} lead(s); list each as a pain (P##) or Rejected with the reason.`);
      else {
        const ledger = table(sections[heading]);
        const rows = new Map(ledger.rows.map(r => [r[0], r]));
        const missingLeads = leads.filter(id => !rows.has(id));
        if (missingLeads.length) errors.push(`Script leads: ${missingLeads.join(', ')} not decided. Add a row for each: the pain ID it became, or "Rejected: <what you saw>".`);
        for (const [id, r] of rows) {
          const decision = cell(ledger, r, 'decision') || r[r.length - 1] || '';
          const pain = decision.match(/\bP\d{2,}\b/);
          if (pain && !ids.has(pain[0])) errors.push(`Script leads ${id}: ${pain[0]} is not in Pains.`);
          if (!pain && !(/^rejected\b/i.test(decision) && decision.replace(/^rejected\W*/i, '').split(/\s+/).length >= 3)) errors.push(`Script leads ${id}: decision must be a pain ID, or "Rejected:" with a reason of 3 words or more.`);
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
Audited: 2026-10-23 · Screens in scope: 2 · Tasks walked: 3 · Controls opened: 12 of 14 · Reviewers: 1 · Method: crawl
Phone coverage: 1 of 1 in-scope screens · Used as a user: no
Scope: booking
Out of scope: admin
Context used: none given

## First impression
It reads as a calm booking tool, but four equal stat cards compete with the booking button. One clear focal point would help most.
| Area | Score (1-5) | Why |
|---|---|---|
| T1 Area | 3 | fine but plain here |
| T2 Area | 3 | fine but plain here |
| T3 Area | 3 | fine but plain here |
| T4 Area | 3 | fine but plain here |
| T5 Area | 3 | fine but plain here |
| T6 Area | 3 | fine but plain here |
| T7 Area | 3 | fine but plain here |
| T8 Area | 3 | fine but plain here |
| T9 Area | 3 | fine but plain here |

## Category conventions
Leaders compared: Calendly, Booksy, Square Appointments (what local salons use)
| Area | What the leaders do | This app | Verdict |
|---|---|---|---|
| Sign in | Google sign-in | Email only | P02 |
| First step | Pick a time first | Pick a time first | Matches |
| Price | Shown before booking | Shown before booking | Matches |
| Cancel | Link in email | Link in email | Matches |
| Reminders | Text and email | Email | Differs on purpose: owner's clients prefer email |
| Search | Search by service | Search by service | Matches |

## Screens
| Screen | Job | Primary action | Actions | States seen | Screenshot |
|---|---|---|---|---|---|
| Home | Start | Book | 4 | default | screens/home-1280.png, screens/home-390.png |

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
- How features behave when used (switches, sending, results)

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
    .replace('- Nothing: no test data was created', '')
    .replace('| T9 Area | 3 | fine but plain here |', '')
    .replace('| T8 Area | 3 | fine but plain here |', '| T8 Area | 7 | x |')
    .replace('Controls opened: 12 of 14 · ', '')
    .replace('Phone coverage: 1 of 1 in-scope screens · Used as a user: no\n', '')
    .replace('screens/home-1280.png, screens/home-390.png |', 'screens/home-1280.png |')
    .replace('| Reminders | Text and email | Email | Differs on purpose: owner\'s clients prefer email |', '| Reminders | Text and email | Email | Different |')
    .replace('| Search | Search by service | Search by service | Matches |', '')
    .replace('It reads as a calm booking tool, but four equal stat cards compete with the booking button. One clear focal point would help most.', '');
  // Folder checks: an undecided visual lead, a lead pointing at a missing pain, a vague rejection,
  // and a pain that cites a screenshot the crawl saved mid-load.
  const d = mkdtempSync(join(tmpdir(), 'gate-'));
  for (const sub of ['screens', 'visual', 'samples']) mkdirSync(join(d, sub));
  for (const f of ['screens/home-1280.png', 'screens/book-1280.png', 'screens/home-390.png', 'screens/s05-desktop.png']) writeFileSync(join(d, f), '');
  writeFileSync(join(d, 'visual/visual.json'), JSON.stringify({ leads: [{ id: 'V01' }, { id: 'V02' }, { id: 'V03' }, { id: 'V04' }] }));
  writeFileSync(join(d, 'samples/samples.json'), JSON.stringify({ leads: [{ id: 'R01' }] }));
  writeFileSync(join(d, 'screens/crawl.json'), JSON.stringify({ unsettled: ['s05'] }));
  const ledger = '\n## Script leads\n| Lead | Check | Decision |\n|---|---|---|\n| V01 | pill | P01 |\n| V02 | gap | Rejected: the gap holds a chart that loads later |\n| V03 | menu | P09 |\n';
  const withDir = check(good.replace('Book step 4, screens/book-1280.png', 'Book step 4, screens/s05-desktop.png') + ledger.replace('| V02 | gap | Rejected: the gap holds a chart that loads later |', '| V02 | gap | Rejected: fine |'), d);
  const dirExpect = ['V04, R01 not decided', 'P09 is not in Pains', 'V02: decision must be', 's05 was still loading'];
  const dirMissed = dirExpect.filter(e => !withDir.some(x => x.includes(e)));
  const dirGood = check(good + ledger.replace('| V03 | menu | P09 |', '| V03 | menu | P02 |\n| V04 | count | Rejected: the badge counts all drafts, as labeled |\n| R01 | media | P01 |'), d);
  console.log(dirMissed.length === 0 ? `PASS  folder checks caught all ${dirExpect.length} problems` : `FAIL  folder checks missed: ${dirMissed.join(', ')}`);
  console.log(dirGood.length === 0 ? 'PASS  a complete ledger passes' : `FAIL  complete ledger: ${dirGood.join(' | ')}`);
  // Phone coverage: a wrong count fails, a missing 390 file fails, and a screen named in Not verified passes.
  const twoScreens = good.replace('| Home | Start | Book | 4 | default | screens/home-1280.png, screens/home-390.png |', '| Home | Start | Book | 4 | default | screens/home-1280.png, screens/home-390.png |\n| Admin | Manage | Add | 9 | default | screens/admin-1280.png |');
  const cov = [
    ['a screen with no 390 screenshot fails', check(twoScreens.replace('Phone coverage: 1 of 1', 'Phone coverage: 1 of 2')).some(e => e.includes('"Admin": has no 390 screenshot'))],
    ['a screen named in Not verified passes', check(twoScreens.replace('Phone coverage: 1 of 1', 'Phone coverage: 1 of 2').replace('- Screen reader behavior', '- Screen reader behavior\n- Admin at 390 wide: the page needs a role this account does not have')).length === 0],
    ['a wrong coverage count fails', check(good.replace('Phone coverage: 1 of 1', 'Phone coverage: 6 of 6')).some(e => e.includes('Write "Phone coverage: 1 of 1'))],
    ['a 390 screenshot that is not on disk fails', check(good.replace('screens/home-390.png |', 'screens/gone-390.png |'), d).some(e => e.includes('gone-390.png does not exist'))],
  ];
  // Used as a user: yes needs a count and a Left behind list; no needs the Not verified line; and the
  // header may not say no when the scripts recorded owner-approved actions.
  const yes = good.replace('Used as a user: no', 'Used as a user: yes (3 actions)');
  const listed = yes.replace('- Nothing: no test data was created', '| Where | What I created or changed | Removed? |\n|---|---|---|\n| The app | Test message "ShipRight test" in a new chat | no, delete it from the chat list |\n| The app | Switches Web search and Images flipped and turned back | yes |');
  const d3 = mkdtempSync(join(tmpdir(), 'gate-use-'));
  for (const sub of ['screens', 'walks', 'walks/send']) mkdirSync(join(d3, sub));
  for (const f of ['screens/home-1280.png', 'screens/book-1280.png', 'screens/home-390.png']) writeFileSync(join(d3, f), '');
  writeFileSync(join(d3, 'walks/send/walk.json'), JSON.stringify({ used_actions: [{ step: 1 }, { step: 2 }], leads: [{ id: 'W-send-1' }] }));
  cov.push(
    ['used: yes with nothing in Left behind fails', check(yes).some(e => e.includes('Left behind lists nothing'))],
    ['used: yes with a count and a list passes', check(listed).length === 0],
    ['used: yes without a count fails', check(listed.replace('yes (3 actions)', 'yes')).some(e => e.includes('must give the count'))],
    ['used: no without the Not verified line fails', check(good.replace('- How features behave when used (switches, sending, results)\n', '')).some(e => e.includes('How features behave when used'))],
    ['used: no fails when a walk recorded owner-approved steps', check(good, d3).some(e => e.includes('the scripts flipped switches or ran owner-approved steps (2 action(s))'))],
    ['a result lead from a walk must be decided', check(listed + '\n## Script leads\n| Lead | Check | Decision |\n|---|---|---|\n', d3).some(e => e.includes('W-send-1 not decided'))],
    ['a decided walk lead passes', check(listed + '\n## Script leads\n| Lead | Check | Decision |\n|---|---|---|\n| W-send-1 | media | P01 |\n', d3).length === 0],
  );
  const covFailed = cov.filter(([, pass]) => !pass).map(([name]) => name);
  console.log(covFailed.length === 0 ? `PASS  phone coverage and used-as-a-user: ${cov.length} cases` : `FAIL  phone coverage and used-as-a-user: ${covFailed.join(', ')}`);
  const g = check(good), b = check(bad);
  const expect = ['Controls opened:', 'Phone coverage:', 'Used as a user:', 'has no 390 screenshot', 'verdict must be Matches', 'Compare at least 6', 'row for T9', 'T8: score must be', 'T8: say why', 'sentence verdict', 'duplicate ID', 'no screenshot path', 'heuristic or lens', 'severity "high"', 'cause "navigation"', 'source must start', 'need a principle', 'need a test', 'Reviewers:', 'Not verified', 'joins problems', 'sentences', 'Missing: no rows', 'Left behind'];
  const missing = expect.filter(e => !b.some(x => x.includes(e)));
  console.log(g.length === 0 ? 'PASS  good pain map passes' : `FAIL  good pain map: ${g.join(' | ')}`);
  console.log(missing.length === 0 ? `PASS  bad pain map caught all ${expect.length} problems` : `FAIL  bad pain map missed: ${missing.join(', ')}`);
  process.exit(g.length === 0 && missing.length === 0 && dirMissed.length === 0 && dirGood.length === 0 && covFailed.length === 0 ? 0 : 1);
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
