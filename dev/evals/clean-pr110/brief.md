PR title: fix(guard-worktree, review-pr): make worktrees work in the sandbox

## Why

In a session sandboxed by `guard-infra/sandbox.json`, git cannot write `.git/config` in a repo under `~/projects`. Two worktree commands that agents get from this repo write branch tracking there, so they fail:

- `git worktree add .worktrees/<branch> -b <branch> origin/main` is the command that `guard-worktree` names. It exits 255, leaves a stray branch, and makes no worktree. A session hit this on 2026-10-28 for `feat/watch-discussions`.
- `gh pr checkout <n>` is the command that `review-pr` names for the verifier worktree. It exits 1.

## What

- Both `guard-worktree` refusals name `git worktree add --no-track …`. A branch with no upstream is also correct outside the sandbox. A feature branch that tracks `origin/main` makes a plain `git push` fail under `push.default=simple`.
- `review-pr` says what the verifier needs, a checkout of the PR head in `.worktrees/review-<n>`, and no longer names a command. The session can check out a PR head by itself.
- The `guard-worktree` hook fetches with `--no-write-fetch-head`. Before, its fetch before each `worktree add` rewrote `FETCH_HEAD`. An agent that fetched a PR in one Bash call and added the worktree from `FETCH_HEAD` in the next got a branch tip, with exit 0. That silent trap was the only reason the skill named a command. `gh pr checkout` still fails in the sandbox, but it fails loudly, and the session picks another way.
- Version bumps: `guard-worktree` 0.1.2 to 0.1.3, and `dev` 0.1.15 to 0.1.16.

Decisions:

