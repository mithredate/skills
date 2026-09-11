# Skills marketplace

A Claude Code marketplace repo: opinionated forks of upstream skills (mattpocock-skills, superpowers, etc.) curated into one installable source. Skills are *vendored* — copied in, then drifted toward a personal opinion. Not a sync mirror.

## Layout

```
.
├── .claude-plugin/marketplace.json     # marketplace manifest, lists registered plugins
├── .github/workflows/validate.yml      # CI gate (runs scripts/validate.sh)
├── scripts/validate.sh                 # local + CI validator
├── dev/                                # general development tooling
├── meta/                               # repo-self-maintenance skills (import, refresh, merge)
├── productivity/                       # process and workflow skills
├── personal/                           # Mehrdad's personal working defaults (work-like-mehrdad)
├── in-progress/                        # skills being actively authored or rewritten
├── deprecated/                         # skills phased out, kept installable
├── NOTICES.md                          # upstream attribution summary
└── README.md
```

Each top-level plugin dir has `.claude-plugin/plugin.json` and `skills/`. Each skill is a dir with `SKILL.md` plus optional `references/` and `scripts/`. Slash commands (`commands/*.md`) are the legacy Claude Code mechanism and intentionally not used here — skills replace them.

## Conventions

- **Skill names are verb-first hyphenated** (`import-skill`, `manage-claude-md`). Never linguistically "improve" upstream names; user overrides if needed.
- **Vendored skills carry a footer** at the bottom of `SKILL.md` linking to the upstream commit. Canonical format: `meta/skills/import-skill/references/footer-format.md`. The link is always preserved (MIT-compliance anchor) even when the skill has fully drifted.
- **The SHA in the footer is a last-reviewed checkpoint**, not the original fork point. Advances every refresh.
- **No parallel skills.** When concepts conflict, merge or abort — never run two forks of the same idea side by side.

## Workflows

- **Validate before committing** — `./scripts/validate.sh`. CI runs the same script and gates PRs / pushes to main.
- **Vendor a new skill from an upstream repo** — invoke `/import-skill`. Defined in `meta/skills/import-skill/SKILL.md`. Interactive: gathers upstream coords, picks target plugin, runs the import script, validates.
- **Refresh vendored skills against upstream** — invoke `/refresh-vendored`. Defined in `meta/skills/refresh-vendored/SKILL.md`. Delegates each per-skill reconciliation to `merge-skill`.
- **Reconcile two skill versions** — invoke `/merge-skill`. Defined in `meta/skills/merge-skill/SKILL.md`. Used by both above; can also be invoked standalone.
- **Author from scratch** — new SKILL.md goes under `in-progress/skills/<name>/`. Move to `dev/` or `productivity/` when it represents the current opinion. Lifecycle is one-way; no demotion.

## Worktree workflow (imports and refreshes)

Both `import-skill` and `refresh-vendored` operate in a **dedicated git worktree per session**, never on `main` directly. Worktrees live under `.worktrees/<branch-name>/` at the repo root (gitignored); branch name = directory name.

Per session:
- Create a worktree on a feature branch — `import/<target-name>` for imports, `refresh/<date>` for refreshes.
- Do all file edits in the worktree.
- On successful validation: commit, push the branch, offer to open a PR via `gh pr create --fill`. CI on the feature branch is the actual gate.
- On validation failure: leave the worktree dirty for inspection. Don't commit, don't push.

## Lifecycle

- `in-progress/` — actively being shaped (vendored-and-drifting or authored-from-scratch).
- `dev/` / `productivity/` — stable, currently used.
- `deprecated/` — phased out, still installable with warning. `refresh-vendored` skips these.
- `meta/` — repo self-maintenance only; not useful in other projects.

## Drift bands and attribution language

Footer verb depends on local drift since last review:

| Drift | Verb |
|---|---|
| < 30%  | `Adapted from` |
| 30–80% | `Inspired by` |
| > 80%  | `Originally seeded from` |

`merge-skill` and `refresh-vendored` propose the new verb when the band shifts; user confirms.

## When in doubt

- Footer format details → `meta/skills/import-skill/references/footer-format.md`
- Attribution summary → `NOTICES.md`
- Marketplace install → `README.md`
