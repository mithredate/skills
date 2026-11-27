# Agent models

The session reads this configuration and passes a model override to its native agent tool.
The host does not read this file automatically.

## Configuration

Read `~/.claude/agent-models.json` on Claude Code or `~/.codex/agent-models.json` on Codex.
Read only the file for the current host, outside the target checkout.
If the file is absent, keep native defaults.
If the file exists but is unreadable or invalid, stop the start and report the cause.

The file is a JSON object. Each key names a role; each value is a non-empty model string.
Use `implementer` for build rounds 1 and 2, and `escalation` for round 3.
For a named `dev` role, use its name without `dev:`, such as `brief-judge` or `verifier`.
The optional `default` key supplies an override for a role with no entry.

For round 3, use `escalation`, then `implementer`, then `default`, then the native default.
Report when round 3 has no configured escalation model. Do not claim that the model became stronger.
For each other start, use the role entry, then `default`, then the native default.

Claude Code example, for `~/.claude/agent-models.json`:

```json
{
  "implementer": "opus",
  "escalation": "fable"
}
```

Codex example, for `~/.codex/agent-models.json`:

```json
{
  "implementer": "gpt-6.2-sol",
  "escalation": "gpt-6.2-astra"
}
```

These examples set only implementation models. Other roles keep their native defaults.
Use models available to the account and accepted by the host's spawn tool.
Keep reasoning effort in the host's native configuration.

## Native defaults

Claude Code also supports `CLAUDE_CODE_SUBAGENT_MODEL` in the launch environment or the `env` block of its settings.
An explicit spawn model or an agent's `model` field overrides that default.
The override from this file is an explicit spawn model, so it wins over a Claude agent's `model` field.

Codex supports `agents.default_subagent_model` in its configuration and model choices in custom native agent definitions.
A Codex custom agent can override a spawn model. Keep its model consistent with this file, or configure that role only natively.
Use a generic native agent when an explicit override must take precedence over a custom role's model.

Sources: [Claude subagent models](https://code.claude.com/docs/en/sub-agents#choose-a-model) and
[Codex subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents).
