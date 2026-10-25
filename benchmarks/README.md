# shipright-audit benchmark

Does `shipright-audit` find more real UX problems than a model alone, or than a smart prompt? This folder answers that with numbers anyone can rerun, with error bars and stated limits.

The pass bars were fixed before any run: see [PREREGISTRATION.md](PREREGISTRATION.md).

## What is here

| Path | What it is |
|---|---|
| `PREREGISTRATION.md` | Hypotheses, pass bars and guardrails, written before any run |
| `cases.json` | The frozen cases and the exact user message for each |
| `cases/s1-pawsh-grooming/app` | Seeded app: a dog groomer's booking site. 20 planted pains, 5 planted Keeps |
| `cases/s2-harvest-volunteers/app` | Seeded app: a food bank's volunteer shift tool. 20 planted pains, 5 planted Keeps |
| `cases/s3-northwind-maintenance/app` | Seeded app, visual craft: a property manager's maintenance tool. 13 pains (12 planted, 1 found while building), 4 Keeps |
| `cases/c7-ivc-app/app` | Real app: the IVC registration desk, with the owner's real review (20 pains, 3 Keeps) |
| `../skills/shipright-audit/` | The skill under test: the same folder users install |
| `answer-keys/` | One JSON key per case, each with a canary ID. **Never copy these into a run folder.** |
| `arms/run-prompt.md` | The exact run prompt and the 3 arms |
| `grader/grader-prompt.md` | The exact grader prompt |
| `grader/controls/` | A perfect reference review per case and one vague review, mixed into grading as hidden controls |
| `tools/verify-seeds.mjs` | Proves every planted pain and Keep still exists in s1, s2 and s3 (76 checks) |
| `tools/prepare.mjs` | One folder per run, in interleaved launch order, with version pins |
| `tools/blind.mjs` | Blind grading folders, leak scan, hidden controls, failed runs kept as 0 |
| `tools/agreement.mjs` | Grader vs grader and human vs grader agreement (Cohen's kappa) |
| `tools/score.mjs` | Results report with confidence intervals; `--self-test` checks the math offline |

## The 3 arms

| Arm | What the model gets |
|---|---|
| `a-plain` | The user's message only |
| `b-careful` | The message plus a strong one-paragraph audit prompt (see `arms/run-prompt.md`) |
| `c-skill` | The message plus `shipright-audit` installed |

Arm b matters most. A skill that only beats "no prompt" is not worth installing.

## Protocol

```bash
# 0. Checks that need no API
node benchmarks/tools/verify-seeds.mjs          # must print "76 of 76 checks pass"
node benchmarks/tools/score.mjs --self-test     # must print "10 of 10 self-test checks pass"

# 1. Make the run folders (default: 4 cases x 3 models x 3 arms x 5 runs = 180)
node benchmarks/tools/prepare.mjs ~/audit-runs v1
#    Smoke test first: --runs 1 (36 runs). It checks the harness only; never quote its numbers.

# 2. Launch every row of ~/audit-runs/v1/LAUNCH.md in order (rules are at the top of that file).

# 3. Blind
node benchmarks/tools/blind.mjs ~/audit-runs/v1 ~/audit-grades/v1

# 4. Grade: 2 fresh graders per folder (GRADE-PROMPT-1.md, GRADE-PROMPT-2.md), from 2 model families.

# 5. Check the graders before reading any result
node benchmarks/tools/agreement.mjs ~/audit-grades/v1 --sample 0.1   # then hand-label those human.json files
node benchmarks/tools/agreement.mjs ~/audit-grades/v1                # every pair must reach kappa 0.6

# 6. Score
node benchmarks/tools/score.mjs ~/audit-grades/v1 --label v1          # writes results/v1.md and .json

# 7. Read at least 3 run outputs per arm next to their grades before quoting any number.
```

Requirements: Node 18 or later. `verify-seeds.mjs` also needs Playwright with Chromium.

## Metrics

| Metric | Meaning |
|---|---|
| Pain recall | (Found + 0.5 x Partly) / pains in the key, averaged across graders. The headline number |
| Worst run | The lowest pain recall in a cell. Shows consistency, not just the average |
| Precision | (Matched + extra real problems) / problems reported. Catches padding and invented problems |
| Keep recall | Keeps named / Keeps in the key |
| False keeps | Known pains the review called good. Should be 0 |
| Keeps called pains | Things that work, flagged as problems. Catches reviews that criticize everything |
| Evidence | Share of reported problems that name a screen or element |
| Severity match | Found pains rated within 1 level of the key |
| Tokens, minutes | Cost per run, from RUN.json |

**Statistics.** Every comparison is paired (same cases, same models), so case difficulty cancels out. Intervals come from a cluster bootstrap over case-model cells and the runs inside them (2,000 resamples, fixed seed). A difference counts as real only when its whole 95% interval is above 0. A sign test reports how many cells the skill wins.

## Best practices this benchmark follows

| Do | Why | How it is done here | Source |
|---|---|---|---|
| Fix pass bars before running | Stops moving the goalposts | `PREREGISTRATION.md` | [Anthropic, statistics for evals](https://anthropic.com/research/statistical-approach-to-model-evals) |
| Prove each task is solvable and the grader works | A 0% score may mean a broken grader, not a weak agent | Perfect reference review per case must score 90%+ | [Anthropic, agent evals](https://anthropic.com/engineering/demystifying-evals-for-ai-agents) |
| Test both sides | One-sided sets reward agents that flag everything | Keeps, false keeps, keeps called pains, precision | Anthropic, agent evals |
| Prefer code graders, use models where needed, calibrate with humans | Model graders drift and have biases | Scripts check the apps and do all math; model graders only label; human sample for kappa | Anthropic, agent evals; [LLM-judge practice](https://futureagi.com/blog/llm-as-judge-best-practices-2026) |
| Use judges from a different model family, and more than one | Judges favor their own family and their own style | 2 graders from 2 families; agreement must reach kappa 0.6 | LLM-judge practice |
| Do not reward length | Judges over-reward long answers | Grader prompt says so; vague long lists are Missed; precision penalizes padding | LLM-judge practice |
| Run several trials and report consistency | Agent output varies run to run | 5 runs per cell; worst-run column | Anthropic, agent evals; [Ponytail benchmark](https://github.com/DietrichGebert/ponytail/blob/main/benchmarks/results/2026-10-07-agentic.md) |
| Report error bars and paired differences | Single numbers hide noise; paired tests remove task difficulty | Bootstrap 95% intervals on paired differences | Anthropic, statistics for evals |
| Cluster by the unit that was sampled | Items from one app are not independent | Bootstrap resamples whole case-model cells | Anthropic, statistics for evals |
| Isolate every run | Shared state and leaked answers fake success | Fresh session, own folder, no memory; leak scan excludes runs that saw the skill or a key | Anthropic, agent evals; Ponytail benchmark |
| Interleave arms | Drift over a day should hit every arm alike | Launch order rotates arms | Ponytail benchmark |
| Count failures | Dropping failed runs inflates scores | No reply means 0, shown in "Runs (failed)" | Anthropic, agent evals |
| Read transcripts | Scores hide grader mistakes | Protocol step 7 | Anthropic, agent evals |
| Report losses, cost and limits | Wins without costs mislead | "Where it loses", tokens and minutes, auto "Limitations" | Ponytail benchmark |
| Guard against contamination | Public test sets leak into training data | Canary ID in every key; hidden cases never committed; rotate cases per release | [Eval contamination](https://tianpan.co/blog/2026-04-23-benchmark-leak-eval-contamination) |
| Watch for saturation | Near 100% the test stops showing gains | When the skill passes 90% recall, add harder cases | Anthropic, agent evals |

**Don't:** edit a key after seeing results, regrade only runs you dislike, quote the smoke test, quote seeded cases alone, drop failed or leaked runs silently, or grade with the same model family that ran.

## Known bias (read before quoting numbers)

- **The seeded apps (s1, s2, s3) were written by the same author as the skill**, after the skill. s3 was written after the visual lens, so it leans hardest toward the skill. The planted pains are common real-world problems, but they likely lean toward what the skill checks. Expect the skill to look better on s1, s2 and s3 than it really is.
- **c7 is the fairest case.** Its key is the owner's real review, written before this skill existed. The report shows a separate "real cases only" comparison.
- **Hidden cases:** before any public claim, add 2 seeded cases written by someone who has not read the skill (for example a fresh model given only a brief and the cause list). **Keep them out of this public repo.** A drop of more than 10 points in pain recall on hidden cases means the skill is tuned to its own tests.
- **Public keys:** this repo is public, so s1, s2 and c7 keys could reach future training data. The canary ID makes leaks detectable. Rotate in new cases each release.

## Results

None yet. Numbers are added only from real graded runs.
