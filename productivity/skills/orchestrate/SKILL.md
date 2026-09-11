---
name: orchestrate
description: Run an orchestrator repo, a planning-only repo whose `.wayfinder/` holds one wayfinder map per initiative. Use at the start of every session in such a repo, when the user says "cook" or "close", or when asked to set up a new orchestrator repo.
---

# Orchestrate

An **orchestrator repo** plans; implementation lives in the sibling repos it steers. Call the Skill tool with `personal:work-like-mehrdad`, then with `productivity:wayfinder`. This skill adds only what wayfinder leaves to the repo.

## One directory per initiative

`.wayfinder/<YYYY-MM-DD>-<slug>/` holds one wayfinder map with its tickets and assets. `.wayfinder/README.md` is the index: one row per initiative, newest first, exactly one marked **active**. A session without a named initiative works the active one. A new initiative gets its directory and index row first; wayfinder then charts the map inside it. Wayfinder's tracker for this repo is [references/local-markdown-tracker.md](references/local-markdown-tracker.md).

## cook

Take the first frontier ticket of the active map, claim it, resolve it through wayfinder's work-through mode, record the resolution with its reasoning and a `Revisit if:` line, commit and push. One ticket per session. Done when the ticket is closed and its gist sits under the map's Decisions so far.

## init

A new orchestrator repo gets `.wayfinder/README.md` with the empty index table and a `CLAUDE.md` from [references/claude-md-template.md](references/claude-md-template.md), its repos table filled with the sibling repos this one steers.

## close

An initiative closes when its Destination's "closes when" sentence is true, or the user rules the rest out of scope. Closing turns the directory into one report and removes it, so the repo holds one file per finished initiative instead of a growing tree.

1. Write `.wayfinder/reports/<YYYY-MM-DD>-<slug>.md`: the Destination; one entry per closed ticket with its resolution, reasoning, and `Revisit if:` line, copied from the ticket, not summarised; where the work landed (PRs, documents, systems), with links; what was ruled out of scope and why; tickets left open, each with the initiative it moves to or the reason it stays undone. Assets the report needs are quoted into it; the rest stay in git history.
2. Set the index row to `closed <date>` linking the report, and `git rm` the initiative directory. History keeps every ticket.
3. Commit and push.

## Hand-off: the brief

A task ticket whose answer is "build this in repo X" ends its resolution with a **brief**: the whole input an implementer reads from the ticket file, with no transcript. Repo and branch, files, order, tests, FR and NFR, ponytail limits. The PR names the ticket. Format in the tracker reference.
