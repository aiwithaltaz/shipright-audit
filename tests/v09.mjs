#!/usr/bin/env node
// The checks added in 0.9: one group per "Done when" in the 0.9 brief. tests/run.mjs runs them all.
// Run them alone:       node tests/v09.mjs
// Run some groups only: node tests/v09.mjs back tabs
// Groups: back tabs border padding layers options duplicate alarms stability update quiet
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
const runSync = (args, env = {}) => spawnSync(process.execPath, args, { cwd: root, encoding: 'utf8', env: { ...process.env, ...env } });
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
const explore = (target, extra = []) => { const o = tmp('v09-explore'); const r = runSync([S + 'explore.mjs', target, ...extra, '--out', o]); return { o, r, json: readJson(join(o, 'explore.json'), { leads: [{ kind: 'did not run', what: r.stderr.slice(0, 200), widths: [], pages: [] }], back_controls: [], controls: [] }) }; };
const visual = (target, extra = []) => { const o = tmp('v09-visual'); const r = runSync([S + 'visual.mjs', target, ...extra, '--out', o]); return { o, r, json: readJson(join(o, 'visual.json'), { leads: [{ kind: 'did not run', what: r.stderr.slice(0, 200), widths: [], pages: [] }] }) }; };
const say = leads => leads.map(l => `${l.kind} @${(l.widths || []).join('+')}: ${String(l.what).slice(0, 90)}`).join(' | ') || 'no lead';

