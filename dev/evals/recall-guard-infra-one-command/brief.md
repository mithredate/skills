PR title: fix(guard-infra): ask only about one plain command, refuse any other privileged line

## Brief

- Why: guard-infra shows the whole Bash line in its question. When the line is a script with loops, variables, or several commands, Mehrdad cannot judge it, and he approves or rejects without knowing what runs.
- Goal: each guard-infra question shows one command that a person can read in seconds.
- Targets: `mithredate-skills`, base branch `main`, plugin `guard-infra`.
- Decisions:
  - Enforce "one command per call" in the guard, at question time. Do not add a no-chaining rule for every Bash call. Mehrdad picked this in the prep session on 2026-10-21.
  - If a line is not simple, the guard refuses it and does not ask. A question never shows only part of the line, because Run runs the whole line.
  - A simple line is one command on one line, with no `$`, backtick, heredoc, or here-string. A redirection to a file is allowed.
  - The refusal names each privileged call. It tells the agent to run each one alone in its own Bash call, and the other commands in a separate call.
  - The 0.1.3 sandbox check stays first. A line that stays in the sandbox runs with no question and no refusal.
- FR:
  - `kubectl delete pod x` asks, as now.
  - `kubectl get cm app -o json | jq '.data.x="y"' | kubectl apply -f -` does not ask. The agent gets a refusal that names `kubectl apply -f -`.
  - `kubectl delete pod $POD` does not ask. The agent gets a refusal.
  - `cd /tmp/claude-501; for r in app-one app-two; do gh api repos/example-org/$r/contents/Jenkinsfile --jq .content | base64 -d | grep -nE "helm|kubectl"; done` runs with no question and no refusal when the sandbox settings of `guard-infra/sandbox.json` are in force, as in 0.1.3.
- NFR:
  - No new dependency.
  - Stays unbuilt: the parser mistake that flags `base64 -d` before a `grep` that writes a tool name. A line with it stays in the sandbox, so the mistake has no effect there.
- Verification:
  - A test in `guard-infra/hooks/guard.test.ts` for each FR line, red first.
  - `./scripts/validate.sh` passes. Run the mod type check by hand too, because `validate.sh` skips it in the sandbox.
  - Replay the Bash calls since 2026-10-14 through the new code with `node /private/tmp/claude-501/-Users-mehrdad-hedayati-projects-mithredate-skills/756d3533-afef-46f0-adff-10fcac50ebd8/scratchpad/replay.mts 2026-10-14`. It must count 0 questions. It must also count 0 refusals, so extend the script to count them.
