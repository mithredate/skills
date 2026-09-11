# Skills

Opinionated, curated Claude Code skills — vendored from upstream sources (mattpocock-skills, superpowers, etc.) and drifted toward a personal style.

## Plugins

- **dev** — general development tooling
  - `manage-claude-md` — create, review, and improve `CLAUDE.md` files
  - `install-claude-sidecar` — install the Claude sidecar viewer
  - `tdd` — test-driven development with a red-green-refactor loop
  - `systematic-debugging` — finding root cause before applying a fix
  - `implement-with-review-loop` — implement changes under a worktree-isolated implement-then-review loop
  - `ponytail` — force the laziest solution that actually works — YAGNI, stdlib first, shortest diff
  - `verification-before-completion` — require fresh verification evidence before claiming work is done
  - `codebase-design` — shared vocabulary for designing deep modules and finding deepening opportunities
- **meta** — skills for maintaining this marketplace itself
  - `import-skill` — vendor a new skill from a GitHub upstream
  - `refresh-vendored` — reconcile vendored skills against upstream changes
  - `merge-skill` — shared core that reconciles two skill versions into one (used by the above)
- **productivity** — process and workflow skills
  - `grill-me` — launcher that opens a `grilling` session (thin shim)
  - `grilling` — stress-test a plan, decision, or idea by relentless one-question-at-a-time interrogation
  - `write-a-skill` — reference for the craft of writing skills: predictability, context vs cognitive load, information hierarchy, leading words, failure modes
  - `teach` — turn the working directory into a stateful workspace for learning a topic across sessions
  - `capture-decision` — end-of-session capture into a decision archive via multi-agent review loop
  - `recall-decision` — mid-session lookup against a decision archive via a sub-agent digest
  - `wayfinder` — plan oversized work as a map of decision tickets on an issue tracker, resolved one at a time
  - `domain-modeling` — pin down a domain's terms and boundaries; record choices as ADRs
  - `research` — resolve a factual question a decision waits on via a focused research subagent
  - `prototype` — make a cheap, rough artifact (outline, stub, UI/logic) to react to
- **personal** — Mehrdad's personal working defaults
  - `work-like-mehrdad` — engineering defaults for judgment, orchestrating agents, spending quota, building, and reviewing; loads at the start of any code-touching session
  - hook `guard-privileged-commands` — PreToolUse on Bash: blocks `aws`, `aws-vault`, `kubectl`, `helm`, `terraform apply|destroy` and hands the command to the human
- **in-progress** — skills being actively authored or rewritten (installable for dogfooding; expect churn until they graduate)
  - `weigh-feature-complexity` — break a spec or PR into features and visualize the complexity each one adds
  - `show-me` — explain the current topic visually — pseudocode, trees, diffs, mermaid, or one HTML page
- **deprecated** — skills phased out, kept installable during transitions
  - `handoff` — compact the current conversation into a handoff doc for the next session

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
