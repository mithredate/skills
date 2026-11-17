---
name: prep
description: Use on `/prep`, when a request, an issue key, or a thread link needs a brief for `fire`, or when `orchestrate` hands off a build.
argument-hint: "<request | issue key | thread link>"
---

# Prep

First actions: call the Skill tool with `personal:work-like-mehrdad` and `dev:ponytail`.

**Arguments:** $ARGUMENTS. The argument is a requirement: a request in the user's words, a Jira or Linear key, or a link to a Slack or Teams thread. In an `orchestrate` hand-off, the requirement is the build ticket and the decisions of its initiative.

Prep turns a requirement into a brief. The **brief** is the whole input of one `dev:fire` run. `fire` and its agents get nothing else from this session. So prep runs in the session that holds the context, and the brief carries each fact of that context that the build needs.

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
- If the brief allows a new dependency, read its registry on the day you write the brief. Name the latest stable major. Also name a successor package if one replaces the dependency under a new name. If the brief keeps an older major, give the reason in the Decisions line. The model and the reference code can name an old major.
- If the change touches a vendor SDK or API, link the official guide of the feature at the version that the brief names. The model can remember an old workaround.
- The scope of a brief is its FR and NFR. A change that no FR or NFR line asks for is out of scope. A new runtime dependency is in scope only when the NFR allows it.

Write the brief to a file before the checks, because the judge of check 5 reads a file. In a hand-off, write it as the body of the build ticket, with no `approved:`. If the ticket has an `assignee`, change only its body with the Edit tool. An edit that holds the `assignee:` line makes a hook load `dev:fire` before the checks. Otherwise, write it to `draft.md` in the session scratchpad. A write of `brief.md` makes a hook load `dev:fire`, so write `brief.md` only after the checks.

Check the brief:

1. Each decision of this session that the build needs is in the Decisions line. In a hand-off, the line also links each ticket that holds an open question.
2. Each FR is behavior that a caller, a user, or a test can see.
3. Each Verification check is a real command with real data.
4. The Terms line names each domain term that the change touches, or says `none`. Each edge case of the change is an FR line.
5. Start `dev:brief-judge`. Give it the path of the brief file and the requirement. Say if the requirement is a message of the human or a source. Give it the decision records, or the paths of the decision tickets. Give it the paths of the design doc, if one exists, and of the AGENTS.md or CLAUDE.md of each target. Start it again after each change of the brief or of the records. The check is done when the judge returns `auto` for the current brief.
   - If the Agent tool does not list `dev:brief-judge`, add no `approved:`, and start no other agent in its place. Tell the user to run `/reload-plugins`, and stop the check.
   - Treat the verdict as `human` if it is not `auto`, if an item applies, or if there is no JSON. If a `human` verdict gives no reason, tell the user, and stop the check.
   - If the verdict is `human`, fix each gap that the judge lists. Fix a `line_count` over 800 by check 6. For each other reason, change the brief or add evidence to the record. Evidence comes from the code, the data, or the docs. A record of your own decision does not answer a reason.
   - If neither settles a reason, put the decision to the human by Gather step 3. Outside a hand-off, that is a round of `productivity:settle-decisions`.
6. If `line_count` is over 800, split the change into incremental briefs. Each brief can merge alone. Reviewers report a larger diff as too large to review. In a hand-off, each brief is its own build ticket, with a `blocked-by` edge to the build ticket before it. Outside a hand-off, stop, and tell the user to chart the change with `productivity:orchestrate`.

## Hand off

Do not show the brief, and do not wait for a yes, because the user does not read a whole brief.

- In a hand-off, add `approved: <YYYY-MM-DD>` to the ticket frontmatter only after the judge returns `auto` for the current brief. When you change a brief, do the checks again, and start the judge again. If the ticket has `approved:`, delete it in the same edit. Then go back to `orchestrate`. `orchestrate fire` builds the ticket later, with no human.
- Otherwise, when the judge returns `auto`, write the text of `draft.md` to `brief.md` with the Write tool. Put `brief.md` in the session scratchpad, next to `draft.md`. A hook tells you to call the Skill tool with `dev:fire`. Do it before your next tool call. Then run `diff` on `draft.md` and `brief.md`, before the first step of `fire`. If `diff` prints a line, write `brief.md` again, because the judge cleared only the text of `draft.md`. Give the user the path of `brief.md`, and continue in the same turn.
