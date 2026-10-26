#!/usr/bin/env node
// Says whether a newer ShipRight Audit is out, and can fetch it so the owner never has to open GitHub.
// Quiet and quick: one small request, 4 second limit, and the check never fails the audit (exit 0).
// Usage: node <skill>/scripts/version.mjs           check, print one line
//        node <skill>/scripts/version.mjs --fetch   refresh Claude Code's saved copy of the marketplace
//                                                   (only after the owner said yes), then print what to click
// Why --fetch: Claude Code does not refresh marketplaces outside Anthropic's own, so its Update button stays
// greyed out until the saved copy in ~/.claude/plugins/marketplaces/shipright-audit is refreshed.
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const manifest = [join(here, '..', '..', '..', '.claude-plugin', 'plugin.json'), join(here, '..', '..', '..', 'package.json')].find(existsSync);
let mine = null;
try { mine = JSON.parse(readFileSync(manifest, 'utf8')).version; } catch {}
const parse = v => String(v || '').split('-')[0].split('.').map(Number);
const newer = (a, b) => { const x = parse(a), y = parse(b); for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); return false; };
const CLICKS = 'Restart Claude Code, type /plugin, open Installed, pick Shipright audit, click Update and confirm.';

if (process.argv.includes('--fetch')) {
  const base = process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude');
  const copy = join(base, 'plugins', 'marketplaces', 'shipright-audit');
  const before = existsSync(join(copy, '.claude-plugin', 'plugin.json')) ? JSON.parse(readFileSync(join(copy, '.claude-plugin', 'plugin.json'), 'utf8')).version : null;
  const git = existsSync(copy) ? spawnSync('git', ['pull', '--ff-only', '--quiet'], { cwd: copy, encoding: 'utf8', shell: process.platform === 'win32' }) : null;
  const after = existsSync(join(copy, '.claude-plugin', 'plugin.json')) ? JSON.parse(readFileSync(join(copy, '.claude-plugin', 'plugin.json'), 'utf8')).version : null;
  if (git && git.status === 0 && after) {
    console.log(`update: fetched ${after}${before && before !== after ? ` (was ${before})` : ''}. ${CLICKS}`);
    process.exit(0);
  }
  console.log(`update: could not refresh the saved copy${git ? ` (${(git.stderr || '').trim().split('\n')[0] || 'git failed'})` : ' (not found)'}. Instead: type /plugin, remove Shipright audit and its marketplace, then add them again: /plugin marketplace add aiwithaltaz/shipright-audit and /plugin install shipright-audit@shipright-audit`);
  process.exit(1);
}

try {
  const res = await fetch('https://raw.githubusercontent.com/aiwithaltaz/shipright-audit/main/.claude-plugin/plugin.json', { signal: AbortSignal.timeout(4000) });
  const latest = (await res.json()).version;
  if (!mine) console.log(`version: latest is ${latest}; could not read the installed version`);
  else if (newer(latest, mine)) console.log(`version: NEWER ${latest} is out (you have ${mine}). Tell the owner at the end of the reply and offer: "Say 'update it' and I'll fetch it." On yes, run version.mjs --fetch.`);
  else console.log(`version: up to date (${mine})`);
} catch {
  console.log(`version: could not check${mine ? ` (you have ${mine})` : ''}`);
}
