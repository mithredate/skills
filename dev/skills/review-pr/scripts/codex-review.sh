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
out_dir=$(cd "$out_dir" && pwd -P)
home=$(cd "$HOME" && pwd -P)

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

# Print the filesystem table of the Codex permissions profile of a role. The
# run reads nothing under $HOME, where the credentials live. It writes nowhere
# but in the clone of blast-radius. The out-dir stays unwritable, so a role
# cannot change the result of another role.
filesystem() { # role, clone
  local table="\"$home\" = \"none\", \":slash_tmp\" = \"read\", \":tmpdir\" = \"read\", \"$out_dir\" = \"read\""
  if [[ $1 == blast-radius ]]; then table+=", \"$2\" = \"write\""; fi
  echo "{$table}"
}

# Write the result line of a role to <out-dir>/<role>.status.
run_role() { # role, directory, base profile
  local role=$1 dir=$2 base_profile=$3 code=0
  local answer=$out_dir/$role.answer.json
  rm -f "$out_dir/$role.json" "$answer"
  prompt "$role" "$dir" > "$out_dir/$role.prompt"
  perl -e 'alarm shift; exec @ARGV or die' "$time_limit" codex exec -C "$dir" \
    -c default_permissions='"review"' -c permissions.review.extends="\"$base_profile\"" \
    -c permissions.review.filesystem="$(filesystem "$role" "$dir")" --color never \
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

# Each role reviews a clone of its own. Codex gives a registered worktree the
# trust of its main repo, and then loads the .codex/config.toml of the PR. Git
# reads no user config and runs no hook here, so no file of the PR runs. The
# clone stops borrowing objects at the end, because Codex cannot read them in
# the repo under $HOME.
clean_git() { GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_NOSYSTEM=1 git -c core.hooksPath=/dev/null "$@"; }
make_clone() { # clone directory
  rm -rf "$1"
  clean_git clone -q --shared --no-checkout "$repo" "$1" \
    && clean_git -C "$1" checkout -q --detach "$head" \
    && clean_git -C "$1" repack -q -a -d \
    && rm "$1/.git/objects/info/alternates"
}
review() { # role, base profile
  local clone=$clones/$1
  if make_clone "$clone" >/dev/null 2>&1; then
    run_role "$1" "$clone" "$2"
  else
    echo "$1: Codex review did not run: git clone failed" > "$out_dir/$1.status"
  fi
  rm -rf "$clone"
}

clones=$out_dir/clones
for role in "${roles[@]}"; do rm -f "$out_dir/$role.status"; done
review pr-reviewer :read-only &
review security-reviewer :read-only &
review blast-radius :workspace &
wait
for role in "${roles[@]}"; do
  cat "$out_dir/$role.status" 2>/dev/null || echo "$role: Codex review did not run: the script failed before codex ran"
done
rmdir "$clones" 2>/dev/null || true
for role in "${roles[@]}"; do
  if [[ -e $clones/$role ]]; then echo "Codex clone kept: $clones/$role"; fi
done
