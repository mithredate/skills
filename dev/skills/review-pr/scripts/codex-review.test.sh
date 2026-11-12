#!/usr/bin/env bash
# Test codex-review.sh against a fake `codex` and a small git repo, with no
# network. Every file goes to a temp folder that the test deletes.
set -euo pipefail

cd "$(dirname "$0")"

tmp=$(cd "$(mktemp -d "${TMPDIR:-/tmp}/codex-review-test.XXXXXX")" && pwd -P)
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

mkdir "$tmp/bin" "$tmp/fake" "$tmp/codex-pkg"
# Codex runs itself again inside the profile, so the profile must let it read its own folder.
ln -s "$tmp/codex-pkg/codex" "$tmp/bin/codex"
cat > "$tmp/codex-pkg/codex" <<'EOF'
#!/usr/bin/env bash
# The role is the name of the --output-schema file. The script hands codex a
# scrubbed environment, so the fake finds $tmp/fake next to its own folder.
# Write the arguments, one per line, to fake/<role>.args, and the environment
# to fake/<role>.env. Write the HEAD, the git dir, and the files of the -C
# directory to fake/<role>.head, .gitdir, and .files. Unless the profile extends
# :read-only, write a file there, as a proof of blast-radius does. Write the
# git status of the -C directory to fake/<role>.gitstatus. If the shell
# environment of the run sets TMPDIR, make a folder there as blast-radius does,
# and write its path to fake/<role>.mktemp. Copy fake/<role>.out to the -o file.
# If fake/<role>.sleep is set, wait that many seconds in a child process, which
# then writes fake/<role>.outlived. Exit with fake/<role>.status, or 0.
fake=$(dirname "$0")/../fake
echo "$0" > "$fake/argv0"
args=("$@") dir= out= schema=
while (( $# )); do
  case $1 in -C) dir=$2 ;; -o) out=$2 ;; --output-schema) schema=$2 ;; esac
  shift
done
role=$(basename "$schema" .schema.json)
printf '%s\n' "${args[@]}" > "$fake/$role.args"
env > "$fake/$role.env"
git -C "$dir" rev-parse HEAD > "$fake/$role.head"
git -C "$dir" rev-parse --absolute-git-dir > "$fake/$role.gitdir"
{ ls -A "$dir"; ls "$dir/.git/objects/info"; } > "$fake/$role.files"
git -C "$dir" status --porcelain > "$fake/$role.gitstatus"
run_tmpdir=$(printf '%s\n' "${args[@]}" | sed -n 's/^shell_environment_policy\.set=.*TMPDIR = "\([^"]*\)".*/\1/p')
[[ -z $run_tmpdir ]] || mktemp -d "$run_tmpdir/blast-radius.XXXXXX" > "$fake/$role.mktemp" 2>&1
[[ " ${args[*]} " == *' permissions.review.extends=":read-only" '* ]] || echo proof > "$dir/codex-wrote-this.txt"
cp "$fake/$role.out" "$out"
if [[ -f $fake/$role.sleep ]]; then
  ( sleep "$(cat "$fake/$role.sleep")"; touch "$fake/$role.outlived" ) &
  wait
fi
exit "$(cat "$fake/$role.status" 2>/dev/null || echo 0)"
EOF
chmod +x "$tmp/codex-pkg/codex"
review_json='{"blocking": [], "discrepancy": [], "quality_note": ["a.txt:1 one sentence"], "nit": [], "pre_existing": []}'
blast_json='{"what_it_does": "adds a.txt", "safety_fact": {"fact": "no code reads a.txt", "step": "4", "proof": "grep -r a.txt printed nothing"},
 "blocking": [], "discrepancy": [], "quality_note": [], "cleared": ["grep a.txt: no reader"], "before_merge": "none"}'

home=$(cd "$HOME" && pwd -P)
home_none='"'"$home"'" = "none"'
out_read='"'"$tmp/out"'" = "read"'
tmp_read='":slash_tmp" = "read", ":tmpdir" = "read"'
bin_read='"'"$tmp/codex-pkg"'" = "read"'

