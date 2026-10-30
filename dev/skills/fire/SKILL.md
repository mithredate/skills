---
name: fire
description: Use when a session claims an `orchestrate` ticket with a `## Brief`, when `prep` writes a brief file, or on `/fire`.
argument-hint: "<ticket path | brief file>"
---

# Fire

**Arguments:** $ARGUMENTS. The argument is the path of an `orchestrate` build ticket, or of a brief file that `productivity:prep` wrote. If there is no argument, use the build ticket that this session claimed, or the brief file that `prep` wrote in this session.

The session does not edit code or a target system. Agents build, review, and verify. The session routes their results and hands back.

## Read the brief

1. Read the ticket or the brief file. If the input is not a file with a `## Brief` section, stop. For a ticket, tell the user that the Hand-off of `orchestrate` writes its brief. Otherwise, tell the user to write one with `productivity:prep`. If a ticket in its `blocked-by` is open, stop and name it.
2. For each git repo in the Targets line, run `git fetch origin`. An older brief has a Repos line instead. Read it as the Targets line. Make a branch `feat/<slug>` from the base branch that the brief names, or `fix/<slug>` for a bugfix. The slug is the ticket slug, or a short slug of the Goal line. Follow the repo's AGENTS.md or CLAUDE.md for the branch name and for a worktree. If the branch exists from an earlier run, keep its work and continue on it.
3. Set the kind to `bugfix` when the brief is a bugfix, or when its Verification line asks for the failing test first. Otherwise set it to `change`.

The step is done when each git target has its branch checked out in a known directory.

The agents `dev:pr-reviewer`, `dev:security-reviewer`, `dev:verifier`, `dev:finding-checker`, and `dev:merge-judge` belong to this plugin. If the Agent tool does not list them, ask the user to run `/reload-plugins`.

## Build

Start one agent with the Agent tool, on Opus. Give it:

- the path of [references/implementer-brief.md](references/implementer-brief.md), as its contract
- the path of the ticket or the brief file, and the Brief section, verbatim
- the kind
- each target: the directory and the base commit of a git repo, or the name of a system
- a diff file path in the scratchpad
- in a patch round, the red checks and the open findings of the prior round

A `pre_existing` command is not a red check. Give each open finding without the instances that `dev:finding-checker` refuted or listed as `pre_existing`.

The step is done when the agent returns its JSON. If the outcome is `plan_broken` or `setup_blocked`, stop with the status `blocked` and its evidence.

## Review and patch

Start these agents in parallel, and wait for all of them:

- `dev:pr-reviewer` and `dev:security-reviewer`, when a git target changed. Give each the diff file, the brief, the path of the ticket or the brief file, and the root and the AGENTS.md or CLAUDE.md of each changed repo.
- `dev:verifier`, once for each git target, with its directory, its base commit, and its AGENTS.md or CLAUDE.md.
- `dev:verifier`, once, for the brief's Verification checks of the git targets that the declared commands do not cover. Tell it to run each check and report it as a command. Give it no base commit.
- One `general-purpose` agent for the Verification checks of each target that is not a git repo. That agent has the tools of the system, which `dev:verifier` does not have. Tell it to change nothing, and to return the JSON of `dev:verifier`.

Do not give an agent a Verification check that the brief puts after the merge.

In rounds 2 and 3, also give the reviewers and the verifiers the `pre_existing` results of the earlier rounds. These results include the `pre_existing` list of `dev:finding-checker`.

If a reviewer returns a `blocking` or `discrepancy` finding, start `dev:finding-checker` once. Give it these findings of all reviewers, the diff file, and the brief. Also give it the root, the base commit, and the AGENTS.md or CLAUDE.md of each changed repo. If it returns no JSON, treat each finding as confirmed.

An **open** finding is a finding that `dev:finding-checker` did not refute. A `pre_existing` item is not a finding. A `pre_existing` item and a refuted finding start nothing. Keep each one for the PR body.

Then decide:

| Result | Next |
|---|---|
| an open `discrepancy` | stop, status `blocked`. The plan is wrong, and a patch cannot fix it |
| an open `blocking` finding, or a red or `could_not_run` verifier | next round patches |
| `quality_note` only | next round patches. On the last round, `pass` |
| `nit` only, or nothing open | `pass` |

The first build is round 1. The run has at most 3 rounds. If round 3 does not pass, the status is `rounds_spent`.

## Hand back

1. If the status is `pass`, push each branch that has a commit after its base. Open one draft PR in each changed repo. The title follows the repo's PR rule. The body names the ticket by title and path, because `productivity:sweep` finds the PR by that path. Without a ticket, the body holds the brief. The body lists the verifier evidence and each `pre_existing` item. It lists each refuted finding with the evidence of `dev:finding-checker`.
2. If the status is `pass`, follow the Merge section. The step is done when the PR is merged, or when it stays a draft for the user.
3. Report the status: `pass`, `blocked`, or `rounds_spent`. If the status is not `pass`, put the blocker or the open findings first, in this order: `discrepancy`, `blocking`, red checks, `quality_note`. When a blocker names a decision, list the options for the user. If the status is `pass`, say `merged` or `not merged`. For `not merged`, give the reasons that the PR waits for the user.
4. If the status is `pass` and the run used more than one round, list each `blocking` finding that a patch round fixed. Write each one as the condition, boundary, or invariant that the first build missed. Do not name a path, a line, or code. For example, write "A token without an aud claim is valid input and must return 401", not "verify.ts:42 has no null check".
5. Give the PR links, or the Verification evidence for a target that is not a git repo. If the status is not `pass`, give each branch and its directory instead of PR links. Give the rounds spent.

A draft PR is complete, and the reviewer and the verifier passed it. It is a draft so that the user reads it before other people do. Merge only by the Merge section.

## Merge

Merge runs only when each condition below holds. Otherwise, skip it, and the PR stays a draft for the user.

- The run opened exactly one PR, and every target of the brief is a git repo.
- The AGENTS.md or CLAUDE.md of that repo on the base branch has the line `**fire can auto-merge.**`. Run `git fetch origin`, then read the file with `git show origin/<base branch>:<file>`. The PR branch can change the file, so its copy does not count.

Name the PR by its URL in each `gh` command. Without it, `gh` acts on the PR of the current branch.

1. Run `git rev-parse HEAD` on the PR branch. The output is the judged head. Start `dev:merge-judge`. Give it the diff file and the brief. Also give it the verifier results and the open findings of the last round, and the AGENTS.md or CLAUDE.md of the base branch. The step is done when it returns its JSON.
2. Treat the verdict as `human` if it is not `auto`, if an item applies, or if there is no JSON. For `human`, put the reasons at the top of the PR body, and stop. Without reasons, write "No verdict from merge-judge."
3. Run `gh pr ready`. Then run `gh pr checks --watch --required`. If the shell stops it at its time limit, run it again. The error `no checks reported` or `no required checks reported` means that the repo has no required check. The step is done when the command exits 0 or shows one of these errors.
4. Run `gh pr merge --squash --match-head-commit <judged head>`. Do not add `--auto`. GitHub refuses the merge when the PR head is not the judged head. The step is done when the command exits 0.
5. If `gh pr ready` fails, a required check fails, or step 4 fails, the PR does not merge. Run `gh pr ready --undo`. Put the failed check or the error at the top of the PR body.
