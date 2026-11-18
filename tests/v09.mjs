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

  // Step 8. Three false alarms to stop.
  // (a) Floating labels are labels: a sign-in form whose labels move above the field and stay in view
  //     while typing gives no unlabeled-field lead. Real missing labels are still found: labels that go
  //     away once something is typed, and fields with only a hint inside the box. On a live app only
  //     sign-in fields are typed into, 1 character, and nothing is ever submitted.
  // (b) A rail that opens on hover counts as labeled: no no-tooltip leads. The same rail without the
  //     hover still gives them.
  if (want('alarms') && hasPw) {
    const run = async page => {
      const app = await serveFixture(`tests/fixtures/labels-app/${page}.html`);
      const o = tmp('v09-labels');
      const r = await runNode([S + 'explore.mjs', app.url, '--widths', '1280', '--out', o]);
      app.stop();
      const j = readJson(join(o, 'explore.json'), { leads: [{ kind: 'did not run', what: r.err.slice(0, 200), widths: [] }], fields: [] });
      return { hits: app.hits, fields: j.fields || [], leads: j.leads.filter(l => /^unlabeled-field|did not run/.test(l.kind)) };
    };
    const floating = await run('index'), vanishing = await run('vanishing'), hint = await run('placeholder'), profile = await run('profile');
    ok('floating labels are labels: a sign-in form with floating labels gives no unlabeled-field lead',
      floating.leads.length === 0 && floating.fields.length === 2 && floating.fields.every(f => f.typed && /^a floating label: .* stays in view while typing$/.test(f.label || '')), `${say(floating.leads)}; ${floating.fields.map(f => f.label).join(' | ')}`);
    ok('real missing labels are still found: a label that goes away while typing, and fields with only a hint in the box',
      vanishing.leads.length === 1 && /2 fields have no visible label: "Email address", "Password"\. "Email address" goes away once something is typed/.test(vanishing.leads[0].what)
      && hint.leads.length === 1 && /Only a hint inside the box/.test(hint.leads[0].what), `${say(vanishing.leads)} / ${say(hint.leads)}`);
    const typedOnly = h => h.every(x => /^typed=(email|password):[01]$/.test(x));
    ok('on a live app only sign-in fields are typed into, 1 character at most, and nothing is submitted',
      floating.hits.length > 0 && [floating, vanishing, hint].every(x => typedOnly(x.hits)) && profile.hits.length === 0 && profile.leads.length === 1 && profile.fields.every(f => !f.typed),
      `sign-in: ${floating.hits.join(' ')}; profile form: ${profile.hits.length} call(s), ${say(profile.leads)}`);
    const rail = explore('tests/fixtures/rail-app/index.html', ['--widths', '1280']), bare = explore('tests/fixtures/rail-app/bare.html', ['--widths', '1280']);
    const tips = j => j.leads.filter(l => l.kind === 'no-tooltip');
    ok('a rail that opens on hover counts as labeled: no no-tooltip leads',
      tips(rail.json).length === 0 && rail.json.controls.filter(c => c.icon_only).length === 3 && rail.json.controls.filter(c => c.icon_only).every(c => /^label shown on hover/.test(c.tooltip || '')),
      `${say(tips(rail.json))}; ${rail.json.controls.filter(c => c.icon_only).length} icon-only control(s): ${rail.json.controls.map(c => `${c.control}${c.icon_only ? '' : ' (seen with words)'}: ${c.tooltip || 'no tooltip'}`).join(' | ')}`);
    ok('the same rail with no labels on hover still gives 3 no-tooltip leads', tips(bare.json).length === 3, say(tips(bare.json)));
  }

  // Step 9. Stability fixes.
  if (want('stability') && hasPw) {
    // (1) Signed out mid-run. This app swaps its sign-in token on every refresh, and answers the
    // refresh slowly (250ms), like a real server. A script that loads the next page before the answer
    // is back loses the new token and is signed out for good: that is what happened in 0.8. Crawl,
    // explore, samples and visual run back to back on one profile, and no refresh answer may be lost.
    // SHIPRIGHT_TEST_ROUNDS=3 runs the four scripts 3 times in a row on the same profile.
    const { startRotatingApp } = await import('./fixtures/rotating-app/server.mjs');
    const app = await startRotatingApp({ refreshDelay: 250 });
    const env = { SHIPRIGHT_NO_HEADED: '1' };
    const audit = tmp('v09-b2b'), prof = join(audit, 'profile');
    const li = await runNode([S + 'login.mjs', `${app.url}?auto`, '--headless', '--timeout', '20', '--audit', audit, '--profile', prof], env);
    const rounds = Math.max(1, Number(process.env.SHIPRIGHT_TEST_ROUNDS || 1));
    const bad = [];
    for (let round = 1; round <= rounds; round++) {
      for (const [n, a] of [['crawl', [S + 'crawl.mjs', app.url, '--audit', audit]], ['explore', [S + 'explore.mjs', app.url, '--audit', audit, '--widths', '1280']], ['samples', [S + 'samples.mjs', app.url, '--audit', audit, '--widths', '1280']], ['visual', [S + 'visual.mjs', app.url, '--audit', audit, '--widths', '1280']]]) {
        const r = await runNode(a, env);
        if (r.code !== 0 || !/signed in with the sign-in profile/.test(r.err) || /signed us out/.test(r.err)) bad.push(`round ${round} ${n}: exit ${r.code} ${r.err.trim().split('\n').pop().slice(0, 120)}`);
      }
    }
    const sm = readJson(join(audit, 'samples', 'samples.json'), { items: [] });
    ok(`crawl, explore, samples and visual stay signed in back to back on one profile with a slow token refresh${rounds > 1 ? ` (${rounds} rounds)` : ''}`,
      li.code === 0 && bad.length === 0 && app.stats.refresh_lost === 0 && app.stats.refresh_401 <= 1 && sm.items.length >= 3,
      bad.join(' | ') || `${rounds * 4} script runs, ${app.stats.refresh_ok} token swaps, ${app.stats.refresh_lost} lost, ${sm.items.length} items opened`);
    // A sign-in that does end mid-run is never silent: the script says so and exits 3.
    const running = runNode([S + 'visual.mjs', app.url, '--audit', audit, '--out', join(audit, 'visual-expired')], env);
    await new Promise(r => setTimeout(r, 6000));
    app.expire();
    const ended = await running;
    app.stop();
    ok('a sign-in that ends mid-run is reported: "The app signed us out during this run", exit 3', ended.code === 3 && /The app signed us out during this run \(401 on \/api\/auth\/refresh\)/.test(ended.err), `exit ${ended.code}: ${ended.err.trim().split('\n').pop().slice(0, 120)}`);

    // (2) Switches that were not turned back. 5 switches on one page: 3 turn back when clicked again,
    // 1 only resets when the page loads again, 1 stays on for good. Reported apart.
    const sw = await serveFixture('tests/fixtures/switch-app/index.html');
    const so = tmp('v09-switch');
    await runNode([S + 'explore.mjs', sw.url, '--use', '--widths', '1280', '--out', so]);
    sw.stop();
    const sj = readJson(join(so, 'explore.json'), { use: {}, leads: [], switches: [] });
    const flips = n => sw.hits.filter(h => h.startsWith(`flip=${n}:`)).map(h => h.split(':')[1]).join(',');
    const md = existsSync(join(so, 'explore.md')) ? readFileSync(join(so, 'explore.md'), 'utf8') : '';
    ok('switches: with several on one page each one is turned back, "back after reload" is reported apart from "not back"',
      sj.use.switches_flipped === 5 && sj.use.turned_back === 3 && (sj.use.back_after_reload || []).join() === 'Live preview' && (sj.use.not_turned_back || []).join() === 'Beta layout'
      && ['Show drafts', 'Show finished', 'Compact rows'].every(n => flips(n) === 'on,off') && sj.leads.filter(l => l.kind === 'toggle-not-restored').length === 1 && /"Beta layout"/.test(sj.leads.find(l => l.kind === 'toggle-not-restored').what)
      && sj.leads.filter(l => l.kind === 'toggle-back-after-reload').length === 1 && /Back after reload .*Live preview/.test(md) && /\*\*Not back: Beta layout/.test(md),
      `turned back ${sj.use.turned_back}, back after reload: ${(sj.use.back_after_reload || []).join()}, not back: ${(sj.use.not_turned_back || []).join()}`);

    // (3) Dialog dismissal: Escape first, then the close (X) button, then "Got it" only when neither works.
    const how = [];
    for (const mode of ['escape', 'x', 'ok']) {
      const app2 = await serveFixture('tests/fixtures/dialog-app/index.html');
      const o = tmp('v09-dialog');
      await runNode([S + 'visual.mjs', `${app2.url}?mode=${mode}`, '--no-click', '--widths', '1280', '--out', o]);
      app2.stop();
      const vj = readJson(join(o, 'visual.json'), { dialogs_closed: [] });
      const note = existsSync(join(o, 'visual.md')) ? readFileSync(join(o, 'visual.md'), 'utf8') : '';
      how.push({ mode, hits: app2.hits.join(), said: (vj.dialogs_closed[0] || {}).how || 'nothing', title: (vj.dialogs_closed[0] || {}).dialog, noted: /## Dialogs that covered a page/.test(note) && /Name each one in Left behind/.test(note) });
    }
    ok('a covering dialog is closed with Escape first, then the close (X) button, and "Got it" only when neither works',
      how[0].hits === 'closed=escape' && how[0].said === 'Escape' && how[1].hits === 'closed=x' && how[1].said === 'the close (X) button' && how[2].hits === 'closed=ok' && how[2].said === 'the "Got it" button' && how.every(h => h.noted && h.title === "What's new"),
      how.map(h => `${h.mode}: ${h.hits || 'not closed'} (${h.said})`).join(' · '));

    // (4) overflow-box and fonts: a chip 6px outside a 358px card (what a different font does) stays
    // quiet. A chip 114px outside its card is still a lead.
    const small = visual('tests/fixtures/checks-app/overflow-small.html', ['--no-click']), big = visual('tests/fixtures/checks-app/overflow.html', ['--no-click']);
    const out = j => j.leads.filter(l => l.kind === 'overflow-box');
    ok('overflow-box: 6px outside a 358px card stays quiet, 114px outside is still a lead', out(small.json).length === 0 && small.json.leads.length === 0 && out(big.json).length === 1, `small: ${say(small.json.leads)}; big: ${say(out(big.json))}`);
  }

  // Step 10. Updates without the manual steps. The plugin ships a SessionStart hook (hooks/hooks.json)
  // that runs version.mjs --fetch --quiet. Against a stale saved copy of the marketplace it fetches once
  // and prints the line once. Up to date, offline or switched off, it prints nothing. It always exits
  // 0 and is done in under 3 seconds.
  if (want('update')) {
    const g = (args, cwd) => spawnSync('git', args, { cwd, encoding: 'utf8' });
    const origin = tmp('v09-origin'), home = tmp('v09-home'), copy = join(home, '.claude', 'plugins', 'marketplaces', 'shipright-audit');
    const put = (version) => { mkdirSync(join(origin, '.claude-plugin'), { recursive: true }); writeFileSync(join(origin, '.claude-plugin', 'plugin.json'), JSON.stringify({ name: 'shipright-audit', version })); g(['add', '-A'], origin); g(['-c', 'user.name=t', '-c', 'user.email=t@example.com', 'commit', '-q', '-m', version], origin); };
    const made = g(['init', '-q', '-b', 'main'], origin).status === 0;
    if (made) { put('0.1.0'); put('0.2.0'); }
    if (made && g(['clone', '-q', origin, copy]).status === 0 && g(['reset', '-q', '--hard', 'HEAD~1'], copy).status === 0) {
      const env = { HOME: home, USERPROFILE: home, CLAUDE_CONFIG_DIR: '', CLAUDE_PLUGIN_ROOT: root };
      const versionIn = () => readJson(join(copy, '.claude-plugin', 'plugin.json'), {}).version;
      const timed = (extra = [], more = {}) => { const t = Date.now(); const r = runSync([S + 'version.mjs', '--fetch', '--quiet', ...extra], { ...env, ...more }); return { ...r, ms: Date.now() - t }; };
      const off = timed([], { SHIPRIGHT_NO_UPDATE_CHECK: '1' });
      const staleAfterOff = versionIn();
      const first = timed(), second = timed();
      ok('update hook script: a stale copy is fetched once and the line is printed once, a current copy prints nothing',
        off.status === 0 && off.stdout === '' && staleAfterOff === '0.1.0' && first.status === 0 && first.stdout.trim() === 'ShipRight audit 0.2.0 is ready: open Plugins and click Update.' && versionIn() === '0.2.0' && second.status === 0 && second.stdout === '' && [off, first, second].every(r => r.ms < 3000),
        `off: "${off.stdout.trim()}" · stale: "${first.stdout.trim()}" (${first.ms}ms) · current: "${second.stdout.trim()}"`);
      // Offline: the remote cannot be reached. Nothing is printed, nothing fails, the copy is untouched.
      g(['reset', '-q', '--hard', 'HEAD~1'], copy);
      g(['remote', 'set-url', 'origin', join(origin, 'gone')], copy);
      const offline = timed();
      const none = timed([], { HOME: tmp('v09-nohome'), USERPROFILE: tmp('v09-nohome') });
      ok('update hook script: offline or with no saved copy it prints nothing, exits 0 and stays under 3 seconds',
        offline.status === 0 && offline.stdout === '' && versionIn() === '0.1.0' && offline.ms < 3000 && none.status === 0 && none.stdout === '', `offline: exit ${offline.status} in ${offline.ms}ms, "${offline.stdout.trim()}"`);
      // The hook file itself: valid, on SessionStart, and its command runs as written (through a shell,
      // with CLAUDE_PLUGIN_ROOT set, as Claude Code does) and shows the line to the user.
      g(['remote', 'set-url', 'origin', origin], copy);
      const hooks = readJson(join(root, 'hooks', 'hooks.json'), {});
      const hook = hooks.hooks?.SessionStart?.[0]?.hooks?.[0] || {};
      let shown = null, ran = { status: process.platform === 'win32' ? 0 : -1 };
      if (process.platform !== 'win32') { ran = spawnSync('sh', ['-c', hook.command || 'exit 9'], { cwd: tmp('v09-cwd'), encoding: 'utf8', env: { ...process.env, ...env } }); try { shown = JSON.parse(ran.stdout); } catch {} }
      ok('the plugin ships a SessionStart hook that runs the quiet fetch and shows the line to the user',
        hook.type === 'command' && /version\.mjs" --fetch --quiet/.test(hook.command || '') && hook.command.includes('${CLAUDE_PLUGIN_ROOT}') && hook.timeout <= 5 && ran.status === 0
        && (process.platform === 'win32' || (shown && shown.systemMessage === 'ShipRight audit 0.2.0 is ready: open Plugins and click Update.' && shown.hookSpecificOutput?.hookEventName === 'SessionStart')),
        process.platform === 'win32' ? 'hook file checked (the shell run is skipped on Windows)' : `exit ${ran.status}: ${(shown && shown.systemMessage) || ran.stdout.trim().slice(0, 80) || ran.stderr.trim().slice(0, 80)}`);
    } else ok('update hook script: a stale copy is fetched once and the line is printed once, a current copy prints nothing', true, 'SKIPPED: git is not available');
  }

  // The goal of 0.9: no new false alarms on the existing fixtures and benchmark apps. The page checks
  // (faint-border, tight-padding, see-through-layer) are swept by tests/v08.mjs and tests/run.mjs. This
  // sweeps the checks that live in explore.mjs over the older fixtures and all 4 benchmark apps.
  if (want('quiet') && hasPw) {
    const NEW = ['back-goes-elsewhere', 'tab-shift', 'tab-chrome-differs', 'option-vanished', 'option-not-restored', 'unlabeled-field', 'toggle-back-after-reload', 'duplicate-on-screen'];
    const sweep = [...['shift-app', 'use-app', 'results-app', 'button-cards-app', 'marker-app', 'lifecycle-app', 'create-app'].map(f => [f, `tests/fixtures/${f}/index.html`, []]),
      ['checks-app clean', 'tests/fixtures/checks-app/clean.html', []],
      ['benchmark s1', 'benchmarks/cases/s1-pawsh-grooming/app/index.html', ['--routes', '#/services,#/book,#/bookings,#/bookings/past,#/contact,#/does-not-exist']],
      ['benchmark s2', 'benchmarks/cases/s2-harvest-volunteers/app/index.html', ['--routes', '#/dashboard,#/shifts,#/shifts/s4,#/volunteers,#/settings,#/reports']],
      ['benchmark s3', 'benchmarks/cases/s3-northwind-maintenance/app/index.html', ['--routes', '#/requests,#/urgent,#/properties,#/vendors']],
      ['benchmark c7', 'benchmarks/cases/c7-ivc-app/app/index.html', []]];
    const loud = [];
    for (const [name, target, extra] of sweep) for (const l of explore(target, [...extra, '--widths', '1280']).json.leads.filter(x => NEW.includes(x.kind) || x.kind === 'did not run')) loud.push(`${name}: ${l.kind} ${String(l.what).slice(0, 80)}`);
    ok('the checks added to explore.mjs in 0.9 add 0 false alarms to the older fixtures and the 4 benchmark apps', loud.length === 0, loud.join(' | ') || `${sweep.length} apps`);
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
