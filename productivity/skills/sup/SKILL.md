---
name: sup
description: One-screen report on every initiative in an orchestrator repo, from the index and git, with a proposal for the next map. Read-only.
argument-hint: "[initiative]"
disable-model-invocation: true
---

# Sup

Sup works in an orchestrator repo, on the local-markdown tracker of `productivity:orchestrate`. The index, map, destination, frontier, and ticket are the terms of orchestrate. Each index row is `| Map | Status | Destination |`, and the Status cell holds the status, then the one-line state. A frontier ticket has `status: open`, an empty `assignee`, and every `blocked-by` id closed. Sup never writes a file and never commits, because orchestrate owns every write to the index.

If the user gives an initiative, report only that row in the same shape. Then skip Propose.

## Read

1. Read the index at `.wayfinder/README.md`.
2. If the index is missing, stop. Tell the user to run orchestrate, because its gate builds the index. Do not build the index here.
3. For each row that is not `closed`, read the ticket frontmatter of its map. Count the frontier tickets.
4. Read no ticket body and no map body. The one exception is the Destination of the map. Check it for a `Closes when` sentence.
5. For each directory, get the date of the last commit with `git log -1 --format=%ad --date=short -- <dir>`.
6. Call the Skill tool with `productivity:sweep` in report mode, for each row that is not `closed`. The files show only what the last session wrote. The live links show the state now.

The step is done when each row has its frontier count and its date, and sweep has returned its result table.

## Report

Write one line per row, in index order. A table is also correct. Each line holds these fields, in this order:

- the status
- the one-line state
- the frontier count
- the days since the last commit
- for a `waiting` row, who it waits on and since when

Mark each map that has no `Closes when` sentence. Put no prose between the rows. After the rows, give the number of open tickets across all maps. If directories have no row, give their number and say that orchestrate repairs the index. Then print the sweep result table.

## Propose

1. Propose the first row in index order that is `active` or `open` and has a frontier ticket. Give the reason in one sentence.
2. If the sweep table shows that the dependency of a `waiting` row is resolved, propose that the user names that map in orchestrate.
3. List as stale each row with no commit for 14 days or more. State the number of days.
4. Stop. To work a map, the user names it in orchestrate. To reorder the maps, the user says "prioritize" there. Sup changes nothing.
