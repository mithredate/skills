---
name: import-skill
description: Use when the user wants to vendor a skill from a GitHub repo, such as mattpocock-skills or superpowers, into this marketplace.
---

# Import Skill

This skill vendors a skill from a GitHub upstream. It gathers inputs, picks a target, and forks to one of two paths:
- In a **fresh import**, no concept conflict exists. The skill copies the files, writes the footer, registers the skill in `marketplace.json` and `NOTICES.md`, and bumps the plugin version.
- In a **conflict**, a local skill of the same concept already exists. The skill delegates to [`merge-skill`](../merge-skill/SKILL.md) to reconcile the incoming skill into the existing skill. It never creates a parallel skill.

This skill pairs with [`refresh-vendored`](../refresh-vendored/SKILL.md). All three skills share the canonical footer format in [`references/footer-format.md`](references/footer-format.md).

This skill runs in a **dedicated git worktree per session**. It never runs directly on `main`. The worktree is created after Step 4, when the target name is resolved. All later file edits happen in the worktree. On success, the skill commits and pushes the branch. On a validation failure, the worktree stays dirty for inspection. See AGENTS.md, section Worktree workflow, for the details.

First actions: call the Skill tool with `productivity:settle-decisions`. Record each decision you make in the PR body.

## Process

Create a TodoWrite item per step when invoked.

### 1. Gather inputs

Get two items from the request.
1. The **upstream repo**, in `<owner>/<repo>` form, for example `mattpocock/skills`.
2. The **upstream path** inside that repo, for example `skills/productivity/grill-me`.

If the request is vague, for example "vendor grill-me from mattpocock," find the skill. Run `gh search code`. You can also clone the repo and run `find … -name SKILL.md`. If the request names no skill, ask the user which skill to import.

Write a **README one-liner**, a short description for the entry in the top-level `README.md` plugin list. Base it on the upstream's `SKILL.md` frontmatter. Keep it under 80 characters. Match the existing terse style, for example `vendor a new skill from a GitHub upstream`.

### 2. Verify the upstream path

```bash
tmp=$(mktemp -d)
gh repo clone <owner>/<repo> "$tmp/<repo>" -- --depth=1
```

Confirm `<tmp>/<repo>/<upstream_path>/SKILL.md` exists. If it does not exist, search the repo for the skill as in Step 1. If no match exists, stop and report it.

### 3. Pick target plugin

Pick a plugin based on the nature of the skill:
- A process skill fits `productivity`.
- A tool skill fits `dev`.
- A skill for repo maintenance fits `meta`.
- A skill that is unclear or still changing fits `in-progress`.

`deprecated` is not a valid import target.

### 4. Resolve target name — fresh import or merge?

Use the upstream skill's directory name as the default, for example `grill-me`. The naming rule is **verb-first hyphenated**. Do not try to improve the upstream name. The user can override the name.

Check `<target_plugin>/skills/<name>/` for the target name.
- **No conflict.** Go to the **Fresh import** path, Steps 5 to 10.
- **Conflict.** A skill with that name already exists. It can come from a different upstream. Merge into the existing skill. Go to the **Merge path**, Step 11. Do not make a renamed parallel variant. The duplicate-skills policy forbids two forks of the same concept side by side.

### 5. Capture upstream metadata (fresh import path)

```bash
git -C "$tmp/<repo>" rev-parse HEAD                # checkpoint SHA
head -20 "$tmp/<repo>/LICENSE"                     # license + copyright
```

Parse the **license**, for example `MIT` or `Apache-2.0`, and the **copyright**, for example `© 2026 Matt Pocock`. If the upstream root has no `LICENSE` file, look for the license in the README and the package manifest. If no license shows, stop and report it. Without a license, this repo cannot vendor the skill.

### 6. Run the import script (fresh import path)

```bash
node meta/skills/import-skill/scripts/import.mjs \
  --upstream <owner>/<repo> \
  --upstream-path <upstream_path> \
  --upstream-sha <sha> \
  --license <license> \
  --copyright '<copyright>' \
  --target-plugin <target_plugin> \
  --target-name <target_name>
```

If the script exits with a non-zero code, show the error and stop.

### 7. Update README.md (fresh import path)

