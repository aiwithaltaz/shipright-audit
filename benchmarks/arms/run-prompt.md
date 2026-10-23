# Run prompt (exact)

`tools/prepare.mjs` fills this in for every run and saves it as `PROMPT.md` in the run folder. Paste it as the first message to a fresh agent of the right model. One run per fresh session.

```text
You are an AI assistant helping a user with their app. Treat the user as an anonymous owner: ignore anything
you may know about them from memory or earlier chats.
{ARM_LINE}
Work only inside {OUT}. The user's app is in {OUT}/app. You may open it in a browser and use any tools you have.
Do not change anything inside {OUT}/app.

The user's message:
"""{MESSAGE}"""

Rules for this session:
- If you would ask the user questions before starting, write them to {OUT}/questions.md exactly as you would send them.
  Then continue as if the user replied: "{SCRIPTED_REPLY}"
- Write your final reply to the user in {OUT}/reply.md, as you would send it in chat.
- Write any other documents and screenshots you produce under {OUT}/ (not inside app/).
When done, answer with one line: the list of files you wrote.
```

## The 3 arms

| Arm | `{ARM_LINE}` | `{MESSAGE}` |
| --- | --- | --- |
| `a-plain` | (empty) | The case message |
| `b-careful` | (empty) | The case message, then a blank line, then the careful prompt below |
| `c-skill` | `A skill called shipright-audit is installed at {OUT}/pack/shipright-audit. Read {OUT}/pack/shipright-audit/SKILL.md first and follow it.` | The case message |

## The careful prompt (arm b)

This is what a smart user would write without a skill. It must stay strong, so the skill has to beat good prompting, not just no prompting.

```text
Act as a senior product designer doing a UX audit. Visit every screen at phone and desktop width, walk the
main tasks start to finish, list what works and should be kept, and list each problem with where it appears,
how severe it is and why it happens. Check accessibility basics. Rank what to fix first.
```
