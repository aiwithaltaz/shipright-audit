#!/usr/bin/env node
// How much can we trust the graders? Cohen's kappa on per-item labels (Found, Partly, Missed).
// Usage:
//   node benchmarks/tools/agreement.mjs <grade-dir>                 grader vs grader, and grader vs human
//   node benchmarks/tools/agreement.mjs <grade-dir> --sample 0.1     pick 10% of graded folders for human labels
// --sample writes human.json templates (every pain ID set to "") into the picked folders. Fill each label
// with Found, Partly or Missed after reading run/ yourself, without looking at grade-*.json first.
// Rule of thumb: kappa 0.6 or more is acceptable; under 0.6, fix the grader prompt or change grader model.
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const bench = resolve(here, '..');
const repo = resolve(bench, '..');
const args = process.argv.slice(2);
const gradeDir = args[0] && resolve(args[0]);
if (!gradeDir) { console.error('usage: node benchmarks/tools/agreement.mjs <grade-dir> [--sample fraction]'); process.exit(2); }
const config = JSON.parse(readFileSync(join(bench, 'cases.json'), 'utf8'));
const keyOf = id => JSON.parse(readFileSync(resolve(repo, config.cases.find(c => c.id === id).answer_key), 'utf8'));
const map = JSON.parse(readFileSync(join(gradeDir, '.map.json'), 'utf8'));
const folders = Object.entries(map).filter(([, m]) => m.status === 'ok').map(([code, m]) => ({ code, ...m, dir: join(gradeDir, m.case, code) })).filter(f => existsSync(f.dir));

const si = args.indexOf('--sample');
if (si >= 0) {
  const frac = Number(args[si + 1] || 0.1);
  const pool = [...folders].sort(() => Math.random() - 0.5).slice(0, Math.max(1, Math.round(folders.length * frac)));
  for (const f of pool) {
    const key = keyOf(f.case);
    writeFileSync(join(f.dir, 'human.json'), JSON.stringify({ pains: Object.fromEntries(key.pains.map(p => [p.id, ''])) }, null, 2) + '\n');
  }
  console.log(`wrote human.json templates in ${pool.length} folders:\n${pool.map(f => '  ' + f.dir).join('\n')}`);
  process.exit(0);
}

const norm = v => v === 'Found' ? 'Found' : v === 'Partly' ? 'Partly' : 'Missed';
// Cohen's kappa for two label lists over the same items.
function kappa(a, b) {
  const cats = ['Found', 'Partly', 'Missed']; const n = a.length; if (!n) return null;
  const po = a.filter((x, i) => x === b[i]).length / n;
  const pe = cats.reduce((s, c) => s + (a.filter(x => x === c).length / n) * (b.filter(x => x === c).length / n), 0);
  return pe === 1 ? 1 : (po - pe) / (1 - pe);
}

const pairs = {}; // "grade-1.json vs grade-2.json" -> [labelsA, labelsB]
const add = (name, x, y) => { (pairs[name] ??= [[], []]); pairs[name][0].push(...x); pairs[name][1].push(...y); };
for (const f of folders) {
  const ids = keyOf(f.case).pains.map(p => p.id);
  const files = readdirSync(f.dir).filter(n => /^grade-\d+\.json$/.test(n)).sort();
  const labels = Object.fromEntries(files.map(n => [n, ids.map(id => norm(JSON.parse(readFileSync(join(f.dir, n), 'utf8')).pains?.[id]))]));
  for (let i = 0; i < files.length; i++) for (let j = i + 1; j < files.length; j++) add(`${files[i]} vs ${files[j]}`, labels[files[i]], labels[files[j]]);
  const hp = join(f.dir, 'human.json');
  if (existsSync(hp)) {
    const human = JSON.parse(readFileSync(hp, 'utf8')).pains || {};
    const filled = ids.filter(id => human[id]);
    if (filled.length < ids.length) { console.warn(`agreement: ${hp} has ${ids.length - filled.length} empty labels, skipped`); continue; }
    for (const n of files) add(`human vs ${n}`, ids.map(id => norm(human[id])), labels[n]);
  }
}

if (!Object.keys(pairs).length) { console.log('No pairs to compare yet. Grade each folder with 2 graders, or add human.json labels.'); process.exit(0); }
let low = 0;
console.log('| Pair | Items | Agreement | Kappa | Verdict |\n|---|---|---|---|---|');
for (const [name, [a, b]] of Object.entries(pairs)) {
  const k = kappa(a, b); const agree = a.filter((x, i) => x === b[i]).length / a.length;
  const ok = k !== null && k >= 0.6; if (!ok) low++;
  console.log(`| ${name} | ${a.length} | ${Math.round(agree * 100)}% | ${k === null ? 'n/a' : k.toFixed(2)} | ${ok ? 'OK' : 'Too low: fix the grader prompt or model'} |`);
}
process.exit(low ? 1 : 0);
