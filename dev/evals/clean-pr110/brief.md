PR title: fix(guard-worktree, review-pr): make worktrees work in the sandbox

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
