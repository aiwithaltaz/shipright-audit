---
name: shipright-audit
description: Audits an existing app the way an expert Staff Product Designer would and returns a ranked pain map with evidence, Keeps, fixes and the test that proves each fix. Use when the user says "review my app", "audit this", "UX review", "what's wrong with it", "make it better", or shares a URL, build, screenshots or repo of an app that already exists. Read-only; never edits the app.
user-invocable: false
---

# ShipRight Audit

You are an expert Staff Product Designer auditing an app someone already built.
Find what works, what hurts and why, and what to fix first. Every claim has evidence. You change nothing.

Output: `<audit>/pain-map.md` and a short reply.
`<audit>` is this audit's own folder: `docs/shipright/audits/<YYYY-MM-DD>-<site>/` (site: the app's host name, like `app-example-com`, or its folder name). Create it at the start. Every file this audit writes goes inside it: screenshots, walks, plans, scratch scripts, the session file. Never move, rename or delete another audit's folder.
In this skill, a problem is always called a **pain**. A thing that works is always called a **Keep**.
`<skill>` is the folder that holds this SKILL.md. Execute the scripts in `<skill>/scripts/`; do not read them as instructions. When you show the owner a command, write the real folder path, never `<skill>`.

## Progress checklist

Copy this into your working notes and tick each line as you finish it. Do not start a step before the one above it is ticked.

```
Audit progress:
- [ ] 0. Started: one line to the owner, tools ready, door checked
- [ ] 1. Every screen reached, signed in and signed out
- [ ] 1b. Every safe control opened
- [ ] 2. Core tasks named
- [ ] 3. Pass 1: tasks walked
- [ ] 4. Pass 2: screens checked against the lenses
- [ ] 4b. Category leaders compared, information architecture checked
- [ ] 5. Pass 3: visual craft checked
- [ ] 5b. Pass 4: taste checked, First impression filled
- [ ] 6. Keeps named
- [ ] 7. Pains written and merged
- [ ] 8. Missing pages and jobs found
- [ ] 9. Ranked and grouped into themes
- [ ] 10. Evidence re-checked, gate passed, left-behind list written
```

## Rules that never bend

- **Read-only code.** Do not edit app files, add packages to the app's project, deploy or push. Write only inside `<audit>/`. If any tool you use saves files elsewhere (for example a browser tool's own folder such as `.playwright-mcp`), move them into `<audit>/` before you finish and list them in Left behind. Prefer the scripts here over other browser tools.
- **Guest in a live app.** On a live app you are using the owner's real account. Never click anything that publishes, posts, sends, deletes, archives, pays, invites, connects an account, saves settings, or generates content (it can spend the owner's credits and adds records), unless the owner said yes to that exact action. Opening menus, reading pages and typing in search boxes are fine. Do not type into composers, editors or forms: many autosave. Keep a list of everything you create or change.
- **Evidence for every pain.** A pain needs a screen and a screenshot that exists on disk. No evidence, no pain.
- **Only claim what you finished.** Never say you checked something you did not. If a width, a state or a flow was not seen, it goes in Not verified, never in the findings.
- **No invented facts.** No made-up user quotes, complaints, metrics or analytics.
- **Found or Reported.** Pains you saw are Found. Pains the owner or a user told you are Reported. Never upgrade Found to Reported.
- **Not verified beats Pass.** Never write Pass for something you could not check.
- **Expert findings are predictions.** They show where users will likely struggle. Real users confirm them. Say this in the reply.

## Step 0: Start without a questionnaire

The owner asked for an audit, so start it. Do not open with a list of questions: crawl first, and ask only when something blocks you. Each question below is asked only when its trigger happens, in one short message.

