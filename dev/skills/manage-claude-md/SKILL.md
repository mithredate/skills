---
name: manage-claude-md
description: Write, improve, housekeep a CLAUDE.md, and graduate corrections out of auto-memory into it. Use when the user asks for a new or better CLAUDE.md, asks what belongs in one, says a CLAUDE.md line is stale or wrong, or asks to sweep or graduate corrections and memories.
---

# CLAUDE.md Helper

CLAUDE.md is the agent's primary source of truth for how a repository works: high leverage, so a poor one degrades every session.

## Principles

- **The cache principle.** The environment is a source of truth too: `package.json` scripts, config files, the directory layout, `--help` output. A CLAUDE.md line that restates it is a cache, and earns its place only when the lookup is expensive. Cache what the agent cannot find by looking: the unwritten convention, the reason behind a choice, the gotcha no config confesses.
- **Length.** Under 300 lines, 60 is ideal. Models follow about 150 to 200 instructions consistently and the system prompt spends some 50 of them; past that, following degrades across all instructions, not only the new ones.
- What belongs, what to leave out, disclosure and placement: [references/what-belongs.md](references/what-belongs.md). The general levers of writing for agents: call the Skill tool with `productivity:write-a-skill`.

## Write or improve

1. Read the existing file, if any.
2. Find the gaps against WHAT, WHY, HOW (the reference).
3. Housekeep (below).
4. Over 300 lines: move task-specific material behind pointers.
5. Add the directory map if missing; define the workflows for common tasks.
6. Check against [references/checklist.md](references/checklist.md); templates in [references/examples.md](references/examples.md).

## Housekeep

A CLAUDE.md grows by addition and rots by inertia: a rule stays because deleting it feels riskier than keeping it. On every sweep, in every improve pass, and whenever asked, check every line against the environment and propose a deletion table (line, criterion, evidence) from [references/deletion-criteria.md](references/deletion-criteria.md). Wait; the user approves each row. Nothing is deleted on suspicion alone.

## Graduate corrections

Auto-memory is the inbox for corrections; CLAUDE.md and skills are where they live. A memory is private to one machine and one project directory: a worktree session has its own directory and starts with none of them, a teammate or Codex sees none. A correction that must hold beyond this directory graduates.

1. **Collect.** Memory lives in `~/.claude/projects/<project-dir>/memory/` where `<project-dir>` is the repo path with `/` replaced by `-`; worktree sessions have their own directories with the same prefix. List files whose frontmatter says `type: feedback`, plus `type: project` entries that are rules rather than facts, changed since the last sweep (default: 14 days).
2. **Sort each one** to a destination, as the one line it would become there: repo convention → this repo's CLAUDE.md, in the section that already holds that kind of rule (the cache principle applies); how the user works, any repo → their personal skill (`personal:work-like-mehrdad`); a rule teammates need → the team plugin; a rule about one skill's procedure → that skill; one-off, session-specific, or superseded → delete.
3. **Graduate when** the same correction appears twice, or must hold in a worktree session, or a teammate or Codex must follow it. Otherwise it stays in memory.
4. **Housekeep** the destination in the same pass.
5. **Propose the table** (memory, destination, the line) and wait. The user approves each row.
6. **Apply** the approved rows: edit the destination; a skill destination gets a PR in its repo. Delete each graduated memory file and its line in `MEMORY.md`, so the rule has one home.
7. **Report the metric**: feedback memories created per week over the window, next to the previous sweep's figure. Corrections that keep arriving after graduation mean the destination is not being read; fix the pointer, not the memory.
