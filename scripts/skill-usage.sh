#!/usr/bin/env bash
# Print, for every skill on the current branch, the sessions that invoked it
# in the transcript window and the skills or agents that call it. Both numbers
# decide a deprecation, see CLAUDE.md "Deprecation". Uses /usr/bin/grep: the
# ugrep shim in a Claude Code shell skips long-line jsonl files.
set -euo pipefail
cd "$(dirname "$0")/.."

transcripts="${CLAUDE_PROJECTS_DIR:-$HOME/.claude/projects}"
hits=$(mktemp)
# One line per invocation: "<transcript file>\t<skill name without plugin prefix>"
/usr/bin/grep -raHoE '"skill": *"[a-zA-Z:_-]+"|<command-name>/?[a-zA-Z:_-]+</command-name>|Launching skill: [a-zA-Z:_-]+' \
  --include='*.jsonl' "$transcripts" 2>/dev/null \
  | sed -E 's/^(.*\.jsonl):(.*)$/\1\t\2/' \
  | awk -F'\t' '{ n=$2; gsub(/^"skill": *"|"$|<command-name>\/?|<\/command-name>|Launching skill: /, "", n); sub(/.*:/, "", n); print $1 "\t" n }' \
  > "$hits" || true

printf '%-40s %8s  %s\n' skill sessions callers
git ls-files '*/skills/*/SKILL.md' | while IFS= read -r skill_md; do
  name=$(basename "$(dirname "$skill_md")")
  plugin=${skill_md%%/*}
  sessions=$(awk -F'\t' -v n="$name" '$2 == n { print $1 }' "$hits" \
    | sed -E 's:/(subagents|tasks)/.*::' | sort -u | wc -l | tr -d ' ')
  callers=$(git grep -l -E "(^|[^a-zA-Z-])$name([^a-zA-Z-]|$)" -- '*/skills/*/SKILL.md' '*/skills/*/references/*.md' '*/agents/*.md' \
    | sed -E 's|.*/skills/([^/]+)/.*|\1|; s|.*/agents/([^/]+)\.md|agent:\1|' | /usr/bin/grep -vx "$name" | sort -u | tr '\n' ' ' || true)
  printf '%-40s %8s  %s\n' "$plugin:$name" "$sessions" "$callers"
done | sort -k2,2n
rm -f "$hits"
