---
name: sup
description: One-screen report on every initiative in an orchestrator repo, from the index and git, with a proposal for the next initiative. Read-only.
argument-hint: "[initiative]"
disable-model-invocation: true
---

# Sup

Call the Skill tool with `productivity:sweep` first.

Sup works in an orchestrator repo, on the local-markdown tracker of `productivity:orchestrate`. The index, initiative, goal, ticket, and ready ticket are the terms of orchestrate. Each index row is `| Initiative | Status | Goal |`, and the Status cell holds the status, then the one-line state. A ready ticket has `status: open`, an empty `assignee`, and every `blocked-by` id closed. Sup never writes a file and never commits, because orchestrate owns every write to the index.

If the user gives an initiative, report only that row in the same shape. Then skip Propose.

## Read

1. Read the index at `.orchestrate/README.md`.
2. If the index is missing, stop. Tell the user to run orchestrate, because its gate builds the index. Do not build the index here.
3. For each row that is not `closed`, read the ticket frontmatter of its initiative. Count the ready tickets.
4. Read no ticket body and no `initiative.md` body. The one exception is the Goal of the initiative. Check it for a `Closes when` sentence.
5. For each directory, get the date of the last commit with `git log -1 --format=%ad --date=short -- <dir>`.
6. Run sweep in report mode, for each row that is not `closed`. The files show only what the last session wrote. The live links show the state now.

The step is done when each row has its number of ready tickets and its date, and sweep has returned its result table.

## Report

Write one line per row, in index order. A table is also correct. Each line holds these fields, in this order:

- the status
- the one-line state
- the number of ready tickets
- the days since the last commit
- for a `waiting` row, who it waits on and since when
- the number of claims from sweep

Mark each initiative that has no `Closes when` sentence. Put no prose between the rows. After the rows, give the number of open tickets across all initiatives. If directories have no row, give their number and say that orchestrate repairs the index. Then print the sweep result table.

## Propose

1. Propose the first row in index order that is `open` and has a ready ticket. Give the reason in one sentence.
2. If a row is not `paused` and one of these holds, propose that the user names its initiative in orchestrate:
   - The row is `waiting`, and the sweep table shows that its dependency is resolved.
   - The initiative has claims.
3. List as stale each row with no commit for 14 days or more. State the number of days.
4. Stop. To work an initiative, the user names it in orchestrate. To reorder the initiatives, the user says "prioritize" there. Sup changes nothing.
