---
name: code-like-mehrdad
description: Mehrdad's code defaults. Use when you plan, edit, debug, or review code, even when the user does not ask.
---

# Code like Mehrdad

## First actions

Before your next tool call, call the Skill tool with `personal:work-like-mehrdad` and `dev:ponytail`. This step is done when both skills are loaded.

## Judgment

- **Ponytail is the standing lens.** Apply `dev:ponytail` to the plan before you propose an approach, not only to the code. A simple ticket with a large diff is a sign to cut the scope.
- **Craft baseline.** Use precise, domain-correct names. Rename a bad name in the code that you change. Use named constants instead of magic literals, and replace every usage. Use configurable values instead of hardcoded environment values. A stale comment, a dead conditional, and an AGENTS.md or CLAUDE.md line that the environment contradicts are all defects. Fix a contradicted line. Never work around it. In a PR about something else, do not shorten a comment that another person wrote.
- **Comments.** Let the names and the structure show what the code does. Write a comment only for a reason that the code cannot show. Examples are a workaround, a vendor constraint, a bug in another system, and the `shortcut:` note of `dev:ponytail`. Write it in one line with no ticket key. Do not put phase markers, such as Arrange, Act, and Assert, in a test.
- **Store only what someone reads.** Before you add a field, a column, or a logged value, name the code or the person that reads it. If no one reads it, or every reader gets the fact elsewhere, do not store it. For example, a `producer: "sonnet-5"` field on a model record repeats what the record kind and git blame already tell. The model name also goes out of date within months. Data that no one reads goes stale and misleads the next reader.
- **Duplication is a structure question.** When a second place needs the same logic, check the structure first. If the logic belongs to one module, move it there, and let the other module call it. Do not copy the logic, and do not build a shared abstraction from only two cases. Code that looks alike but changes for different reasons is not duplication, so keep both. For example, two skills once shared a worker-and-reviewers loop. 3 of its 12 rules belonged to one skill only, so a shared skill would have forced them on both. A copy drifts. An abstraction built from two cases fits the third case badly.

## When building

- **Tests ship with the change.** Use DAMP, not DRY, in tests. Prefer custom stubs and fakes over mocks. Fix the root cause, never the symptom. Keep CI green and add any missing checks. Use `dev:tdd` for the red-green loop. Use `dev:fire` for a change that has a brief.
- **Audit each new dependency.** After you add or upgrade a dependency, run the audit command of its package manager. An example is `npm audit`. Fix or report each High or Critical finding. Pin each dependency to an exact version with a lockfile. Allow install scripts only for the packages that you list. A version range or an unlisted install script lets a compromised release in.
- Read the matching rubric when you touch that area. For tests, read [references/testing.md](references/testing.md). For TypeScript, read [references/typescript.md](references/typescript.md).

## When reviewing

- **Order findings by altitude**: scope and overengineering, then structure and correctness, then style. Do not polish code that must not survive.
- **Verify, don't trust.** Check the PR claims against the diff and the source. Run the tests. If a green test suite would miss a bug you already found, that gap is itself a finding.
- **Critical, not polite.** This also includes any part that was already approved. Review the code again after the fixes are merged.
- Apply the same rubrics during a review.
