# Install

| Tool | How | Tested |
|---|---|---|
| Claude Code | Plugin (below) | Tested on Windows in the desktop app, with Edge as the browser |
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

### Updating

Claude Code does not auto-update marketplaces outside Anthropic's own. The easy way: when a newer version is out, the audit says so at the end of its reply. Say "update it" and it fetches the new version for you; then restart, type `/plugin`, open **Installed**, pick **Shipright audit**, click **Update** and confirm.

**Claude Code in a terminal:** type `/plugin`, open **Marketplaces**, pick **shipright-audit** and update it. You can also choose **Enable auto-update** there, so new versions arrive on their own.

**Claude Code desktop app, by hand** (no Marketplaces tab, Update button greyed out):
1. Refresh the saved copy. In a Claude Code chat, paste: "Run git pull in %USERPROFILE%\.claude\plugins\marketplaces\shipright-audit (on a Mac: ~/.claude/plugins/marketplaces/shipright-audit) and tell me the version in .claude-plugin/plugin.json there."
2. Restart the app. The Update button only appears after a restart.
3. Type `/plugin`, open **Installed**, pick **Shipright audit**, click **Update** and confirm. If it is still greyed out, use **...** then **Remove**, and install it again.

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

## Browser tools (automatic)

The audit installs Playwright itself on first use, in a ShipRight tools folder in your home folder (`~/.shipright/tools`), never in your app. It uses Playwright's Chromium, or your installed Microsoft Edge or Google Chrome, or (on a Mac) Playwright's WebKit. To set it up ahead of time:

```bash
node skills/shipright-audit/scripts/setup.mjs
```

Without Playwright, the audit visits screens by hand and marks interactive checks as Not verified.

## Uninstall

Claude Code: `/plugin uninstall shipright-audit@shipright-audit`. Elsewhere, delete the copied files. To remove the browser tools too, delete `~/.shipright`.
