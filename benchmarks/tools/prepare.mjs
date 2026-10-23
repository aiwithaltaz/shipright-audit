#!/usr/bin/env node
// Create one folder per run: app copy, skill copy (skill arm only), and the exact prompt to paste.
// Usage: node benchmarks/tools/prepare.mjs <out-root> <label> [--cases a,b] [--models a,b] [--arms a,b] [--runs N] [--skill dir]
// Defaults: all cases in cases.json, models haiku,sonnet,opus, arms a-plain,b-careful,c-skill, 5 runs,
// skill = skills/shipright-audit. Never copies answer keys or controls into run folders.
// LAUNCH.md lists runs in interleaved order (arms rotate), so time-of-day and model drift hit every arm alike.
import { readFileSync, writeFileSync, mkdirSync, cpSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdirSync, statSync } from 'node:fs';

const here = dirname(fileURLToPath(import.meta.url));
const bench = resolve(here, '..');
const repo = resolve(bench, '..');
const args = process.argv.slice(2);
const [outRoot, label] = args.filter((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--'));
if (!outRoot || !label) {
  console.error('usage: node benchmarks/tools/prepare.mjs <out-root> <label> [--cases ...] [--models ...] [--arms ...] [--runs N] [--skill dir]');
  process.exit(2);
}
const flag = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };
const list = (name, def) => flag(name, def).split(',').map(s => s.trim()).filter(Boolean);

// The markdown files are the single source of truth for prompt text.
const blocks = file => [...readFileSync(file, 'utf8').matchAll(/```text\n([\s\S]*?)```/g)].map(m => m[1].trimEnd());
const [runTemplate, careful] = blocks(join(bench, 'arms', 'run-prompt.md'));
const config = JSON.parse(readFileSync(join(bench, 'cases.json'), 'utf8'));

const caseIds = list('--cases', config.cases.map(c => c.id).join(','));
const models = list('--models', 'haiku,sonnet,opus');
const arms = list('--arms', 'a-plain,b-careful,c-skill');
const runs = Number(flag('--runs', '5'));
const skillDir = resolve(repo, flag('--skill', 'skills/shipright-audit'));
const KNOWN_ARMS = ['a-plain', 'b-careful', 'c-skill'];

for (const a of arms) if (!KNOWN_ARMS.includes(a)) { console.error(`prepare: unknown arm "${a}". Use ${KNOWN_ARMS.join(', ')}.`); process.exit(2); }
if (arms.includes('c-skill') && !existsSync(join(skillDir, 'SKILL.md'))) { console.error(`prepare: no SKILL.md in ${skillDir}`); process.exit(2); }
for (const id of caseIds) if (!config.cases.find(x => x.id === id)) { console.error(`prepare: unknown case "${id}"`); process.exit(2); }

// Pin what was tested: repo commit and a hash of every file in the skill folder.
let commit = 'unknown';
try { commit = execFileSync('git', ['-C', repo, 'rev-parse', '--short', 'HEAD'], { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch {}
const files = d => readdirSync(d).flatMap(n => { const p = join(d, n); return statSync(p).isDirectory() ? files(p) : [p]; }).sort();
const skillHash = existsSync(skillDir)
  ? createHash('sha256').update(files(skillDir).map(f => f.slice(skillDir.length) + readFileSync(f)).join('')).digest('hex').slice(0, 12)
  : 'none';

const root = resolve(outRoot, label);
const manifest = [];
for (let n = 1; n <= runs; n++) {
  caseIds.forEach((id, ci) => {
    const c = config.cases.find(x => x.id === id);
    for (const model of models) {
      // Rotate arm order per run and case so no arm always goes first.
      const shift = (n + ci) % arms.length;
      for (const arm of [...arms.slice(shift), ...arms.slice(0, shift)]) {
        const out = join(root, id, model, arm, `run-${n}`);
        mkdirSync(out, { recursive: true });
        cpSync(resolve(repo, c.app), join(out, 'app'), { recursive: true });
        if (arm === 'c-skill') cpSync(skillDir, join(out, 'pack', 'shipright-audit'), { recursive: true });
        const armLine = arm === 'c-skill'
          ? `A skill called shipright-audit is installed at ${out}/pack/shipright-audit. Read ${out}/pack/shipright-audit/SKILL.md first and follow it.`
          : '';
        const message = arm === 'b-careful' ? `${c.message}\n\n${careful}` : c.message;
        const prompt = runTemplate
          .replace('{ARM_LINE}\n', armLine ? armLine + '\n' : '')
          .replaceAll('{OUT}', out)
          .replace('{MESSAGE}', message)
          .replace('{SCRIPTED_REPLY}', config.scripted_reply);
        writeFileSync(join(out, 'PROMPT.md'), prompt + '\n');
        const run = {
          order: manifest.length + 1, case: id, model, arm, run: n, folder: out,
          effort: model === 'opus' ? 'high' : 'default',
          repo_commit: commit, skill_hash: arm === 'c-skill' ? skillHash : null,
          // Fill these after the run, from the session's usage numbers.
          model_id: null, host: null, tokens: null, duration_s: null
        };
        writeFileSync(join(out, 'RUN.json'), JSON.stringify(run, null, 2) + '\n');
        manifest.push(run);
      }
    }
  });
}

writeFileSync(join(root, 'manifest.json'), JSON.stringify({ label, created: new Date().toISOString(), repo_commit: commit, skill_hash: skillHash, runs: manifest }, null, 2) + '\n');
const rows = manifest.map(r => `| ${r.order} | ${r.case} | ${r.model} (${r.effort}) | ${r.arm} | ${r.run} | \`${r.folder}/PROMPT.md\` |`).join('\n');
writeFileSync(join(root, 'LAUNCH.md'), `# Launch list: ${label}

Repo commit ${commit} · skill hash ${skillHash}

## Rules for every run

1. **Go in order.** The arms rotate on purpose so drift during the day hits every arm alike.
2. **One fresh session per row.** No memory, no project instructions (CLAUDE.md, AGENTS.md), no other skills or plugins loaded.
3. **Start the session in the run folder** and paste the text of its PROMPT.md as the first message. Use the model shown.
4. **Do not help the agent.** If it asks something, the scripted reply is already in the prompt.
5. **After the run, fill RUN.json:** model_id (exact ID), host (for example Claude Code 2.x), tokens, duration_s.
6. **Do not delete failed runs.** A run with no reply.md is reported as a failure, not dropped.

| Order | Case | Model | Arm | Run | Prompt |
|---|---|---|---|---|---|
${rows}
`);
console.log(`prepared ${manifest.length} runs in ${root} (repo ${commit}, skill ${skillHash})\nnext: launch each row in order from ${join(root, 'LAUNCH.md')}`);
