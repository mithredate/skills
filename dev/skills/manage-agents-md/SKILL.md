---
name: manage-agents-md
description: Write, improve, and housekeep a repo's agent instruction file (CLAUDE.md, or AGENTS.md bridged into CLAUDE.md), and graduate corrections out of auto-memory into it. Use when the user asks for a new or better AGENTS.md or CLAUDE.md, asks what belongs in one, says a line in it is stale or wrong, or asks to sweep or graduate corrections and memories.
---

# Agent instructions

The instruction file is `CLAUDE.md` while Claude Code is the only agent reading the repo. Once a second agent reads it (Codex, a teammate's tool), the file is `AGENTS.md` and `CLAUDE.md` becomes the **bridge**: `@AGENTS.md` as its first line, then a `## Claude Code` section for Claude-only lines (skills to call, hooks, plan-mode rules). A symlink `CLAUDE.md -> AGENTS.md` serves when nothing is Claude-only. A rule any agent must follow goes in `AGENTS.md`; nothing Claude-only goes there.

## Principles

- **Cache the how, never the what.** The environment already states what exists: the manifest lists the scripts or targets, the config holds the values, the tree shows the layout, `--help` prints the flags. The file states what the environment cannot: how a command runs (inside the `app` container, after a fixture is built), the convention no linter enforces, the reason behind a choice, the gotcha no config confesses. `pnpm test` is the manifest's line; `docker compose exec app pnpm test` is the file's. The same split holds for `make`, `dotnet`, `pytest` and every other stack.
- **Length.** Under 200 lines; adherence drops past that. Imports still load at launch, so splitting organises but does not shrink, and an agent that concatenates nested instruction files counts them all against the same budget.
- The general levers of writing for agents (pointers, hierarchy, pruning, no-ops): call the Skill tool with `productivity:write-a-skill`.

## Write or improve

1. **The file.** `CLAUDE.md` alone while no second agent reads the repo. When one does: move every agent-agnostic line into `AGENTS.md`, leave `@AGENTS.md` plus the Claude-only lines in `CLAUDE.md`, or a symlink when none remain.
2. Read the existing file, the manifest, and the config; walk the tree. Everything they state is already known to the agent.
3. Collect what they cannot state, from the code and from the user: the convention no linter enforces, the reason behind a choice, the gotcha, the how (runs in a container, needs a fixture first), the rule that differs from the tool's default. Each becomes one specific, checkable line in the section that holds its kind.
4. Housekeep (below).
5. A multi-step procedure moves to a skill; material for one part of the tree moves to `.claude/rules/` with `paths:` frontmatter. Over 200 lines, these are the first cuts.

## Housekeep

An instruction file grows by addition and rots by inertia: a rule stays because deleting it feels riskier than keeping it. On every sweep, in every improve pass, and whenever asked, check every line against the environment and propose a deletion table (line, criterion, evidence) from [references/deletion-criteria.md](references/deletion-criteria.md). Wait; the user approves each row. Nothing is deleted on suspicion alone.

## Graduate corrections

Auto-memory is the inbox for corrections; the instruction file and skills are where they live. Memory is machine-local and per repository; a teammate or Codex sees none of it. Claude Code's own rule: a mistake made a second time goes into the instruction file.

1. **Collect.** Memory lives in `~/.claude/projects/<project>/memory/`, one directory per git repository. List files whose frontmatter says `type: feedback`, plus `type: project` entries that are rules rather than facts, changed since the last sweep (default: 14 days).
2. **Sort each one** to a destination, as the one line it would become there: repo convention → the instruction file, in the section that already holds that kind of rule, or the `## Claude Code` section of `CLAUDE.md` when Claude-only (cache the how, never the what); how the user works, any repo → their personal skill (`personal:work-like-mehrdad`); a rule teammates need → the team plugin; a rule about one skill's procedure → that skill; one-off, session-specific, or superseded → delete.
3. **Graduate when** the same correction appears twice, a code review or a `review-pr` finding catches what the file should have said, or a teammate or another agent must follow it. Otherwise it stays in memory.
4. **Housekeep** the destination in the same pass.
5. **Propose the table** (memory, destination, the line) and wait. The user approves each row.
6. **Apply** the approved rows: edit the destination; a skill destination gets a PR in its repo. Delete each graduated memory file and its line in `MEMORY.md`, so the rule has one home.
7. **Report the metric**: feedback memories created per week over the window. A new correction on a subject the destination already covers means the destination is not being read; fix the pointer, not the memory.
