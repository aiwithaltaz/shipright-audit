# Pain map: <app name>

Audited: <date> · Screens in scope: <n> · Tasks walked: <n> · Controls opened: <n of m> · Reviewers: <n> · Method: <crawl / by hand / screenshots> · Widths seen: <390, 1280, or the width you actually saw> · Data: <realistic / sparse / empty>
Phone coverage: <x of y> in-scope screens · Used as a user: <yes (n actions) / no> · Competitor research: <live, checked <date> / from knowledge, no web tool>
Scope: <the core tasks audited>
Out of scope: <what was not audited>
Context used: <users, business goal, analytics, owner rules read (owner-rules.md), files skipped for fairness: or "none given">

## First impression

<2 or 3 sentences: what a new user feels in the first 5 seconds, and the one change that would help most>

| Area | Score (1-5) | Why |
|---|---|---|
| T1 First impression | | |
| T2 One focal point | | |
| T3 Typography | | |
| T4 Color | | |
| T5 Space and rhythm | | |
| T6 Surfaces and depth | | |
| T7 Icons and imagery | | |
| T8 The generic look | | |
| T9 Detail and polish | | |

## Screens

Every screen needs its 1280 and its 390 screenshot. A screen you could not see at 390 goes in Not verified by name.

| Screen | Job | Primary action | Actions | States seen | Screenshots (1280 and 390) |
|---|---|---|---|---|---|

## Task walks

| Task | Business goal | Steps | Screens | Dead ends | Where it broke |
|---|---|---|---|---|---|

## Keeps

| ID | Keep | Why it works | Where |
|---|---|---|---|

## Pains

| ID | What happens | Where (screens + screenshot) | Who | Heuristic or lens | Severity (1-4) | Cause | Source |
|---|---|---|---|---|---|---|---|

## Owner decisions respected

Fill this when `owner-rules.md` exists. These differ from the leaders or from good practice, but match a decision the owner wrote down, so they are not pains. Quote the owner word for word. Write "None" and why if there are none.

| What the app does | Owner's words (quoted) | File and line | What it differs from |
|---|---|---|---|

## Category conventions

Leaders compared: <3 to 5 apps, and why>

At least 10 rows. Kind is "Where it sits" or "How it works" (at least 3). Source is the URL you opened and the date you checked, like `https://help.example.com/tools (checked 2026-11-12)`.

| Area | Kind | What the leaders do | This app | Source | Verdict |
|---|---|---|---|---|---|

## Script leads

One row per lead in `visual/visual.md` (V##), `explore/explore.md` (E##), `samples/samples.md` (R##), `consistency/consistency.md` (C##) and each `walk.md` (W-...). Decision: the pain ID it became, or "Rejected: <what you saw>".

| Lead | Check | Decision |
|---|---|---|

## Missing

| Page or job | Why it matters | Pain ID (if it blocks a task) |
|---|---|---|

### What leaders have that this app doesn't

| Feature | Leaders that have it (named and linked) | Pain ID (if users will look for it) |
|---|---|---|

## Fix map

| ID | Fix A | Fix B | Chosen | Principle | Test that proves it | Impact | Confidence | Effort | Score | Now / Next / Later |
|---|---|---|---|---|---|---|---|---|---|---|

## Themes

| Theme | Pain IDs |
|---|---|

## Not verified

- <what could not be checked, and why>
- <if the app was not used as a user: How features behave when used (switches, sending, results)>

## Left behind

| Where | What I created or changed | Removed? |
|---|---|---|
| <the app or the folder> | <every test message and test item, every switch flipped and turned back, a draft, Playwright packages, .session.json, the sign-in profile folder> | <yes, or no and why> |
