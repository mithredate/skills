# Local-markdown tracker

Wayfinder's tracker for an orchestrator repo: plain files under `.wayfinder/`, no issue tracker. These are its "Wayfinding operations".

## Layout

```
.wayfinder/
  README.md                  index of initiatives
  <YYYY-MM-DD>-<slug>/       one initiative
    map.md                   the map, wayfinder's body
    tickets/<id>.md          one file per ticket
    assets/                  research, specs, digests, linked from tickets
```

## Index

```
| Map | Status | Destination |
|---|---|---|
| [<dir>](<dir>/map.md) | **active**; <one-line state> | <Destination in one line> |
```

Status: **active** (exactly one row), `open`, `paused <date> (<resume pointer>)`, `closed <date>`.

## Ticket

A ticket is `tickets/<id>.md`. Wayfinder's tracker fields live in its frontmatter; the body is wayfinder's.

| Wayfinder concept | In the file |
|---|---|
| ticket id, title | `id: <prefix>-<nn>`, `title:` |
| open / closed | `status: open` / `status: closed` |
| claimed by | `assignee:` (empty means unclaimed) |
| blocked by | `blocked-by: [<id>, ...]` |
| frontier | `status: open`, empty `assignee`, every `blocked-by` id closed |
| resolution comment | a `## Resolution` section appended on close, plus one gist line under the map's Decisions so far |
| linked assets | files under `assets/`, linked from the ticket |
| hand-off | a `## Brief` section after the resolution (below) |

Commit and push every change to a map, ticket, or asset when it happens; concurrent sessions read the tracker from git.

## Brief

```
## Brief

- Repo and branch: `<repo>`, `feat/<slug>` off `main`
- Files: <paths to touch; anything outside needs a question first>
- Order: 1. <step> 2. <step>
- Tests: <what proves it; for a bugfix, the failing test first>
- FR: <what it must do>
- NFR: <limits: performance, security, dependency pins, ...>
- Ponytail: <what stays unbuilt>
- PR: names this ticket by title and path
```
