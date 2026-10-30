#!/usr/bin/env bash
# Score dev:pr-reviewer on the cases in dev/evals/. Runs the cases of this
# checkout with the dev/agents/pr-reviewer.md of <ref>, and prints recall and
# clean. Extra arguments go to `claude plugin eval`, for example -j 4.
# A run passes when it has grader results and every grader passed. A run with
# an error, such as a timeout or an API error, counts in its score too.
# Recall is the share of the recall-* case runs that passed. Clean is the same
# share for the clean-* cases.
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

# A score with runs but no run with grader results is a failure, because a
# broken scaffold then gives 0 on both refs. A score with no runs is not a
# failure, because --case can leave a score with no runs.
jq -r --arg ref "$ref" '
  def passed: (.graders | length) > 0 and all(.graders[]; .passed == true);
  def runs(prefix): [.cases[] | select(.name | startswith(prefix)) | .arms.with[]?];
  def score(prefix): runs(prefix) as $runs
    | ([$runs[] | select(passed)] | length) as $passed
    | (if ($runs | length) == 0 then "none"
       else $passed / ($runs | length) * 100 | round / 100 end) as $share
    | "\($share) (\($passed) of \($runs | length) runs)";
  def errors: [.cases[].arms.with[]? | select(.error != null)] | length;
  "\($ref): recall \(score("recall-")), clean \(score("clean-")), runs with an error \(errors)"
    + if .partial then " (partial: \(.partialReason))" else "" end,
  if any(runs("recall-"), runs("clean-"); length > 0 and all(.[]; .graders | length == 0))
  then "\($ref): a score has runs, but no run with grader results\n" | halt_error(1) else empty end
' "$result" || exit $((status == 0 ? 1 : status))
exit "$status"
