---
name: orchestrate
description: Use in a repo with `.wayfinder/`, to set one up, for work too big for one session, or on "chart", "cook", "close", or "prioritize".
---

# Orchestrate

First actions: call the Skill tool with `personal:work-like-mehrdad`, `productivity:sweep`, `productivity:settle-decisions`, `productivity:domain-modeling`, and `productivity:prep`.

An **orchestrator repo** plans the work. The sibling repos and systems it plans for hold the implementation.

An initiative starts as a loose idea, too big for one agent session. The **destination** is what the initiative must produce: a spec, a decision, or a change. Orchestrate plans the way to the destination as a **map** of tickets. Most tickets are **decision tickets**. A decision ticket is a question whose answer is a decision, not a slice of the build. When nothing is left to decide, the map hands off the build as build tickets and gate tickets. If you feel the pull to do the work in this session, write a build ticket.

The file shapes of the index, the map, the tickets, and the gate are in [references/format.md](references/format.md). Read it before you chart a map or work a ticket.

## The index

**The index** is the file `.wayfinder/README.md`, with one row for each initiative.

- Every session reads the index before any other step. This rule applies also when the user names a map.
- If the index is missing, build it. If a map directory has no row, or a row has no directory, repair the index. Do this before any other work. Do not work a ticket while the index is not true.
- Then run sweep in write mode. Give it the map of this session and each `waiting` row. Sweep also adds each new host to `.wayfinder/sources.md`, or builds the file if it is missing. The tracker is true only when its live links are checked.
- The row order is the priority. The first row is the most important initiative.
- When the user says "prioritize", reorder the rows with the user. Then commit and push.
- Exactly one row is `active`. When the user names a map, that row becomes `active` and the old `active` row becomes `open`. Commit the index with the ticket.
- `waiting` records an external dependency, for example a support case or a PR review by another person. `paused` records the owner's own choice to stop. A row that is `waiting` or `paused` is not takeable.

## One directory per initiative

`.wayfinder/<YYYY-MM-DD>-<slug>/` holds one map with its tickets and assets. For a new initiative, first create its directory and its index row. Then chart the map inside the directory.

When a change happens to a map, ticket, or asset, commit and push it. Concurrent sessions read the tracker from git.

Refer to a map or a ticket by its title in everything the user reads. Put the path inside the title's link. A list of bare ids is not readable.

## The map

The map is an index of decisions, not a store. A decision lives in one place, its ticket. The map gives only its gist and a link. Open tickets are not in the map. A session finds them from the ticket frontmatter.

An **unspecified question** is an in-scope question that you cannot state precisely yet, because it waits on open tickets. The map's Not yet specified section holds them.

- If you can state the question precisely now, write a ticket, also when the ticket is blocked.
- If you cannot state it precisely yet, keep it under Not yet specified. Do not cut it into ticket-sized pieces. One unspecified question can become several tickets, or none.
- Not yet specified holds no decided question, no live ticket, and no out-of-scope work.

The destination fixes the scope. When a ticket turns out to be past the destination, close it and add one line under Out of scope with its reason and a link. It does not go under Decisions so far. Out-of-scope work comes back only as a new initiative.

## Ticket types

A **HITL** ticket waits for the human. A `gate` ticket is HITL. A `decision` or `prototype` ticket is HITL when `productivity:settle-decisions` gives its decision to the human. The agent never takes the human's side of a HITL ticket.

- **decision**: a decision ticket. The default type.
- **prototype**: make a cheap, rough artifact with `productivity:prototype`. Link the artifact as an asset. Use it when "how must it look" or "how must it behave" is the key question. The artifact is evidence for the decision.
- **research** (agent alone): find a fact outside the working directory that a decision waits on. A subagent calls the Skill tool with `productivity:research`.
- **task** (agent alone): work that the agent does alone. A task before a decision makes a fact visible, for example data moved so that its shape shows. A build task holds a `## Brief`. The resolution records what was done and the facts that later tickets need.
- **gate** (HITL): one human step, for example a setup that the agent cannot do, a review, a deploy, or a check that only a human can make. The agent never claims it.

## chart

The user gives a loose idea. Charting is one session's work. It resolves no ticket.

1. Name the destination with the user. The destination fixes the scope, so settle it first. It ends with one sentence that starts with `Closes when`. The step is done when the user agrees to the destination.
2. Map the open decisions breadth-first, and the first steps that a session can take now. If no unspecified question shows, the work fits one session and needs no map. Write the user a prompt that starts that session. Then stop.
3. Write `map.md` with the Destination and the Notes. Leave Decisions so far empty. List the unspecified questions under Not yet specified.
4. Write a ticket for each question that you can state precisely now. Then add the `blocked-by` edges in a second pass.
5. For each research ticket, start a subagent that calls the Skill tool with `productivity:research`. Each subagent resolves its ticket in parallel.
6. Sweep the session as in `cook` step 6.
7. Commit and push.

## cook

A session that names no map works the `active` row. One session takes every frontier ticket of the map that has no brief, so the human answers one round, not one session for each ticket. A ticket with a `## Brief` takes a session of its own.

