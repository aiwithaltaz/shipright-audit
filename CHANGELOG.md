# Changelog

## 0.7.0-beta.1 (2026-11-13)

From a real run of 0.6 on a signed-in AI chat app with a landing page, on a fresh Mac, with no help from the owner. It ran end to end and passed the gate, and 26 of its 27 findings were right (96%). But it found only about 2 of the owner's 8 current problems (25%). The goal for 1.0 is 70%. Most misses had one cause: the app refused the saved sign-in (a 401 when it refreshed its token), so the crawl, explore, visual and walk scripts never ran signed in. The rest: it never opened existing results, never flipped a switch, checked few screens on phone, compared with the leaders from memory, and did not know the owner's own decisions.

- **Stay signed in.** The scripts now reuse the sign-in window's own browser profile (`--profile`), which always holds the newest sign-in, even when an app swaps its token on every refresh. The saved session file (`--session`) is the fallback. Each script first checks it is still signed in. If not, it tries the other way once, then stops with "The app signed us out (401). Run login.mjs again." It never runs on silently signed out. If a site refuses headless browsers, it retries once in a window placed off screen and says which mode ran. `login.mjs` prints the profile path and browser for the next script.
- **Every screen on phone, and clipped text.** `explore.mjs` and `visual.mjs` run at 1280 and 390 by default (`--widths`). New **clipped text** lead: words cut off by their box, shortened with "...", or running past the edge of the screen, with a crop. Rows meant to scroll and shortened titles in lists of links are skipped. The header gets `Phone coverage: X of Y in-scope screens`, and the gate fails a screen with no 390 screenshot unless Not verified names it.
- **New `samples.mjs`: open existing results, read-only (Step 1c).** It finds lists of past items (chats, library, projects, files), opens up to 5 per list by address, prefers pages that hold images, files, code or tool results, and checks each at both widths: media that never loaded (a broken image, a dead video, a "click to load image" placeholder), clipped text, and action buttons with no name. It never clicks or types. Its leads are R##.
- **Use it like a real user, only with the owner's yes.** One clearer question replaces the "core promise" question (default: no). On yes, `explore.mjs --use` flips each switch in menus and on the page, records what changed with before and after screenshots, and turns it back. A switch that adds something away from itself (a chip in the message box) is a `toggle-side-effect` lead. Test messages run through `walk.mjs` steps marked `owner_said_yes`: sent once, then the result is checked at both widths. The header gets `Used as a user: yes (N actions)` or `no`, and Left behind lists every test message, item and switch. Never without a separate yes: publish, send to other people, delete, pay, invite, change account settings.
- **Live competitor research: how leaders work.** Step 4b requires web research when a web tool exists, with the URL and the date checked in a new **Source** column. New **C3. How it works** in `references/conventions.md`: set once or per item, how it is called up, what happens before anything is sent, how users make their own, what it looks like on phone. The gate needs 10 rows or more, a Kind and a Source column, at least 3 how-it-works rows and, with a web tool, at least half the rows linked. Missing gets "What leaders have that this app doesn't".
- **The owner's own rules come first.** New `owner-rules.mjs` reads design rules and history in the folder without asking (`DESIGN.md`, `design-system*`, `*taste*`, `CHANGELOG*`, `docs/`, the README) and quotes each rule and decision with file and line. A pain that breaks an owner rule gets the lens `Owner rule: "<quote>"`. Something that matches an owner decision is not a pain: it goes in the new **Owner decisions respected** section. Unsure cases are asked in Decisions for the owner. **Names rule:** a brand, vendor or library name is classified first (a credit line, a user-facing feature, or a leftover). **Benchmark fairness:** a file that may list the owner's current complaints is never opened before the gate passes, and is named as skipped.
- **Design-system drift, layout shift and motion.** `consistency.mjs` now runs on every signed-in screen and reports **component drift**: the same kind of component (search inputs, text inputs, dropdowns, primary buttons, cards, list rows, side panels) with a different corner radius, background, border, height or font size on one screen, with crops of the usual look and the odd one out. New leads for a page that jumps after it has loaded (layout shift over 0.1), a menu that makes the page jump when it opens, and anything that still moves with "reduce motion" on.
- **Crawl:** places are visited before items, and at most 6 items of one list, so a long chat history no longer uses up the crawl before it reaches Settings.
- **Fix:** sign-in profiles always open in the full browser. Playwright's separate headless shell cannot read the cookies a windowed browser saved, and wipes them from the profile.
- **Tests:** 51 checks (was 27), with 7 new generic fixtures. The gate self-test covers the new header lines, sources, how-it-works rows and owner rules.

