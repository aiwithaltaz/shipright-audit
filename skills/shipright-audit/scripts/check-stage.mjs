#!/usr/bin/env node
// Check a pain map against the shipright-audit gate. Every failure names the row and the field to fix.
// Usage: node <skill>/scripts/check-stage.mjs <pain-map.md>
// When the audit folder holds owner-rules.md, the pain map needs "## Owner decisions respected", and every
// owner quote in it (and in an "Owner rule:" lens) must stand word for word in owner-rules.md.
// "## Item lifecycles" (one row per item and state: ID, Item, State, Actions shown, Verdict) is needed when
// visual/visual.json saw an item type in 3 or more states ("item_states"), with a row for every state seen.
// A Keep about the actions on an item must point to lifecycle rows (LC01, LC02) that passed all 4 questions.
// When the audit folder holds visual/visual.json, explore/explore.json, samples/samples.json,
// consistency/consistency.json or a walk.json with result leads, every lead must be listed in "## Script leads"
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
  for (const f of ['Scope:', 'Out of scope:', 'Reviewers:', 'Controls opened:', 'Phone coverage:', 'Used as a user:', 'Competitor research:']) if (!header.includes(f)) errors.push(`Header is missing "${f}". State it under the title.`);

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
  // Competitor research: live (a web tool was used today) or from knowledge (no web tool exists).
  const research = header.match(/Competitor research:\s*([^\n·|]*)/i);
  const live = !!research && /\blive\b/i.test(research[1]);
  if (research && !live && !(/from knowledge/i.test(research[1]) && /no web/i.test(research[1]))) errors.push('Header "Competitor research:" must read "live, checked <date>" or, only when no web search or fetch tool exists, "from knowledge, no web tool".');
  const LINK = /https?:\/\/[^\s|)\]]+/i, DATE = /\b\d{4}-\d{2}-\d{2}\b/;
  // Category conventions: the app compared with the leaders its users already know.
  if (sections['Category conventions']) {
    const cc = table(sections['Category conventions']);
    if (cc.rows.length < 10) errors.push(`Category conventions: ${cc.rows.length} row(s). Compare at least 10 areas with the category leaders (references/conventions.md).`);
    // How it works, not only where it sits: at least 3 rows compare behavior (references/conventions.md, C3).
    if (col(cc, 'kind') < 0) errors.push('Category conventions: add a "Kind" column. Each row is "Where it sits" or "How it works".');
    else {
      const how = cc.rows.filter(r => /^how\b/i.test(cell(cc, r, 'kind'))).length;
      if (how < 3) errors.push(`Category conventions: ${how} row(s) about how something works. Add at least 3 "How it works" rows: set once or per item, how it is called up, what happens before anything is sent, how users make their own, what it looks like on phone (references/conventions.md, C3).`);
      cc.rows.forEach((r, i) => { if (!/^(how|where)\b/i.test(cell(cc, r, 'kind'))) errors.push(`Category conventions row ${i + 1} ("${r[0]}"): Kind must be "Where it sits" or "How it works".`); });
    }
    // Sources: with a web tool, at least half the rows cite the page that was opened and the date it was checked.
    if (col(cc, 'source') < 0) errors.push('Category conventions: add a "Source" column: the URL you opened and the date you checked it, or "from knowledge, not checked today" when no web tool exists.');
    else {
      const linked = cc.rows.filter(r => LINK.test(cell(cc, r, 'source')) && DATE.test(cell(cc, r, 'source'))).length;
      if (live && linked * 2 < cc.rows.length) errors.push(`Category conventions: ${linked} of ${cc.rows.length} row(s) have a linked Source with the date checked. With a web tool, at least half must (a URL and a date like 2026-11-12).`);
      cc.rows.forEach((r, i) => { if (!cell(cc, r, 'source')) errors.push(`Category conventions row ${i + 1} ("${r[0]}"): Source is empty. Give the URL and the date checked, or "from knowledge, not checked today".`); });
    }
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

  // Item lifecycles (Step 2b): each item type's states, the actions offered in each, and a verdict
  // against the 4 questions: one clear next step, a way back into unfinished work, final actions only
  // when ready, and a failed state that says why and how to fix it.
  const life = sections['Item lifecycles'] ? table(sections['Item lifecycles']) : null;
  const lifeRows = new Map();
  if (life) {
    if (!life.rows.length && !/\bnone\b/i.test(sections['Item lifecycles'].join('\n'))) errors.push('Item lifecycles: add one row per item and state, or write "None: no item type shows 3 or more states".');
    life.rows.forEach((r, i) => {
      const id = r[0] || '';
      if (!/^LC\d{2,}$/.test(id)) { errors.push(`Item lifecycles row ${i + 1}: the ID must look like LC01.`); return; }
      if (lifeRows.has(id)) errors.push(`Item lifecycles ${id}: duplicate ID.`);
      const verdict = (cell(life, r, 'verdict') || r[r.length - 1] || '').trim();
      const pid = verdict.match(/\bP\d{2,}\b/);
      const pass = /^pass\b/i.test(verdict) && !pid;
      if (!cell(life, r, 'item') || !cell(life, r, 'state')) errors.push(`Item lifecycles ${id}: name the item and the state.`);
      if (!cell(life, r, 'actions')) errors.push(`Item lifecycles ${id}: Actions shown is empty. List the buttons the item offers in this state, or write "none".`);
      if (!pass && !pid && !/^not verified\W+\w+/i.test(verdict)) errors.push(`Item lifecycles ${id}: the verdict must be Pass (all 4 questions), the pain ID with the question it fails (P07: Q3), or "Not verified:" with the reason.`);
      if (pid && !ids.has(pid[0])) errors.push(`Item lifecycles ${id}: ${pid[0]} is not in Pains.`);
      lifeRows.set(id, { state: cell(life, r, 'state'), pass });
    });
  }
  // A Keep about the actions on an item ("the card buttons fit each state") is only true once the
  // item's life is mapped: it must point to lifecycle rows that passed all 4 questions.
  const ABOUT_ACTIONS = /\b(actions?|buttons?|ctas?|next steps?)\b/i, ABOUT_ITEMS = /\b(cards?|items?|rows?|states?|status(es)?|stages?|lifecycles?|each)\b/i;
  for (const r of keeps.rows) {
    const said = `${cell(keeps, r, 'keep')} ${cell(keeps, r, 'why')}`;
    if (!ABOUT_ACTIONS.test(said) || !ABOUT_ITEMS.test(said)) continue;
    const cited = [...new Set((r.join(' ').match(/\bLC\d{2,}\b/g) || []))];
    if (!cited.length) errors.push(`Keeps ${r[0]}: this Keep is about the actions on an item. Map the item's life first (Step 2b), then point to the Item lifecycles row(s) that passed all 4 questions, for example "LC02, LC03". No lifecycle row, no Keep.`);
    for (const id of cited) {
      if (!lifeRows.has(id)) errors.push(`Keeps ${r[0]}: ${id} is not a row in Item lifecycles.`);
      else if (!lifeRows.get(id).pass) errors.push(`Keeps ${r[0]}: ${id} did not pass all 4 lifecycle questions, so it cannot back a Keep.`);
    }
  }

  // The page inventory is the part of Missing above its first "###" heading.
  const missingAll = sections['Missing'] || [], firstSub = missingAll.findIndex(l => /^###\s+/.test(l));
  const missingMain = firstSub < 0 ? missingAll : missingAll.slice(0, firstSub);
  const missingRows = table(missingMain).rows;
  if (sections['Missing'] && !missingRows.length && !/none found/i.test(missingMain.join('\n'))) errors.push('Missing: no rows. Check the page inventory and list what is missing, or write "None found" with what you checked.');
  // Missing also holds what the leaders have and this app does not, with the leaders named and linked.
  if (sections['Missing']) {
    const lines = sections['Missing'];
    const at = lines.findIndex(l => /^###\s+/.test(l) && /what leaders have/i.test(l));
    if (at < 0) errors.push('Missing: add the part "### What leaders have that this app doesn\'t", with the leaders named and linked, or "None found".');
    else {
      const rest = lines.slice(at + 1), end = rest.findIndex(l => /^###\s+/.test(l));
      const part = end < 0 ? rest : rest.slice(0, end);
      const rows = table(part).rows;
      if (!rows.length && !/none found/i.test(part.join('\n'))) errors.push('Missing, "What leaders have that this app doesn\'t": list each feature with the leaders that have it, or write "None found".');
      if (live) rows.forEach((r, i) => { if (!LINK.test(r.join(' '))) errors.push(`Missing, "What leaders have that this app doesn't" row ${i + 1} ("${r[0]}"): name the leaders and link the page that shows it.`); });
    }
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

  // Used as a user: "yes (N actions)" needs every action listed in Left behind. "no" needs the Not verified line.
  // "yes with limits" also quotes the owner's words. "not answered" is only for a session nobody is
  // watching (scheduled or headless): in a live session the audit stops and waits for the answer.
  const usedLine = header.match(/Used as a user:\s*(yes with limits|yes|not answered|no)\b([^\n·|]*)/i);
  let usedYes = false, usedCount = 0, usedLimits = false, usedQuote = '';
  if (header.includes('Used as a user:')) {
    if (!usedLine) errors.push('Header "Used as a user:" must read "yes (N actions)", "yes with limits: "<owner\'s words>" (N actions)", "no" or "not answered (unattended)".');
    else if (/^not answered/i.test(usedLine[1])) {
      if (!/\bunattended\b/i.test(usedLine[2])) errors.push('Header says "Used as a user: not answered". In a live session, stop and wait for the owner\'s answer: silence is not a no. Only a session nobody is watching (scheduled or headless) may go on read-only, and then the header reads "not answered (unattended)".');
      if (!/how features behave when used/i.test(notVerifiedText)) errors.push('Used as a user: not answered. Add this line to Not verified: "How features behave when used (switches, sending, results)".');
    } else if (/yes/i.test(usedLine[1])) {
      usedYes = true;
      usedLimits = /limits/i.test(usedLine[1]);
      const n = usedLine[2].match(/\(\s*(\d+)\s+actions?\s*\)/i);
      if (!n) errors.push(`Header "Used as a user: ${usedLine[1].toLowerCase()}" must give the count: "${usedLimits ? 'yes with limits: "<owner\'s words>" (N actions)' : 'yes (N actions)'}".`);
      else usedCount = Number(n[1]);
      if (usedLimits) {
        usedQuote = (usedLine[2].match(/["\u201c]([^"\u201d]{3,})["\u201d]/) || [])[1] || '';
        if (!usedQuote) errors.push('Header "Used as a user: yes with limits" must quote the owner\'s words: yes with limits: "yes, but don\'t generate a video" (N actions).');
      }
      const lbLines = sections['Left behind'] || [];
      const listed = table(lbLines).rows.length + lbLines.filter(l => /^\s*[-*]\s+\S/.test(l) && !/^\s*[-*]\s+nothing\b/i.test(l)).length;
      if (!listed && !(usedLimits && usedCount === 0)) errors.push('Used as a user: yes, but Left behind lists nothing. List every switch flipped, every test message and every test item, so the owner can delete them.');
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
    for (const name of ['visual.json', 'explore.json', 'samples.json', 'consistency.json']) {
      const f = find(dir, name);
      if (!f) continue;
      try { const v = JSON.parse(readFileSync(f, 'utf8')); leads.push(...(v.leads || v.findings || []).map(l => l.id)); } catch {}
    }
    // Every task walk has its own walk.json. Result checks after owner-approved actions are leads too.
    let scriptActions = 0;
    for (const f of findAll(dir, 'walk.json')) {
      try { const v = JSON.parse(readFileSync(f, 'utf8')); leads.push(...(v.leads || []).map(l => l.id)); scriptActions += (v.used_actions || []).length; } catch {}
    }
    try { const ex = find(dir, 'explore.json'); if (ex) { const use = JSON.parse(readFileSync(ex, 'utf8')).use || {}; scriptActions += (use.switches_flipped || 0) + (use.option_picks || 0); } } catch {}
    // The owner's limits: when use-limits.json holds anything back, the header says so in the owner's words.
    const limitsFile = find(dir, 'use-limits.json');
    if (limitsFile) {
      let lim = null;
      try { lim = JSON.parse(readFileSync(limitsFile, 'utf8')); } catch { errors.push('use-limits.json is not valid JSON. It holds the owner\'s limits: fix it.'); }
      const loose = t => String(t || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
      if (lim && (lim.held || []).length && usedYes && !usedLimits) errors.push(`use-limits.json holds back ${lim.held.length} action(s) the owner ruled out, but the header says "Used as a user: yes". Write: yes with limits: "<owner's words>" (N actions).`);
      if (lim && usedLimits && usedQuote && lim.owner_words && !loose(lim.owner_words).includes(loose(usedQuote)) && !loose(usedQuote).includes(loose(lim.owner_words))) errors.push('Header "Used as a user: yes with limits" must quote the owner\'s words exactly as they stand in use-limits.json ("owner_words").');
    }
    // A dialog a script closed on load (a "What's new" notice) changed something for the owner: it may
    // not show again. Left behind must name it, with how it was closed.
    const closed = [];
    for (const name of ['crawl.json', 'explore.json', 'visual.json', 'samples.json', 'consistency.json']) {
      for (const f of findAll(dir, name)) { try { for (const d of (JSON.parse(readFileSync(f, 'utf8')).dialogs_closed || [])) if (d.how && !closed.some(c => c.dialog === d.dialog)) closed.push(d); } catch {} }
    }
    if (closed.length && !/dialog/i.test((sections['Left behind'] || []).join('\n'))) errors.push(`Left behind: the scripts closed ${closed.length === 1 ? 'a dialog' : `${closed.length} dialogs`} that covered a page (${closed.map(c => `"${c.dialog}" with ${c.how}`).join(', ')}). Name each one in Left behind, with how it was closed.`);
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
    // Item lifecycles: an item type the scripts saw in 3 or more states needs a row for every state.
    let staged = [];
    try { const vj = find(dir, 'visual.json'); if (vj) staged = (JSON.parse(readFileSync(vj, 'utf8')).item_states || []).filter(x => (x.states || []).length >= 3); } catch {}
    for (const it of staged) {
      if (!life || !life.rows.length) { errors.push(`${life ? 'Item lifecycles has no rows' : 'Missing section "## Item lifecycles"'}. The scripts saw "${it.item}" in ${it.states.length} states (${it.states.join(', ')}). Map its life before you judge its buttons (Step 2b): one row per state, with the actions shown and a verdict.`); break; }
      const have = life.rows.map(r => cell(life, r, 'state').toLowerCase());
      const missing = it.states.filter(st => !have.some(h => h.includes(st.toLowerCase())));
      if (missing.length) errors.push(`Item lifecycles: the scripts saw "${it.item}" in ${it.states.length} states (${it.states.join(', ')}). Add a row for: ${missing.join(', ')}.`);
    }
    // The owner's own rules. When owner-rules.md exists: decisions the app follows on purpose are listed
    // (they are not pains), and every quote is real.
    const rulesFile = find(dir, 'owner-rules.md');
    if (rulesFile) {
      const norm = t => String(t).toLowerCase().replace(/["'\u201c\u201d\u2018\u2019`*_]/g, '').replace(/\s+/g, ' ').trim();
      const rulesRaw = readFileSync(rulesFile, 'utf8');
      const rulesText = norm(rulesRaw);
      const quoted = t => { const n = norm(t).replace(/[.:;,\s]+$/, ''); return n.length >= 12 && rulesText.includes(n); };
      const inQuotes = t => (String(t).match(/["\u201c]([^"\u201d]{12,})["\u201d]?/) || [])[1] || t;
      if (!sections['Owner decisions respected']) errors.push('Missing section "## Owner decisions respected". The folder has owner-rules.md: list each thing that differs from the leaders or from good practice but matches a decision the owner wrote down, with the quote. Or write "None" and why.');
      else {
        const od = table(sections['Owner decisions respected']);
        if (!od.rows.length && !/\bnone\b/i.test(sections['Owner decisions respected'].join('\n'))) errors.push('Owner decisions respected: list each owner decision the app follows, with the quote, or write "None" and why.');
        od.rows.forEach((r, i) => { const words = cell(od, r, 'owner') || r[1] || ''; if (!quoted(inQuotes(words))) errors.push(`Owner decisions respected row ${i + 1} ("${r[0]}"): quote the owner's words exactly as they stand in owner-rules.md.`); });
      }
      for (const r of pains.rows) {
        const lens = cell(pains, r, 'heuristic').match(/owner rule:?\s*(.*)$/i);
        if (lens && !quoted(inQuotes(lens[1]))) errors.push(`Pains ${r[0]}: an "Owner rule:" lens must quote the rule exactly as it stands in owner-rules.md.`);
      }
      // Files skipped for fairness (they may list the owner's current complaints) are named, not hidden.
      for (const m of rulesRaw.matchAll(/^- (.+?): its name says it may list/gm)) if (!md.includes(basename(m[1]))) errors.push(`owner-rules.md skipped ${m[1]} without opening it. Say so in the "Context used" line: "skipped ${basename(m[1])} (may list current complaints)".`);
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

// A complete pain map that passes the gate. The self-test and the repo tests start from it.
export function samplePainMap() {
  return `# Pain map: Demo
Audited: 2026-10-23 · Screens in scope: 2 · Tasks walked: 3 · Controls opened: 12 of 14 · Reviewers: 1 · Method: crawl
Phone coverage: 1 of 1 in-scope screens · Used as a user: no · Competitor research: live, checked 2026-10-23
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
| Area | Kind | What the leaders do | This app | Source | Verdict |
|---|---|---|---|---|---|
| Sign in | Where it sits | Google sign-in on the first screen | Email only | https://example.com/leader-a/help/sign-in (checked 2026-10-23) | P02 |
| First step | Where it sits | Pick a time first | Pick a time first | https://example.com/leader-a/help/book (checked 2026-10-23) | Matches |
| Price | Where it sits | Shown before booking | Shown before booking | https://example.com/leader-b/pricing (checked 2026-10-23) | Matches |
| Cancel | Where it sits | Link in email | Link in email | from knowledge, not checked today | Matches |
| Reminders | How it works | Set once per account: text and email | Set once per account: email | https://example.com/leader-b/help/reminders (checked 2026-10-23) | Differs on purpose: owner's clients prefer email |
| Search | Where it sits | Search by service | Search by service | from knowledge, not checked today | Matches |
| Reschedule | How it works | A draft of the new time, then Confirm | Changes at once, no confirm | https://example.com/leader-c/help/reschedule (checked 2026-10-23) | P01 |
| Booking page | How it works | Owners start from a template | Owners start from a template | https://example.com/leader-a/help/templates (checked 2026-10-23) | Matches |
| Pick a service | How it works | A button on every page | A button on every page | from knowledge, not checked today | Matches |
| Booking on phone | How it works | One step per screen | One step per screen | from knowledge, not checked today | Matches |

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

### What leaders have that this app doesn't
| Feature | Leaders that have it | Pain ID |
|---|---|---|
| Add to calendar after booking | Leader A (https://example.com/leader-a/help/calendar), Leader B (https://example.com/leader-b/help/calendar) | |

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
}

function selfTest() {
  const good = samplePainMap();
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
    .replace('Phone coverage: 1 of 1 in-scope screens · Used as a user: no · Competitor research: live, checked 2026-10-23\n', '')
    .replace('screens/home-1280.png, screens/home-390.png |', 'screens/home-1280.png |')
    .replace('Differs on purpose: owner\'s clients prefer email |', 'Different |')
    .replace('| Search | Where it sits | Search by service | Search by service | from knowledge, not checked today | Matches |', '')
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
    ['option picks count as actions (new in 0.9)', (() => { const d = mkdtempSync(join(tmpdir(), 'gate-opt-')); for (const sub of ['screens', 'explore']) mkdirSync(join(d, sub)); for (const f of ['screens/home-1280.png', 'screens/book-1280.png', 'screens/home-390.png']) writeFileSync(join(d, f), ''); writeFileSync(join(d, 'explore/explore.json'), JSON.stringify({ leads: [], use: { switches_flipped: 2, option_picks: 3 } })); return check(listed.replace('yes (3 actions)', 'yes (5 actions)'), d).length === 0 && check(listed.replace('yes (3 actions)', 'yes (4 actions)'), d).some(e => e.includes('the scripts recorded 5')); })()],
    ['a dialog a script closed must be named in Left behind (new in 0.9)', (() => { const d = mkdtempSync(join(tmpdir(), 'gate-dlg-')); for (const sub of ['screens', 'visual']) mkdirSync(join(d, sub)); for (const f of ['screens/home-1280.png', 'screens/book-1280.png', 'screens/home-390.png']) writeFileSync(join(d, f), ''); writeFileSync(join(d, 'visual/visual.json'), JSON.stringify({ leads: [], dialogs_closed: [{ page: '/', dialog: "What's new", how: 'Escape' }] })); return check(good, d).some(e => e.includes('closed a dialog that covered a page ("What\'s new" with Escape)')) && check(good.replace('- Nothing: no test data was created', '- Closed the "What\'s new" dialog with Escape. Nothing else: no test data was created'), d).length === 0; })()],
  );
  // The use-it question is waited for: "not answered" passes only when the session was unattended. A yes
  // with limits quotes the owner, and the header may not hide limits that use-limits.json holds.
  const limited = listed.replace('yes (3 actions)', 'yes with limits: "yes, but leave the image tools off" (3 actions)');
  const d5 = mkdtempSync(join(tmpdir(), 'gate-limits-'));
  mkdirSync(join(d5, 'screens'));
  for (const f of ['screens/home-1280.png', 'screens/book-1280.png', 'screens/home-390.png']) writeFileSync(join(d5, f), '');
  writeFileSync(join(d5, 'use-limits.json'), JSON.stringify({ answer: 'yes with limits', owner_words: 'Yes, but leave the image tools off.', held: [{ action: 'turn on the image tools', match: ['images'] }] }));
  cov.push(
    ['used: "not answered" without "unattended" fails', check(good.replace('Used as a user: no', 'Used as a user: not answered')).some(e => e.includes('stop and wait for the owner'))],
    ['used: "not answered (unattended)" passes', check(good.replace('Used as a user: no', 'Used as a user: not answered (unattended)')).length === 0],
    ['used: "not answered (unattended)" still needs the Not verified line', check(good.replace('Used as a user: no', 'Used as a user: not answered (unattended)').replace('- How features behave when used (switches, sending, results)\n', '')).some(e => e.includes('How features behave when used'))],
    ['used: yes with limits, quoted and counted, passes', check(limited, d5).length === 0],
    ['used: yes with limits without the owner\'s words fails', check(listed.replace('yes (3 actions)', 'yes with limits (3 actions)')).some(e => e.includes('must quote the owner'))],
    ['used: a plain yes fails when use-limits.json holds actions back', check(listed, d5).some(e => e.includes('holds back 1 action(s)'))],
    ['used: yes with limits must quote the words in use-limits.json', check(limited.replace('leave the image tools off', 'do whatever you like'), d5).some(e => e.includes('exactly as they stand in use-limits.json'))],
  );
  // Item lifecycles: an item seen in 3 or more states needs the table, with a row per state. A Keep about
  // the actions on an item must point to a lifecycle row that passed all 4 questions.
  const d6 = mkdtempSync(join(tmpdir(), 'gate-life-'));
  for (const sub of ['screens', 'visual']) mkdirSync(join(d6, sub));
  for (const f of ['screens/home-1280.png', 'screens/book-1280.png', 'screens/home-390.png']) writeFileSync(join(d6, f), '');
  writeFileSync(join(d6, 'visual/visual.json'), JSON.stringify({ leads: [], item_states: [{ item: 'Projects', states: ['Editing', 'Ready', 'Rendering'], pages: ['/projects'] }] }));
  const lifeTable = '\n## Item lifecycles\n| ID | Item | State | Actions shown | Verdict |\n|---|---|---|---|---|\n| LC01 | Project | Editing | Continue editing, Delete | Pass |\n| LC02 | Project | Rendering | Cancel render | Pass |\n| LC03 | Project | Ready | Publish, Schedule, Edit | P01: Q1 |\n';
  const cardKeep = good.replace('| K2 | Steps | Clear | Book |', '| K2 | Card buttons fit each state | One clear action per card | Projects |');
  cov.push(
    ['lifecycle: an item in 3 or more states with no Item lifecycles table fails', check(good, d6).some(e => e.includes('Missing section "## Item lifecycles"') && e.includes('Editing, Ready, Rendering'))],
    ['lifecycle: a row for every state passes', check(good + lifeTable, d6).length === 0],
    ['lifecycle: a state with no row fails', check(good + lifeTable.replace(/\| LC02 .*\n/, ''), d6).some(e => e.includes('Add a row for: Rendering'))],
    ['lifecycle: a vague verdict fails', check(good + lifeTable.replace('| Cancel render | Pass |', '| Cancel render | Looks fine |'), d6).some(e => e.includes('LC02: the verdict must be Pass'))],
    ['lifecycle: a Keep about card actions that cites no lifecycle row fails', check(cardKeep + lifeTable, d6).some(e => e.includes('Keeps K2: this Keep is about the actions on an item'))],
    ['lifecycle: a Keep that cites rows that passed all 4 questions passes', check(cardKeep.replace('| One clear action per card |', '| One clear action per card (LC01, LC02) |') + lifeTable, d6).length === 0],
    ['lifecycle: a Keep that cites a row that failed a question fails', check(cardKeep.replace('| One clear action per card |', '| One clear action per card (LC03) |') + lifeTable, d6).some(e => e.includes('LC03 did not pass all 4 lifecycle questions'))],
    ['lifecycle: a Keep that cites a row that does not exist fails', check(cardKeep.replace('| One clear action per card |', '| One clear action per card (LC09) |') + lifeTable, d6).some(e => e.includes('LC09 is not a row in Item lifecycles'))],
    ['lifecycle: no staged items and no item Keep, no table needed', check(good, d).filter(e => /lifecycle/i.test(e)).length === 0],
  );
  // Competitor research: fewer than 10 rows, no Source column and no how-it-works rows each fail. A table
  // that has them passes (the good pain map above). Without a web tool, "from knowledge" must say so.
  const conv = good.split('## Category conventions')[1].split('## Screens')[0];
  const swapConv = f => good.replace(conv, f(conv));
  const dropCol = (t, n) => t.split('\n').map(l => { if (!l.startsWith('|')) return l; const c = l.split('|'); c.splice(n + 1, 1); return c.join('|'); }).join('\n');
  const fromKnowledge = swapConv(t => t.replace(/https:\/\/example\.com\S* \(checked 2026-10-23\)/g, 'from knowledge, not checked today'));
  cov.push(
    ['conventions: fewer than 10 rows fails', check(swapConv(t => t.replace(/\| Booking on phone .*\n/, ''))).some(e => e.includes('Compare at least 10'))],
    ['conventions: no Source column fails', check(swapConv(t => dropCol(t, 4))).some(e => e.includes('add a "Source" column'))],
    ['conventions: no how-it-works rows fails', check(swapConv(t => t.replace(/\| How it works \|/g, '| Where it sits |'))).some(e => e.includes('0 row(s) about how something works'))],
    ['conventions: with a web tool, too few linked sources fails', check(fromKnowledge).some(e => e.includes('0 of 10 row(s) have a linked Source'))],
    ['conventions: from knowledge passes only when the header says there is no web tool', check(fromKnowledge.replace('Competitor research: live, checked 2026-10-23', 'Competitor research: from knowledge, no web tool').replace(/Leader A \(https[^)]*\), Leader B \(https[^)]*\)/, 'Leader A, Leader B')).length === 0],
    ['conventions: a vague research line fails', check(good.replace('Competitor research: live, checked 2026-10-23', 'Competitor research: from knowledge')).some(e => e.includes('must read "live, checked'))],
    ['missing: no "What leaders have" part fails', check(good.replace(/### What leaders have[\s\S]*?\n\n/, '\n')).some(e => e.includes('What leaders have that this app doesn'))],
    ['missing: a leader with no link fails when research is live', check(good.replace(/Leader A \(https[^)]*\), Leader B \(https[^)]*\)/, 'Leader A, Leader B')).some(e => e.includes('name the leaders and link the page'))],
  );
  // Owner rules: when owner-rules.md sits in the audit folder, the section is required and quotes must be real.
  const d4 = mkdtempSync(join(tmpdir(), 'gate-rules-'));
  mkdirSync(join(d4, 'screens'));
  for (const f of ['screens/home-1280.png', 'screens/book-1280.png', 'screens/home-390.png']) writeFileSync(join(d4, f), '');
  writeFileSync(join(d4, 'owner-rules.md'), '# Owner rules\n\n| # | Kind | Quote | File and line |\n| --- | --- | --- | --- |\n| O01 | rule | "Cards always sit 16px apart, on every screen." | DESIGN.md:5 |\n| O02 | decision | "The greeting is blunt on purpose. Keep it: "Back again? Fine."" | DESIGN.md:10 |\n\n## Skipped on purpose (benchmark fairness)\n\n- current-complaints.md: its name says it may list the owner\'s current complaints. Not opened.\n');
  const ruled = good.replace('Context used: none given', 'Context used: DESIGN.md (owner rules); skipped current-complaints.md (may list current complaints)')
    .replace('| P01 | Rule shown late | Book step 4, screens/book-1280.png | Owners | H5 |', '| P01 | Cards sit 28px apart | Book step 4, screens/book-1280.png | Owners | Owner rule: "Cards always sit 16px apart, on every screen." |');
  const respected = '\n## Owner decisions respected\n| What the app does | Owner\'s words | File and line | What it differs from |\n|---|---|---|---|\n| The greeting says "Back again? Fine." | "The greeting is blunt on purpose. Keep it: "Back again? Fine."" | DESIGN.md:10 | Leaders greet warmly |\n';
  cov.push(
    ['owner rules: the section is required when owner-rules.md exists', check(ruled, d4).some(e => e.includes('Missing section "## Owner decisions respected"'))],
    ['owner rules: a rule break as a pain with an Owner rule lens, and a respected decision, pass', check(ruled + respected, d4).length === 0],
    ['owner rules: "None" with a reason passes', check(ruled + '\n## Owner decisions respected\nNone: nothing in the app differs from the leaders in a way the owner chose.\n', d4).length === 0],
    ['owner rules: an invented quote in a lens fails', check(ruled.replace('Cards always sit 16px apart, on every screen.', 'Cards should feel airy and light.') + respected, d4).some(e => e.includes('must quote the rule exactly'))],
    ['owner rules: an invented quote in a respected decision fails', check(ruled + respected.replace('The greeting is blunt on purpose. Keep it:', 'We like a rude greeting:'), d4).some(e => e.includes('quote the owner\'s words exactly'))],
    ['owner rules: a skipped complaints file must be named', check(ruled.replace('; skipped current-complaints.md (may list current complaints)', '') + respected, d4).some(e => e.includes('skipped current-complaints.md without opening it'))],
    ['owner rules: no owner-rules.md, no section needed', check(good, d).filter(e => /owner/i.test(e)).length === 0],
  );
  const covFailed = cov.filter(([, pass]) => !pass).map(([name]) => name);
  console.log(covFailed.length === 0 ? `PASS  header, research, owner-rule, use-limit and lifecycle checks: ${cov.length} cases` : `FAIL  header, research, owner-rule, use-limit and lifecycle checks: ${covFailed.join(', ')}`);
  const g = check(good), b = check(bad);
  const expect = ['Controls opened:', 'Phone coverage:', 'Used as a user:', 'has no 390 screenshot', 'Competitor research:', 'verdict must be Matches', 'Compare at least 10', 'row for T9', 'T8: score must be', 'T8: say why', 'sentence verdict', 'duplicate ID', 'no screenshot path', 'heuristic or lens', 'severity "high"', 'cause "navigation"', 'source must start', 'need a principle', 'need a test', 'Reviewers:', 'Not verified', 'joins problems', 'sentences', 'Missing: no rows', 'Left behind'];
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
