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
# The test sets a short limit. A hung run must not hold the review open.
time_limit=${CODEX_REVIEW_TIMEOUT:-1800}

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

# Check a JSON answer against the subset of JSON Schema that the schema files use.
conforms() { # schema file, answer file
  jq -e --slurpfile schema "$1" '
    def conforms($s):
      if $s.type == "object" then
        type == "object"
        and ($s.required - keys) == []
        and all(to_entries[]; .key as $k | $s.properties[$k] as $p | $p != null and (.value | conforms($p)))
      elif $s.type == "array" then type == "array" and all(.[]; conforms($s.items))
      elif $s.type == "string" then type == "string" and (. as $v | $s.enum == null or ($s.enum | any(. == $v)))
      else false end;
    conforms($schema[0])' "$2" >/dev/null 2>&1
}

# Print the paths that the Claude Code sandbox denies to read, as a TOML table
# for a Codex permissions profile. Claude turns each Read() deny rule into a
# sandbox read denial. A rule path is relative to the run directory unless it
# starts with ~/ or //.
read_denials() { # run directory
  local files=() f
  for f in "/Library/Application Support/ClaudeCode/managed-settings.json" \
    "/Library/Application Support/ClaudeCode/managed-settings.d/"*.json \
    /etc/claude-code/managed-settings.json /etc/claude-code/managed-settings.d/*.json \
    "${CLAUDE_CONFIG_DIR:-$HOME/.claude}/settings.json" \
    "$1/.claude/settings.json" "$1/.claude/settings.local.json"; do
    if [[ -f $f ]]; then files+=("$f"); fi
  done
  (( ${#files[@]} )) || return 1
  jq -rs --arg home "$HOME" --arg dir "$1" '
    def expand: if startswith("~/") then $home + .[1:] else . end;
    [.[] | (.permissions.deny // [])[] | capture("^Read\\((?<p>.+)\\)$").p
      | sub("/\\*\\*$"; "")
      | if startswith("//") then .[1:] elif startswith("~/") then expand else $dir + "/" + ltrimstr("./") end]
    + [.[] | (.sandbox.filesystem.denyRead // [])[] | expand]
    | unique | "{" + (map(tojson + " = \"none\"") | join(", ")) + "}"' "${files[@]}"
}

# Write the result line of a role to <out-dir>/<role>.status.
run_role() { # role, directory, base profile
  local role=$1 dir=$2 base_profile=$3 code=0 denials
  local answer=$out_dir/$role.answer.json
  rm -f "$out_dir/$role.json" "$answer"
  if ! denials=$(read_denials "$dir" 2>/dev/null); then
    echo "$role: Codex review did not run: cannot read the read denials of the Claude settings" > "$out_dir/$role.status"
    return
  fi
  prompt "$role" "$dir" > "$out_dir/$role.prompt"
  perl -e 'alarm shift; exec @ARGV or die' "$time_limit" codex exec -C "$dir" \
    -c default_permissions='"review"' -c permissions.review.extends="\"$base_profile\"" \
    -c permissions.review.filesystem="$denials" --color never \
    --output-schema "$here/$role.schema.json" -o "$answer" - \
    < "$out_dir/$role.prompt" > "$out_dir/$role.log" 2>&1 || code=$?
  if (( code == 142 )); then
    echo "$role: Codex review did not run: timed out after ${time_limit}s" > "$out_dir/$role.status"
    return
  fi
  if (( code != 0 )); then
    echo "$role: Codex review did not run: codex exited $code" > "$out_dir/$role.status"
    return
  fi
  if ! conforms "$here/$role.schema.json" "$answer"; then
    echo "$role: Codex review did not run: the answer does not match the schema" > "$out_dir/$role.status"
    return
  fi
  mv "$answer" "$out_dir/$role.json"
  echo "$role: $out_dir/$role.json" > "$out_dir/$role.status"
}

# blast-radius runs commands, so it writes only in a worktree of its own. A
# worktree that an earlier round left can be at an old head, so it goes first.
remove_worktree() {
  git -C "$repo" worktree remove --force "$worktree" >/dev/null 2>&1 || rm -rf "$worktree"
  git -C "$repo" worktree prune
}
run_blast_radius() {
  if git -C "$repo" worktree add -q --detach "$worktree" "$head" >/dev/null 2>&1; then
    run_role blast-radius "$worktree" :workspace
  else
    echo "blast-radius: Codex review did not run: git worktree add failed" > "$out_dir/blast-radius.status"
  fi
  remove_worktree
}

worktree=$out_dir/blast-radius-worktree
for role in "${roles[@]}"; do rm -f "$out_dir/$role.status"; done
remove_worktree
run_role pr-reviewer "$repo" :read-only &
run_role security-reviewer "$repo" :read-only &
run_blast_radius &
wait
for role in "${roles[@]}"; do
  cat "$out_dir/$role.status" 2>/dev/null || echo "$role: Codex review did not run: the script failed before codex ran"
done
if [[ -e $worktree ]]; then echo "Codex worktree kept: $worktree"; fi
