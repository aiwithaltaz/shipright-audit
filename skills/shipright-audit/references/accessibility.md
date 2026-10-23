# Accessibility quick checks (WCAG 2.2 AA)

Use in Step 4. These are the checks that catch most problems in a design audit. They do not replace a full accessibility audit; say so in Not verified.

For each check: run it with a script if you can, by hand if you cannot, and mark it Not verified if neither works (for example, screen reader behavior from screenshots only).

## Seeing

- **Text contrast** at least 4.5:1. Large text (24px, or 18.66px bold) at least 3:1.
- **UI contrast:** borders of inputs, icons that carry meaning, and focus indicators at least 3:1 against what is next to them.
- **Color is not the only signal.** Errors, status and required fields also use text or an icon.
- **Zoom to 200%** without losing content or needing sideways scroll.

## Keyboard and focus

- Every control can be reached and used with the keyboard. Tab order follows the visual order. No keyboard traps.
- **Focus is visible** on every control.
- **Focus is not hidden** behind sticky headers, footers or banners (WCAG 2.2, 2.4.11).

## Touch and pointer

- **Target size** at least 24 by 24 CSS pixels, or enough space around smaller targets (WCAG 2.2, 2.5.8). On phones, aim for 44 by 44.
- **Dragging has a click alternative** (WCAG 2.2, 2.5.7). Sliders, reorder and drag-and-drop also work with taps or buttons.

## Forms

- Every field has a visible label, not just placeholder text.
- Errors appear in text, next to the field, and say how to fix it.
- **No re-entering** information the user already gave in the same process (WCAG 2.2, 3.3.7).
- **Sign-in needs no memory or puzzle tests.** Paste and password managers work (WCAG 2.2, 3.3.8).

## Structure

- Headings are in order (one H1, then H2s).
- Images that carry meaning have alt text; decorative images have empty alt.
- The page language is set.
- **Help is in the same place** on every page that has it (WCAG 2.2, 3.2.6).

## Motion

- Animations respect the reduced motion setting.
- Nothing flashes more than 3 times a second.
- Auto-playing content can be paused.