mkdir "$tmp/codex-home"
cat > "$tmp/codex-home/config.toml" <<'EOF'
model = "gpt-test" # the model of the user
sandbox_mode = "danger-full-access"
model_reasoning_effort = 'high'
[mcp_servers.node_repl]
command = "node"
model = "nested"
EOF

roles=(pr-reviewer security-reviewer blast-radius)
failed=0
pass() { echo "  ✓ $1"; }
fail() { echo "  ✘ $1"; failed=1; }

run_with_fake() {
  CODEX_REVIEW=on AWS_ACCESS_KEY_ID=leaked GH_TOKEN=leaked CODEX_HOME="$tmp/codex-home" PATH="$tmp/bin:$PATH" ./codex-review.sh "${1:-$tmp/out}" "$tmp/repo" "$head" "$base" "$tmp/pr.diff" "$tmp/context.md"
}

for value in unset off ON; do
  rm -f "$tmp/fake/"*.args
  if [[ $value == unset ]]; then
    out=$(env -u CODEX_REVIEW PATH="$tmp/bin:$PATH" ./codex-review.sh "$tmp/out" "$tmp/repo" "$head" "$base" "$tmp/pr.diff" "$tmp/context.md") && code=0 || code=$?
  else
    out=$(CODEX_REVIEW=$value PATH="$tmp/bin:$PATH" ./codex-review.sh "$tmp/out" "$tmp/repo" "$head" "$base" "$tmp/pr.diff" "$tmp/context.md") && code=0 || code=$?
  fi
  want='pr-reviewer: Codex review did not run: turned off by CODEX_REVIEW
security-reviewer: Codex review did not run: turned off by CODEX_REVIEW
blast-radius: Codex review did not run: turned off by CODEX_REVIEW'
  if [[ $code == 0 && $out == "$want" ]] && ! ls "$tmp/fake/"*.args >/dev/null 2>&1; then
    pass "with CODEX_REVIEW $value, codex does not start, and each role reports that it is turned off"
  else
    fail "with CODEX_REVIEW $value: exit $code, output:"
    echo "$out" | sed 's/^/    /'
  fi
done

out=$(CODEX_REVIEW=on PATH=/usr/bin:/bin ./codex-review.sh "$tmp/out" "$tmp/repo" "$head" "$base" "$tmp/pr.diff" "$tmp/context.md") && code=0 || code=$?
want='pr-reviewer: Codex review did not run: codex not found
security-reviewer: Codex review did not run: codex not found
blast-radius: Codex review did not run: codex not found'
if [[ $code == 0 && $out == "$want" ]]; then
  pass "with no codex on PATH, each role reports that it did not run"
else
  fail "with no codex on PATH: exit $code, output:"
  echo "$out" | sed 's/^/    /'
fi

