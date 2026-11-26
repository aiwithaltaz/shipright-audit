---
description: Audit an existing app like an expert Staff Product Designer (read-only). Pass a URL, a local index.html, or nothing to audit this project.
argument-hint: "[url or path to index.html]"
---

Use the shipright-audit skill to audit this app: $ARGUMENTS

If no target is given, find the app in this project (its index.html, or its dev server command) and audit that.
Start with the skill's Step 0: your first message is the read-only line, the one use-it question and the tip about dropping in a file with design decisions, then start at once. Wait for the answer before any step that needs it.
Change nothing in the app's code. Write everything to this audit's own folder, docs/shipright/audits/<YYYY-MM-DD>-<site>/, never touching earlier audits, with the pain map at pain-map.md inside it, and reply with the short summary the skill describes.
