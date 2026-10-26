#!/usr/bin/env node
// Turn grader JSON into the results report. Graders only label; this script does all the math.
// Usage: node benchmarks/tools/score.mjs <grade-dir> [--label name] [--out dir]
//        node benchmarks/tools/score.mjs --self-test      (no API needed; checks the math on fixtures)
// Reads <grade-dir>/.map.json and <grade-dir>/<case>/<code>/grade-*.json (or grade.json).
// Method (see README): per-item labels averaged across graders (Found 1, Partly 0.5, else 0); medians per cell;
// paired skill-minus-baseline differences with a cluster bootstrap over (case, model) cells and runs; sign test.
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, mkdtempSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';

const here = dirname(fileURLToPath(import.meta.url));
const bench = resolve(here, '..');
const repo = resolve(bench, '..');
const config = JSON.parse(readFileSync(join(bench, 'cases.json'), 'utf8'));
const keys = Object.fromEntries(config.cases.map(c => [c.id, JSON.parse(readFileSync(resolve(repo, c.answer_key), 'utf8'))]));

const VAL = { Found: 1, Partly: 0.5 };
const mean = xs => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
const median = xs => { const v = xs.filter(x => x !== null && !Number.isNaN(x)).sort((a, b) => a - b); if (!v.length) return null; const m = Math.floor(v.length / 2); return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2; };
const pct = x => x === null || x === undefined ? 'n/a' : `${Math.round(x * 100)}%`;
const pts = x => x === null ? 'n/a' : `${x >= 0 ? '+' : ''}${Math.round(x * 100)}`;
const num = x => x === null ? 'n/a' : (Math.round(x * 10) / 10).toString();

// Seeded random numbers so the bootstrap gives the same interval on every rerun.
function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

// One run's metrics from one or more grader files. Missing or Unsure labels count as 0.
export function runMetrics(key, grades) {
  const avg = (get) => mean(grades.map(get));
  const itemScore = id => avg(g => VAL[g.pains?.[id]] ?? 0);
  const recall = mean(key.pains.map(p => itemScore(p.id)));
  const keepRecall = mean(key.keeps.map(k => avg(g => g.keeps?.[k.id] === 'Found' ? 1 : 0)));
  const majority = (field, allowed) => allowed.filter(id => grades.filter(g => (g[field] || []).includes(id)).length * 2 >= grades.length && grades.some(g => (g[field] || []).includes(id))).length;
  const falseKeeps = majority('false_keeps', key.false_keep_ids);
  const keepsAsPain = majority('keeps_flagged_as_pain', key.keeps.map(k => k.id));
  const m = f => median(grades.map(g => Number(g[f]) || 0));
  const reported = m('reported_problems');
  const matched = mean(key.pains.map(p => grades.some(g => VAL[g.pains?.[p.id]]) ? 1 : 0)) * key.pains.length;
  const sevChecked = m('severity_checked');
  const unsure = mean(grades.map(g => Object.values(g.pains || {}).filter(v => v === 'Unsure').length));
  return {
    recall, keep_recall: keepRecall, false_keeps: falseKeeps, keeps_as_pain: keepsAsPain,
    precision: reported ? Math.min(1, (matched + m('extra_real')) / reported) : null,
    evidence: reported ? Math.min(1, m('with_location') / reported) : null,
    severity: sevChecked ? m('severity_within_one') / sevChecked : null,
    not_real: m('extra_not_real'), reported, unsure
  };
}