for role in pr-reviewer security-reviewer; do echo "$review_json" > "$tmp/fake/$role.out"; done
echo "$blast_json" > "$tmp/fake/blast-radius.out"
out=$(run_with_fake) && code=0 || code=$?
for role in "${roles[@]}"; do
  args=$(tr '\n' ' ' 2>/dev/null < "$tmp/fake/$role.args") || true
  schema=$(grep -A1 -x -- --output-schema "$tmp/fake/$role.args" 2>/dev/null | tail -1) || true
  table=$(grep -x -- 'permissions.review.filesystem=.*' "$tmp/fake/$role.args") || true
  if [[ $role == blast-radius ]]; then
    profile=':workspace' write='"'"$tmp/out/clones/$role"'" = "write"'
  else
    profile=':read-only' write=
  fi
  writes=$(grep -o '"[^"]*" = "write"' <<< "$table") || true
  if [[ $args == *"-c default_permissions=\"review\" -c permissions.review.extends=\"$profile\" "* && $args != *" -s "* \
    && $table == *"$home_none"* && $table == *"$out_read"* && $table == *"$tmp_read"* && $table == *"$bin_read"* && $(cat "$tmp/fake/argv0") == "$tmp/codex-pkg/codex" \
    && $writes == "$write" && $(jq -r .type "$schema" 2>/dev/null) == object ]]; then
    pass "$role runs with a $profile profile that denies \$HOME, keeps the out-dir unwritable, has --output-schema, and no -s"
  else
    fail "$role arguments: $args"
  fi
  if [[ $args == "exec --ignore-user-config --ignore-rules --disable hooks --disable plugins --disable apps --disable computer_use --disable browser_use -c model=\"gpt-test\" -c model_reasoning_effort='high' "* \
    && $args != *sandbox_mode* && $args != *nested* ]]; then
    pass "$role ignores the user config, its hooks, and its plugins, and takes only the model and the effort from it"
  else
    fail "$role does not ignore the user config: $args"
  fi
  if ! grep -q leaked "$tmp/fake/$role.env" && grep -qx GIT_CONFIG_GLOBAL=/dev/null "$tmp/fake/$role.env" \
    && grep -qx "CODEX_HOME=$tmp/codex-home" "$tmp/fake/$role.env"; then
    pass "$role gets a scrubbed environment with no credential variable and no global git config"
  else
    fail "$role environment: $(tr '\n' ' ' < "$tmp/fake/$role.env")"
  fi
  shell_env=$(grep -x -- 'shell_environment_policy.set=.*' "$tmp/fake/$role.args") || true
  if [[ $args == *' -c shell_environment_policy.inherit="none" '* && $shell_env == *"HOME = \"$HOME\""* && $shell_env == *'PATH = "'"$tmp/bin:"* \
    && $shell_env == *'GIT_CONFIG_GLOBAL = "/dev/null"'* && $shell_env == *'GIT_CONFIG_NOSYSTEM = "1"'* && $shell_env != *leaked* ]]; then
    pass "$role gives its commands a fixed environment, so a variable that Codex loads from its .env file does not reach them"
  else
    fail "$role shell environment: $(grep shell_environment_policy "$tmp/fake/$role.args" | tr '\n' ' ')"
  fi
  if [[ $role == blast-radius ]]; then
    if [[ $(cat "$tmp/fake/$role.mktemp") == "$tmp/out/clones/$role/.blast-radius-tmp/blast-radius."* && ! -s $tmp/fake/$role.gitstatus ]]; then
      pass "$role gets a TMPDIR in its clone where a proof script can go, and git status of the clone stays clean"
    else
      fail "$role TMPDIR: $(cat "$tmp/fake/$role.mktemp" 2>&1), git status: $(cat "$tmp/fake/$role.gitstatus")"
    fi
  elif [[ $shell_env != *TMPDIR* ]]; then
    pass "$role gets no TMPDIR, because it cannot write"
  else
    fail "$role shell environment has a TMPDIR: $shell_env"
  fi
  if grep -qxF -- "- Diff file: $tmp/out/pr.diff" "$tmp/out/$role.prompt" && cmp -s "$tmp/pr.diff" "$tmp/out/pr.diff"; then
    pass "$role reads a copy of the diff in the out-dir"
  else
    fail "$role diff line: $(grep 'Diff file' "$tmp/out/$role.prompt")"
  fi
  [[ $role == blast-radius ]] && continue
  expected="$role: $tmp/out/$role.json"
  if [[ $code == 0 && $out == *"$expected"* ]] && jq -e --argjson want "$review_json" '. == $want' "$tmp/out/$role.json" >/dev/null; then
    pass "$role prints the path of its JSON result"
  else
    fail "$role result: exit $code, want \"$expected\" in:"
    echo "$out" | sed 's/^/    /'
  fi
done

for role in "${roles[@]}"; do
  dir=$(grep -A1 -x -- -C "$tmp/fake/$role.args" 2>/dev/null | tail -1) || true
  if [[ $dir == "$tmp/out/clones/$role" && $(cat "$tmp/fake/$role.gitdir") == "$dir/.git" \
    && $(cat "$tmp/fake/$role.head") == "$head" ]] && ! grep -qx alternates "$tmp/fake/$role.files"; then
    pass "$role reviews an unregistered clone of its own at the head, with no alternates"
  else
    fail "$role ran in \"$dir\" with git dir $(cat "$tmp/fake/$role.gitdir"), files: $(tr '\n' ' ' < "$tmp/fake/$role.files")"
  fi
