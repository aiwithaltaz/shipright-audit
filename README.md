# ShipRight Audit

**Your AI reviews your app like an expert Staff Product Designer.** It walks every screen and core task, names what works, finds what hurts with screenshots and causes, and tells you what to fix first. It changes nothing.

Built for apps people already shipped with Cursor, Lovable, Claude Code, Replit and friends: they work, but they feel clunky, and nobody can say exactly why.

> **Status: v0.9 beta.** Measured results are not in yet. The benchmark is built and its pass bars were fixed in advance ([PREREGISTRATION.md](benchmarks/PREREGISTRATION.md)). We publish numbers when the runs are graded, including where it loses.

## Install

**Claude Code** (two separate prompts):

```
/plugin marketplace add aiwithaltaz/shipright-audit
```
```
/plugin install shipright-audit@shipright-audit
```

**Stay up to date.** Claude Code does not auto-update marketplaces outside Anthropic's own. From 0.9 on the plugin checks by itself each time Claude Code starts, in the terminal and in the desktop app: when a newer version is out it fetches it and says "ShipRight audit <new version> is ready: open Plugins and click Update." Then you only click Update. Turn the check off with `SHIPRIGHT_NO_UPDATE_CHECK=1`. Details: [INSTALL.md](INSTALL.md#updating).

Then audit an app:

```
/shipright-audit:audit https://your-app.com
```

or just ask: *"Review my app and tell me what to fix first."*

**No questionnaire.** It starts right away and asks one thing in its first message: may it use the app like a real user? It keeps working on everything that does not need your answer, then waits for it. Reply yes, no, or yes with limits ("yes, but don't generate a video").

**App behind a login?** A browser window opens on your screen and you sign in there (`login.mjs`). The audit reuses that window's own browser profile, so it stays signed in even when your app swaps its sign-in token on every refresh, and it never sees your password. After sign-in it remembers where your app landed, so an app that your public page never links into is still audited. If the app signs it out anyway, it stops and says so: it never goes on signed out. Never type a password into a chat with any AI: chats are kept. Use an account with realistic data: empty screens hide the problems you care about.

## What's new in 0.9

0.8 was run again on a real AI chat app. About 36 of its 39 findings were right, and it found about 60% of the owner's 19 problems. Everything it missed could be checked by a script, so 0.9 checks it:

- **Back goes back:** it reaches each page from 2 other pages and presses the in-app back arrow. Landing anywhere else is a finding that names the 3 pages.
- **Tabs that do not jump:** it opens every tab of a section and reports content that moves up and down between tabs, and a back arrow or title that is on some tabs only.
- **Outlines you can see:** inputs, dropdowns and outline buttons whose border is lost on a dark surface, with the two colors and the ratio.
- **Padding that matches:** one card, notice or row that is much tighter than the others like it.
- **Solid bars:** it scrolls your content under the top bar and the message box and reports content that shows through or prints over them.
- **Options that stay:** with your yes, it picks each option of a theme switcher or view toggle and reports one that can no longer be picked afterwards. Then it puts your setting back.
- **One job, one control:** two buttons with different names that open the same list.
- **Fewer false alarms:** floating labels count as labels, a rail that opens on hover counts as labeled, and it checks that something is really required before it calls it a hidden requirement.
- **Steadier runs:** it no longer loses your sign-in mid-run on apps that swap their token, it turns every switch back, it closes a "What's new" dialog with Escape before it ever presses OK, and it gives the same answers with Linux fonts.
- **Updates by themselves:** the plugin fetches a newer version when Claude Code starts. You only click Update.

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

0. **Start, and ask one question:** installs its browser tools outside your app, reads your design rules if the folder is about your app (`owner-rules.mjs`), crawls, and only opens a sign-in window or asks about data when it has to. Its first message asks one question: may it use the app like a real user? It waits for your answer before any step that needs it
1. **Reach every screen** at phone and desktop width, signed in and signed out (`crawl.mjs`), and flag a login wall or empty screens
1b. **Open every safe control** (`explore.mjs`), at both widths: every menu, dialog and pop-over, tooltips on icon buttons, and buttons that do nothing or throw errors. It stops before anything that saves, sends or spends, presses Create or Add only when they clearly just open something, and flips switches only after your yes. It also presses each in-app back arrow (it must go back), opens every tab of a section (the content must not jump), finds two controls that open the same list, and, with your yes, checks that the options of a theme switcher or view toggle are all still there after use. It also checks that anything you can star, pin or bookmark can be filtered
1c. **Open existing results, read-only** (`samples.mjs`): past chats, library items, projects and files, by their link or through the View button on their card, checked for media that never loaded, clipped text and unnamed buttons
2. **Name the core tasks** as user goals
2b. **Map each item's life:** every state a project, order or draft can be in, the actions offered in each, and whether each state has one clear next step, a way back in, final actions only when ready, and a failure that explains itself
3. **Pass 1: walk each task** as a first-time user, screenshotting every step at both widths (`walk.mjs`)
4. **Pass 2: check each screen** against the 10 usability heuristics, layout and hierarchy, work-screen rules and WCAG 2.2 AA basics, with independent reviewers when your tool supports subagents
4b. **Compare with the category leaders:** what the 3 to 5 apps your users already know do, researched live with a source link per row: how each feature works (set once or every time, how it is called up, what happens before anything is sent), and whether each thing lives where users expect it
5. **Pass 3: visual craft:** pills, counts, too many labels, a buried main action, alignment, spacing, corner shape, layering, clipped text, a page that jumps after loading, template text left in view, faint icons, things that stick out of their box, duplicates on one screen, stacked rows of controls, input and button outlines too faint to see, one card with tighter padding than the rest, and content that shows through a sticky top bar or message box (`visual.mjs` measures them at both widths after each page finishes loading), plus the same component looking different from screen to screen (`consistency.mjs`). Every lead the scripts measure must end up as a pain or be rejected with a reason
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
- Take your silence as a no, or as a yes: it waits for your answer before it uses anything
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
