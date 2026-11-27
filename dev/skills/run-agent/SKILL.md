---
name: run-agent
description: Use when a workflow starts an implementer, a verifier, or a named `dev` agent, on Claude Code or Codex.
---

# Run agent

Start agents with the current host's native agent tool. The role gives the instructions; the host supplies the model and permissions.
Use a second engine only when the caller explicitly asks for a cross-engine review, not as a fallback for a missing role.

For model setup examples, see [references/models.md](references/models.md).
Load each required skill with the host's skill mechanism.
If there is no Skill tool, read its installed `SKILL.md` and supply those instructions to the agent.
This satisfies a Skill-tool call in a role or in the caller's contract, including the implementer's `dev:tdd` call.

## Start the agent

1. Take the role, prompt, targets, and result format from the caller.
2. For a named `dev` role, read its file under [../../agents/](../../agents/) in the installed plugin.
   Use the installed file, not the copy in the branch under review.
   Include its instructions, required skills, tool restrictions, turn limit, and result format in the agent's input.
   For an implementer or general-purpose verifier, use the contract that the caller supplies.
3. On Claude Code, choose the registered role when it exists. Otherwise choose a general-purpose native agent.
   On Codex, choose a configured native role when available. Otherwise choose a native agent with the role's full instructions.
   Give each agent fresh context, without the parent conversation's history.
   Keep the host's permissions. Enforce the role's tool restrictions with native controls.
   If the host cannot enforce a required restriction, report that capability as missing and apply the caller's stop rule.
4. Read `DEV_<ROLE>_MODEL` with `printenv`. Remove `dev:`, uppercase the role name, and replace hyphens with underscores.
   For example, read `DEV_PR_REVIEWER_MODEL` for `dev:pr-reviewer`.
   Pass a non-empty value as the native spawn model. If unset or empty, omit the model override.
   If a native role pins another model, use the generic path of step 3 with the same required controls.
   When copying a Claude role into Codex, its Claude `model` field does not select a Codex model.
   If a configured model is rejected, report the rejection and apply the caller's stop rule.
5. Wait for the native agent to finish. Return its result to the caller without changing its verdict or evidence.
   Report the engine and model used when the host exposes them.
   A failed start, missing role file, or missing result follows the caller's stop rule.

The step is done when the caller has the result or the cause of the failed start.
