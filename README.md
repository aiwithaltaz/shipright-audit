# ShipRight Audit

**Your AI reviews your app like an expert Staff Product Designer.** It walks every screen and core task, names what works, finds what hurts with screenshots and causes, and tells you what to fix first. It changes nothing.

Built for apps people already shipped with Cursor, Lovable, Claude Code, Replit and friends: they work, but they feel clunky, and nobody can say exactly why.

> **Status: v0.1 beta.** Measured results are not in yet. The benchmark is built and its pass bars were fixed in advance ([PREREGISTRATION.md](benchmarks/PREREGISTRATION.md)). We publish numbers when the runs are graded, including where it loses.

## Install

**Claude Code** (two separate prompts):

```
/plugin marketplace add aiwithaltaz/shipright-audit
```
```
/plugin install shipright-audit@shipright-audit
```

Then audit an app:

```
/shipright-audit:audit https://your-app.com
```

or just ask: *"Review my app and tell me what to fix first."*

Cursor, Codex, Antigravity, Copilot, Windsurf and others: see [INSTALL.md](INSTALL.md).

## What you get

A pain map in `docs/shipright/audit/pain-map.md` and a short reply. Every pain looks like this (sample from an invented app):

| ID | What happens | Where | Who | Breaks | Severity | Cause | Source |
|---|---|---|---|---|---|---|---|
| P03 | On phone, "New order" is 2 taps deep inside the menu, on every screen | Home, Orders · `screens/home-390.png` | Staff at the counter | Make frequent tasks fast | 3 Major | layout | Found by 3 of 3 reviewers |

Then the reply, in this order:

1. **Verdict** in one line, and the one theme to fix first
2. **Keeps:** what works and must survive any redesign
3. **Top pains:** Blockers and Majors, each with its screenshot
4. **Themes:** 3 to 5 groups you can approve faster than 30 rows
5. **Decisions for you:** up to 4, with a recommended pick
6. **Confidence** and what could **not** be verified

## How it works

It follows the method expert designers use, one rung at a time:

0. **Scope** deep, not wide: the 3 to 5 core tasks
1. **Reach every screen** at phone and desktop width (`crawl.mjs`)
2. **Name the core tasks** as user goals
3. **Pass 1: walk each task** as a first-time user, counting steps and dead ends
4. **Pass 2: check each screen** against the 10 usability heuristics, layout and hierarchy, work-screen rules and WCAG 2.2 AA basics, with independent reviewers when your tool supports subagents
5. **Name what works** (at least 3 Keeps)
6. **Write each pain** with evidence, the heuristic it breaks, severity and cause
7. **Find what is missing** (empty states, errors, 404, recovery paths)
8. **Rank** by impact, confidence and effort, then group into themes
9. **Gate:** `check-stage.mjs` refuses a pain map with missing evidence, causes or tests

## What it will not do

- Edit, install into, deploy or push your app
- Invent user quotes, complaints or numbers
- Replace real users: expert findings are predictions, so it tells you which 3 to test
- Replace a full accessibility audit: it runs the quick checks and says what it could not verify

## Results

Coming soon. The benchmark in [benchmarks/](benchmarks/) compares 3 arms on 3 apps with answer keys:

- **No skill**, a **careful one-paragraph prompt**, and **shipright-audit**. Beating the careful prompt is the real test.
- **Blind grading** by 2 graders from different model families, checked against hidden control reviews and human labels.
- **95% confidence intervals**, failed runs counted as 0, and a "where it loses" list.

## Requirements

Node 18 or later. Playwright with Chromium makes the screen crawl automatic; without it, the audit still runs by hand and says what it could not check.

## Part of ShipRight

ShipRight is a set of product and design skills for AI builders: [aiwithaltaz/shipright-skills](https://github.com/aiwithaltaz/shipright-skills).

## License

[MIT](LICENSE)
