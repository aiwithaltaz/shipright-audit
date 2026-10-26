# Changelog

## 0.4.2-beta.1 (2026-10-26)

From the SocialGhost signed-in audit, where "Sign in with Google" kept reloading and nobody could sign in.
- **The sign-in window is now a normal browser.** It opens your installed Edge or Chrome with its own kept profile, without the "controlled by automated software" flag that Google and other pop-up sign-ins refuse. A test checks that the window no longer announces automation.
- **Closing the window early no longer saves a signed-out session.** It saves only once you are signed in.
- **Next time is faster:** the profile is kept in `~/.shipright/profiles/<site>`, so the next audit of the same site usually opens already signed in. Delete that folder to forget it.

## 0.4.1-beta.1 (2026-10-26)

- **Updates without GitHub.** When a newer version is out, the audit ends its reply with "Say 'update it' and I'll fetch it." On yes, `version.mjs --fetch` refreshes Claude Code's saved copy of the marketplace, which the desktop app never refreshes on its own. Then: restart, `/plugin`, Installed, Shipright audit, Update.
- **Install guide:** separate update steps for the terminal and the desktop app. The auto-update switch only exists in the terminal version.

## 0.4.0-beta.1 (2026-10-26)

From the Content Desk rerun on 0.3.2: the owner's real account, signed in through Edge. It found 5 and a half of the owner's 11 items (0.2 found none) and 4 real problems the owner had not listed, including a Blocker: failed automations shown as healthy. Reading its working files showed why it missed the rest.

**It measured them, then dropped them**
- **Visual leads ledger.** `visual.mjs` had measured the misaligned Library dates, the big gap in the cards and the square-cornered menu, and the audit dropped all three without a word. Now every lead must end up in the pain map as a pain or as "Rejected:" with a reason, and the gate refuses gaps.
- **Leads are grouped:** the same problem on several pages is one lead (30 became 13 on Content Desk).

**Pages read before they loaded**
- **Every script waits for the page to settle:** no spinner, and the text and numbers unchanged on two reads in a row. Content Desk shows "0" and "Nothing needs review" for a second on every load, and the crawl had read that state.
- **The crawl marks screens that never settled,** and the gate refuses a pain that rests on one of their screenshots unless loading is the pain.
- **Evidence re-check:** before the gate, the audit rereads the screenshot behind every Blocker and Major. One cited screenshot said "0 in review" while its row said 3.

**The gate never ran on Windows**
- `check-stage.mjs` compared its own path in a way that only works on Mac and Linux, so on Windows it exited without checking anything. Fixed, and the reply now says "Gate: passed" or what failed. The same fix is in `score.mjs`.

**New visual checks**
- **Main action buried:** the only worded action at the bottom of a tall card, after 10 or more pieces of text ("View details" on Content Desk).
- **Too many labels:** more than 7 small labels and pills on one card.
- Still 0 false alarms on the 13 screens of the other test apps.

**No questionnaire**
- **Step 0 now starts instead of asking 5 questions.** It says one line, crawls, opens the sign-in window itself on a login wall, and asks about data only when the screens come back empty.
- **Never asks for a password in chat.** Chats are kept; the sign-in window is the safe way.
- **New `setup.mjs`:** installs Playwright in `~/.shipright/tools`, never in the app.

**Safety**
- **Generating content needs the owner's yes**, like publishing: it can spend credits and adds records.
- **No typing into composers or forms** on a live app (they may autosave). `walk.mjs` holds back those steps, and clicks on risky words, unless the step says the owner agreed.

**Browsers and updates**
- **WebKit fallback** after Chromium, Edge and Chrome, so a Mac without Edge or Chrome still works. Not yet tested on a Mac.
- **New `version.mjs`:** the reply says when a newer version is out.
- **Install guide:** how to turn on auto-update in the terminal version.

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
