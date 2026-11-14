# ShipRight Audit

**Your AI reviews your app like an expert Staff Product Designer.** It walks every screen and core task, names what works, finds what hurts with screenshots and causes, and tells you what to fix first. It changes nothing.

Built for apps people already shipped with Cursor, Lovable, Claude Code, Replit and friends: they work, but they feel clunky, and nobody can say exactly why.

> **Status: v0.7 beta.** Measured results are not in yet. The benchmark is built and its pass bars were fixed in advance ([PREREGISTRATION.md](benchmarks/PREREGISTRATION.md)). We publish numbers when the runs are graded, including where it loses.

## Install

**Claude Code** (two separate prompts):

```
/plugin marketplace add aiwithaltaz/shipright-audit
```
```
/plugin install shipright-audit@shipright-audit
```

**Stay up to date.** Claude Code does not auto-update marketplaces outside Anthropic's own, so you stay on the version you installed until you update. When a newer version is out, the audit says so at the end of its reply and offers to fetch it: say "update it", restart, and click Update. Details: [INSTALL.md](INSTALL.md#updating).

Then audit an app:

```
/shipright-audit:audit https://your-app.com
```

or just ask: *"Review my app and tell me what to fix first."*

**No questionnaire.** It starts right away and asks only when something blocks it.

**App behind a login?** A browser window opens on your screen and you sign in there (`login.mjs`). The audit reuses that window's own browser profile, so it stays signed in even when your app swaps its sign-in token on every refresh, and it never sees your password. If the app signs it out anyway, it stops and says so: it never goes on signed out. Never type a password into a chat with any AI: chats are kept. Use an account with realistic data: empty screens hide the problems you care about.

## What's new in 0.7

0.6 was run on a real signed-in app. 26 of its 27 findings were right, but it found only about 2 of the owner's 8 current problems. 0.7 is built to find more of them:

- **Stays signed in:** reuses the sign-in window's browser profile, checks it is still signed in before every script, and stops loudly if not.
- **Every screen on phone,** with a new check for text that is cut off or runs past the screen edge.
- **Opens your existing results** (past chats, library, files), read-only, and checks them for images that never loaded, clipped text and unnamed buttons.
- **Uses the app like a real user, only if you say yes:** flips switches and turns them back, sends up to 3 short test messages, and lists everything it created.
- **Researches the leaders live** and compares how features work, not only where they sit, with a source link per row.
- **Reads your own design rules first** (`DESIGN.md`, a changelog) and respects your decisions: what you chose on purpose is not reported as a problem.
- **Design-system drift, layout shift and reduced motion:** a search box that looks different on one screen, a page that jumps after loading, a menu that still slides when the device asks for less motion.

Full list: [CHANGELOG.md](CHANGELOG.md).

Cursor, Codex, Antigravity, Copilot, Windsurf and others: see [INSTALL.md](INSTALL.md).

## What you get

A pain map in `docs/shipright/audits/<date>-<site>/pain-map.md` (each audit gets its own folder) and a short reply. Every pain looks like this (sample from an invented app):

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

0. **Start, don't ask:** installs its browser tools outside your app, reads your design rules if the folder has any (`owner-rules.mjs`), crawls, and only opens a sign-in window or asks about data when it has to. It asks one question: may it use the app like a real user (default: no)
1. **Reach every screen** at phone and desktop width, signed in and signed out (`crawl.mjs`), and flag a login wall or empty screens
1b. **Open every safe control** (`explore.mjs`), at both widths: every menu, dialog and pop-over, tooltips on icon buttons, and buttons that do nothing or throw errors. It stops before anything that saves, sends or spends, and flips switches only after your yes
1c. **Open existing results, read-only** (`samples.mjs`): past chats, library items and files, checked for media that never loaded, clipped text and unnamed buttons
2. **Name the core tasks** as user goals
3. **Pass 1: walk each task** as a first-time user, screenshotting every step at both widths (`walk.mjs`)
4. **Pass 2: check each screen** against the 10 usability heuristics, layout and hierarchy, work-screen rules and WCAG 2.2 AA basics, with independent reviewers when your tool supports subagents
4b. **Compare with the category leaders:** what the 3 to 5 apps your users already know do, researched live with a source link per row: how each feature works (set once or every time, how it is called up, what happens before anything is sent), and whether each thing lives where users expect it
5. **Pass 3: visual craft:** pills, counts, too many labels, a buried main action, alignment, spacing, corner shape, layering, clipped text and a page that jumps after loading (`visual.mjs` measures them at both widths after each page finishes loading), plus the same component looking different from screen to screen (`consistency.mjs`). Every lead the scripts measure must end up as a pain or be rejected with a reason
5b. **Pass 4: taste:** first impression, focal point, type, color, space, surfaces, icons, the generic template look and polish, scored 1 to 5 with reasons, because "it works but I'm not a fan of the UI" is a finding too
6. **Name what works** (at least 3 Keeps)
7. **Write each pain** with evidence, the heuristic it breaks (or your own rule, quoted), severity and cause. What you chose on purpose is listed as respected, not as a pain
8. **Find what is missing** (empty states, errors, 404, recovery paths)
9. **Rank** by impact, confidence and effort, then group into themes
10. **Re-check and gate:** it rereads the screenshot behind every Blocker and Major, then `check-stage.mjs` refuses a pain map with missing evidence, screenshots that do not exist, undecided visual leads, or claims resting on a mid-load screenshot

## What it will not do

- Edit, install into, deploy or push your app
- Publish, post, send, delete, pay, generate, save, connect or flip a switch in your live app without asking, or type into forms that may autosave. It tells you everything it created and offers to clean up
- Go on signed out without telling you, or read a file that lists your current complaints before it has finished
- Invent user quotes, complaints or numbers
- Replace real users: expert findings are predictions, so it tells you which 3 to test
- Replace a full accessibility audit: it runs the quick checks and says what it could not verify

## Results

Coming soon. The benchmark in [benchmarks/](benchmarks/) compares 3 arms on 4 apps with answer keys:

- **No skill**, a **careful one-paragraph prompt**, and **shipright-audit**. Beating the careful prompt is the real test.
- **Blind grading** by 2 graders from different model families, checked against hidden control reviews and human labels.
- **95% confidence intervals**, failed runs counted as 0, and a "where it loses" list.

## Requirements

Node 18 or later. The audit installs Playwright itself, in `~/.shipright/tools`, never in your app. The scripts use Playwright's Chromium, then your installed Microsoft Edge or Google Chrome, then Playwright's WebKit. Without Playwright, the audit still runs by hand and says what it could not check.

## Part of ShipRight

ShipRight is a set of product and design skills for AI builders: [aiwithaltaz/shipright-skills](https://github.com/aiwithaltaz/shipright-skills).

## License

[MIT](LICENSE)
