# Review: food bank volunteer shift tool

Verdict: staff can see shifts, but the urgent problem (Saturday Warehouse restock has 6 of 12) is buried, fixing it takes too many steps, and a delete button can destroy a volunteer record. Fix the dashboard and the fill-a-shift path first.

## What works (keep)

1. Shift rows show "8 of 12 filled" with a progress bar.
2. Shifts are grouped under day headings.
3. The sidebar shows counts and highlights the current page.
4. Duplicate shift is a fast way to copy a shift.
5. The volunteer panel shows total hours and last shift.

## Problems

| # | Problem | Where | Severity |
|---|---|---|---|
| 1 | The dashboard heading says only "Dashboard"; the half-staffed Warehouse restock is hidden in the table while vanity tiles take the top. | Dashboard | Major |
| 2 | The 14% no-show rate has no normal value, target or trend. | Dashboard tile | Polish |
| 3 | The Understaffed badge has no action on the row; staff must click through to fill the shift. | Dashboard, Shifts | Major |
| 4 | Developer controls ("Debug: load mock data", "View as") are visible to staff. | Top bar | Minor |
| 5 | The volunteer side panel is empty by default ("Select a volunteer to see details"). | Volunteers | Polish |
| 6 | Confirmed and Pending use different colors on Shift detail and Volunteers. | Shift detail, Volunteers | Minor |
| 7 | Removing a volunteer from a shift is "Remove" in one place and "Unassign" in another. | Shift detail, Volunteer panel | Polish |
| 8 | Delete volunteer deletes instantly with no confirm or undo, right next to Save with equal weight. | Volunteer panel | Blocker |
| 9 | No bulk select to message or assign several volunteers at once. | Volunteers | Minor |
| 10 | Adding a volunteer needs their ID typed in (V-0193) instead of a name search. | Shift detail, Add volunteer | Major |
| 11 | Volunteer search works only by email; a full name finds nothing. | Volunteers | Major |
| 12 | The Shifts and Volunteers tables scroll sideways on phone. | Shifts, Volunteers at 390 | Minor |
| 13 | Shift times and filled counts are light grey with low contrast. | Shifts, Dashboard | Minor |
| 14 | Priority can only be set by dragging, with no button or keyboard alternative. | Shifts | Minor |
| 15 | The fixed beta feedback banner covers rows and the form at the bottom of the screen. | Every screen | Minor |
| 16 | Raw system values are shown: "2026-11-07T08:00" and "slot_capacity". | Shift detail | Polish |
| 17 | The add-volunteer error is "Validation failed (code 3)" with no explanation. | Shift detail | Minor |
| 18 | Saving settings gives no confirmation. | Settings | Minor |
| 19 | A welcome tip card and quote take the top of the dashboard and push the work down. | Dashboard | Minor |
| 20 | Reports is lorem ipsum placeholder text. | Reports | Minor |

## Fix first

Lead the dashboard with what needs action, add a Fill action on understaffed shifts with name search, and protect Delete volunteer.
