# Local-markdown tracker

This is the file format of an orchestrator repo. It uses plain files under `.wayfinder/`, not an issue tracker.

## Layout

```
.wayfinder/
  README.md                  index of initiatives
  sources.md                 the hosts that the tracker links to, owned by productivity:sweep
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
- `waiting <who> since <date> (<link>)`, blocked by an external dependency, for example a support case or a PR review by another person. The link points to the PR, issue, or thread, so that `productivity:sweep` can check it.
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
| hand-off | one `## Brief: <phase>` section for each phase, in phase order, placed after the resolution section |
| skills to load | `skills: [<plugin>:<skill>, ...]`, set when the ticket is written, from its type and the map's Notes |

The `skills:` field is required. When an agent claims the ticket, the `productivity` plugin hook names these skills to the agent. A skill list in prose is skipped about half the time, and the hook is not.

When a change happens to a map, ticket, or asset, commit and push it. Concurrent sessions read the tracker from git.

## Brief

```
## Brief: <phase>

- Goal: <what is true when the session hands back>
- Ready when: <the human steps that are done before the session starts>
- Repos: <each repo and its base branch. The session picks the branches, the PRs, and the order>
- Read first: <code and decisions to read. A hint, not a scope limit. Optional>
- FR: <what it must do>
- NFR: <limits: security, performance, placement, allowed new dependencies, ...>
- Verification: <how the session proves it, with real commands and data. For a bugfix, the failing test first>
- Safe to deploy when: <the checks that pass before the hand-back>
- Ponytail: <what stays unbuilt>
- Hand back: <the PRs, each named after this ticket by title and path, the evidence, and the next human step>
```

The scope of a brief is its FR and NFR. A change that no FR or NFR line asks for is out of scope. A new runtime dependency is in scope only when the NFR allows it.
