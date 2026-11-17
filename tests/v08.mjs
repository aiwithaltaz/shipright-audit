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
