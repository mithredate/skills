# Skills marketplace

A Claude Code marketplace repo of opinionated skills in one installable source. Many skills started as forks of upstream skills (mattpocock-skills, superpowers, etc.) and drifted toward a personal opinion. Not a sync mirror.

## Layout

Each top-level plugin dir has `.claude-plugin/plugin.json` and `skills/`. A mod plugin (`guard-worktree`, `watch-discussions`) has `hooks/hooks.json` with `modules` and a TypeScript hooks module instead; `hooks.json` loads one module, so each mod is its own plugin. Each skill is a dir with `SKILL.md` plus optional `references/` and `scripts/`. Slash commands (`commands/*.md`) are the legacy Claude Code mechanism and intentionally not used here — skills replace them.

## Conventions

- **Skill names are verb-first hyphenated** (`manage-agents-md`). Never linguistically "improve" upstream names; user overrides if needed.
- **Vendored skills carry a footer** at the bottom of `SKILL.md` linking to the upstream commit. The format is in [Drift bands and attribution language](#drift-bands-and-attribution-language). The link stays (MIT-compliance anchor) while the drift is 80% or less.
- **The SHA in the footer is a last-reviewed checkpoint**, not the original fork point. It moves when someone reviews the upstream again.
- **No parallel skills.** When concepts conflict, merge or abort — never run two forks of the same idea side by side.
- **Adopt an upstream idea by hand.** Do not import an upstream skill. Move the parts that work into an own skill with `productivity:write-a-skill`. A vendored skill stays whole, with its footer, only while the owner uses it whole, such as `ponytail`. The owner does not want upstream skills loaded as they are.
- **A Skill call that every run needs goes in a "First actions" line at the top of the body.** A Skill call that depends on a fact found later gets a hook on the event that reveals the fact. A Skill call inside a numbered step, or a skill list in a file the agent reads, is skipped about half the time (cakeclub discovery, 2026-10: 18 of 35 ticket sessions never loaded `grilling`, now `settle-decisions`).
- **A change under a plugin directory ships with a patch bump of that plugin's `plugin.json` version.** An installer updates a plugin only when the version changes. A skill listed in `marketplace.json` but absent from the installed copy fails the whole plugin at load.
- **A PR that changes a reviewer agent or its cases shows the scores of that agent.** The reviewer agents with cases are `pr-reviewer` and `blast-radius`. The files in `dev/evals/` whose name starts with `blast-radius-` belong to `blast-radius`. Every other file in `dev/evals/` belongs to `pr-reviewer`. The PR body gives each score line as `scripts/score-reviewer.sh` prints it, on a line of its own, for example `HEAD: recall 0.78 (14 of 18 runs), clean 0.6 (9 of 15 runs), runs with an error 0`. A `blast-radius` line starts with `HEAD: blast-radius recall`. Put the score lines above the `<details>` block. They do not count in the 50 words of the PR body. A PR that changes `dev/agents/<agent>.md` gives the lines of `origin/main` and of `HEAD` on the branch for that agent. A PR that changes only cases of an agent gives the `HEAD` line of that agent, because `origin/main` then has the same agent file. CI fails such a PR until its body holds these lines. A score is missing when it is `none`, or when its run of the script exits non-zero. If a score is missing, or a `HEAD` score is lower than the `origin/main` score, a human reviews the PR.

## Workflows

- **Validate before committing** — `./scripts/validate.sh`. CI runs the same script and gates PRs / pushes to main. On a PR, CI also runs `scripts/check-score-lines.sh`.
- **fire can auto-merge.** `fire` merges its PR when `dev:merge-judge` returns `auto`.
- **Housekeep skills** — for each skill, run `claude -p "/doctor prompt-audit <plugin>/skills/<skill>"`. Without a path, the audit reads only `.claude/`. In a sandboxed session the audit has no shell, so date a disputed line with `git log -S`. Sort each finding with `productivity:settle-decisions`. `/skill-doctor` shows the listing cost and the use of each skill.
- **Score a reviewer** — on the branch, run `git fetch`, then `scripts/score-reviewer.sh origin/main` and `scripts/score-reviewer.sh HEAD` on the same day. For `blast-radius`, put `--agent blast-radius` before the ref. A local `main` can be behind `origin/main`. The header of `scripts/score-reviewer.sh` defines recall and clean. A case has the name of its agent in its `tags`. A score goes stale when the model alias of the agent moves. An agent in a sandboxed session can run it, because `managed-settings.json` lets a sandboxed call write in the eval's run folders, `/tmp/e-*`.
- **A clean `blast-radius` case needs Bash** — it passes only on a proof that ran, so add `--allow-tools Bash` after the ref, and run the script outside the sandbox. In a sandboxed session, `claude plugin eval` cannot read the credential files that the sandbox denies, such as `~/.aws`. It then refuses each run that grants Bash. It also refuses them when the managed settings of the machine weaken the sandbox.
- **Author from scratch** — a new `SKILL.md` goes into the plugin it belongs to. `in-progress/` is for a vendored skill that is still being drifted toward the local opinion. Lifecycle is one-way; no demotion.

## Managed settings file

`managed-settings.json` at the repo root holds every machine-wide Claude Code setting of the owner. Each machine links it as its managed settings file. `guard-infra/sandbox.json` is a relative symlink to it, so that an old link still loads it. Keep local paths and personal data out of it, because the repo is public.

- **Isolate agents with the Claude Code sandbox.** Do not propose a container. A Docker sidecar with an egress firewall failed. Its OAuth went stale, MCP SSO callbacks needed host network, and the firewall broke when CDN addresses changed.
- **A call that fails in the sandbox retries outside it with the review of the permission mode.** Do not add `excludedCommands` to `managed-settings.json`. An excluded command runs outside the sandbox on every call, where it can read `~/.aws`, for example `soffice --cat`.
- **Keep every key that weakens the sandbox out of `managed-settings.json`.** An example is `enableWeakerNetworkIsolation`. `claude plugin eval` refuses every Bash grant when a managed settings file holds such a key. Without that key, `gh` fails TLS in the sandbox and retries outside it.
- **A sandboxed call writes only in the session's folder.** Do not add `~/projects`, or another folder that holds a repo, to `allowWrite`. Claude Code protects the `.git` config and hooks only in the session's folder. A `denyWrite` glob does not fully protect them in other folders. Git can also read its config from outside `.git`. If a sandboxed call changes the git config of a repo, git later runs that code outside the sandbox. Keep every `denyWrite` entry.

## Worktree workflow

Make every change in a **dedicated git worktree per session**, never on `main` directly. Make the worktree with the `EnterWorktree` tool. It lives under `.claude/worktrees/<name>/` at the repo root (gitignored). In the worktree, run `git switch -c <branch> --no-track` to name the branch. A branch rename or a tracking branch writes `.git/config`, which the sandbox denies.

Per session:
- Create a worktree on a feature branch.
- Do all file edits in the worktree.
- On successful validation: commit, push the branch, open a PR with a body by the PR body rule of `personal:work-like-mehrdad`. CI on the feature branch is the actual gate.
- On validation failure: leave the worktree dirty for inspection. Don't commit, don't push.
- After the merge, leave the worktree with `ExitWorktree` and `action: "remove"`. If the tool refuses and lists changes, show the list to the user and ask before you discard anything. `ExitWorktree` acts only on a worktree that the same session made with `EnterWorktree`. For a worktree from an earlier session, give the user `git worktree remove <path>` to run with `!`. `git worktree remove` fails in the sandbox.

## Lifecycle

- `in-progress/` — a vendored skill still being drifted toward the local opinion.
- `dev/` / `productivity/` / `personal/` — stable, currently used.
- `deprecated/` — phased out, still installable with warning.

## Deprecation

A skill is a deprecation candidate when both conditions hold:

1. No session invoked it in the last 30 days. Claude Code deletes transcripts after 30 days, so this window is the whole visible history. Count sessions, not calls. Count subagent transcripts too, because research and review run in agents.
2. No skill or agent file calls it. A dependency never shows in a direct count. `research` is called by `orchestrate`, and `verification-before-completion` by `systematic-debugging`.

`scripts/skill-usage.sh` prints both numbers for every skill on the branch, with the callers. Run it before you deprecate a skill. It reads only the transcripts of this machine, and the owner also uses the skills on a second machine. If a count is zero, ask the owner before you deprecate the skill. A skill younger than the window is exempt. Deprecation moves the skill to `deprecated/`. Removal deletes the skill and its lines in `marketplace.json` and `NOTICES.md`. The removal of a whole plugin also maps its name to `null` under `renames` in `marketplace.json`.

## Drift bands and attribution language

A vendored `SKILL.md` ends with this footer:

```
---
_<Verb> [<owner>/<repo>/<upstream-path>](https://github.com/<owner>/<repo>/tree/<sha>/<upstream-path>) — <license> <copyright>._
```

**Drift** is the share of the local skill that is not upstream text. Its formula is `1 − (local lines identical to upstream ÷ local non-blank lines)`. Count the lines across every skill file, with the footer excluded. A deletion of upstream text does not raise the drift.

Footer verb depends on local drift since last review:

| Drift | Verb |
|---|---|
| < 30%  | `Adapted from` |
| 30–80% | `Inspired by` |
| > 80%  | no footer |

A file over 80% drift has no footer and no `NOTICES.md` entry. It keeps only the idea of the upstream, and an idea needs no reference.

A change to a vendored skill recomputes the verb. Over 80%, the change deletes the footer and the `NOTICES.md` entry.

## When in doubt

- Attribution summary → `NOTICES.md`
- Marketplace install → `README.md`
