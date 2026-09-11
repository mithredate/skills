---
name: orchestrate
description: Runs an orchestrator repo, a planning-only repo whose `.wayfinder/` directory holds one wayfinder map for each initiative. Use when a session starts in this repo, or when the user says "cook", "close", or asks to set up a new one.
---

# Orchestrate

An **orchestrator repo** plans the work. The sibling repos it plans for hold the implementation. Call the Skill tool with `personal:work-like-mehrdad`. Then call it with `productivity:wayfinder`. This skill adds only what wayfinder leaves to the repo.

## One directory per initiative

`.wayfinder/<YYYY-MM-DD>-<slug>/` holds one wayfinder map with its tickets and assets. `.wayfinder/README.md` is the index. It has one row for each initiative, newest first, with exactly one row marked **active**. A session without a named initiative works on the active one. For a new initiative, first create its directory and index row. Wayfinder then charts the map inside the directory. Wayfinder's tracker for this repo is [references/local-markdown-tracker.md](references/local-markdown-tracker.md).

## cook

Take the first frontier ticket of the active map. Claim it. Resolve it through wayfinder's work-through mode. Record the resolution with its reasoning and a `Revisit if:` line. Commit and push. Work one ticket in each session. When the ticket is closed and its gist sits under the map's Decisions so far, the task is done.

## init

A new orchestrator repo needs three files: `.wayfinder/README.md` with the empty index table, `AGENTS.md`, and `CLAUDE.md`, the bridge to `AGENTS.md`. Copy `AGENTS.md` and `CLAUDE.md` from [references/agents-md-template.md](references/agents-md-template.md). Fill the repos table with the sibling repos this repo plans for.

## close

An initiative closes when its Destination's "closes when" sentence is true, or when the user rules the rest out of scope. The close step turns the directory into one report and removes the directory. The repo then holds one file for each finished initiative, not a growing tree.

1. Write `.wayfinder/reports/<YYYY-MM-DD>-<slug>.md`. It holds:
   - the Destination
   - one entry for each closed ticket, copied from the ticket, with its resolution, reasoning, and `Revisit if:` line
   - where the work landed, with links to the PRs, documents, or systems
   - what was ruled out of scope, and why
   - each open ticket, with the initiative it moves to, or the reason it is not done. Quote into the report any asset it needs. Keep the rest in git history.
2. Set the index row to `closed <date>`, and link it to the report. Delete the initiative directory with `git rm`. Git history keeps every ticket.
3. Commit and push.

## Hand-off: the brief

A task ticket whose answer is "build this in repo X" ends its resolution with a **brief**. The brief is the whole input an implementer reads from the ticket file, with no transcript. It holds repo and branch, files, order, tests, FR and NFR, and ponytail limits. The PR names the ticket. Read the tracker reference for the exact format.
