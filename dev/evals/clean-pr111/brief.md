PR title: feat(productivity): remind to load write-a-skill when a skill or agent file changes

## Brief

- Why: Nothing loads `productivity:write-a-skill` when an agent changes a skill. On 2026-10-28 a `fire` implementer edited `dev/skills/review-pr/SKILL.md` without it, and wrote git commands that the session can work out by itself. AGENTS.md says a Skill call that depends on a fact found later gets a hook on the event that shows the fact.
- Goal: Each session and each subagent that changes a skill file or an agent file of this marketplace gets a reminder to load `write-a-skill`. A change through a file tool gets it at once. A change through Bash gets it when the change is committed.
- Targets: `mithredate/skills` at `~/projects/mithredate-skills`, base branch `main`.
- Decisions:
  - A hook in the `productivity` plugin, next to `productivity/hooks/load-fire-on-brief.mjs`. Its reminder goes in as `additionalContext` after the tool call, as that hook does.
  - A skill file is any file under `<plugin>/skills/<skill>/`. An agent file is `<plugin>/agents/<name>.md`.
  - The hook acts only in a repo that holds `productivity/skills/write-a-skill/SKILL.md`.
  - The hook keeps no once-per-session state. The reminder is conditional, so a repeated reminder is harmless.
  - The user decided: a Bash call is checked only when it commits. A walk of the skill files on each Bash call costs too much. A git pre-commit hook is not used, because the sandbox blocks its install, and a tracked hook script that an agent edits runs outside the sandbox at the user's next commit.
  - The Bash entries in `hooks.json` set `"if": "Bash(git *)"`. Claude Code then starts the hook only for a Bash call with a git subcommand, also in a compound command. The PreToolUse hook goes away.
  - On a Bash call whose command has the word `commit`, one `git log --all --since=<start> --name-only --format=` in the repo of the cwd lists the files of the new commits. `--all` covers every worktree. The start is the current time, minus `duration_ms` of the hook input, minus 2 seconds. The margin covers the time between the end of the call and the start of the hook. Without `duration_ms`, the start is the current time minus 2 seconds.
- FR:
  - The reminder text is: "A skill or agent file of this marketplace changed. If `productivity:write-a-skill` is not loaded, call the Skill tool with it before your next tool call. Then check each changed file against it."
  - An Edit, Write, MultiEdit, or NotebookEdit call that changes a skill file or an agent file gets the reminder. This applies to `SKILL.md`, a file in `references/`, a file in `scripts/`, and any other file in the skill folder.
  - A Bash call that commits a change to a skill file or an agent file gets the reminder. This includes a command that changes the file and commits it in one call, `git -C <dir> commit`, `git -c <key>=<value> commit`, and a commit in another worktree of the repo. It also applies when the command fails after the commit.
  - A Bash call that changes a skill file and does not commit it gets no reminder.
  - A commit that holds no skill file and no agent file gets no reminder.
  - A change to any other file gets no reminder, for example `README.md`, `.claude-plugin/marketplace.json`, or `guard-worktree/hooks/register.ts`.
  - A change in a repo without `productivity/skills/write-a-skill/SKILL.md` gets no reminder.
  - A call inside a subagent gets the same reminder as a call in the main session.
- NFR:
  - No new dependency. Node standard library and `git` only.
  - The hook never blocks or fails a tool call. If it hits an error, or the directory is not a git repo, it prints nothing and exits 0.
  - Claude Code starts no hook process for a Bash call without a git subcommand.
  - The hook adds less than 50 ms to a Bash call that commits, and to an Edit call.
  - `load-fire-on-brief` keeps its behavior.
- Verification:
  1. `./scripts/validate.sh` exits 0. It runs `node --test */hooks/*.test.mjs`, so each FR case has a test there, in a temporary git repo.
  2. In a sandboxed session, clone this repo to `$TMPDIR` with `git clone -q --depth 1 file:///Users/mehrdad.hedayati/projects/mithredate-skills "$TMPDIR/wask-check"`. Run each Bash command below in the clone and time it. Then feed the hook the PostToolUse input JSON of that call, with real paths in the clone and the measured `duration_ms`. Run the cases in this order, and report the output of each.
     - An Edit of `dev/skills/review-pr/SKILL.md` gives the reminder.
     - An Edit of `README.md` gives nothing.
     - A Bash call `echo x >> README.md && git -c user.email=a@b -c user.name=a commit -qam x` gives nothing.
     - A Bash call `echo x >> dev/skills/tdd/SKILL.md` gives nothing.
     - A Bash call `echo x >> dev/skills/tdd/references/mocking.md && git -c user.email=a@b -c user.name=a commit -qam x` gives the reminder.
     - A Bash call `cat dev/skills/tdd/SKILL.md` gives nothing.
  3. Time the hook for a commit call and for an Edit call in the clone, 20 times each. Report the means.
  4. Then delete `$TMPDIR/wask-check`.
