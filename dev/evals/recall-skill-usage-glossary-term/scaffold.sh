#!/usr/bin/env bash
# A commit pair made for this case, because no commit of the repo has a glossary.
# The base holds the tree of 1f531df with a new CONTEXT.md. The head changes
# scripts/skill-usage.sh. Both trees have no dev/evals/.
exec bash "$(dirname "$0")/../scaffold.sh" "$(dirname "$0")" b82bf38 f2c98bf
