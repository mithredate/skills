---
name: review-pr
description: Use when asked to review a PR or a branch, to check the open PRs assigned to the user, or to judge if a change is ready to merge.
argument-hint: "<PR number | branch> [--inline | --fresh]"
---

# Review a PR

First actions: call the Skill tool with `personal:work-like-mehrdad` and `personal:code-like-mehrdad`.

**Arguments:** $ARGUMENTS. The argument is a PR number or a branch name. With no argument, list the open PRs that ask for your review with `gh search prs --review-requested=@me --state=open`. Then ask which one to review. Add `--inline` or `--fresh` to force a mode. When no flag is given, the mode follows the author.

Review stance, order of findings, and the verify-don't-trust rule come from `personal:code-like-mehrdad`. The checklists are [../../agents/pr-reviewer.md](../../agents/pr-reviewer.md), [../../agents/security-reviewer.md](../../agents/security-reviewer.md), and [../../agents/blast-radius.md](../../agents/blast-radius.md). Each file is also the system prompt of its agent. The human decides whether to merge.

## Gather

1. Run `gh pr view <n> --json title,body,author,baseRefName,headRefName,headRefOid`. Write the diff to a file with `gh pr diff <n> > <scratch>/pr-<n>.diff`. When there is no PR for the branch, run `git fetch origin`, then use `git diff origin/main...<branch>` instead. A local `main` can be behind `origin/main`. A reviewer reads this file.
2. Get the **base commit**, the merge base of the PR head and the base branch. Run `gh api 'repos/{owner}/{repo}/compare/<baseRefName>...<headRefOid>' --jq .merge_base_commit.sha`. When there is no PR, run `git merge-base origin/main <branch>`.
3. The brief is the `## Brief` section of the `orchestrate` ticket that the PR body names, or of the PR body itself. When there is no brief, the intent comes from the PR body and the Jira ticket named in the title or branch. Use the Atlassian MCP to get the Jira ticket.
4. Check the kind of PR. A `fix` prefix or a bug ticket makes it a **bugfix**. If the PR is a bugfix, write down the root cause that the diff implies before you judge the fix. A fix that only addresses a symptom is a `discrepancy`.

## Choose the mode

- If the PR author is someone else, use **inline** mode. The context is fresh already. A spawned agent would rebuild it for nothing.
- If the PR author is the user, an agent of the user wrote the code. Use **fresh** mode. An agent that wrote code cannot review that code well.
- If `--inline` or `--fresh` appears in the arguments, use that mode.

## Inline: the main session reviews

**Design baseline.** The repo, the ticket, or the PR can name an ADR or a design document. If one does, judge the design of the change against it first. A review that only checks the fit with the ticket says nothing about whether the design is sound. Fit with the ticket is one line of the review.

Apply both lenses of `pr-reviewer.md` to the diff yourself. Then apply `security-reviewer.md` as a second checklist. Then follow the steps of `blast-radius.md`. Read outside the diff only for the reasons that the checklists name. Use `grep` for this, not whole-file reads. If the branch is checked out, run the declared commands yourself. For a command that fails, follow the Base run section of [../../agents/verifier.md](../../agents/verifier.md) with the base commit. If the branch is not checked out, state that verification did not run.

## Fresh: three reviewers, one verifier

Spawn the four agents in parallel with the Agent tool. Set `subagent_type` to the scoped names below. Wait for all four agents to finish.

- `dev:pr-reviewer` (Sonnet, 20 turns, no shell). Give it the diff file path, the brief text, and the PR title and body. Also give it the ticket context that you gathered, and the repo root. Also give it the path of the repo's AGENTS.md or CLAUDE.md. Its input is the diff, not the repo. It can use Context7 for one library-documentation check.
- `dev:security-reviewer` (Sonnet, 20 turns, no shell). Give it the same inputs as `dev:pr-reviewer`.
- `dev:verifier` (Haiku, 16 turns). Give it the base commit. If the branch under review is checked out, give it the directory that holds the branch. If the branch is not checked out, spawn the verifier with `isolation: "worktree"`. Then its working directory is a new worktree, and the prompt names no directory. Tell it to run `git fetch origin pull/<n>/head` and `git switch --detach FETCH_HEAD` there first. If one of these commands fails, tell it to run no declared command and to return the verdict `could_not_run`. The switch fails when the PR changes a file that the sandbox denies, such as `.claude/settings.json`.
- `dev:blast-radius` (Opus, 30 turns, with a shell). Give it the same inputs as `dev:pr-reviewer`, and the base commit. Give it the directory of the branch, or spawn it with `isolation: "worktree"`, the same as `dev:verifier`.

A red verifier verdict is a `blocking` finding. Report a `could_not_run` verdict as such. Do not report it as green.

## Report

Before you report a `blocking` or `discrepancy` finding of an agent, read its cited lines and check its claim. Move a finding that the code refutes to a refuted list, with the evidence.

Put the blast radius before the findings: the safety fact, the step where its proof stopped, and the proof. List findings in this order: `discrepancy`, then `blocking`, then `quality_note`, then at most five `nit` entries. State a count of the remaining nits. Write a `blocking` or `discrepancy` finding as its bug class and each instance. Then list each `pre_existing` item of the reviewers and the verifier, and the refuted list. Every entry keeps its relative path. Write findings by the rules of `productivity:write-ste`. If the PR is a bugfix, put the root-cause line first. The fresh mode ends with a cost line. This line gives the token figure that each agent result reports, and the sum of the figures.

Post to GitHub only when the user asks for it. Post one review with the same content. Write it in the voice that the repo's conventions specify.