// Cluster bootstrap of the paired difference (arm A minus arm B) over cells and runs.
export function pairedDiff(cells, armA, armB, B = 2000, seed = 7) {
  const pairs = cells.filter(c => c.arms[armA]?.length && c.arms[armB]?.length);
  if (!pairs.length) return null;
  const point = mean(pairs.map(c => mean(c.arms[armA]) - mean(c.arms[armB])));
  const r = rng(seed); const pick = xs => xs[Math.floor(r() * xs.length)];
  const resample = xs => xs.map(() => pick(xs));
  const boots = [];
  for (let i = 0; i < B; i++) boots.push(mean(resample(pairs).map(c => mean(resample(c.arms[armA])) - mean(resample(c.arms[armB])))));
  boots.sort((a, b) => a - b);
  const wins = pairs.filter(c => mean(c.arms[armA]) > mean(c.arms[armB])).length;
  const losses = pairs.filter(c => mean(c.arms[armA]) < mean(c.arms[armB])).length;
  return { diff: point, lo: boots[Math.floor(0.025 * B)], hi: boots[Math.floor(0.975 * B)], cells: pairs.length, wins, losses, sign_p: signTest(wins, losses) };
}
// Two-sided exact sign test; ties are left out.
export function signTest(w, l) {
  const n = w + l; if (!n) return null;
  const k = Math.min(w, l); let p = 0; let c = 1;
  for (let i = 0; i <= n; i++) { if (i > 0) c = c * (n - i + 1) / i; if (i <= k) p += c; }
  return Math.min(1, 2 * p / 2 ** n);
}

