# Install

| Tool | How | Tested |
|---|---|---|
| Claude Code | Plugin (below) | Plugin passes `claude plugin validate`. Live install: test after publishing |
| Skills CLI (many agents) | `npx skills add aiwithaltaz/shipright-audit` | Not yet. Please report |
| Codex | Plugin (below) | Not yet. Please report |
| Antigravity CLI | `agy plugin install https://github.com/aiwithaltaz/shipright-audit` | Not yet. Please report |
| Cursor | Rule file (below) | Not yet. Please report |
| Anything that reads `AGENTS.md` | Copy `AGENTS.md` into your project | Not yet. Please report |

"Not yet" means the files follow the format those tools document, but we have not run an audit through them. If you try one, open an issue with what happened.

## Claude Code

Send these as two separate prompts:

```
/plugin marketplace add aiwithaltaz/shipright-audit
```
```
/plugin install shipright-audit@shipright-audit
```

Use it:

```
/shipright-audit:audit https://your-app.com
/shipright-audit:audit ./index.html
```

Or ask in plain words: "Review my app and tell me what to fix first." The skill also runs on its own when your request matches.

## Codex

```bash
codex plugin marketplace add aiwithaltaz/shipright-audit
codex plugin add shipright-audit@shipright-audit
```

## Skills CLI

```bash
npx skills add aiwithaltaz/shipright-audit
```

This copies `skills/shipright-audit` into your agent's skills folder. Add `--global` to install it for every project.

## Cursor

Copy `.cursor/rules/shipright-audit.mdc` and `AGENTS.md` into your project. The rule is agent-requested, so Cursor loads it when you ask for a review.

## Other agents

Copy `AGENTS.md` into your project root. It only applies when you ask for an app review.

## Optional: automatic screen crawl

```bash
npm i -D playwright && npx playwright install chromium
```

Without it, the audit visits screens by hand and marks interactive checks as Not verified.

## Uninstall

Claude Code: `/plugin uninstall shipright-audit@shipright-audit`. Elsewhere, delete the copied files.
