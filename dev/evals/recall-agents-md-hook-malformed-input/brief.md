PR title: feat(dev): load manage-agents-md after an edit of AGENTS.md or CLAUDE.md

## Brief

- Why: The Craft baseline of `personal/skills/code-like-mehrdad/SKILL.md` tells the agent to call `dev:manage-agents-md` for a contradicted `AGENTS.md` or `CLAUDE.md` line, but nothing loads that skill. In the last 30 days, 5 main sessions and 11 agents edited a repo `AGENTS.md` or `CLAUDE.md` with Edit or Write, and none of them loaded the skill.
- Goal: After an edit of a file named `AGENTS.md` or `CLAUDE.md`, the agent gets a reminder to load `dev:manage-agents-md` and to check the file against it.
- Targets: `mithredate-skills`, base branch `main`.
- Decisions:
  - The `dev` plugin owns the hook, because `dev` owns the skill. The owner decided this on 2026-11-03.
  - The hook is a `PostToolUse` command hook on `Edit|Write|MultiEdit`, modeled on `productivity/hooks/load-write-a-skill-on-skill-change.mjs` and its test.
  - The hook matches a file whose name is exactly `AGENTS.md` or `CLAUDE.md`, in any folder. It does not match `CLAUDE.local.md`, files in `.claude/rules/`, `NotebookEdit`, or a Bash edit. The skill description names only the two files.
  - The hook also fires in agents. It has no `agent_id` check, like the write-a-skill hook. 11 of the 16 edits came from `general-purpose` agents.
  - Bump the patch version of `dev`.
- Terms: none.
- FR:
  - After an Edit, Write, or MultiEdit of a file named `AGENTS.md` or `CLAUDE.md`, the hook prints `hookSpecificOutput` with `hookEventName` `PostToolUse` and an `additionalContext` in STE. The text says that an agent instruction file changed. It tells the agent to call the Skill tool with `dev:manage-agents-md` before its next tool call, if the skill is not loaded. It then tells the agent to check each changed file against the skill.
  - After an edit of any other file, such as `README.md`, `AGENTS.md.bak`, or `CLAUDE.local.md`, the hook prints nothing.
  - With empty or malformed input, the hook prints nothing and exits 0.
  - `dev/hooks/hooks.json` has a `description` that says what the hook does, like `productivity/hooks/hooks.json`.
- NFR:
  - Node built-ins only. No new dependency, and no git call in the hook.
  - The hook never fails a tool call.
  - Write the hook text and the hooks description in STE by `productivity:write-ste`.
  - Out of scope: the text of `dev/skills/manage-agents-md/SKILL.md`, and the `AGENTS.md` layout section.
- Verification:
  - `node --test dev/hooks/*.test.mjs` passes. The test runs the real hook with stdin JSON for each FR case: Edit of `/repo/AGENTS.md`, Write of `/repo/sub/CLAUDE.md`, MultiEdit of `/repo/AGENTS.md`, Edit of `/repo/README.md`, Edit of `/repo/AGENTS.md.bak`, Edit of `/repo/CLAUDE.local.md`, and empty input.
  - `./scripts/validate.sh` exits 0.
  - `echo '{"hook_event_name":"PostToolUse","tool_name":"Edit","tool_input":{"file_path":"/tmp/x/AGENTS.md"}}' | node dev/hooks/<hook file>.mjs` prints the reminder JSON.
  - `git diff origin/main -- dev/.claude-plugin/plugin.json` shows one patch bump.
