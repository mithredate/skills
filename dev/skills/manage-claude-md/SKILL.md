---
name: manage-claude-md
description: Help write and improve CLAUDE.md files for Claude Code projects, and graduate corrections out of auto-memory into them. Use when users want to create a new CLAUDE.md, improve an existing one, review their CLAUDE.md for best practices, ask what to include in CLAUDE.md, or say "sweep corrections", "graduate memories", "what has Claude been getting wrong", "clean up CLAUDE.md", "what in here is stale". Triggers on requests like "help me write a CLAUDE.md", "review my CLAUDE.md", "what should I put in CLAUDE.md", or "improve my Claude configuration".
---

# CLAUDE.md Helper

Guide users in creating effective CLAUDE.md files that maximize Claude Code's performance.

## Core Principle

CLAUDE.md is the agent's primary source of truth for how a repository works. It's a high-leverage configuration point—a poorly written CLAUDE.md can degrade performance across all sessions.

## The Cache Principle

The environment is a source of truth too—`package.json` scripts, config files, the directory layout, `--help` output. A CLAUDE.md line that restates it is a cache, and only earns its place when the lookup is expensive. Cache what the agent cannot find by looking: unwritten conventions, the reason behind a choice, the gotcha no config confesses.

## The WHAT-WHY-HOW Framework

Structure CLAUDE.md around three dimensions:

1. **WHAT**: Tech stack, project structure, codebase map (critical for monorepos)
2. **WHY**: Purpose of project components and their relationships
3. **HOW**: Workflows, verification methods, testing procedures

## Length Guidelines

- **Target**: Under 300 lines (60 lines is ideal)
- **Rationale**: LLMs can follow ~150-200 instructions consistently. Claude Code's system prompt uses ~50, leaving limited headroom
- **Effect of bloat**: Instruction-following degrades uniformly as count increases—Claude starts ignoring ALL instructions, not just new ones

## What to Include

```markdown
# Code style (brief!)
- Use ES modules (import/export), not CommonJS
- Destructure imports when possible

# Workflow
- Typecheck after code changes
- Run single tests, not full suite

# Project structure
src/
├── components/   # React components
├── lib/          # Shared utilities
└── api/          # API routes
```

## What NOT to Include

1. **Task-specific instructions** - Claude ignores content not relevant to current task
2. **Linting rules** - Use actual linters; LLMs are slow and expensive for this
3. **Code snippets** - They go stale; use `file:line` references instead
4. **Auto-generated content** - Carefully craft this file; don't rely on `/init`
5. **Build/test/typecheck commands** - Cheap one-file lookup (`package.json`); they go stale

## Progressive Disclosure Pattern

For complex projects, keep task-specific docs in separate files:

```text
agent_docs/
├── building_the_project.md
├── running_tests.md
├── code_conventions.md
└── database_schema.md
```

Reference in CLAUDE.md:

```markdown
## Testing
See agent_docs/running_tests.md for testing guide.
```

## Monorepo Placement

- **Root**: Shared context for all work
- **Subdirectories**: Pulled in when working in that directory (e.g., `frontend/CLAUDE.md`)
- **Home folder** (`~/.claude/CLAUDE.md`): Personal preferences across all projects

## Workflow for Creating/Improving CLAUDE.md

1. **Read existing file** (if any) to understand current state
2. **Identify gaps** using the WHAT-WHY-HOW framework
3. **Check length** - If over 300 lines, extract to reference files
4. **Housekeep** (below): every line checked against the environment, deletions proposed
5. **Add directory map** if missing
6. **Define workflows** for common tasks

See [references/checklist.md](references/checklist.md) for quick validation.
See [references/examples.md](references/examples.md) for templates and patterns.

For the general levers of writing for agents (context pointers, the two loads, information hierarchy, pruning), call the Skill tool with `productivity:write-a-skill`.

## Graduating corrections

Auto-memory is the inbox for corrections; CLAUDE.md and skills are where they live. A memory is private to one machine and one project directory: a worktree session has its own directory and starts with none of them, a teammate or Codex sees none of them. A correction that must hold beyond this directory graduates.

1. **Collect.** Memory lives in `~/.claude/projects/<project-dir>/memory/` where `<project-dir>` is the repo path with `/` replaced by `-`; worktree sessions have their own directories starting with the same prefix. List files whose frontmatter says `type: feedback`, plus `type: project` entries that are rules rather than facts, changed since the last sweep (default: 14 days).
2. **Sort each one** into a destination, one line each: the rule as it would read at its destination.
   - repo convention → this repo's CLAUDE.md, under the section that already holds that kind of rule; a new section only when none fits. The cache principle applies: a rule the environment already states is dropped, not graduated.
   - how the user works, any repo → their personal skill (`personal:work-like-mehrdad`).
   - a rule teammates need → the team plugin.
   - a rule about one skill's procedure → that skill.
   - one-off, session-specific, or superseded → delete.
3. **Graduate when** the same correction appears twice, or must hold in a worktree session, or a teammate or Codex must follow it. Otherwise it stays in memory.
4. **Propose the table** (memory, destination, the line) and wait. The user approves each row; nothing moves without a yes.
5. **Apply** the approved rows: edit the destination; a skill destination gets a PR in its repo. Delete each graduated memory file and its line in `MEMORY.md`, so the rule has one home.
6. **Report the metric**: feedback memories created per week over the window, next to the previous sweep's figure. Corrections that keep arriving after graduation mean the destination is not being read; fix the pointer, not the memory.

## Housekeeping

A CLAUDE.md grows by addition and rots by inertia: a rule stays because deleting it feels riskier than keeping it. Every sweep, and whenever asked, check every line against the environment and propose deletions. The user approves each; nothing is deleted on suspicion alone.

A line goes on the deletion table when:

- **It names something that no longer exists.** A path, script, command, package, branch, or file that is not there. Check with `ls`, `git ls-files`, the manifest's scripts, `--help`.
- **The environment now states it.** A linter rule, a manifest script, a config value. The lookup is cheap; the line is a cache gone stale.
- **A newer line contradicts it.** Two rules on the same subject: the older one goes, the newer one is checked against the code.
- **The code does not follow it.** A convention the codebase violates in most places is a wish, not a rule. Propose deletion or a ratchet, never silent retention.
- **It is transitional.** "Legacy", "deprecated", "for backward compatibility", "until X lands", "for now": read the date and the state; when the transition is over, the line goes with it.
- **It restates the agent's defaults.** A line that changes nothing in behaviour pays load to say nothing.

Present the table (line, reason, evidence) and wait. Deletion is a one-place edit; when a rule was cached from a document, point at the document instead.
