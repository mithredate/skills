---
name: orchestrate
description: Runs an orchestrator repo, a planning-only repo whose `.wayfinder/` directory holds one map of decision tickets for each initiative and one index that orders them. Use when a session starts in this repo, when the user wants to plan work too big for one agent session, or when the user says "chart", "cook", "close", or "prioritize". Use also when the user asks to set up a new orchestrator repo.
---

# Orchestrate

An **orchestrator repo** plans the work. The sibling repos it plans for hold the implementation. Call the Skill tool with `personal:work-like-mehrdad` and `productivity:sweep` first.

An initiative starts as a loose idea, too big for one agent session. The **destination** is what the initiative must produce: a spec, a decision, or a change. Orchestrate plans the way to the destination as a **map** of tickets. Most tickets are **decision tickets**. A decision ticket is a question whose answer is a decision, not a slice of the build. When nothing is left to decide, the map hands off the build as build tickets and gate tickets. If you feel the pull to do the work in this session, write a build ticket.

The file format of the index, the map, and the tickets is in [references/local-markdown-tracker.md](references/local-markdown-tracker.md). The map body, the ticket types, the unspecified questions, and the out-of-scope rules are in [references/map.md](references/map.md). Read both before you chart a map or work a ticket.

## The index

**The index** is the file `.wayfinder/README.md`, with one row for each initiative. The tracker reference gives its table shape.

- Every session reads the index before any other step. This rule applies also when the user names a map.
- If the index is missing, build it. If a map directory has no row, or a row has no directory, repair the index. Do this before any other work. Do not work a ticket while the index is not true.
- Then run sweep in write mode. Give it the map of this session and each `waiting` row. Sweep also adds each new host to `.wayfinder/sources.md`, or builds the file if it is missing. The tracker is true only when its live links are checked.
- The row order is the priority. The first row is the most important initiative.
- When the user says "prioritize", reorder the rows with the user. Then commit and push.
- Exactly one row is `active`. The status column holds one of `active`, `open`, `waiting <who> since <date> (<link>)`, `paused <date> (<resume pointer>)`, or `closed <date>`.
- When the user names a map, that row becomes `active` and the old `active` row becomes `open`. Commit the index with the ticket.
- `waiting` records an external dependency, for example a support case or a PR review by another person. `paused` records the owner's own choice to stop.
- A row that is `waiting` or `paused` is not takeable.
- Each row ends with a one-line state of the initiative.

## One directory per initiative

`.wayfinder/<YYYY-MM-DD>-<slug>/` holds one map with its tickets and assets. For a new initiative, first create its directory and its index row. Then chart the map inside the directory.

Refer to a map or a ticket by its title in everything the user reads. Put the path inside the title's link. A list of bare ids is not readable.

## chart

The user gives a loose idea. Charting is one session's work. It resolves no ticket.

1. Name the destination. Call the Skill tool with `productivity:grilling` and with `productivity:domain-modeling`. The destination fixes the scope, so settle it first. It ends with one sentence that starts with `Closes when`. The step is done when the user agrees to the destination.
2. Map the frontier. Grill again, breadth-first. Find the open decisions and the first steps that a session can take now. If no unspecified question shows, the work fits one session and needs no map. Stop and ask the user how to continue.
3. Write `map.md` with the Destination and the Notes. Leave Decisions so far empty. List the unspecified questions under Not yet specified.
4. Write a ticket for each question that you can state precisely now. Then add the `blocked-by` edges in a second pass.
5. For each research ticket, start a subagent that calls the Skill tool with `productivity:research`. Each subagent resolves its ticket in parallel.
6. Sweep the session as in `cook` step 6.
7. Commit and push.

## cook

A session that names no map works the `active` row. Work one ticket in each session. Research tickets are the exception.