## 0.6.0-beta.1 (2026-11-01)

From the Everthread audit: all 18 of its findings were real, but it found only about 5 of the owner's 21 notes. It missed what it never opened (the image dialog, the bookmark dialog, the handoff button), what needed a comparison with ChatGPT, Claude and Perplexity (the model picker far from the message box, no effort control, memory outside Settings), and the sign-in page.

- **New `explore.mjs`: open every safe control.** It hovers icon-only buttons for tooltips, opens every menu, dialog, panel and pop-over, records what opened with a screenshot, and flags buttons that do nothing and clicks that cause console or network errors (a voice button posting to a missing endpoint, for example). It never clicks risky words or form submits, and on a live app it only clicks controls that open something.
- **New Step 4b and `references/conventions.md`: compare with the category leaders.** Name 3 to 5 apps the users already know, compare area by area in a **Category conventions** table (Matches, a pain, or differs on purpose), and check where things live (main navigation, next to what they change, Settings, panels that match their section, labels on icons). Starter checklists for apps with accounts, AI chat, booking, stores, dashboards, creator tools and landing pages. The AI chat list was written after seeing Everthread, so a fair re-test needs a different app.
- **Signed out too:** with a session, the crawl also runs signed out, so sign-in and sign-up pages get audited.
- **The core promise:** the audit may ask once, after the crawl, to do 1 or 2 named actions that test the app's main promise. Default is no.
- **By hand mode:** `scripts/analyze-page.js` holds the in-page checks that `visual.mjs` runs, so an audit run in a browser tool (an app only your own browser is signed in to) uses the same checks.
- **Gate:** requires Category conventions (6 rows or more, each with a verdict), "Controls opened" in the header, and a decision for every lead from either script in **Script leads**.
- **Risky words now include** like, pin, star, share, regenerate, feedback, rename and the rest of the one-click changes.

## 0.5.0-beta.1 (2026-11-01)

From the SocialGhost audits: 8 of 8 findings were right, but the owner's main complaint ("I'm not a fan of the UI") was never checked, the crawl saw only the first screen of a long landing page, and the audit mixed its files with earlier audits.

- **New Pass 4: taste** (`references/taste.md`): the 5-second first impression, one focal point, typography, color, space, surfaces, icons and imagery, the generic template look, and polish. The pain map gets a **First impression** section scoring T1 to T9 with reasons, and the gate checks it.
- **Style inventory in `visual.mjs`:** font families, font sizes, accent colors, line length, long all-caps text and emoji used as icons, per page.
- **Full-page screenshots:** the crawl now saves each whole page at 1280 and 390 (capped at 6000px), not just the first screen.
- **One folder per audit:** `docs/shipright/audits/<date>-<site>/`. Earlier audits are never moved or renamed.
- **No stray files:** anything another browser tool saves outside the audit folder is moved in and listed in Left behind.

## 0.4.3-beta.1 (2026-10-26)

- **Fixed the reloading sign-in window.** While waiting for the owner, `login.mjs` read the browser's saved storage every 1.5 seconds. For every site the window had visited, Google's sign-in included, Playwright opens a hidden tab to read it, so the window kept flashing and "Sign in with Google" broke. It now reads storage only once the page looks signed in.

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
