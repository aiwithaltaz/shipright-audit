# Changelog

## 0.9.0-beta.1 (2026-11-18)

From a second real run of 0.8 on the AI chat app from earlier rounds, after many changes to it. It ran end to end on a Mac, waited for the owner's "use it like a user" answer, sent 2 test messages for $0, and found a money bug no read-only audit could find: opening an old paid chat changes the model of the next new chat. About 36 of its 39 findings were right (92%), and it found about 11.5 of the owner's 19 problems (about 60%; the goal is 70%). What it missed could all be checked by a script: a back arrow that went to an unrelated section, tabs that move the content up and down, input and button outlines that cannot be seen on a dark surface, one card with much tighter padding, messages that print over the message box, a theme switcher that loses "System" after one click, and two model pickers on one screen. Three findings were wrong or on purpose: floating labels reported as missing labels, a rail that opens on hover reported for missing tooltips, and an optional provider reported as a hidden requirement. The run itself tripped too: the audit browser was signed out twice mid-run, 8 view-filter switches were not turned back, a "What's new" dialog was closed with OK, and one check gave a different answer with Linux fonts. The goal for 0.9: catch every gap, stop the 3 false alarms, and add no new false alarms on the existing fixtures and benchmark apps.

- **Back goes back.** `explore.mjs` follows the links between pages, and on the page it lands on it clicks the in-app back control: a button or link named Back, or an unnamed left arrow at the top of the page or panel. It compares where it landed with the page it came from, from up to 2 different pages, because the bug often shows on one route only. Landing anywhere else is a `back-goes-elsewhere` lead that names the 3 pages: came from, went to, landed on. A back control with a risky word in its name is never clicked.
- **Sibling tabs must not move things.** For each tab group, and each set of sub-pages of one section that link to each other, `explore.mjs` opens every tab at 1280 and 390 and records where the content starts and whether a back control, a page title and a top action are there. `tab-shift`: the content start moves by more than 4px. `tab-chrome-differs`: a back control or a title shows on some tabs and not on others. When a sidebar or rail is in view, the lead says a back arrow is not needed there. A tab that gets selected is no longer reported as a dead control.
- **Component borders need contrast.** New page check `faint-border` (V14): the border of an input, dropdown, dropdown trigger, custom checkbox or radio button, or outline button, measured against the real surface behind it, and reported with the colors: `#3A3C39 on #2A2C29, 1.3:1`. A component whose fill contrasts at 3:1 or more needs no border. A flat 3:1 rule (WCAG 1.4.11) fired on 8 existing fixtures and benchmark apps, all with light gray borders on white (1.3:1 to 1.9:1), which people do see. So a lead also needs the border to be lost to the eye: a perceived lightness contrast under 8 (APCA), which is where dark gray on dark gray lands.
- **Tight padding.** New page check `tight-padding` (V15): surfaces of one kind (same fill, border, corner and shadow, side by side) are grouped, and the distance from the box edge to the nearest content is measured. A lead when one is under 60% of the median of the others, or under 8px while they use 12px or more. The crop shows the odd one next to a normal one.
- **Sticky and fixed layers need a solid background.** New check `see-through-layer` (V16), in `visual.mjs` and `samples.mjs`: it scrolls the page, and every box that scrolls, so content sits under each sticky or fixed layer (top bar, chips, message box, bottom bar), then looks for page text painted inside a layer with nothing solid behind it. The screenshot is taken while the content is under the layer. A fade, and a blur of 4px or more, are meant to be see-through and are skipped. By hand: `SHIPRIGHT_LAYERS()` in `analyze-page.js`.
- **Options must not vanish after use.** With the owner's yes (`--use`), or when the run is not signed in, `explore.mjs` picks each option of a theme switcher, view toggle or segmented control in turn, records the options offered after each pick, and puts the first state back. An option that can no longer be picked is an `option-vanished` lead. It handles a row of pressed buttons or a radio group, a button that steps through its options, and a button that opens a short list. It never picks options with risky or account-wide words, or what the owner's limits hold. Each pick counts as an action in the header, and the gate counts them.
- **Duplicate controls under different names.** Why 0.8 missed two model pickers: `duplicate-on-screen` only looks inside navigations and matches names and link targets. Two buttons with different names and no link never matched. `explore.mjs` now records what each control opens: two controls on one screen that open the same menu, or menus with over 80% of their option names in common, are one lead: "Two controls do the same job here: A and B both open ...". The same menu on every row of a list is not a duplicate.
- **Three false alarms stopped.** Floating labels are labels: before a field is reported as `unlabeled-field`, `explore.mjs` focuses it, types 1 character and deletes it. A label that moves above the field and stays in view while typing is a visible label. On a live app it types only into sign-in and search fields and never submits. A rail that opens on hover counts as labeled: no `no-tooltip` lead when hovering an icon shows its text label. And a new rule before a pain says a requirement is hidden: search the page and its FAQ for words that say it is optional or one choice of several ("or", "any", "your own key", "optional").
- **Signed out mid-run, fixed.** The cause, reproduced on the rotating-token fixture with a slow refresh: on an app that swaps its sign-in token on every refresh, `explore.mjs` loaded a page and reloaded it at once. The server had already swapped the token, the answer never reached the browser, and every later request got 401. `browser.mjs` now waits until no request from the page is in flight before any page load, reload, back or close. A sign-in that does end mid-run is no longer silent: "The app signed us out during this run", exit 3. New test: crawl, explore, samples and visual back to back on one profile.
- **Switches are turned back.** With 2 or more switches on one page, the click that should turn the second one back hit the first one, so only the first was restored. Each flipped switch now gets its own mark. After turning one back the script reads it again once the page settles, clicks once more if needed, then loads the page again. "Back after reload" (a `toggle-back-after-reload` lead: clicking again does not turn it off) is reported apart from "not back". Buttons of a segmented control are options, not switches, and are no longer flipped.
- **Dialogs are closed gently.** A dialog that covers a page when it loads is closed with Escape first, then its close (X) button, and OK, Got it or Dismiss only when neither works. Never Accept or Agree, and a cookie, consent or terms dialog is never answered with its own button. Every script lists what it closed and how, and the gate requires each one in Left behind.
- **The pointer rests in the bottom-right corner.** `explore.mjs` and `consistency.mjs` used to park the mouse at the top-left corner between actions. A left rail sits there, so a rail that opens on hover stayed open and its icons were read with their words (on Linux from the start, because the pointer begins in that corner). The pointer now rests in the bottom-right corner of the viewport, before the controls of a page are listed and after every hover.
- **`overflow-box` no longer depends on fonts.** It reports only when a chip sticks out by more than 2px and by more than 4% of the width of the box it sticks out of. A chip that sits inside its card on a Mac and 6px outside it on Linux stays quiet. 114px outside is still a lead.
- **Updates without the manual steps.** A Claude Code plugin can ship a `SessionStart` hook (`hooks/hooks.json`), and hooks fire in the terminal and in the desktop app. On each start it runs `version.mjs --fetch --quiet --hook`: when a newer version is out it fast-forwards the saved copy of the marketplace and says one line, "ShipRight audit <new version> is ready: open Plugins and click Update." Up to date or offline it says nothing. It always exits 0, cuts the network part off after 2 seconds, and is switched off with `SHIPRIGHT_NO_UPDATE_CHECK=1`. Checked in a real terminal session. In the desktop app it rests on the Claude Code docs: not yet seen running there.
- **One tip in the first message:** "Tip: drop a file with your design decisions (a changelog, a style guide) into this folder, so I don't flag your choices."
- **Tests:** a new test for every "Done when" in `tests/v09.mjs` (run by `npm test`, or alone with `node tests/v09.mjs [group]`), 10 new generic fixtures, and 2 new gate self-test cases. The new checks stay at 0 leads on every older fixture and all 4 benchmark apps.

