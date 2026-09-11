# CLAUDE.md template for an orchestrator repo

Repo facts only. The ritual lives in the `productivity:orchestrate` skill; the defaults in `personal:work-like-mehrdad`.

```markdown
# <repo-name>

Orchestrator for <what it steers>. Planning only: implementation lives in the
repos below. Everything lives in `.wayfinder/`, one directory per initiative.
At the start of every session call the Skill tool with `productivity:orchestrate`.
Agent-agnostic: Claude is the default, Codex must work identically from these files.

## Repos

Sibling directories under `~/projects/`.

| Repo | What it is |
|---|---|
| `../<sibling>` | <one line> |

Reference repos (read from here, never modified from here): `../<repo>`.

## Links

- <tracker, wiki, dashboards>

## Gates

<repo-specific rules only, for example a file that one owner edits and
`permissions.ask` enforces in `.claude/settings.json`>
```
