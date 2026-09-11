---
name: manage-agents-md
description: Write, improve, and housekeep a repo's agent instruction file (AGENTS.md, read by Claude Code through CLAUDE.md), and graduate corrections out of auto-memory into it. Use when the user asks for a new or better AGENTS.md or CLAUDE.md, asks what belongs in one, says a line in it is stale or wrong, or asks to sweep or graduate corrections and memories.
---

# Agent instructions

One instruction file per repo, `AGENTS.md`, read by every coding agent. Claude Code reads only `CLAUDE.md`, so `CLAUDE.md` is the **bridge**: `@AGENTS.md` as its first line, then a `## Claude Code` section for Claude-only lines (skills to call, hooks, plan-mode rules). A symlink `CLAUDE.md -> AGENTS.md` serves when nothing is Claude-only. Codex reads `AGENTS.md` directly. A rule any agent must follow goes in `AGENTS.md`; nothing Claude-only goes there.

## Principles

- **The cache principle.** The environment is a source of truth too: `package.json` scripts, config files, the directory layout, `--help` output. A line that restates it is a cache, and earns its place only when the lookup is expensive. Cache what the agent cannot find by looking: the unwritten convention, the reason behind a choice, the gotcha no config confesses.
- **Length.** Under 200 lines; adherence degrades past that, across all instructions, not only the new ones. Imports still load at launch, so splitting organises but does not shrink.
- What belongs, what to leave out, disclosure and placement: [references/what-belongs.md](references/what-belongs.md). The general levers of writing for agents: call the Skill tool with `productivity:write-a-skill`.

## Write or improve

1. **The bridge.** `AGENTS.md` is the real file. A repo with only a `CLAUDE.md`: move every agent-agnostic line into `AGENTS.md`, leave `@AGENTS.md` plus the Claude-only lines in `CLAUDE.md`, or a symlink when none remain.
2. Read the existing file; find the gaps against WHAT, WHY, HOW (the reference).
3. Housekeep (below).
4. Over 200 lines: move path-specific material to `.claude/rules/` with `paths:` frontmatter, task-specific material to a skill.
5. Add the directory map if missing; define the workflows for common tasks.
6. Check against [references/checklist.md](references/checklist.md); templates in [references/examples.md](references/examples.md).

## Housekeep

An instruction file grows by addition and rots by inertia: a rule stays because deleting it feels riskier than keeping it. On every sweep, in every improve pass, and whenever asked: run `/doctor` for its trim proposals (derivable content), then check every remaining line against the environment and propose a deletion table (line, criterion, evidence) from [references/deletion-criteria.md](references/deletion-criteria.md). Wait; the user approves each row. Nothing is deleted on suspicion alone.

## Graduate corrections

Auto-memory is the inbox for corrections; the instruction file and skills are where they live. Memory is machine-local and per repository; a teammate or Codex sees none of it. Claude Code's own rule: a mistake made a second time goes into the instruction file.

1. **Collect.** Memory lives in `~/.claude/projects/<project>/memory/`, one directory per git repository. List files whose frontmatter says `type: feedback`, plus `type: project` entries that are rules rather than facts, changed since the last sweep (default: 14 days).
2. **Sort each one** to a destination, as the one line it would become there: repo convention → `AGENTS.md`, in the section that already holds that kind of rule, or the `## Claude Code` section of `CLAUDE.md` when Claude-only (the cache principle applies); how the user works, any repo → their personal skill (`personal:work-like-mehrdad`); a rule teammates need → the team plugin; a rule about one skill's procedure → that skill; one-off, session-specific, or superseded → delete.
3. **Graduate when** the same correction appears twice, or a teammate or another agent must follow it. Otherwise it stays in memory.
4. **Housekeep** the destination in the same pass.
5. **Propose the table** (memory, destination, the line) and wait. The user approves each row.
6. **Apply** the approved rows: edit the destination; a skill destination gets a PR in its repo. Delete each graduated memory file and its line in `MEMORY.md`, so the rule has one home.
7. **Report the metric**: feedback memories created per week over the window, next to the previous sweep's figure. Corrections that keep arriving after graduation mean the destination is not being read; fix the pointer, not the memory.
