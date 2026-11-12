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

out_dir=$1 repo=$2 head=$3 base=$4 diff_file=$5 context_file=$6
here=$(cd "$(dirname "$0")" && pwd)
mkdir -p "$out_dir"

# Print the body of the agent file of a role, with no frontmatter.
agent_body() { awk 'n >= 2; /^---$/ { n++ }' "$here/../../../agents/$1.md"; }

prompt() { # role, directory
  agent_body "$1"
  cat <<PROMPT

## Inputs of this run

You run in the Codex CLI, not in Claude Code. Where the text above names a Claude Code tool, such as Read, Grep, Glob, or Context7, use your shell or your own tools.

- Diff file: $diff_file
- Repo root: $2
- Base commit: $base
- Head commit: $head

The caller gives the rest of the inputs below.

$(cat "$context_file")
PROMPT
}

# Write the result line of a role to <out-dir>/<role>.status.
run_role() { # role, directory, sandbox
  local role=$1 dir=$2 sandbox=$3 code=0
  prompt "$role" "$dir" > "$out_dir/$role.prompt"
  codex exec -C "$dir" -s "$sandbox" --color never \
    --output-schema "$here/$role.schema.json" -o "$out_dir/$role.json" - \
    < "$out_dir/$role.prompt" > "$out_dir/$role.log" 2>&1 || code=$?
  if (( code != 0 )); then
    echo "$role: Codex review did not run: codex exited $code" > "$out_dir/$role.status"
    return
  fi
  echo "$role: $out_dir/$role.json" > "$out_dir/$role.status"
}

run_role pr-reviewer "$repo" read-only &
run_role security-reviewer "$repo" read-only &
wait
for role in "${roles[@]}"; do cat "$out_dir/$role.status" 2>/dev/null || true; done
