#!/usr/bin/env node
// One command for every repo check: npm test (or node tests/run.mjs).
// Runs the offline self-tests, manifest and skill checks, a style scan, and the seeded-app check
// (the last one only when Playwright is installed).
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { resolve, dirname, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const results = [];
const ok = (name, pass, note = '') => results.push({ name, pass, note });
const run = (args) => spawnSync(process.execPath, args, { cwd: root, encoding: 'utf8' });

// 1. Offline self-tests
let r = run(['skills/shipright-audit/scripts/check-stage.mjs', '--self-test']);
ok('gate script self-test', r.status === 0, r.stdout.trim().split('\n').pop());
r = run(['benchmarks/tools/score.mjs', '--self-test']);
ok('scorer self-test', r.status === 0, r.stdout.trim().split('\n').pop());

// 2. Manifests are valid JSON with the fields the tools require
const json = p => { try { return JSON.parse(readFileSync(join(root, p), 'utf8')); } catch (e) { return null; } };
const plugin = json('.claude-plugin/plugin.json'), market = json('.claude-plugin/marketplace.json'), codex = json('.codex-plugin/plugin.json'), pkg = json('package.json');
ok('Claude plugin.json', plugin?.name === 'shipright-audit' && !!plugin.version);
ok('Claude marketplace.json', !!market?.name && !!market?.owner?.name && market?.plugins?.[0]?.name === 'shipright-audit' && !!market.plugins[0].source);
ok('Codex plugin.json', codex?.name === 'shipright-audit' && codex?.skills === './skills/');
ok('versions match', plugin?.version === codex?.version && plugin?.version === pkg?.version, `${plugin?.version} / ${codex?.version} / ${pkg?.version}`);

// 3. The skill: frontmatter, size, and every file it points to exists
const skill = readFileSync(join(root, 'skills/shipright-audit/SKILL.md'), 'utf8');
const fm = skill.match(/^---\n([\s\S]*?)\n---/);
const desc = fm?.[1].match(/description:\s*(.+)/)?.[1] || '';
ok('skill frontmatter', /name:\s*shipright-audit/.test(fm?.[1] || '') && desc.length > 0 && desc.length <= 1024, `${desc.length} chars`);
ok('SKILL.md under 500 lines', skill.split('\n').length < 500, `${skill.split('\n').length} lines`);
const refs = [...skill.matchAll(/`(?:<skill>\/)?((?:references|templates|scripts)\/[\w./-]+)`/g)].map(m => m[1]);
const missing = [...new Set(refs)].filter(p => !existsSync(join(root, 'skills/shipright-audit', p)));
ok('skill references exist', missing.length === 0, missing.join(', ') || `${new Set(refs).size} files`);

// 4. Style: no em dashes and no banned filler words in any markdown we ship
const walk = d => readdirSync(d).flatMap(n => { if (['node_modules', '.git', 'runs', 'grades'].includes(n)) return []; const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : [p]; });
const md = walk(root).filter(p => extname(p) === '.md' || extname(p) === '.mdc');
const bad = md.filter(p => /—|\bgenuinely\b|\bhonestly\b|\bstraightforward\b/i.test(readFileSync(p, 'utf8'))).map(p => p.slice(root.length + 1));
ok('style scan (no em dashes or banned words)', bad.length === 0, bad.join(', ') || `${md.length} files`);

// 5. Seeded apps still contain every planted pain and Keep (needs Playwright)
let hasPw = false;
try { createRequire(join(root, 'package.json'))('playwright'); hasPw = true; } catch {}
if (hasPw) { r = run(['benchmarks/tools/verify-seeds.mjs']); ok('seeded apps match their answer keys', r.status === 0, r.stdout.trim().split('\n').pop()); }
else ok('seeded apps match their answer keys', true, 'SKIPPED: Playwright not installed (npm i -D playwright)');

for (const t of results) console.log(`${t.pass ? 'PASS' : 'FAIL'}  ${t.name}${t.note ? `  (${t.note})` : ''}`);
const failed = results.filter(t => !t.pass).length;
console.log(`\n${results.length - failed} of ${results.length} checks pass`);
process.exit(failed ? 1 : 0);
