#!/usr/bin/env bash
# Score the writing skills `write-ste` and `unslop` on the cases in
# productivity/evals/. Runs the cases of this checkout with the two skill
# folders of <ref>, and prints the share of the grader checks that passed.
# A check is one grader of one run. Most checks look for one planted defect
# in the reply.
# `english` is the share for the english-* cases. Compare it between
# origin/main and HEAD. A lower share on HEAD means that the change lost an
# English finding.
# `other` is the share for the other-* cases. Each one holds a text in another
# language, and a check that the reply says that no word list exists.
# Extra arguments go to `claude plugin eval`, for example -j 4 or --runs 1.
# Usage: scripts/score-writing.sh <ref> [eval options]
set -euo pipefail
cd "$(dirname "$0")/.."

ref=${1:?usage: scripts/score-writing.sh <ref> [eval options]}
shift

# A case loads only a plugin inside the folder that the eval runs on, so a copy
# of productivity/ carries the skills of <ref> next to the cases of this checkout.
work=$(mktemp -d "${TMPDIR:-/tmp}/score-writing.XXXXXX")
cp -R productivity "$work/productivity"
rm -rf "$work/productivity/evals/results"
for skill in write-ste unslop; do
  rm -rf "$work/productivity/skills/$skill"
  git archive "$ref" "productivity/skills/$skill" | tar -x -C "$work"
done

# The case session is pinned, so that two refs run on the same model.
# Threshold 0 keeps a low score from failing the eval.
status=0
claude plugin eval "$work/productivity" --trust-plugin --ablation none --no-publish \
  --threshold 0 --model claude-sonnet-5-5 --tag writing \
  --output-dir "$work/results" "$@" || status=$?

# A trust refusal or a load failure stops the eval before it writes a result.
result=$work/results/aggregate-result.json
if [[ ! -f $result ]]; then
  echo "$ref: no score, because the eval wrote no $result" >&2
  exit $((status == 0 ? 1 : status))
fi

# The folder stays, so that the report and the per-case results can be read.
echo "Results: $work/results"

jq -r --arg ref "$ref" '
  def checks(kind): [.cases[] | select(.name | startswith(kind)) | .arms.with[]? | .graders[]?];
  def score(kind): checks(kind) as $checks
    | ([$checks[] | select(.passed == true)] | length) as $passed
    | (if ($checks | length) == 0 then "none"
       else $passed / ($checks | length) * 100 | round / 100 end) as $share
    | "\($share) (\($passed) of \($checks | length) checks)";
  def errors: [.cases[].arms.with[]? | select(.error != null)] | length;
  "\($ref): writing english \(score("english-")), other \(score("other-")), runs with an error \(errors)"
    + if .partial then " (partial: \(.partialReason))" else "" end
' "$result" || exit $((status == 0 ? 1 : status))
exit "$status"
