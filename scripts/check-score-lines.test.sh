#!/usr/bin/env bash
# Test scripts/check-score-lines.sh with fixed changed paths and PR bodies.
# The test needs no network and no git. Every file goes to a temp folder that
# the test deletes.
set -euo pipefail

cd "$(dirname "$0")/.."

tmp=$(mktemp -d "${TMPDIR:-/tmp}/check-score-lines-test.XXXXXX")
trap 'rm -rf "$tmp"' EXIT
main='origin/main: recall 0.61 (11 of 18 runs), clean 0.8 (12 of 15 runs), runs with an error 0'
head='HEAD: recall 0.78 (14 of 18 runs), clean 0.6 (9 of 15 runs), runs with an error 0'
reviewer=$'AGENTS.md\ndev/agents/pr-reviewer.md\ndev/.claude-plugin/plugin.json'
cases=$'AGENTS.md\ndev/evals/repo.bundle\ndev/evals/scaffold.sh'

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
check "reviewer change, only the HEAD line" "$reviewer" "$head" 1 \
  "no score line for: origin/main."
check "case change, scores in a table" "$cases" \
  '| `HEAD`, the reviewer after #117 | 0.78 (14 of 18 runs) | 0.6 (9 of 15 runs) | $10.33 |' 1 \
  $'    scripts/score-reviewer.sh HEAD\n'
check "case change, a score line inside a sentence" "$cases" "Mehrdad ran $head" 1 \
  "no score line for: HEAD."
# A body edited on github.com ends its lines with CRLF.
check "case change, a none score from a web edit" "$cases" \
  $'Scores:\r\nHEAD: recall none (0 of 0 runs), clean 0.5 (1 of 2 runs), runs with an error 0 (partial: cost_ceiling)\r\n' 0 ""
# git diff prints a path with a non-ASCII byte in double quotes, with octal escapes.
check "case change, a path that git quotes" 'AGENTS.md
"dev/evals/recall-caf\303\251/case.yaml"' "## Why" 1 "no score line for: HEAD."
check "no reviewer or case change" $'AGENTS.md\ndev/skills/fire/SKILL.md' "" 0 ""

# The body is untrusted. A command in it runs nothing.
check "a command in the body" "$cases" "\$(touch \"$tmp/pwned\") \`touch \"$tmp/pwned\"\`" 1 \
  "    HEAD: recall ..., clean ..., runs with an error ..."
if [[ -e $tmp/pwned ]]; then
  echo "  ✘ a command in the body: it ran and wrote $tmp/pwned"
  failed=1
fi

if [ "$failed" -ne 0 ]; then
  echo "✘ check-score-lines.sh failed one or more checks."
  exit 1
fi
