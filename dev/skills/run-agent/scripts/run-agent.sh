#!/usr/bin/env bash
# Start one native agent of the dev plugin in a new `claude -p` process, for a
# host where the Agent tool cannot start it. Read the prompt on stdin. Print
# the JSON answer of the agent on stdout, and the evidence of the run on stderr.
# Exit non-zero when no JSON answer arrives.
#
# Usage: run-agent.sh dev:<agent> <checkout> [<folder>...] < <prompt file>
set -euo pipefail

if (( $# < 2 )); then
  echo "usage: $0 dev:<agent> <checkout> [<folder>...] < <prompt file>" >&2
  exit 2
fi

agent=$1 checkout=$(cd "$2" && pwd -P)
shift 2
name=${agent#dev:}

run_dir=$(mktemp -d "${TMPDIR:-/tmp}/run-agent.XXXXXX")
cat > "$run_dir/prompt.md"

# The native file comes from the installed plugin, never from the checkout under review.
plugin=$(cd "$run_dir" && claude plugin list --json | jq -c 'first(.[] | select(.id == "dev@skills" and .scope == "user" and .enabled))')
if [[ -z $plugin ]]; then
  echo "run-agent: claude plugin list shows no dev plugin that is on at user scope." >&2
  exit 1
fi
version=$(jq -r .version <<< "$plugin")
native=$(jq -r .installPath <<< "$plugin")/agents/$name.md
echo "run-agent: $agent from dev $version, $native" >&2

field() { awk -v key="$1: " '/^---$/ { if (++n == 2) exit; next } n == 1 && index($0, key) == 1 { print substr($0, length(key) + 1) }' "$native"; }
tools=$(field tools | tr ',' '\n' | sed 's/^ *//; s/ *$//')
flags=(-p --agent "$agent" --tools "$(grep -v '^mcp__' <<< "$tools" | paste -sd, -)"
  --setting-sources user --permission-prompts none --output-format stream-json --verbose --strict-mcp-config)
max_turns=$(field maxTurns)
[[ -z $max_turns ]] || flags+=(--max-turns "$max_turns")
effort=$(field effort)
[[ -z $effort ]] || flags+=(--effort "$effort")

(cd "$checkout" && claude "${flags[@]}" < "$run_dir/prompt.md" > "$run_dir/output.jsonl")
jq -r -R 'fromjson? | select(.type == "result") | .result' "$run_dir/output.jsonl" | tail -1
