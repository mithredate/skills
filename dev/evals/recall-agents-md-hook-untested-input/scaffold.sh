#!/usr/bin/env bash
# The base holds the tree of 4972fe6 without dev/evals/. The head holds the tree
# of da9c72a of PR #148 without dev/evals/ and without the test that da9c72a
# added for empty and malformed input. The hook handles that input correctly.
exec bash "$(dirname "$0")/../scaffold.sh" "$(dirname "$0")" 2ae5794 454e19d
