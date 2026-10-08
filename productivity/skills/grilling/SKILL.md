---
name: grilling
description: Use when the user wants a plan, a decision, or an idea stress-tested, or says "grill".
effort: high
---

Interview the user relentlessly until you reach a shared understanding. Map this as a **design tree**: every decision branches into the decisions that hang off it.

Work the tree in **rounds**. The **frontier** is every decision whose prerequisites are already settled: the questions you can ask _now_ without guessing at answers you haven't heard yet. Put at most four frontier questions in one round, and put first the questions that block the most decisions. Number each question and give your recommended answer. Then wait for the user's answers before the next round.

## Who answers

Sort each frontier decision with this tree before you put it to the user:

```
Can evidence answer it? Evidence is the code, the docs, a prototype, or a measurement.
├─ yes → find the answer, decide, and record the decision.
└─ no  → Is it a domain, product, or value judgment, or is it hard to reverse?
         ├─ yes → put it to the user.
         └─ no  → decide, and record the decision.
```

A domain fact, such as what the code does today, is evidence. Find it yourself. Record each decision you make with its reason and a `Revisit if:` line. Show these decisions at the top of the next round, so that the user can overrule one.

## The round

Format a round like so:

```
**Briefing**: <the problem in plain words and the facts that the questions rest on. Assume that the reader knows nothing about the topic.>

**Decided by me**: <each decision you made since the last round, with its reason and a `Revisit if:` line>

---

❓ **Q1** - **<question title>**: <question body, might be multiple paragraphs, including multiple choices>

➡️ <your recommended answer>

---

❓ **Q2** - **<question title>**: <question body, might be multiple paragraphs, including multiple choices>

➡️ <your recommended answer>
```

Each round the user answers reshapes the tree: settled decisions push the frontier outward and unblock questions that depended on them. Recompute the frontier and ask the next round. A question whose answer depends on another question still open in this round belongs to a _later_ round, not this one.

Finding _facts_ is your job, never the user's. When a frontier question needs a fact from the environment (filesystem, tools, etc.), dispatch a sub-agent to find it; don't ask the user for anything you could look up yourself. Don't block on it: a running exploration is an unsettled prerequisite, so only the questions downstream of it wait for the sub-agent to report; ask the rest of the frontier now. A decision that the tree gives to the user is the user's: put it to them and wait.

The session is done when the frontier is empty: every branch of the design tree visited, nothing left silently assumed. Do not act on it until the user confirms you have reached a shared understanding.

---
_Inspired by [mattpocock/skills/skills/productivity/grilling](https://github.com/mattpocock/skills/tree/6654f6b60cd9d5be8b54c6fafe44346dabeb3b76/skills/productivity/grilling) — MIT © 2026 Matt Pocock._
