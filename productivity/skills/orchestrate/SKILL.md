---
name: orchestrate
description: Use in a `.initiatives/` repo, to set one up, for work too big for a session, or on "chart", "cook", "orchestrate fire", "close", or "prioritize".
---

# Orchestrate

First actions: call the Skill tool with `personal:work-like-mehrdad` and `productivity:sweep`.

An **orchestrator repo** plans the work. The sibling repos and systems it plans for hold the implementation.

An **initiative** starts as a loose idea, too big for one agent session. The **goal** is what the initiative must produce: a spec, a decision, or a change. Orchestrate plans the way to the goal as a set of tickets. Most tickets are **decision tickets**. A decision ticket is a question whose answer is a decision, not a slice of the build. When nothing is left to decide, the initiative hands off the build as build tickets and gate tickets. Write each piece of build work as a build ticket, also when this session can do the work now.

The file shapes of the index, the initiative, the tickets, and the gate are in [references/format.md](references/format.md). Read it before you chart an initiative or work a ticket.

## The index

**The index** is the file `.initiatives/README.md`, with one row for each initiative.

- Every session reads the index before any other step. This rule applies also when the user names an initiative.
- If the index is missing, build it. If an initiative directory has no row, or a row has no directory, repair the index. Leave a `closed` row and its directory as they are, also when the directory still exists. Run `close` for that initiative only when the user names it. If a one-line state is longer than the limit below, cut it to the latest fact and the next step. Do this before any other work. Do not work a ticket while the index is not true.
- Then run sweep in write mode. Give it the initiative of this session and each `waiting` row. Sweep also adds each new host to `.initiatives/sources.md`, or builds the file if it is missing. The tracker is true only when its live links are checked. `orchestrate fire` skips this sweep.
  - Before you work a ticket, sort each claim that sweep gives you with `productivity:settle-decisions`. Record each result with the link and the date and time of the check. Put the record in the ticket that holds the link. If no ticket holds the link, put the record in the Notes of the initiative.
- The row order is the priority. The first row is the most important initiative.
- When the user says "prioritize", reorder the rows with the user. Then commit and push.
- `waiting` records an external dependency, for example a support case or a PR review by another person. `paused` records the owner's own choice to stop. Only an `open` row is takeable.
- The one-line state of an `open`, `waiting`, or `paused` row is one sentence of 25 words maximum. The count includes the text of a link, not its URL. A `closed` row has no state.

## One directory per initiative

`.initiatives/<YYYY-MM-DD>-<slug>/` holds the `initiative.md` of one initiative, with its tickets and assets. For a new initiative, first create its directory and its index row. Then chart the initiative inside the directory.

When a change happens to an initiative, ticket, or asset, commit and push it. Concurrent sessions read the tracker from git.

Refer to an initiative or a ticket by its title in everything the user reads. Put the path inside the title's link. A list of bare ids is not readable.

## The initiative

`initiative.md` is an index of decisions, not a store. A decision lives in one place, its ticket. `initiative.md` gives only its gist and a link. Open tickets are not in `initiative.md`. A session finds them from the ticket frontmatter.

An **unspecified question** is an in-scope question that you cannot state precisely yet, because it waits on open tickets. The Not yet specified section of `initiative.md` holds them.

- If you can state the question precisely now, write a ticket, also when the ticket is blocked.
- If you cannot state it precisely yet, keep it under Not yet specified. Do not cut it into ticket-sized pieces. One unspecified question can become several tickets, or none.
- Not yet specified holds no decided question, no live ticket, and no out-of-scope work.

The goal fixes the scope. When a ticket turns out to be past the goal, close it and add one line under Out of scope with its reason and a link. It does not go under Decisions so far. Out-of-scope work comes back only as a new initiative.

## Ticket types

A **HITL** ticket waits for the human. A `gate` ticket is HITL. A `decision` or `prototype` ticket is HITL when `productivity:settle-decisions` gives its decision to the human. The agent never takes the human's side of a HITL ticket.

