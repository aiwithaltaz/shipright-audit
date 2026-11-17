# Visual craft lens

Use in Step 5 (Pass 3). Look at each main screen at full desktop width, then at 390. Name the item (V1 to V13) a pain breaks.
These are the problems a design lead spots in a second and usability checklists miss. `visual.mjs` measures V1, V2, V5, V6, V7, V8 and V9 to V13, and flags the clearest cases of V3 (too many labels on a card) and V4 (the only action buried at the bottom of a tall card). Density and placement still need your eyes on every main screen.

Contents: V1 Pills · V2 Counts · V3 Density · V4 Where the main action sits · V5 Alignment · V6 Spacing · V7 Shape and elevation · V8 Layering · V9 Template text · V10 Faint icons · V11 Overflowing its box · V12 Duplicates on one screen · V13 Stacked control rows

## V1. Pills and badges are labels, not sentences

A pill names a status or a category in 1 to 3 words ("Draft", "Needs review", "Vegetarian"). It is scanned, not read.
- A pill with a sentence, a description or a call to action in it is misused. That text belongs in body text or a banner.
- One color means one thing across the whole app. "Confirmed" is the same color everywhere.
- More than about 4 pills on one item stop working as labels. Keep the 1 or 2 that change what the user does.
- Pain example: "Each order card shows a long green pill reading 'Customer asked us to leave it with the neighbor'. It competes with the title and is not a status."

## V2. A number on a tab means "this many need you"

People read a count on a tab or nav item like a notification badge.
- Count only what needs action ("3 to review"), or label what it counts ("12 total").
- A count with an empty page behind it breaks trust: the user clicks for the 12 and finds nothing.
- A count that reads 0 while loading and then jumps is a loading problem (H1), not a count.
- Pain example: "The Returns tab shows 8, but the Returns page says there are no returns to process."

## V3. Density: one thing to scan per row

A list exists to be scanned. Ask: what is the one thing the user looks for in each row?
- Each row or card shows the title, 1 or 2 facts that decide the next action, and one action. The rest belongs in the detail view.
- More than about 5 facts, pills or buttons per item reads as a wall. Group long lists (by day, status or owner).
- Every row shown at full detail is a sign that nothing was ranked.
- Pain example: "The patients list shows 11 fields per row, so the one that matters (next appointment) does not stand out."

## V4. The main action sits where the eye lands

- In a card or row, the main action sits near the title or at a consistent edge, not below a long body where it is easy to miss.
- On a screen, the primary button is visible without scrolling on a laptop.
- A key action that looks like plain text, or sits under a fold, is a pain even when it works.
- Pain example: "Track package sits under a long product description at the bottom of each order card and is easy to miss."

## V5. Repeated items line up

- Dates, prices, statuses and buttons sit on the same line and at the same edge across cards in a row and down a list.
- Text that changes length (titles, descriptions) must not push the shared parts out of line. Pin them to the card's bottom or use a grid.
- Pain example: "Recipe cards show the cook time and the Save button at different heights from card to card."

## V6. Spacing comes from one scale

- Gaps come from one small set (for example 4, 8, 12, 16, 24, 32). Related things sit closer than unrelated things.
- One gap inside a card that is far bigger than the others reads as a hole, or as two cards.
- Pain example: "Listing cards have about 80px of empty space above the price, so the price looks like it belongs to the next card."

## V7. Same kind of surface, same shape

- Cards, menus, popovers and dialogs share the system's corner radius and shadow. Buttons share one radius, and inputs share one.
- A square menu among rounded cards looks broken, even if nobody can say why.
- Pain example: "The filter dropdown has square corners while every card and button is rounded at about 12px."

## V8. Layers stack in the right order

- Menus, popovers, tooltips and dialogs sit above everything, including sticky headers, bottom bars and chat composers.
- Nothing covers an open menu, and no menu runs off the edge of the screen.
- Pain example: "The sort menu opens behind the sticky checkout bar, so its last two options are hidden."

## V9. No template text in view

