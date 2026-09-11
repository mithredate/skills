---
name: fire
description: Fires a briefed change through a Workflow graph inside a token ceiling. One implementer round, then one reviewer and one verifier in parallel, verdict in code, three rounds maximum. The input is a wayfinder ticket with a Brief section. The output is a branch in a worktree and a report. No PR, no merge.
argument-hint: "<ticket path> +<n>k [max_rounds=N]"
disable-model-invocation: true
---

# Fire

**Arguments:** $ARGUMENTS. The first argument is the path of a wayfinder ticket. The `+<n>k` argument is the token ceiling for this turn. `max_rounds=N` caps the implementer rounds. The default is 3.

The Workflow tool runs the script [scripts/loop.workflow.js](scripts/loop.workflow.js). The script owns the routing, the ledger, the verdict, and the budget check. The main session reads the brief, makes the worktree, starts the workflow, and reports. It does not edit code. It does not read the transcripts of the agents.

## The graph

```
orient (Haiku, read-only, once)
   |
   v
implement (Sonnet, in the worktree) ---- learned ----> reset, next round
   | implemented                    \--- plan_broken, setup_blocked ---> escalate
   v
review (dev:pr-reviewer) + verify (dev:verifier), in parallel, on the diff file
   |
   v
verdict, in code:
   discrepancy .......... reset the worktree to the base, keep the ledger, next round fresh
   blocking or red ...... next round patches
   quality_note only .... next round patches, or pass on the last round
   nit only ............. pass
```

The **ledger** is the list of design-level constraints that the implementer and the reviewer learned. It is append-only and verbatim. Every implementer round reads it. The reviewer never reads it.

## Pre-flight

1. Read the ticket. The `## Brief` section holds the repo, the branch, the files, the order, the tests, the FR, the NFR and the ponytail limits. If the ticket has no `## Brief` section, stop and ask the user for one.
2. If the arguments hold no `+<n>k` ceiling, stop and ask the user for one. The ceiling is the hard stop of the run. It counts the output tokens of this turn, not the total tokens.
3. The nodes `dev:pr-reviewer` and `dev:verifier` are agents of this plugin. If the Agent tool does not list them, ask the user to run `/reload-plugins`. A session registers agents at its start.
4. In the repo that the brief names, run `git fetch origin`. Set `baseSha` to the output of `git rev-parse origin/main`.
5. Make the worktree. Run `git worktree add -b <branch> .worktrees/<branch> <baseSha>` from the repo root. The branch name comes from the brief.
6. Set `kind` to `bugfix` when the branch starts with `fix/`, or when the brief's Tests line asks for the failing test first. Otherwise set it to `change`.
7. Set `implementerModel` to `opus` when the brief says the change is design-heavy. Otherwise set it to `sonnet`.
8. Set `graphPath` to `<repo root>/graphify-out/graph.json` when that file exists. Otherwise set it to `null`.
9. Copy this skill's `scripts/loop.workflow.js` to `.worktrees/<branch>.workflow.js`. The Workflow tool accepts only a script path under the working directory.
10. Call the Workflow tool with `scriptPath` set to that copy and with these `args`. Pass them as a JSON object, not as a string.

```json
{
  "ticketPath": "<absolute path of the ticket>",
  "briefText": "<the Brief section, verbatim>",
  "repoRoot": "<absolute repo root>",
  "worktree": "<absolute path of .worktrees/<branch>>",
  "branch": "<branch>",
  "baseSha": "<baseSha>",
  "diffFile": "<absolute path of .worktrees/<branch>.diff>",
  "kind": "bugfix | change",
  "implementerModel": "sonnet | opus",
  "maxRounds": 3,
  "graphPath": "<path or null>",
  "skillDir": "<absolute path of this skill's directory>"
}
```

The workflow runs in the background. Wait for its task notification. Do not start other work in the meantime.

## After the run

The workflow returns `status`, `rounds`, `ledger`, `findings`, `blocker` and `outputTokens`.

1. Write the ledger to `.worktrees/<branch>-ledger.md`, one entry per line. Write the file also when the ledger is empty.
2. Report in this order. State the status: `pass`, `escalate`, `budget`, `plan_broken`, `setup_blocked` or `agent_failed`. Then list the findings that remain: `discrepancy`, then `blocking`, then red verifier commands, then `quality_note`, then at most five `nit` entries. Then give the worktree path, the branch, and the ledger path. Then give the rounds spent out of the cap. End with a cost line: the `outputTokens` figure from the result, and the `subagent_tokens` figure from the task notification.
3. On `plan_broken` or `setup_blocked`, put the `blocker` text first. When it names a decision, list the options for the user.
4. Open no PR. Merge nothing. Push nothing. Remove nothing. The next step is the user's: `/review-pr <branch> --fresh`, or a merge.

If the run was killed, call the Workflow tool again with the same `scriptPath`, the same `args`, and `resumeFromRunId`. Finished agents return from the cache.

## Without the Workflow tool

Codex has no Workflow tool. Follow the graph by hand. Start each node as one fresh agent with the prompt the script builds. Compute the verdict with the table above. Keep the ledger in a file and paste it into every implementer prompt.
