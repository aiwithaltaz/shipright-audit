# Taste: does it look designed?

An app can work, line up and pass every heuristic, and the owner still says "I'm not a fan of the UI". That is a real finding: people form a view of how a page looks within about 50 milliseconds (Lindgaard and others, 2006), and look and feel is what they mention most when they judge whether a site is credible (Stanford Web Credibility Project, 2002). This pass names what makes a screen feel unfinished or generic, in words a builder can act on.

Taste is judgment, so be concrete. Never write "looks bad" or "feels off". Name the element, what it does to the eye, the principle, and the change.

## T1. First impression (the 5-second test)

Look at the main screen for 5 seconds, then look away. Write down:
- What is this, and who is it for?
- What is the one thing it wants me to do?
- Does it feel finished and trustworthy, or like a prototype?

If you cannot answer the first two from the screen alone, that is a pain on hierarchy or copy, not only taste.

## T2. One focal point per screen

- Each screen has one thing that wins: the main number, the main list, or the main action. The squint test: blur your eyes; the focal point should still stand out.
- Levels differ clearly: a heading, a section title and body text should not be three nearly equal sizes or weights.
- Pain example: "On the orders screen the page title, four stat cards and the filter bar all share one weight, so nothing leads the eye."

## T3. Typography

- 1 or 2 families. A third family reads as accidental.
- A small scale: about 5 to 7 sizes on a screen. Ten sizes means sizes were picked one by one.
- Body text 15 to 18px, line height about 1.5, lines about 45 to 75 characters. Lines past 90 characters are tiring to read.
- All caps only for short labels, with a little letter spacing. All-caps sentences shout and slow reading.
- Pain example: "Descriptions run about 110 characters per line at 1280 wide, so reading a recipe means tracking long lines."

## T4. Color

- A neutral base, one accent, and the usual signals (red, amber, green). The accent means "act here" or "this is selected". Used everywhere, it means nothing.
- Pills and badges in many colors turn a list into confetti. Color should carry meaning that a legend or label explains.
- In dark themes, use dark greys with clear steps between layers, not pure black with one grey.
- Pain example: "Seven pill colors on one list, none explained, so color stops meaning status."

## T5. Space and rhythm

- One spacing scale (4 or 8px steps). More space between groups than inside them, so groups read as groups.
- Generous space around the main content. Cramped screens feel cheap; huge random gaps feel unfinished.
- Pain example: "Every section uses the same 16px gap, so the settings page reads as one long undivided list."

## T6. Surfaces and depth

- One way to separate surfaces: borders or shadows or tone, used the same way everywhere.
- Not everything needs a card. Cards inside cards inside cards ("card soup") add noise without meaning.
- Elevation means layering: menus and dialogs float above, page content does not.

## T7. Icons and imagery

- One icon set, one stroke weight, one size per context. Mixed sets look assembled.
- Emoji used as interface icons read as a prototype in a paid product.
- Real product imagery (a real result, a real screen) beats abstract gradients and stock art. A product preview with placeholder data (dashes instead of numbers, "Lorem") undercuts trust.

## T8. The generic look

These are not wrong on their own, but together they say "default settings, not designed":
- An untouched component-library look (default buttons, default cards, default shadows) with no brand decision.
- Gradient blobs, glass panels and glows used as decoration rather than meaning.
- Everything centered, a generic headline ("Supercharge your workflow"), the same three-card feature grid.
- Name which signs you see and what one brand decision (a typeface, a color, a shape, a real image) would make it its own.

## T9. Detail and polish

- Hover, focus and pressed states exist and match.
- Empty states say what to do next, with one action.
- Loading shows the shape of what is coming, not "0" or a blank.
- Capitalization is consistent (Sentence case or Title Case, not both). The browser tab has a real title and icon.

## How to use this pass

1. Read the **Style inventory** in `visual.md`: font families, size count, accent colors and line length per page. They are signals, not verdicts.
2. Look at each main screen at full desktop width, then at phone width, with the checks above.
3. Fill the **First impression** section of the pain map: a score of 1 to 5 for T1 to T9 with one line each, and a 2 or 3 sentence verdict.
4. Write a pain only for what you can point to on a screenshot. Lens: "Taste: T3" and so on. Cause: usually layout or copy.
5. **Severity:** usually 2. Use 3 when the first impression undermines trust in a product that asks for money, data or an account, or when a screen has no focal point and slows the main task.
6. Say "this is taste" in the reply: the owner decides, and real users confirm.
