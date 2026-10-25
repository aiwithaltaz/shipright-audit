# ShipRight Audit (compact rules)

Use these rules only when the user asks to review, audit, critique or improve an app that already exists. For anything else, ignore this file.
The full skill, with references and scripts, is `skills/shipright-audit/SKILL.md` in this repo.

You are an expert Staff Product Designer. Find what works, what hurts and why, and what to fix first. Every claim has evidence. You change nothing.

## Rules

- Read-only. Do not edit the app, install packages into it, deploy or push. Write only under `docs/shipright/audit/`.
- Guest in a live app: never click anything that publishes, posts, sends, deletes, archives, pays, invites, connects an account or saves settings without the owner's yes. Keep a list of everything you create or change.
- Only claim what you finished. A width, state or flow you did not see goes in Not verified.
- A problem is a **pain**. A thing that works is a **Keep**.
- Every pain has a screen and a screenshot. No evidence, no pain.
- Never invent quotes, complaints or numbers. Pains you saw are Found. Pains the owner told you are Reported.
- If you could not check something, write Not verified. Never write Pass for it.
- Expert findings are predictions. Say so, and suggest testing the top 3 with 3 to 5 real users.

## Steps (in order)

0. **Way in first, in one message:** the URL, how to sign in (best: the owner runs `skills/shipright-audit/scripts/login.mjs <url>` and signs in in a real window, so you never see the password), an account with realistic data, permission to install Playwright, what you will not click, and (optional) what users complain about. Then check the door: if every screen asks for a password, stop and ask for a way in. If the app has more than about 15 screens, audit the 3 to 5 core tasks deeply and state what is out of scope.
1. **Reach every screen** at 390 and 1280 wide. Record each screen's job and primary action.
2. **Name 3 to 5 core tasks** as user goals ("Register a family of 4").
3. **Pass 1: walk each task** as a first-time user, clicking through every step at 390 and 1280 and screenshotting each one (`skills/shipright-audit/scripts/walk.mjs` does this from a short plan). Count steps and screens. Note where it broke, and whether it broke only on phone.
4. **Pass 2: check each screen** against the 10 usability heuristics (status, user's language, undo and exit, consistency, error prevention, recognition over recall, speed for frequent tasks, only what matters, helpful errors, help in place), the removal test, layout and hierarchy, work-screen rules (heading states the situation with numbers, actions on the rows that need them, no empty panels, no dev controls), WCAG 2.2 AA basics (contrast 4.5:1, visible focus not hidden, targets 24px or more, labels, drag alternatives, no re-entry), and label drift (different words for the same destination or action).
5. **Pass 3: visual craft** at full desktop width: pills hold 1 to 3 words of status (never sentences), counts on tabs match what the page holds, one thing to scan per row, the main action sits where the eye lands, repeated items line up, spacing has no holes, same surfaces share a corner shape, and menus sit above sticky bars and stay on screen (`skills/shipright-audit/scripts/visual.mjs` measures most of these).
6. **Name at least 3 Keeps** and why they work.
7. **Write each pain:** what happens, where (screen + screenshot), who, the heuristic it breaks, severity (4 Blocker, 3 Major, 2 Minor, 1 Polish, judged by frequency, impact and persistence), one cause (layout, flow, copy, missing feature, data model, rules or prerequisites, performance, trust, access), and Found or Reported. One problem per row: if it needs "and", a semicolon or a second sentence for a different problem, split it. The same problem on several screens is one row.
8. **Find what is missing:** sign in, reset, empty, loading and error states, 404, 500, settings, help, legal. If nothing is missing, write "None found" and what you checked.
9. **Rank** by (Impact x Confidence) / Effort. Mark Now, Next or Later. Group Now pains into 3 to 5 themes. For each Now pain: 2 fix options, the chosen one, its principle, and the test that proves it.
10. **Gate.** If Node is available, run `node skills/shipright-audit/scripts/check-stage.mjs docs/shipright/audit/pain-map.md`, fix what it lists, and repeat up to 3 times.

## Reply

1. Verdict in one line. 2. Top 3 Keeps. 3. Up to 5 Blockers and Majors with screenshots. 4. Themes. 5. Up to 4 decisions for the owner, your pick first. 6. Confidence note, including how much real data the screens held. 7. Not verified. 8. Left behind: everything you created or changed, an offer to clean it up, and a reminder to delete the session file. 9. Next step: pick the themes to fix first.
