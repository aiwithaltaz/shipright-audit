# Changelog

## 0.2.0-beta.1 (2026-10-23)

Fixes from the first real run of `/shipright-audit:audit`.

- **New `walk.mjs`:** clicks through a core task from a short plan, screenshots every step at 1280 and 390, and records where it breaks. Pains inside forms and flows now get real screenshots instead of code quotes, and phone-only breaks show up.
- **Label drift in `crawl.mjs`:** flags links that go to the same place under different words (it now catches "Reserve", "Book now" and "Schedule" for one flow). The skill treats it as a lead, not a verdict.
- **Crawler bug fixed:** after the first screen, pages were read at phone width, so hidden desktop links were missed. Every screen is now read at 1280.
- **One problem per row:** clearer skill rule, and the gate rejects rows that join problems with a semicolon or run past 2 sentences.
- **Gate:** the Missing section must have rows or say "None found".

## 0.1.0-beta.1 (2026-10-23)

First public beta.

- `shipright-audit` skill: 10-step audit ladder, two passes, independent reviewers when available, 10 usability heuristics, 9 ShipRight lenses, WCAG 2.2 AA quick checks, 4-level severity, Keeps, themes and a ranked fix map.
- `check-stage.mjs` gate that names the exact row and field to fix.
- `crawl.mjs` and `consistency.mjs` for screens and label or color drift.
- Claude Code plugin with `/shipright-audit:audit`, Codex manifest, Cursor rule and `AGENTS.md`.
- Benchmark: 3 apps with answer keys, 3 arms, blind 2-family grading, hidden controls, confidence intervals, preregistered pass bars. No results yet.