- Decided: a clone into `~/projects` stays a `! git clone …` hand-off to the user. Because: the user said cloning is fine if worktrees work. Revisit if: clones get frequent.
- Decided: keep `~/projects/**/.git/hooks` and `~/projects/**/.git/config` in `denyWrite`. Because: a hook or a config value that a sandboxed call writes runs outside the sandbox at the next commit by the user. Revisit if: Claude Code can deny writes to existing paths only.
- Decided: no `excludedCommands` entry for `git clone`. Because: the [sandbox docs](https://code.claude.com/docs/en/sandboxing) say an entry does not cover a clone to an absolute path, a `~` path, or a `..` path. Revisit if: the docs change.
- Decided: no new `guard-worktree` rule that refuses a `worktree add` with tracking. Hypothesis: with the new refusal text, no session gets "remote tracking information" from `git worktree add`. Check: scan the transcripts on 2026-11-11.
- Decided: `review-pr` names the outcome, not the checkout commands. Because: the user said the session can work out the commands, and `write-a-skill` says to delete a sentence that the agent obeys without it. The fix for the root cause of the one silent trap is in the hook. Revisit if: review sessions often spend calls on a failed checkout.

## Verified

Each check ran in a session sandboxed by `guard-infra/sandbox.json`.

Before the fix:

- `git worktree add -b x .worktrees/x origin/main` exits 255. The branch stays and no worktree exists.
- `gh pr checkout 107 -b probe/review-107` in a worktree exits 1. HEAD does not move.

After the fix, on `8ce9cab` unless a line names another commit:

- `./scripts/validate.sh` exits 0. It skips the mod type check in the sandbox.
- `command claude plugin test guard-worktree` exits 0 with 17 passes. The first commit holds only the test change. On that commit, 3 tests fail.
- `npx --yes -p typescript@7.0.2 tsc -p guard-worktree`, with the types laid by hand, exits 0.
- The command of the edit refusal, with `<branch>` set to `probe/brief-check`, exits 0 and makes the worktree.
- The start-point refusal, applied to `git worktree add .worktrees/probe/brief-check2 -b probe/brief-check2 main`, gives a command that exits 0.
- `git fetch origin pull/<n>/head` and `git worktree add --detach .worktrees/review-107 FETCH_HEAD` for PR 107 exit 0 in the sandbox, and the worktree is on the PR head `dcf1ac5`.
- After `git fetch origin pull/107/head`, the new hook fetch `git fetch origin --quiet --no-write-fetch-head` leaves `FETCH_HEAD` at `dcf1ac5`. The old hook fetch moves it to `c667b92`.
- `command claude plugin test guard-worktree` exits 0 with 18 passes on `4aece30`. The new test for `--no-write-fetch-head` failed before the fix.

After `main` was merged in, on `57cb853`:

- `command claude plugin test guard-worktree` exits 0 with 19 passes. The new test "lets the command of the edit refusal through" fails when `--no-track` is in `VALUE_FLAGS`, so the hook would refuse the command that it names.
- `./scripts/validate.sh` exits 0, and `tsc -p guard-worktree` with the types laid by hand exits 0.
- `dev` is at 0.1.16. `main` took 0.1.15 for the `pr-reviewer` change, so 0.1.15 would not reach an installer of that version.

Review nit that this PR does not fix:

- The start-point refusal asks for `--no-track` also when the command already has it.

## Links

- [Claude Code sandboxing docs](https://code.claude.com/docs/en/sandboxing)

<details><summary>Brief</summary>

## Brief

- Why: In a session sandboxed by `guard-infra/sandbox.json`, git cannot write `.git/config` in a repo under `~/projects`. Two worktree commands that agents get from this repo write branch tracking there, so they fail. On 2026-10-28 a session ran the `guard-worktree` command for `feat/watch-discussions` and got exit 255, a stray branch, and no worktree.
- Goal: An agent that follows `guard-worktree` or `review-pr` gets a worktree on the first try in a sandboxed session. The sandbox config does not change.
- Targets: `mithredate/skills` at `~/projects/mithredate-skills`, base branch `main`.
- Decisions:
  - A clone into `~/projects` stays a `! git clone …` hand-off to the user. The user decided this in the prep session.
  - Keep `~/projects/**/.git/hooks` and `~/projects/**/.git/config` in `denyWrite`. A hook or a config value that a sandboxed call writes runs outside the sandbox at the next commit by the user.
  - A new worktree branch has no upstream. Use `--no-track`. Tracking `origin/main` is also wrong for a feature branch outside the sandbox, because `git push` with `push.default=simple` refuses a branch whose upstream has another name.
  - The review worktree is detached at `refs/pull/<n>/head`. `gh pr checkout` writes branch tracking, so it exits 1 in the sandbox. The pull ref also covers a PR from a fork. The verifier never edits, so it needs no branch.
  - `guard-worktree` gets no new rule that refuses a `worktree add` with tracking. Hypothesis: with the new refusal text, no session gets "remote tracking information" from `git worktree add`. Check: scan the transcripts on 2026-11-11.
  - `git push -u` and `git branch -D` stay as they are. In the sandbox they print a config warning and exit 0.
  - The branch step of `dev:fire` stays as it is. It follows the worktree rules of the repo.
- FR:
  - When `guard-worktree` refuses an edit in the main checkout, the command that it names exits 0 in a sandboxed session. The command makes `.worktrees/<branch>` on a new branch from the fetched `origin/<default>`.
  - When `guard-worktree` refuses a start point that is not `origin/…`, the command form that it names exits 0 in a sandboxed session.
  - `review-pr` names commands that make `.worktrees/review-<n>` and exit 0 in a sandboxed session. This applies to a PR from the same repo and to a PR from a fork.
  - The `guard-worktree` tests fail if a refusal does not name `--no-track`.
- NFR:
  - `guard-infra/sandbox.json` does not change.
  - No new dependency.
  - The parser and the start-point check of `guard-worktree` keep their behavior.
- Verification:
  1. `./scripts/validate.sh` exits 0. In the sandbox, it skips the mod type check and deletes `guard-worktree/.claude-plugin/types/`. After it, type-check `guard-worktree` by hand with the steps in `/Users/mehrdad.hedayati/.claude/projects/-Users-mehrdad-hedayati-projects-mithredate-skills/memory/mod-typecheck-in-sandbox.md`.
  2. The running session loads the old mod. Copy the command from the new edit refusal text. Set `<branch>` to `probe/brief-check`, and run it in a sandboxed session. It exits 0, and `git worktree list` shows `.worktrees/probe/brief-check`. Then run `git worktree remove .worktrees/probe/brief-check` and `git branch -D probe/brief-check`.
  3. Run the new `review-pr` commands with `<n>` set to 107, the PR `feat/flag-weakened-tests`, in a sandboxed session. They exit 0. `git -C .worktrees/review-107 rev-parse HEAD` prints the same SHA as `gh pr view 107 --json headRefOid -q .headRefOid`. Then remove the worktree.

</details>

🤖 Generated with [Claude Code](https://claude.com/claude-code)


