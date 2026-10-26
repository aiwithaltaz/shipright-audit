# Test fixtures (dev only)

Small apps for the script tests in `tests/run.mjs`. They are never benchmark cases.
Their source has no comments on purpose: an audit that reads the source must not be told where the problems are.

| Fixture | Planted for |
|---|---|
| `mini-app` | walk.mjs (a link hidden on phone) and crawl.mjs label drift ("Start order" and "Order now" go to one place) |
| `visual-app` | visual.mjs: a sentence pill, 6 pills on one card, a date shifted 18px, dates and buttons at different heights in a row, an 84px gap in cards, a square menu among 12px corners, a menu covered by a fixed composer, "Saved 12" over an empty page, tall plan cards whose only action ("View details") sits under 17 pieces of text with 9 small labels, and a 1.2 second loading state that says "Nothing here yet" (tests that pages settle first) |
| `gated-app` | crawl.mjs login wall and --session, login.mjs (with ?auto it signs itself in after 1 second) |
