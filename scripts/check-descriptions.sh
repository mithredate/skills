#!/usr/bin/env bash
# Fail a skill whose description is not one sentence that starts with "Use ",
# under 150 characters. The description says when the agent loads the skill,
# not what the skill does. A skill with `disable-model-invocation: true` is
# exempt, because the model does not see its description. The check reads the
# format only. The section "Frontmatter" of
# productivity/skills/write-a-skill/SKILL.md holds the rules.
# Usage: scripts/check-descriptions.sh <SKILL.md>...
set -euo pipefail

failed=0
for file in "$@"; do
  frontmatter=$(awk 'NR == 1 && $0 == "---" { inside = 1; next } inside && $0 == "---" { exit } inside' "$file")
  if grep -Eq '^disable-model-invocation: *true *$' <<<"$frontmatter"; then continue; fi
  description=$(sed -n 's/^description: *//p' <<<"$frontmatter")
  # YAML allows double quotes around the value.
  description=${description#\"}
  description=${description%\"}
  if [[ $description != "Use "* ]]; then
    problem='does not start with "Use "'
  elif [[ $description =~ \.\ +[[:upper:]] ]]; then
    problem='has more than one sentence'
  elif (( ${#description} >= 150 )); then
    problem="has ${#description} characters"
  else
    continue
  fi
  echo "✘ $file: the description $problem."
  echo "    description: $description"
  failed=1
done

if [[ $failed -ne 0 ]]; then
  echo "  Write when to load the skill, not what it does: one sentence that starts with \"Use \", under 150 characters."
fi
exit "$failed"
