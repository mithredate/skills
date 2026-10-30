#!/usr/bin/env bash
# Test scripts/check-score-lines.sh with fixed changed paths and PR bodies.
# The test needs no network and no git.
set -euo pipefail

cd "$(dirname "$0")/.."

main='origin/main: recall 0.61 (11 of 18 runs), clean 0.8 (12 of 15 runs), runs with an error 0'
head='HEAD: recall 0.78 (14 of 18 runs), clean 0.6 (9 of 15 runs), runs with an error 0'
reviewer=$'AGENTS.md\ndev/agents/pr-reviewer.md\ndev/.claude-plugin/plugin.json'

failed=0
check() { # name, changed paths, PR body, wanted exit code, wanted text
  local name=$1 code=0 out
  out=$(BODY=$3 scripts/check-score-lines.sh <<<"$2" 2>&1) || code=$?
  if [[ $code == "$4" && $out == *"$5"* ]]; then
    echo "  ✓ $name"
  else
    echo "  ✘ $name: exit $code, want exit $4 and \"$5\""
    echo "$out" | sed 's/^/    /'
    failed=1
  fi
}

check "reviewer change, no score line" "$reviewer" "## Why" 1 \
  "no score line for: origin/main HEAD."
check "reviewer change, both score lines" "$reviewer" $'## Verified\n\n```\n'"$main"$'\n'"$head"$'\n```' 0 ""

if [ "$failed" -ne 0 ]; then
  echo "✘ check-score-lines.sh failed one or more checks."
  exit 1
fi
