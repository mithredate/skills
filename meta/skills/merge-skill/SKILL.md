---
name: merge-skill
description: Reconcile two versions of a skill into one. The skill reads a `current` version and an `incoming` version. The `current` version is your local skill. The `incoming` version can be a fresh upstream, a refreshed upstream, or another local skill. The skill makes a semantic comparison and lists items with three flags. The skill asks the user to decide on each item. The skill applies every accepted change to the `current` version in place. Use when called by `import-skill` on conflict, by `refresh-vendored` for any refresh comparison, or directly with `/merge-skill <current-path> <incoming-path>` to absorb one skill into another.
---

# Merge Skill

This skill is the shared core that reconciles skill versions. `import-skill` delegates to this skill on a naming conflict. `refresh-vendored` delegates to this skill for every refresh. You can also run this skill on its own.

## Inputs

- **current** — the path to your local skill directory. You edit this directory. This skill writes every accepted change into it.
- **incoming** — the path to the skill directory you merge from. It can be a temporary clone, another local skill, or any directory readable as a skill.
- **incoming-sha** (optional) — when incoming is an upstream version with a known commit SHA, give this value. This skill uses it to update the footer's checkpoint SHA after a successful merge.

## Output

- This skill rewrites `current` in place with the accepted changes.
- This skill never edits `incoming`. This skill only reads `incoming`.
- If the caller gives `incoming-sha`, this skill updates the footer in `current/SKILL.md` to that SHA. This skill also recomputes the verb. The verb is `Adapted from`, `Inspired by`, or `Originally seeded from`. This skill picks the verb from the new local drift band.
- This skill prints a summary of accepted, skipped, and adapted items.

## Process

When you start this skill, create one TodoWrite item for each step.

### 1. Read both versions

Read every file under `current/` and `incoming/`. This includes `SKILL.md`, `references/`, and `scripts/`. Treat the skill as one unit.

### 2. Build a semantic comparison

Do not show a git diff. Read both versions. Make a list of items that shows the differences. Each item is one logical unit. Examples are a section, a paragraph, or a script behavior. A skill usually has 3 to 7 items.

Annotate each item with one of three flags:

- **`upstream-new`** — the incoming version has this content, and the current version does not. There is no direct overlap. This item is a candidate for adoption.
- **`conflict`** — incoming and current both change the same concept in different ways. The user's local drift contradicts incoming directly. This item needs the user's judgment.
- **`stale-divergence`** — current has content that incoming does not have. This content can be an old artifact from an earlier fork that the user forgot. This skill flags the item so the user can check it.

### 3. Present the comparison

Show all items in groups by flag. Write a brief summary for each item. Use 1 to 2 sentences. Do not show raw diffs. Give the location of each item, for example `SKILL.md § "Process"` or `references/foo.md`.

### 4. Walk the user through decisions

For each item, ask the user to pick one option:

- **adopt** — put the item into `current`.
- **skip** — do not change `current`. This is a deliberate divergence.
- **adapt** — the user describes a custom fix. Apply that fix to `current`.

Handle one item at a time.

For a `stale-divergence` item, ask a softer question: "this content is only in your local skill. Do you want to keep it, drop it, or adapt it?"

### 5. Apply decisions

For each adopted or adapted item, edit the matching file in `current/`. Show the exact content of each edit to the user before you apply it. Never overwrite a file without the user's approval. If an edit fails, abort the run and report it.

### 6. Update footer (if applicable)

If the caller gives `incoming-sha`:
1. Compute the post-merge drift ratio. This ratio is the number of lines that changed in `current` compared to `incoming`, added up across every skill file.
2. Match the ratio to a verb:
   - Below 30% — use `Adapted from`.
   - 30% to 80% — use `Inspired by`.
   - Above 80% — use `Originally seeded from`.
3. Rewrite the footer in `current/SKILL.md` with the new verb and the new SHA. Keep the license, the copyright, and the source URL path unchanged. Use the format in [`../import-skill/references/footer-format.md`](../import-skill/references/footer-format.md).

If the caller does not give `incoming-sha`, leave the footer as it is. This happens when you merge two local skills.

### 7. Validate

Run the official validator against the plugin that owns `current`. This confirms the merge did not break the skill.

```bash
claude plugin validate <plugin-dir-containing-current>
```

For example, if `current` is `productivity/skills/tdd/`, the plugin directory is `productivity`.

On a validation error, surface the message. Abort the run. Do not say the merge worked. The user must fix the problem before the commit.

### 8. Report

Print:
- the number of accepted, skipped, and adapted items, with a brief title for each
- the files this skill changed
- the new footer line, if the footer changed
- a suggested commit message

Leave the `git add` and `git commit` commands to the user.

## Edge cases

- If `current` and `incoming` are identical, report "no changes" and exit.
- If `incoming` has no `SKILL.md`, abort with a clear error. A merge needs a valid skill on both sides.
- If an item is a conflict and the user's intent is unclear, ask follow-up questions before you classify it. Do not guess.
- A single accepted edit can fail to apply cleanly. This can happen when the local file has drifted so far that the diff target text does not exist. If this happens, abort the run, surface the partial state, and let the user resolve it manually.
- If the agent reads both versions and finds nothing meaningfully different, there are no items to surface. Report this explicitly. Do not skip the report silently.
