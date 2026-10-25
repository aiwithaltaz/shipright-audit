# Preregistration: shipright-audit benchmark v1

Written 2026-10-23, before any real run. Do not edit after the first graded run. Changes go into v2 with a new date.

Why this file exists: deciding the pass bars after seeing results lets anyone (including us) move the goalposts. These bars are fixed now.

## What we test

- **Cases:** s1-pawsh-grooming (seeded), s2-harvest-volunteers (seeded), s3-northwind-maintenance (seeded, visual craft), c7-ivc-app (real). Plus 2 hidden cases before any public claim.
- **Models:** haiku, sonnet, opus (high effort). 12 case-model cells on the 4 known cases.
- **Arms:** a-plain (no skill), b-careful (strong prompt), c-skill (shipright-audit).
- **Runs:** 5 per cell and arm (180 runs). The 1-run smoke test only checks the harness; its numbers are never quoted.
- **Graders:** 2 per run, from 2 different model families, neither the same family as the run where possible.

## Primary question

Does the skill find more real UX problems than a careful prompt does?

**H1 passes when:** on real cases (c7, and the hidden cases once they exist), the skill minus careful prompt pain recall is at least **+10 points**, and the whole 95% interval is **above 0**.

## Secondary question

**H2 passes when:** across all cases, the skill minus no skill pain recall has its whole 95% interval above 0.

## Guardrails (the skill must not win by getting worse elsewhere)

| Guardrail | Bar |
|---|---|
| Precision | No more than 5 points below the careful prompt |
| False keeps | Median 0 |
| Keeps called pains | No higher than the careful prompt |
| Cost | Report tokens and minutes. Over 2 times the careful prompt's tokens must be stated next to the headline |

## Grader validity (checked before any result is read)

| Check | Bar | Tool |
|---|---|---|
| Hidden controls | Perfect review 90% or more, vague review 10% or less, for every grader | score.mjs "Grader check" |
| Grader vs grader | Kappa 0.6 or more | agreement.mjs |
| Human vs grader | Kappa 0.6 or more on a 10% hand-labeled sample | agreement.mjs --sample 0.1 |

If a check fails, fix the grader (prompt or model) and regrade everything. Do not regrade only the runs you dislike.

## What we will claim

- **Public README claim** only if H1 passes on at least 2 of 3 models, no real-case cell appears under "Where it loses", and hidden-case pain recall is within 10 points of the known cases.
- If H1 fails, we say so in the README and keep the numbers. A null result is still a result.

## Power note

With 12 cells, the sign test needs at least 10 wins of 12 to reach p below 0.05 (10 of 12 gives p = 0.039; 9 of 12 gives p = 0.146). With fewer cells, read the intervals and do not quote p values.

## Frozen inputs

Repo commit and skill hash are written into each run's RUN.json by prepare.mjs. Results must quote both.

## Amendment, 2026-10-25 (before any graded run)

Added s3-northwind-maintenance, a seeded visual-craft case, after the first real-app dogfood (the owner's own app) showed the skill missed visual problems the owner saw. Its key was written before any skill run on it. No pass bar changed. Bias note: s3 was written after the skill's visual lens existed, by the same author, so it likely favors the skill even more than s1 and s2.

