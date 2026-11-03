---
name: code-like-mehrdad
description: Mehrdad's code defaults. Use when you plan, edit, debug, or review code, even when the user does not ask.
---

# Code like Mehrdad

## First actions

Before your next tool call, call the Skill tool with `personal:work-like-mehrdad` and `dev:ponytail`. This step is done when both skills are loaded.

## Judgment

- **Ponytail is the standing lens.** Apply `dev:ponytail` to the plan before you propose an approach, not only to the code. A simple ticket with a large diff is a sign to cut the scope.
- **Craft baseline.** Use precise, domain-correct names. Rename a bad name in the code that you change. Use named constants instead of magic literals, and replace every usage. Use configurable values instead of hardcoded environment values. A stale comment, a dead conditional, and an AGENTS.md or CLAUDE.md line that the environment contradicts are all defects. For a contradicted line, call the Skill tool with `dev:manage-agents-md` to fix it. Never work around it. In a PR about something else, do not shorten a comment that another person wrote.
- **Comments.** Let the names and the structure show what the code does. Write a comment only for a reason that the code cannot show. Examples are a workaround, a vendor constraint, a bug in another system, and the `shortcut:` note of `dev:ponytail`. Write it in one line with no ticket key. Do not put phase markers, such as Arrange, Act, and Assert, in a test.

## When building

- **Tests ship with the change.** Use DAMP, not DRY, in tests. Prefer custom stubs and fakes over mocks. Fix the root cause, never the symptom. Keep CI green and add any missing checks. Use `dev:tdd` for the red-green loop. Use `dev:fire` for a change that has a brief.
- **Audit each new dependency.** After you add or upgrade a dependency, run the audit command of its package manager. Examples are `npm audit`, `pnpm audit`, and `composer audit`. Fix or report each High or Critical finding.
- Read the matching rubric when you touch that area. For tests, read [references/testing.md](references/testing.md). For TypeScript, read [references/typescript.md](references/typescript.md).

## When reviewing

- **Order findings by altitude**: scope and overengineering, then structure and correctness, then style. Do not polish code that must not survive.
- **Verify, don't trust.** Check the PR claims against the diff and the source. Run the tests. If a green test suite would miss a bug you already found, that gap is itself a finding.
- **Critical, not polite.** This also includes any part that was already approved. Review the code again after the fixes are merged.
- Apply the same rubrics during a review.
