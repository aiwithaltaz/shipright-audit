# How to write pains and Keeps

Read before Step 6. Each pair shows a weak write-up and a strong one. All examples are Sample (invented apps, for format only).

## Pain 1: vague vs specific

**Weak:** "The navigation is confusing."

**Strong:**
P03 · On phone, the "New order" button is inside the menu, 2 taps deep, on every screen.
Where: Home, Orders, Customers · `screens/home-390.png`
Who: staff taking orders at the counter
Breaks: H7 Make frequent tasks fast; L7 Phone and speed
Severity: 3 Major (every order, every time, adds 2 taps)
Cause: layout · Source: Found, by 3 of 3 reviewers

## Pain 2: opinion vs principle

**Weak:** "Improve the colors."

**Strong:**
P07 · "Delete" and "Save" are the same size and the same green, side by side.
Where: Edit customer · `screens/customer-edit-1280.png`
Who: anyone editing a customer
Breaks: L3 Visual hierarchy; H5 Prevent errors
Severity: 3 Major (one wrong tap deletes a customer; no undo)
Cause: layout · Source: Found
Fix A: make Delete a quiet text button. Fix B: move Delete into a menu with a confirm step. Chosen: B.
Principle: destructive actions should be harder to hit than safe ones.
Test: Delete needs 2 deliberate actions, and Save is the only filled button.

## Pain 3: invented vs honest

**Weak:** "Users hate the sign-up flow."

**Strong:**
P11 · Sign-up asks for a company size and a phone number before the user sees the product.
Where: Sign up, step 1 of 3 · `screens/signup-1280.png`
Who: new visitors
Breaks: L1 Removal test (not needed right now); H8 Show only what matters
Severity: 3 Major
Cause: flow · Source: Found
Note: this is an expert prediction. Confirm with real sign-up data or 3 to 5 user tests.

## Pain 4: a missing page

**Strong:**
P14 · There is no 404 page. A broken link shows the server's default error with no way back.
Where: any unknown URL · `screens/404-1280.png`
Who: anyone following an old or mistyped link
Breaks: H3 Let users undo and exit; H9 Help users fix errors
Severity: 2 Minor
Cause: missing feature · Source: Found

## Keeps: generic vs useful

**Weak:** "The design is clean."

**Strong:**
K02 · Every order row shows the next step as a button ("Mark ready"), so staff never open a row just to act.
Why: puts the action where the work is (L2, L4). Keep it in any redesign.
Where: Orders · `screens/orders-1280.png`
