---
name: review-pr
description: Review a pull request or branch within a token budget. Use when the user asks to review a PR, asks to check the open PRs assigned to the user, or asks to judge a change before merge. The implement-from-brief skill also calls this skill. Inline mode has the main session review a PR that someone else wrote. Fresh mode uses one capped reviewer agent and one verifier agent for a PR that the user's own agent wrote.
argument-hint: "<PR number | branch> [--inline | --fresh]"
---

# Review a PR

**Arguments:** $ARGUMENTS. The argument is a PR number or a branch name. Add `--inline` or `--fresh` to force a mode. When no flag is given, the mode follows the author.

Review stance, order of findings, and the verify-don't-trust rule come from `personal:work-like-mehrdad`. Call the Skill tool with `personal:work-like-mehrdad` first. The checklist is [../../agents/pr-reviewer.md](../../agents/pr-reviewer.md). This file is also the reviewer agent's system prompt. The human decides whether to merge.

## Gather

1. Run `gh pr view <n> --json title,body,author,baseRefName,headRefName`. Write the diff to a file with `gh pr diff <n> > <scratch>/pr-<n>.diff`. When there is no PR for the branch, use `git diff main...<branch>` instead. A reviewer reads this file.
2. The brief is the wayfinder ticket that the PR body names. Read its `## Brief` section. When there is no brief, the intent comes from the PR body and the Jira ticket named in the title or branch. Use the Atlassian MCP to get the Jira ticket.
3. Check the kind of PR. A `fix` prefix or a bug ticket makes it a **bugfix**. If the PR is a bugfix, write down the root cause that the diff implies before you judge the fix. A fix that only addresses a symptom is a `discrepancy`.

## Choose the mode

- If the PR author is someone else, use **inline** mode. The context is fresh already. A spawned agent would rebuild it for nothing.
- If the PR author is the user, an agent of the user wrote the code. Use **fresh** mode. An agent that wrote code cannot review that code well.
- If `--inline` or `--fresh` appears in the arguments, use that mode.

## Inline: the main session reviews

Apply both lenses of the checklist to the diff yourself. Read outside the diff only for the reasons that the checklist names. Use `grep` for this, not whole-file reads. If the branch is checked out, run the declared commands yourself. If it is not checked out, state that verification did not run.

## Fresh: one reviewer, one verifier

Spawn both agents in parallel with the Agent tool. Set `subagent_type` to the scoped names below. Wait for both agents to finish.

- `dev:pr-reviewer` (Sonnet, 20 turns, no shell). Give it the diff file path, the brief text, and the PR title and body. Also give it the ticket context that you gathered, and the repo root. Its input is the diff, not the repo. It can use Context7 for one library-documentation check.
- `dev:verifier` (Haiku, 12 turns). Give it the directory that holds the branch under review. If the branch is not checked out, run `gh pr checkout <n>` into `.worktrees/review-<n>` first. Remove that worktree afterwards.

A red verifier verdict is a `blocking` finding. Report a `could_not_run` verdict as such. Do not report it as green.

## Report

List findings in this order: `discrepancy`, then `blocking`, then `quality_note`, then at most five `nit` entries. State a count of the remaining nits. Every entry keeps its relative path. Write findings in Simplified Technical English. If the PR is a bugfix, put the root-cause line first. The fresh mode ends with a cost line. This line gives the token figure that each agent result reports, and the sum of the two figures.

Post to GitHub only when the user asks for it. Post one review with the same content. Write it in the voice that the repo's conventions specify.
