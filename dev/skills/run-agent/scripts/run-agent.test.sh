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

sed 's/^name: .*/name: merge-judge/' "$tmp/install/agents/brief-judge.md" > "$tmp/install/agents/merge-judge.md"
for judge in brief-judge merge-judge; do
  run "dev:$judge" 'Judge.'
  work_dir=$(cat "$tmp/fake/pwd")
  if [[ $code == 0 && $work_dir != "$tmp/checkout"* && ! -s $tmp/fake/pwd-files && $(values --add-dir) == "$tmp/checkout" ]]; then
    pass "$judge starts in a new empty folder outside the checkout, and reads the checkout through --add-dir"
  else
    fail "$judge ran in $work_dir with files $(cat "$tmp/fake/pwd-files"), --add-dir $(values --add-dir)"
  fi
done

printf '%s' 'Judge.' | CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD=1 PATH="$tmp/bin:$PATH" ./run-agent.sh dev:brief-judge "$tmp/checkout" > /dev/null 2>&1 || true
if grep -q '^PATH=' "$tmp/fake/env" && ! grep -q '^CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD=' "$tmp/fake/env"; then
  pass "with CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD=1 in the caller, claude gets no such variable"
else
  fail "environment of claude: $(grep CLAUDE_CODE_ADDITIONAL "$tmp/fake/env")"
fi

context7='{"mcpServers":{"context7":{"type":"http","url":"https://mcp.context7.com/mcp"}}}'
for reviewer in pr-reviewer blast-radius finding-checker; do
  printf -- '---\nname: %s\ntools: Read, Grep, Glob, mcp__context7__query-docs, mcp__plugin_context7_context7__query-docs\nmaxTurns: 9\n---\n' "$reviewer" > "$tmp/install/agents/$reviewer.md"
  run "dev:$reviewer" 'Review the diff.' "$tmp/extra"
  if [[ $code == 0 && $(values --tools) == Read,Grep,Glob && $(values --mcp-config | jq -c .) == "$context7" ]] && has_flag --strict-mcp-config; then
    pass "$reviewer gets only the context7 server, and its built-in tools"
  else
    fail "$reviewer arguments: $(tr '\n' ' ' < "$tmp/fake/args")"
  fi
done
if [[ $(cat "$tmp/fake/pwd") == "$tmp/checkout" && $(values --add-dir) == "$tmp/extra" ]]; then
  pass "a reviewer starts in the checkout, and each more folder is an --add-dir folder"
else
  fail "finding-checker ran in $(cat "$tmp/fake/pwd") with --add-dir $(values --add-dir)"
fi

printf -- '---\nname: verifier\ntools: Bash, Read, Grep\nmaxTurns: 5\n---\n' > "$tmp/install/agents/verifier.md"
run dev:verifier 'Run git status.'
if [[ $code == 0 && $(values --tools) == Bash,Read,Grep && $(values --max-turns) == 5 ]] && ! has_flag --effort && ! has_flag --mcp-config; then
  pass "verifier gets no --effort when its native file sets none, and no MCP server"
else
  fail "verifier arguments: $(tr '\n' ' ' < "$tmp/fake/args")"
fi

# The fake plugin holds a native file for each name, so only the list of the script refuses them.
for agent in general-purpose dev:implementer dev:no-such-agent; do
  printf -- '---\nname: %s\ntools: Read\n---\n' "${agent#dev:}" > "$tmp/install/agents/${agent#dev:}.md"
  run "$agent" 'Build the brief.'
  if [[ $code != 0 && ! -s $tmp/stdout && ! -e $tmp/fake/calls ]] && grep -qF -- "$agent" "$tmp/stderr"; then
    pass "$agent exits non-zero, names the agent, and starts no claude"
  else
    fail "$agent: exit $code, claude calls: $(cat "$tmp/fake/calls" 2>/dev/null), stderr: $(cat "$tmp/stderr")"
  fi
done

run dev:security-reviewer 'Review the diff.'
if [[ $code != 0 && ! -s $tmp/stdout ]] && ! grep -q -- '^-p' "$tmp/fake/calls" && grep -qF dev:security-reviewer "$tmp/stderr"; then
  pass "an agent with no native file in the installed plugin exits non-zero, names the agent, and starts no claude -p"
else
  fail "security-reviewer with no native file: exit $code, claude calls: $(cat "$tmp/fake/calls"), stderr: $(cat "$tmp/stderr")"
fi

exit "$failed"
