# Skills

Opinionated, curated Claude Code skills — vendored from upstream sources (mattpocock-skills, superpowers, etc.) and drifted toward a personal style.

## Plugins

- **dev** — general development tooling
  - `manage-agents-md` — write, improve, and housekeep a repo's instruction file (`CLAUDE.md`, or `AGENTS.md` bridged into it); graduate corrections out of auto-memory into it
  - `tdd` — test-driven development with a red-green-refactor loop
  - `systematic-debugging` — finding root cause before applying a fix
  - `fire` — build one build-ticket brief with a fresh implementer agent, review it with `pr-reviewer` and `verifier`, at most three rounds, then open draft PRs. Targets can be git repos or other systems such as n8n
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
  - `orchestrate` — run a planning-only orchestrator repo: one map of decision tickets per initiative under `.wayfinder/`, an index read first that orders them by priority, `chart`, `cook`, `init`, `close` (report replaces the map), the hand-off brief
  - `sup` — one-screen, read-only report across the maps of an orchestrator repo, with a proposal for the next map, with the live state of linked PRs, issues, and threads
  - `sweep` — check the PRs, issues, pages, and threads linked from an orchestrator tracker, on the hosts listed in `.wayfinder/sources.md`, and give each session fact its place (used by `orchestrate` and `sup`)
  - `domain-modeling` — pin down a domain's terms and boundaries; record choices as ADRs
  - `research` — resolve a factual question a decision waits on via a focused research subagent
  - `prototype` — make a cheap, rough artifact (outline, stub, UI/logic) to react to
  - `unslop` — cut AI tells from any writing
- **personal** — Mehrdad's personal working defaults
  - `work-like-mehrdad` — engineering defaults for judgment, orchestrating agents, spending quota, building, and reviewing; loads at the start of any code-touching session
  - hook `guard-privileged-commands` — PreToolUse on Bash: blocks `aws`, `aws-vault`, `kubectl`, `helm`, `terraform apply|destroy` except reads that return no secret, and hands the command to the human
- **in-progress** — skills being actively authored or rewritten (installable for dogfooding; expect churn until they graduate)
  - `show-me` — explain the current topic visually — pseudocode, trees, diffs, mermaid, or one HTML page
- **guard-worktree** — mod (JS hooks that run inside Claude Code): refuses an edit in a repo's main checkout and names the `git worktree add` command; fetches before `git worktree add` and refuses a new branch not based on `origin/<default>`. Skips `.wayfinder/`, ignored files, and repos with no `origin`
- **watch-prs** — mod: watches the PRs a session opens or reads with `gh`, shows its state under the prompt, adds live state to each prompt, and starts a turn when Copilot reviews, a person reviews or comments (not the user's own, since Claude replies as the user), checks fail, or the PR merges. A merge this session ran with `gh pr merge` shows a toast and starts no turn. Each turn asks for a one-line reply when nothing is left to do. At most five such turns per PR, a merge excepted. Watches only PRs whose URL a `gh` command names or `gh pr create` prints, so `gh pr view 74` does not add one. `/watch-prs`, `/unwatch-prs`
- **tidy-transcript** — mod: folds each run of tool calls between two pieces of reply text into one line, such as `✓ Bash ×3 · Read · Agent  41s`. The mark is a green `✓` when every call passed, a red `✗` with the count when a call failed, and an orange `●` while the run is open. A click on the tool names unfolds the run, so each call shows as Claude Code draws it, and the caret turns from `▸` to `▾`. A second click folds it again. A running call draws only the line too, so no row shows and then folds. Questions and plans never fold. A mod's prompt draws as one line: the mod's name on a purple label, then the first line of its text, dim. When you type a new prompt, a reply from an earlier turn folds to its first 3 lines and a count. A note written before a tool call draws dim, so the last reply of a turn is the one bright text. The line that closes a turn shows its time, its tool count, its failures, the context share, and the session cost, such as `── 1m 20s · 8 tools · ✗ 1 failed · ctx 62% · $0.31 ──`. Claude Code draws that line only while `showTurnDuration` is on. Only the screen changes, and the model keeps every row
- **show-session** — mod: `/show-session` opens a pane, or closes it. It shows the model, the context share, the cost, and the minutes, then one section each for the skills the session loaded, the folders it read or edited, its last shell commands, and its agents. Each command and agent has a green `✓`, a red `✗`, or an orange `●` while it runs. In a fullscreen terminal at least 144 columns wide, the pane docks beside the transcript
- **deprecated** — skills phased out, kept installable during transitions
  - `wayfinder` — merged into `orchestrate`, which is the only place it ran

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
