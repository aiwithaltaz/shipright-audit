# Test fixtures (dev only)

Small apps for the script tests in `tests/run.mjs`. They are never benchmark cases.
Their source has no comments on purpose: an audit that reads the source must not be told where the problems are.

| Fixture | Planted for |
|---|---|
| `mini-app` | walk.mjs (a link hidden on phone) and crawl.mjs label drift ("Start order" and "Order now" go to one place) |
| `visual-app` | visual.mjs: a sentence pill, 6 pills on one card, a date shifted 18px, dates and buttons at different heights in a row, an 84px gap in cards, a square menu among 12px corners, a menu covered by a fixed composer, "Saved 12" over an empty page, tall plan cards whose only action ("View details") sits under 17 pieces of text with 9 small labels, and a 1.2 second loading state that says "Nothing here yet" (tests that pages settle first) |
| `gated-app` | crawl.mjs login wall and --session, login.mjs (with ?auto it signs itself in after 1 second) |
| `rotating-app/server.mjs` | Staying signed in: a small server that swaps its sign-in token on every refresh, so an old token gets 401. `--profile` keeps working there and `--session` alone must fail with "The app signed us out". With `refuseHeadless` it also turns headless browsers away (the off-screen window retry) |
| `phone-app` | visual.mjs clipped text: a reply footer that is cut off at 390 and fine at 1280. Also holds what must not be flagged: long chat titles shortened in a list of links, a row of buttons that scrolls sideways, a code block, and a label only screen readers see |
| `results-app` | samples.mjs: a list of 4 past chats. One holds a "Click to load image" placeholder and a broken image (2 leads), one holds only working images (no lead), two are text only (not opened when 2 are asked for) |
| `use-app` | explore.mjs --use and walk.mjs owner-approved steps. A "+" menu with 3 switches: 2 add a chip to the message box, 1 does not. A checkbox on the page. Sending a message adds a reply with a broken image, 2 unnamed icon buttons and a footer that is cut off at 390. The page tells the test server about every flip and every message, so the test can prove nothing was flipped without `--use` and only one message was sent |
| `owner-rules-app` | owner-rules.mjs and the gate: a `DESIGN.md` with one rule the app breaks (cards 16px apart; they sit 28px apart) and one decision the app follows on purpose (a blunt greeting), a `CHANGELOG.md` that repeats the decision, and `current-complaints.md`, which must never be opened |
| `drift-app` | consistency.mjs component drift: 2 pages with the same text input, primary button and cards, and one search box that has a different corner radius and background (exactly 1 lead) |
| `shift-app` | Layout shift and reduced motion: a tall notice is inserted 0.7 seconds after the page loads (visual.mjs layout-shift lead), and the menu slides in even when the browser asks for reduced motion (explore.mjs reduced-motion lead) |
