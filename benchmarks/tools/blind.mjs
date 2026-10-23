#!/usr/bin/env node
// Copy finished runs into a blind grading folder, add hidden control runs, and write the grader prompts.
// Usage: node benchmarks/tools/blind.mjs <runs-label-dir> <grade-dir> [--graders N]
// Writes <grade-dir>/<case>/<code>/run/ (outputs, tool names scrubbed), GRADE-PROMPT-<g>.md per grader,
// and <grade-dir>/.map.json (code to case, model, arm, run, leaks, cost). Keep .map.json away from graders.
// Leak scan: a run is flagged if its outputs show it saw the skill (non-skill arms) or an answer key (any arm).
// Controls: for each case, a perfect reference review and a vague review are mixed in under random codes.
// Runs with no reply.md stay in the map as failures and score 0; they are never silently dropped.
import { readFileSync, writeFileSync, mkdirSync, cpSync, readdirSync, statSync, renameSync, existsSync } from 'node:fs';
import { resolve, dirname, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';

const here = dirname(fileURLToPath(import.meta.url));
const bench = resolve(here, '..');
const repo = resolve(bench, '..');
const args = process.argv.slice(2);
const [runsDir, gradeDir] = args.filter((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--')).map(p => resolve(p));
if (!runsDir || !gradeDir) { console.error('usage: node benchmarks/tools/blind.mjs <runs-label-dir> <grade-dir> [--graders N]'); process.exit(2); }
const gi = args.indexOf('--graders');
const graders = gi >= 0 ? Number(args[gi + 1]) : 2;

const manifest = JSON.parse(readFileSync(join(runsDir, 'manifest.json'), 'utf8'));
const config = JSON.parse(readFileSync(join(bench, 'cases.json'), 'utf8'));
const template = readFileSync(join(bench, 'grader', 'grader-prompt.md'), 'utf8').match(/```text\n([\s\S]*?)```/)[1].trimEnd();
const SKIP = new Set(['app', 'pack', 'PROMPT.md', 'RUN.json']);
const SCRUB = /shipright[\w-]*|ship ?right/gi;
const TEXT = new Set(['.md', '.txt', '.json', '.html', '.csv']);
// What a run must never have seen. Skill traces only count against the non-skill arms.
const SKILL_TRACE = /shipright-audit|pack\/shipright|references\/heuristics\.md|finding-examples\.md/i;
const KEY_TRACE = /answer-keys|counts_as_found_when|false_keep_ids|a86c495c-91a4-4aa5-ab7b-ad0e50a93f15/i;

const walk = d => readdirSync(d).flatMap(n => { const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : [p]; });
const textOf = d => walk(d).filter(p => TEXT.has(extname(p).toLowerCase())).map(p => readFileSync(p, 'utf8')).join('\n');

// Scrub tool names from file text and from file and folder names, so nothing in the path reveals the arm.
function scrubTree(dir) {
  for (const name of readdirSync(dir)) {
    let p = join(dir, name);
    if (new RegExp(SCRUB.source, 'i').test(name)) { const q = join(dir, name.replace(SCRUB, 'review')); renameSync(p, q); p = q; }
    if (statSync(p).isDirectory()) scrubTree(p);
    else if (TEXT.has(extname(p).toLowerCase())) writeFileSync(p, readFileSync(p, 'utf8').replace(SCRUB, 'the reviewer'));
  }
}

const code = () => randomBytes(3).toString('hex');
const map = {};
function addForGrading(caseId, srcFiles, meta) {
  const c = config.cases.find(x => x.id === caseId);
  const id = code();
  const dest = join(gradeDir, caseId, id);
  mkdirSync(join(dest, 'run'), { recursive: true });
  for (const [name, src] of srcFiles) cpSync(src, join(dest, 'run', name), { recursive: true });
  scrubTree(join(dest, 'run'));
  for (let g = 1; g <= graders; g++) {
    writeFileSync(join(dest, `GRADE-PROMPT-${g}.md`), template
      .replace('{ANSWER_KEY}', resolve(repo, c.answer_key))
      .replace('{RUN_DIR}', join(dest, 'run'))
      .replace('{APP}', resolve(repo, c.app))
      .replace('{OUT_FILE}', join(dest, `grade-${g}.json`)) + '\n');
  }
  map[id] = meta;
}

let failed = 0, leaked = 0;
for (const r of manifest.runs) {
  const runMeta = existsSync(join(r.folder, 'RUN.json')) ? JSON.parse(readFileSync(join(r.folder, 'RUN.json'), 'utf8')) : r;
  const meta = { case: r.case, model: r.model, arm: r.arm, run: r.run, tokens: runMeta.tokens ?? null, duration_s: runMeta.duration_s ?? null, model_id: runMeta.model_id ?? null };
  const outputs = existsSync(r.folder) ? readdirSync(r.folder).filter(n => !SKIP.has(n)) : [];
  if (!outputs.includes('reply.md')) { map[`fail-${code()}`] = { ...meta, status: 'no-output' }; failed++; continue; }
  const text = outputs.map(n => { const p = join(r.folder, n); return statSync(p).isDirectory() ? textOf(p) : (TEXT.has(extname(p)) ? readFileSync(p, 'utf8') : ''); }).join('\n');
  const leaks = [];
  if (r.arm !== 'c-skill' && SKILL_TRACE.test(text)) leaks.push('saw the skill');
  if (KEY_TRACE.test(text)) leaks.push('saw an answer key');
  if (leaks.length) leaked++;
  addForGrading(r.case, outputs.map(n => [n, join(r.folder, n)]), { ...meta, status: leaks.length ? 'leaked' : 'ok', leaks });
}

// Hidden controls, one perfect and one vague review per case in this batch.
const cases = [...new Set(manifest.runs.map(r => r.case))];
for (const c of cases) {
  const ref = join(bench, 'grader', 'controls', `${c}-reference.md`);
  if (existsSync(ref)) addForGrading(c, [['reply.md', ref]], { case: c, arm: 'control-reference', status: 'control' });
  addForGrading(c, [['reply.md', join(bench, 'grader', 'controls', 'vague-review.md')]], { case: c, arm: 'control-vague', status: 'control' });
}

mkdirSync(gradeDir, { recursive: true });
writeFileSync(join(gradeDir, '.map.json'), JSON.stringify(map, null, 2) + '\n');
const graded = Object.values(map).filter(m => m.status !== 'no-output').length;
console.log(`blinded ${graded} folders (${cases.length * 2} of them hidden controls) into ${gradeDir}`);
if (failed) console.log(`${failed} runs had no reply.md: they count as 0, not dropped`);
if (leaked) console.log(`${leaked} runs show a leak and will be excluded and reported`);
console.log(`next: ${graders} fresh graders per folder (GRADE-PROMPT-1.md ... ${graders}.md), different model families, then score.mjs`);
