# Format

This file holds the file shapes of an orchestrator repo. It uses plain files under `.wayfinder/`, not an issue tracker. The rules are in the orchestrate `SKILL.md`.

## Layout

```
.wayfinder/
  README.md                  index of initiatives
  sources.md                 the hosts that the tracker links to, owned by productivity:sweep
  reports/<YYYY-MM-DD>-<slug>.md   one closed initiative, its directory removed
  <YYYY-MM-DD>-<slug>/       one open initiative
    map.md                   the map
    tickets/<id>.md          one file per ticket
    assets/                  research, specs, digests, linked from tickets
```

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
---

<the question>

## Resolution

<appended on close: for a decision ticket, one record of `productivity:settle-decisions` for each decision. For another ticket, what was done and the facts that later tickets need>
```

A ticket is on the frontier when `status: open`, `assignee` is empty, and every `blocked-by` id is closed. Assets are files under `assets/`, linked from the ticket.

## Brief

A build `task` ticket holds a `## Brief` section as its body. `productivity:prep` writes it. The format is in [../../prep/references/brief.md](../../prep/references/brief.md).

When the human says yes to the brief, the ticket gets `approved: <YYYY-MM-DD>` in its frontmatter. `orchestrate fire` builds only an approved ticket.

## Gate

A `gate` ticket has `owner:` in its frontmatter, with the human who owns it. Its `assignee:` stays empty.

```
## Step

- [ ] <one action, with the system and the exact names>
- Closes when: <the fact that shows the step is done>
```
