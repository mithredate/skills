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
type: grilling | prototype | research | task | gate
status: open | closed
assignee: <empty if unclaimed>
blocked-by: [<id>, ...]
---

<the question>

## Resolution

<appended on close: the answer, its reasoning, and a `Revisit if:` line>
```

A ticket is on the frontier when `status: open`, `assignee` is empty, and every `blocked-by` id is closed. Assets are files under `assets/`, linked from the ticket.

## Brief

A build `task` ticket holds this section as its body.

```
## Brief

- Why: <the problem, and who has it. One or two sentences>
- Goal: <what is true when the session hands back>
- Targets: <each git repo with its base branch, or each other system, for example an n8n instance>
- Decisions: <each decision that a human made, one line each, with a link to its ticket or ADR. Optional>
- FR: <behavior that a caller, a user, or a test can see, one sub-bullet for each requirement>
- NFR: <limits, one sub-bullet for each limit: security, performance, allowed new dependencies, what stays unbuilt>
- Verification: <how the session proves it, with real commands and data, and the checks that pass before the hand-back. For a bugfix, the failing test first>
```

The brief gives the why and the what. The implementer picks the how. Each pair below shows a line that gives the how, then the same line rewritten.

<examples>
<example>
Bad: `- Why: Build the agent API.` This repeats the Goal.
Good: `- Why: The Damage Dispute agent reads bookings through a shared admin login. Each read must carry the identity of the caller.`
</example>
<example>
Bad: `- FR: A custom authenticator in src/AgentApiModule/ checks the token against the JWKS.`
Good: `- FR: A call with an expired token, or a token for another audience, returns 401.`
</example>
<example>
Bad: `- Read first: AzureLoginService.php. Copy the JWKS check, not the appid check.`
Good: `- Decisions: A custom authenticator, not the existing firewall. It checks aud, not appid. [Write the phase 1 MVP brief](tickets/wmcp-23.md)`
</example>
<example>
Bad: `- NFR: Add an index on order.booking_number.`
Good: `- NFR: The order list returns in under 200 ms for a booking with 100 orders.`
</example>
</examples>

## Gate

A `gate` ticket has `owner:` in its frontmatter, with the human who owns it. Its `assignee:` stays empty.

```
## Step

- [ ] <one action, with the system and the exact names>
- Closes when: <the fact that shows the step is done>
```
