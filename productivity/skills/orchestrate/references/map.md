# The map

Read this file before you chart a map or work a ticket. The file format is in [local-markdown-tracker.md](local-markdown-tracker.md).

## The map body

The map is an **index**, not a store. It lists the decisions and links to the tickets that hold their detail. A decision lives in one place, its ticket. The map gives only its gist and a link. Open tickets are not in the map. A session finds them from the ticket frontmatter.

```markdown
## Destination

<what the end of this map looks like: the spec, decision, or change. One or two lines. The last sentence starts with "Closes when".>

## Notes

<the domain, the skills that every new ticket adds to its `skills:` field, the standing preferences for this initiative>

## Decisions so far

- [<closed ticket title>](tickets/<id>.md): <one-line gist of the answer>

## Not yet specified

<the unspecified questions>

## Out of scope

<work ruled past the destination, each line with its reason and a link to the closed ticket>
```

## Ticket types

Each ticket has a `type` in its frontmatter. A **HITL** ticket resolves only in a live exchange with the user. An **AFK** ticket is driven by the agent alone. The agent never takes the user's side of a HITL ticket. The agent answers only the questions that `grilling` sorts to the agent, and records each answer.

- **research** (AFK): find a fact outside the working directory that a decision waits on. A subagent calls the Skill tool with `productivity:research`.
- **prototype** (HITL): make a cheap, rough artifact for the user to react to. Call the Skill tool with `productivity:prototype`. Link the artifact as an asset. Use it when "how must it look" or "how must it behave" is the key question.
- **grilling** (HITL): the default type. Call the Skill tool with `productivity:grilling` and with `productivity:domain-modeling`.
- **task** (AFK): work that the agent does alone. One kind comes before a decision, for example data moved so that its shape shows. The other kind is a build, which holds a `## Brief`. `dev:fire` runs it, or the session runs it when the brief changes no git repo. The resolution records what was done and the facts that later tickets need.
- **gate** (HITL): one human step, for example a setup that the agent cannot do, a review, or a deploy. The agent never claims it. It blocks the tickets that wait on the step.

## Unspecified questions

The map is incomplete on purpose. An **unspecified question** is an in-scope question that you cannot state precisely yet, because it waits on open tickets. The Not yet specified section holds the unspecified questions.

- If you can state the question precisely now, write a ticket, also when the ticket is blocked.
- If you cannot state it precisely yet, keep it under Not yet specified. Do not cut it into ticket-sized pieces. One unspecified question can become several tickets, or none.

Not yet specified holds no decided question, no live ticket, and no out-of-scope work.

## Out of scope

The destination fixes the scope. Work past the destination is out of scope. It is not an unspecified question. When a ticket turns out to be past the destination, close it and add one line under Out of scope with its reason and a link. It does not go under Decisions so far, because Decisions so far records the way that the map took. Out-of-scope work comes back only as a new initiative.
