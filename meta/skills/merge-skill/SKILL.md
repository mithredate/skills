---
name: merge-skill
description: Use when two versions of one skill must become one, from `import-skill`, `refresh-vendored`, or `/merge-skill`.
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
- **`conflict`** — incoming and current both change the same concept in different ways. The local drift contradicts incoming directly. The local side is a decision that the human made.
- **`stale-divergence`** — current has content that incoming does not have. This content can be an old artifact from an earlier fork. It can also be a deliberate local rule.

### 3. Decide each item

Pick one option for each item. Sort each pick with `productivity:grilling`.

- **adopt** — put the item into `current`.
- **skip** — do not change `current`. This is a deliberate divergence.
- **adapt** — write a custom fix, and apply it to `current`.

Adopt or adapt an `upstream-new` item when it fits the local skill. Skip it when it repeats or contradicts a local rule. Keep the local side of a `conflict` item and a `stale-divergence` item. To find the reason for a local line, read its `git log` and the PR that added it. Record each pick with its reason. Write a brief summary of each item, with its location, for example `SKILL.md § "Process"`. Do not show raw diffs.

### 4. Hold the reversals

Some picks reverse a decision of the human: the incoming side of a `conflict`, or a drop of a `stale-divergence` item. If you recommend such a pick, do not apply it. List it in the report under Open questions, as a question of `productivity:grilling` with the evidence and your recommendation.

### 5. Apply decisions

For each adopted or adapted item, edit the matching file in `current/`. If an edit fails, abort the run and report it.

### 6. Update footer (if applicable)

If the caller gives `incoming-sha`:
1. Compute the post-merge drift by the definition in [`../import-skill/references/footer-format.md`](../import-skill/references/footer-format.md).
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
- the number of accepted, skipped, and adapted items, with a brief title and the reason for each
- the Open questions from step 4
- the files this skill changed
- the new footer line, if the footer changed
- a suggested commit message

The caller commits. When you run this skill on its own, ship the change as the Ship section of `productivity:write-a-skill` says. Put the report in the PR body.

## Edge cases

- If `current` and `incoming` are identical, report "no changes" and exit.
- If `incoming` has no `SKILL.md`, abort with a clear error. A merge needs a valid skill on both sides.
- If the reason for a local line stays unclear after you read its history, keep the local line.
- A single accepted edit can fail to apply cleanly. This can happen when the local file has drifted so far that the diff target text does not exist. If this happens, abort the run, and report the partial state.
- If the agent reads both versions and finds nothing meaningfully different, there are no items to surface. Report this explicitly. Do not skip the report silently.