## 0.8.0-beta.1 (2026-11-16)

From a real run of 0.7 on a signed-in AI video tool for creators (dashboard, idea generator, calendar, projects, assets) on a Mac, signed in with Google through the profile reuse. It covered 16 of 16 screens at phone width, researched the leaders live with links, and all 32 of its findings were right (100%). But it found only about 2.5 of the owner's 16 current problems (about 15%). The owner had read its list first, so that number is low on purpose, but the misses showed clear gaps: template text left in view, icons too light to see, chips outside their card, the same summary and the same controls twice on one screen, two toolbar rows that could be one, stars with no way to filter by them, and card buttons judged without mapping the item's life. The run itself also tripped: it asked to use the app and went on read-only in the same breath, so the owner never saw the question. After sign-in the crawl found only public pages. The sign-in flags sat in a shell variable that zsh passed as one word, so the first signed-in crawl ran signed out. `samples.mjs` found no items because the cards open through buttons. And `owner-rules.mjs` read ShipRight's own rules as the owner's. The goal for 0.8: catch these kinds of problems, and keep 80% or more of findings right.

- **The use-it question is asked at the start, and waited for.** The first message carries it next to the read-only line: "may I use the app like a real user?", with its limits. The crawl, explore and research go on while waiting. Before any step that needs the answer the audit stops and waits. Silence is never a no in a live session. Only a session nobody is watching (scheduled or headless) goes on read-only, and says so. A "yes with limits" answer is kept in `<audit>/use-limits.json` in the owner's words, and `explore.mjs --use` and `walk.mjs` hold whatever it rules out. Header: `Used as a user: yes (N actions)`, `yes with limits: "<owner's words>" (N actions)`, `no`, or `not answered (unattended)`. The gate fails "not answered" without "unattended".
- **Sign-in from one file.** `login.mjs --audit <audit>` writes `<audit>/signin.json`: the profile path, the browser, the session file and the page the app landed on after sign-in. Every script takes `--audit <audit>` and needs no other sign-in flag (the old `--profile` and `--session` still work). `--audit` also sets where each script writes and which crawl it reads. The crawl starts on the landing page too and follows its links first, so an app that the public page never links into is still crawled, and the sign-in check runs on a page that needs the sign-in. `crawl.mjs --signed-out` ignores the sign-in. `login.mjs` no longer saves a sign-in from a public page that still shows "Sign in". The skill now writes every command in full: never put flags in a shell variable, because zsh passes a variable as one word.
- **Items that open through buttons.** When a list has no item links, `samples.mjs` opens up to 5 items through the read-only button on each card: View, Open, Preview, Details, Review, Watch, or an icon button whose name says so. It records what opened (a dialog, a panel, a new page, or nothing), screenshots it at 1280 and 390, runs the checks on what opened, then closes it. A button that opens nothing is an R## lead. It never clicks Edit and never a risky word.
- **The right folder's rules, and never ShipRight's own.** `owner-rules.mjs` skips `skills/shipright-audit/`, `tests/fixtures/`, `.claude-plugin/`, `.codex-plugin/` and any folder whose `package.json` or plugin manifest is named `shipright-audit`. With the new `--app <url>`, a folder that never mentions the app's host or name gives "No rules for this app in this folder" and nothing is quoted. The audit tells the owner once: "Run audits in an empty folder or in the app's own project folder."
- **Five new page checks** in `analyze-page.js`, each a lead with a cropped screenshot at every width: **template text** (`[topic]`, `{name}`, `{{ }}`, `%s`, `${...}`, "lorem ipsum", "undefined", "null", "NaN", "[object Object]", "TODO"), **faint icons** (under 3:1 against their real background, WCAG 1.4.11, from the SVG stroke or fill or the icon font color, with opacity included), **overflowing its box** (a chip, pill, badge or button more than 2px outside its card), **duplicates on one screen** (the same text block of 40 characters or more in two sections, or the same control in two navigations), and **stacked control rows** (2 rows of search, sort, filters or tabs above one list, each under half the width: "could these be one row?"). They are V9 to V13 in `references/visual-craft.md`.
- **Markers you can set must be filterable.** Without clicking, `explore.mjs` looks at list items that carry a star, favorite, like, pin, bookmark, save or flag, and then for a filter, tab, chip or sort option with the same word. If there is none: `marker-no-filter`, "You can star items but not see only starred items."
- **Item lifecycles (new Step 2b).** Before it judges an item's buttons, the audit lists every state of each main item type (Editing, Rendering, Ready, Scheduled, Posted, Failed) and the actions offered in each, and checks 4 questions: one clear next step, a way back into unfinished work, final actions only once the item is ready, and a failed state that says why and how to fix it. New pain-map section **Item lifecycles** and lens L10. `visual.mjs` lists the states it saw. The gate requires the table when an item type shows 3 or more states, and a Keep about item actions must point to a lifecycle row that passed all 4 questions.
- **Create, Add and New on a live app** are clicked only when they show that they open something (`aria-haspopup`, `aria-expanded`, a link to a new page) or the owner allowed them. Otherwise they are held: "could create an item".
- **One new lead on the benchmark apps, and it is real:** the template-text check finds the lorem ipsum on one seeded app's Reports page, which its answer key lists. The cases and answer keys are unchanged.
- **Tests:** 81 checks (was 51), with 6 new generic fixtures. Every "Done when" in the 0.8 brief has a test, in `tests/v08.mjs` (run by `npm test`, or alone with `node tests/v08.mjs`) and in the gate self-test.

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
