PR title: feat(pr-reviewer): run the reviewer at xhigh effort

## Why

Since 2026-09-28 the default model is Opus 5.5. The top-level `effortLevel` in user settings has no effect on Opus 5.5. The user keeps a saved `xhigh` level for Opus 5.5 in `modelSettings`. The `pr-reviewer` agent ran on Sonnet 5.5 at `medium`, 1,369 turns in the transcripts.

A first version of this PR set `effort: high` on `grilling`. A skill that loads in the main session keeps its level for the rest of the session. The skill then lowered the session from `xhigh` to `high`. This version removes it.

## What

- `pr-reviewer` gets `effort: xhigh`. A review is a judgment task. The level applies only inside the agent.
- `write-a-skill` gets a rule. Do not set `effort` in a skill. An agent file can set it.
- The patch version goes up in `productivity` (0.1.14) and in `dev` (0.1.9).

`verifier` stays at its default. The effort docs say that Haiku 5.5 at `low` can skip checks in a long agent prompt.

## Verified

- `./scripts/validate.sh` passes.
- Not yet checked: the effort level in a `pr-reviewer` transcript after the plugin update. If Sonnet 5.5 does not support `xhigh`, Claude Code falls back to the highest supported level below it.

## Links

- https://code.claude.com/docs/en/model-config
- https://code.claude.com/docs/en/sub-agents

🤖 Generated with [Claude Code](https://claude.com/claude-code)

