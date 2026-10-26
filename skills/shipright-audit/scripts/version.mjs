#!/usr/bin/env node
// Says whether a newer ShipRight Audit is out. Quiet and quick: one small request, 4 second limit,
// and it never fails the audit (always exits 0).
// Usage: node <skill>/scripts/version.mjs
// Prints one line: "version: up to date (0.4.0)", "version: 0.5.0 is out, you have 0.4.0", or "version: could not check".
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const manifest = [join(here, '..', '..', '..', '.claude-plugin', 'plugin.json'), join(here, '..', '..', '..', 'package.json')].find(existsSync);
let mine = null;
try { mine = JSON.parse(readFileSync(manifest, 'utf8')).version; } catch {}
const parse = v => String(v || '').split('-')[0].split('.').map(Number);
const newer = (a, b) => { const x = parse(a), y = parse(b); for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); return false; };

try {
  const res = await fetch('https://raw.githubusercontent.com/aiwithaltaz/shipright-audit/main/.claude-plugin/plugin.json', { signal: AbortSignal.timeout(4000) });
  const latest = (await res.json()).version;
  if (!mine) console.log(`version: latest is ${latest}; could not read the installed version`);
  else if (newer(latest, mine)) console.log(`version: ${latest} is out, you have ${mine}. To update: type /plugin, open Marketplaces, pick shipright-audit and update it, then restart. Turn on auto-update there to get new versions on their own.`);
  else console.log(`version: up to date (${mine})`);
} catch {
  console.log(`version: could not check${mine ? ` (you have ${mine})` : ''}`);
}
