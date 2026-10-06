---
name: fire
description: Fulfils the brief of one `orchestrate` build ticket inside a token ceiling. The session plans the units. A Workflow graph runs implement, review, and verify rounds for each unit, then one gate on the whole change. A brief can span several repos. The output is draft PRs and a report. Use when a build ticket names `dev:fire` in its skills, or when the user runs `/fire`.
argument-hint: "<ticket path> +<n>k [max_rounds=N]"
---

# Fire

**Arguments:** $ARGUMENTS. The first argument is the path of an `orchestrate` build ticket. If there is no argument, use the build ticket that this session claimed. The `+<n>k` argument is the token ceiling for this turn. `max_rounds=N` caps the implementer rounds of each unit. The default is 3.

The session plans the units. The Workflow tool runs the script [scripts/loop.workflow.js](scripts/loop.workflow.js). The script owns the routing, the ledger, the verdict, the gate, and the budget check. The session does not edit code. It does not read the transcripts of the agents.

## The graph

```
orient (Sonnet, read-only, once, every repo)
   |
   v
for each unit, in plan order:
   implement (in the unit's worktrees) ---- learned ----> reset to the unit base, next round
      | implemented                    \--- plan_broken, setup_blocked ---> escalate
      v
   review (dev:pr-reviewer) + verify (dev:verifier, one per repo), in parallel
      |
      v
   verdict, in code:
      discrepancy .......... reset to the unit base, keep the ledger, next round fresh
      blocking or red ...... next round patches
      quality_note only .... next round patches, or pass on the last round
      nit only ............. pass, next unit
   |
   v
gate: the brief's Verification and Safe to deploy checks, plus one review of the whole change when there is more than one unit
```

The **ledger** is the list of design-level constraints that the implementers and the reviewers learned. It is append-only and verbatim, and all units share it. Every implementer round reads it. The reviewer never reads it.

## Pre-flight

1. Read the ticket. The `## Brief` section holds the goal, the repos, the FR, the NFR, the verification, and the ponytail limits. If the ticket has no `## Brief` section, stop and ask the user for one. If a ticket in its `blocked-by` is open, stop and name it.
2. Set `ceiling` from the `+<n>k` argument. If there is none, use the brief's Budget line. If neither has a ceiling, stop and ask the user for one. The script stops at the ceiling, so it is the hard stop of the run. It counts the output tokens from the start of the workflow, not the total tokens.
3. The nodes `dev:pr-reviewer` and `dev:verifier` are agents of this plugin. If the Agent tool does not list them, ask the user to run `/reload-plugins`. A session registers agents at its start.
4. Set `runDir` to `.worktrees/fire-<ticket slug>` under the working directory, and make it. If git does not ignore `.worktrees/`, add it to `.git/info/exclude`. All worktrees go under `runDir`, so every write of the run stays inside the working directory.
5. For each repo that the brief names:
   1. Run `git fetch origin`. Set `baseSha` to the output of `git rev-parse origin/<base>`, with the base branch from the brief's Repos line.
   2. Name the branch `feat/<ticket slug>`, or `fix/<ticket slug>` when the brief is a bugfix. If the repo's AGENTS.md or CLAUDE.md has a branch rule, follow it.
   3. If the branch exists from an earlier run, keep its work. Run `git -C <repo root> worktree prune`. If `<runDir>/<repo name>` exists, run `git -C <repo root> worktree move <runDir>/<repo name> <runDir>/<repo name>-<timestamp>`. Then run `git -C <repo root> branch -m <branch> <branch>-<timestamp>`. If `<runDir>/ledger.md` exists, rename it to `ledger-<timestamp>.md`.
   4. Run `git -C <repo root> worktree add -b <branch> <runDir>/<repo name> <baseSha>`.
   5. Set `graphPath` to `<repo root>/graphify-out/graph.json` when that file exists. Otherwise set it to `null`.
6. Plan the units. A **unit** is the part of the brief that one implementer builds in one loop. Write the fewest units, because each round costs a lot of tokens and time. One unit for the whole brief is the default. Split only when one implementer cannot hold the work. Order the units so that a unit that serves a contract comes before a unit that calls it. Give each unit a name, its repos, and its `build` lines quoted verbatim from the brief. Every FR line goes into exactly one unit. Every NFR line goes into each unit that it limits.
7. Set `kind` to `bugfix` when the brief is a bugfix, or when its Verification line asks for the failing test first. Otherwise set it to `change`.
8. Set `implementerModel` to `fable` when the brief or a unit is design-heavy. Otherwise set it to `opus`. The script sets the models of the other nodes.
9. Copy this skill's `scripts/loop.workflow.js` to `<runDir>/loop.workflow.js`. The Workflow tool accepts only a script path under the working directory.
10. Call the Workflow tool with `scriptPath` set to that copy and with these `args`. Pass them as a JSON object, not as a string.

```json
{
  "ticketPath": "<absolute path of the ticket>",
  "briefText": "<the Brief section, verbatim>",
  "runDir": "<absolute path of runDir>",
  "ceiling": <output tokens, for example 300000>,
  "kind": "bugfix | change",
  "implementerModel": "opus | fable",
  "maxRounds": 3,
  "skillDir": "<absolute path of this skill's directory>",
  "repos": [
    { "name": "<repo>", "root": "<absolute repo root>", "worktree": "<absolute worktree path>", "branch": "<branch>", "baseSha": "<baseSha>", "graphPath": "<path or null>" }
  ],
  "units": [
    { "name": "<unit>", "repos": ["<repo>"], "build": "<FR and NFR lines, verbatim>" }
  ]
}
```

The workflow runs in the background. Wait for its task notification. Do not start other work in the meantime.

## After the run

The workflow returns `status`, `unit`, `rounds`, `ledger`, `findings`, `blocker` and `outputTokens`.

1. Write the ledger to `<runDir>/ledger.md`, one entry per line. Write the file also when the ledger is empty.
2. If the status is `pass`, push each branch that has a commit after its base, and open one draft PR in that repo. The title follows the repo's PR rule. The body names the ticket by title and path, and lists the gate evidence. Draft PRs keep the review a human step, which is a `gate` ticket in the map.
3. Report in this order. State the status: `pass`, `gate_failed`, `escalate`, `budget`, `plan_broken`, `setup_blocked` or `agent_failed`, and the unit it stopped in. Then list the findings that remain: `discrepancy`, then `blocking`, then red verifier commands, then `quality_note`, then at most five `nit` entries. Then give the PR links or the worktree paths, and the ledger path. Then give the rounds spent in each unit. End with a cost line: the `outputTokens` figure from the result, and the `subagent_tokens` figure from the task notification.
4. On `plan_broken` or `setup_blocked`, put the `blocker` text first. When it names a decision, list the options for the user.
5. Merge nothing. Remove nothing. On `pass`, the next step is the gate ticket that waits on this build. On any other status, `orchestrate` cook keeps the build ticket open and blocks it on a ticket for the blocker.

If the run was killed, call the Workflow tool again with the same `scriptPath`, the same `args`, and `resumeFromRunId`. Finished agents return from the cache.

## Without the Workflow tool

Codex has no Workflow tool. Follow the graph by hand. Start each node as one fresh agent with the prompt the script builds. Compute the verdict with the table above. Keep the ledger in a file and paste it into every implementer prompt.
