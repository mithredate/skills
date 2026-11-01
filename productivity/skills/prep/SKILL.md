---
name: prep
description: Requirement to brief for `fire`. Use on `/prep` with a request, an issue key, or a thread link, or when `orchestrate` hands off a build.
argument-hint: "<request | issue key | thread link>"
---

# Prep

First actions: call the Skill tool with `personal:work-like-mehrdad` and `productivity:settle-decisions`.

**Arguments:** $ARGUMENTS. The argument is a requirement: a request in the user's words, a Jira or Linear key, or a link to a Slack or Teams thread. In an `orchestrate` hand-off, the requirement is the build ticket and the decisions of its map.

Prep turns a requirement into a brief. The **brief** is the whole input of one `dev:fire` run. `fire` and its agents read nothing else. So prep runs in the session that holds the context, and the brief carries each fact of that context that the build needs.

## Gather

1. Read the source. Read an issue or a thread with the tools of the session. If no tool reaches it, ask the user to paste it. In a hand-off, read the decision records that the build follows. The step is done when you can state the need in one sentence.
2. Read the code that the change touches. The step is done when you can name each target and its base branch.
3. Settle each decision with `productivity:settle-decisions`. In a hand-off, a question for the human becomes its own ticket by the Hand-off rules of `orchestrate`. The step is done when each decision is settled or has its own ticket.
4. If the work outside a hand-off needs a human step between two builds, or waits on another person, one brief cannot hold it. Stop, and tell the user to chart it with `productivity:orchestrate`.

## Write the brief

The format and the examples are in [references/brief.md](references/brief.md). Read it before you write.

- The brief gives the why and the what. The implementer picks the how and the order of work. A how goes in the brief only as a closed decision, in the Decisions line.
- Put in each fact that the build cannot get by itself. Examples are test data, reviewer names, access, and decisions. Leave out code facts. The implementer reads the code.
- Write no secret value and no customer data. Name the place where the build gets them.
- The scope of a brief is its FR and NFR. A change that no FR or NFR line asks for is out of scope. A new runtime dependency is in scope only when the NFR allows it.

Check the brief before you write it to its file:

1. Each decision of this session that the build needs is in the Decisions line. In a hand-off, the line also links each ticket that holds an open question.
2. Each FR is behavior that a caller, a user, or a test can see.
3. Each Verification check is a real command with real data.

## Hand off

- In a hand-off, write the brief as the body of the build ticket. Show it to the user, and ask for a yes. After the yes, add `approved: <YYYY-MM-DD>` to the ticket frontmatter. When you change an approved brief, delete `approved:` in the same edit, and ask for the yes again. Then go back to `orchestrate`. `orchestrate fire` builds the ticket later, with no human.
- Otherwise, write the brief to `brief.md` in the session scratchpad. Show it to the user, and continue in the same turn. A hook tells you to call the Skill tool with `dev:fire`. Do it before your next tool call.
