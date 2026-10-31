# Format

This file holds the file shapes of an orchestrator repo. It uses plain files under `.wayfinder/`, not an issue tracker. The rules are in the orchestrate `SKILL.md`.

## Layout

```
.wayfinder/
  README.md                  index of initiatives
  sources.md                 the hosts that the tracker links to, owned by productivity:sweep
  reports/<YYYY-MM-DD>-<slug>.md   one closed initiative, its directory removed
  briefs/<YYYY-MM-DD-HHMM>-<slug>.md   one queued brief
  <YYYY-MM-DD>-<slug>/       one open initiative
    map.md                   the map
    tickets/<id>.md          one file per ticket
    assets/                  research, specs, digests, linked from tickets
```

Only a `<YYYY-MM-DD>-<slug>/` directory is a **map directory**. `briefs/` and `reports/` are not map directories.

## Index

```
| Map | Status | Destination |
|---|---|---|
| [<dir>](<dir>/map.md) | **active**; <one-line state> | <Destination in one line> |
```

The rows are in priority order. The Status column holds one value:
- **active**, for exactly one row
- `open`, takeable but not active
- `waiting <who> since <date> (<link>)`. The link points to the PR, issue, or thread, so that `productivity:sweep` can check it.
- `paused <date> (<resume pointer>)`
- `closed <date>`. The Map column then links to the report.

The text after the status is the one-line state of the initiative.

## Map

```markdown
## Destination

<what the end of this map looks like: the spec, decision, or change. One or two lines. The last sentence starts with "Closes when".>

## Notes

<the domain and the standing preferences for this initiative>

## Decisions so far

- [<closed ticket title>](tickets/<id>.md): <one-line gist of the answer>

## Not yet specified

<the unspecified questions>

## Out of scope

<work ruled past the destination, each line with its reason and a link to the closed ticket>
```

## Ticket

```markdown
---
id: <prefix>-<nn>
title: <title>
type: decision | prototype | research | task | gate
status: open | closed
assignee: <empty if unclaimed>
blocked-by: [<id>, ...]
brief: <path of its brief relative to `.wayfinder/`, for a build task>
---

<the question>

## Resolution

<appended on close: for a decision ticket, one record of `productivity:settle-decisions` for each decision. For another ticket, what was done and the facts that later tickets need>
```

A ticket is on the frontier when `status: open`, `assignee` and `brief` are empty, and every `blocked-by` id is closed. A ticket with a brief waits until its brief is `done`. Assets are files under `assets/`, linked from the ticket.

## Brief

`productivity:prep` queues each brief as one file in `briefs/`. The name starts with the UTC time of the first write, so the oldest brief sorts first. The body is the `## Brief` section in the format of [../../prep/references/brief.md](../../prep/references/brief.md).

```markdown
---
title: <title>
status: draft | ready | in-progress | done | stuck
updated: <UTC time of the last status change, YYYY-MM-DDTHH:MMZ>
ticket: <path of the build ticket relative to `.wayfinder/`, or empty>
blocked-by: [<ticket or brief path relative to `.wayfinder/`>, ...] only when `ticket` is empty
result: "<for done or stuck>"
---
```

`result` is one line in double quotes, at most 300 characters. Replace each newline in it with a space, and each `"` with `'`.

A brief in `blocked-by` is closed when its file does not exist, because a `done` brief is deleted.

- `draft`: the user did not say yes to the current text in the session that wrote it.
- `ready`: the user said yes to the current text after the last `draft` write, and no session took the brief after that yes.
- `in-progress`: an `orchestrate fire` session took the brief at `updated`. The brief is **overdue** when `updated` is 4 hours ago or more, because a session that stops on a permission prompt cannot write its status.
- `done`: the build passed. `result` holds each PR link with `merged` or `not merged`.
- `stuck`: the build stopped. `result` holds the `dev:fire` status or the reason, and the blocker.

## Gate

A `gate` ticket has `owner:` in its frontmatter, with the human who owns it. Its `assignee:` stays empty.

```
## Step

- [ ] <one action, with the system and the exact names>
- Closes when: <the fact that shows the step is done>
```