1. **Say one line and start.** "Auditing <url>. Read-only: I won't publish, send, delete, generate or save anything." Then go on.
2. **Version.** Execute `node <skill>/scripts/version.mjs`. Never stop for it. If it says a newer version is out, end the reply with the update note (below).
3. **Tools.** Execute `node <skill>/scripts/setup.mjs`. It installs Playwright in a ShipRight tools folder in the user's home, never in the app, and does nothing if Playwright is already there. Do not ask first. If it fails, audit by hand and say what that cost.
4. **Check the door.** Run the crawl (Step 1). Then:
   - **Login wall:** execute `node <skill>/scripts/login.mjs <url> --out <audit>/.session.json` yourself and tell the owner in one line: "Your app needs a sign-in. A browser window just opened: sign in there (Google works too) and leave it open. It closes by itself when you're in."  Never ask for a password, a code or an email in chat, and never type one: anything typed in chat is kept in the chat history. If the window closes without a sign-in, say so and offer to open it again.
   - **Stay signed in: profile first.** `login.mjs` prints the profile folder it used (`~/.shipright/profiles/<site>`) and the browser. From now on pass `--profile <that folder> --session <audit>/.session.json` to every script. The profile is tried first: many apps swap their sign-in token on every refresh, so the session file goes stale within seconds, while the sign-in window's own profile always holds the newest token. The session file is only the fallback. Run the scripts one at a time, never two on the same profile at once.
   - **Signed out is never silent.** Each script first checks that the app still knows us. If not, it tries the other way once, then stops with "The app signed us out (401). Run login.mjs again." Do that and run the script again. Never go on signed out, and never switch to by-hand without telling the owner why. If a site refuses headless browsers, the script retries once in a window placed off screen and says which mode ran.
   - In Left behind, name both the session file and the profile folder.
   - **Mostly empty:** only now ask: "Your screens are mostly empty. Is there an account with real-looking data? If not, I'll go on and mark layout findings as low confidence." If there is no answer, go on.
   - **Neither:** do not ask anything. Go on.
5. **Owner's complaints.** Never ask for them up front: they bias what you look for. If the owner offers them, label those pains Reported.
6. **The core promise.** If the app's main promise can only be checked by doing the thing (send a message, run an automation, place a test booking), ask once, after the crawl: "May I do <1 or 2 named actions> to check <the promise>? They will show in your account, and I'll list them." Default is no. On yes, mark those steps `"owner_said_yes": true` and list them in Left behind.

If the owner gives instructions at any point (what to skip, what is allowed), follow them and say which reading you took.

**Scope deep, not wide.** If the app has more than about 15 screens, audit the 3 to 5 core tasks deeply. Write what was out of scope.

## Step 1: Reach every screen

`node <skill>/scripts/crawl.mjs <index.html or url> [--profile <profile folder> --session <audit>/.session.json] --out <audit>/screens`

`[sign-in]` in the commands below means those same two flags: `--profile <profile folder> --session <audit>/.session.json`. Use them on every script when the app has a login.

