#!/usr/bin/env node
// The checks added in 0.8: one group per "Done when" in the 0.8 brief. tests/run.mjs runs them all.
// Run them alone:       node tests/v08.mjs
// Run some groups only: node tests/v08.mjs use signin   (groups: use signin buttons rules checks marker lifecycle create)
import { readFileSync, existsSync, mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const S = 'skills/shipright-audit/scripts/';
const tmp = name => mkdtempSync(join(tmpdir(), `${name}-`));
const readJson = (file, fallback = {}) => { try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return fallback; } };
const runSync = args => spawnSync(process.execPath, args, { cwd: root, encoding: 'utf8' });
const runNode = (args, env = {}) => new Promise(res => {
  const p = spawn(process.execPath, args, { cwd: root, env: { ...process.env, ...env } });
  let out = '', err = '';
  p.stdout.on('data', d => { out += d; }); p.stderr.on('data', d => { err += d; });
  p.on('close', code => res({ code, out, err }));
});
// Serve one fixture page over http (so the scripts treat it as a live app) and record every call to /api/.
async function serveFixture(file) {
  const hits = [];
  const server = createServer((req, res) => {
    if (req.url.startsWith('/api/')) { hits.push(decodeURIComponent(req.url.slice(5))); res.writeHead(204); return res.end(); }
    if (req.url.split('?')[0] !== '/') { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': 'text/html' }); res.end(readFileSync(join(root, file)));
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  return { url: `http://127.0.0.1:${server.address().port}/`, hits, stop: () => server.close() };
}

export async function run08(ok, { hasPw, only = [] } = {}) {
  const want = g => !only.length || only.includes(g);

  // Step 1. The use-it answer is waited for, and "yes with limits" is kept: with a limits file, --use
  // holds the switch whose name matches a held action and flips the rest. A walk holds an owner-approved
  // step the same way. (The gate half of this "Done when" is in check-stage.mjs --self-test.)
  if (want('use') && hasPw) {
    const app = await serveFixture('tests/fixtures/use-app/index.html');
    const audit = tmp('limits');
    writeFileSync(join(audit, 'use-limits.json'), JSON.stringify({ answer: 'yes with limits', owner_words: 'Yes, but leave the image tools off.', allowed: ['flip switches and turn them back'], held: [{ action: 'turn on the image tools', match: ['images'] }] }));
    await runNode([S + 'explore.mjs', app.url, '--use', '--out', join(audit, 'explore')]);
    const ex = readJson(join(audit, 'explore', 'explore.json'), { switches: [], use: {} });
    const images = ex.switches.find(t => t.switch === 'Images') || {};
    const flipped = ex.switches.filter(t => t.flipped).map(t => t.switch).sort().join(',');
    ok('--use with a limits file holds the switch that matches a held action, and flips the rest',
      /^held: the owner ruled this out \("turn on the image tools"\)/.test(images.skipped || '') && images.flipped === false && !app.hits.includes('use?switch=Images')
      && flipped === 'Compact view,Notes,Web search' && ex.use.limits?.held_switches?.[0]?.switch === 'Images' && ex.use.turned_back === 3,
      `Images: ${images.skipped || 'flipped'}; flipped: ${flipped}`);
    app.hits.length = 0;
    writeFileSync(join(audit, 'use-limits.json'), JSON.stringify({ answer: 'yes with limits', owner_words: 'Yes, flip the switches, but send nothing.', held: [{ action: 'send a message', match: ['send'] }] }));
    writeFileSync(join(audit, 'plan.json'), JSON.stringify({ task: 'Send a test message', steps: [{ do: 'fill', field: 'Message', value: 'ShipRight test: please ignore', owner_said_yes: true }, { do: 'click', text: 'Send', owner_said_yes: true }] }));
    const w = await runNode([S + 'walk.mjs', app.url, join(audit, 'plan.json'), '--out', join(audit, 'walks', 'send')]);
    app.stop();
    const wj = readJson(join(audit, 'walks', 'send', 'walk.json'), { widths: { 1280: { steps: [] } } });
    const step = wj.widths['1280'].steps.find(x => x.n === 2) || {};
    ok('a walk holds an owner-approved step that the owner\'s limits rule out',
      w.code === 0 && wj.widths['1280'].held_at === 2 && step.held_by === 'send a message' && /the owner ruled this out/.test(step.error || '') && !app.hits.some(h => h.startsWith('use?message')),
      `exit ${w.code}, held at ${wj.widths['1280'].held_at}, ${app.hits.length} call(s) reached the app`);
  }

  // Step 2. One file says how to sign in. The public page of this app never links to /app, which only
  // opens after sign-in. login.mjs --audit writes signin.json with where the app landed, and the crawl
  // gets into /app with --audit alone: no --profile, no --session.
  if (want('signin') && hasPw) {
    const { startLandingApp } = await import('./fixtures/landing-app/server.mjs');
    const app = await startLandingApp();
    const env = { SHIPRIGHT_NO_HEADED: '1' };
    const audit = tmp('signin-audit'), profile = join(tmp('signin-profile'), 'p');
    const li = await runNode([S + 'login.mjs', `${app.url}login?auto`, '--headless', '--timeout', '20', '--audit', audit, '--profile', profile], env);
    const note = readJson(join(audit, 'signin.json'), null);
    ok('login.mjs --audit writes signin.json: profile, browser, session file and where the app landed',
      li.code === 0 && !!note && note.profile === profile && !!note.channel && note.session === join(audit, '.session.json') && existsSync(note.session) && note.landed_url === `${app.url}app`,
      note ? `landed on ${note.landed_url}` : `exit ${li.code}: ${li.err.trim().split('\n').pop()}`);
    const cr = await runNode([S + 'crawl.mjs', app.url, '--audit', audit], env);
    const cj = readJson(join(audit, 'screens', 'crawl.json'), { screens: [] });
    const paths = cj.screens.map(sc => new URL(sc.url).pathname);
    ok('crawl --audit alone gets into /app, which the public page never links to',
      cr.code === 0 && ['/', '/app', '/app/projects', '/app/settings'].every(p => paths.includes(p)) && /sign-in profile/.test(cj.signed_in_with || '') && cj.landed_url === `${app.url}app` && paths.slice(1, 4).every(p => p.startsWith('/app')),
      `exit ${cr.code}: ${paths.join(' ')}`);
    // Every other script takes --audit too, with no other sign-in flag, and reads the crawl from the audit folder.
    writeFileSync(join(audit, 'plan.json'), JSON.stringify({ task: 'Open projects', steps: [{ do: 'goto', to: '/app' }, { do: 'click', text: 'Projects' }, { do: 'expect', text: 'Garden plan' }] }));
    const bad = [];
    for (const [n, a, file] of [
      ['explore', [S + 'explore.mjs', app.url, '--audit', audit], 'explore/explore.json'],
      ['visual', [S + 'visual.mjs', app.url, '--audit', audit, '--no-click'], 'visual/visual.json'],
      ['samples', [S + 'samples.mjs', app.url, '--audit', audit], 'samples/samples.json'],
      ['consistency', [S + 'consistency.mjs', app.url, '--audit', audit], 'consistency/consistency.json'],
      ['walk', [S + 'walk.mjs', app.url, join(audit, 'plan.json'), '--audit', audit], 'walks/open-projects/walk.json'],
    ]) {
      const r = await runNode(a, env);
      if (r.code !== 0 || !/signed in with the sign-in profile/.test(r.err) || !existsSync(join(audit, file))) bad.push(`${n}: exit ${r.code} ${r.err.trim().split('\n').pop()}`);
    }
    const vis = readJson(join(audit, 'visual', 'visual.json'), { pages: [] });
    ok('explore, visual, samples, consistency and walk are signed in with --audit and no other sign-in flag',
      bad.length === 0 && vis.pages.some(p => p.url.endsWith('/app/settings')), bad.join(' | ') || `5 scripts, ${vis.pages.length} pages checked`);
    const so = await runNode([S + 'crawl.mjs', app.url, '--audit', audit, '--signed-out'], env);
    const sj = readJson(join(audit, 'screens-signed-out', 'crawl.json'), { screens: [] });
    const outPaths = sj.screens.map(sc => new URL(sc.url).pathname);
    ok('crawl --audit --signed-out ignores the sign-in and writes to screens-signed-out',
      so.code === 0 && sj.signed_in_session === false && outPaths.includes('/login') && !outPaths.some(p => p.startsWith('/app')), `exit ${so.code}: ${outPaths.join(' ')}`);
    // A public page with a "Sign in" link is not a signed-in page: nothing is saved until the owner signs in.
    const audit2 = tmp('signin-public');
    const pub = await runNode([S + 'login.mjs', app.url, '--headless', '--timeout', '6', '--audit', audit2, '--profile', join(tmp('signin-profile'), 'p')], env);
    app.stop();
    ok('login.mjs does not save a sign-in from a public page that still shows "Sign in"', pub.code === 1 && !existsSync(join(audit2, 'signin.json')) && !existsSync(join(audit2, '.session.json')), `exit ${pub.code}`);
  }

  // Step 3. Cards that open through buttons, not links. One "View" opens a dialog, one "Open" shows a
  // panel, one "Review" does nothing: 2 opened items, 1 "nothing opened" lead, and Edit is never clicked.
  if (want('buttons') && hasPw) {
    const app = await serveFixture('tests/fixtures/button-cards-app/index.html');
    const out = tmp('buttons');
    const r = await runNode([S + 'samples.mjs', app.url, '--out', out]);
    app.stop();
    const sm = readJson(join(out, 'samples.json'), { items: [], leads: [], lists: [] });
    const via = sm.items.filter(i => i.via_button);
    const opened = via.filter(i => /^a /.test(i.opened?.['1280'] || ''));
    const nothing = sm.leads.filter(l => l.kind === 'nothing-opened');
    ok('samples opens button-only cards: 2 opened items and 1 "nothing opened" lead',
      r.code === 0 && via.length === 3 && opened.length === 2 && opened.map(i => i.opened['1280']).sort().join() === 'a dialog,a panel' && opened.every(i => i.opened['390'] === i.opened['1280'] && existsSync(join(out, i.shots['1280'])) && existsSync(join(out, i.shots['390'])))
      && nothing.length === 1 && sm.leads.length === 1 && /^R\d+$/.test(nothing[0].id) && /"Review" on "Budget review" opened nothing/.test(nothing[0].what) && nothing[0].widths.join() === '1280,390' && sm.lists[0]?.by === 'buttons',
      `exit ${r.code}: ${via.map(i => `${i.via_button}: ${i.opened?.['1280']}`).join(', ')}; leads: ${sm.leads.map(l => l.kind).join(', ') || 'none'}`);
    ok('samples never clicks Edit, and presses each read-only button once per width',
      !app.hits.includes('edit') && ['view', 'open', 'review'].every(b => app.hits.filter(h => h === b).length === 2), app.hits.join(' ') || 'no clicks reached the app');
    // The existing fixture, whose items are links, is opened by address as before: no button is pressed.
    const lo = tmp('buttons-links');
    runSync([S + 'samples.mjs', 'tests/fixtures/results-app/index.html', '--samples', '2', '--out', lo]);
    const lk = readJson(join(lo, 'samples.json'), { items: [{ via_button: 'x' }] });
    ok('samples still opens linked items by address', lk.items.length === 2 && lk.items.every(i => !i.via_button), `${lk.items.length} items`);
  }

  // Step 4. ShipRight's own files are never read as the app owner's rules, and a folder that is not
  // about the audited app gives no rules.
  if (want('rules')) {
    const or = (...a) => runSync([S + 'owner-rules.mjs', ...a]);
    const selfOut = join(tmp('rules-self'), 'owner-rules.md');
    const self = or('.', '--out', selfOut);
    ok('owner-rules on the ShipRight repo itself extracts 0 rules', self.status === 0 && !existsSync(selfOut) && /No rules for this app in this folder/.test(self.stdout) && /ShipRight's own source/.test(self.stdout), self.stdout.trim().slice(0, 80));
    const fixOut = join(tmp('rules-fix'), 'owner-rules.md');
    const fix = or('tests/fixtures/owner-rules-app', '--out', fixOut);
    const fixText = existsSync(fixOut) ? readFileSync(fixOut, 'utf8') : '';
    ok('the owner-rules fixture still extracts its rules', fix.status === 0 && /"Cards always sit 16px apart, on every screen\." \| DESIGN\.md:5/.test(fixText) && /4 quote\(s\) from 2 file\(s\)/.test(fix.stdout), fix.stdout.trim().slice(0, 60));
    // A work folder that holds the app's own design doc next to a copy of ShipRight: only the app's rules are quoted.
    const work = tmp('rules-work');
    const put = (rel, text) => { mkdirSync(dirname(join(work, rel)), { recursive: true }); writeFileSync(join(work, rel), text); };
    put('DESIGN.md', '# Design\n\n- Buttons always use 8px corners.\n');
    put('shipright-audit/package.json', JSON.stringify({ name: 'shipright-audit' }));
    put('shipright-audit/DESIGN.md', '# Design\n\n- Cards must always sit 40px apart.\n');
    put('shipright-audit/docs/guide.md', '- Never use more than one accent color.\n');
    put('skills/shipright-audit/references/taste.md', '- Headings must always use one font.\n');
    put('tests/fixtures/sample/DESIGN.md', '- Icons must always be 20px.\n');
    put('tools/.claude-plugin/plugin.json', JSON.stringify({ name: 'shipright-audit' }));
    put('tools/docs/style-guide.md', '- Menus must always have square corners.\n');
    const workOut = join(tmp('rules-work-out'), 'owner-rules.md');
    const wr = or(work, '--out', workOut);
    const workText = existsSync(workOut) ? readFileSync(workOut, 'utf8') : '';
    ok('owner-rules skips ShipRight\'s own files inside a work folder and keeps the app\'s rules',
      wr.status === 0 && /Buttons always use 8px corners/.test(workText) && !/40px apart|one accent color|one font|20px|square corners/.test(workText) && /1 quote\(s\) from 1 file\(s\)/.test(wr.stdout)
      && ['shipright-audit', 'skills/shipright-audit', 'tests/fixtures', 'tools'].every(d => workText.includes(`- ${d}: part of ShipRight Audit itself`)), wr.stdout.trim().slice(0, 100));
    // A folder that is not about the audited app: nothing is quoted. Once a file names the app, its rules count.
    const other = tmp('rules-other');
    writeFileSync(join(other, 'DESIGN.md'), '# Design\n\n- Buttons always use 8px corners.\n');
    const otherOut = join(tmp('rules-other-out'), 'owner-rules.md');
    const un = or(other, '--app', 'https://app.plantpal.example/dashboard', '--out', otherOut);
    const unrelated = un.status === 0 && !existsSync(otherOut) && /No rules for this app in this folder/.test(un.stdout);
    writeFileSync(join(other, 'README.md'), '# PlantPal\n\nA watering planner.\n');
    const rel = or(other, '--app', 'https://app.plantpal.example/dashboard', '--out', otherOut);
    ok('owner-rules reads nothing from a folder that never mentions the app, and reads it once it does',
      unrelated && rel.status === 0 && existsSync(otherOut) && /Buttons always use 8px corners/.test(readFileSync(otherOut, 'utf8')), `${un.stdout.trim().slice(0, 50)} / ${rel.stdout.trim().slice(0, 40)}`);
  }

  // Step 5. Five new page checks. One fixture page per check triggers it exactly once, a clean page
  // that holds the look-alikes triggers none, and every existing fixture and benchmark app stays at 0
  // new leads, except one lead that is real: a benchmark app's Reports page shows lorem ipsum, and its
  // answer key lists that as a planted pain.
  if (want('checks') && hasPw) {
    const NEW = ['template-text', 'faint-icon', 'overflow-box', 'duplicate-on-screen', 'stacked-controls'];
    const visual = (target, extra = []) => { const o = tmp('checks'); runSync([S + 'visual.mjs', target, ...extra, '--no-click', '--out', o]); return { o, leads: readJson(join(o, 'visual.json'), { leads: [{ kind: 'did not run', widths: [] }] }).leads }; };
    const pages = [['template', 'template-text', /\[verb\] your \{noun\}/], ['faint-icon', 'faint-icon', /3 icons are hard to see: contrast 1\.\d:1/], ['overflow', 'overflow-box', /sticks out of its box by \d+px/],
      ['duplicate', 'duplicate-on-screen', /The same text shows twice/], ['duplicate-nav', 'duplicate-on-screen', /"Calendar" is on this screen twice: in the "Main" side navigation and in the "Project views" tabs/], ['stacked', 'stacked-controls', /Could these be one row\?/]];
    for (const [page, kind, words] of pages) {
      const { o, leads } = visual(`tests/fixtures/checks-app/${page}.html`);
      const mine = leads.filter(l => NEW.includes(l.kind));
      ok(`${kind}: the ${page} fixture page triggers it exactly once, with a crop`, mine.length === 1 && mine[0].kind === kind && words.test(mine[0].what) && mine[0].widths.includes(1280) && !!mine[0].shot && existsSync(join(o, mine[0].shot)),
        mine.map(l => `${l.kind} @${l.widths.join('+')}: ${l.what.slice(0, 70)}`).join(' | ') || 'no lead');
    }
    const clean = visual('tests/fixtures/checks-app/clean.html').leads.filter(l => NEW.includes(l.kind));
    ok('the clean fixture page triggers none of the 5 new checks', clean.length === 0, clean.map(l => `${l.kind}: ${l.what.slice(0, 60)}`).join(' | ') || 'no leads');
    const loud = [];
    let real = 0;
    const sweep = [...['mini-app', 'visual-app', 'explore-app', 'gated-app', 'phone-app', 'owner-rules-app', 'drift-app', 'shift-app', 'use-app', 'results-app', 'button-cards-app'].map(f => [f, `tests/fixtures/${f}/index.html`, []]),
      ['results-app items', 'tests/fixtures/results-app/index.html', ['--routes', '#/c/1,#/c/2,#/c/3']],
      ['benchmark s1', 'benchmarks/cases/s1-pawsh-grooming/app/index.html', ['--routes', '#/services,#/book,#/bookings,#/bookings/past,#/contact,#/does-not-exist']],
      ['benchmark s2', 'benchmarks/cases/s2-harvest-volunteers/app/index.html', ['--routes', '#/dashboard,#/shifts,#/shifts/s4,#/volunteers,#/settings,#/reports']],
      ['benchmark s3', 'benchmarks/cases/s3-northwind-maintenance/app/index.html', ['--routes', '#/requests,#/urgent,#/properties,#/vendors']],
      ['benchmark c7', 'benchmarks/cases/c7-ivc-app/app/index.html', []]];
    for (const [name, target, extra] of sweep) {
      for (const l of visual(target, extra).leads.filter(x => NEW.includes(x.kind))) {
        if (name === 'benchmark s2' && l.kind === 'template-text' && /lorem ipsum/i.test(l.what) && l.pages.join() === '/index.html#/reports') real++;
        else loud.push(`${name}: ${l.kind} ${l.what.slice(0, 60)}`);
      }
    }
    ok('the 5 new checks add 0 false alarms to the existing fixtures and benchmark apps', loud.length === 0 && real === 1, loud.join(' | ') || `${sweep.length} apps, 1 real lead (lorem ipsum on a benchmark's Reports page, in its answer key)`);
  }

  // Step 6. A marker you can set should be filterable. A list with star buttons and no "Starred" filter
  // gives 1 lead. The same list with a "Favorites" tab gives none. Nothing is clicked to find out.
  if (want('marker') && hasPw) {
    const explore = async page => {
      const app = await serveFixture(`tests/fixtures/marker-app/${page}`);
      const o = tmp('marker');
      await runNode([S + 'explore.mjs', app.url, '--out', o]);
      app.stop();
      return { o, hits: app.hits, leads: readJson(join(o, 'explore.json'), { leads: [{ kind: 'did not run' }] }).leads.filter(l => l.kind === 'marker-no-filter' || l.kind === 'did not run') };
    };
    const bare = await explore('index.html'), tabbed = await explore('with-filter.html');
    ok('marker-no-filter: star buttons with no "Starred" filter give 1 lead, and no star is clicked',
      bare.leads.length === 1 && /^You can star items but not see only starred items\./.test(bare.leads[0].what) && bare.leads[0].detail.items === 4 && !!bare.leads[0].shot && existsSync(join(bare.o, bare.leads[0].shot)) && bare.hits.length === 0,
      bare.leads.map(l => l.what.slice(0, 70)).join(' | ') || 'no lead');
    ok('marker-no-filter: the same list with a "Favorites" tab gives none', tabbed.leads.length === 0 && tabbed.hits.length === 0, tabbed.leads.map(l => l.what.slice(0, 70)).join(' | ') || 'no lead');
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  let hasPw = false;
  try { createRequire(join(root, 'package.json'))('playwright'); hasPw = true; } catch {}
  const results = [];
  await run08((name, pass, note = '') => results.push({ name, pass, note }), { hasPw, only: process.argv.slice(2) });
  for (const t of results) console.log(`${t.pass ? 'PASS' : 'FAIL'}  ${t.name}${t.note ? `  (${t.note})` : ''}`);
  const failed = results.filter(t => !t.pass).length;
  console.log(`\n${results.length - failed} of ${results.length} checks pass${hasPw ? '' : ' (Playwright not installed: browser checks skipped)'}`);
  process.exit(failed ? 1 : 0);
}
