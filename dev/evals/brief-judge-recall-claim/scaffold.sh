#!/usr/bin/env bash
case_dir=$(dirname "$0")
exec bash "$case_dir/../brief-judge-scaffold.sh" "$case_dir/brief.md" "$case_dir/records.md"