1. Read `map.md`. Do not read every ticket body. Read a related or closed ticket only when the work needs it.
2. Take the first frontier ticket that is not a `gate`, or the ticket that the user names. Claim it before any other work. If every frontier ticket is a `gate`, give the user the first gate's checklist, and go to step 7.
3. When you claim the ticket, a hook names the skills in its `skills:` field. Call the Skill tool with each of them before your next tool call. A skill that you know only by its name is not loaded. Then resolve the ticket. The step is done when the Skill tool has returned each skill and the ticket has a resolution.
4. Record the resolution with its reasoning and a `Revisit if:` line. Close the ticket. A build ticket closes only when `dev:fire` returns `pass`, and its resolution links the PRs. If `fire` returns another status, record the status and the blocker, and clear `assignee`. Write a ticket for the blocker, and add it to the `blocked-by` of the build ticket. Then go to step 5. Add one gist line under the map's Decisions so far.
5. Write a ticket for each new question. If an unspecified question is now precise, move it from Not yet specified into a ticket. If a ticket is past the destination, rule it out of scope. If the decision makes another ticket wrong, change or delete that ticket.
6. Sweep the session. Run sweep in write mode, for the session items. The step is done when every item has a place.
7. Update the row's one-line state in the index. If the resolution now depends on a person outside the repo, set the status to `waiting <who> since <date> (<link>)`.
8. Commit and push the ticket, the map, and the index. The task is done when the ticket is closed, its gist is under Decisions so far, and the sweep table is in your final message.

The user can run other sessions on other frontier tickets at the same time. Expect concurrent commits.

## init

A new orchestrator repo needs four files: `.wayfinder/README.md` with the empty index table, `.wayfinder/sources.md` with the empty table from `productivity:sweep`, `AGENTS.md`, and `CLAUDE.md`, the bridge to `AGENTS.md`. Copy `AGENTS.md` and `CLAUDE.md` from [references/agents-md-template.md](references/agents-md-template.md). Fill the repos table with the sibling repos this repo plans for.

## close

An initiative closes when the `Closes when` sentence of its Destination is true, or when the user rules the rest out of scope. If the Destination has no `Closes when` sentence, write it with the user first. Then close. The close step turns the directory into one report and removes the directory. The repo then holds one file for each finished initiative, not a growing tree.

1. Write `.wayfinder/reports/<YYYY-MM-DD>-<slug>.md`. It holds:
   - the Destination
   - one entry for each closed ticket, copied from the ticket, with its resolution, reasoning, and `Revisit if:` line
   - where the work landed, with links to the PRs, documents, or systems
   - what was ruled out of scope, and why
   - each open ticket, with the initiative it moves to, or the reason it is not done. Quote into the report any asset it needs. Keep the rest in git history.
2. Set the index row to `closed <date>`, and link it to the report. Delete the initiative directory with `git rm`. Git history keeps every ticket.
3. Commit and push.

## Hand-off: build and gate tickets

When the decisions for a change are made, write the build as `task` tickets and each human step as a `gate` ticket. Connect them with `blocked-by` edges.

- A **gate** ticket is one human step: a setup that the agent cannot do, a review, a deploy, or a check that only a human can make.
- A build `task` ticket holds one **brief**. The brief is the whole input of one session, with no transcript. `dev:fire` takes the brief, and plans, implements, and verifies it.
- A brief holds no human step. A session runs it from start to end when every ticket in its `blocked-by` is closed.
- Split the build only at a gate. Write the fewest build tickets. A brief can span more than one repo.
- The brief gives context, not steps. The session picks the agents, the order of work, the branches, and the PRs.
- Before you write a brief, collect each fact that the session needs to build and verify the change. Examples are test data, reviewer names, and access.
- If a question needs a human, write it as its own ticket, and add it to the `blocked-by` of the build ticket. If a fact contradicts a closed decision, do the same, and name the decision.

Read the tracker reference for the brief fields and the gate format.

---
_Originally seeded from [mattpocock/skills/skills/engineering/wayfinder](https://github.com/mattpocock/skills/tree/6654f6b60cd9d5be8b54c6fafe44346dabeb3b76/skills/engineering/wayfinder) — MIT © 2026 Matt Pocock._
