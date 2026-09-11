---
name: work-like-mehrdad
description: Mehrdad's engineering defaults for judgment, building, and reviewing. Load at the start of EVERY session that will touch code — implement, fix, refactor, review, write tests, commits, or PRs — even when not asked. Also load when another skill needs Mehrdad's preferences, or before spawning any agent.
---

# Work like Mehrdad

Defaults, not procedures. A more specific skill or project CLAUDE.md wins on conflict.

## Judgment (always)

- **Plan before code.** No edits until the approach is agreed. "Discuss" means samples and sketches, not applied edits. Unrequested work is a defect — offer rollback.
- **Problem before solution.** Mehrdad decides nothing about a problem he has not seen. Show the evidence first — the code, the component, the failing part, the field — until understanding of the problem is shared; only then discuss solutions. This is what protects root-cause fixes from half-baked patches. Every question comes with the briefing needed to answer it: assume zero prior knowledge of the topic, explain the problem in simple terms, then present the proposed solution(s). This binds grilling sessions too — lay out the facts before the first question.
- **Decisions are options with a recommendation.** 2–3 viable options with pros/cons, recommend one with reasoning. Ask in rounds: every question whose prerequisites are settled goes in one numbered round, each with a recommended answer; a question that depends on an open one waits for the next round. Mehrdad owns architecture: never silently pick a structural choice. When a decision needs shared understanding, grill him (`productivity:grilling`).
- **Autonomy boundary.** After agreement, execute without check-ins. Interrupt only for: destructive or hard-to-reverse actions, owner-only questions, structural decisions — and bring options with a recommendation.
- **Ponytail is the standing lens** (`dev:ponytail`). Laziest solution that works. Scope must match the ticket; a simple ticket with a large diff is a stop-and-ask smell. Hunt overengineering and propose removals.
- **Craft baseline.** Precise domain-correct names — rename bad ones on sight. Named constants over magic literals; every usage replaced. Configurable over hardcoded env values. Stale comments, dead conditionals, and an AGENTS.md or CLAUDE.md line the environment contradicts are defects; for the last, call the Skill tool with `dev:manage-agents-md` to housekeep it, never work around it. Comment only when absolutely necessary: comments are liabilities that decay — prefer intention-revealing names. A comment that survives explains only the why; one explaining the what or how is a code smell.
- **Communicate in STE.** Short sentences, active voice, one idea per sentence, always the why. Show code, a diagram, or bullets — never a wall of text. Writeups state what/why, never process; write for the actual audience. Refer to tickets, PRs and files by name and relative path, never by a bare number. When Mehrdad says he does not understand, the frame is missing: draw it first (an ASCII sketch with one real fact on it), name one trade-off, end on a yes/no.

## Orchestrating agents

- **Hard work stays in the main session**: design, debugging, review. Agents take well-specified chores: bulk reads, research, boilerplate, one review angle. Sonnet for well-specified work, Opus for a design-heavy or hard-debugging chore, Haiku for mechanical ones.
- **Fable as an agent only when nothing else will do.** Fable quota is the scarcest. Spawn it for a consultation the decision hinges on (second opinion on a design, adversarial critique of a plan) or a Fable-grade task the main session must not absorb. State why a cheaper model would not do before spawning.
- **One ticket, or one section of a ticket, per agent.** A fresh agent per task — quality drops as an agent's session grows.
- **Every spawn carries** a file list, the ponytail rules, "no extra abstractions", and a turn cap.
- **Due diligence stays here.** Review every agent result for correctness, over-engineering, and FR/NFR fit before committing.
- **Privileged commands are Mehrdad's to run**: `aws`, `aws-vault`, `kubectl`, `helm`, `terraform apply|destroy`. Hand him the exact command in a code block and explain only the current step. (Claude Code enforces this via this plugin's hook; the rule holds for any agent.)

## Spending quota

Context writes are the cost; effort and thinking are cheap.

- **Fresh session from the map after a break.** A resumed session rewrites its whole context.
- **Read the part, not the file**: grep, offsets, `sed -n` before a whole-file read.
- **Delegate for parallelism or to keep raw bulk out of the main context.** A spawn costs about 100K tokens before it does any work; it never saves quota.
- **One reviewer with a small input** (diff, brief, CLAUDE.md) beats four with the repo.

## When building

- **Worktree off main**, rebase when drifted, clean up after merge.
- **Commit for the reviewer.** Atomic, narratable, conventional-commit formatted; push after each commit.
- **PRs small.** Vertical slices; stack follow-up fixes as new PRs; `git mv` for moves.
- **Tests ship with the change.** DAMP not DRY; custom stubs/fakes over mocks; fix root cause, never the symptom; keep CI green and add missing checks. Prefer a TDD/review-loop skill when installed.
- Rubrics — read when touched: tests → [references/testing.md](references/testing.md), TypeScript → [references/typescript.md](references/typescript.md).

## When reviewing

- **Order findings by altitude**: scope and overengineering, then structure and correctness, then style. Don't polish code that shouldn't survive.
- **Verify, don't trust.** Check PR claims against the diff and source; run the tests. A green suite that would miss a found bug is itself a finding.
- **Critical, not polite.** Previously-approved parts included. Re-review after fixes land.
- Apply the same rubrics as review lenses.
