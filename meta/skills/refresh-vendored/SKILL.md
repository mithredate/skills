---
name: refresh-vendored
description: Refreshes each vendored skill against its upstream source, fetches the current upstream version, and sends the comparison to `merge-skill`. Use when the user wants to check upstream changes, decide what to add locally, or watch the attribution verb shift with drift. Triggers on requests like "refresh vendored skills", "check upstream changes", "update from mattpocock", "see what's new upstream", or a `/refresh-vendored` command.
---

# Refresh Vendored Skills

This skill finds every vendored skill. It gets each upstream's current state. It sends the comparison to `merge-skill` for each skill. Run this skill on demand only. Do not run it on a schedule.

This skill runs in a **dedicated git worktree per session**. It never runs directly on `main`. The worktree is created on a `refresh/<date>` branch at the start of the run. All later file edits happen in that worktree. On success, the skill commits and pushes the branch. On a validation failure, the worktree stays dirty for inspection. See CLAUDE.md § Worktree workflow for the mechanics.

Footer format reference: [`../import-skill/references/footer-format.md`](../import-skill/references/footer-format.md). The SHA in the footer is a **last-reviewed checkpoint**, not the original fork commit. It moves forward after every successful refresh, whether the user adopts or skips the changes.

## Prerequisites

- `git` and `gh` CLIs available
- Network access to GitHub
- At least one vendored skill (SKILL.md with a footer matching the canonical format)

## Process

When invoked, create a TodoWrite item for each step.

### 1. Discover vendored skills

```bash
git grep -nE '^_(Adapted from|Inspired by|Originally seeded from) \[' -- '**/SKILL.md' \
  | grep -v '^deprecated/'
```

Note: `deprecated/skills/**` is **excluded** from refresh. Skills you stop using do not need reconciliation.

For each match, parse the footer to extract:
- Local skill directory path
- Upstream `owner/repo`, last-reviewed SHA, upstream skill path (from the `tree/<sha>/<path>` URL)
- Current footer verb

If a footer is malformed, or missing the `/tree/<sha>/` component, flag it and skip it. The user must fix it manually.

Report the discovered list before proceeding.

### 2. Fetch upstream

Group skills by upstream `owner/repo`. For each unique upstream, clone once into a temporary directory:

```bash
tmp=$(mktemp -d)
gh repo clone <owner>/<repo> "$tmp/<repo>" -- --depth=50
```

If the last-reviewed SHA is not in the shallow history, deepen it. Use `fetch --deepen=200` and stop at about 1000 commits. If it still does not resolve, give up and flag it.

### 3. Handle upstream restructure / deletion

For each skill, verify the upstream path still exists at HEAD:

```bash
git -C "$tmp/<repo>" cat-file -e HEAD:<upstream_path>/SKILL.md
```

If it does not:

```bash
git -C "$tmp/<repo>" log --follow --diff-filter=R --oneline -- <upstream_path>/SKILL.md
```

- **Rename candidates found**: show the most likely match, for example `looks like this moved to <new-path> in commit <sha>; confirm?`. If the user confirms it, use the new path for the rest of the refresh. Update the footer URL when `merge-skill` rewrites it.
- **No candidates found (likely deleted upstream)**: give the user two choices.
  - **Keep local as fully forked**: recompute the drift band. Soften the verb, probably to `Originally seeded from`. Keep the link to the upstream's last commit.
  - **Delete local**: run `git rm -r` on the local skill. Remove it from `marketplace.json` and `NOTICES.md`. Remove its bullet from the `## Plugins` section in `README.md`. If no skills remain for that plugin, restore the `_(empty for now)_` suffix on the plugin line.

### 4. Delegate reconciliation to merge-skill

For each vendored skill whose upstream path is resolved or retargeted, run `merge-skill` with these inputs:

- **current** = the local skill directory, for example `productivity/tdd/`
- **incoming** = `<tmp>/<repo>/<upstream_path>/`, the upstream at HEAD
- **incoming-sha** = the upstream HEAD SHA

`merge-skill` does the comparison. It applies three flags: `upstream-new`, `conflict`, and `stale-divergence`. It walks the user through decisions one item at a time. It rewrites the footer. This skill only sends the work to `merge-skill`.

If `merge-skill` reports "no changes," skip that skill. Add one line about it to the final summary.

### 5. NOTICES.md and README.md sync

After all skills are processed:
- If an upstream entry exists in `NOTICES.md`, but no skill in the repo still points to it, remove that entry. This can happen when step 3 deletes a skill.
- If rename detection changes a vendored skill's upstream owner or repo, update the entry. This is rare, and different from a path rename within the same repo.
- Check the `## Plugins` section in `README.md` against the actual skill set. Every `<plugin>/skills/<name>/` directory must have a bullet under its plugin. Remove any stale bullet. Restore the `_(empty for now)_` suffix on any plugin with no skills left.

Propose the edits. Do not apply them automatically.

### 6. Report and commit guidance

Print:
- Per skill: the counts of items adopted, skipped, and adapted, and any footer change, such as a SHA bump or a verb change
- Files modified
- A suggested commit message, for example:
  ```
  refresh: pull updates from mattpocock-skills

  - productivity/grill-me: 2 items adopted, SHA bump
  - productivity/tdd: 1 item adopted; verb re-banded to "Inspired by" (52% drift)
  ```

Leave the `git add` and `git commit` commands to the user.

## Output discipline

- Cite SHA-precise upstream links in every claim.
- Do not commit automatically. Do not rewrite a SKILL.md file without asking first.
- Per-skill review is **semantic, not mechanical**. That work lives in `merge-skill`.

## Edge cases

- **Footer missing or malformed**: flag it, skip it, and ask the user to fix it manually.
- **Last-reviewed SHA cannot be resolved even after deepening to depth 1000**: flag it. Propose the upstream's earliest available commit as a fallback. Later refresh comparisons can overreport changes once, then return to normal.
- **`merge-skill` aborts mid-skill**, for example when a patch fails to apply cleanly. Show the partial state. Skip the remaining skills. Wait for the user to fix the problem. Do not continue without checking first.
- **Multiple vendored skills from the same upstream**: clone the upstream once in step 2. Reuse that temporary directory for all of them.
