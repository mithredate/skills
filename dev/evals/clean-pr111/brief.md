PR title: feat(productivity): remind to load write-a-skill when a skill or agent file changes

## Why

Nothing loads `productivity:write-a-skill` when an agent changes a skill. On 2026-10-28 a `fire` implementer edited `dev/skills/review-pr/SKILL.md` without it, and wrote git commands into the skill that the session can work out by itself. `write-a-skill` already says "Delete a sentence that the agent obeys without it". The gap is that nothing loads it. AGENTS.md says a Skill call that depends on a fact found later gets a hook on the event that shows the fact.

## What

- The new hook `productivity/hooks/load-write-a-skill-on-skill-change.mjs` adds a reminder after the tool call. The reminder tells the agent to load `write-a-skill` if it is not loaded, and to check each changed file against it.
  - An Edit, Write, MultiEdit, or NotebookEdit call on a skill file or an agent file gets the reminder. A skill file is any file under `<plugin>/skills/<skill>/`, so `references/` and `scripts/` count. An agent file is `<plugin>/agents/<name>.md`.
  - A Bash call that commits a skill file or an agent file gets the reminder. `hooks.json` sets `"if": "Bash(git *)"`, so Claude Code starts no hook for a Bash call without a git subcommand. On a command with the word `commit`, one `git log --all --since=<call start>` lists the files of the new commits in every worktree.
- The hook acts only in a repo that holds `productivity/skills/write-a-skill/SKILL.md`.
- Version bump: `productivity` 0.1.20 to 0.1.21.

Decisions:

- Decided: check a Bash call only when it commits. Because: the first design compared a snapshot of every skill file before and after each Bash call. It cost 166 ms per Bash call over 10 worktrees, inside and outside the sandbox, and the user rejected any walk on each Bash call. Revisit if: a skill change made through Bash reaches a PR and no session got the reminder.
- Decided: no git pre-commit hook. Because: the sandbox denies writes to `.git/hooks` and `.git/config`, so each clone needs an install by hand. A tracked hook script that a sandboxed agent edits runs outside the sandbox at the user's next commit. Revisit if: Claude Code can run a git hook inside the sandbox.
- Decided: the window starts at the call start minus 2 seconds. Because: `duration_ms` leaves out the time between the end of the call and the start of the hook. Without `duration_ms`, the 2 seconds still cover a commit at the end of the command. Revisit if: a commit at the end of a call gets no reminder.
- Decided: no once-per-session state. Because: the reminder is conditional, so a repeated reminder is harmless. Revisit if: agents start to ignore the reminder because it repeats.
- Decided: rely on the `if` field and on `duration_ms` as the [hooks docs](https://code.claude.com/docs/en/hooks) describe them. Hypothesis: in a session started after the plugin update, a Bash call with no git subcommand starts no hook process, and a Bash commit of a skill file gets the reminder. Check: in the first session after the update, commit a skill change through Bash and look for the reminder.

Limits:

- A Bash call is checked only in the repo of its cwd. A `git -C <marketplace> commit` from another repo gets no reminder.
- A commit that another process makes during the call also gets the reminder.
- A skill change made through Bash that nobody commits gets no reminder.
- A merge commit lists no files, so a skill change that lands only in a merge commit gets no reminder.
- With rename detection, a skill folder moved out of `skills/` lists only its new paths, so it gets no reminder.

## Verified

Each check ran in a session sandboxed by `guard-infra/sandbox.json`, on `ea9c11c`. The branch was then rebased on `4163680` (#108), which changes no file of this PR.

- `./scripts/validate.sh` exits 0, and 34 node tests pass, on `ea9c11c` and again on the rebased head. It skips the mod type check in the sandbox. This PR changes no mod.
- The tests run each FR case in a temporary git repo. Each silent commit test checks that its commit landed. One test reads `hooks.json` and checks that each Bash handler of the hook has `"if": "Bash(git *)"`, and that no PreToolUse entry runs it.
- Each new check fails on a broken change: a mistyped pathspec in a silent commit test, an `if` deleted from `hooks.json`, and a PreToolUse entry added to `hooks.json`.
- Clone checks in `$TMPDIR/wask-check`, with the hook fed the PostToolUse input of each call and its measured `duration_ms`:
  - An Edit of `dev/skills/review-pr/SKILL.md` gives the reminder.
  - An Edit of `README.md` gives nothing.
  - `echo x >> README.md && git -c … commit -qam x` gives nothing.
  - `echo x >> dev/skills/tdd/SKILL.md` gives nothing.
  - `echo x >> dev/skills/tdd/references/mocking.md && git -c … commit -qam x` gives the reminder.
  - `cat dev/skills/tdd/SKILL.md` gives nothing.
- The hook takes 42 ms for a commit call and 26 ms for an Edit call, as a mean over 20 runs.

Review nits that this PR does not fix:

- One long line in the hook runs git and matches the paths.
- The stdin read sits outside the `try` block, as in `load-fire-on-brief.mjs`.
- The `hooks.json` test finds Bash entries by the word `Bash` in the matcher. An entry with the matcher `*` and no `if` would pass it. The file has no such entry.

## Links

- [Claude Code hooks docs](https://code.claude.com/docs/en/hooks)

<details><summary>Brief</summary>

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

</details>

🤖 Generated with [Claude Code](https://claude.com/claude-code)