export async function run09(ok, { hasPw, only = [] } = {}) {
  const want = g => !only.length || only.includes(g);

  // Step 1. Back goes back. Home links to Settings, and so does Reports. The Settings back arrow
  // always goes to Reports: 1 lead that names the 3 pages, with the route from Reports shown as right.
  // The same app with a back arrow that goes back (an unnamed left arrow this time) gives none.
  if (want('back') && hasPw) {
    const bad = explore('tests/fixtures/back-app/index.html'), good = explore('tests/fixtures/back-app/good.html');
    const leads = bad.json.leads.filter(l => l.kind === 'back-goes-elsewhere');
    const routes = (bad.json.back_controls[0] || { routes: [] }).routes;
    ok('back-goes-elsewhere: a back arrow that always goes to another page is 1 lead with the 3 pages',
      leads.length === 1 && /Came from \/index\.html, went to \/index\.html#\/settings, landed on \/index\.html#\/reports/.test(leads[0].what) && /From \/index\.html#\/reports it went back correctly/.test(leads[0].what)
      && leads[0].widths.join() === '1280,390' && !!leads[0].shot && existsSync(join(bad.o, leads[0].shot)) && new Set(routes.map(r => r.came_from)).size === 2,
      say(leads));
    const arrow = good.json.back_controls[0] || { routes: [] };
    ok('back-goes-elsewhere: a back arrow that goes back gives none, and an unnamed left arrow counts as a back control',
      !good.json.leads.some(l => l.kind === 'back-goes-elsewhere') && arrow.how === 'arrow' && arrow.routes.length >= 2 && arrow.routes.every(r => r.result === 'went back'),
      `${arrow.how || 'not found'}: ${arrow.routes.map(r => r.result).join(', ')}`);
  }

  // Step 2. Sibling tabs must not move things. 3 tabs, where one adds a back arrow that pushes the
  // content down 40px: 1 tab-shift lead and 1 tab-chrome-differs lead (which says a sidebar is in view).
  // 3 identical tabs give none. Sub-pages of one section count as tabs too: one without a title is a lead.
  if (want('tabs') && hasPw) {
    const TAB = ['tab-shift', 'tab-chrome-differs'];
    const bad = explore('tests/fixtures/tabs-app/index.html'), same = explore('tests/fixtures/tabs-app/same.html');
    const leads = bad.json.leads.filter(l => TAB.includes(l.kind));
    const shift = leads.filter(l => l.kind === 'tab-shift'), chrome = leads.filter(l => l.kind === 'tab-chrome-differs');
    ok('tabs: one tab with a back arrow that pushes the content down 40px is 1 tab-shift and 1 tab-chrome-differs lead',
      shift.length === 1 && chrome.length === 1 && /on "Team" \(40px lower\)/.test(shift[0].what) && /a back control shows on "Team" but not on "General", "Billing"/.test(chrome[0].what) && /A sidebar is in view/.test(chrome[0].what)
      && shift[0].widths.join() === '1280,390' && [shift[0], chrome[0]].every(l => l.shot && existsSync(join(bad.o, l.shot))), say(leads));
    ok('tabs: 3 identical tabs give no lead, and a tab that gets selected is not a dead control',
      !same.json.leads.some(l => TAB.includes(l.kind)) && (same.json.tab_groups || []).length === 2 && !same.json.leads.some(l => l.kind === 'dead-control' && /Billing|Team/.test(l.what)), say(same.json.leads));
    const sub = explore('tests/fixtures/tabs-app/pages.html', ['--routes', '#/account/profile,#/account/security,#/account/plan', '--widths', '1280']);
    const subLeads = sub.json.leads.filter(l => TAB.includes(l.kind));
    ok('tabs: sub-pages of one section are compared too, and one with no page title is a lead',
      subLeads.some(l => l.kind === 'tab-chrome-differs' && /a page title shows on "Profile", "Security" but not on "Plan"/.test(l.what)) && subLeads.filter(l => l.kind === 'tab-chrome-differs').length === 1, say(subLeads));
  }

  // Step 3. Component borders need contrast. A dark page with an input, a dropdown and an outline
  // button bordered #333533 on #2A2C29: 1 lead that reports the colors. The same input with a
  // contrasting fill gives none. A light page with ordinary light gray borders gives none either.
  if (want('border') && hasPw) {
    const of = page => visual(`tests/fixtures/craft-app/${page}.html`, ['--no-click']);
    const dark = of('border'), filled = of('border-filled'), light = of('border-light');
    const leads = dark.json.leads.filter(l => l.kind === 'faint-border');
    ok('faint-border: an input bordered #333533 on #2A2C29 is 1 lead that reports the colors',
      leads.length === 1 && /the border of the input "Client name" is #333533 on #2A2C29, 1\.1:1/.test(leads[0].what) && /3 controls \(input, dropdown, button\)/.test(leads[0].what) && leads[0].widths.join() === '1280,390' && !!leads[0].shot && existsSync(join(dark.o, leads[0].shot)), say(leads));
    ok('faint-border: the same input with a contrasting fill gives none, and light gray borders on white give none',
      !filled.json.leads.some(l => l.kind === 'faint-border') && !light.json.leads.some(l => l.kind === 'faint-border'), say([...filled.json.leads, ...light.json.leads]));
  }

  // Step 4. Tight padding. 4 cards at 16px padding and 1 at 4px: 1 lead that shows the odd one next
  // to a normal one. 5 cards at 16px give none.
  if (want('padding') && hasPw) {
    const odd = visual('tests/fixtures/craft-app/padding.html', ['--no-click']), same = visual('tests/fixtures/craft-app/padding-same.html', ['--no-click']);
    const leads = odd.json.leads.filter(l => l.kind === 'tight-padding');
    ok('tight-padding: 4 cards at 16px and 1 at 4px is 1 lead, with the odd card and a normal one in the crop',
      leads.length === 1 && /One card has much tighter padding than the others like it: 4px, where the 4 others use 16px/.test(leads[0].what) && /Finance/.test(leads[0].what) && leads[0].widths.join() === '1280,390' && !!leads[0].shot && existsSync(join(odd.o, leads[0].shot)), say(leads));
    ok('tight-padding: 5 cards at 16px give none', same.json.leads.length === 0, say(same.json.leads));
  }

  // Step 5. Sticky and fixed layers need a solid background. A long page with a transparent sticky top
  // bar and a transparent fixed message box: 2 leads, each with a screenshot taken while the content
  // is under the layer. The same page with solid backgrounds gives none.
  if (want('layers') && hasPw) {
    const bare = visual('tests/fixtures/layers-app/index.html', ['--no-click']), solid = visual('tests/fixtures/layers-app/solid.html', ['--no-click']);
    const leads = bare.json.leads.filter(l => l.kind === 'see-through-layer');
    const by = w => leads.find(l => l.detail.layer === w) || { what: '', widths: [] };
    ok('see-through-layer: a transparent sticky top bar and a transparent fixed message box are 2 leads',
      leads.length === 2 && /prints over it/.test(by('message box').what) && /has no background/.test(by('top bar').what) && leads.every(l => l.widths.join() === '1280,390' && l.shot && existsSync(join(bare.o, l.shot)) && l.detail.scrolled_to > 0), say(leads));
    ok('see-through-layer: the same page with solid backgrounds gives none', solid.json.leads.length === 0, say(solid.json.leads));
  }

  // Step 6. Options must not vanish after use. A theme switcher showing System, Light and Dark that
  // drops System after one click: 1 lead. One that keeps all 3 gives none and ends as it started.
  // The same holds for a button that steps through the themes, and for a menu of themes.
  // Signed in, nothing is picked without --use.
  if (want('options') && hasPw) {
    const run = async (page, extra = []) => {
      const app = await serveFixture(`tests/fixtures/options-app/${page}.html`);
      const o = tmp('v09-options');
      const r = await runNode([S + 'explore.mjs', app.url, '--widths', '1280', ...extra, '--out', o]);
      app.stop();
      const j = readJson(join(o, 'explore.json'), { leads: [{ kind: 'did not run', what: r.err.slice(0, 200), widths: [] }], options: [], use: {} });
      return { o, hits: app.hits, json: j, leads: j.leads.filter(l => /^option-|did not run/.test(l.kind)), row: (j.options || [])[0] || { picks: [], vanished: [] } };
    };
    const drops = await run('index'), keeps = await run('keeps'), cycle = await run('cycle'), menu = await run('menu');
    ok('option-vanished: a theme switcher that drops System after one click is 1 lead',
      drops.leads.length === 1 && drops.leads[0].kind === 'option-vanished' && /it offered System, Light, Dark\. After picking "Light" it only offers Light, Dark, so "System" can no longer be picked/.test(drops.leads[0].what)
      && /only a reload put it back/.test(drops.leads[0].what) && !!drops.leads[0].shot && existsSync(join(drops.o, drops.leads[0].shot)), say(drops.leads));
    ok('option-vanished: a theme switcher that keeps all 3 options gives none, and ends on the option it started on',
      keeps.leads.length === 0 && keeps.row.picks.length === 3 && keeps.row.restored === true && keeps.hits[keeps.hits.length - 1] === 'theme=system', `${say(keeps.leads)}; picks: ${keeps.hits.join(' ')}`);
    ok('option-vanished: a button that steps through the themes and never comes back to System is 1 lead, a menu that keeps all 3 gives none',
      cycle.leads.length === 1 && cycle.row.form === 'cycle' && /"Theme: System" can no longer be picked/.test(cycle.leads[0].what) && menu.leads.length === 0 && menu.row.form === 'menu' && menu.row.picks.length === 3 && menu.row.restored === true,
      `cycle: ${say(cycle.leads)}; menu: ${say(menu.leads)} (${menu.row.form}, ${menu.row.picks.length} picks)`);
    // Signed in (a session file): no option is picked without the owner's yes. With --use each pick is counted.
    const sess = join(tmp('v09-sess'), 'session.json');
    writeFileSync(sess, JSON.stringify({ cookies: [{ name: 'sr_test', value: '1', domain: '127.0.0.1', path: '/', expires: -1, httpOnly: false, secure: false, sameSite: 'Lax' }], origins: [] }));
    const held = await run('keeps', ['--session', sess]), used = await run('keeps', ['--session', sess, '--use']);
    ok('signed in, options are picked only with --use, and each pick counts as an action',
      held.hits.length === 0 && (held.json.options || []).length === 0 && held.json.use.option_picks === 0 && used.hits.length === 3 && used.json.use.option_picks === 3 && used.row.restored === true,
      `without --use: ${held.hits.length} pick(s); with --use: ${used.hits.length} pick(s), ${used.json.use.option_picks} counted`);
  }

  // Step 7. Duplicate controls under different names. A "Model: Auto" button in the message box and an
  // "Auto (free)" button in the top bar open lists with the same models (5 of 6 options in common):
  // 1 lead. Two buttons that open different menus give none. The same menu on every row of a table
  // is not a duplicate either.
  if (want('duplicate') && hasPw) {
    const same = explore('tests/fixtures/dup-app/index.html', ['--widths', '1280']), differ = explore('tests/fixtures/dup-app/differ.html', ['--widths', '1280']);
    const leads = same.json.leads.filter(l => l.kind === 'duplicate-on-screen');
    ok('duplicate-on-screen: two model pickers with different names that open the same list are 1 lead',
      leads.length === 1 && /^Two controls do the same job here: "Auto \(free\)" and "Model: Auto" both open a menu with the same options/.test(leads[0].what) && leads[0].detail.options_in_common === 5 && !!leads[0].shot && existsSync(join(same.o, leads[0].shot)), say(leads));
    const opened = differ.json.controls.filter(c => /^opened menu/.test(c.result || '')).length;
    ok('duplicate-on-screen: two buttons that open different menus give none, and row menus are not duplicates',
      !differ.json.leads.some(l => l.kind === 'duplicate-on-screen') && opened === 5, `${say(differ.json.leads)}; ${opened} menus opened`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  let hasPw = false;
  try { createRequire(join(root, 'package.json'))('playwright'); hasPw = true; } catch {}
  const results = [];
  await run09((name, pass, note = '') => results.push({ name, pass, note }), { hasPw, only: process.argv.slice(2) });
  for (const t of results) console.log(`${t.pass ? 'PASS' : 'FAIL'}  ${t.name}${t.note ? `  (${t.note})` : ''}`);
  const failed = results.filter(t => !t.pass).length;
  console.log(`\n${results.length - failed} of ${results.length} checks pass${hasPw ? '' : ' (Playwright not installed: browser checks skipped)'}`);
  process.exit(failed ? 1 : 0);
}
