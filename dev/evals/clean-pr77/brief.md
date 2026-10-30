PR title: refresh(teach): workspace-root rule, quiz answer order, no em dashes

## Why

Upstream fixed two `teach` defects in one commit. Agents resolved workspace paths against the skill folder and wrote courses into `~/.claude/skills`. Quizzes put the correct answer in a predictable position. Our copy also kept the em dashes that upstream removed in August. The September refresh advanced the checkpoint but did not take that change.

## What

- `SKILL.md § Teaching Workspace` gets the workspace-root rule from upstream.
- `SKILL.md § Skills` tells the agent to vary the position of the correct quiz answer.
- `SKILL.md` and the four `references/*-FORMAT.md` files use the upstream wording without em dashes.
- The local `references/` link paths stay.
- The footer SHA moves to `b0618bc`. Drift is 2 percent, so the verb stays `Adapted from`.
- `productivity` goes to `0.1.14`.

## Verified

- `./scripts/validate.sh` passes, including `claude plugin validate productivity`.
- After the change, the skill files differ from upstream HEAD only in 4 link lines and the footer.

## Links

- Upstream change: https://github.com/mattpocock/skills/commit/ad5400b930b297b0c0cb231ff1ffe42a7da666aa
- Upstream em dash removal: https://github.com/mattpocock/skills/commit/3216582
- Upstream HEAD: https://github.com/mattpocock/skills/tree/b0618bc436ad893b3c5e84e55fba86586d34a404/skills/productivity/teach

🤖 Generated with [Claude Code](https://claude.com/claude-code)