- **decision**: a decision ticket. The default type.
- **prototype**: make a cheap, rough artifact with `productivity:prototype`. Link the artifact as an asset. Use it when "how must it look" or "how must it behave" is the key question. The artifact is evidence for the decision.
- **research** (agent alone): find a fact outside the working directory that a decision waits on. A subagent with a fresh context calls the Skill tool with `productivity:research`.
- **task** (agent alone): work that the agent does alone. A task before a decision makes a fact visible, for example data moved so that its shape shows. A build task holds a `## Brief`. The resolution records what was done and the facts that later tickets need.
- **gate** (HITL): one human step, for example a setup that the agent cannot do, a deploy, or a check that only a human can make. The agent never claims it. The review of a choice that another person makes or proposes is a `decision` ticket.

## chart

The user gives a loose idea. Charting is one session's work. It resolves no ticket.

1. Name the goal with the user. The goal fixes the scope, so settle it first. It ends with one sentence that starts with `Closes when`. The step is done when the user agrees to the goal.
2. List the open decisions breadth-first, and the first steps that a session can take now. If no unspecified question shows, the work fits one session and needs no initiative. Write the user a prompt that starts that session. Then stop.
3. Write `initiative.md` with the Goal and the Notes. Leave Decisions so far empty. List the unspecified questions under Not yet specified.
4. Write a ticket for each question that you can state precisely now. Then add the `blocked-by` edges.
5. For each research ticket, start a subagent with a fresh context that calls the Skill tool with `productivity:research`. Each subagent resolves its ticket in parallel.
6. Sweep the session as in `cook` step 6.
7. Commit and push.

## cook

If the user names no initiative, ask the user which initiative to work. Claim no ticket until the user names the initiative. One session takes every ticket that the next step toward the goal needs, so the human answers one round, not one session for each ticket. `orchestrate fire` builds a ticket whose brief targets a git repo, so `cook` never claims one. A build for another system, such as an n8n instance, opens no PR for a human to review. So `cook` claims it only when the user names it, and runs it with the user present.

1. Read `initiative.md`. Do not read every ticket body. Read a related or closed ticket only when the work needs it.
2. Start from the goal. Name the next step toward it that a person or an agent can take now. Claim the open tickets that this step cannot start without, or the tickets that the user names. Check that need against the step itself, because a `blocked-by` edge can be stale. Do not claim a `gate`, or a build ticket for a git repo. List the other open tickets as "not needed now", with no question to the user. If the next step is a gate, give the user its checklist. List each ready build ticket as approved or as waiting for a yes. Show the brief of each waiting ticket. Ask the user for a yes. Then go to step 7.
   - Only the user's yes to a brief that you showed in this session adds `approved:`. A request to cook or to build is not a yes.
3. Resolve the tickets. Start a subagent with a fresh context for each `research` ticket. Sort each decision with `productivity:settle-decisions`. Make your own decisions first, then put the human's decisions in one round.
4. If `fire` returns a status other than `pass`, do not close the ticket and add no gist. Record the status and the blocker in the ticket, and clear `assignee`. Write a ticket for the blocker, and add it to the `blocked-by` of the build ticket. In all other cases, write the record of `productivity:settle-decisions` as the resolution of a decision ticket. Close the ticket. Add one gist line under Decisions so far in `initiative.md`. The resolution of a build ticket links the PRs or the Verification evidence.
   - When a decision ticket closes, write its decision into the brief of each build ticket that has it in `blocked-by`. Follow the rules of `productivity:prep`.
   - If `fire` returns `pass` and `not merged` for a build with no review gate, write a review `gate` ticket for its PR. Add the gate to the `blocked-by` of each open ticket that has the build ticket in its `blocked-by`.
