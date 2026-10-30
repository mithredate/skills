PR title: fix(mods): make guard-worktree and watch-prs type-safe, and type-check them in CI

## Why

`tsc -p guard-worktree` and `tsc -p watch-prs` failed under the tsconfig that the engine writes for a mod. The modules imported `./rules.ts` and `./state.ts`, and that config does not allow `.ts` import paths (TS5097). `any` in the test helpers also hid fakes that did not match the engine's types. CI never ran `tsc`.

## What

- Own files import as `.js`, the form the mods docs use. Both forms load at run time.
- The test helpers take `On` and `Engine` from the kit. All `as any` casts are gone. The removal showed three real mismatches:
  - The `process.run` fakes had no `isStdoutTruncated` and no `isStderrTruncated`.
  - The `command.register` fake returned `undefined` instead of `{ command }`.
  - `$.command.run` was called without `origin` and `presentation`.
- `watch-prs` parses gh's output once, into a typed `PrJson`. Before, `JSON.parse` returned `any` into two functions. `ReviewDecision` and `ReviewState` are unions.
- Two boundary casts stay: `parsePr`, because gh prints a fixed field list, and the read of the mod's own store.
- Each mod commits the one-line `tsconfig.json` that the engine writes on load.
- `validate.sh` has a `mod types` step. A `--plugin-dir` load with an empty prompt writes the types with no sign-in. Then `tsc -p` runs on each mod. If the claude build writes no types, the step warns and skips.
- `guard-worktree` and `watch-prs` go to 0.1.1.

## Verified

- `./scripts/validate.sh` passes, with the 21 mod tests and the new type step.
- A type error added to `watch-prs/hooks/state.ts` on purpose fails the `mod types` step. The change was then reverted.
- In a fresh `CLAUDE_CONFIG_DIR` with no key, `claude -p --plugin-dir <mod> ""` wrote `.claude-plugin/types/` and exited.

## Links

- Mods docs, types: https://code.claude.com/docs/en/plugins/mods/create#get-the-types-for-your-build
- Mods introduced in `feat(mods): guard-worktree and watch-prs` (#75)

🤖 Generated with [Claude Code](https://claude.com/claude-code)