1. Read `map.md`. Do not read every ticket body. Read a related or closed ticket only when the work needs it.
2. Claim every frontier ticket that is not a `gate` and has no brief, or the tickets that the user names. Claim them before any other work. If no such ticket is on the frontier, claim the first ticket with a brief. If every frontier ticket is a `gate`, give the user the first gate's checklist, and go to step 7.
3. Resolve the tickets. Start a subagent for each `research` ticket. Sort each decision with `productivity:settle-decisions`. Make your own decisions first, then put the human's decisions in one round. When you claim a ticket with a `## Brief`, a hook tells you to call the Skill tool with `dev:fire`. Do it before your next tool call.
4. If `fire` returns a status other than `pass`, do not close the ticket and add no gist. Record the status and the blocker in the ticket, and clear `assignee`. Write a ticket for the blocker, and add it to the `blocked-by` of the build ticket. In all other cases, write the record of `productivity:settle-decisions` as the resolution of a decision ticket. Close the ticket. Add one gist line under the map's Decisions so far. The resolution of a build ticket links the PRs or the Verification evidence.
   - When a decision ticket closes, write its decision into the brief of each build ticket that has it in `blocked-by`. Follow the rules of `productivity:prep`.
   - A build with no review gate gets one when `fire` reports no merge. Add the gate to the `blocked-by` of each open ticket that has the build ticket in its `blocked-by`.
5. Write a ticket for each new question. If an unspecified question is now precise, move it from Not yet specified into a ticket. If a ticket is past the destination, rule it out of scope. If the decision makes another ticket wrong, change or delete that ticket. If the frontier now holds a ticket without a brief that is not a `gate`, go back to step 2. A session that claimed a ticket with a brief does not go back.
6. Sweep the session. Run sweep in write mode, for the session items. The step is done when every item has a place.
7. Update the row's one-line state in the index. If the resolution now depends on a person outside the repo, set the status to `waiting`.
8. Commit and push the tickets, the map, and the index. The task is done when each claimed ticket is closed or blocked as in step 4, and the sweep table is in your final message.

The user can run other sessions on other frontier tickets at the same time. Expect concurrent commits.

## init

A new orchestrator repo needs three files: `.wayfinder/README.md` with the empty index table, `.wayfinder/sources.md` with the empty table from `productivity:sweep`, and `AGENTS.md`. Copy `AGENTS.md` from [references/agents-md-template.md](references/agents-md-template.md). Add `.claude/rules/claude-code.md` only when a gate is Claude-only. Fill the repos table with the sibling repos this repo plans for.

## close

An initiative closes when the `Closes when` sentence of its Destination is true, or when the user rules the rest out of scope. If the Destination has no `Closes when` sentence, write it with the user first. Then close. The close step turns the directory into one report and removes the directory. The repo then holds one file for each finished initiative, not a growing tree.

1. Write `.wayfinder/reports/<YYYY-MM-DD>-<slug>.md`. It holds:
   - the Destination
   - one entry for each closed ticket, copied from the ticket, with its resolution
   - where the work landed, with links to the PRs, documents, or systems
   - what was ruled out of scope, and why
   - each open ticket, with the initiative it moves to, or the reason it is not done. Quote into the report any asset it needs. Keep the rest in git history.
2. Set the index row to `closed <date>`, and link it to the report. Delete the initiative directory with `git rm`. Git history keeps every ticket.
3. Commit and push.

## Hand-off: build and gate tickets

When the decisions for a change are made, write the build as `task` tickets, and each human step as a `gate` ticket. Connect them with `blocked-by` edges. Write the brief of each build ticket with `productivity:prep` in this session, because this session holds the decisions that the brief must carry.

- A brief holds no human step, so a session runs it from start to end when every ticket in its `blocked-by` is closed. Its targets can be git repos or other systems, for example an n8n instance.
- Split the build only at a gate. Write the fewest build tickets.
- The human review of a PR is a `gate` ticket. A build can have one target, a git repo whose AGENTS.md or CLAUDE.md has the line `**fire can auto-merge.**`. Such a build gets no review gate at the hand-off. `cook` writes the gate when `fire` reports no merge.
- If a question needs the human, write it as its own ticket, and add it to the `blocked-by` of the build ticket. If a fact contradicts a closed decision, do the same, and name the decision.
- For each closed decision with a `Check:` line, write a `task` ticket that reads the signal. Add to its `blocked-by` the ticket that the signal waits for, for example the `gate` of the deploy. If the signal shows that the hypothesis is false, the session that reads it writes a new `decision` ticket.
- An agent never claims a `gate` ticket. The human closes it, or tells the agent to close it. The resolution records the facts that later tickets need, for example a secret name or a deploy version.

---
_Originally seeded from [mattpocock/skills/skills/engineering/wayfinder](https://github.com/mattpocock/skills/tree/6654f6b60cd9d5be8b54c6fafe44346dabeb3b76/skills/engineering/wayfinder) — MIT © 2026 Matt Pocock._
