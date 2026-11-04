#!/usr/bin/env bash
# Writes the workspace of one blast-radius case. repo/ is a git repo of
# blast-radius-repo/. Its branch `base` holds the base commit, and its HEAD
# holds the head commit, which applies the head.patch of the case. pr.diff is
# the diff from the base commit to the head commit. brief.md is the brief of
# the case. The repo keeps .git, so the agent can read and run the base commit.
# The scaffold.sh of each case calls it as: blast-radius-scaffold.sh <case dir>
set -euo pipefail

case_dir=$(cd "$1" && pwd)
commit() {
  git -C repo -c user.name=case -c user.email=case@example.invalid -c commit.gpgsign=false \
    commit -q -m "$1"
}

cp -R "$(dirname "$0")/blast-radius-repo" repo
git -C repo init -q -b base
git -C repo add -A
commit "chore: start the booking service"
git -C repo switch -q -c pr
git -C repo apply "$case_dir/head.patch"
git -C repo add -A
commit "$(sed -n 's/^PR title: //p' "$case_dir/brief.md")"
git -C repo diff base HEAD > pr.diff
cp "$case_dir/brief.md" brief.md