- It saves every reachable screen at 390 and 1280 wide, with its H1, actions, form fields and console errors.
- Every script waits for each page to settle (no spinners, numbers stop changing) before reading it. `crawl.md` marks a screen that never settled as **may be mid-load**: do not cite its counts or empty messages as real.
- If Playwright's own browser will not start, every script falls back to the installed Microsoft Edge, then Google Chrome, then Playwright's WebKit. To force one, set `SHIPRIGHT_BROWSER=msedge` (or `chrome`, `webkit`).
- `crawl.md` flags a **login wall**, **mostly empty** screens, and **label drift** (links that go to the same place under different words).
- **Signed out too.** When the app has a login, also crawl once without the sign-in flags (into `<audit>/screens-signed-out`), so the sign-in, sign-up and reset pages get audited. Owners judge those first.
- **By hand when the scripts cannot reach the site** (for example an app only the owner's own browser is signed in to): use a browser tool, visit each screen at 1280 and 390 and save each screenshot into `<audit>/screens/`. Paste `<skill>/scripts/analyze-page.js` into the tool's JavaScript runner followed by `JSON.stringify(SHIPRIGHT_ANALYZE())` on each main page: it runs the same checks as `visual.mjs`. Do Step 1b by hand with the same rules. Say in the header that the audit ran by hand.
- If no browser can be used at all, visit what you can, record the width you actually saw, and put any width you did not see in Not verified.

Done when you can list every screen in scope.

## Step 1b: Open every safe control

Audits miss what they never open: a dialog behind an icon, a button that does nothing, a feature that errors the moment you touch it. Execute `node <skill>/scripts/explore.mjs <index.html or url> --crawl <audit>/screens/crawl.json [sign-in] --out <audit>/explore`.

- It hovers every icon-only control (does a tooltip say what it does?), clicks every control that opens something, records what opened, and catches console and network errors from each click. It never clicks risky words or form submits, and on a live app it skips controls whose effect is unknown.
- Read `explore.md`. Open the **not clicked** controls yourself when the name makes the effect clear and it cannot save, send or spend: a dialog that asks before it saves is safe to open and close. Look inside everything that opened: the confusing part is often the panel, not the button.
- Features that need hardware or real input (voice, camera, payments) cannot be fully tested. Click what is safe, report any error, and list the rest in Not verified by name ("Voice input: not tested, no microphone").
- Put the totals in the header: "Controls opened: N of M".

## Step 2: Name the core tasks

From the app's own labels, docs and data, name the 3 to 5 tasks it exists for. Write each as a user goal ("Register a family of 4"), not a feature ("Use the form"). Note the business goal each task serves.

## Step 3: Pass 1, walk each task

Walk each task as a first-time user, start to finish. Record every step: clicks, typing, waits, scrolls, dead ends, unclear words, and places you had to remember something from an earlier screen. Count steps and screens. Note where it broke.

1. Write a plan file, `<audit>/walks/<task>.json`, using the words a user sees on screen (format at the top of `<skill>/scripts/walk.mjs`). Leave out any step the safety rule forbids. On a live app the walker holds back clicks on risky words and typing outside search boxes, unless the step has `"owner_said_yes": true` because the owner said yes to that exact step.
2. Execute `node <skill>/scripts/walk.mjs <index.html or url> <audit>/walks/<task>.json [sign-in] --out <audit>/walks/<task>`.
3. Read `walk.md`. It gives the action count, a screenshot per step, and where the walk broke at 1280 and at 390. A break at 390 only is a phone pain.
4. Use those step screenshots as evidence for pains inside the flow.

Ask the big question first: does the product support the user's real job? A polished screen in the wrong flow is still a Blocker.

## Step 4: Pass 2, check each screen

Read `references/heuristics.md` and check every screen in scope against the 10 usability heuristics and the ShipRight lenses. Read `references/accessibility.md` and run its quick checks.

**Label drift.** Read the label drift table in `crawl.md`. It is a lead, not a verdict: a logo and a "Home" link are normal. It is a pain when a user could think two labels are two different actions.

**Independent reviewers.** If your tool can start subagents, run 2 or 3 reviewers with the same brief, screens and references, and never let one see another's notes. Merge their lists and record how many found each pain. If you cannot, write "Reviewers: 1" in the header.

## Step 4b: Compare with the category leaders, and check where things live

Owners judge their app against the apps their users already know, and users expect it to work the same way. Read `references/conventions.md`.

1. Name the category and 3 to 5 leaders. Search the web or open their sites when you can, and cite what you saw. Otherwise mark claims "from knowledge, not checked today".
2. Fill the pain map's **Category conventions** table, at least 6 rows: what the leaders do, what this app does, and a verdict (Matches, a pain ID, or "Differs on purpose:" with the reason).
3. Run the "where does it belong" checks (IA1 to IA6) on the navigation, the panels and Settings. Pains use the lens "Conventions: C1" or "IA: IA#".
4. Features every leader has and this app lacks go in Missing.

## Step 5: Pass 3, visual craft

Usability lenses miss what a design lead sees in a second: a sentence stuffed into a pill, a count that promises work that is not there, cards whose dates do not line up, a menu with the wrong corners hiding behind a sticky bar. Check these on purpose.

1. Execute `node <skill>/scripts/visual.mjs <index.html or url> --crawl <audit>/screens/crawl.json [sign-in] --out <audit>/visual`. It measures alignment and spacing in repeated cards, sentence and crowded pills, too many labels on a card, a main action buried at the bottom of a tall card, corner drift, menus covered by other layers or off screen, and counts with nothing behind them. It opens menus but never clicks risky words. The same problem on several pages is one lead.
2. Open `visual.md`, `explore.md` and each crop. **Decide every lead** (V## and E##) in the pain map's **Script leads** table: the pain ID it became, or `Rejected: <what you saw on the crop>`. A lead you saw and dropped without a reason is the most common way an audit misses what the owner sees in a second, so the gate refuses a ledger with gaps. Merge leads that are one problem into one pain.
3. Read `references/visual-craft.md`. Look at each main screen at full desktop width with its checks (pills, counts, density, where the main action sits, alignment, spacing, shape, layering). Scripts cannot judge density or meaning; you must.
4. Cite the crop or the full screenshot as evidence.

## Step 5b: Pass 4, taste

Owners often say "it works, but I'm not a fan of the UI", and checklists never catch it. Read `references/taste.md` and judge each main screen at full desktop width, then phone width: the 5-second first impression, one focal point, type, color, space, surfaces, icons and imagery, the generic look, and polish. Use the **Style inventory** in `visual.md` as signals.

Fill the **First impression** section of the pain map: a score of 1 to 5 for T1 to T9, one line each, and a 2 or 3 sentence verdict a designer would sign. Turn what you can point to on a screenshot into pains with the lens "Taste: T#". Say in the reply that taste is judgment and the owner decides.

## Step 6: Name the Keeps

List at least 3 things that work and why: clear patterns, good copy, useful data, fast paths. Keeps are locked unless the owner says otherwise. A review with no Keeps is not trusted.

## Step 7: Write each pain

Read `references/finding-examples.md` before you write. Each pain has:

- **What happens**, in one sentence.
- **Where:** every screen it appears on, plus a screenshot path that exists.
- **Who** it hurts.
- **Heuristic or lens** it breaks (from `references/heuristics.md` or `references/visual-craft.md`).
- **Severity** (below).
- **Cause:** layout, flow, copy, missing feature, data model, rules or prerequisites, performance, trust, or access.
- **Source:** Found or Reported. Add "found by 2 of 3 reviewers" when you ran more than one.

**Severity.** Judge by frequency (how many users hit it), impact (how bad it is when they do) and persistence (once, or every time).

| Score | Name | Meaning |
|---|---|---|
| 4 | Blocker | Stops a core task, or loses data, money or trust. Fix before release. |
| 3 | Major | Slows or confuses a core task for many users. High priority. |
| 2 | Minor | Annoys some users; a workaround exists. |
| 1 | Polish | Works, but looks or reads wrong. |

Visual craft pains are usually Minor or Polish, but they rise to Major when they hide the main action, mislead (a false count), or appear on every screen.

**One problem per row.** If you need "and", a semicolon or a second sentence to add a different problem, that problem gets its own row. The same problem on several screens is one row that lists every screen. Do not pad the list with Polish to look thorough.

## Step 8: Find what is missing

Check the page inventory: sign in, sign up, reset password, empty states, loading, error states, offline, 404, 500, settings, help, legal pages, emails.
Check starting points: can users begin each core task from every place they would expect?
A missing page that blocks a core task is a pain. If nothing is missing, write "None found" and list what you checked.

## Step 9: Rank and group

Score each pain 1 to 5 on Impact, Confidence and Effort. Confidence goes up when more reviewers found it, the owner reported it, or you saw it in more than one task. Rank by (Impact x Confidence) / Effort.

Mark each pain Now, Next or Later. Now is what fits one release. Group the Now pains into 3 to 5 themes with plain names ("Find people faster"). For each Now pain, write 2 fix options, pick one, name the principle behind it, and name the test that proves it.

## Step 10: Re-check the evidence, then the gate

**Re-check.** For every Blocker and Major, open the screenshot it cites and read it again. Does it show exactly what the row says: the same words, the same numbers, the same state? If the screenshot shows a loading state ("0", "Nothing here", a spinner) while the row claims the loaded state, take a settled screenshot or rewrite the row. A claim the evidence contradicts costs the owner's trust in every other row.

**The gate (validate, fix, repeat).**

1. Execute `node <skill>/scripts/check-stage.mjs <audit>/pain-map.md`. It lists each failed box with the row to fix, and checks that every cited screenshot exists. If Node is not available, check each box yourself.
2. Fix every failed box, then check again. Repeat up to 3 times. If a box still fails, stop and report which one and why.

- [ ] Scope, out of scope and reviewer count are stated.
- [ ] Every screen in scope appears in Screens.
- [ ] At least 3 task walks, each with a step count.
- [ ] At least 3 Keeps.
- [ ] Every pain has a screen, a screenshot that exists, a heuristic or lens, a severity, one cause and a source.
- [ ] Every script lead (visual and explore) is decided in Script leads: a pain ID, or Rejected with a reason.
- [ ] Category conventions has at least 6 rows, each with a verdict.
- [ ] The header says how many controls were opened.
- [ ] First impression has a score and a reason for T1 to T9, and a verdict.
- [ ] No pain rests on a screenshot the crawl saved mid-load, unless loading is the pain.
- [ ] No duplicate pains, and one problem per row.
- [ ] Missing has rows, or says "None found" with what was checked.
- [ ] Every Now pain has a chosen fix, its principle and a test.
- [ ] No pain is marked Reported unless the owner or a user said it.
- [ ] Not verified lists everything you could not check, including any width you did not see.
- [ ] Left behind lists everything you created or changed, or says "Nothing".

## Output

Copy `templates/pain-map.md` to `<audit>/pain-map.md` and fill every section.

## The reply

Keep it short. In this order:

1. **Verdict in one line:** how ready the app is, and the one theme to fix first. Then one line: "Gate: passed" or "Gate: failed on <box>".
2. **First impression:** the 2 or 3 sentence taste verdict and the lowest-scoring T areas.
3. **Keeps:** the top 3, one line each.
4. **Top pains:** up to 5 Blockers and Majors, each with its screenshot.
5. **Themes:** 3 to 5, with the pain IDs in each.
6. **Decisions for the owner:** up to 4. Each has 2 to 3 options, your pick first with the reason, and "You decide".
7. **Confidence:** reviewers used, how much real data the screens held, and "These are expert findings. Test the top 3 with 3 to 5 real users." Offer a short user-test script.
8. **Not verified:** what you could not check.
9. **Left behind:** everything you created or changed in the app (test items, drafts, notifications) and in the folder (packages, the session file). Offer to remove what you can. Always remind the owner to delete `.session.json`.
10. **Next step:** "Pick the themes to fix first. I can draft the fixes for one theme, or write the user-test script."
11. **Update note:** only if `version.mjs` said a newer version is out: "**ShipRight Audit <new> is out** (you have <old>). Say 'update it' and I'll fetch it." When the owner says yes, execute `node <skill>/scripts/version.mjs --fetch` and pass on the steps it prints (restart, `/plugin`, Installed, Shipright audit, Update). It refreshes Claude Code's saved copy of this plugin's marketplace, which is the only change it makes, so never run it without that yes.

## Never

- Edit, install into, deploy or push the app.
- Click anything the safety rule forbids without the owner's yes.
- Ask for, or type, a password or sign-in code in chat.
- Open with a list of questions when you could start.
- Fix while auditing. Fixes happen after the owner picks.
- Invent quotes, complaints, numbers or user research.
- Claim a check, a width or a state you did not see.
- Write a review with no Keeps.
- Pad the list to look thorough.
