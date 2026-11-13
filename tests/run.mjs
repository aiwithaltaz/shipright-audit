#!/usr/bin/env node
// One command for every repo check: npm test (or node tests/run.mjs).
// Runs the offline self-tests, manifest and skill checks, a style scan, and the seeded-app check
// (the last one only when Playwright is installed).
import { readFileSync, readdirSync, statSync, existsSync, mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
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
  const want = ['sentence-pill', 'crowded-pills', 'misaligned', 'big-gap', 'covered-menu', 'sharp-corners', 'count-mismatch', 'buried-action', 'label-overload'];
  const lost = want.filter(k => !kinds.has(k));
  ok(`visual checker finds all ${want.length} planted kinds after a slow load`, lost.length === 0, lost.length ? `missed ${lost.join(', ')}` : `${kinds.size} kinds`);
  const nout = mkdtempSync(join(tmpdir(), 'visual-noise-'));
  run(['skills/shipright-audit/scripts/visual.mjs', 'benchmarks/cases/s2-harvest-volunteers/app/index.html', '--routes', '#/dashboard,#/shifts,#/shifts/s4,#/volunteers,#/settings,#/reports', '--out', nout]);
  const busy = JSON.parse(readFileSync(join(nout, 'visual.json'), 'utf8'));
  const noise = busy.findings.filter(f => f.width === 1280).length;
  ok('visual checker: no false alarms on 7 busy screens', noise === 0, `${noise} lead(s)`);
  // At 390 the only lead is the one the answer key lists for this app: tables wider than a phone screen.
  const phoneLeads = busy.leads.filter(l => l.widths.includes(390));
  ok('visual checker at 390: only the sideways tables the answer key lists', phoneLeads.length === 1 && phoneLeads[0].kind === 'clipped-text' && phoneLeads[0].detail.how === 'screen' && phoneLeads[0].pages.every(p => /#\/(shifts|volunteers)$/.test(p)), phoneLeads.map(l => `${l.kind} on ${l.pages.join(', ')}`).join(' | ') || 'none');
  // 8b. Clipped text: a reply footer cut off at 390 and fine at 1280 is one lead, at 390 only.
  // The same page holds things that must not be flagged: long chat titles shortened in a list, a row
  // of buttons that scrolls sideways, a code block, and a label only screen readers see.
  const pout = mkdtempSync(join(tmpdir(), 'visual-phone-'));
  run(['skills/shipright-audit/scripts/visual.mjs', 'tests/fixtures/phone-app/index.html', '--out', pout]);
  const pl = JSON.parse(readFileSync(join(pout, 'visual.json'), 'utf8')).leads;
  const clip = pl.filter(l => l.kind === 'clipped-text');
  ok('clipped text: a reply footer cut off on phone is one lead, at 390 only', clip.length === 1 && clip[0].widths.join() === '390' && /cost 0\.4 cents/.test(clip[0].what) && /at 390 wide only/.test(clip[0].what) && !!clip[0].shot && pl.length === 1, pl.map(l => `${l.kind} @${l.widths.join('+')}: ${l.what.slice(0, 60)}`).join(' | ') || 'no leads');
  // 8c. No clipped-text false alarms on the other fixtures. (visual-app is three fixed columns, so on a
  // phone its page is wider than the screen: that one lead is true, and it is the only one.)
  const falseAlarms = [];
  for (const f of ['mini-app', 'gated-app', 'explore-app', 'visual-app']) {
    const o = mkdtempSync(join(tmpdir(), 'clip-'));
    run(['skills/shipright-audit/scripts/visual.mjs', `tests/fixtures/${f}/index.html`, '--no-click', '--out', o]);
    const cl = JSON.parse(readFileSync(join(o, 'visual.json'), 'utf8')).leads.filter(l => l.kind === 'clipped-text');
    const allowed = f === 'visual-app' ? cl.filter(l => !(l.detail.how === 'screen' && l.widths.join() === '390')) : cl;
    if (allowed.length || (f === 'visual-app' && cl.length !== 1)) falseAlarms.push(`${f}: ${cl.map(l => l.what.slice(0, 50)).join('; ')}`);
  }
  ok('clipped text: no false alarms on the existing fixtures', falseAlarms.length === 0, falseAlarms.join(' | ') || '4 fixtures');
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
  // 11. Live-app safety: the walker holds back typing into a form on an http(s) app
  const mini = createServer((req, res) => { res.writeHead(200, { 'content-type': 'text/html' }); res.end(readFileSync(join(root, 'tests/fixtures/mini-app/index.html'))); });
  await new Promise(r => mini.listen(0, '127.0.0.1', r));
  const hdir = mkdtempSync(join(tmpdir(), 'held-')), hplan = join(hdir, 'plan.json');
  writeFileSync(hplan, JSON.stringify({ task: 'Type into a live form', steps: [{ do: 'fill', field: 'Name', value: 'test' }] }));
  const hcode = await runAsync(['skills/shipright-audit/scripts/walk.mjs', `http://127.0.0.1:${mini.address().port}/`, hplan, '--out', join(hdir, 'out')]);
  mini.close();
  const hw = JSON.parse(readFileSync(join(hdir, 'out', 'walk.json'), 'utf8')).widths;
  ok('walker holds back typing in a live app', hcode === 0 && hw['1280'].held_at === 1 && hw['1280'].actions === 0, `exit ${hcode}, held at ${hw['1280'].held_at}`);
  const prof = () => mkdtempSync(join(tmpdir(), 'profile-'));
  const okCode = await runAsync(['skills/shipright-audit/scripts/login.mjs', `${base}?auto`, '--headless', '--timeout', '20', '--out', saved, '--profile', prof()]);
  const failCode = await runAsync(['skills/shipright-audit/scripts/login.mjs', base, '--headless', '--timeout', '4', '--out', never, '--profile', prof()]);
  // Google and other pop-up sign-ins refuse windows that announce automation: this page signs in only when navigator.webdriver is false.
  const stealth = createServer((req, res) => { res.writeHead(200, { 'content-type': 'text/html' }); res.end('<h1>App</h1><script>if (!navigator.webdriver) document.cookie = "sr_human=1; path=/"; else document.body.insertAdjacentHTML("beforeend", "<form><input type=password></form>");</script>'); });
  await new Promise(r => stealth.listen(0, '127.0.0.1', r));
  const human = join(mkdtempSync(join(tmpdir(), 'login-')), 'h.json');
  const humanCode = await runAsync(['skills/shipright-audit/scripts/login.mjs', `http://127.0.0.1:${stealth.address().port}/`, '--headless', '--timeout', '15', '--out', human, '--profile', prof()]);
  stealth.close();
  ok('sign-in window does not announce automation', humanCode === 0 && existsSync(human) && JSON.parse(readFileSync(human, 'utf8')).cookies.some(c => c.name === 'sr_human'), `exit ${humanCode}`);
  server.close();
  ok('login.mjs saves a signed-in session', okCode === 0 && existsSync(saved) && JSON.parse(readFileSync(saved, 'utf8')).cookies.some(c => c.name === 'sr_test'), `exit ${okCode}`);
  ok('login.mjs fails cleanly when nobody signs in', failCode === 1 && !existsSync(never), `exit ${failCode}`);
} else ok('seeded apps match their answer keys', true, 'SKIPPED: Playwright not installed (npm i -D playwright)');

// 14. Explorer: opens safe controls, never risky ones, and reports dead controls, missing tooltips and errors
if (hasPw) {
  const eout = mkdtempSync(join(tmpdir(), 'explore-'));
  run(['skills/shipright-audit/scripts/explore.mjs', 'tests/fixtures/explore-app/index.html', '--out', eout]);
  const ex = JSON.parse(readFileSync(join(eout, 'explore.json'), 'utf8'));
  const res = n => (ex.controls.find(c => c.control === n) || {}).result || '';
  const kinds = ex.leads.map(l => `${l.kind}:${l.what}`).join(' | ');
  const good = /^opened dialog/.test(res('Settings')) && /not clicked/.test(res('Delete')) && /not clicked/.test(res('Send')) && /file picker/.test(res('Attach'))
    && /no-tooltip:.*Handoff/.test(kinds) && /dead-control:.*Bookmark/.test(kinds) && /error-on-click:.*microphone.*transcribe/.test(kinds) && !/no-tooltip:.*Help/.test(kinds);
  ok('explorer opens safe controls and finds dead ones, missing tooltips and errors', good, `${ex.controls.length} controls, ${ex.leads.length} leads`);
  // On a live app (http), controls whose effect is unknown are listed, not clicked.
  const live = createServer((req, res2) => { const f = join(root, 'tests/fixtures/explore-app/index.html'); if (req.url !== '/') { res2.writeHead(404); return res2.end(); } res2.writeHead(200, { 'content-type': 'text/html' }); res2.end(readFileSync(f)); });
  await new Promise(r => live.listen(0, '127.0.0.1', r));
  const lout = mkdtempSync(join(tmpdir(), 'explore-live-'));
  await new Promise(r => { const p = spawn(process.execPath, ['skills/shipright-audit/scripts/explore.mjs', `http://127.0.0.1:${live.address().port}/`, '--out', lout], { cwd: root }); p.on('close', r); });
  live.close();
  const lx = JSON.parse(readFileSync(join(lout, 'explore.json'), 'utf8'));
  const lres = n => (lx.controls.find(c => c.control === n) || {}).result || '';
  ok('explorer on a live app clicks only controls that open something', /could change data/.test(lres('Bookmark')) && /could change data/.test(lres('Handoff')) && /^opened/.test(lres('Settings')), `Bookmark: ${lres('Bookmark')}`);
}

// 15. Staying signed in on an app that swaps its sign-in token on every refresh (an old token gets 401).
// The sign-in window's profile keeps working for every script; the saved session file alone goes stale.
if (hasPw) {
  const { startRotatingApp } = await import('./fixtures/rotating-app/server.mjs');
  const app = await startRotatingApp();
  const spawnNode = a => new Promise(res => { const p = spawn(process.execPath, a, { cwd: root, env: { ...process.env, SHIPRIGHT_NO_HEADED: '1' } }); let err = '', out = ''; p.stderr.on('data', d => { err += d; }); p.stdout.on('data', d => { out += d; }); p.on('close', code => res({ code, err, out })); });
  const dir = mkdtempSync(join(tmpdir(), 'rotate-')), prof = join(dir, 'profile'), sess = join(dir, 'session.json');
  const S = 'skills/shipright-audit/scripts/';
  const li = await spawnNode([S + 'login.mjs', `${app.url}?auto`, '--headless', '--timeout', '20', '--out', sess, '--profile', prof]);
  ok('login.mjs prints the profile path and browser for the next script', li.code === 0 && li.out.includes(prof) && /Browser: /.test(li.out) && existsSync(join(prof, 'shipright-profile.json')), `exit ${li.code}`);
  const c1 = await spawnNode([S + 'crawl.mjs', app.url, '--profile', prof, '--session', sess, '--out', join(dir, 'c1')]);
  const cj = c1.code === 0 ? JSON.parse(readFileSync(join(dir, 'c1', 'crawl.json'), 'utf8')) : { screens: [] };
  ok('crawl stays signed in with --profile on a token-rotating app', c1.code === 0 && cj.login_wall === false && cj.screens.length >= 3 && cj.screens.every(s => !s.asks_password) && /sign-in profile/.test(cj.signed_in_with || ''), `exit ${c1.code}, ${cj.screens.length} screens, ${cj.signed_in_with || c1.err.trim().split('\n').pop()}`);
  // Every other script reuses the same profile, one after the other.
  writeFileSync(join(dir, 'plan.json'), JSON.stringify({ task: 'Open projects', steps: [{ do: 'click', text: 'Projects' }, { do: 'expect', text: 'Garden plan' }] }));
  const others = [
    ['explore', [S + 'explore.mjs', app.url, '--profile', prof, '--out', join(dir, 'e')]],
    ['visual', [S + 'visual.mjs', app.url, '--profile', prof, '--out', join(dir, 'v')]],
    ['consistency', [S + 'consistency.mjs', app.url, '--profile', prof, '--out', join(dir, 'k')]],
    ['walk', [S + 'walk.mjs', app.url, join(dir, 'plan.json'), '--profile', prof, '--out', join(dir, 'w')]],
  ];
  const bad = [];
  for (const [n, a] of others) { const r2 = await spawnNode(a); if ((r2.code !== 0 && !(n === 'consistency' && r2.code === 1)) || !/signed in with the sign-in profile/.test(r2.err)) bad.push(`${n}: exit ${r2.code} ${r2.err.trim().split('\n').pop()}`); }
  ok('explore, visual, consistency and walk all stay signed in with --profile', bad.length === 0, bad.join(' | ') || `${others.length} scripts, ${app.stats.refresh_ok} token swaps`);
  // The session file was saved at sign-in. The app has swapped its token many times since: it must fail, loudly.
  const c2 = await spawnNode([S + 'crawl.mjs', app.url, '--session', sess, '--out', join(dir, 'c2')]);
  ok('--session alone fails on a token-rotating app, with a clear message', c2.code === 3 && c2.err.includes('The app signed us out (401). Run login.mjs again.') && !existsSync(join(dir, 'c2', 'crawl.json')), `exit ${c2.code}: ${c2.err.trim().split('\n')[0]}`);
  // A stale session falls back to nothing, but a stale session plus a good profile is fine (profile first).
  const c3 = await spawnNode([S + 'crawl.mjs', app.url, '--session', sess, '--profile', prof, '--out', join(dir, 'c3')]);
  ok('profile is tried before the session file', c3.code === 0 && /signed in with the sign-in profile/.test(c3.err), `exit ${c3.code}`);
  app.stop();
  // A site that refuses headless browsers: retry once in a window placed off screen, and say which mode ran.
  // This opens a real (off screen) window, so it only runs when asked: SHIPRIGHT_TEST_HEADED=1 npm test
  if (process.env.SHIPRIGHT_TEST_HEADED === '1') {
    const shy = await startRotatingApp({ refuseHeadless: true });
    const d2 = mkdtempSync(join(tmpdir(), 'shy-')), p2 = join(d2, 'profile');
    // Sign in with a window, because this app turns headless browsers away.
    const l2 = await new Promise(res => { const p = spawn(process.execPath, [S + 'login.mjs', `${shy.url}?auto`, '--timeout', '30', '--out', join(d2, 's.json'), '--profile', p2], { cwd: root, env: { ...process.env, SHIPRIGHT_BROWSER: 'chromium' } }); p.on('close', code => res(code)); });
    const h = await new Promise(res => { const p = spawn(process.execPath, [S + 'crawl.mjs', shy.url, '--profile', p2, '--out', join(d2, 'c')], { cwd: root }); let err = ''; p.stderr.on('data', d => { err += d; }); p.on('close', code => res({ code, err })); });
    shy.stop();
    ok('a site that refuses headless is retried in a window off screen', l2 === 0 && h.code === 0 && /window off screen/.test(h.err), `login ${l2}, crawl ${h.code}: ${h.err.trim().split('\n').pop()}`);
  }
}

// 16. Existing results, opened read-only: a chat with a "click to load image" placeholder and a broken
// image gives 2 leads, a chat with only working images gives none, and nothing is clicked.
if (hasPw) {
  const sout = mkdtempSync(join(tmpdir(), 'samples-'));
  const sr = run(['skills/shipright-audit/scripts/samples.mjs', 'tests/fixtures/results-app/index.html', '--samples', '2', '--out', sout]);
  const sm = sr.status === 0 ? JSON.parse(readFileSync(join(sout, 'samples.json'), 'utf8')) : { leads: [], items: [], lists: [] };
  const hows = sm.leads.map(l => l.detail?.how).sort().join(',');
  ok('samples: a load-image placeholder and a broken image are 2 leads', sm.leads.length === 2 && hows === 'broken image,load button' && sm.leads.every(l => l.id.startsWith('R') && l.pages.join() === '/index.html#/c/1' && l.widths.join() === '1280,390' && existsSync(join(sout, l.shot))), sm.leads.map(l => `${l.id} ${l.what.slice(0, 50)} on ${l.pages.join()}`).join(' | ') || `exit ${sr.status} ${sr.stderr.slice(0, 200)}`);
  const working = sm.items.find(i => i.url.endsWith('#/c/2'));
  ok('samples: a page with only working images gives no lead, and image pages are opened first', !!working && working.holds.images === 2 && existsSync(join(sout, working.shots['390'])) && sm.items.length === 2 && sm.lists[0]?.items_in_list === 4, `${sm.items.map(i => i.url).join(', ')}`);
  // The crawl visits places before items, and at most 6 items of one list, so a long history cannot crowd out Settings.
  const many = createServer((req, res2) => { res2.writeHead(200, { 'content-type': 'text/html' }); res2.end(`<nav>${Array.from({ length: 14 }, (_, i) => `<a href="/c/${i + 1}">Chat ${i + 1}</a>`).join('')}<a href="/settings">Settings</a><a href="/library">Library</a></nav><h1>${req.url}</h1>`); });
  await new Promise(r2 => many.listen(0, '127.0.0.1', r2));
  const mout = mkdtempSync(join(tmpdir(), 'crawl-many-'));
  await new Promise(r2 => { const p = spawn(process.execPath, ['skills/shipright-audit/scripts/crawl.mjs', `http://127.0.0.1:${many.address().port}/`, '--out', mout], { cwd: root }); p.on('close', r2); });
  many.close();
  const mc = JSON.parse(readFileSync(join(mout, 'crawl.json'), 'utf8'));
  const paths = mc.screens.map(sc => new URL(sc.url).pathname);
  ok('crawl reaches Settings past a long list of items', paths.includes('/settings') && paths.includes('/library') && paths.filter(p => p.startsWith('/c/')).length === 6 && mc.item_lists?.[0]?.links === 14, `${paths.join(' ')}`);
}

// 17. Used as a user (only with the owner's yes). A menu switch that adds a chip to the message box:
// with --use it is a toggle-side-effect lead and every switch ends as it started; without --use nothing
// is flipped. A test message marked owner_said_yes is sent once, and its result is checked at both widths.
if (hasPw) {
  const hits = [];
  const useApp = createServer((req, res2) => { if (req.url.startsWith('/api/use')) { hits.push(decodeURIComponent(req.url.split('?')[1] || '')); res2.writeHead(204); return res2.end(); } if (req.url !== '/') { res2.writeHead(404); return res2.end(); } res2.writeHead(200, { 'content-type': 'text/html' }); res2.end(readFileSync(join(root, 'tests/fixtures/use-app/index.html'))); });
  await new Promise(r2 => useApp.listen(0, '127.0.0.1', r2));
  const useUrl = `http://127.0.0.1:${useApp.address().port}/`;
  const go = a => new Promise(res => { const p = spawn(process.execPath, a, { cwd: root }); p.on('close', code => res(code)); });
  const u0 = mkdtempSync(join(tmpdir(), 'use-off-')), u1 = mkdtempSync(join(tmpdir(), 'use-on-'));
  await go(['skills/shipright-audit/scripts/explore.mjs', useUrl, '--out', u0]);
  const off = JSON.parse(readFileSync(join(u0, 'explore.json'), 'utf8'));
  ok('without --use, no switch is flipped', hits.length === 0 && off.use.enabled === false && off.use.switches_flipped === 0 && !off.leads.some(l => l.kind === 'toggle-side-effect'), `${hits.length} flip(s) reached the app`);
  hits.length = 0;
  await go(['skills/shipright-audit/scripts/explore.mjs', useUrl, '--use', '--out', u1]);
  const on = JSON.parse(readFileSync(join(u1, 'explore.json'), 'utf8'));
  const side = on.leads.filter(l => l.kind === 'toggle-side-effect');
  const flips = on.switches.filter(t => t.flipped);
  const perSwitch = n => hits.filter(h => h === `switch=${n}`).length;
  ok('--use: a menu switch that adds a chip to the message box is a toggle-side-effect lead', side.length === 1 && /Web search/.test(side[0].what) && /next to the message box/.test(side[0].what) && side[0].detail.switches.join() === 'Web search,Images' && existsSync(join(u1, side[0].shot)), side.map(l => l.what).join(' | ') || 'no lead');
  ok('--use: every switch ends in its original state', flips.length === 4 && flips.every(t => t.restored && t.final === t.before && t.shots.before && t.shots.after) && ['Web search', 'Images', 'Notes', 'compact'].every(n => perSwitch(n) === 2) && on.use.turned_back === 4, `${flips.length} flipped, ${on.use.turned_back} turned back, ${hits.length} flips reached the app`);
  hits.length = 0;
  const wdir = mkdtempSync(join(tmpdir(), 'use-walk-')), wplan = join(wdir, 'plan.json');
  writeFileSync(wplan, JSON.stringify({ task: 'Send a test message', steps: [{ do: 'fill', field: 'Message', value: 'ShipRight test: please ignore', owner_said_yes: true }, { do: 'click', text: 'Send', owner_said_yes: true }, { do: 'expect', text: 'Here is a picture' }] }));
  const wcode = await go(['skills/shipright-audit/scripts/walk.mjs', useUrl, wplan, '--out', join(wdir, 'out')]);
  useApp.close();
  const wj = JSON.parse(readFileSync(join(wdir, 'out', 'walk.json'), 'utf8'));
  const kindsAt = wj.leads.map(l => `${l.kind}@${l.widths.join('+')}`).sort().join(' ');
  ok('an owner-approved test message is sent once and its result is checked at both widths', wcode === 0 && hits.length === 1 && wj.used_actions.length === 2 && wj.widths['390'].once_at === 1 && wj.widths['390'].broke_at === null && kindsAt === 'clipped-text@390 media-not-loaded@1280+390 unnamed-action@1280+390' && existsSync(join(wdir, 'out', '390-02-result.png')), `exit ${wcode}, ${hits.length} message(s) sent, ${kindsAt}`);
}

// 18. The owner's own rules. A folder with a design doc holding one rule the app breaks (cards 16px
// apart; they sit 28px apart) and one decision the app follows on purpose (a blunt greeting), plus a
// complaints file that must never be opened.
{
  const adir = mkdtempSync(join(tmpdir(), 'rules-')), rulesOut = join(adir, 'owner-rules.md');
  const or = run(['skills/shipright-audit/scripts/owner-rules.mjs', 'tests/fixtures/owner-rules-app', '--out', rulesOut]);
  const rules = existsSync(rulesOut) ? readFileSync(rulesOut, 'utf8') : '';
  ok('owner-rules.mjs quotes the rule and the decision with file and line', or.status === 0 && /"Cards always sit 16px apart, on every screen\." \| DESIGN\.md:5/.test(rules) && /\| decision \| "The greeting is blunt on purpose\. Keep it: "Back again\? Fine\."" \| DESIGN\.md:10/.test(rules) && /We decided against a friendlier one.*CHANGELOG\.md:5/.test(rules), or.stdout.trim().slice(0, 90));
  ok('owner-rules.mjs never opens a complaints file, and says it skipped it', /- current-complaints\.md: its name says/.test(rules) && !/too far apart|Search is slow/i.test(rules + or.stdout), 'current-complaints.md');
  // The gate, on the real owner-rules.md: the rule break is a pain with an Owner rule lens, the decision
  // sits under Owner decisions respected, and the section is required.
  const { check, samplePainMap } = await import('../skills/shipright-audit/scripts/check-stage.mjs');
  mkdirSync(join(adir, 'screens'));
  for (const f of ['screens/home-1280.png', 'screens/book-1280.png', 'screens/home-390.png']) writeFileSync(join(adir, f), '');
  const map = samplePainMap().replace('Context used: none given', 'Context used: DESIGN.md and CHANGELOG.md (owner rules); skipped current-complaints.md (may list current complaints)')
    .replace('| P01 | Rule shown late | Book step 4, screens/book-1280.png | Owners | H5 |', '| P01 | The home cards sit 28px apart | Home, screens/home-1280.png | Owners | Owner rule: "Cards always sit 16px apart, on every screen." |');
  const respected = '\n## Owner decisions respected\n| What the app does | Owner\'s words (quoted) | File and line | What it differs from |\n|---|---|---|---|\n| Greets with "Back again? Fine." | "The greeting is blunt on purpose. Keep it: "Back again? Fine."" | DESIGN.md:10 | Leaders greet warmly |\n';
  const without = check(map, adir), withIt = check(map + respected, adir);
  ok('gate: a rule break is a pain with an Owner rule lens, a kept decision is respected, the section is required', without.some(e => e.includes('Missing section "## Owner decisions respected"')) && withIt.length === 0, withIt.join(' | ') || `${without.length} problem(s) without the section, 0 with it`);
  // The fixture is what the design doc says it is: the cards sit 28px apart, and the greeting is the blunt one.
  if (hasPw) {
    const { chromium } = createRequire(join(root, 'package.json'))('playwright');
    const b = await chromium.launch(); const pg = await b.newPage({ viewport: { width: 1280, height: 800 } });
    await pg.goto('file://' + join(root, 'tests/fixtures/owner-rules-app/index.html'));
    const m = await pg.evaluate(() => { const c = [...document.querySelectorAll('.card')].map(x => x.getBoundingClientRect()); return { gap: Math.round(c[1].left - c[0].right), greeting: document.getElementById('greeting').textContent }; });
    await b.close();
    ok('owner-rules fixture breaks the spacing rule and keeps the greeting', m.gap === 28 && m.greeting === 'Back again? Fine.', `gap ${m.gap}px, greeting "${m.greeting}"`);
  }
}

// 12. The gate runs from the command line with a relative path (the Windows bug in 0.3 skipped it silently)
r = run(['skills/shipright-audit/scripts/check-stage.mjs', 'skills/shipright-audit/templates/pain-map.md']);
ok('gate runs from the command line and fails an unfilled template', r.status === 1 && /^FAIL/.test(r.stdout), `exit ${r.status}`);
// 13. version.mjs --fetch refreshes a stale saved copy of the marketplace, so the Update button works
{
  const home = mkdtempSync(join(tmpdir(), 'home-')), copy = join(home, '.claude', 'plugins', 'marketplaces', 'shipright-audit');
  const g = (args, cwd) => spawnSync('git', args, { cwd, encoding: 'utf8' });
  const head = g(['rev-parse', 'HEAD'], root).stdout.trim();
  if (head && g(['clone', '-q', root, copy]).status === 0 && g(['reset', '-q', '--hard', 'HEAD~1'], copy).status === 0) {
    const f = spawnSync(process.execPath, ['skills/shipright-audit/scripts/version.mjs', '--fetch'], { cwd: root, encoding: 'utf8', env: { ...process.env, HOME: home, USERPROFILE: home, CLAUDE_CONFIG_DIR: '' } });
    ok('version.mjs --fetch refreshes a stale saved copy', f.status === 0 && g(['rev-parse', 'HEAD'], copy).stdout.trim() === head, f.stdout.trim().slice(0, 60));
  } else ok('version.mjs --fetch refreshes a stale saved copy', true, 'SKIPPED: no git history');
}
r = run(['skills/shipright-audit/scripts/setup.mjs', '--check']);
ok('setup.mjs reports Playwright', r.status === (hasPw ? 0 : 1), r.stdout.trim());

for (const t of results) console.log(`${t.pass ? 'PASS' : 'FAIL'}  ${t.name}${t.note ? `  (${t.note})` : ''}`);
const failed = results.filter(t => !t.pass).length;
console.log(`\n${results.length - failed} of ${results.length} checks pass`);
process.exit(failed ? 1 : 0);
