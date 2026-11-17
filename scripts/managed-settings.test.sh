#!/usr/bin/env bash
# Test the SessionStart hook of managed-settings.json. Each case runs the hook
# command with sh in an empty folder, with the two Homebrew bundle paths swapped
# for paths in a temp folder that the test deletes.
set -euo pipefail

cd "$(dirname "$0")/.."

tmp=$(mktemp -d "${TMPDIR:-/tmp}/managed-settings-test.XXXXXX")
trap 'rm -rf "$tmp"' EXIT
hook=$(jq -r '.hooks.SessionStart[0].hooks[0].command // ""' managed-settings.json)

failed=0
run() { # case folder, bundle for /opt/homebrew, bundle for /usr/local, env assignments
  local dir=$1 opt=/opt/homebrew/etc/ca-certificates/cert.pem usr=/usr/local/etc/ca-certificates/cert.pem cmd
  # bash 3.2 matches a quoted literal pattern only through a variable.
  cmd=${hook//"$opt"/$2}
  cmd=${cmd//"$usr"/$3}
  shift 3
  mkdir -p "$dir/cwd"
  (cd "$dir/cwd" && env -u SSL_CERT_FILE -u CLAUDE_ENV_FILE "$@" sh -c "$cmd") \
    >"$dir/stdout" 2>"$dir/stderr" || echo "exit $?" >>"$dir/stderr"
}
check() { # name, case folder, wanted env file text, wanted stdout pattern
  local env_text stdout
  env_text=$(cat "$2/env" 2>/dev/null || echo "<no env file>")
  stdout=$(cat "$2/stdout")
  if [[ $env_text == "$3" && $stdout == $4 && ! -s $2/stderr && -z $(ls -A "$2/cwd") ]]; then
    echo "  ✓ $1"
  else
    echo "  ✘ $1: want env file \"$3\" and stdout $4"
    echo "    env file: $env_text"
    echo "    stdout: $stdout"
    echo "    stderr: $(cat "$2/stderr")"
    echo "    files in the working folder: $(ls -A "$2/cwd")"
    failed=1
  fi
}

d=$tmp/both
mkdir -p "$d" && touch "$d/opt.pem" "$d/usr.pem" "$d/env"
run "$d" "$d/opt.pem" "$d/usr.pem" CLAUDE_ENV_FILE="$d/env"
check "with both bundles, the env file exports the /opt/homebrew bundle" "$d" \
  "export SSL_CERT_FILE=$d/opt.pem" ""

d=$tmp/usr-only
mkdir -p "$d" && touch "$d/usr.pem" "$d/env"
run "$d" "$d/opt.pem" "$d/usr.pem" CLAUDE_ENV_FILE="$d/env"
check "with only the /usr/local bundle, the env file exports it" "$d" \
  "export SSL_CERT_FILE=$d/usr.pem" ""

d=$tmp/already-set
mkdir -p "$d" && touch "$d/opt.pem" "$d/env"
run "$d" "$d/opt.pem" "$d/usr.pem" CLAUDE_ENV_FILE="$d/env" SSL_CERT_FILE=/etc/ssl/cert.pem
check "a set SSL_CERT_FILE leaves the env file empty" "$d" "" ""

d=$tmp/no-bundle
mkdir -p "$d" && touch "$d/env"
run "$d" "$d/opt.pem" "$d/usr.pem" CLAUDE_ENV_FILE="$d/env"
check "with no bundle, the env file stays empty and stdout names the fix" "$d" "" \
  "gh fails TLS in the sandbox on this Mac*brew install ca-certificates*"

d=$tmp/env-file-unset
mkdir -p "$d" && touch "$d/opt.pem"
run "$d" "$d/opt.pem" "$d/usr.pem"
check "an unset CLAUDE_ENV_FILE writes no file and exits 0" "$d" "<no env file>" ""

d=$tmp/env-file-empty
mkdir -p "$d" && touch "$d/opt.pem"
run "$d" "$d/opt.pem" "$d/usr.pem" CLAUDE_ENV_FILE=
check "an empty CLAUDE_ENV_FILE writes no file and exits 0" "$d" "<no env file>" ""

if jq -e '.env | has("SSL_CERT_FILE") | not' managed-settings.json >/dev/null; then
  echo "  ✓ the env block has no SSL_CERT_FILE"
else
  echo "  ✘ the env block has no SSL_CERT_FILE: it has $(jq -r .env.SSL_CERT_FILE managed-settings.json)"
  failed=1
fi

exit "$failed"
