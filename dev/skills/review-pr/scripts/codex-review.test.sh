#!/usr/bin/env bash
# Test codex-review.sh against a fake `codex` and a small git repo, with no
# network. Every file goes to a temp folder that the test deletes.
set -euo pipefail

cd "$(dirname "$0")"

tmp=$(mktemp -d "${TMPDIR:-/tmp}/codex-review-test.XXXXXX")
trap 'rm -rf "$tmp"' EXIT

git init -q "$tmp/repo"
git -C "$tmp/repo" -c user.name=t -c user.email=t@t commit -q --allow-empty -m base
base=$(git -C "$tmp/repo" rev-parse HEAD)
echo one > "$tmp/repo/a.txt"
git -C "$tmp/repo" add a.txt
git -C "$tmp/repo" -c user.name=t -c user.email=t@t commit -q -m head
head=$(git -C "$tmp/repo" rev-parse HEAD)
git -C "$tmp/repo" diff "$base" "$head" > "$tmp/pr.diff"
echo "Brief: add a.txt" > "$tmp/context.md"

failed=0
pass() { echo "  ✓ $1"; }
fail() { echo "  ✘ $1"; failed=1; }

out=$(PATH=/usr/bin:/bin ./codex-review.sh "$tmp/out" "$tmp/repo" "$head" "$base" "$tmp/pr.diff" "$tmp/context.md") && code=0 || code=$?
want='pr-reviewer: Codex review did not run: codex not found
security-reviewer: Codex review did not run: codex not found
blast-radius: Codex review did not run: codex not found'
if [[ $code == 0 && $out == "$want" ]]; then
  pass "with no codex on PATH, each role reports that it did not run"
else
  fail "with no codex on PATH: exit $code, output:"
  echo "$out" | sed 's/^/    /'
fi

exit "$failed"
