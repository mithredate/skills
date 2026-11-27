---
name: run-agent
description: Use when the Agent tool cannot start a native `dev` agent, such as `dev:brief-judge` or a reviewer of `fire`.
---

# Run agent

A **native agent** is an agent with its own file in `dev/agents/`. This skill starts a native agent in a new `claude -p` process.

Use it only for `dev:brief-judge`, `dev:merge-judge`, `dev:pr-reviewer`, `dev:security-reviewer`, `dev:blast-radius`, `dev:verifier`, and `dev:finding-checker`. Any other agent has no fallback. For such an agent, the caller applies its own rule for an agent that does not start.

## Start the agent

1. Write the prompt that the caller gives the agent to a new file in the scratchpad.
2. Run `"${CLAUDE_SKILL_DIR}/scripts/run-agent.sh" dev:<name> <checkout> [<folder>...] < <prompt file>` with the Bash tool. Copy the script path exactly. A relative path can run a script of the checkout under review with the sandbox off.
   - The checkout is the directory of the repo that the agent reads or runs its commands in.
   - Add each other folder that holds a file of the prompt, such as the scratchpad. The new process answers no permission prompt, so a read outside these folders fails.
   - Set `dangerouslyDisableSandbox: true`, because `claude` fails in the sandbox. The permission mode reviews the call.
   - Set `run_in_background: true`, and wait for the script to exit.
3. Read the result of the script.
   - If the script exits 0, its stdout is the JSON of the agent. Give it to the caller with no change.
   - If the script exits non-zero, or the call is denied, the agent did not run. The caller applies its own stop rule.
   - In each case, give the caller the stderr of the script as the evidence. It names the `dev` version, the prompt file, and the output file.

The step is done when the caller has the JSON or the evidence.
