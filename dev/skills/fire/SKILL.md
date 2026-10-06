---
name: fire
description: Builds the brief of one `orchestrate` build ticket with a fresh implementer agent, then reviews and verifies the change, with at most three rounds. The target can be a git repo or another system, such as n8n. Use when a session claims a ticket with a `## Brief`, or when the user runs `/fire`.
argument-hint: "<ticket path>"
---

# Fire

**Arguments:** $ARGUMENTS. The argument is the path of an `orchestrate` build ticket. If there is no argument, use the build ticket that this session claimed.

The session does not edit code or a target system. Agents build, review, and verify. The session routes their results and hands back.

## Read the brief

1. Read the ticket. If it has no `## Brief` section, stop and ask the user for one. If a ticket in its `blocked-by` is open, stop and name it.
2. For each git repo in the Targets line, run `git fetch origin`. An older brief has a Repos line instead. Read it as the Targets line. Make a branch `feat/<ticket slug>` from the base branch that the brief names, or `fix/<ticket slug>` for a bugfix. Follow the repo's AGENTS.md or CLAUDE.md for the branch name and for a worktree. If the branch exists from an earlier run, keep its work and continue on it.
3. Set the kind to `bugfix` when the brief is a bugfix, or when its Verification line asks for the failing test first. Otherwise set it to `change`.

The step is done when each git target has its branch checked out in a known directory.

The agents `dev:pr-reviewer` and `dev:verifier` belong to this plugin. If the Agent tool does not list them, ask the user to run `/reload-plugins`.

## Build

Start one agent with the Agent tool, on Opus. Give it:

- the path of [references/implementer-brief.md](references/implementer-brief.md), as its contract
- the ticket path and the Brief section, verbatim
- the kind
- each target: the directory and the base commit of a git repo, or the name of a system
- a diff file path in the scratchpad
- in a patch round, the findings and the red checks of the prior round

The step is done when the agent returns its JSON. If the outcome is `plan_broken` or `setup_blocked`, stop with the status `blocked` and its evidence.

## Review and patch

Start these agents in parallel, and wait for all of them:

- `dev:pr-reviewer`, when a git target changed. Give it the diff file, the brief, the ticket path, and the root and the AGENTS.md or CLAUDE.md of each changed repo.
- `dev:verifier`, once for each git target, with its directory and its AGENTS.md or CLAUDE.md.
- `dev:verifier`, once, for the brief's Verification checks of the git targets that the declared commands do not cover. Tell it to run each check and report it as a command.
- One `general-purpose` agent for the Verification checks of each target that is not a git repo. That agent has the tools of the system, which `dev:verifier` does not have. Tell it to change nothing, and to return the JSON of `dev:verifier`.

Then decide:

| Result | Next |
|---|---|
| a `discrepancy` | stop, status `blocked`. The plan is wrong, and a patch cannot fix it |
| a `blocking` finding, or a red or `could_not_run` verifier | next round patches |
| `quality_note` only | next round patches. On the last round, `pass` |
| `nit` only, or nothing | `pass` |

The first build is round 1. The run has at most 3 rounds. If round 3 does not pass, the status is `rounds_spent`.

## Hand back

1. If the status is `pass`, push each branch that has a commit after its base. Open one draft PR in each changed repo. The title follows the repo's PR rule. The body names the ticket by title and path, because `productivity:sweep` finds the PR by that path. The body lists the verifier evidence.
2. Report the status: `pass`, `blocked`, or `rounds_spent`. If the status is not `pass`, put the blocker or the open findings first, in this order: `discrepancy`, `blocking`, red checks, `quality_note`. When a blocker names a decision, list the options for the user.
3. Give the PR links, or the Verification evidence for a target that is not a git repo. If the status is not `pass`, give each branch and its directory instead of PR links. Give the rounds spent.

Merge nothing. The human review is a `gate` ticket in the map.
