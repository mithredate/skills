#!/usr/bin/env bash
# Fail a PR that changes the reviewer or its cases, and has no reviewer score
# lines in its body. A PR that changes dev/agents/pr-reviewer.md needs an
# `origin/main:` line and a `HEAD:` line. A PR that changes other files under
# dev/evals/ needs a `HEAD:` line. A score line starts a line of the body, as
# scripts/score-reviewer.sh prints it. A `none` score counts. The check does
# not compare the scores. The body is untrusted, so the script only greps it.
# The paths come as git diff prints them. git puts a path with a special byte
# in double quotes, and the prefix dev/evals/ stays as it is after the quote.
# Usage: <changed paths, one per line> | BODY=<PR body> scripts/check-score-lines.sh
set -euo pipefail

paths=$(cat)
if grep -qx 'dev/agents/pr-reviewer.md' <<<"$paths"; then
  refs='origin/main HEAD' changed=dev/agents/pr-reviewer.md
elif grep -Eq '^"?dev/evals/' <<<"$paths"; then
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
echo "  Paste these lines of their output into the PR body, each on a line of its own,"
echo "  as the script prints it:"
for ref in $missing; do echo "    $ref: recall ..., clean ..., runs with an error ..."; done
echo "  If the run of a ref prints no score line, paste its none line instead:"
for ref in $missing; do echo "    $ref: recall none (0 of 0 runs), clean none (0 of 0 runs), runs with an error 0"; done
echo "  The rule is in AGENTS.md. An edit of the PR body runs this check again."
exit 1
