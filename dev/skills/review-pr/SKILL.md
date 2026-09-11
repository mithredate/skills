---
name: review-pr
description: Review a pull request or branch within a token budget. Use when asked to review a PR, check the open PRs assigned to the user, or judge a change before merge; also called by implement-from-brief. Inline (the main session reviews) for a PR someone else wrote; fresh (one capped reviewer plus one verifier) for a PR the user's own agent wrote.
argument-hint: "<PR number | branch> [--inline | --fresh]"
---

# Review a PR

**Arguments:** $ARGUMENTS. A PR number or branch, and optionally `--inline` or `--fresh` to force a mode; without a flag the mode follows the author.

Review stance, order of findings, and the verify-don't-trust rule come from `personal:work-like-mehrdad`; call the Skill tool with it first. The checklist is [../../agents/pr-reviewer.md](../../agents/pr-reviewer.md), which is also the reviewer agent's system prompt. Merging is the human's decision.

## Gather

1. `gh pr view <n> --json title,body,author,baseRefName,headRefName`; write the diff to a file, `gh pr diff <n> > <scratch>/pr-<n>.diff` (for a branch without a PR, `git diff main...<branch>`). The file is what a reviewer reads.
2. The brief: the wayfinder ticket the PR body names; read its `## Brief`. Without one, the PR body and the Jira ticket named in the title or branch (Atlassian MCP) are the intent.
3. The kind: a `fix` prefix or a bug ticket makes it a **bugfix**. For a bugfix, write down the root cause the diff implies before judging the fix; a fix that addresses a symptom is a `discrepancy`.

## Choose the mode

- The PR author is someone else → **inline**. Your context is fresh by construction; a spawn would rebuild it for nothing.
- The PR author is the user, so the code came from one of their agents → **fresh**. The eyes that wrote it cannot review it.
- `--inline` or `--fresh` in the arguments → that mode.

## Inline: the main session reviews

Apply both lenses of the checklist yourself, on the diff. Read outside the diff only for the reasons the checklist names, with `grep`, not whole files. Run the declared commands yourself when the branch is checked out; otherwise state that verification did not run.

## Fresh: one reviewer, one verifier

Spawn both in parallel with the Agent tool, `subagent_type` set to the scoped names below, and wait for both:

- `dev:pr-reviewer` (Sonnet, 20 turns, no shell): the diff file path, the brief text, the PR title and body, the ticket context you gathered, the repo root. Its input is the diff, not the repo; it has Context7 for one library-doc check.
- `dev:verifier` (Haiku, 12 turns): the directory holding the branch. When the branch is not checked out, `gh pr checkout <n>` into `.worktrees/review-<n>` first and remove it afterwards.

A red verifier verdict is a `blocking` finding. A `could_not_run` verdict is reported as such, never as green.

## Report

Findings ordered by altitude: `discrepancy`, then `blocking`, then `quality_note`, then at most five `nit` entries with a count of the rest. Every entry keeps its relative path. Simplified Technical English. For a bugfix, the root-cause line comes first. The fresh mode ends with the cost line: the token figure each agent result reports and their sum.

Post to GitHub only when the user asks; then one review with the same content, in the person voice the repo's conventions ask for.
