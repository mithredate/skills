#!/usr/bin/env bash
# Test run-agent.sh against a fake `claude` and a fake installed dev plugin,
# with no network. Every file goes to a temp folder that the test deletes.
set -euo pipefail

cd "$(dirname "$0")"

tmp=$(cd "$(mktemp -d "${TMPDIR:-/tmp}/run-agent-test.XXXXXX")" && pwd -P)
trap 'rm -rf "$tmp"' EXIT
export TMPDIR=$tmp/runs
mkdir "$TMPDIR" "$tmp/bin" "$tmp/fake" "$tmp/checkout" "$tmp/extra"

# The values differ from dev/agents/ of the repo, so a test fails if the script reads the repo.
mkdir -p "$tmp/install/agents"
cat > "$tmp/install/agents/brief-judge.md" <<'EOF'
---
name: brief-judge
tools: Read, Grep, Glob, Skill
skills:
  - productivity:settle-decisions
model: sonnet
effort: high
maxTurns: 7
---
Judge the brief.
EOF
jq -n --arg path "$tmp/install" '[
  {id: "context7@claude-plugins-official", version: "1", scope: "user", enabled: true, installPath: "/nowhere"},
  {id: "dev@skills", version: "0.9.9", scope: "user", enabled: true, installPath: $path}]' > "$tmp/fake/plugins.json"

# The checkout under review defines its own brief-judge, which the script must not read.
mkdir -p "$tmp/checkout/dev/agents"
printf -- '---\nname: brief-judge\ntools: Read, Edit, Write, Bash\nmaxTurns: 99\n---\n' > "$tmp/checkout/dev/agents/brief-judge.md"

cat > "$tmp/bin/claude" <<'EOF'
#!/usr/bin/env bash
# Append each call to fake/calls. For `plugin list`, print fake/plugins.json.
# Otherwise write the arguments, one per line, to fake/args, the environment to
# fake/env, the working directory to fake/pwd, its files to fake/pwd-files, and
# stdin to fake/stdin. Print fake/out, and exit with fake/status, or 0.
fake=$(dirname "$0")/../fake
echo "$*" >> "$fake/calls"
if [[ $1 == plugin ]]; then cat "$fake/plugins.json"; exit 0; fi
printf '%s\n' "$@" > "$fake/args"
env > "$fake/env"
pwd -P > "$fake/pwd"
ls -A > "$fake/pwd-files"
cat > "$fake/stdin"
cat "$fake/out"
exit "$(cat "$fake/status" 2>/dev/null || echo 0)"
EOF
chmod +x "$tmp/bin/claude"

failed=0
pass() { echo "  ✓ $1"; }
fail() { echo "  ✘ $1"; failed=1; }

# Write fake/out: an init event, then a result event with the given text.
answer() { # result text
  {
    echo '{"type":"system","subtype":"init","tools":["Read"]}'
    jq -cn --arg r "$1" '{type: "result", subtype: "success", is_error: false, result: $r}'
  } > "$tmp/fake/out"
}

run() { # agent, prompt, more arguments
  local agent=$1 prompt=$2
  shift 2
  rm -f "$tmp/fake/calls" "$tmp/fake/args"
  printf '%s' "$prompt" | PATH="$tmp/bin:$PATH" ./run-agent.sh "$agent" "$tmp/checkout" "$@" > "$tmp/stdout" 2> "$tmp/stderr" && code=0 || code=$?
}

# Print the value after each flag of the name in fake/args.
values() { grep -A1 -x -- "$1" "$tmp/fake/args" | grep -vx -- "$1" | grep -vx -- -- || true; }
has_flag() { grep -qx -- "$1" "$tmp/fake/args"; }

judge_json='{"verdict": "auto", "gaps": []}'
answer "$judge_json"
run dev:brief-judge 'Judge the brief in brief.md.'
if [[ $code == 0 && $(cat "$tmp/stdout") == "$judge_json" ]]; then
  pass "a result event with one JSON value prints that JSON unchanged and exits 0"
else
  fail "brief-judge: exit $code, stdout: $(cat "$tmp/stdout"), stderr: $(cat "$tmp/stderr")"
fi
if has_flag -p && [[ $(values --agent) == dev:brief-judge && $(values --tools) == Read,Grep,Glob,Skill \
  && $(values --max-turns) == 7 && $(values --effort) == high && $(values --setting-sources) == user \
  && $(values --permission-prompts) == none && $(values --output-format) == stream-json ]] \
  && has_flag --verbose && has_flag --strict-mcp-config && ! has_flag --mcp-config; then
  pass "brief-judge gets the built-in tools, the maxTurns, and the effort of the installed native file, and no MCP server"
else
  fail "brief-judge arguments: $(tr '\n' ' ' < "$tmp/fake/args")"
fi
if has_flag -p && ! grep -qx -e --settings -e --plugin-dir -e --resume -e --continue -e -c -e -r "$tmp/fake/args"; then
  pass "the process gets no --settings, no --plugin-dir, no --resume, and no --continue"
else
  fail "forbidden flag in: $(tr '\n' ' ' < "$tmp/fake/args")"
fi
if [[ $(cat "$tmp/fake/stdin") == 'Judge the brief in brief.md.' ]]; then
  pass "the prompt reaches claude on stdin"
else
  fail "stdin of claude: $(cat "$tmp/fake/stdin")"
fi
if grep -q 'dev 0\.9\.9' "$tmp/stderr"; then
  pass "the evidence on stderr names the dev version that claude plugin list gives"
else
  fail "stderr: $(cat "$tmp/stderr")"
fi

exit "$failed"
