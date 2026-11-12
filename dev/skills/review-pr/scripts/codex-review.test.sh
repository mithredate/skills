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

mkdir "$tmp/bin" "$tmp/fake"
cat > "$tmp/bin/codex" <<'EOF'
#!/usr/bin/env bash
# The role is the name of the --output-schema file. Write the arguments, one per
# line, to $FAKE/<role>.args. Write the HEAD and the files of the -C directory to
# $FAKE/<role>.head and $FAKE/<role>.files. Unless the profile extends :read-only,
# write a file there, as a proof of blast-radius does. Copy $FAKE/<role>.out to the -o file.
# Sleep $FAKE/<role>.sleep seconds, if set. Exit with $FAKE/<role>.status, or 0.
args=("$@") dir= out= schema=
while (( $# )); do
  case $1 in -C) dir=$2 ;; -o) out=$2 ;; --output-schema) schema=$2 ;; esac
  shift
done
role=$(basename "$schema" .schema.json)
printf '%s\n' "${args[@]}" > "$FAKE/$role.args"
git -C "$dir" rev-parse HEAD > "$FAKE/$role.head"
ls -A "$dir" > "$FAKE/$role.files"
[[ " ${args[*]} " == *' permissions.review.extends=":read-only" '* ]] || echo proof > "$dir/codex-wrote-this.txt"
cp "$FAKE/$role.out" "$out"
[[ -f $FAKE/$role.sleep ]] && sleep "$(cat "$FAKE/$role.sleep")"
exit "$(cat "$FAKE/$role.status" 2>/dev/null || echo 0)"
EOF
chmod +x "$tmp/bin/codex"
review_json='{"blocking": [], "discrepancy": [], "quality_note": ["a.txt:1 one sentence"], "nit": [], "pre_existing": []}'
blast_json='{"what_it_does": "adds a.txt", "safety_fact": {"fact": "no code reads a.txt", "step": "4", "proof": "grep -r a.txt printed nothing"},
 "blocking": [], "discrepancy": [], "quality_note": [], "cleared": ["grep a.txt: no reader"], "before_merge": "none"}'

mkdir "$tmp/claude"
echo '{"permissions": {"deny": ["Read(~/.secret/**)", "Edit(~/.secret/**)", "Read(//etc/secret.conf)", "Bash(rm:*)"]}}' \
  > "$tmp/claude/settings.json"
# The managed settings of the machine can add more denials, so the test looks
# for these two inside the filesystem table.
home_denial='"'"$HOME"'/.secret" = "none"'
root_denial='"/etc/secret.conf" = "none"'

failed=0
pass() { echo "  ✓ $1"; }
fail() { echo "  ✘ $1"; failed=1; }

run_with_fake() {
  FAKE="$tmp/fake" CLAUDE_CONFIG_DIR="$tmp/claude" PATH="$tmp/bin:$PATH" ./codex-review.sh "$tmp/out" "$tmp/repo" "$head" "$base" "$tmp/pr.diff" "$tmp/context.md"
}

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

for role in pr-reviewer security-reviewer; do echo "$review_json" > "$tmp/fake/$role.out"; done
echo "$blast_json" > "$tmp/fake/blast-radius.out"
out=$(run_with_fake) && code=0 || code=$?
for role in pr-reviewer security-reviewer; do
  args=$(tr '\n' ' ' 2>/dev/null < "$tmp/fake/$role.args") || true
  schema=$(grep -A1 -x -- --output-schema "$tmp/fake/$role.args" 2>/dev/null | tail -1) || true
  if [[ $args == *'-c default_permissions="review" -c permissions.review.extends=":read-only" '* \
    && $args == *"-c permissions.review.filesystem={"*"$home_denial"*"} "* && $args == *"$root_denial"* && $args != *" -s "* \
    && $(jq -r .type "$schema" 2>/dev/null) == object ]]; then
    pass "$role runs with a :read-only profile that denies the Claude read denials, --output-schema, and no -s"
  else
    fail "$role arguments: $args"
  fi
  expected="$role: $tmp/out/$role.json"
  if [[ $code == 0 && $out == *"$expected"* ]] && jq -e --argjson want "$review_json" '. == $want' "$tmp/out/$role.json" >/dev/null; then
    pass "$role prints the path of its JSON result"
  else
    fail "$role result: exit $code, want \"$expected\" in:"
    echo "$out" | sed 's/^/    /'
  fi
done

blast_dir=$(grep -A1 -x -- -C "$tmp/fake/blast-radius.args" 2>/dev/null | tail -1) || true
blast_args=$(tr '\n' ' ' 2>/dev/null < "$tmp/fake/blast-radius.args") || true
if [[ -n $blast_dir && $blast_dir != "$tmp/repo" && $blast_args == *'-c permissions.review.extends=":workspace" '* \
  && $blast_args == *"-c permissions.review.filesystem={"*"$home_denial"*"} "* && $blast_args == *"$root_denial"* && $blast_args != *" -s "* \
  && $(cat "$tmp/fake/blast-radius.head") == "$head" && -z $(git -C "$tmp/repo" status --porcelain) ]]; then
  pass "blast-radius writes in a worktree at the head with a :workspace profile, and the checkout stays clean"
else
  fail "blast-radius ran in \"$blast_dir\" with: $blast_args"
  git -C "$tmp/repo" status --porcelain | sed 's/^/    /'
fi
if [[ $out == *"blast-radius: $tmp/out/blast-radius.json"* && ! -e $blast_dir && $(git -C "$tmp/repo" worktree list | wc -l) -eq 1 ]]; then
  pass "blast-radius prints its result, and the run deletes its worktree"
else
  fail "blast-radius result or worktree: $(git -C "$tmp/repo" worktree list)"
  echo "$out" | sed 's/^/    /'
fi

git -C "$tmp/repo" worktree add -q --detach "$blast_dir" "$base"
echo stale > "$blast_dir/stale.txt"
echo two > "$tmp/repo/b.txt"
git -C "$tmp/repo" add b.txt
git -C "$tmp/repo" -c user.name=t -c user.email=t@t commit -q -m second
head=$(git -C "$tmp/repo" rev-parse HEAD)
run_with_fake >/dev/null
if [[ $(cat "$tmp/fake/blast-radius.head") == "$head" ]] && ! grep -qx stale.txt "$tmp/fake/blast-radius.files"; then
  pass "a worktree from an earlier round is replaced by a clean one at the current head"
else
  fail "blast-radius saw $(cat "$tmp/fake/blast-radius.head") and files: $(tr '\n' ' ' < "$tmp/fake/blast-radius.files")"
fi

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
rm "$tmp/fake/pr-reviewer.sleep"

cp "$tmp/claude/settings.json" "$tmp/claude/settings.good"
echo '{"permissions": ' > "$tmp/claude/settings.json"
rm -f "$tmp/fake/"*.args
out=$(run_with_fake) && code=0 || code=$?
expected="pr-reviewer: Codex review did not run: cannot read the read denials of the Claude settings
security-reviewer: Codex review did not run: cannot read the read denials of the Claude settings
blast-radius: Codex review did not run: cannot read the read denials of the Claude settings"
if [[ $code == 0 && $out == "$expected" ]] && ! ls "$tmp/fake/"*.args >/dev/null 2>&1; then
  pass "when the Claude settings cannot be read, codex does not start and each role reports why"
else
  fail "unreadable settings: exit $code, want:"
  echo "$expected" | sed 's/^/    /'
  echo "  got:"
  echo "$out" | sed 's/^/    /'
fi
mv "$tmp/claude/settings.good" "$tmp/claude/settings.json"

exit "$failed"
