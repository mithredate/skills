# The map

Read this file before you chart a map or work a ticket. The file format is in [local-markdown-tracker.md](local-markdown-tracker.md).

## The map body

The map is an **index**, not a store. It lists the decisions and links to the tickets that hold their detail. A decision lives in one place, its ticket. The map gives only its gist and a link. Open tickets are not in the map. A session finds them from the ticket frontmatter.

```markdown
## Destination

<what the end of this map looks like: the spec, decision, or change. One or two lines. The last sentence starts with "Closes when".>

## Notes

<the domain, the skills that every session must call, the standing preferences for this initiative>

## Decisions so far

- [<closed ticket title>](tickets/<id>.md): <one-line gist of the answer>

## Not yet specified

<the fog: in-scope questions that you cannot state precisely yet>

## Out of scope

<work ruled past the destination, each line with its reason and a link to the closed ticket>
```

## Ticket types

Each ticket has a `type` in its frontmatter. A **HITL** ticket resolves only in a live exchange with the user. An **AFK** ticket is driven by the agent alone. The agent never takes the user's side of a HITL ticket. The agent answers only the questions that `grilling` sorts to the agent, and records each answer.

- **research** (AFK): find a fact outside the working directory that a decision waits on. A subagent calls the Skill tool with `productivity:research`.
- **prototype** (HITL): make a cheap, rough artifact for the user to react to. Call the Skill tool with `productivity:prototype`. Link the artifact as an asset. Use it when "how must it look" or "how must it behave" is the key question.
- **grilling** (HITL): the default type. Call the Skill tool with `productivity:grilling` and with `productivity:domain-modeling`.
- **task** (HITL or AFK): work that must happen before a decision is possible, for example access to a service or data moved so that its shape shows. Do it alone when you can. Otherwise give the user a precise checklist. The resolution records what was done and the facts that later tickets need.

## Fog

The map is incomplete on purpose. The **fog** is the set of questions that you can see coming but cannot state precisely yet, because they wait on open tickets. The Not yet specified section holds the fog.

- If you can state the question precisely now, write a ticket, also when the ticket is blocked.
- If you cannot state it precisely yet, leave it in the fog. Do not cut the fog into ticket-sized pieces. One patch can become several tickets, or none.

The fog holds no decided question, no live ticket, and no out-of-scope work.

## Out of scope

The destination fixes the scope. Work past the destination is out of scope, not fog. When a ticket turns out to be past the destination, close it and add one line under Out of scope with its reason and a link. It does not go under Decisions so far, because Decisions so far records the way that the map took. Out-of-scope work comes back only as a new initiative.
