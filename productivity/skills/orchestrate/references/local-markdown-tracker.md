# Local-markdown tracker

This is the file format of an orchestrator repo. It uses plain files under `.wayfinder/`, not an issue tracker.

## Layout

```
.wayfinder/
  README.md                  index of initiatives
  reports/<YYYY-MM-DD>-<slug>.md   one closed initiative, its directory removed
  <YYYY-MM-DD>-<slug>/       one open initiative
    map.md                   the map, see map.md
    tickets/<id>.md          one file per ticket
    assets/                  research, specs, digests, linked from tickets
```

## Index

```
| Map | Status | Destination |
|---|---|---|
| [<dir>](<dir>/map.md) | **active**; <one-line state> | <Destination in one line> |
```

The rows are in priority order. The first row is the most important initiative. The Status column holds one value:
- **active**, for exactly one row
- `open`, takeable but not active
- `waiting <who> since <date>`, blocked by an external dependency, for example a support case or a PR review by another person
- `paused <date> (<resume pointer>)`, stopped by the owner's own choice
- `closed <date>`, finished, with a report

A `waiting` or `paused` row is not takeable. The text after the status is the one-line state of the initiative.

When the status is `closed <date>`, the Map column links to the report.

## Ticket

A ticket is `tickets/<id>.md`. The tracker fields live in its frontmatter. The body holds the question, and later the resolution.

| Concept | In the file |
|---|---|
| destination | the Destination section of `map.md`, whose last sentence starts with "Closes when" |
| ticket id, title | `id: <prefix>-<nn>`, `title:` |
| ticket type | `type: research`, `prototype`, `grilling`, or `task` |
| open / closed | `status: open` / `status: closed` |
| claimed by | `assignee:`, empty if unclaimed |
| blocked by | `blocked-by: [<id>, ...]` |
| frontier | `status: open`, empty `assignee`, every `blocked-by` id closed |
| resolution comment | a `## Resolution` section appended on close, plus one gist line under the map's Decisions so far |
| linked assets | files under `assets/`, linked from the ticket |
| hand-off | a `## Brief` section, placed after the resolution section |

When a change happens to a map, ticket, or asset, commit and push it. Concurrent sessions read the tracker from git.

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
