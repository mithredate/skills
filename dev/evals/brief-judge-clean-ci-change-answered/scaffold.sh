#!/usr/bin/env bash
# This case judges the brief of brief-judge-recall-ci-change. Only records.md differs.
case_dir=$(dirname "$0")
exec bash "$case_dir/../brief-judge-scaffold.sh" "$case_dir/../brief-judge-recall-ci-change/brief.md" "$case_dir/records.md"