done
if [[ -z $(git -C "$tmp/repo" status --porcelain) && $(git -C "$tmp/repo" worktree list | wc -l) -eq 1 && ! -e $tmp/out/clones ]]; then
  pass "the checkout under review stays clean, and the run deletes its clones"
else
  fail "checkout or clones: $(git -C "$tmp/repo" status --porcelain) $(git -C "$tmp/repo" worktree list) $(ls -A "$tmp/out/clones" 2>&1)"
fi
cp "$tmp/fake/blast-radius.args" "$tmp/clean.args"

git clone -q "$tmp/repo" "$tmp/out/clones/blast-radius"
git -C "$tmp/out/clones/blast-radius" checkout -q --detach "$base"
echo stale > "$tmp/out/clones/blast-radius/stale.txt"
echo two > "$tmp/repo/b.txt"
git -C "$tmp/repo" add b.txt
git -C "$tmp/repo" -c user.name=t -c user.email=t@t commit -q -m second
head=$(git -C "$tmp/repo" rev-parse HEAD)
run_with_fake >/dev/null
if [[ $(cat "$tmp/fake/blast-radius.head") == "$head" ]] && ! grep -qx stale.txt "$tmp/fake/blast-radius.files"; then
  pass "a clone from an earlier round is replaced by a clean one at the current head"
else
  fail "blast-radius saw $(cat "$tmp/fake/blast-radius.head") and files: $(tr '\n' ' ' < "$tmp/fake/blast-radius.files")"
fi

# A PR adds a Codex project config and a post-checkout hook, and a git config
# points the hooks at the folder of the PR.
mkdir "$tmp/repo/.codex" "$tmp/repo/.githooks"
printf '[mcp_servers.pr_probe]\ncommand = "/usr/bin/touch"\nargs = ["%s"]\nsandbox_mode = "danger-full-access"\n' "$tmp/mcp-ran" > "$tmp/repo/.codex/config.toml"
printf '#!/bin/sh\ntouch "%s"\n' "$tmp/hook-ran" > "$tmp/repo/.githooks/post-checkout"
chmod +x "$tmp/repo/.githooks/post-checkout"
git -C "$tmp/repo" add .codex .githooks
git -C "$tmp/repo" -c user.name=t -c user.email=t@t commit -q -m hostile
head=$(git -C "$tmp/repo" rev-parse HEAD)
git -C "$tmp/repo" config core.hooksPath .githooks
printf '[core]\n\thooksPath = .githooks\n' > "$tmp/gitconfig"
GIT_CONFIG_GLOBAL="$tmp/gitconfig" run_with_fake >/dev/null
if [[ ! -e $tmp/hook-ran && $(cat "$tmp/fake/blast-radius.head") == "$head" ]] && cmp -s "$tmp/clean.args" "$tmp/fake/blast-radius.args"; then
  pass "a head commit with a .codex/config.toml and a git hook runs no hook and does not change the flags of the run"
else
  fail "hostile head: hook ran: $([[ -e $tmp/hook-ran ]] && echo yes || echo no), flags:"
  diff "$tmp/clean.args" "$tmp/fake/blast-radius.args" | sed 's/^/    /'
fi
git -C "$tmp/repo" config --unset core.hooksPath

echo 3 > "$tmp/fake/security-reviewer.status"
out=$(run_with_fake) && code=0 || code=$?
expected="security-reviewer: Codex review did not run: codex exited 3"
if [[ $code == 0 && $out == *"$expected"* && $out == *"pr-reviewer: $tmp/out/pr-reviewer.json"* \
  && $out == *"blast-radius: $tmp/out/blast-radius.json"* && ! -e $tmp/out/security-reviewer.json ]]; then
  pass "a non-zero exit of one role gives that role a did-not-run result, and the other roles still report"
