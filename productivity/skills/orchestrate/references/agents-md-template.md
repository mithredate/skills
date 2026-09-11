# Instruction files for an orchestrator repo

This file holds repo facts only. The procedure lives in the `productivity:orchestrate` skill. The defaults live in `personal:work-like-mehrdad`.

Every agent reads `AGENTS.md`.

```markdown
# <repo-name>

This repo is an orchestrator for <what it plans for>. It is planning only.
Implementation lives in the repos below. Everything lives in `.wayfinder/`,
one directory for each initiative. `.wayfinder/README.md` is the index.
Commit and push every change.

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

Claude Code reads `CLAUDE.md`, the bridge to `AGENTS.md`.

```markdown
@AGENTS.md

## Claude Code

At the start of every session, call the Skill tool with `productivity:orchestrate`.
<Claude-only gates, for example the permissions.ask rule in .claude/settings.json>
```
