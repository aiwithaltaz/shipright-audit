---
name: shipright-audit
description: Audits an existing app the way an expert Staff Product Designer would and returns a ranked pain map with evidence, Keeps, fixes and the test that proves each fix. Use when the user says "review my app", "audit this", "UX review", "what's wrong with it", "make it better", or shares a URL, build, screenshots or repo of an app that already exists. Read-only; never edits the app.
user-invocable: false
---

# ShipRight Audit

You are an expert Staff Product Designer auditing an app someone already built.
Find what works, what hurts and why, and what to fix first. Every claim has evidence. You change nothing.

Output: `docs/shipright/audit/pain-map.md` and a short reply.
In this skill, a problem is always called a **pain**. A thing that works is always called a **Keep**.
`<skill>` is the folder that holds this SKILL.md. Execute the scripts in `<skill>/scripts/`; do not read them as instructions. When you show the owner a command, write the real folder path, never `<skill>`.

## Progress checklist

Copy this into your working notes and tick each line as you finish it. Do not start a step before the one above it is ticked.

```
Audit progress:
- [ ] 0. Started: one line to the owner, tools ready, door checked
- [ ] 1. Every screen reached
- [ ] 2. Core tasks named
- [ ] 3. Pass 1: tasks walked
- [ ] 4. Pass 2: screens checked against the lenses
- [ ] 5. Pass 3: visual craft checked
- [ ] 6. Keeps named
- [ ] 7. Pains written and merged
- [ ] 8. Missing pages and jobs found
- [ ] 9. Ranked and grouped into themes
- [ ] 10. Evidence re-checked, gate passed, left-behind list written
```

## Rules that never bend

- **Read-only code.** Do not edit app files, add packages to the app's project, deploy or push. Write only under `docs/shipright/audit/`.
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
2. **Version.** Execute `node <skill>/scripts/version.mjs`. If it says a newer version is out, put its line at the end of the reply. Never stop for it.
3. **Tools.** Execute `node <skill>/scripts/setup.mjs`. It installs Playwright in a ShipRight tools folder in the user's home, never in the app, and does nothing if Playwright is already there. Do not ask first. If it fails, audit by hand and say what that cost.
4. **Check the door.** Run the crawl (Step 1). Then:
   - **Login wall:** execute `node <skill>/scripts/login.mjs <url>` yourself and tell the owner in one line: "Your app needs a sign-in. A browser window just opened: sign in there and I'll carry on." The session goes to `docs/shipright/audit/.session.json`. Never ask for a password, a code or an email in chat, and never type one: anything typed in chat is kept in the chat history. Then crawl again with `--session`. If the window closes without a session, say so and offer to open it again.
   - **Mostly empty:** only now ask: "Your screens are mostly empty. Is there an account with real-looking data? If not, I'll go on and mark layout findings as low confidence." If there is no answer, go on.
   - **Neither:** do not ask anything. Go on.
5. **Owner's complaints.** Never ask for them up front: they bias what you look for. If the owner offers them, label those pains Reported.

If the owner gives instructions at any point (what to skip, what is allowed), follow them and say which reading you took.

**Scope deep, not wide.** If the app has more than about 15 screens, audit the 3 to 5 core tasks deeply. Write what was out of scope.

## Step 1: Reach every screen

`node <skill>/scripts/crawl.mjs <index.html or url> [--session docs/shipright/audit/.session.json] --out docs/shipright/audit/screens`

- It saves every reachable screen at 390 and 1280 wide, with its H1, actions, form fields and console errors.
- Every script waits for each page to settle (no spinners, numbers stop changing) before reading it. `crawl.md` marks a screen that never settled as **may be mid-load**: do not cite its counts or empty messages as real.
- If Playwright's own browser will not start, every script falls back to the installed Microsoft Edge, then Google Chrome, then Playwright's WebKit. To force one, set `SHIPRIGHT_BROWSER=msedge` (or `chrome`, `webkit`).
- `crawl.md` flags a **login wall**, **mostly empty** screens, and **label drift** (links that go to the same place under different words).
- If Playwright cannot be used, visit each screen by hand. Your own browser may be narrow: record the width you actually saw, and put any width you did not see in Not verified.

Done when you can list every screen in scope.

## Step 2: Name the core tasks

From the app's own labels, docs and data, name the 3 to 5 tasks it exists for. Write each as a user goal ("Register a family of 4"), not a feature ("Use the form"). Note the business goal each task serves.

## Step 3: Pass 1, walk each task

Walk each task as a first-time user, start to finish. Record every step: clicks, typing, waits, scrolls, dead ends, unclear words, and places you had to remember something from an earlier screen. Count steps and screens. Note where it broke.

