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
