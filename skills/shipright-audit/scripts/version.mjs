#!/usr/bin/env node
// Says whether a newer ShipRight Audit is out, and can fetch it so the owner never has to open GitHub.
// Quiet and quick: one small request, 4 second limit, and the check never fails the audit (exit 0).
// Usage: node <skill>/scripts/version.mjs           check, print one line
//        node <skill>/scripts/version.mjs --fetch   refresh Claude Code's saved copy of the marketplace
//                                                   (only after the owner said yes), then print what to click
//        node <skill>/scripts/version.mjs --fetch --quiet [--hook]
//                                                   the same refresh, for the plugin's SessionStart hook
//                                                   (hooks/hooks.json): it runs on every start of Claude Code,
//                                                   in the terminal and in the desktop app
// Why --fetch: Claude Code does not refresh marketplaces outside Anthropic's own, so its Update button stays
// greyed out until the saved copy in ~/.claude/plugins/marketplaces/shipright-audit is refreshed.
// --quiet: fast-forwards the saved copy only when a newer version is out, and prints one line only then:
//   "ShipRight audit <new version> is ready: open Plugins and click Update."
// Up to date, offline, no saved copy, no git: it prints nothing. It always exits 0, so it can never fail
// a session, and it is done in under 3 seconds (the network part is cut off after 2).
// --hook: print that line the way a hook shows a message to the user (JSON with "systemMessage").
// Turn the check off with SHIPRIGHT_NO_UPDATE_CHECK=1.
// To see whether the hook ran, set SHIPRIGHT_UPDATE_LOG=<file>: each run adds one line to that file.
import { readFileSync, existsSync, appendFileSync } from 'node:fs';
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

const base = process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude');
const copy = join(base, 'plugins', 'marketplaces', 'shipright-audit');

if (process.argv.includes('--fetch') && process.argv.includes('--quiet')) {
  // Never throw, never wait: anything that goes wrong means "say nothing".
  const note = what => { if (process.env.SHIPRIGHT_UPDATE_LOG) { try { appendFileSync(process.env.SHIPRIGHT_UPDATE_LOG, `${new Date().toISOString()} ${what}\n`); } catch {} } };
  process.on('exit', () => note(done));
  let done = 'nothing to do (switched off, or no saved copy)';
  try {
    if (process.env.SHIPRIGHT_NO_UPDATE_CHECK === '1' || !existsSync(join(copy, '.git'))) process.exit(0);
    const versionOf = text => { try { return JSON.parse(text).version || null; } catch { return null; } };
    const git = (args, timeout) => spawnSync('git', args, { cwd: copy, encoding: 'utf8', timeout, killSignal: 'SIGKILL', shell: process.platform === 'win32', env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } });
    const before = existsSync(join(copy, '.claude-plugin', 'plugin.json')) ? versionOf(readFileSync(join(copy, '.claude-plugin', 'plugin.json'), 'utf8')) : null;
    // The only step that needs the network. Cutting a fetch off is safe: nothing in the copy has changed yet.
    done = 'could not reach the marketplace (offline?)';
    if (git(['fetch', '--quiet'], 2000).status !== 0) process.exit(0);
    const ahead = git(['show', '@{upstream}:.claude-plugin/plugin.json'], 400);
    const latest = ahead.status === 0 ? versionOf(ahead.stdout) : null;
    done = `up to date (${before})`;
    if (!latest || !before || !newer(latest, before)) process.exit(0);
    done = `${latest} is out, but the saved copy could not be fast-forwarded`;
    if (git(['merge', '--ff-only', '--quiet', '@{upstream}'], 500).status !== 0) process.exit(0);
    done = `fetched ${latest} (was ${before})`;
    const line = `ShipRight audit ${latest} is ready: open Plugins and click Update.`;
    console.log(process.argv.includes('--hook')
      ? JSON.stringify({ systemMessage: line, hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: `${line} (You had ${before}. Tell the user this once, in one line.)` } })
      : line);
  } catch {}
  process.exit(0);
}

if (process.argv.includes('--fetch')) {
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
  else if (newer(latest, mine)) {
    // The plugin's SessionStart hook may have fetched it already: then the owner only has to click Update.
    let saved = null;
    try { saved = JSON.parse(readFileSync(join(copy, '.claude-plugin', 'plugin.json'), 'utf8')).version; } catch {}
    if (saved === latest) console.log(`version: NEWER ${latest} is ready (you have ${mine}). It is already fetched. Tell the owner at the end of the reply: "ShipRight audit ${latest} is ready: open Plugins and click Update."`);
    else console.log(`version: NEWER ${latest} is out (you have ${mine}). Tell the owner at the end of the reply and offer: "Say 'update it' and I'll fetch it." On yes, run version.mjs --fetch.`);
  }
  else console.log(`version: up to date (${mine})`);
} catch {
  console.log(`version: could not check${mine ? ` (you have ${mine})` : ''}`);
}
