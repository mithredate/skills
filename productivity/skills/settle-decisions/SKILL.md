---
name: settle-decisions
description: Use before you make or ask about a decision, even when the user does not ask.
---

Settle every decision of a plan. Make most decisions yourself. Put to the human only the decisions that need the human, in short rounds.

Map the decisions as a **design tree**. In the tree, each decision branches into the decisions that depend on it. The **frontier** is every decision whose prerequisites are settled.

## Who decides

Sort each frontier decision before you act on it:

1. If the decision is not critical, make it. Use evidence when evidence settles it. Evidence is the code, the docs, a prototype, or a measurement. If evidence does not settle it, pick the option you can defend, and write a hypothesis.
2. If a critical decision has one defensible option, or evidence settles it, do not wait for a yes. First check each fact that the decision rests on in the code, the data, or the docs. This includes your own statements. Then make the decision and record the evidence. If the choice cannot be undone, such as lost data or a message sent to people, wait for a yes.
3. If evidence does not settle a critical decision and more than one option is defensible, put it to the human in a round.

If the stated goal of the human implies a choice inside that goal, the goal is the answer of the human. Make the choice and record it. Ask about a choice that widens the scope or reverses a decision of the human.

A decision is **critical** when a wrong choice does one of these:

- It loses data that git or a backup cannot restore.
- It breaks a contract that other people or teams use, or it sends something to people.
- It adds, removes, or replaces a service, a datastore, a framework, or a boundary between systems. In one codebase, it adds a layer, a cross-cutting mechanism, or a new category of dependency.
- It reverses a decision that an ADR or the human made.
- It changes access, secrets, personal data, or cost.
- It changes the agreed destination, scope, or priority.
- It adds the first file of a kind to a repo that other people use, such as the first ADR.

A **source** is a text by a person or a bot other than the human and you. Examples are a PR, an issue, a ticket, and a thread. A **claim** is a statement in a source. Before you use or report a claim, check it in the code, the data, or the docs.

A **conflict** is two claims that disagree. A claim or a conflict that the check does not settle is a decision. A risk and a choice that another person makes or proposes are decisions too.

When the human reports a meeting, record what the others said as reported. Each commitment of the human, such as time, scope, or role, stays open until the human confirms it.

Find each fact yourself. Do not ask the human for a fact you can look up. If the search reads many files or sources, start a subagent with a fresh context for it. Do not block on the subagent. Only the decisions that depend on its fact wait.

Write each record, round, and message for a reader who has not read the sources. Say what a thing is, not its label from a source, such as "option A" or "milestone 2".

## Record

Record each decision in the ticket or the PR body, one line each. Show the new records at the top of your next message, so that the human can overrule one.

- `Decided: <choice>. Because: <the evidence with a link, or the answer of the human>. Revisit if: <condition>.`
- `Decided: <choice>. Hypothesis: <what is true after the deploy if the choice is right>. Check: <the signal, and when to read it>.`

After the deploy, read the signal. If the hypothesis is false, the fix is a new decision. Sort it again.

## The round

Put at most four questions in one round. Write each question so that a yes accepts your recommendation. Put first the questions that block the most decisions. A question that depends on another open question waits for a later round. Then wait for the answers. Each answer settles part of the tree. Recompute the frontier, settle what you can, and ask the next round.

Format a round like so:

```
**Decided by me**: <one record for each decision since the last round>

---

❓ **Q1 - <your recommendation, as a yes or no question>**
Critical because: <the matching item of the critical list>
Facts: <at most three bullets>
- **A**: <option>. Gain: <one line>. Cost: <one line>
- **B**: <option>. Gain: <one line>. Cost: <one line>

➡️ <your recommendation, and the reason>

---

❓ **Q2 - <a decision that cannot be undone>**: <the evidence, with a link>. Confirm?
```

If you ask in an `AskUserQuestion` dialog, put the full context in the question text. The terminal can hide the message above the dialog.

The session is done when the frontier is empty. Every decision has a record, and nothing is assumed silently.
