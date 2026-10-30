#!/usr/bin/env bash
# Writes the workspace of one pr-reviewer case: repo/ at the head commit,
# pr.diff from the base commit to the head commit, and the case's brief.md.
# The scaffold.sh of each case calls it as: scaffold.sh <case dir> <base> <head>
# repo.bundle holds the history of every case head. It is offline, and a full
# copy of the repo per case does not fit the size limit of the suite.
set -euo pipefail

case_dir=$1 base=$2 head=$3

git clone -q --no-checkout "$(dirname "$0")/repo.bundle" repo
git -C repo checkout -q --detach "$head"
git -C repo diff "$base" "$head" > pr.diff
rm -rf repo/.git
cp "$case_dir/brief.md" brief.md