5. Write a ticket for each new question. If an unspecified question is now precise, move it from Not yet specified into a ticket. If a ticket is past the goal, rule it out of scope. If the decision makes another ticket wrong, change or delete that ticket. If a ticket without a brief that is not a `gate` is now ready, go back to step 2.
6. Sweep the session. Run sweep in write mode, for the session items. The step is done when every item has a place.
7. Update the one-line state in the index row of this initiative, in the limit of [The index](#the-index). Change no other row. Give the number of ready build tickets that are approved and the number that wait for a yes, not their titles. If the row is `paused`, set the status to `open`. If the resolution now depends on a person outside the repo, set the status to `waiting`.
8. Commit and push the tickets, `initiative.md`, and the index. The task is done when each claimed ticket is closed or blocked as in step 4, and the sweep table is in your final message.

The user can run other sessions on other ready tickets at the same time. If the user asks for several sessions, split only the tickets that step 2 claims. Start each session with `orchestrate cook`, the initiative, and its tickets. If there are fewer tickets than sessions, start fewer sessions and tell the user why. Expect concurrent commits.

## fire

`orchestrate fire <orchestrator repo path>` builds one approved build ticket with no human. Run it in a session in the target repo, because `EnterWorktree` reaches only the repo of the session. A scheduled task can start it.

1. Clone the orchestrator repo from its `origin` into the scratchpad. Read and change tickets only in this clone, because the user's checkout can hold work in progress.
2. If an open ticket has an `assignee` that starts with `orchestrate fire`, and its time is less than 4 hours ago, stop, because one build runs at a time. If its time is older, send a `PushNotification` that names the ticket. Then stop.
3. Pick a ready ticket in the initiative of a takeable index row. It must have `approved:` and a Targets line that names only this repo. If several match, pick the oldest `approved:` date. If none matches, stop.
4. Set its `assignee` to `orchestrate fire <UTC time>` with the Edit tool, because the hook of step 5 does not watch Bash. Commit only that ticket file, and push. If the push fails, stop, because another run can hold the claim. Do not pull and push again.
5. The claim makes a hook tell you to call the Skill tool with `dev:fire`. Call it before your next tool call, as the hook says. Start the first step of `dev:fire` only after the push of step 4. Give it the ticket path in the clone.
6. Record the result by `cook` step 4. Commit only `initiative.md` and the tickets that `cook` step 4 changed or wrote, and push. If the push fails, pull with rebase and push again.
7. Send a `PushNotification` with the `fire` status and the PR links.

## init

A new orchestrator repo needs three files: `.initiatives/README.md` with the empty index table, `.initiatives/sources.md` with the empty table from `productivity:sweep`, and `AGENTS.md`. Copy `AGENTS.md` from [references/agents-md-template.md](references/agents-md-template.md). Add `.claude/rules/claude-code.md` only when a gate is Claude-only. Fill the repos table with the sibling repos this repo plans for.

## close

An initiative closes when the `Closes when` sentence of its Goal is true, or when the user rules the rest out of scope. If the Goal has no `Closes when` sentence, write it with the user first. Then close. The close step turns the directory into one short report and removes the directory.

1. Record each change of this close, for example a ticket ruled out of scope. Commit and push the whole directory. The **restore command** is `git checkout <sha> -- .initiatives/<dir>/`, with the full sha of `HEAD` at the end of this step.
2. Write `.initiatives/reports/<dir>.md`. It copies no ticket body, quotes no asset, and links no file in the directory. It holds:
   - the Goal, and the lines of Decisions so far, with each ticket title as plain text
   - where the work landed, with links to the PRs, documents, or systems
   - each line of Out of scope, with its reason
   - each open ticket, with the initiative it moves to, or the reason it is not done
   - the restore command
3. Set the index row to the closed form of [references/format.md](references/format.md). In each other file under `.initiatives/`, change each link into the directory to a link to the report. Delete the directory with `git rm`. Commit and push.

## Hand-off: build and gate tickets

When the decisions for a change are made, write the build as `task` tickets, and each human step as a `gate` ticket. Connect them with `blocked-by` edges. Write the brief of each build ticket with `productivity:prep` in this session, because this session holds the decisions that the brief must carry.

- A brief holds no human step, so one session runs it from start to end when every ticket in its `blocked-by` is closed. `orchestrate fire` runs a build for a git repo. `cook` runs a build for another system, for example an n8n instance, when the user names it.
- Split the build only at a gate or at a repo, because `orchestrate fire` runs in the one repo of the Targets line. Write the fewest build tickets.
- The human review of a PR is a `gate` ticket.
- If a question needs the human, write it as its own ticket, and add it to the `blocked-by` of the build ticket. If a fact contradicts a closed decision, do the same, and name the decision.
- For each closed decision with a `Check:` line, write a `task` ticket that reads the signal. Add to its `blocked-by` the ticket that the signal waits for, for example the `gate` of the deploy. If the signal shows that the hypothesis is false, the session that reads it writes a new `decision` ticket.
- An agent never claims a `gate` ticket. The human closes it, or tells the agent to close it. The resolution records the facts that later tickets need, for example a secret name or a deploy version.
