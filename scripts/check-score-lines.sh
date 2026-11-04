#!/usr/bin/env bash
# Fail a PR that changes a reviewer agent or its cases, and has no score lines
# of that agent in its body. The agents are pr-reviewer and blast-radius. A PR
# that changes dev/agents/<agent>.md needs an `origin/main:` line and a `HEAD:`
# line of that agent. A PR that changes cases of the agent needs a `HEAD:` line.
# The files under dev/evals/blast-radius-* belong to blast-radius. The other
# files under dev/evals/ belong to pr-reviewer. A score line starts a line of
# the body, as scripts/score-reviewer.sh prints it. A `none` score counts. The
# check does not compare the scores. The body is untrusted, so the script only
# greps it.
# The paths come as git diff prints them. git puts a path with a special byte
# in double quotes, and the prefix dev/evals/ stays as it is after the quote.
# Usage: <changed paths, one per line> | BODY=<PR body> scripts/check-score-lines.sh
set -euo pipefail

paths=$(cat)
evals=$(grep -E '^"?dev/evals/' <<<"$paths" || true)
score='(none|[0-9.]+) \([0-9]+ of [0-9]+ runs\)'
failed=0

for agent in pr-reviewer blast-radius; do
  # The pr-reviewer cases and score lines came first, so they have no agent name.
  if [[ $agent == pr-reviewer ]]; then
    label= option= cases='files under dev/evals/'
    own=$(grep -Ev '^"?dev/evals/blast-radius-' <<<"$evals" || true)
  else
    label="$agent " option=" --agent $agent" cases="files under dev/evals/$agent-*"
    own=$(grep -E "^\"?dev/evals/$agent-" <<<"$evals" || true)
  fi
  if grep -qx "dev/agents/$agent.md" <<<"$paths"; then
    refs='origin/main HEAD' changed=dev/agents/$agent.md
  elif [[ -n $own ]]; then
    refs=HEAD changed=$cases
  else
    continue
  fi

  missing=
  for ref in $refs; do
    grep -Eq "^$ref: ${label}recall $score, clean $score, runs with an error [0-9]+" <<<"${BODY:-}" \
      || missing+=" $ref"
  done
  if [[ -z $missing ]]; then continue; fi

  failed=1
  echo "✘ This PR changes $changed, and its body has no ${label}score line for:$missing."
  echo "  Run these commands on the branch, in your terminal:"
  echo "    git fetch"
  for ref in $missing; do echo "    scripts/score-reviewer.sh$option $ref"; done
  echo "  Paste these lines of their output into the PR body, each on a line of its own,"
  echo "  as the script prints it:"
  for ref in $missing; do echo "    $ref: ${label}recall ..., clean ..., runs with an error ..."; done
  echo "  If the run of a ref prints no score line, paste its none line instead:"
  for ref in $missing; do echo "    $ref: ${label}recall none (0 of 0 runs), clean none (0 of 0 runs), runs with an error 0"; done
  echo "  The rule is in AGENTS.md. An edit of the PR body runs this check again."
done
exit "$failed"
