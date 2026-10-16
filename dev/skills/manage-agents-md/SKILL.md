---
name: manage-agents-md
description: Use when creating, improving, or fixing a repo's `CLAUDE.md` or `AGENTS.md`, or moving auto-memory corrections into it.
---

# Agent instructions

The instruction file is `AGENTS.md`, from the first line. Codex reads it, and Claude Code reads it from v2.1.277. Gemini reads it when `context.fileName` in `~/.gemini/settings.json` names it. Claude Code skips `AGENTS.md` when a `CLAUDE.md` exists in the working directory or above it, so the repo has no `CLAUDE.md`. A symlink is not a fix. Git on Windows without symlink support writes the link as a text file.

Put a Claude-only line, such as a plan-mode rule or a note about a hook, in `.claude/rules/claude-code.md`. Claude Code loads `.claude/rules/` files next to `AGENTS.md`, and the other agents do not read them. A line that only names a Claude Code tool is not Claude-only. Write "load the `productivity:orchestrate` skill", not "call the Skill tool with `productivity:orchestrate`", and put it in `AGENTS.md`. Codex lists plugin skills under the same names as Claude Code.

## Principles

- **Do not repeat what the environment already states.** The manifest lists the scripts or targets. The config holds the values. The tree shows the layout. `--help` prints the flags. The file states what the environment cannot state: how a command runs, the convention no linter enforces, the reason behind a choice, and the known problem no config states. For example, the file can state that a command runs inside the `app` container after a fixture is built. `pnpm test` is the manifest's line. `docker compose exec app pnpm test` is the file's line. The same split applies to `make`, `dotnet`, `pytest`, and every other stack.
- **Keep the file under 200 lines.** Adherence drops past that length. Imports still load at launch, so splitting the file organizes it but does not shrink the load. An agent that joins nested instruction files counts them all against the same budget.
- For the general rules of writing for agents, such as pointers, hierarchy, pruning, and no-ops, call the Skill tool with `productivity:write-a-skill`.

## Write or improve

1. **The file.** Write `AGENTS.md`. If the repo has a `CLAUDE.md` and no `AGENTS.md`, run `git mv CLAUDE.md AGENTS.md`. If the repo has both, move each line of `CLAUDE.md` except `@AGENTS.md` to `AGENTS.md`, and delete `CLAUDE.md`. Then move each Claude-only line to `.claude/rules/claude-code.md`. If the user keeps a `CLAUDE.local.md`, tell them that it also stops Claude Code from reading `AGENTS.md`. To fix it, they set `Project instructions` to `claude-md-and-agents-md` in `/config`.
2. Read the existing file, the manifest, and the config. List the directory tree. The agent already knows everything these state.
3. Collect what they cannot state, from the code and from the user: the convention no linter enforces, the reason behind a choice, the known problem, the how, and the rule that differs from the tool's default. The how means, for example, that a command runs in a container or needs a fixture first. Write each as one specific, checkable line in the section that holds its kind.
4. Housekeep the file. See Housekeep below.
5. Move a multi-step procedure to a skill. Move material for one part of the tree to `.claude/rules/` with `paths:` frontmatter. When the file is over 200 lines, cut these first.

## Housekeep

An instruction file grows by addition. A rule stays because deleting it feels riskier than keeping it. On every sweep, in every improve pass, and when the user asks, check every line against the environment. Then propose a deletion table that lists the line, the criterion, and the evidence. See [references/deletion-criteria.md](references/deletion-criteria.md). Wait for the user to approve each row. Do not delete a line on suspicion alone.

## Graduate corrections

Auto-memory holds new corrections. The instruction file and the skills are where corrections live long-term. Memory is machine-local and per repository, so a teammate or Codex sees none of it. Claude Code's own rule states that a mistake made a second time goes into the instruction file.

1. **Collect.** Memory lives in `~/.claude/projects/<project>/memory/`, one directory per git repository. List files whose frontmatter says `type: feedback`, plus `type: project` entries that are rules rather than facts, changed since the last sweep. The default window is 14 days.
2. **Sort each one** to a destination, as the one line it would become there. A repo convention goes to the instruction file, in the section that already holds that kind of rule, or to `.claude/rules/claude-code.md` when the line is Claude-only. Do not repeat what the environment already states. A rule about how the user works, on any repo, goes to their personal skill, `personal:work-like-mehrdad`. A rule teammates need goes to the team plugin. A rule about one skill's procedure goes to that skill. Delete a one-off, session-specific, or superseded line.
3. **Graduate a correction when** the same correction appears twice, a code review or a `review-pr` finding shows a rule the file needs but does not have, or a teammate or another agent must follow it. Otherwise, keep it in memory.
4. **Housekeep** the destination in the same pass.
5. **Propose the table**, listing the memory, the destination, and the line. Wait. The user approves each row.
6. **Apply** the approved rows. Edit the destination. A skill destination gets a PR in its repo. Delete each graduated memory file and its line in `MEMORY.md`, so the rule has one home.
7. **Report the metric**: the number of feedback memories created per week over the window. A new correction on a subject the destination already covers means the destination is not being read. Fix the pointer, not the memory.
