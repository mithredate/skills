PR title: refactor(skills): short trigger-only descriptions

## Why

The agent picks a skill from its name and description only. Our descriptions summarized the body, often in 300 to 550 characters. A workflow summary in a description also makes the agent follow the summary and skip the body.

## What

- New descriptions for all 22 model-invoked skills. Each one is a "Use when" line, with a short noun phrase first only when the name does not say what the skill is. The longest is 130 characters.
- `write-a-skill` Frontmatter rules: triggers only, under 150 characters, no step, count, or rule from the body. Write "even when the user does not ask" for a skill the agent must load with no request.
- Unchanged: the user-invoked skills (`grill-me`, `sup`, `teach`), the deprecated `wayfinder`, and the two agent files.
- Patch bumps for `dev`, `in-progress`, `meta`, `personal`, and `productivity`.

## Verified

- `./scripts/validate.sh` passes.
- No description contains a colon followed by a space.
- Attribution check. I recomputed drift by the `footer-format.md` formula against each upstream at its footer SHA. No verb changes band. The largest shift is `research`, from 14% to 29%, still `Adapted from`. `grilling` moves from 48% to 52%, still `Inspired by`. `NOTICES.md` holds no verbs, so it does not change.
- No trigger eval ran. The new descriptions are not measured against the old ones.

## Links

- Claude Code skills docs, `description` and `when_to_use`: https://code.claude.com/docs/en/skills
- Skill authoring best practices, "Writing effective descriptions": https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices
- anthropics/skills `skill-creator`, on skills that do not trigger often enough: https://github.com/anthropics/skills/blob/main/skills/skill-creator/SKILL.md
- obra/superpowers `writing-skills`, on workflow summaries in descriptions: https://github.com/obra/superpowers/blob/main/skills/writing-skills/SKILL.md

🤖 Generated with [Claude Code](https://claude.com/claude-code)
