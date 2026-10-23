# Heuristics and lenses

Use in Step 4 (pass 2). Check every screen in scope against each item. Name the item a pain breaks.

Contents:
- Part A: The 10 usability heuristics (H1 to H10)
- Part B: ShipRight lenses (L1 to L9)

## Part A: The 10 usability heuristics

Based on Jakob Nielsen's 10 usability heuristics, written in our own words with checks.

**H1. Show what is happening.**
Check: after every action, the user sees a result within a second (loading, saved, sent). Status is visible without hunting.
Pain example: "Submit" gives no feedback for 4 seconds, so users click twice.

**H2. Speak the user's language.**
Check: labels use the user's words, not internal or technical terms. Order follows the real-world process.
Pain example: a button says "Persist record" instead of "Save".

**H3. Let users undo and exit.**
Check: every flow has Back, Cancel or Close. Destructive actions offer undo or confirm.
Pain example: a 5-step form has no Back button; a mistake means starting over.

**H4. Be consistent.**
Check: the same action has the same label, look and place everywhere. Platform patterns are followed.
Pain example: "Save" on one screen, "Submit" on another, for the same action.

**H5. Prevent errors.**
Check: invalid choices are blocked up front (disabled dates, input masks, limits shown). Requirements appear before the user starts, not at the end.
Pain example: a date picker allows dates the business cannot serve.

**H6. Show, do not make users remember.**
Check: options and earlier choices stay visible. Users never copy a value from one screen to type into another.
Pain example: an order number appears on screen 2 and must be typed again on screen 4.

**H7. Make frequent tasks fast.**
Check: the most common tasks take the fewest steps. Shortcuts, defaults, bulk actions and saved choices exist where users repeat work.
Pain example: staff must open each row to mark it done; there is no bulk action.

**H8. Show only what matters.**
Check: run the removal test (L1). Nothing competes with the primary action.
Pain example: four equal-weight buttons in the hero; no clear first step.

**H9. Help users fix errors.**
Check: errors say what went wrong and how to fix it, in plain words, next to the field. Errors do not wipe what the user typed.
Pain example: "Error 422" with the form cleared.

**H10. Offer help where it is needed.**
Check: help sits where the question comes up (a hint by the field, not a separate FAQ). It sits in the same place on every page.
Pain example: the only explanation of "family plan" is buried on the FAQ page.

## Part B: ShipRight lenses

**L1. Removal test.** For every element, ask in order. One bad answer means it should go:
1. Does it repeat something already on screen?
2. Does it have a job the user needs right now?
3. Is it real and confirmed?
4. Is it for this phase?
5. Is it for this audience?
6. Does it compete with the primary action?

**L2. Layout.**
- Ordered by what the user needs first.
- Related things grouped; secondary facts sit beside their main fact.
- Each control sits where its work happens.
- Edges line up across columns.
- One hero element per screen; the rest are quieter.
- Every state is visible and looks like what it is (done looks done, disabled looks disabled).

**L3. Visual hierarchy.**
- One primary action per screen. Competing actions do not share the same color and size.
- Type sizes form a clear ladder (title, section, body, caption).
- Hover, focus and pressed states exist on every interactive element.
- Spacing comes from one scale; no random gaps.

**L4. Work screens (dashboards, lists, admin tools).**
- The main heading states the situation with numbers ("12 orders waiting, 3 late"), not just a label ("Orders").
- Each problem row carries the action that fixes it.
- Numbers show their normal value for comparison ("18%, usually 2%").
- No empty side panel by default.
- No developer or preview controls visible to users.

**L5. Consistency across the app.**
- Same job, same label, same component.
- Same status, same color and wording everywhere.
- Different buttons for the same purpose are a pain.

**L6. Content.**
- No outdated content, filler words or placeholder text.
- Labels and buttons say the result ("Send invoice", not "Submit").
- Empty states tell the user what to do next.

**L7. Phone and speed.**
- Works at 390 wide with no sideways scroll.
- Key action reachable without hunting on phone.
- Images are sized for the screen; nothing over about 500 KB without reason.
- No console errors or broken links.

**L8. Trust.**
- No fake counters, invented reviews or logos.
- Sample data is labeled as sample.
- No features promised that do not exist.
- Prices, fees and limits are shown before commitment.

**L9. Job fit.**
- Does the product support the user's real job end to end, or only part of it?
- Is there a step users must do outside the app (a spreadsheet, a phone call) that the app should cover?
