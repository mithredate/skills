#!/usr/bin/env bash
# Run the pr-reviewer, security-reviewer, and blast-radius checklists on Codex,
# in parallel. Print one line for each role: the path of its JSON result, or
# "Codex review did not run: <reason>". A role that did not run never fails the
# script, so the review goes on with the Claude reviewers.
#
# Usage: codex-review.sh <out-dir> <repo-dir> <head> <base> <diff-file> <context-file>
set -euo pipefail

if (( $# != 6 )); then
  echo "usage: $0 <out-dir> <repo-dir> <head> <base> <diff-file> <context-file>" >&2
  exit 2
fi

roles=(pr-reviewer security-reviewer blast-radius)

if ! command -v codex >/dev/null 2>&1; then
  for role in "${roles[@]}"; do echo "$role: Codex review did not run: codex not found"; done
  exit 0
fi
