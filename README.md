# Skills

Opinionated, curated Claude Code skills — vendored from upstream sources (mattpocock-skills, superpowers, etc.) and drifted toward a personal style.

## Plugins

- **dev** — general development tooling
  - `manage-agents-md` — write, improve, and housekeep a repo's instruction file (`CLAUDE.md`, or `AGENTS.md` bridged into it); graduate corrections out of auto-memory into it
  - `tdd` — test-driven development with a red-green-refactor loop
  - `systematic-debugging` — finding root cause before applying a fix
  - `fire` — implement a briefed change through a Workflow graph inside a token ceiling: implementer, then `pr-reviewer` and `verifier`, verdict in code
  - `ponytail` — force the laziest solution that actually works — YAGNI, stdlib first, shortest diff
  - `verification-before-completion` — require fresh verification evidence before claiming work is done
  - `codebase-design` — shared vocabulary for designing deep modules and finding deepening opportunities
  - `review-pr` — review a PR within a token budget: the main session for others' PRs, one capped reviewer plus one verifier for PRs the user's agents wrote
  - agents `pr-reviewer` (Sonnet, two lenses, structured findings) and `verifier` (Haiku, runs declared commands, reports evidence)
- **meta** — skills for maintaining this marketplace itself
  - `import-skill` — vendor a new skill from a GitHub upstream
  - `refresh-vendored` — reconcile vendored skills against upstream changes
  - `merge-skill` — shared core that reconciles two skill versions into one (used by the above)
- **productivity** — process and workflow skills
  - `grill-me` — launcher that opens a `grilling` session (thin shim)
  - `grilling` — stress-test a plan, decision, or idea by relentless one-question-at-a-time interrogation
  - `write-a-skill` — write or rewrite a skill, an agent file, or a reference: name, invocation, shape, frontmatter, checks, and the PR
  - `write-ste` — the Simplified Technical English rules for every text we author, with the check to run before you finish
  - `teach` — turn the working directory into a stateful workspace for learning a topic across sessions
  - `wayfinder` — plan oversized work as a map of decision tickets on an issue tracker, resolved one at a time
  - `orchestrate` — run a planning-only orchestrator repo: one wayfinder map per initiative under `.wayfinder/`, `cook`, `init`, `close` (report replaces the map), the hand-off brief
  - `domain-modeling` — pin down a domain's terms and boundaries; record choices as ADRs
  - `research` — resolve a factual question a decision waits on via a focused research subagent
  - `prototype` — make a cheap, rough artifact (outline, stub, UI/logic) to react to
- **personal** — Mehrdad's personal working defaults
  - `work-like-mehrdad` — engineering defaults for judgment, orchestrating agents, spending quota, building, and reviewing; loads at the start of any code-touching session
  - hook `guard-privileged-commands` — PreToolUse on Bash: blocks `aws`, `aws-vault`, `kubectl`, `helm`, `terraform apply|destroy` and hands the command to the human
- **in-progress** — skills being actively authored or rewritten (installable for dogfooding; expect churn until they graduate)
  - `weigh-feature-complexity` — break a spec or PR into features and visualize the complexity each one adds
  - `show-me` — explain the current topic visually — pseudocode, trees, diffs, mermaid, or one HTML page
- **deprecated** — skills phased out, kept installable during transitions _(empty for now)_

## Installation

1. Run `claude` inside any repo
2. `/plugin marketplace add mithredate/skills`
3. `/plugin install <plugin-name>@skills`

## Vendoring and maintenance

Most skills here are forks of upstream open-source work. Lifecycle:

- **Add a new vendored skill** — invoke `/import-skill`. Interactive: gathers upstream coords, clones, copies files into a target plugin, writes the canonical attribution footer with the fork-commit SHA, and updates `marketplace.json` and `NOTICES.md`.
- **Refresh existing vendored skills** — invoke `/refresh-vendored`. Surfaces upstream changes since the fork commit, lets you adopt or skip each change, and adjusts the attribution verb if local drift has shifted bands (`Adapted from` → `Inspired by` → `Originally seeded from`).

## Attribution

Each vendored `SKILL.md` carries a one-line footer at the bottom with the source URL (including the fork-commit SHA) and license. The repo-level summary lives in [`NOTICES.md`](NOTICES.md). Canonical footer format: [`meta/skills/import-skill/references/footer-format.md`](meta/skills/import-skill/references/footer-format.md).