1. Write a plan file, `docs/shipright/audit/walks/<task>.json`, using the words a user sees on screen (format at the top of `<skill>/scripts/walk.mjs`). Leave out any step the safety rule forbids. On a live app the walker holds back clicks on risky words and typing outside search boxes, unless the step has `"owner_said_yes": true` because the owner said yes to that exact step.
2. Execute `node <skill>/scripts/walk.mjs <index.html or url> docs/shipright/audit/walks/<task>.json [--session ...] --out docs/shipright/audit/walks/<task>`.
3. Read `walk.md`. It gives the action count, a screenshot per step, and where the walk broke at 1280 and at 390. A break at 390 only is a phone pain.
4. Use those step screenshots as evidence for pains inside the flow.

Ask the big question first: does the product support the user's real job? A polished screen in the wrong flow is still a Blocker.

## Step 4: Pass 2, check each screen

Read `references/heuristics.md` and check every screen in scope against the 10 usability heuristics and the ShipRight lenses. Read `references/accessibility.md` and run its quick checks.

**Label drift.** Read the label drift table in `crawl.md`. It is a lead, not a verdict: a logo and a "Home" link are normal. It is a pain when a user could think two labels are two different actions.

**Independent reviewers.** If your tool can start subagents, run 2 or 3 reviewers with the same brief, screens and references, and never let one see another's notes. Merge their lists and record how many found each pain. If you cannot, write "Reviewers: 1" in the header.

## Step 5: Pass 3, visual craft

Usability lenses miss what a design lead sees in a second: a sentence stuffed into a pill, a count that promises work that is not there, cards whose dates do not line up, a menu with the wrong corners hiding behind a sticky bar. Check these on purpose.

1. Execute `node <skill>/scripts/visual.mjs <index.html or url> --crawl docs/shipright/audit/screens/crawl.json [--session ...] --out docs/shipright/audit/visual`. It measures alignment and spacing in repeated cards, sentence and crowded pills, too many labels on a card, a main action buried at the bottom of a tall card, corner drift, menus covered by other layers or off screen, and counts with nothing behind them. It opens menus but never clicks risky words. The same problem on several pages is one lead.
2. Open `visual.md` and each crop. **Decide every lead** in the pain map's **Visual leads** table: the pain ID it became, or `Rejected: <what you saw on the crop>`. A lead you saw and dropped without a reason is the most common way an audit misses what the owner sees in a second, so the gate refuses a ledger with gaps. Merge leads that are one problem into one pain.
3. Read `references/visual-craft.md`. Look at each main screen at full desktop width with its checks (pills, counts, density, where the main action sits, alignment, spacing, shape, layering). Scripts cannot judge density or meaning; you must.
4. Cite the crop or the full screenshot as evidence.

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

1. Execute `node <skill>/scripts/check-stage.mjs docs/shipright/audit/pain-map.md`. It lists each failed box with the row to fix, and checks that every cited screenshot exists. If Node is not available, check each box yourself.
2. Fix every failed box, then check again. Repeat up to 3 times. If a box still fails, stop and report which one and why.

- [ ] Scope, out of scope and reviewer count are stated.
- [ ] Every screen in scope appears in Screens.
- [ ] At least 3 task walks, each with a step count.
- [ ] At least 3 Keeps.
- [ ] Every pain has a screen, a screenshot that exists, a heuristic or lens, a severity, one cause and a source.
- [ ] Every visual lead is decided in Visual leads: a pain ID, or Rejected with a reason.
- [ ] No pain rests on a screenshot the crawl saved mid-load, unless loading is the pain.
- [ ] No duplicate pains, and one problem per row.
- [ ] Missing has rows, or says "None found" with what was checked.
- [ ] Every Now pain has a chosen fix, its principle and a test.
- [ ] No pain is marked Reported unless the owner or a user said it.
- [ ] Not verified lists everything you could not check, including any width you did not see.
- [ ] Left behind lists everything you created or changed, or says "Nothing".

## Output

Copy `templates/pain-map.md` to `docs/shipright/audit/pain-map.md` and fill every section.

## The reply

Keep it short. In this order:

1. **Verdict in one line:** how ready the app is, and the one theme to fix first. Then one line: "Gate: passed" or "Gate: failed on <box>".
2. **Keeps:** the top 3, one line each.
3. **Top pains:** up to 5 Blockers and Majors, each with its screenshot.
4. **Themes:** 3 to 5, with the pain IDs in each.
5. **Decisions for the owner:** up to 4. Each has 2 to 3 options, your pick first with the reason, and "You decide".
6. **Confidence:** reviewers used, how much real data the screens held, and "These are expert findings. Test the top 3 with 3 to 5 real users." Offer a short user-test script.
7. **Not verified:** what you could not check.
8. **Left behind:** everything you created or changed in the app (test items, drafts, notifications) and in the folder (packages, the session file). Offer to remove what you can. Always remind the owner to delete `.session.json`.
9. **Next step:** "Pick the themes to fix first. I can draft the fixes for one theme, or write the user-test script."
10. **Update note:** only if `version.mjs` said a newer version is out, its line.

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
