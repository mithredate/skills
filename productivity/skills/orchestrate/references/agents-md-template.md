# Instruction files for an orchestrator repo

This file holds repo facts only. The procedure lives in the `productivity:orchestrate` skill. The working defaults live in `personal:work-like-mehrdad`. The code defaults live in `personal:code-like-mehrdad`.

Every agent reads `AGENTS.md`.

```markdown
# <repo-name>

This repo is an orchestrator for <what it plans for>. It is planning only.
Implementation lives in the repos below. Everything lives in `.orchestrate/`,
one directory for each initiative. `.orchestrate/README.md` is the index.
The index is read first in every session. Commit and push every change.
At the start of every session, load the `productivity:orchestrate` skill.

## Repos

The sibling repos sit under `~/projects/`.

| Repo | What it is |
|---|---|
| `../<sibling>` | <one line> |

A reference repo is read here, not changed here. Example: `../<repo>`.

## Links

- <tracker, wiki, dashboards>

## Gates

<repo-specific rules only, for example a file that one owner edits>
```

`.claude/rules/claude-code.md`:

```markdown
<Claude-only gates, for example the permissions.ask rule in .claude/settings.json>
```
