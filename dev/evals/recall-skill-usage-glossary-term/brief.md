PR title: feat(scripts): list the orphan skills at the end of skill-usage.sh

## Brief

- Why: Before a deprecation, the owner runs `scripts/skill-usage.sh` and looks for the rows with 0 sessions and an empty callers column. A long callers column wraps in the terminal, so the owner can miss a row with an empty one.
- Goal: `scripts/skill-usage.sh` ends its output with the skills that have 0 sessions and no caller. The table above that list stays the same.
- Targets: `mithredate-skills`, base branch `main`.
- Terms: `orphan skill` is a skill with 0 sessions in the transcript window and no caller. The term is new.
- FR:
  - After the table, the script prints an empty line and the line `Orphan skills (0 sessions, no callers):`.
  - Below that line, the script prints each orphan skill as `<plugin>:<skill>`, one skill on each line, indented by two spaces, in the order of the table.
- NFR:
  - No new dependency and no new flag.
  - The script does not check the age of a skill. The owner checks the age, as before.
  - Edit only `scripts/skill-usage.sh`.
- Verification:
  1. `./scripts/validate.sh` exits 0.
  2. Run `CLAUDE_PROJECTS_DIR="$(mktemp -d)" scripts/skill-usage.sh`. With no transcripts, the list under the new line holds each skill with an empty callers column, for example `dev:systematic-debugging`.