The import script does **not** touch `README.md`. Add the entry by hand, using the one-liner from Step 1:

- Locate the `- **<target_plugin>** — …` line in the `## Plugins` section.
- If the line ends with `_(empty for now)_`, remove that suffix.
- Insert a new indented bullet directly under it:

  ```
    - `<target_name>` — <readme one-liner>
  ```

Keep the order of skills in a plugin section stable. Add the new bullet at the end of that group.

### 8. Structural review (fresh import path)

The script copies upstream files exactly, in the layout the upstream author used. This keeps the imported skill an exact mirror of upstream, so any later edit is clearly your own drift. But the layout does not always match local conventions.

Check the newly imported skill directory. Fix each structural mismatch. Here are common cases:

- **Doc files next to `SKILL.md`**, such as `REFERENCE.md`, `EXAMPLES.md`, or `FORMS.md`. Move them into `references/`. Local convention puts doc files in `references/`, not at the skill root.
- **Loose scripts at the skill root**. Move them into `scripts/`.
- **Asset files**, such as `.png`, `.svg`, or templates. Move them into `assets/`.
- **An unusual order in the `SKILL.md` body**, such as a missing `## When to use` section. Flag this in the PR body only. Do not rewrite the content yourself.

If you moved a file, update the matching link in `SKILL.md`. For example, change `[REFERENCE.md](REFERENCE.md)` to `[references/REFERENCE.md](references/REFERENCE.md)`.

If nothing moves, the skill stays an exact mirror of upstream. This is fine.

### 9. Validate (fresh import path)

Run the official validator on the target plugin. This confirms that the newly imported skill, with any restructuring, is well-formed:

```bash
claude plugin validate <target_plugin>
```

If validation shows an error, show the message and stop. Do not report the import as successful. The user must fix the problem, usually in the footer or the frontmatter, before committing.

### 10. Commit and report (fresh import path)

Commit in the worktree with a message in this form:

```
vendor: import productivity/grill-me from mattpocock-skills
```

Push the branch. Open the PR with the body shape from `write-a-skill`. Show the files you created and the files you changed.

Tell the user that the installed copy changes only after the PR merges. The marketplace clone auto-updates. Then this command fetches the new plugin version:

```bash
claude plugin update <target_plugin>@skills
```

### 11. Merge path: delegate to merge-skill

Follow these steps when Step 4 finds a conflict.

1. Find the upstream SHA: `git -C "$tmp/<repo>" rev-parse HEAD`.
2. Call [`merge-skill`](../merge-skill/SKILL.md) with these values:
   - **current** = the existing local skill directory (`<target_plugin>/skills/<target_name>/`)
   - **incoming** = `<tmp>/<repo>/<upstream_path>/`
   - **incoming-sha** = the upstream HEAD SHA from step 1
3. `merge-skill` handles the comparison, the decisions, the file edits, and the footer rewrite. This skill's work ends here. Show its output exactly as it is.
4. Check the existing local skill's footer. If it points to a *different* upstream than the one you are merging in, keep the existing footer's upstream as the primary source. Name the merged-in source as an extra contributor in `NOTICES.md`.

After `merge-skill` returns, bump the patch version in `<target_plugin>/.claude-plugin/plugin.json` by hand. The script in Step 6 does not run on this path. Then commit, push, and open the PR as in Step 10, with a message like this:

```
merge: absorb superpowers/tdd into productivity/tdd
```

## Edge cases

- **Upstream private or gated.** `gh repo clone` asks for authentication. Show any error to the user.
- **No `LICENSE` at the upstream root.** Look for the license as Step 5 says. Stop when no license shows.
- **Target plugin not registered in `marketplace.json`.** Stop with an error. Tell the user to register the plugin first.
- **Upstream directory holds nested skill directories.** The fresh import path copies only the top-level `SKILL.md` and its sibling files, such as `references/` and `scripts/`. The merge path compares only these same files. Neither path recurses into a nested skill.
- **Upstream skill has no `SKILL.md`.** Check for this in Step 2. Refuse to continue.
- **Merge path with a non-vendored local skill.** The existing skill is fully authored by the user and has no footer. Merge it anyway. `merge-skill`'s Step 6 adds the footer, because `incoming-sha` is provided.
