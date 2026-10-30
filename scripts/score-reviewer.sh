#!/usr/bin/env bash
# Score dev:pr-reviewer on the cases in dev/evals/. Runs the cases of this
# checkout with the dev/agents/pr-reviewer.md of <ref>, and prints recall and
# clean. Extra arguments go to `claude plugin eval`, for example -j 4.
# Usage: scripts/score-reviewer.sh <ref> [eval options]
set -euo pipefail
cd "$(dirname "$0")/.."

ref=${1:?usage: scripts/score-reviewer.sh <ref> [eval options]}
shift

# A case loads only a plugin inside the folder that the eval runs on, so a copy
# of dev/ carries the reviewer of <ref> next to the cases of this checkout.
work=$(mktemp -d "${TMPDIR:-/tmp}/score-reviewer.XXXXXX")
cp -R dev "$work/dev"
rm -rf "$work/dev/evals/results"
git show "$ref:dev/agents/pr-reviewer.md" > "$work/dev/agents/pr-reviewer.md"

# The case session and the judge are pinned. The reviewer keeps the model of
# its frontmatter. Threshold 0 keeps a low score from failing the eval.
status=0
claude plugin eval "$work/dev" --trust-plugin --scaffold --ablation none --no-publish \
  --threshold 0 --model claude-haiku-4-5 --judge-model claude-sonnet-5-5 \
  --output-dir "$work/results" "$@" || status=$?

jq -r --arg ref "$ref" '
  def mean(prefix): [.cases[] | select(.name | startswith(prefix)) | .aggregates.score]
    | if length == 0 then "none" else add / length * 100 | round / 100 end;
  "\($ref): recall \(mean("recall-")), clean \(mean("clean-"))"
    + if .partial then " (partial: \(.partialReason))" else "" end
' "$work/results/aggregate-result.json"
exit "$status"
