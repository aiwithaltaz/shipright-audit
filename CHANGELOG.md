# Changelog

## 0.3.2-beta.1 (2026-10-25)

From the Content Desk rerun on a Windows preview build, where Playwright's Chromium would not start ("side-by-side configuration is incorrect").
- **Browser fallback:** every script now tries Playwright's Chromium, then the installed Microsoft Edge, then Google Chrome, and says which one it used. Force one with `SHIPRIGHT_BROWSER=msedge` or `chrome`.
- **The audit offers to run commands for the owner** (like the sign-in window) instead of asking them to use a terminal.

## 0.3.1-beta.1 (2026-10-25)

- Commands shown to the owner now use the real folder path, not `<skill>`.
- Removed source comments that hinted at planted problems from benchmark case s3 and from the visual test fixture. An audit that reads source code must not be told the answers. No graded run had used s3 yet.

## 0.3.0-beta.1 (2026-10-25)

From the first audit of a real, signed-in app. The owner listed 9 problems before the run; the audit found 0 of them (all 7 of its own top findings were confirmed real). It was strong on flows and wording and blind to visual craft. This version targets that gap and the access problems behind it.

**Visual craft**
- **New Pass 3 and `references/visual-craft.md`:** pills hold 1 to 3 words of status, counts match what the page holds, one thing to scan per row, the main action sits where the eye lands, repeated items line up, spacing has no holes, same surfaces share a corner shape, menus sit on top.
- **New `visual.mjs`:** measures alignment and spacing in repeated cards, sentence and crowded pills, corner drift, menus covered by other layers or off screen, and counts with nothing behind them, with a cropped screenshot per lead. 0 false alarms across 13 screens of the other test apps.

**Access**
- **New `login.mjs`:** the owner signs in in a real browser window and the session is saved; Claude never sees the password. `crawl.mjs`, `walk.mjs` and `visual.mjs` take `--session`, so the audit works behind a login at 390 and 1280.
- **The crawler flags a login wall and mostly empty screens.** Step 0 now settles the way in, realistic data, Playwright and what not to click in one message, before any work.

**Safety and honesty**
- **Guest-in-a-live-app rule:** never publish, post, send, delete, pay, invite, connect or save settings without the owner's yes.
- **"Left behind" section and reply item,** with an offer to clean up and a reminder to delete the session file.
- **The gate checks that every cited screenshot exists,** and requires the Left behind section.

**Plugin**
- **Only `/shipright-audit:audit` shows in the menu;** the skill still runs on its own when you ask for a review.
- **Removed the next step that pointed to a skill that does not exist yet.**

**Benchmark**
- **New seeded case s3** (visual craft, 13 pains, 4 Keeps) with 19 independent seed checks (76 in total).

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
