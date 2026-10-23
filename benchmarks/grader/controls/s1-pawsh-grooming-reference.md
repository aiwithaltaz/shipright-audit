# Review: dog grooming booking site

Verdict: customers can book, but the flow hides rules and prices until the end, phone users cannot navigate, and several accessibility basics fail. Fix the booking flow first.

## What works (keep)

1. The Services page shows a clear price table by dog size (small, medium, large).
2. The date picker disables Sunday and Monday and says the shop is closed those days.
3. The Contact page has a tap-to-call number, the address and an hours table.
4. The booking flow shows a named step indicator ("Step 2 of 4: Date and time").
5. My bookings lists upcoming visits with date, time, dog, service and a clear status badge.

## Problems

| # | Problem | Where | Severity |
|---|---|---|---|
| 1 | The 2-hour slot rule for large dogs appears only at the review step, after the user picked a 1-hour time. | Book, step 4 | Blocker |
| 2 | On phone the nav links disappear and there is no menu button, so Services, My bookings and Contact cannot be reached. | Header at 390 | Blocker |
| 3 | The same action has three names: Reserve (nav), Book now (home), Schedule (services). | Header, Home, Services | Minor |
| 4 | White text on the light teal buttons has low contrast and fails WCAG AA. | All primary buttons | Major |
| 5 | The full-height hero image pushes the headline and Book now below the fold, especially on phone. | Home | Major |
| 6 | The booking steps have no Back button; leaving the flow loses everything. | Book, steps 2 to 4 | Major |
| 7 | Errors only say "Invalid input", and a failed Continue wipes the fields and selection. | Book, steps 2 and 3 | Major |
| 8 | The phone number is asked again on the review step (redundant entry). | Book, steps 3 and 4 | Minor |
| 9 | "1,284 happy dogs this month" and "4.9 from 2,000+ reviews" have no source and may not be real. | Home | Minor |
| 10 | No price or total is shown before confirming; the price comes "by email after your visit". | Book, step 4 | Major |
| 11 | Customers cannot cancel or reschedule online; they must call. | My bookings | Major |
| 12 | Unknown URLs show a blank page; there is no 404 page. | Any unknown route | Minor |
| 13 | The Past tab shows only table headers with no empty-state message. | My bookings, Past | Polish |
| 14 | Keyboard focus is invisible: outlines are removed everywhere. | All controls | Major |
| 15 | Time slot buttons are about 18px tall with tiny text, under the 24px minimum target. | Book, step 2 | Major |
| 16 | Form fields use placeholders instead of labels. | Book, steps 3 and 4 | Minor |
| 17 | The hero image is about 1.9 MB at 4200px wide and slows the page. | Home | Minor |
| 18 | Cancel booking and Confirm booking are the same filled style side by side; Cancel has no confirm. | Book, step 4 | Major |
| 19 | Internal codes like SVC-BATH-S and SVC-FULL-L are shown to customers. | Book, step 1 | Polish |
| 20 | Confirming a booking shows no confirmation; the user lands on Home with no feedback. | After Confirm booking | Major |

## Fix first

Show dog-size rules and prices up front, add Back and a confirmation page, and restore phone navigation.
