PR title: fix(manage-agents-md): migrate an old CLAUDE.md safely, and put directory rules in a nested AGENTS.md

## Why

The skill before #92 made a **bridge** in each repo that a second agent reads: a `CLAUDE.md` with `@AGENTS.md` and a `## Claude Code` section, or a symlink `CLAUDE.md -> AGENTS.md`. Since #92, step 1 of `dev/skills/manage-agents-md/SKILL.md` says "Move an existing `CLAUDE.md` into `AGENTS.md`, then delete it", before any file is read. On a bridge repo:

- A literal move puts the bridge over the real `AGENTS.md`. The rules go out of the working tree.
- On a symlink, a literal move makes `AGENTS.md` a symlink to itself.
- A merge puts the Claude-only lines into `AGENTS.md`. Line 8 of the skill sends them to `.claude/rules/claude-code.md`.

A Codex review of #92 found it.

## What

Step 1 now moves each rule of `CLAUDE.md` that `AGENTS.md` does not hold yet. A Claude-only rule goes to `.claude/rules/claude-code.md`. The step states that an `@AGENTS.md` import and a symlink hold no rule to move. Step 5 moved rules for one part of the tree to `.claude/rules/` with `paths:`. Only Claude Code reads that directory, so Codex and the tools of teammates never saw these rules. Step 5 now moves the rules for one directory to an `AGENTS.md` in that directory. `.claude/rules/` with `paths:` holds only a Claude-only rule.

If `AGENTS.md` is a symlink to `CLAUDE.md`, step 1 now turns it into a copy first. Before, `AGENTS.md` already held every line, so step 1 moved nothing and then deleted the only copy. A path-scoped Claude-only line goes to its own file under `.claude/rules/`, so `paths:` never hides the lines of `claude-code.md`.

`dev` goes to 0.1.11.

## Verified

- `./scripts/validate.sh` passes. The mod type checks skip in this shell. No mod changed.
- The fix matches the Claude Code docs, [Remove an earlier AGENTS.md workaround](https://code.claude.com/docs/en/memory#remove-an-earlier-agentsmd-workaround). The docs also state that `.claude/rules/` files load next to `AGENTS.md`, and that a nested `AGENTS.md` loads when Claude opens a file in its directory.

## Links

- #92, the change that added the step.
- #94 also bumps `dev` to 0.1.11. The PR that merges second needs 0.1.12.

🤖 Generated with [Claude Code](https://claude.com/claude-code)



