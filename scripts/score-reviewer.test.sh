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

# A run with no error key and no ended_on_api_error key is a normal run.
cat > "$tmp/mixed.json" <<'EOF'
{"partial": false, "cases": [
 {"name": "recall-a", "arms": {"with": [{"graders": [{"passed": true}]}, {"graders": [{"passed": false}]}]}},
 {"name": "recall-b", "arms": {"with": [{"graders": [{"passed": true}]},
   {"graders": [], "error": null, "ended_on_api_error": true}]}},
 {"name": "clean-x", "arms": {"with": [{"graders": [{"passed": true}, {"passed": true}]},
   {"graders": [{"passed": false}, {"passed": true}]}, {"graders": [{"passed": false}, {"passed": true}]},
   {"graders": [], "error": "timed out after 300s"}]}}
]}
EOF
cat > "$tmp/clean-ungraded.json" <<'EOF'
{"partial": false, "cases": [
 {"name": "recall-a", "arms": {"with": [{"graders": [{"passed": true}]}]}},
 {"name": "clean-x", "arms": {"with": [{"graders": [], "error": "timed out after 300s"},
   {"graders": [], "error": null, "ended_on_api_error": true}]}}
]}
EOF
cat > "$tmp/clean-only.json" <<'EOF'
{"partial": false, "cases": [
 {"name": "clean-pr74", "arms": {"with": [{"graders": [{"passed": true}, {"passed": true}]},
   {"graders": [{"passed": false}, {"passed": true}]}]}}
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

check "mixed runs" "$tmp/mixed.json" 0 0 \
  "HEAD: recall 0.67 (3 of 4 runs graded), clean 0.33 (3 of 4 runs graded), runs with an error 2"
check "every clean run ungraded, eval exits 0" "$tmp/clean-ungraded.json" 0 1 \
  "HEAD: recall 1 (1 of 1 runs graded), clean none (0 of 2 runs graded), runs with an error 2"
check "every clean run ungraded, eval exits 3" "$tmp/clean-ungraded.json" 3 3 \
  "HEAD: recall 1 (1 of 1 runs graded), clean none (0 of 2 runs graded), runs with an error 2"
check "only clean cases, recall 0 of 0" "$tmp/clean-only.json" 0 0 \
  "HEAD: recall none (0 of 0 runs graded), clean 0.5 (2 of 2 runs graded), runs with an error 0"
check "eval exits 0, no result" "" 0 1 "HEAD: no score"
check "eval exits 1, no result" "" 1 1 "HEAD: no score"
check "eval exits 3, no result" "" 3 3 "HEAD: no score"

if [ "$failed" -ne 0 ]; then
  echo "✘ score-reviewer.sh failed one or more checks."
  exit 1
fi