Text that was meant to be filled in and never was. Users read it as "this product is not finished".
- Look for slots: `[topic]`, `{name}`, `{{ title }}`, `%s`, `${count}`. Look for filler and code leftovers: "lorem ipsum", "undefined", "null", "NaN", "[object Object]", "TODO: ...".
- The script (`template-text`) skips code blocks, keyboard keys, inputs, text areas and editors: there the text may be the user's own. It also skips stage notes written on purpose, like "[Hook]" in a script.
- Reject the lead only when the text is the user's own content. A slot in a heading, a card or a button is a pain.
- Pain example: "An idea card's title reads '5 ways to [verb] your {noun}': the slots were never filled."
- Cause: usually copy or data model. Severity: 2, or 3 when it is on a main screen.

## V10. Icons are dark enough to see

An icon is a control or a label. If it is too light, the control is hidden.
- Icons need a contrast of 3:1 against the background they really sit on (WCAG 1.4.11, non-text contrast). Text needs 4.5:1, and the scripts check text and icons apart.
- The script (`faint-icon`) measures the SVG's stroke or fill, or the icon font's color, with every opacity on the way included. It checks icon-only controls and icons next to labels. Disabled controls are exempt.
- An icon over a picture or a gradient cannot be measured: look at those yourself.
- Pain example: "The sort, filter and view icons are light gray on white (1.4:1), so the toolbar looks empty."
- Cause: layout or access. Severity: 2, or 3 when the faint icon is the only way to reach a core action.

## V11. Nothing sticks out of its box

A chip, pill, badge or button belongs inside its card.
- The script (`overflow-box`) flags one that sticks out of its card or container by more than 2px with nothing clipping it. Text that is cut off inside its box is the clipped-text lead, not this.
- Menus, tooltips and pop-overs are meant to overlap, and so is a small corner badge placed on purpose. They are skipped.
- Usual cause: a row of chips that cannot wrap, or a fixed width that is too small for real data.
- Pain example: "On recipe cards with 4 tags, the last 2 chips run out of the card and over the next one."
- Cause: layout. Severity: 2.

## V12. One screen says a thing once

- **The same text twice.** A summary in the page header and again in a side panel reads as a mistake and wastes the best space on the screen. The script (`duplicate-on-screen`) flags the same block of 40 characters or more in two sections. Cards or rows that share a description are data, not a duplicate.
- **The same control twice.** Two "Profile" buttons, or a "Calendar" tab inside a page whose side navigation already has "Calendar". The user cannot tell whether they go to the same place. The script flags the same name in two navigations, and two navigations that link to the same place under different words. Footers, breadcrumbs, logos and Home links are normal repeats.
- The lead reports both places. Decide which one stays.
- Pain example: "'Calendar' is in the side navigation and is also a tab inside Projects, and both open the same calendar."
- Cause: layout or flow. Severity: 2, or 3 when the two places show different things under one name.

## V13. Two rows of controls that could be one

- Search, sort, filters, tabs and view toggles above a list are one toolbar. Stacked in 2 rows that each use less than half the width, they push the list down and split one job in two.
- The script (`stacked-controls`) reports it as a question: "could these be one row?" It is a judgment lead. Reject it when the rows do different jobs (tabs that change the page, then filters for the list) or when one row would not fit at 1280 wide.
- On phone, 2 rows are often right: the lead says so when it shows at one width only.
- Pain example: "Status tabs sit on one row and search and sort on the next, each under 40% wide: one row would lift the list by 50px."
- Cause: layout. Severity: 1 or 2.

## Judging visual leads from visual.mjs

- **Decide every lead.** Each one gets a row in Script leads: the pain it became, or "Rejected:" and what you saw. A lead dropped silently is how an audit misses what the owner spots in a second.
- **Confirm on the crop.** Reject a lead when the difference is intended (a featured card) or invisible at normal size, and say which.
- **Several leads, one pain.** Misaligned dates and a big gap in the same cards can be one pain ("Card footers float"), but each lead still gets its row pointing to it.
- **Cite the crop** as the evidence for the pain.
- **Cause:** usually layout (V3 to V8, V10 to V13) or copy (V1, V2, V9).
- **Severity:** usually 1 or 2. Use 3 when it hides the main action, misleads (V2), or repeats on every screen.
