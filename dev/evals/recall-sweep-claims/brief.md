PR title: feat(settle-decisions, sweep, sup, orchestrate): check each claim from a source before the human sees it

## Brief

- Why: In `orchestrate` and `prep` sessions, Mehrdad does not read the PRs, issues, tickets, or threads. The agent reads them, but its messages still assume that he did. Evidence: an `orchestrate` session of 2026-10-20 ended with "Accept the other engineer's option A?", "a risk you weigh", and a sweep row that repeats a file count from a comment with no check. The sweep row comes from `sweep`, which writes what a link says now with no check. `orchestrate` then puts the sweep table in the final message.
- Goal: Each claim from a source gets a check, and each choice of another person gets a decision, before Mehrdad sees it. `sweep` writes only the states that a link owns, and gives each claim to `settle-decisions` in the main session. `sup` shows how many claims wait in each map, not the claims.
- Targets: `mithredate-skills`, base branch `main`. Continue on the branch `feat/verify-source-claims` in `/Users/mehrdad.hedayati/projects/mithredate-skills/.worktrees/feat/verify-source-claims`, head `691a9a7`. Its three commits already hold the `settle-decisions` and `orchestrate` part.
- Decisions:
  - Decided: the check rule goes in `productivity/skills/settle-decisions/SKILL.md`. Because: Mehrdad named this skill as his process, and `work-like-mehrdad`, `orchestrate`, and `prep` load it first.
  - Decided: `orchestrate` types the review of another person's choice as a `decision` ticket, not a `gate`. Because: a gate ticket ("Mehrdad reviews the pick") kept the agent's finished review waiting for Mehrdad.
  - Decided: `sweep` tells an update from a claim. An update is a state that the host owns, for example a PR merge, a review, CI, a ticket status, or the date and author of a new comment. A claim is a statement in a link about something that the host does not own, for example the code, a count, or a plan. `sweep` writes each update, and gives each claim to the caller. Because: Mehrdad's answer of 2026-10-20. Also, three Sonnet replays with the `settle-decisions` rule alone still printed the claim in the sweep row.
  - Decided: `sweep` stays in the main session, not an agent. Because: in that session the link reads were about 25K tokens of a 303K-token session, and an agent costs about 100K tokens to start. Revisit if: `sup` over many maps fills the context.
  - Decided: `sup` stays read-only. It shows the number of claims for each map, and proposes `orchestrate` for that map. Because: `sup` never writes, so it cannot settle a claim. A printed claim is an unchecked claim.
  - Decided: no change to `work-like-mehrdad` or `prep`.
  - Decided: the replay of the old message is dropped as a check. Because: the old message already holds the sweep row, so the replay cannot test `sweep`. Hypothesis: the final message of the next `orchestrate` cook of the live map holds no claim in its sweep table, and each claim comes back as a checked fact or a decision. Check: that message, at the next cook.
- FR:
  - `settle-decisions` keeps the branch text, and adds that a risk is a decision too. The human gets no claim, conflict, or risk to weigh. The check applies before the agent uses or reports a claim from a source.
  - `sweep` defines **update** and **claim** once, in bold. The "Now" column of the result table holds only an update.
  - In write mode, `sweep` writes each update to its place. It gives each claim, with its link, to the caller. The caller sorts each claim with `productivity:settle-decisions`.
  - In report mode, `sweep` prints the updates and the number of claims for each map. It prints no claim.
  - `sup` prints the number of claims for each map. Its Propose step proposes `orchestrate` for a map that has claims. `sup` prints no claim.
  - `productivity/.claude-plugin/plugin.json` keeps the version `0.1.20`. The branch already bumped it.
- NFR:
  - Edit only these files: `productivity/skills/settle-decisions/SKILL.md`, `productivity/skills/orchestrate/SKILL.md`, `productivity/skills/sweep/SKILL.md`, `productivity/skills/sup/SKILL.md`, and `productivity/.claude-plugin/plugin.json`. Do not change the repo that holds the live map.
  - No new agent, no new file, no new section where an existing section can hold the rule.
  - A skill body holds rules only. The reasons and the evidence go in the PR body.
  - Write in STE by `productivity:write-ste`. The `description` lines stay the same.
- Verification:
  1. `./scripts/validate.sh` exits 0.
  2. `jq -r .version productivity/.claude-plugin/plugin.json` prints `0.1.20`.
  3. Run `sweep` in report mode on the live map, read-only. Start a fresh Sonnet session with `claude -p --model sonnet` in the repo that holds the live map. Allow only `Read`, `Grep`, `Bash(gh pr view:*)`, `Bash(git log:*)`, and the read tools of the Atlassian MCP. Tell it to follow the new `sweep/SKILL.md` and `settle-decisions/SKILL.md` from the branch, in report mode, for that map. The check passes when these conditions hold:
     - Each "Now" cell holds an update only.
     - The output gives the number of claims for the map.
     - The output prints no claim text.
     - `git status --porcelain` in that repo is empty after the run.
