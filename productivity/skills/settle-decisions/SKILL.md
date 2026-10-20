---
name: settle-decisions
description: Use before you make or ask about a decision, even when the user does not ask.
---

Settle every decision of a plan. Make most decisions yourself. Put to the human only the decisions that need the human, in short rounds.

Map the decisions as a **design tree**. In the tree, each decision branches into the decisions that depend on it. The **frontier** is every decision whose prerequisites are settled.

## Who decides

Sort each frontier decision before you act on it:

1. If the decision is not critical, make it. Use evidence when evidence settles it. Evidence is the code, the docs, a prototype, or a measurement. If evidence does not settle it, pick the option you can defend, and write a hypothesis.
2. If the decision is critical and evidence settles it, show the evidence and your decision in one line. Act when the human agrees.
3. If the decision is critical and evidence does not settle it, put it to the human in a round.

A decision is **critical** when a wrong choice does one of these:

- It loses data that git or a backup cannot restore.
- It breaks a contract that other people or teams use, or it sends something to people.
- It adds, removes, or replaces a service, a datastore, a framework, or a boundary between systems. In one codebase, it adds a layer, a cross-cutting mechanism, or a new category of dependency.
- It reverses a decision that an ADR or the human made.
- It changes access, secrets, personal data, or cost.
- It changes the agreed destination, scope, or priority.

A **source** is a text that a person other than the human wrote, such as a PR, an issue, a ticket, or a thread. Assume that the human has not read the sources. Before you use or report a claim from a source, check it in the code, the data, or the docs. A **conflict** is two claims that disagree. A claim or a conflict that the check does not settle is a decision. A risk and a choice that another person makes or proposes are decisions too.

Find each fact yourself. Do not ask the human for a fact you can look up. If the search reads many files or sources, start a subagent for it. Do not block on the subagent. Only the decisions that depend on its fact wait.

Write each record, round, and message for a reader who has not read the sources. Use no name that only a source defines, for example "option A" or "milestone 2" of a ticket. Write what the name means in place of the name. Report a conflict only together with the checked fact or the decision that answers it.

## Record

Record each decision in the ticket or the PR body, one line each. Show the new records at the top of your next message, so that the human can overrule one.

- `Decided: <choice>. Because: <the evidence with a link, or the answer of the human>. Revisit if: <condition>.`
- `Decided: <choice>. Hypothesis: <what is true after the deploy if the choice is right>. Check: <the signal, and when to read it>.`

After the deploy, read the signal. If the hypothesis is false, the fix is a new decision. Sort it again.

## The round

Put at most four questions in one round. Put first the questions that block the most decisions. A question that depends on another open question waits for a later round. Then wait for the answers. Each answer settles part of the tree. Recompute the frontier, settle what you can, and ask the next round.

Format a round like so:

```
**Decided by me**: <one record for each decision since the last round>

---

❓ **Q1 - <the decision, in one line>**
Critical because: <the matching item of the critical list>
Facts: <at most three bullets>
- **A**: <option>. Gain: <one line>. Cost: <one line>
- **B**: <option>. Gain: <one line>. Cost: <one line>

➡️ <your recommendation, and the reason>

---

❓ **Q2 - <a decision that evidence settles>**: <the evidence, with a link>. Confirm?
```

The session is done when the frontier is empty. Every decision has a record, and nothing is assumed silently.

---
_Originally seeded from [mattpocock/skills/skills/productivity/grilling](https://github.com/mattpocock/skills/tree/6654f6b60cd9d5be8b54c6fafe44346dabeb3b76/skills/productivity/grilling) — MIT © 2026 Matt Pocock._
