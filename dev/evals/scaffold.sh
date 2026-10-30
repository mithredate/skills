#!/usr/bin/env bash
# Writes the workspace of one pr-reviewer case: repo/ at the head commit,
# pr.diff from the base commit to the head commit, and the case's brief.md.
# The scaffold.sh of each case calls it as: scaffold.sh <case dir> <base> <head>
# repo.bundle holds the history of every case head, with one ref
# refs/heads/case/<sha> per head. It is offline, and a full copy of the repo per
# case does not fit the size limit of the suite.
#
# To add a case head, run these commands from the repo root. <sha> is the short
# SHA of the head. Start from the refs of the old bundle, because the head
# 033a775 exists only in the bundle. A bundle made from the local clone loses it.
#   tmp=$(mktemp -d "${TMPDIR:-/tmp}/bundle.XXXXXX")
#   git clone -q --bare dev/evals/repo.bundle "$tmp"
#   git push -q "$tmp" <sha>:refs/heads/case/<sha>
#   git -C "$tmp" bundle create "$PWD/dev/evals/repo.bundle" --all
# To make the bundle again without a case head, run the same commands. Replace
# the push with: git -C "$tmp" update-ref -d refs/heads/case/<sha>
set -euo pipefail

case_dir=$1 base=$2 head=$3

git clone -q --no-checkout "$(dirname "$0")/repo.bundle" repo
git -C repo checkout -q --detach "$head"
git -C repo diff "$base" "$head" > pr.diff
# A head after this suite holds the PASS condition of each case in dev/evals/.
# The reviewer can read repo/, so the scaffold deletes repo/dev/evals.
rm -rf repo/.git repo/dev/evals
cp "$case_dir/brief.md" brief.md
