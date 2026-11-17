#!/usr/bin/env bash
# Writes the workspace of one brief-judge case: brief.md, records.md, and repo/,
# a copy of brief-judge-repo/. Two cases can judge one brief with other records.
# The scaffold.sh of each case calls it as:
#   brief-judge-scaffold.sh <brief file> <records file>
set -euo pipefail

cp -R "$(dirname "$0")/brief-judge-repo" repo
cp "$1" brief.md
cp "$2" records.md
