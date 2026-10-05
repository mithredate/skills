---
name: sweep
description: Checks the live state of PRs, issues, and Slack threads linked from the `.wayfinder/` tracker of an orchestrator repo, and gives each fact from a session its place in the tracker. Use when orchestrate starts work on a map or ends a session, when sup builds its report, or when the user says "sweep", "check the PRs", or "what changed".
---

# Sweep

The tracker of an orchestrator repo is a record. It shows the world at the time a session last wrote it. A link to a PR, an issue, or a thread shows the world now. Sweep makes the record match the world. The file format of the tracker belongs to `productivity:orchestrate`.

The caller names a mode:

- **write** mode: the caller edits the index, the map, and the tickets, then commits. Orchestrate uses this mode.
- **report** mode: the caller prints the result table and writes nothing. Sup uses this mode.

## Live links

A **live link** is a link whose target can change: a GitHub PR or issue, a Linear issue, or a Slack thread. A link to a docs page is not a live link.

1. For each map that the caller names, collect these files:
   - the row of the map in `.wayfinder/README.md`
   - each ticket with `status: open`
   - each closed ticket with a `## Brief` section
2. Get the live links from these files.
   ```bash
   grep -oHE 'https://(github\.com/[^ )]+/(pull|issues)/[0-9]+|linear\.app/[^ )]+/issue/[A-Z]+-[0-9]+|[a-z0-9-]+\.slack\.com/archives/[^ )]+)' <files> | sort -u
   ```
3. If a ticket has a `## Brief` and no PR link, search for the PR with `gh search prs "<ticket path>"`. The brief requires that the PR names the ticket path.
4. If a `waiting` row has no link, mark the row "check by hand".

The step is done when each live link is listed with the file that holds it.

## Check

Check all live links in parallel, with one call for each link.

| Link | Tool | The change to look for |
|---|---|---|
| GitHub PR | `gh pr view <url> --json state,reviewDecision,mergedAt,statusCheckRollup` | merged, closed, approved, changes requested, CI failed |
| GitHub issue | `gh issue view <url> --json state,closedAt,comments` | closed, comments after the date in the record |
| Linear issue | the Linear MCP tool `get_issue` | status, assignee, comments after the date in the record |
| Slack thread | the Slack MCP tool `slack_read_thread` | replies after the date in the record |

If the tool is not available or the call fails, mark the link "not checked" and give the error. Do not guess the state.

The step is done when each live link has a state or a "not checked" mark.

## Session items

Use this section only at the end of an orchestrate session. List each answer from the user, each fact that you found, and each new term. For each item, name its place: a ticket resolution, a new ticket, Not yet specified, Out of scope, the map's Notes, `CONTEXT.md`, or an ADR.

## Result

Write one table. It has one row for each live link whose state is different from the record, and one row for each session item.

| Item | The record says | Now | Place |
|---|---|---|---|
| [Subscription spec PR](https://github.com/org/repo/pull/12) | waiting Amin since 2026-10-03 | approved 2026-10-04 | index row, status `open` |

A live link whose state matches the record gets no row. After the table, give the number of links checked. Then list each link marked "not checked" or "check by hand".

- In write mode, write each row to its place. The step is done when each row is written.
- In report mode, print the table and write nothing.
