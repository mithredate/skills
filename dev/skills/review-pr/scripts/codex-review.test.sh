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
# $FAKE/<role>.head and $FAKE/<role>.files. Unless -s is read-only, write a file
# there, as a proof of blast-radius does. Copy
# $FAKE/<role>.out to the -o file. Exit with $FAKE/<role>.status, or 0.
args=("$@") dir= out= schema= sandbox=
while (( $# )); do
  case $1 in -C) dir=$2 ;; -o) out=$2 ;; --output-schema) schema=$2 ;; -s) sandbox=$2 ;; esac
  shift
done
role=$(basename "$schema" .schema.json)
printf '%s\n' "${args[@]}" > "$FAKE/$role.args"
git -C "$dir" rev-parse HEAD > "$FAKE/$role.head"
ls -A "$dir" > "$FAKE/$role.files"
[[ $sandbox == read-only ]] || echo proof > "$dir/codex-wrote-this.txt"
cp "$FAKE/$role.out" "$out"
exit "$(cat "$FAKE/$role.status" 2>/dev/null || echo 0)"
EOF
chmod +x "$tmp/bin/codex"
review_json='{"blocking": [], "discrepancy": [], "quality_note": ["a.txt:1 one sentence"], "nit": [], "pre_existing": []}'
blast_json='{"what_it_does": "adds a.txt", "safety_fact": {"fact": "no code reads a.txt", "step": "4", "proof": "grep -r a.txt printed nothing"},
 "blocking": [], "discrepancy": [], "quality_note": [], "cleared": ["grep a.txt: no reader"], "before_merge": "none"}'

failed=0
pass() { echo "  ✓ $1"; }
fail() { echo "  ✘ $1"; failed=1; }

run_with_fake() {
  FAKE="$tmp/fake" PATH="$tmp/bin:$PATH" ./codex-review.sh "$tmp/out" "$tmp/repo" "$head" "$base" "$tmp/pr.diff" "$tmp/context.md"
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
  if [[ $args == *"-s read-only "* && $(jq -r .type "$schema" 2>/dev/null) == object ]]; then
    pass "$role runs with -s read-only and --output-schema"
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

exit "$failed"
