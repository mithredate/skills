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
  --threshold 0 --model claude-haiku-5-5 --judge-model claude-sonnet-5-5 \
  --output-dir "$work/results" "$@" || status=$?

# A trust refusal or a load failure stops the eval before it writes a result.
# A missing score is a failure, also when the eval exits 0.
result=$work/results/aggregate-result.json
if [[ ! -f $result ]]; then
  echo "$ref: no score, because the eval wrote no $result" >&2
  exit $((status == 0 ? 1 : status))
fi

# The folder stays, so that the report and the per-case results of a low
# score can be read.
echo "Results: $work/results"

# Recall is the share of graded recall-case runs in which every grader passed.
# Clean is the same share for the clean cases. A run is graded when it has
# grader results, no error, and did not end on an API error. A run that is not
# graded does not lower a score. Each score prints its count of graded runs.
jq -r --arg ref "$ref" '
  def graded: (.graders | length) > 0 and .error == null and .ended_on_api_error != true;
  def score(prefix): [.cases[] | select(.name | startswith(prefix)) | .arms.with[]?] as $runs
    | [$runs[] | select(graded)] as $graded
    | (if ($graded | length) == 0 then "none"
       else ([$graded[] | select(all(.graders[]; .passed == true))] | length) / ($graded | length)
         * 100 | round / 100 end) as $score
    | "\($score) (\($graded | length) of \($runs | length) runs graded)";
  def errors: [.cases[].arms.with[]? | select(graded | not)] | length;
  "\($ref): recall \(score("recall-")), clean \(score("clean-")), runs with an error \(errors)"
    + if .partial then " (partial: \(.partialReason))" else "" end
' "$result"
exit "$status"
