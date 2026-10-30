#!/usr/bin/env bash
# Fail a PR that changes the reviewer or its cases, and has no reviewer score
# lines in its body. A PR that changes dev/agents/pr-reviewer.md needs an
# `origin/main:` line and a `HEAD:` line. A PR that changes other files under
# dev/evals/ needs a `HEAD:` line. A score line starts a line of the body, as
# scripts/score-reviewer.sh prints it. A `none` score counts. The check does
# not compare the scores. The body is untrusted, so it is only read as data.
# Usage: <changed paths, one per line> | BODY=<PR body> scripts/check-score-lines.sh
set -euo pipefail

paths=$(cat)
if grep -qx 'dev/agents/pr-reviewer.md' <<<"$paths"; then
  refs='origin/main HEAD' changed=dev/agents/pr-reviewer.md
elif grep -q '^dev/evals/' <<<"$paths"; then
  refs=HEAD changed='files under dev/evals/'
else
  exit 0
fi

score='(none|[0-9.]+) \([0-9]+ of [0-9]+ runs\)'
missing=
for ref in $refs; do
  grep -Eq "^$ref: recall $score, clean $score, runs with an error [0-9]+" <<<"${BODY:-}" \
    || missing+=" $ref"
done
if [[ -z $missing ]]; then exit 0; fi

echo "✘ This PR changes $changed, and its body has no score line for:$missing."
echo "  Run these commands on the branch, in your terminal:"
echo "    git fetch"
for ref in $missing; do echo "    scripts/score-reviewer.sh $ref"; done
echo "  Paste each line that starts with the ref and a colon into the PR body, as the"
echo "  script prints it, on a line of its own. For example:"
echo "    HEAD: recall 0.78 (14 of 18 runs), clean 0.6 (9 of 15 runs), runs with an error 0"
echo "  The rule is in AGENTS.md. An edit of the PR body runs this check again."
exit 1
