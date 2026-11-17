---
name: run-agent
description: Use when a skill needs a fresh agent and its named agent or the Agent tool is unavailable in this session.
argument-hint: "<agent name | implementer contract>"
---

# Run an agent

Run the caller's agent in a fresh Claude Code process when this session cannot start it.
The caller still decides the inputs, rounds, approval, and merge.

## Preserve the contract

1. Find the installed plugin that owns the agent. Use a source checkout only when the user requested its test.
2. Read the native agent file, including its frontmatter and output JSON.
3. Keep its tools, model, effort, turn cap, preloaded skills, and required MCP servers.
4. Give it only the caller's task inputs and source paths, with the same verbatim text that the caller requires.

For an implementer, use the caller's implementer contract and round model.
For a general-purpose system verifier, include the caller's verifier JSON and the required system tools.

A generic agent with a role name in its prompt does not enforce the native tool restrictions.
Use the native definition for a named agent.
Keep review, implementation, and verification in separate processes.

## Start and wait

Use the documented CLI support for [plugin agents](https://code.claude.com/docs/en/sub-agents#invoke-subagents-explicitly).
Read the installed `claude --help` before the first call.

1. Write the task prompt to a scratchpad file.
2. Start `claude -p` in the target directory, with the native agent selected by `--agent <plugin>:<name>`.
3. Load the owning plugin and its skill dependencies with `--plugin-dir` for each plugin root.
4. Pass the native built-in tool allowlist with `--tools`. The main-thread default omits `Grep` and `Glob`.
5. Set `--max-turns` to the native `maxTurns` and `--effort` to its effort, when declared.
6. Use `--output-format stream-json --verbose` and save the output in the scratchpad.
7. Wait for completion before you read the final result.

For a general-purpose role, select `--agent general-purpose`.
For an implementer, set `--model` to the caller's round model.
Give it the implementer contract.
If the caller declares a turn cap, pass it with `--max-turns`.
Start a new process for each task and each round, without `--resume` or `--continue`.
Parallel tasks use separate prompt and output files.

Keep the managed settings, sandbox, permission review, and deny rules in effect.
Use `--setting-sources user` so the target branch cannot supply settings or startup hooks.
Carry forward stricter trusted project restrictions with `--settings`, excluding hooks and permission grants.
Use `--strict-mcp-config` with an explicit configuration from trusted installed servers that the role needs.
For a role with no MCP dependency, pass an empty server configuration.
Load plugins only from the trusted owning installation and its dependencies, or from the user-requested test checkout.
A shell with no permission callback cannot answer a Claude permission prompt.
Use `--permission-prompts none` in that shell, so a required approval fails closed.
If a permission is denied, report the exact operation through the host's approval path.
Do not grant broad tool permissions or bypass permissions to make the call pass.
A failure of the outer sandbox follows the host's reviewed retry procedure.

## Accept the result

Check the startup event for the expected plugin version, registered agent, model, and tools.
Check that the agent can reach each required skill, MCP server, and source file.
A missing dependency is a setup failure, not permission to replace the role.

Read the final `result` event only after the process exits successfully.
Require `is_error: false`, `subtype: success`, and the complete JSON that the native contract declares.
Use `structured_output` when a schema was supplied, otherwise parse `result` as the agent's JSON.
If `result` wraps JSON in one Markdown fence, remove only that fence before the parse.
Treat a denied required operation, partial output, authentication error, or usage limit as a failed invocation.
The startup event and a zero shell exit alone do not prove that the task ran.

Return the native JSON unchanged.
Report the invocation evidence and any denied operation separately.
The caller applies its existing failure rule when no complete result arrives.
For a judge, an absent or malformed verdict never grants approval.
If execution remains blocked, name the concrete failed operation and its evidence.
Ask for `/reload-plugins` only when a Claude Code plugin registry needs a reload.
