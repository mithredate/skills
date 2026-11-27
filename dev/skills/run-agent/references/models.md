# Model environment variables

Set model variables in the host's existing configuration. Read a model with one command:

```sh
printenv DEV_IMPLEMENTER_MODEL
```

Claude Code, in `~/.claude/settings.json`:

```json
{
  "env": {
    "DEV_IMPLEMENTER_MODEL": "opus",
    "DEV_ESCALATION_MODEL": "fable"
  }
}
```

Codex, in `~/.codex/config.toml`:

```toml
[shell_environment_policy.set]
DEV_IMPLEMENTER_MODEL = "gpt-6.2-sol"
DEV_ESCALATION_MODEL = "gpt-6.2-astra"
```

Other roles use the same naming rule, such as `DEV_BRIEF_JUDGE_MODEL` or `DEV_VERIFIER_MODEL`.
These variables supply explicit spawn overrides; unset variables leave native defaults in place.
The host's environment filters and model restrictions still apply.

Sources: [Claude environment settings](https://code.claude.com/docs/en/settings) and
[Codex shell environment policy](https://learn.chatgpt.com/docs/config-file/config-advanced#shell-environment-policy).
