#!/usr/bin/env bash
# Test scripts/score-reviewer.sh against a fake `claude` that writes a fixed
# aggregate-result.json and exits with a fixed code. The test needs no network
# and no real claude. Every file goes to a temp folder that the test deletes.
set -euo pipefail

cd "$(dirname "$0")/.."

tmp=$(mktemp -d "${TMPDIR:-/tmp}/score-reviewer-test.XXXXXX")
trap 'rm -rf "$tmp"' EXIT
mkdir "$tmp/bin"
cat > "$tmp/bin/claude" <<'EOF'
#!/usr/bin/env bash
# Copy $FAKE_JSON, if set, to <--output-dir>/aggregate-result.json. Exit $FAKE_STATUS.
out=
while (( $# )); do [[ $1 == --output-dir ]] && out=$2; shift; done
if [[ -n $FAKE_JSON ]]; then mkdir -p "$out" && cp "$FAKE_JSON" "$out/aggregate-result.json"; fi
exit "$FAKE_STATUS"
EOF
chmod +x "$tmp/bin/claude"

# A timed-out run can still have grader results, and it counts in its score.
# With --threshold 0, a timeout alone does not fail the eval. Every recall run
# timed out, but each one has grader results, so the script does not fail.
cat > "$tmp/timeouts.json" <<'EOF'
{"partial": false, "cases": [
 {"name": "recall-a", "arms": {"with": [{"graders": [{"passed": true}], "error": "timed out after 300s"},
   {"graders": [{"passed": false}], "error": "timed out after 300s"}]}},
 {"name": "clean-x", "arms": {"with": [{"graders": [{"passed": true}, {"passed": true}], "error": null},
   {"graders": [{"passed": true}, {"passed": true}], "error": null},
   {"graders": [{"passed": false}, {"passed": true}], "error": null},
   {"graders": [{"passed": true}, {"passed": true}], "error": "timed out after 300s"},
   {"graders": [{"passed": false}, {"passed": true}], "error": "timed out after 300s"}]}}
]}
EOF
# A run that ended on an API error has no grader results, and the eval exits 1.
cat > "$tmp/api-error.json" <<'EOF'
{"partial": false, "cases": [
 {"name": "recall-a", "arms": {"with": [{"graders": [{"passed": true}], "error": null},
   {"graders": [], "error": "API Error: 429 rate_limit_error"}]}},
 {"name": "recall-b", "arms": {"with": [{"graders": [{"passed": true}], "error": null}]}},
 {"name": "clean-x", "arms": {"with": [{"graders": [{"passed": true}, {"passed": true}], "error": null},
   {"graders": [{"passed": false}, {"passed": true}], "error": null}]}}
]}
EOF
# A broken scaffold gives runs with no grader results.
cat > "$tmp/no-grader-results.json" <<'EOF'
{"partial": false, "cases": [
 {"name": "recall-a", "arms": {"with": [{"graders": [{"passed": true}], "error": null}]}},
 {"name": "clean-x", "arms": {"with": [{"graders": [], "error": "scaffold failed"},
   {"graders": [], "error": "scaffold failed"}]}}
]}
EOF
# One recall run failed its scaffold, and the other recall run has grader
# results. With --threshold 0, a failed scaffold does not fail the eval.
cat > "$tmp/one-scaffold-failure.json" <<'EOF'
{"partial": false, "cases": [
 {"name": "recall-a", "arms": {"with": [{"graders": [{"passed": true}], "error": null},
   {"graders": [], "error": "scaffold failed"}]}},
 {"name": "clean-x", "arms": {"with": [{"graders": [{"passed": true}, {"passed": true}], "error": null}]}}
]}
EOF
# No recall run has grader results, and the cost ceiling stops the eval early.
# The eval then exits 2 with partial results.
cat > "$tmp/partial-no-recall-results.json" <<'EOF'
{"partial": true, "partialReason": "cost_ceiling", "cases": [
 {"name": "recall-a", "arms": {"with": [{"graders": [], "error": "scaffold failed"}]}},
 {"name": "clean-x", "arms": {"with": [{"graders": [{"passed": true}, {"passed": true}], "error": null}]}}
]}
EOF
cat > "$tmp/clean-only.json" <<'EOF'
{"partial": false, "cases": [
 {"name": "clean-pr74", "arms": {"with": [{"graders": [{"passed": true}, {"passed": true}], "error": null},
   {"graders": [{"passed": false}, {"passed": true}], "error": null}]}}
]}
EOF

failed=0
check() { # name, fixture or "", exit code of the eval, wanted exit code, wanted text
  local name=$1 code=0 out
  out=$(PATH="$tmp/bin:$PATH" TMPDIR=$tmp FAKE_JSON=$2 FAKE_STATUS=$3 \
    scripts/score-reviewer.sh HEAD 2>&1) || code=$?
  if [[ $code == "$4" && $out == *"$5"* ]]; then
    echo "  ✓ $name"
  else
    echo "  ✘ $name: exit $code, want exit $4 and \"$5\""
    echo "$out" | sed 's/^/    /'
    failed=1
  fi
}

check "timed-out runs count" "$tmp/timeouts.json" 0 0 \
  "HEAD: recall 0.5 (1 of 2 runs), clean 0.6 (3 of 5 runs), runs with an error 4"
check "a run with an API error does not pass" "$tmp/api-error.json" 1 1 \
  "HEAD: recall 0.67 (2 of 3 runs), clean 0.5 (1 of 2 runs), runs with an error 1"
check "no clean run has grader results" "$tmp/no-grader-results.json" 0 1 \
  "HEAD: a score has runs, but no run with grader results"
check "one recall run failed its scaffold, eval exits 0" "$tmp/one-scaffold-failure.json" 0 0 \
  "HEAD: recall 0.5 (1 of 2 runs), clean 1 (1 of 1 runs), runs with an error 1"
check "no recall run has grader results, eval exits 2" "$tmp/partial-no-recall-results.json" 2 2 \
  "HEAD: a score has runs, but no run with grader results"
check "only clean cases, recall 0 of 0" "$tmp/clean-only.json" 0 0 \
  "HEAD: recall none (0 of 0 runs), clean 0.5 (1 of 2 runs), runs with an error 0"
check "eval exits 0, no result" "" 0 1 "HEAD: no score"
check "eval exits 1, no result" "" 1 1 "HEAD: no score"
check "eval exits 3, no result" "" 3 3 "HEAD: no score"

if [ "$failed" -ne 0 ]; then
  echo "✘ score-reviewer.sh failed one or more checks."
  exit 1
fi
