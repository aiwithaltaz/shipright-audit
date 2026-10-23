# Changelog

## 0.1.0-beta.1 (2026-10-23)

First public beta.

- `shipright-audit` skill: 10-step audit ladder, two passes, independent reviewers when available, 10 usability heuristics, 9 ShipRight lenses, WCAG 2.2 AA quick checks, 4-level severity, Keeps, themes and a ranked fix map.
- `check-stage.mjs` gate that names the exact row and field to fix.
- `crawl.mjs` and `consistency.mjs` for screens and label or color drift.
- Claude Code plugin with `/shipright-audit:audit`, Codex manifest, Cursor rule and `AGENTS.md`.
- Benchmark: 3 apps with answer keys, 3 arms, blind 2-family grading, hidden controls, confidence intervals, preregistered pass bars. No results yet.