export function score(gradeDir, label) {
  const map = JSON.parse(readFileSync(join(gradeDir, '.map.json'), 'utf8'));
  const runs = [], controls = [], leaks = [], fails = [], ungraded = [];
  for (const [code, meta] of Object.entries(map)) {
    if (meta.status === 'no-output') { fails.push(meta); runs.push({ ...meta, recall: 0, keep_recall: 0, failed: true }); continue; }
    const dir = join(gradeDir, meta.case, code);
    const files = existsSync(dir) ? readdirSync(dir).filter(f => /^grade(-\d+)?\.json$/.test(f)).sort() : [];
    if (!files.length) { ungraded.push(meta); continue; }
    const grades = files.map(f => JSON.parse(readFileSync(join(dir, f), 'utf8')));
    if (meta.status === 'control') {
      controls.push({ ...meta, per_grader: grades.map((g, i) => ({ file: files[i], recall: runMetrics(keys[meta.case], [g]).recall })) });
      continue;
    }
    if (meta.status === 'leaked') { leaks.push(meta); continue; }
    runs.push({ ...meta, graders: grades.length, ...runMetrics(keys[meta.case], grades) });
  }
  if (!runs.length) throw new Error('score: no graded runs found');

  // Control check: the perfect review must score 90% or more, the vague one 10% or less, for every grader.
  const controlFails = [];
  for (const c of controls) for (const g of c.per_grader) {
    if (c.arm === 'control-reference' && g.recall < 0.9) controlFails.push(`${c.case} ${g.file}: perfect review scored ${pct(g.recall)} (needs 90%+)`);
    if (c.arm === 'control-vague' && g.recall > 0.1) controlFails.push(`${c.case} ${g.file}: vague review scored ${pct(g.recall)} (needs 10% or less)`);
  }

  const FIELDS = ['recall', 'precision', 'keep_recall', 'false_keeps', 'keeps_as_pain', 'evidence', 'severity', 'not_real'];
  const cellMap = {};
  for (const r of runs) {
    const k = `${r.case}|${r.model}`;
    (cellMap[k] ??= { case: r.case, model: r.model, arms: {}, rows: {} });
    (cellMap[k].arms[r.arm] ??= []).push(r.recall);
    (cellMap[k].rows[r.arm] ??= []).push(r);
  }
  const cells = Object.values(cellMap);
  const cellStats = (rows) => ({ n: rows.length, worst: Math.min(...rows.map(r => r.recall)), failed: rows.filter(r => r.failed).length,
    tokens: median(rows.map(r => r.tokens ?? null)), minutes: median(rows.map(r => r.duration_s == null ? null : r.duration_s / 60)),
    ...Object.fromEntries(FIELDS.map(f => [f, median(rows.map(r => r[f] ?? null))])) });
  const ARMS = ['a-plain', 'b-careful', 'c-skill'];
  const ARM_NAME = { 'a-plain': 'No skill', 'b-careful': 'Careful prompt', 'c-skill': 'shipright-audit' };
  const armsPresent = ARMS.filter(a => cells.some(c => c.rows[a]));
  // Overall: median across cells of each cell's median, so every case and model weighs the same.
  const overall = Object.fromEntries(armsPresent.map(a => {
    const cs = cells.filter(c => c.rows[a]).map(c => cellStats(c.rows[a]));
    return [a, { runs: cs.reduce((s, c) => s + c.n, 0), failed: cs.reduce((s, c) => s + c.failed, 0), worst: median(cs.map(c => c.worst)),
      tokens: median(cs.map(c => c.tokens)), minutes: median(cs.map(c => c.minutes)), ...Object.fromEntries(FIELDS.map(f => [f, median(cs.map(c => c[f]))])) }];
  }));

  const vsCareful = pairedDiff(cells, 'c-skill', 'b-careful');
  const vsPlain = pairedDiff(cells, 'c-skill', 'a-plain');
  const realCells = cells.filter(c => config.cases.find(x => x.id === c.case)?.kind === 'real');
  const realVsCareful = pairedDiff(realCells, 'c-skill', 'b-careful');

  const losses = [];
  for (const c of cells) for (const base of ['b-careful', 'a-plain']) {
    const s = c.arms['c-skill'], b = c.arms[base];
    if (s && b && median(s) < median(b)) losses.push(`${c.case} on ${c.model}: skill ${pct(median(s))} vs ${ARM_NAME[base].toLowerCase()} ${pct(median(b))} pain recall`);
  }

  const casesUsed = [...new Set(runs.map(r => r.case))];
  const models = [...new Set(runs.map(r => r.model))];
  const runsPerCell = median(cells.flatMap(c => Object.values(c.rows).map(r => r.length)));
  const s = overall['c-skill'], plain = overall['a-plain'];
  const diffLine = d => d ? `${pts(d.diff)} points (95% CI ${pts(d.lo)} to ${pts(d.hi)}), better in ${d.wins} of ${d.cells} case-model cells, sign test p = ${d.sign_p === null ? 'n/a' : d.sign_p.toFixed(3)}` : 'not measured';

  let md = `# shipright-audit results: ${label}\n\n`;
  if (controlFails.length) md += `> **Warning: grader check failed.** ${controlFails.length} control grade(s) out of range. Fix or replace those graders before quoting any number. See "Grader check".\n\n`;
  md += s && plain ? `Finds ${pct(s.recall)} of known UX problems in an existing app, vs ${pct(plain.recall)} with no skill${overall['b-careful'] ? ` and ${pct(overall['b-careful'].recall)} with a careful prompt` : ''}.\n` : 'Not enough arms graded for a headline yet.\n';
  md += `Measured on ${casesUsed.length} apps, ${models.length} models (${models.join(', ')}), ${armsPresent.length} arms, ${runs.length} runs (about ${runsPerCell} per cell), ${median(runs.map(r => r.graders ?? null)) ?? 'n/a'} graders per run, median reported. Date: ${new Date().toISOString().slice(0, 10)}.\n\n`;
  md += `## Overall\n\n| Arm | Pain recall | Worst run | Precision | Keep recall | False keeps | Keeps called pains | Evidence | Severity match | Tokens | Minutes | Runs (failed) |\n|---|---|---|---|---|---|---|---|---|---|---|---|\n`;
  md += armsPresent.map(a => { const o = overall[a]; return `| ${ARM_NAME[a]} | ${pct(o.recall)} | ${pct(o.worst)} | ${pct(o.precision)} | ${pct(o.keep_recall)} | ${num(o.false_keeps)} | ${num(o.keeps_as_pain)} | ${pct(o.evidence)} | ${pct(o.severity)} | ${o.tokens === null ? 'n/a' : Math.round(o.tokens).toLocaleString('en-US')} | ${num(o.minutes)} | ${o.runs} (${o.failed}) |`; }).join('\n') + '\n\n';
  md += `## Is the difference real?\n\n| Comparison | Pain recall difference |\n|---|---|\n| Skill vs careful prompt, all cases | ${diffLine(vsCareful)} |\n| Skill vs no skill, all cases | ${diffLine(vsPlain)} |\n| Skill vs careful prompt, real cases only | ${diffLine(realVsCareful)} |\n\n`;
  md += `A difference counts as real only when the whole 95% interval is above 0. Intervals come from a cluster bootstrap (2,000 resamples) over case-model cells and the runs inside them.\n\n`;
  md += `## Per case and model\n\n`;
  for (const cid of casesUsed) {
    md += `### ${cid} (${config.cases.find(x => x.id === cid)?.kind})\n\n| Model | Arm | Pain recall | Worst run | Precision | Keep recall | False keeps | Evidence | Severity match | Runs |\n|---|---|---|---|---|---|---|---|---|---|\n`;
    for (const m of models) for (const a of armsPresent) {
      const c = cellMap[`${cid}|${m}`]; if (!c?.rows[a]) continue; const v = cellStats(c.rows[a]);
      md += `| ${m} | ${ARM_NAME[a]} | ${pct(v.recall)} | ${pct(v.worst)} | ${pct(v.precision)} | ${pct(v.keep_recall)} | ${num(v.false_keeps)} | ${pct(v.evidence)} | ${pct(v.severity)} | ${v.n} |\n`;
    }
    md += '\n';
  }
  md += `## Where it loses\n\n${losses.length ? losses.map(l => `- ${l}`).join('\n') : '- No case-model cell where the skill scored lower median pain recall than another arm.'}\n\n`;
  md += `## Grader check\n\n${controls.length ? controls.map(c => `- ${c.case}, ${c.arm.replace('control-', '')} review: ${c.per_grader.map(g => `${g.file} ${pct(g.recall)}`).join(', ')}`).join('\n') : '- No control grades found.'}\n${controlFails.length ? '\nFailed:\n' + controlFails.map(f => `- ${f}`).join('\n') + '\n' : '\nAll controls in range (perfect review 90%+, vague review 10% or less).\n'}\n`;
  md += `## Limitations\n\n`;
  md += `- ${casesUsed.length} apps is a small sample. Treat intervals, not single numbers, as the result.\n`;
  md += `- The seeded apps were written by the skill's author and likely favor the skill. The real-cases row above is the fairer comparison.\n`;
  md += `- Graders are language models. Their agreement with human labels is reported by agreement.mjs, not here.\n`;
  if (leaks.length) md += `- ${leaks.length} run(s) excluded for leaks: ${leaks.map(l => `${l.case}/${l.model}/${l.arm} run ${l.run} (${l.leaks.join(', ')})`).join('; ')}.\n`;
  if (fails.length) md += `- ${fails.length} run(s) produced no reply and count as 0 pain recall.\n`;
  if (ungraded.length) md += `- ${ungraded.length} blinded folder(s) had no grade file and are not counted.\n`;
  return { md, json: { label, overall, comparisons: { vsCareful, vsPlain, realVsCareful }, cells: Object.fromEntries(Object.entries(cellMap).map(([k, c]) => [k, Object.fromEntries(Object.entries(c.rows).map(([a, rs]) => [a, cellStats(rs)]))])), controlFails, leaks, fails: fails.length, runs } };
}

