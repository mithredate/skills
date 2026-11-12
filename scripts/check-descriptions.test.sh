#!/usr/bin/env bash
# Test scripts/check-descriptions.sh with fixed SKILL.md files. Every file goes
# to a temp folder that the test deletes.
set -euo pipefail

cd "$(dirname "$0")/.."

tmp=$(mktemp -d "${TMPDIR:-/tmp}/check-descriptions-test.XXXXXX")
trap 'rm -rf "$tmp"' EXIT

failed=0
check() { # name, frontmatter, wanted exit code, wanted text
  local name=$1 code=0 out file="$tmp/SKILL.md"
  printf -- '---\nname: tdd\n%s\n---\n\n# Body\n\nForces the simplest working solution.\n' "$2" >"$file"
  out=$(scripts/check-descriptions.sh "$file" 2>&1) || code=$?
  if [[ $code == "$3" && $out == *"$4"* ]]; then
    echo "  ✓ $name"
  else
    echo "  ✘ $name: exit $code, want exit $3 and \"$4\""
    echo "$out" | sed 's/^/    /'
    failed=1
  fi
}

check "a trigger sentence passes" \
  'description: Use when building a feature test-first, or when the user mentions TDD.' 0 ""
check "a description that only says what the skill does fails" \
  'description: Generates a PRD for a new feature and opens it on GitHub.' 1 \
  'the description does not start with "Use ".'
check "a summary before the trigger sentence fails" \
  'description: Forces the simplest working solution. Use on any coding task.' 1 \
  'the description does not start with "Use ".'
check "a summary after the trigger sentence fails" \
  'description: Use on any coding task. Forces the simplest working solution.' 1 \
  'the description has more than one sentence.'
check "a description of 150 characters fails" \
  "description: Use when $(printf 'x%.0s' {1..141})" 1 \
  'the description has 150 characters.'
check "a description in double quotes passes" \
  'description: "Use when the user says: be lazy."' 0 ""
check "a skill with no description fails" \
  'argument-hint: <topic>' 1 \
  'the description does not start with "Use ".'
check "a user-invoked skill is exempt" \
  $'description: One-screen report on every initiative. Read-only.\ndisable-model-invocation: true' 0 ""
check "the dot in a backtick name does not split a sentence" \
  'description: Use in a `.initiatives/` repo, or when a `CLAUDE.md` file changes.' 0 ""

exit "$failed"
