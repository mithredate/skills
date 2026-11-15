#!/usr/bin/env bash
# Test scripts/score-writing.sh against a fake `claude` that writes a fixed
# aggregate-result.json and exits with a fixed code. The test needs no network
# and no real claude. Every file goes to a temp folder that the test deletes.
set -euo pipefail

cd "$(dirname "$0")/.."

tmp=$(mktemp -d "${TMPDIR:-/tmp}/score-writing-test.XXXXXX")
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

failed=0
check() {
  if [[ $2 == "$3" ]]; then
    echo "  ✓ $1"
  else
    echo "  ✘ $1"
    echo "    expected: $2"
    echo "    actual:   $3"
    failed=1
  fi
}
score() { PATH="$tmp/bin:$PATH" TMPDIR="$tmp" FAKE_JSON=$1 FAKE_STATUS=$2 scripts/score-writing.sh HEAD; }

# The english case has two runs of 3 checks each, and 5 of the 6 checks passed.
# The other case has one run of 2 checks, and 1 check passed.
cat > "$tmp/mixed.json" <<'EOF'
{"partial": false, "cases": [
 {"name": "english-a", "arms": {"with": [
   {"graders": [{"passed": true}, {"passed": true}, {"passed": true}], "error": null},
   {"graders": [{"passed": true}, {"passed": false}, {"passed": true}], "error": null}]}},
 {"name": "other-b", "arms": {"with": [
   {"graders": [{"passed": true}, {"passed": false}], "error": null}]}}
]}
EOF
check "prints the share of the passed checks for each kind of case" \
  "HEAD: writing english 0.83 (5 of 6 checks), other 0.5 (1 of 2 checks), runs with an error 0" \
  "$(score "$tmp/mixed.json" 0 | tail -1)"

# One run timed out with no grader results. It adds no check, and it counts as an error.
cat > "$tmp/error.json" <<'EOF'
{"partial": false, "cases": [
 {"name": "english-a", "arms": {"with": [
   {"graders": [{"passed": true}], "error": null},
   {"graders": [], "error": "timed out after 600s"}]}}
]}
EOF
check "counts a run with an error, and prints none for a kind with no checks" \
  "HEAD: writing english 1 (1 of 1 checks), other none (0 of 0 checks), runs with an error 1" \
  "$(score "$tmp/error.json" 0 | tail -1)"

# The eval wrote no result and exits 0. A missing score is a failure.
status=0
score "" 0 > /dev/null 2>&1 || status=$?
check "fails when the eval wrote no result" "1" "$status"

exit "$failed"
