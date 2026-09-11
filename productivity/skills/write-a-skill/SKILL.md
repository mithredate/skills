---
name: write-a-skill
description: Writes or rewrites a skill, an agent file, or a reference in this marketplace, from the name and the outline to the PR. Use when the user asks for a new skill, a rename, a rewrite, or an edit to a SKILL.md, an agent file, or a reference. Use it also when another skill needs the skill-writing rules.
---

# Write a skill

Call the Skill tool with `productivity:write-ste` first. Every file you write here follows its rules.

## Before you write

1. If the skill exists, read every file in its directory. Grep the repo for the skill's name. The hits are its callers: other skills, agent files, the README, and the marketplace manifest. Every caller changes with the skill.
2. Choose the invocation. Read [references/invocation.md](references/invocation.md). A skill that other skills call, or that the agent must reach on its own, is model-invoked. A skill that only the human types is user-invoked.
3. Propose the name. A name is verb-first and hyphenated, and one word when one word says it. Offer two or three names, the recommended one first. A flow verb extends the kitchen frame: `cook` works a ticket, `fire` runs the brief.
4. Propose the frontmatter and the headings. Wait for the user to agree. Write no body before that.

## Shape

- `SKILL.md` holds the steps that every run takes, in order. Each step ends with the condition that tells the agent the step is done.
- Prose that only some runs need goes in `references/`. One sentence in `SKILL.md` names the file and says when to read it.
- An executable goes in `scripts/`.
- One rule lives in one place. When the rule belongs to another skill, call the Skill tool with that skill. Do not restate it.
- A vendored skill stays as it is. New behaviour goes in a thin skill that calls it.
- Do not write a line that the agent can find with `ls`, with `--help`, or in a config file. Write the convention, the reason, and the trap that the environment does not show.
- Delete a sentence that the agent obeys without it.
- State the target behaviour. A ban makes the banned behaviour more available, so write a ban only as a guardrail next to the target.
- Introduce a **defined term** once, in bold, with a one-sentence definition. Then use the word alone. A word the model already knows, such as "ledger" or "brief", carries its meaning for free. Prefer it to a new coinage.
- Keep the file short. Attention thins over a long file, and every line is one more to keep true.

## Frontmatter

- `name` is the directory name.
- `description`: the first sentence states what the skill does, in the third person. The second sentence starts with "Use when" and lists each distinct trigger once. The value has 1,536 characters maximum.
- A colon followed by a space inside the value breaks the YAML, unless the whole value is in double quotes. The skill then loads with no metadata. Only CI catches this, so check it by eye.
- A user-invoked skill sets `disable-model-invocation: true` and an `argument-hint`. Its description is a one-line summary for the human.
- Check the field list against https://code.claude.com/docs/en/skills before you ship. The spec changes.

## Agent files

- An agent file lives at `<plugin>/agents/<name>.md`. It holds one role.
- The frontmatter holds `name`, `description`, `tools` as an allowlist, `model`, and `maxTurns`. The description names the skills that spawn the agent.
- The body ends with the exact JSON that the agent returns. A caller that uses the Workflow tool copies that JSON as its schema.
- A caller spawns the agent as `<plugin>:<name>`. A session registers plugin agents at its start, so a new agent resolves only in a session started after the plugin update.

## Check before the PR

1. Run the `write-ste` check list on every changed file.
2. Check every changed description for a colon followed by a space.
3. Run `scripts/validate.sh` from the repository root.
4. If the skill starts agents or runs a script, run it once against a throwaway repo. Put the result in the PR body under Verified.
5. For a rewrite of an existing skill in STE: keep every heading, link, code block, file name and path. Keep every rule. Keep the line count within 20 percent of the original. List an ambiguity you find under "Open questions" in the PR body. Do not resolve it.

## Ship

- Work in `.worktrees/<branch>` off `origin/main`. One skill per PR. Stack a dependent skill as a second PR on the first branch.
- Update the marketplace manifest, the README plugin list, and every caller from step 1.
- A vendored skill keeps its footer. Recompute the verb from the drift band by [../../../meta/skills/import-skill/references/footer-format.md](../../../meta/skills/import-skill/references/footer-format.md). The SHA changes only on a refresh.
- Use conventional commits. Open the PR body with Why, then What, Verified, and Links.

---
_Originally seeded from [mattpocock/skills/skills/productivity/writing-for-agents](https://github.com/mattpocock/skills/tree/6654f6b60cd9d5be8b54c6fafe44346dabeb3b76/skills/productivity/writing-for-agents) — MIT © 2026 Matt Pocock._