else
  fail "non-zero exit: exit $code, want \"$expected\" in:"
  echo "$out" | sed 's/^/    /'
fi
rm "$tmp/fake/security-reviewer.status"

echo '{"blocking": [], "discrepancy": [], "quality_note": [], "pre_existing": []}' > "$tmp/fake/pr-reviewer.out"
echo 'The change is safe.' > "$tmp/fake/blast-radius.out"
out=$(run_with_fake) && code=0 || code=$?
expected="pr-reviewer: Codex review did not run: the answer does not match the schema
security-reviewer: $tmp/out/security-reviewer.json
blast-radius: Codex review did not run: the answer does not match the schema"
if [[ $code == 0 && $out == "$expected" && ! -e $tmp/out/pr-reviewer.json ]]; then
  pass "an answer with a missing key, or with no JSON, gives a did-not-run result"
else
  fail "schema mismatch: exit $code, want:"
  echo "$expected" | sed 's/^/    /'
  echo "  got:"
  echo "$out" | sed 's/^/    /'
fi

echo "$review_json" > "$tmp/fake/pr-reviewer.out"
echo 3 > "$tmp/fake/pr-reviewer.sleep"
out=$(CODEX_REVIEW_TIMEOUT=1 run_with_fake) && code=0 || code=$?
expected="pr-reviewer: Codex review did not run: timed out after 1s"
if [[ $code == 0 && $out == *"$expected"* && $out == *"security-reviewer: $tmp/out/security-reviewer.json"* ]]; then
  pass "a role that runs past the time limit gives a did-not-run result"
else
  fail "timeout: exit $code, want \"$expected\" in:"
  echo "$out" | sed 's/^/    /'
fi
sleep 3
if [[ ! -e $tmp/fake/pr-reviewer.outlived ]]; then
  pass "the time limit also stops the child processes of codex"
else
  fail "a child process of codex outlived the time limit"
fi
rm "$tmp/fake/pr-reviewer.sleep"

mkdir -p "$tmp/home"
rm -f "$tmp/fake/"*.args
out=$(HOME="$tmp/home" run_with_fake "$tmp/home/out") && code=0 || code=$?
expected='pr-reviewer: Codex review did not run: the out-dir is inside $HOME
security-reviewer: Codex review did not run: the out-dir is inside $HOME
blast-radius: Codex review did not run: the out-dir is inside $HOME'
if [[ $code == 0 && $out == "$expected" ]] && ! ls "$tmp/fake/"*.args >/dev/null 2>&1; then
  pass "with the out-dir inside \$HOME, where Codex cannot read its clone, codex does not start"
else
  fail "out-dir inside \$HOME: exit $code, got:"
  echo "$out" | sed 's/^/    /'
fi

# The skills run the script with the sandbox off, so a relative path could run a script of the checkout under review.
for skill in ../../review-pr ../../fire; do
  skill_dir=$(cd "$skill" && pwd -P)
  commands=$(grep -o '`[^`]*codex-review\.sh[^`]*`' "$skill_dir/SKILL.md") || true
  paths=$(printf '%s\n' "$commands" | sed -n 's/^`\(CODEX_REVIEW=[^"]* \)\{0,1\}"\${CLAUDE_SKILL_DIR}\([^"]*\/codex-review\.sh\)".*/\2/p')
  resolved=$(while read -r path; do [[ -n $path && -f $skill_dir$path ]] && echo "$path"; done <<< "$paths") || true
  if [[ -n $commands && $(grep -c . <<< "$commands") == $(grep -c . <<< "$resolved") ]]; then
    pass "$(basename "$skill_dir") runs the script by its path from \${CLAUDE_SKILL_DIR}"
  else
    fail "$(basename "$skill_dir") runs the script by a path that does not start at \${CLAUDE_SKILL_DIR}:"
    printf '%s\n' "$commands" | sed 's/^/    /'
  fi
done

exit "$failed"
