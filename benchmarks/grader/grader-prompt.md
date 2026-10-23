# Grader prompt (fresh grader per run, 2 graders per run)

`tools/blind.mjs` fills this in for every blinded run and saves `GRADE-PROMPT-1.md` and `GRADE-PROMPT-2.md`. Paste each into a fresh agent.

- **Grader 1 and grader 2 should come from different model families** (for example Claude and GPT or Gemini). Judges favor outputs from their own family.
- **Never use the same model family as the run being graded** when you can avoid it.
- Graders only label. `score.mjs` does the math. Do not ask graders for percentages.
- Some runs are hidden controls (a perfect review and a vague one). Graders are not told which. If a grader fails a control, its grades for that case are flagged.

```text
You check how many real problems an app review found, against an answer key.
Judge each item on its own. Do not let the review's length, tone or confidence change any label.
A long list of vague advice ("improve usability", "check accessibility") finds nothing.

1. Read the answer key at {ANSWER_KEY}. It lists planted or owner-confirmed pains and Keeps.
   Each row says when it "counts as found".
2. Read every .md file in {RUN_DIR} (reply, questions, and any documents). Look at any screenshots in it.
3. For each pain in the key, pick one label:
   - Found: the review names this problem (or builds its fix) clearly enough to match "counts as found when".
   - Partly: the review touches it but misses its core.
   - Missed: not there, or only covered by vague advice.
   - Unsure: you cannot tell from the review. Use this rarely.
4. For each Keep in the key, pick Found (the review lists it as working or worth keeping) or Missed.
5. false_keeps: IDs from "false_keep_ids" that the review calls good, working, or worth keeping.
6. keeps_flagged_as_pain: Keep IDs that the review lists as a problem to fix.
7. Count every distinct problem the review reports (merge duplicates). For problems that match no key row,
   decide if each is a real problem in the app (real) or wrong, invented or unsupported (not_real).
   Open the app at {APP}/index.html if you need to check.
8. Evidence: count how many reported problems name a specific screen or element.
9. Severity: for each Found pain where the key has a severity (1 to 4) and the review gives one, record whether
   the review is within 1 level of the key. Blocker/Critical/Catastrophe = 4, Major/High = 3,
   Minor/Medium = 2, Polish/Low/Cosmetic = 1.

Write JSON to {OUT_FILE}:
{
  "pains": {"<ID>": "Found|Partly|Missed|Unsure", ...},
  "keeps": {"<ID>": "Found|Missed", ...},
  "false_keeps": ["<ID>", ...],
  "keeps_flagged_as_pain": ["<ID>", ...],
  "reported_problems": <int>,
  "extra_real": <int>,
  "extra_not_real": <int>,
  "extra_not_real_examples": ["<short quote>", ...],
  "with_location": <int>,
  "severity_checked": <int>,
  "severity_within_one": <int>,
  "notes": "one line: the best catch and the most important miss"
}
Every pain and Keep ID in the key must appear in your JSON. When done, answer with one line: DONE.
```
