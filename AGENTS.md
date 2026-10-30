# Skills marketplace

A Claude Code marketplace repo: opinionated forks of upstream skills (mattpocock-skills, superpowers, etc.) curated into one installable source. Skills are *vendored* — copied in, then drifted toward a personal opinion. Not a sync mirror.

## Layout

Each top-level plugin dir has `.claude-plugin/plugin.json` and `skills/`. A mod plugin (`guard-worktree`, `watch-discussions`) has `hooks/hooks.json` with `modules` and a TypeScript hooks module instead; `hooks.json` loads one module, so each mod is its own plugin. Each skill is a dir with `SKILL.md` plus optional `references/` and `scripts/`. Slash commands (`commands/*.md`) are the legacy Claude Code mechanism and intentionally not used here — skills replace them.

## Conventions

- **Skill names are verb-first hyphenated** (`import-skill`, `manage-agents-md`). Never linguistically "improve" upstream names; user overrides if needed.
- **Vendored skills carry a footer** at the bottom of `SKILL.md` linking to the upstream commit. Canonical format: `meta/skills/import-skill/references/footer-format.md`. The link is always preserved (MIT-compliance anchor) even when the skill has fully drifted.
- **The SHA in the footer is a last-reviewed checkpoint**, not the original fork point. Advances every refresh.
- **No parallel skills.** When concepts conflict, merge or abort — never run two forks of the same idea side by side.
- **A Skill call that every run needs goes in a "First actions" line at the top of the body.** A Skill call that depends on a fact found later gets a hook on the event that reveals the fact. A Skill call inside a numbered step, or a skill list in a file the agent reads, is skipped about half the time (cakeclub discovery, 2026-10: 18 of 35 ticket sessions never loaded `grilling`, now `settle-decisions`).
- **A change under a plugin directory ships with a patch bump of that plugin's `plugin.json` version.** An installer updates a plugin only when the version changes. A skill listed in `marketplace.json` but absent from the installed copy fails the whole plugin at load. The `import-skill` script bumps automatically. `write-a-skill`, `merge-skill`, and `refresh-vendored` bump by hand.
- **A PR that changes `dev/agents/pr-reviewer.md` or a file in `dev/evals/` shows reviewer scores.** The PR body gives each score line as `scripts/score-reviewer.sh` prints it, on a line of its own, for example `HEAD: recall 0.78 (14 of 18 runs), clean 0.6 (9 of 15 runs), runs with an error 0`. A PR that changes `pr-reviewer.md` gives the lines of `origin/main` and of `HEAD` on the branch. A PR that changes only files in `dev/evals/` gives the line of `HEAD`, because `origin/main` then has the same `pr-reviewer.md`. CI fails such a PR until its body holds these lines. A score is missing when it is `none`, or when its run of the script exits non-zero. If a score is missing, or a `HEAD` score is lower than the `origin/main` score, a human reviews the PR.

## Workflows

- **Validate before committing** — `./scripts/validate.sh`. CI runs the same script and gates PRs / pushes to main. On a PR, CI also runs `scripts/check-score-lines.sh`.
- **fire can auto-merge.** `fire` merges its PR when `dev:merge-judge` returns `auto`.
- **Vendor a new skill from an upstream repo** — invoke `/import-skill`. Defined in `meta/skills/import-skill/SKILL.md`. Gathers upstream coords, picks target plugin, runs the import script, validates.
- **Refresh vendored skills against upstream** — invoke `/refresh-vendored`. Defined in `meta/skills/refresh-vendored/SKILL.md`. Delegates each per-skill reconciliation to `merge-skill`.
- **Reconcile two skill versions** — invoke `/merge-skill`. Defined in `meta/skills/merge-skill/SKILL.md`. Used by both above; can also be invoked standalone.
- **Score the reviewer** — on the branch, run `git fetch`, then `scripts/score-reviewer.sh origin/main` and `scripts/score-reviewer.sh HEAD` on the same day. A local `main` can be behind `origin/main`. The header of `scripts/score-reviewer.sh` defines recall and clean. A score goes stale when the `sonnet` alias of the reviewer moves. Run it in your terminal, because the Claude Code sandbox blocks the eval's run folders in `/tmp`.
- **Author from scratch** — a new `SKILL.md` goes into the plugin it belongs to. `in-progress/` is for a vendored skill that is still being drifted toward the local opinion. Lifecycle is one-way; no demotion.

## Worktree workflow (imports and refreshes)

Both `import-skill` and `refresh-vendored` operate in a **dedicated git worktree per session**, never on `main` directly. Make the worktree with the `EnterWorktree` tool. It lives under `.claude/worktrees/<name>/` at the repo root (gitignored). In the worktree, run `git switch -c <branch> --no-track` to name the branch. A branch rename or a tracking branch writes `.git/config`, which the sandbox denies.

Per session:
- Create a worktree on a feature branch — `import/<target-name>` for imports, `refresh/<date>` for refreshes.
- Do all file edits in the worktree.
- On successful validation: commit, push the branch, open a PR with the body shape from `write-a-skill` (Why, What, Verified, Links). CI on the feature branch is the actual gate.
- On validation failure: leave the worktree dirty for inspection. Don't commit, don't push.
- After the merge, leave the worktree with `ExitWorktree` and `action: "remove"`. If the tool refuses and lists changes, show the list to the user and ask before you discard anything. `ExitWorktree` acts only on a worktree that the same session made with `EnterWorktree`. For a worktree from an earlier session, give the user `git worktree remove <path>` to run with `!`. `git worktree remove` fails in the sandbox.

## Lifecycle

- `in-progress/` — a vendored skill still being drifted toward the local opinion.
- `dev/` / `productivity/` / `personal/` — stable, currently used.
- `deprecated/` — phased out, still installable with warning. `refresh-vendored` skips these.
- `meta/` — repo self-maintenance only; not useful in other projects.

## Deprecation

A skill is a deprecation candidate when both conditions hold:

1. No session invoked it in the last 30 days. Claude Code deletes transcripts after 30 days, so this window is the whole visible history. Count sessions, not calls. Count subagent transcripts too, because research and review run in agents.
2. No skill or agent file calls it. A dependency never shows in a direct count. `codebase-design` is called by `tdd`, and `verification-before-completion` by `systematic-debugging`.

`scripts/skill-usage.sh` prints both numbers for every skill on the branch, with the callers. Run it before you deprecate a skill. A skill younger than the window is exempt. A `meta/` skill is a maintenance tool, so a quiet month is not a verdict on it. Deprecation moves the skill to `deprecated/`. Removal deletes the skill and its lines in `README.md`, `marketplace.json`, and `NOTICES.md`.

## Drift bands and attribution language

Footer verb depends on local drift since last review:

| Drift | Verb |
|---|---|
| < 30%  | `Adapted from` |
| 30–80% | `Inspired by` |
| > 80%  | `Originally seeded from` |

`merge-skill` rewrites the verb when the band shifts. Its report names the change.

## When in doubt

- Footer format details → `meta/skills/import-skill/references/footer-format.md`
- Attribution summary → `NOTICES.md`
- Marketplace install → `README.md`
