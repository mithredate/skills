# Instruction files for an orchestrator repo

Repo facts only. The ritual lives in the `productivity:orchestrate` skill; the defaults in `personal:work-like-mehrdad`.

`AGENTS.md`, read by every agent:

```markdown
# <repo-name>

Orchestrator for <what it steers>. Planning only: implementation lives in the
repos below. Everything lives in `.wayfinder/`, one directory per initiative;
`.wayfinder/README.md` is the index. Every change is committed and pushed.

## Repos

Sibling directories under `~/projects/`.

| Repo | What it is |
|---|---|
| `../<sibling>` | <one line> |

Reference repos (read from here, never modified from here): `../<repo>`.

## Links

- <tracker, wiki, dashboards>

## Gates

<repo-specific rules only, for example a file that one owner edits>
```

`CLAUDE.md`, the bridge Claude Code reads:

```markdown
@AGENTS.md

## Claude Code

At the start of every session call the Skill tool with `productivity:orchestrate`.
<Claude-only gates, e.g. the permissions.ask rule in .claude/settings.json>
```
