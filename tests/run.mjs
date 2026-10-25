#!/usr/bin/env node
// One command for every repo check: npm test (or node tests/run.mjs).
// Runs the offline self-tests, manifest and skill checks, a style scan, and the seeded-app check
// (the last one only when Playwright is installed).
import { readFileSync, readdirSync, statSync, existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, dirname, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync, spawn } from 'node:child_process';
import { createServer } from 'node:http';
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
if (hasPw) {
  r = run(['benchmarks/tools/verify-seeds.mjs']);
  ok('seeded apps match their answer keys', r.status === 0, r.stdout.trim().split('\n').pop());
  // 6. Task walker: desktop finishes, phone breaks at the link that is hidden on phone
  const out = mkdtempSync(join(tmpdir(), 'walk-test-'));
  run(['skills/shipright-audit/scripts/walk.mjs', 'tests/fixtures/mini-app/index.html', 'tests/fixtures/walk-plan.json', '--out', out]);
  const w = JSON.parse(readFileSync(join(out, 'walk.json'), 'utf8')).widths;
  ok('walker finds a phone-only break', w['1280'].finished && w['1280'].actions === 3 && w['390'].broke_at === 1, `1280 ${w['1280'].finished ? 'finished' : 'broke'}, 390 broke at ${w['390'].broke_at}`);
  // 7. Crawler flags two labels for one destination
  const cout = mkdtempSync(join(tmpdir(), 'crawl-test-'));
  run(['skills/shipright-audit/scripts/crawl.mjs', 'tests/fixtures/mini-app/index.html', '--out', cout]);
  const c = JSON.parse(readFileSync(join(cout, 'crawl.json'), 'utf8'));
  const drift = (c.label_drift || []).find(g => g.target.endsWith('#/form'));
  ok('crawler flags label drift', !!drift && drift.labels.includes('Start order') && drift.labels.includes('Order now'), drift ? drift.labels.join(' / ') : 'none found');
  // 7b. Browser fallback: a browser that cannot start must not stop the audit
  const fb = spawnSync(process.execPath, ['skills/shipright-audit/scripts/crawl.mjs', 'tests/fixtures/mini-app/index.html', '--out', mkdtempSync(join(tmpdir(), 'fallback-'))], { cwd: root, encoding: 'utf8', env: { ...process.env, SHIPRIGHT_BROWSER: 'msedge' } });
  ok('scripts fall back when a browser will not start', fb.status === 0 && /crawl: \d+ screens/.test(fb.stdout), fb.status === 0 ? (fb.stderr.trim().split('\n').pop() || 'Edge started') : `exit ${fb.status}`);
  // 8. Visual checker: every planted kind on the dev fixture, and no false alarms on a busy app
  const vout = mkdtempSync(join(tmpdir(), 'visual-test-'));
  run(['skills/shipright-audit/scripts/visual.mjs', 'tests/fixtures/visual-app/index.html', '--out', vout]);
  const kinds = new Set(JSON.parse(readFileSync(join(vout, 'visual.json'), 'utf8')).findings.map(f => f.kind));
  const want = ['sentence-pill', 'crowded-pills', 'misaligned', 'big-gap', 'covered-menu', 'sharp-corners', 'count-mismatch'];
  const lost = want.filter(k => !kinds.has(k));
  ok('visual checker finds all 7 planted kinds', lost.length === 0, lost.length ? `missed ${lost.join(', ')}` : `${kinds.size} kinds`);
  const nout = mkdtempSync(join(tmpdir(), 'visual-noise-'));
  run(['skills/shipright-audit/scripts/visual.mjs', 'benchmarks/cases/s2-harvest-volunteers/app/index.html', '--routes', '#/dashboard,#/shifts,#/shifts/s4,#/volunteers,#/settings,#/reports', '--out', nout]);
  const noise = JSON.parse(readFileSync(join(nout, 'visual.json'), 'utf8')).findings.length;
  ok('visual checker: no false alarms on 7 busy screens', noise === 0, `${noise} lead(s)`);
  // 9. Login wall and session: without a session the gated app is a wall; with one the crawl gets in
  const sess = join(mkdtempSync(join(tmpdir(), 'sess-')), 'session.json');
  writeFileSync(sess, JSON.stringify({ cookies: [{ name: 'sr_test', value: '1', domain: '127.0.0.1', path: '/', expires: -1, httpOnly: false, secure: false, sameSite: 'Lax' }], origins: [] }));
  const g1 = mkdtempSync(join(tmpdir(), 'gated-')), g2 = mkdtempSync(join(tmpdir(), 'gated-'));
  run(['skills/shipright-audit/scripts/crawl.mjs', 'tests/fixtures/gated-app/index.html', '--out', g1]);
  run(['skills/shipright-audit/scripts/crawl.mjs', 'tests/fixtures/gated-app/index.html', '--session', sess, '--out', g2]);
  const c1 = JSON.parse(readFileSync(join(g1, 'crawl.json'), 'utf8')), c2 = JSON.parse(readFileSync(join(g2, 'crawl.json'), 'utf8'));
  ok('crawler reports a login wall', c1.login_wall === true, `wall: ${c1.login_wall}`);
  ok('crawler gets in with a session and flags empty screens', c2.login_wall === false && c2.screens.length >= 2 && c2.empty_screens >= 1, `${c2.screens.length} screens, ${c2.empty_screens} empty`);
  // 10. login.mjs saves a session once the page signs in (headless test mode), and fails cleanly on timeout
  const server = createServer((req, res) => { const f = join(root, 'tests/fixtures/gated-app/index.html'); res.writeHead(200, { 'content-type': 'text/html' }); res.end(readFileSync(f)); });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}/index.html`;
  const saved = join(mkdtempSync(join(tmpdir(), 'login-')), 's.json'), never = join(mkdtempSync(join(tmpdir(), 'login-')), 'n.json');
  const runAsync = a => new Promise(res => { const p = spawn(process.execPath, a, { cwd: root }); p.on('close', code => res(code)); });
  const okCode = await runAsync(['skills/shipright-audit/scripts/login.mjs', `${base}?auto`, '--headless', '--timeout', '20', '--out', saved]);
  const failCode = await runAsync(['skills/shipright-audit/scripts/login.mjs', base, '--headless', '--timeout', '4', '--out', never]);
  server.close();
  ok('login.mjs saves a signed-in session', okCode === 0 && existsSync(saved) && JSON.parse(readFileSync(saved, 'utf8')).cookies.some(c => c.name === 'sr_test'), `exit ${okCode}`);
  ok('login.mjs fails cleanly when nobody signs in', failCode === 1 && !existsSync(never), `exit ${failCode}`);
} else ok('seeded apps match their answer keys', true, 'SKIPPED: Playwright not installed (npm i -D playwright)');

for (const t of results) console.log(`${t.pass ? 'PASS' : 'FAIL'}  ${t.name}${t.note ? `  (${t.note})` : ''}`);
const failed = results.filter(t => !t.pass).length;
console.log(`\n${results.length - failed} of ${results.length} checks pass`);
process.exit(failed ? 1 : 0);
