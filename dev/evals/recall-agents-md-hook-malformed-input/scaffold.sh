#!/usr/bin/env bash
# The base and the head hold the trees of 4972fe6 and 2732eed without dev/evals/.
# 2732eed is a commit of PR #148. The next commit, da9c72a, fixed the hook for
# input that is not JSON.
exec bash "$(dirname "$0")/../scaffold.sh" "$(dirname "$0")" 2ae5794 cd610a5
