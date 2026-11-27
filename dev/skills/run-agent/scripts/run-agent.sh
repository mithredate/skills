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
# An implementer needs edit prompts, and a general-purpose agent misses the spawn rules of the SubagentStart hook.
case $agent in
  dev:brief-judge | dev:merge-judge | dev:pr-reviewer | dev:security-reviewer | dev:blast-radius | dev:verifier | dev:finding-checker) ;;
  *)
    echo "run-agent: $agent has no fallback. The script starts only the seven native agents of dev." >&2
    exit 2
    ;;
esac

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
if [[ ! -f $native ]]; then
  echo "run-agent: dev $version has no native file for $agent." >&2
  exit 1
fi

field() { awk -v key="$1: " '/^---$/ { if (++n == 2) exit; next } n == 1 && index($0, key) == 1 { print substr($0, length(key) + 1) }' "$native"; }
tools=$(field tools | tr ',' '\n' | sed 's/^ *//; s/ *$//')
flags=(-p --agent "$agent" --tools "$(grep -v '^mcp__' <<< "$tools" | paste -sd, -)"
  --setting-sources user --permission-prompts none --output-format stream-json --verbose --strict-mcp-config)
max_turns=$(field maxTurns)
[[ -z $max_turns ]] || flags+=(--max-turns "$max_turns")
effort=$(field effort)
[[ -z $effort ]] || flags+=(--effort "$effort")
# The installed context7 plugin uses the same host and path.
if grep -q context7 <<< "$tools"; then
  flags+=(--mcp-config '{"mcpServers":{"context7":{"type":"http","url":"https://mcp.context7.com/mcp"}}}')
fi

# A judge needs only paths. Outside the checkout, it gets no CLAUDE.md of the branch under review.
work_dir=$checkout
if [[ $name == brief-judge || $name == merge-judge ]]; then
  work_dir=$run_dir/work
  mkdir "$work_dir"
  flags+=(--add-dir "$checkout")
fi
# A read outside the working folders asks for a permission, and no person answers it.
for folder in "$@"; do flags+=(--add-dir "$(cd "$folder" && pwd -P)"); done

echo "run-agent: prompt $run_dir/prompt.md, output $run_dir/output.jsonl" >&2
code=0
# claude loads the CLAUDE.md of each --add-dir folder when this variable is true.
(cd "$work_dir" && env -u CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD claude "${flags[@]}" < "$run_dir/prompt.md" > "$run_dir/output.jsonl") || code=$?

fail() {
  echo "run-agent: $1. The output is in $run_dir/output.jsonl." >&2
  exit 1
}
(( code == 0 )) || fail "claude exited $code"
result=$(jq -c -R 'fromjson? | select(.type == "result")' "$run_dir/output.jsonl" | tail -1)
[[ -n $result ]] || fail "the output has no result event"
jq -e '.is_error == false and .subtype == "success"' <<< "$result" > /dev/null \
  || fail "the result event is an error: $(jq -c '{subtype, is_error}' <<< "$result")"
answer=$(jq -r '.result | strings | (capture("^```[a-z]*\n(?<json>[\\s\\S]*)\n```\\s*$").json // .)' <<< "$result")
[[ $(jq -s length <<< "$answer" 2> /dev/null) == 1 ]] || fail "the result text is not one JSON value"
printf '%s\n' "$answer"