// Self-test: build fixtures with known answers and check the math. No API, no network.
function selfTest() {
  const dir = mkdtempSync(join(tmpdir(), 'audit-selftest-'));
  const k = keys['s1-pawsh-grooming']; const map = {}; let n = 0;
  const grade = (F, P, extra = {}) => ({ pains: Object.fromEntries(k.pains.map((p, i) => [p.id, i < F ? 'Found' : i < F + P ? 'Partly' : 'Missed'])), keeps: Object.fromEntries(k.keeps.map((x, i) => [x.id, i < 2 ? 'Found' : 'Missed'])), false_keeps: [], keeps_flagged_as_pain: [], reported_problems: 20, extra_real: 0, extra_not_real: 0, with_location: 10, severity_checked: 0, severity_within_one: 0, ...extra });
  const add = (meta, grades) => { const code = `c${n++}`; map[code] = meta; mkdirSync(join(dir, meta.case, code), { recursive: true }); grades.forEach((g, i) => writeFileSync(join(dir, meta.case, code, `grade-${i + 1}.json`), JSON.stringify(g))); };
  for (let r = 1; r <= 3; r++) {
    add({ case: 's1-pawsh-grooming', model: 'm', arm: 'c-skill', run: r, status: 'ok' }, [grade(16, 0), grade(14, 4)]);   // avg (16 + 16)/2 = 16 -> 80%
    add({ case: 's1-pawsh-grooming', model: 'm', arm: 'b-careful', run: r, status: 'ok' }, [grade(10, 0), grade(10, 0)]); // 50%
  }
  add({ case: 's1-pawsh-grooming', model: 'm', arm: 'a-plain', run: 1, status: 'ok' }, [grade(4, 2), grade(4, 2)]);       // (4 + 1)/20 = 25%
  map.fail1 = { case: 's1-pawsh-grooming', model: 'm', arm: 'a-plain', run: 2, status: 'no-output' };                    // counts as 0
  add({ case: 's1-pawsh-grooming', model: 'm', arm: 'a-plain', run: 3, status: 'leaked', leaks: ['saw the skill'] }, [grade(20, 0)]);
  add({ case: 's1-pawsh-grooming', arm: 'control-reference', status: 'control' }, [grade(20, 0), grade(15, 0)]);         // grader 2 fails (75%)
  add({ case: 's1-pawsh-grooming', arm: 'control-vague', status: 'control' }, [grade(0, 0), grade(0, 1)]);
  writeFileSync(join(dir, '.map.json'), JSON.stringify(map));
  const { json } = score(dir, 'self-test');
  const checks = [
    ['skill recall 80%', Math.abs(json.overall['c-skill'].recall - 0.8) < 1e-9],
    ['careful recall 50%', Math.abs(json.overall['b-careful'].recall - 0.5) < 1e-9],
    ['failed run counts as 0, plain median of 25% and 0 = 12.5%', Math.abs(json.overall['a-plain'].recall - 0.125) < 1e-9],
    ['leaked run excluded', json.leaks.length === 1 && json.overall['a-plain'].runs === 2],
    ['paired diff +30 points', Math.abs(json.comparisons.vsCareful.diff - 0.3) < 1e-9],
    ['interval is a point when runs agree', Math.abs(json.comparisons.vsCareful.lo - 0.3) < 1e-9 && Math.abs(json.comparisons.vsCareful.hi - 0.3) < 1e-9],
    ['control failure caught', json.controlFails.length === 1 && /75%/.test(json.controlFails[0])],
    ['keep recall 40%', Math.abs(json.overall['c-skill'].keep_recall - 0.4) < 1e-9],
    ['sign test: 9 wins of 9 gives p = 0.0039', Math.abs(signTest(9, 0) - 0.00390625) < 1e-9],
    ['sign test: 5 vs 5 gives p = 1', signTest(5, 5) === 1]
  ];
  for (const [name, ok] of checks) console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
  const bad = checks.filter(c => !c[1]).length;
  console.log(`\n${checks.length - bad} of ${checks.length} self-test checks pass`);
  process.exit(bad ? 1 : 0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  if (args.includes('--self-test')) selfTest();
  const gradeDir = args[0] && resolve(args[0]);
  if (!gradeDir) { console.error('usage: node benchmarks/tools/score.mjs <grade-dir> [--label name] [--out dir] | --self-test'); process.exit(2); }
  const flag = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
  const label = flag('--label', 'results');
  const outDir = resolve(flag('--out', join(bench, 'results')));
  const { md, json } = score(gradeDir, label);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, `${label}.md`), md);
  writeFileSync(join(outDir, `${label}.json`), JSON.stringify(json, null, 2) + '\n');
  console.log(md);
}
