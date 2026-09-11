# Invocation

A skill is model-invoked or user-invoked. The choice trades two costs.

- **Context load** is the cost of a description that sits in the agent's context on every turn.
- **Cognitive load** is the cost on the human, who must remember that the skill exists.

## Model-invoked

The skill keeps its `description`. The agent can start it on its own, and another skill can call it with the Skill tool. The human can still type its name. The description is a permanent context load, so it must be short and must list each trigger once.

A skill that holds only reference is also the home for rules that several skills need. Each of them calls it. The rules then live in one place.

Mechanics: omit `disable-model-invocation`. Write the description for the agent: what the skill does, then "Use when" and the triggers.

## User-invoked

Only the human can start the skill. No other skill can call it. It costs no context load. It costs cognitive load, because the human is the index.

Mechanics: set `disable-model-invocation: true` and an `argument-hint`. Write the description for the human: one line that says what the skill does.

Choose model-invoked only when the agent must reach the skill on its own, or another skill must call it. When only the human starts it, make it user-invoked.

## Shared rules between user-invoked skills

Two user-invoked skills cannot share rules through each other, because neither has a description to reach. Put the shared rules in a model-invoked reference skill, or in a plain file that both point at.

## Router skill

When the user-invoked skills grow past what the human remembers, write one user-invoked **router skill**. It names the others and says when to use each. It can only name them. It cannot start them.
