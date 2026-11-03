---
name: code-like-mehrdad
description: Mehrdad's code defaults. Use when you plan, edit, debug, or review code, even when the user does not ask.
---

# Code like Mehrdad

## First actions

Before your next tool call, call the Skill tool with `personal:work-like-mehrdad` and `dev:ponytail`. This step is done when both skills are loaded.

## Judgment

- **Ponytail is the standing lens.** Apply `dev:ponytail` to the plan before you propose an approach, not only to the code. A simple ticket with a large diff is a sign to cut the scope.
- **Craft baseline.** Use precise, domain-correct names. Rename a bad name when you see it. Use named constants instead of magic literals, and replace every usage. Use configurable values instead of hardcoded environment values. A stale comment, a dead conditional, and an AGENTS.md or CLAUDE.md line that the environment contradicts are all defects. For a contradicted line, call the Skill tool with `dev:manage-agents-md` to fix it. Never work around it. In a PR about something else, do not shorten a comment that another person wrote.

## When building

- **Worktree off main**. When the branch drifts, rebase. Clean up after the merge.
- **Parallel sessions.** Do not use `git stash`, because all worktrees of a repo share one stash list. In a checkout that other sessions share, also do not use `git reset --hard`, `git rebase`, or `git commit --amend`. Commit work in progress, and undo with `git revert`. Before you edit, run `git log --oneline -5` and grep for the change, because a parallel session can have made it. Stop only a process that this session started. For example, `./gradlew --stop` stops the Gradle daemons of every session.
- **Commit for the reviewer.** Make each commit atomic, narratable, and formatted as a conventional commit. Push after each commit.
- **PRs small.** Make each PR a vertical slice. Fix a minor review point that the PR caused in that PR, without asking. Work that the PR did not cause goes in a new PR. Use `git mv` for a file move.
- **Paths in a PR.** In a PR, a PR comment, or a commit message, name a file by its path in the PR's repo. Do not name a local path, such as a home folder, a temp folder, or the scratchpad. A local path shows the user name, the session, and the other projects on the machine. In a public repo, also do not name a path in another repo.
- **Answer every review comment.** Fix a bot point at its root cause, or reply why it does not apply. Then resolve the thread. Post a reply to a human only after Mehrdad agrees to it. Answer the points of a review body in one numbered PR comment, because a review body has no thread. Then request a new review.
- **Tests ship with the change.** Use DAMP, not DRY, in tests. Prefer custom stubs and fakes over mocks. Fix the root cause, never the symptom. Keep CI green and add any missing checks. Use `dev:tdd` for the red-green loop. Use `dev:fire` for a change that has a brief.
- **Audit each new dependency.** After you add or upgrade a dependency, run the audit command of its package manager. Examples are `npm audit`, `pnpm audit`, and `composer audit`. Fix or report each High or Critical finding.
- Read the matching rubric when you touch that area. For tests, read [references/testing.md](references/testing.md). For TypeScript, read [references/typescript.md](references/typescript.md).

## When reviewing

- **Order findings by altitude**: scope and overengineering, then structure and correctness, then style. Do not polish code that must not survive.
- **Verify, don't trust.** Check the PR claims against the diff and the source. Run the tests. If a green test suite would miss a bug you already found, that gap is itself a finding.
- **Critical, not polite.** This also includes any part that was already approved. Review the code again after the fixes are merged.
- Apply the same rubrics during a review.
